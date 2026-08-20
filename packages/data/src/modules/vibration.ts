/**
 * Vibration analysis selectors.
 *
 * Everything here is derived deterministically from the generated fleet, so the
 * API, the web app and tests agree on every number. The physical model is
 * deliberately simple but self-consistent: a per-engine "signature profile"
 * (harmonic content, non-synchronous energy, phase stability) is drawn once
 * from the engine's own seed, and the tracked orders, the synthesised spectrum,
 * the balance history and the interpretation are all generated from it.
 */

import type {
  BalanceShot,
  EngineVibrationProfile,
  Engine,
  ModuleCode,
  Point,
  RotorBalance,
  Series,
  ShaftId,
  ShaftVibration,
  SpectrumBin,
  SpectrumPeak,
  StatusLevel,
  Trend,
  VibrationDiagnosis,
  VibrationFleetSummary,
  VibrationSignatureKind,
  VibrationSpectrum,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import type { Dataset } from "../generate";
import { getDataset } from "../index";
import { clamp, createRng, daysAgo, iso, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Shaft catalogue                                                     */
/* ------------------------------------------------------------------ */

export interface ShaftSpec {
  shaft: ShaftId;
  parameter: "vibN1" | "vibN2" | "vibN3";
  label: string;
  description: string;
  /** Nominal cruise speed of the spool, rev/min. */
  nominalRpm: number;
  /** Rotor stage count used for blade-pass frequency. */
  bladeCount: number;
  module: ModuleCode;
}

export const VIBRATION_SHAFTS: ShaftSpec[] = [
  {
    shaft: "N1",
    parameter: "vibN1",
    label: "LP rotor / fan",
    description: "Fan and LP turbine on the low pressure shaft — the assembly trim balancing acts on.",
    nominalRpm: 2680,
    bladeCount: 22,
    module: "FAN",
  },
  {
    shaft: "N2",
    parameter: "vibN2",
    label: "IP rotor",
    description: "Intermediate spool coupling the IP compressor to the IP turbine.",
    nominalRpm: 8120,
    bladeCount: 26,
    module: "IPC",
  },
  {
    shaft: "N3",
    parameter: "vibN3",
    label: "HP rotor",
    description: "High pressure spool; bearing chamber distress shows here first.",
    nominalRpm: 12300,
    bladeCount: 32,
    module: "HPC",
  },
];

/** Advisory limit is the amber threshold; the alert limit is the red threshold. */
function limitsFor(spec: ShaftSpec) {
  const def = PARAMETERS[spec.parameter];
  return { amber: def.amber.min, red: def.red.min, unit: def.unit, ata: def.ataChapter };
}

function statusFor(value: number, amber: number, red: number): StatusLevel {
  if (value >= red) return "red";
  if (value >= amber) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* Signature profile — one deterministic draw per engine               */
/* ------------------------------------------------------------------ */

export interface SignatureProfile {
  /** 2x/1x amplitude ratio on the worst shaft; high values imply a rub. */
  harmonicRatio: number;
  /** Share of spectral energy that is not a shaft order, 0-1. */
  nonSynchronousShare: number;
  /** Phase scatter across recent balance shots, degrees. */
  phaseScatterDeg: number;
  /** Current imbalance phase angle, degrees. */
  phaseDeg: number;
  /** Bearing defect order (outer race pass frequency) on the HP shaft. */
  bearingOrder: number;
  /** Speed jitter applied to the catalogue shaft speeds. */
  rpmScale: number;
}

/**
 * Spectral character follows the underlying mechanism: an imbalance is
 * synchronous and phase-stable, a rub throws harmonics and wanders in phase,
 * and a bearing defect puts energy on a non-integer order.
 */
function signatureProfile(engine: Engine): SignatureProfile {
  const rng = createRng(`${engine.id}:vibration-signature`);
  const { cause } = vibrationSeverity(engine);
  const wear = clamp((100 - engine.healthScore) / 100, 0, 1);

  const shape =
    cause === "bearing-distress"
      ? {
          harmonicRatio: rand.float(rng, 0.12, 0.3, 3),
          nonSynchronousShare: rand.float(rng, 0.36, 0.62, 3),
          phaseScatterDeg: rand.float(rng, 12, 34, 1),
        }
      : cause === "rotor-rub"
        ? {
            harmonicRatio: rand.float(rng, 0.46, 0.82, 3),
            nonSynchronousShare: rand.float(rng, 0.1, 0.26, 3),
            phaseScatterDeg: rand.float(rng, 24, 58, 1),
          }
        : {
            harmonicRatio: rand.float(rng, 0.07, 0.24, 3),
            nonSynchronousShare: rand.float(rng, 0.03, 0.14, 3),
            phaseScatterDeg: rand.float(rng, 3, 15, 1),
          };

  return {
    harmonicRatio: round(clamp(shape.harmonicRatio + wear * 0.06, 0.05, 0.95), 3),
    nonSynchronousShare: round(clamp(shape.nonSynchronousShare + wear * 0.04, 0.02, 0.72), 3),
    phaseScatterDeg: round(clamp(shape.phaseScatterDeg + wear * 4, 2, 74), 1),
    phaseDeg: round(rand.float(rng, 0, 359), 0),
    bearingOrder: round(rand.float(rng, 7.6, 9.4), 2),
    rpmScale: round(rand.float(rng, 0.94, 1.05), 3),
  };
}

/* ------------------------------------------------------------------ */
/* Tracked orders                                                      */
/* ------------------------------------------------------------------ */

function trendOf(series: Series): { trend: Trend; slopePer100Cycles: number } {
  const points = series.points;
  const window = Math.min(8, Math.floor(points.length / 2));
  const recent = points.slice(-window);
  const prior = points.slice(-window * 2, -window);
  const mean = (xs: typeof points) => xs.reduce((s, p) => s + p.v, 0) / Math.max(1, xs.length);
  const delta = mean(recent) - mean(prior);
  // Points are three days apart; a sector-a-day fleet gives ~3 cycles per point.
  const slopePer100Cycles = round((delta / Math.max(1, window * 3)) * 100, 3);
  return { trend: delta > 0.015 ? "up" : delta < -0.015 ? "down" : "flat", slopePer100Cycles };
}

/**
 * Where this engine sits on the vibration population: most of the fleet runs
 * quietly, a minority drifts into the advisory band and a small tail reaches
 * the alert limit. The draw is weighted by engine health and environment so the
 * noisy engines are the ones the rest of the console also flags.
 */
type ExceedanceBand = "nominal" | "advisory" | "alert";

interface VibrationSeverity {
  band: ExceedanceBand;
  /** The mechanism the synthesised signature is built around. */
  cause: VibrationSignatureKind;
  /** Worst shaft, and its latest level as a multiple of that shaft's advisory limit. */
  worstShaft: ShaftId;
  worstRatio: number;
  /** How much of the level has grown in over the 180-day window, 0-1. */
  growth: number;
}

const severityCache = new Map<string, VibrationSeverity>();

function vibrationSeverity(engine: Engine): VibrationSeverity {
  const cached = severityCache.get(engine.id);
  if (cached) return cached;

  const rng = createRng(`${engine.id}:vibration-severity`);
  const stress = clamp((100 - engine.healthScore) / 45 + engine.environmentSeverity * 0.06, 0, 1.6);
  const band = rand.weighted<ExceedanceBand>(rng, [
    { value: "nominal", weight: Math.max(46, 90 - stress * 30) },
    { value: "advisory", weight: 5 + stress * 11 },
    { value: "alert", weight: 1.2 + stress * 6 },
  ]);
  // Imbalance is by far the most common finding; damage mechanisms are the tail.
  const cause: VibrationSignatureKind =
    band === "nominal"
      ? "nominal"
      : rand.weighted<VibrationSignatureKind>(rng, [
          { value: "fan-imbalance", weight: 44 },
          { value: "rotor-imbalance", weight: 17 },
          { value: "bearing-distress", weight: 20 },
          { value: "rotor-rub", weight: 19 },
        ]);
  // The LP shaft carries the fan; core mechanisms show on the IP/HP spools.
  const worstShaft: ShaftId =
    cause === "fan-imbalance"
      ? "N1"
      : cause === "bearing-distress"
        ? rand.weighted<ShaftId>(rng, [
            { value: "N3", weight: 62 },
            { value: "N2", weight: 38 },
          ])
        : cause === "nominal"
          ? rand.weighted<ShaftId>(rng, [
              { value: "N1", weight: 54 },
              { value: "N2", weight: 20 },
              { value: "N3", weight: 26 },
            ])
          : rand.weighted<ShaftId>(rng, [
              { value: "N2", weight: 45 },
              { value: "N3", weight: 55 },
            ]);
  const worstRatio =
    band === "nominal"
      ? rand.float(rng, 0.26, 0.93, 3)
      : band === "advisory"
        ? rand.float(rng, 1.02, 1.55, 3)
        : rand.float(rng, 1.68, 2.35, 3);
  const severity: VibrationSeverity = {
    band,
    cause,
    worstShaft,
    worstRatio,
    growth: rand.float(rng, band === "nominal" ? 0.04 : 0.18, band === "alert" ? 0.62 : 0.42, 3),
  };
  severityCache.set(engine.id, severity);
  return severity;
}

/**
 * Tracked-order history for one shaft: a slowly growing 1x level with sector to
 * sector scatter, anchored on the engine's severity draw rather than on the
 * generic parameter drift, so limits are actually exercised across the fleet.
 */
function trackedOrderSeries(engine: Engine, spec: ShaftSpec): Series {
  const { amber, red, unit } = limitsFor(spec);
  const severity = vibrationSeverity(engine);
  const rng = createRng(`${engine.id}:${spec.parameter}:tracked-order`);
  const shaftFactor = spec.shaft === severity.worstShaft ? 1 : rand.float(rng, 0.34, 0.74, 3);
  const target = clamp(amber * severity.worstRatio * shaftFactor, 0.12, red * 1.45);
  const start = target * (1 - severity.growth * (spec.shaft === severity.worstShaft ? 1 : 0.6));
  const curve = 1 + severity.growth * 2.4;

  const points: Point[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    const trendValue = start + (target - start) * Math.pow(progress, curve);
    const noise = rand.gaussian(rng, 0, Math.max(0.012, target * 0.035));
    points.push({ t: iso(daysAgo(180 - progress * 180)), v: round(Math.max(0.05, trendValue + noise), 2) });
  }
  // Land the last sample exactly on the target so limits read consistently.
  points[points.length - 1] = { t: iso(daysAgo(0)), v: round(target, 2) };

  return {
    id: `${engine.id}:${spec.parameter}`,
    label: `1x ${spec.shaft} — ${spec.label}`,
    unit,
    points,
    amberThreshold: amber,
    redThreshold: red,
  };
}

function shaftVibration(engine: Engine, spec: ShaftSpec, avgBlockHours: number): ShaftVibration {
  const series = trackedOrderSeries(engine, spec);
  const { amber, red, unit } = limitsFor(spec);
  const values = series.points.map((p) => p.v);
  const latest = values[values.length - 1] ?? 0;
  const peak = round(Math.max(...values), 2);
  const baseline = round(values.slice(0, 4).reduce((s, v) => s + v, 0) / 4, 2);
  const exceedingPoints = values.filter((v) => v >= amber).length;
  // Each trend point covers three days; sectors accrue at the fleet mean rate.
  const sectorsAtExceedance = Math.round(exceedingPoints * 3 * 1.4);
  const profile = signatureProfile(engine);

  return {
    shaft: spec.shaft,
    parameter: spec.parameter,
    label: spec.label,
    unit,
    latest,
    peak,
    baseline,
    deltaPct: round(((latest - baseline) / Math.max(0.01, baseline)) * 100, 1),
    amberLimit: amber,
    redLimit: red,
    status: statusFor(latest, amber, red),
    ...trendOf(series),
    hoursAtExceedance: round(sectorsAtExceedance * avgBlockHours, 1),
    sectorsAtExceedance,
    rpm: Math.round(spec.nominalRpm * profile.rpmScale),
    orderHz: round((spec.nominalRpm * profile.rpmScale) / 60, 1),
    series,
  };
}

/* ------------------------------------------------------------------ */
/* Spectrum synthesis                                                  */
/* ------------------------------------------------------------------ */

function gaussianPeak(frequency: number, centre: number, amplitude: number, width: number): number {
  const d = (frequency - centre) / width;
  return amplitude * Math.exp(-0.5 * d * d);
}

/**
 * Synthesised narrow-band spectrum for one shaft, consistent with that engine's
 * tracked-order amplitudes and signature profile.
 */
export function vibrationSpectrum(engine: Engine, shaft: ShaftId = "N1"): VibrationSpectrum {
  const spec = VIBRATION_SHAFTS.find((s) => s.shaft === shaft) ?? VIBRATION_SHAFTS[0]!;
  const profile = signatureProfile(engine);
  const shafts = trackedOrders(engine);
  const tracked = shafts.find((s) => s.shaft === shaft)!;
  const rng = createRng(`${engine.id}:spectrum:${shaft}`);

  const f1 = tracked.orderHz;
  const bladePass = f1 * spec.bladeCount;
  const bearingHz = round(f1 * profile.bearingOrder, 1);
  const maxFrequencyHz = 500;
  const resolutionHz = 1.25;
  const noiseFloorIps = round(0.012 + profile.nonSynchronousShare * 0.05, 4);
  const { amber, red } = limitsFor(spec);

  const componentDefs = [
    { id: "1x", label: `1x ${shaft}`, order: 1, hz: f1, amp: tracked.latest, width: f1 * 0.035 + 0.6, synchronous: true },
    {
      id: "2x",
      label: `2x ${shaft}`,
      order: 2,
      hz: f1 * 2,
      amp: tracked.latest * profile.harmonicRatio,
      width: f1 * 0.045 + 0.7,
      synchronous: true,
    },
    {
      id: "3x",
      label: `3x ${shaft}`,
      order: 3,
      hz: f1 * 3,
      amp: tracked.latest * profile.harmonicRatio * 0.42,
      width: f1 * 0.05 + 0.8,
      synchronous: true,
    },
    {
      id: "sub",
      label: `0.48x ${shaft}`,
      order: 0.48,
      hz: f1 * 0.48,
      amp: tracked.latest * profile.nonSynchronousShare * 0.55,
      width: f1 * 0.06 + 0.9,
      synchronous: false,
    },
    {
      id: "bearing",
      label: `${profile.bearingOrder}x ${shaft}`,
      order: profile.bearingOrder,
      hz: bearingHz,
      amp: tracked.latest * profile.nonSynchronousShare * 0.78,
      width: 2.2,
      synchronous: false,
    },
    {
      id: "bpf",
      label: `Blade pass (${spec.bladeCount}x)`,
      order: spec.bladeCount,
      hz: bladePass,
      amp: tracked.latest * (0.16 + profile.harmonicRatio * 0.3),
      width: 3.4,
      synchronous: true,
    },
  ].filter((c) => c.hz <= maxFrequencyHz);

  const bins: SpectrumBin[] = [];
  for (let f = 0; f <= maxFrequencyHz; f += resolutionHz) {
    let amplitude = noiseFloorIps * (0.55 + rng() * 0.9);
    for (const component of componentDefs) amplitude += gaussianPeak(f, component.hz, component.amp, component.width);
    bins.push({ frequencyHz: round(f, 2), amplitudeIps: round(amplitude, 4) });
  }

  const meanings: Record<string, string> = {
    "1x": "Synchronous rotor imbalance — responds to trim balancing.",
    "2x": "Second harmonic — misalignment or a light rotor-to-casing rub.",
    "3x": "Higher harmonic content, consistent with a rub developing.",
    sub: "Sub-synchronous energy — oil whirl or looseness in the bearing chamber.",
    bearing: "Non-synchronous bearing defect order — outer race pass frequency.",
    bpf: "Blade pass frequency — aerodynamic; elevated with blade damage or erosion.",
  };

  const peaks: SpectrumPeak[] = componentDefs
    .map((component) => ({
      id: component.id,
      label: component.label,
      shaft,
      order: component.order,
      frequencyHz: round(component.hz, 1),
      amplitudeIps: round(component.amp, 3),
      status: statusFor(component.amp, amber * 0.6, red * 0.6),
      meaning: meanings[component.id] ?? "",
      synchronous: component.synchronous,
    }))
    .sort((a, b) => b.amplitudeIps - a.amplitudeIps);

  const totalEnergy = componentDefs.reduce((s, c) => s + c.amp, 0) + noiseFloorIps * 8;
  const synchronousEnergyShare = round(tracked.latest / Math.max(0.001, totalEnergy), 3);

  return {
    engineId: engine.id,
    shaft,
    condition: "Cruise, stabilised — last recorded sector",
    capturedAt: iso(daysAgo(1)),
    resolutionHz,
    maxFrequencyHz,
    noiseFloorIps,
    bins,
    peaks,
    synchronousEnergyShare,
  };
}

/* ------------------------------------------------------------------ */
/* Rotor balance                                                       */
/* ------------------------------------------------------------------ */

const TRIM_LIMIT_IPS = 2.2;

export function rotorBalance(engine: Engine): RotorBalance {
  const profile = signatureProfile(engine);
  const tracked = trackedOrders(engine).find((s) => s.shaft === "N1")!;
  const rng = createRng(`${engine.id}:balance`);
  const current = round(clamp(tracked.latest, 0.05, 6), 2);
  const shotCount = rand.int(rng, 3, 6);

  // Ages run oldest to newest so the table reads as a chronology that arrives
  // at today's level.
  const ages: number[] = [];
  let age = rand.int(rng, 12, 40);
  for (let i = 0; i < shotCount; i += 1) {
    ages.push(age);
    age += rand.int(rng, 28, 70);
  }
  ages.reverse();

  // Measured level at each run: a walk from the installation survey up to the
  // level the tracked order shows now.
  const startMagnitude = round(clamp(Math.min(tracked.baseline, current) * rand.float(rng, 0.7, 0.95), 0.08, 6), 2);
  const magnitudes = ages.map((_, i) => {
    const progress = shotCount === 1 ? 1 : i / (shotCount - 1);
    const value = startMagnitude + (current - startMagnitude) * Math.pow(progress, 1.25);
    return round(clamp(value + rand.gaussian(rng, 0, Math.max(0.02, current * 0.05)), 0.05, 6), 2);
  });

  const history: BalanceShot[] = magnitudes.map((magnitude, i) => {
    const survey = i === 0;
    const nextMagnitude = magnitudes[i + 1] ?? current;
    const outcome: BalanceShot["outcome"] = survey
      ? "survey"
      : nextMagnitude <= magnitude * 0.93
        ? "improved"
        : nextMagnitude >= magnitude * 1.08
          ? "worse"
          : "no-change";
    const phase = round(((profile.phaseDeg + rand.gaussian(rng, 0, profile.phaseScatterDeg / 2)) % 360 + 360) % 360, 0);
    const positionDeg = round((phase + 180) % 360, 0);
    const weightGrams = survey ? 0 : rand.int(rng, 8, 62);
    return {
      id: `${engine.id}-BS-${i + 1}`,
      at: iso(daysAgo(ages[i]!)),
      cyclesSinceOverhaul: Math.max(0, Math.round(engine.cyclesSinceOverhaul - ages[i]! * 2.4)),
      magnitudeIps: magnitude,
      phaseDeg: phase,
      weightGrams,
      positionDeg,
      outcome,
      note: survey
        ? "Baseline vibration survey after installation"
        : outcome === "improved"
          ? `${weightGrams} g fitted at ${positionDeg}° — 1x N1 fell to ${nextMagnitude} IPS at the next run`
          : outcome === "worse"
            ? "Trim shot did not hold; level climbed again on the following sectors"
            : "Trim shot made no material change to the 1x level",
    };
  });

  const phase = history[history.length - 1]?.phaseDeg ?? profile.phaseDeg;
  const trimmable = current <= TRIM_LIMIT_IPS && profile.phaseScatterDeg <= 22 && profile.nonSynchronousShare < 0.3;
  const predictedResidualIps = round(
    trimmable ? Math.max(0.18, current * (0.3 + profile.phaseScatterDeg / 140)) : Math.max(0.4, current * 0.82),
    2,
  );

  return {
    engineId: engine.id,
    shaft: "N1",
    magnitudeIps: current,
    phaseDeg: round((phase + 360) % 360, 0),
    predictedResidualIps,
    trimLimitIps: TRIM_LIMIT_IPS,
    phaseScatterDeg: profile.phaseScatterDeg,
    trimmable,
    recommendedWeightGrams: Math.round(clamp(current * 26, 4, 90)),
    // Trim weight goes opposite the heavy spot.
    recommendedPositionDeg: round((((phase + 180) % 360) + 360) % 360, 0),
    history: history.reverse(),
  };
}

/* ------------------------------------------------------------------ */
/* Interpretation                                                      */
/* ------------------------------------------------------------------ */

const SIGNATURE_LABELS: Record<VibrationSignatureKind, string> = {
  "fan-imbalance": "Fan blade imbalance",
  "rotor-imbalance": "Core rotor imbalance",
  "bearing-distress": "Bearing distress",
  "rotor-rub": "Rotor-to-casing rub",
  nominal: "Nominal signature",
};

function worstShaft(shafts: ShaftVibration[]): { shaft: ShaftVibration; ratio: number } {
  let best = shafts[0]!;
  let bestRatio = 0;
  for (const s of shafts) {
    const ratio = s.latest / s.amberLimit;
    if (ratio > bestRatio) {
      best = s;
      bestRatio = ratio;
    }
  }
  return { shaft: best, ratio: round(bestRatio, 2) };
}

export function vibrationDiagnosis(engine: Engine): VibrationDiagnosis {
  const profile = signatureProfile(engine);
  const shafts = trackedOrders(engine);
  const { shaft, ratio } = worstShaft(shafts);
  const balance = rotorBalance(engine);

  const scores: Record<VibrationSignatureKind, number> = {
    nominal: ratio < 0.75 ? 0.9 - ratio * 0.4 : 0.05,
    "fan-imbalance":
      shaft.shaft === "N1"
        ? clamp(0.35 + ratio * 0.32 - profile.phaseScatterDeg / 90 - profile.nonSynchronousShare * 0.9 - profile.harmonicRatio * 0.5, 0, 1)
        : 0.06,
    "rotor-imbalance":
      shaft.shaft === "N1"
        ? 0.08
        : clamp(0.32 + ratio * 0.3 - profile.phaseScatterDeg / 95 - profile.nonSynchronousShare * 0.85 - profile.harmonicRatio * 0.45, 0, 1),
    "bearing-distress": clamp(profile.nonSynchronousShare * 1.5 + ratio * 0.12 - 0.12, 0, 1),
    "rotor-rub": clamp(profile.harmonicRatio * 1.15 + profile.phaseScatterDeg / 150 + ratio * 0.1 - 0.28, 0, 1),
  };

  const ranked = (Object.keys(scores) as VibrationSignatureKind[])
    .map((kind) => ({ kind, score: scores[kind] }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]!;
  const second = ranked[1]!;
  const total = ranked.reduce((s, r) => s + r.score, 0) || 1;
  const confidence = round(clamp(top.score / total, 0.35, 0.97), 2);

  const status: StatusLevel =
    top.kind === "nominal" ? "green" : shaft.status === "red" ? "red" : top.kind === "bearing-distress" ? "red" : shaft.status;

  const module: ModuleCode =
    top.kind === "fan-imbalance"
      ? "FAN"
      : top.kind === "bearing-distress"
        ? "EXTERNALS"
        : top.kind === "rotor-rub"
          ? "HPC"
          : (VIBRATION_SHAFTS.find((s) => s.shaft === shaft.shaft)?.module ?? "FAN");

  const recommendedAction =
    top.kind === "nominal"
      ? "No action — continue routine EHM sampling"
      : top.kind === "fan-imbalance"
        ? balance.trimmable
          ? `On-wing fan trim balance: fit ${balance.recommendedWeightGrams} g at ${balance.recommendedPositionDeg}° at the next overnight`
          : balance.magnitudeIps > TRIM_LIMIT_IPS
            ? "Fan blade set inspection and moment-weight re-distribution — level is beyond the on-wing trim envelope"
            : "Fan blade set inspection — the imbalance vector is not stable enough for a trim weight to hold"
        : top.kind === "rotor-imbalance"
          ? "Core rotor survey at next base input; recover balance before further trim shots"
          : top.kind === "bearing-distress"
            ? "Pull oil sample for debris analysis and raise a borescope of the bearing chamber before the next departure"
            : "Borescope the HP compressor for rub witness marks; restrict to reduced-derate take-offs pending inspection";

  const actionWindowHours =
    top.kind === "nominal" ? null : top.kind === "bearing-distress" ? 12 : status === "red" ? 48 : status === "amber" ? 240 : 720;

  const evidence = [
    {
      label: `1x ${shaft.shaft} amplitude`,
      detail: `${shaft.latest} ${shaft.unit} against a ${shaft.amberLimit} ${shaft.unit} advisory limit (${Math.round(ratio * 100)}% of limit).`,
      weight: round(clamp(ratio * 0.5, 0.05, 0.95), 2),
      supports: ratio >= 0.75,
    },
    {
      label: "Phase stability",
      detail: `Imbalance vector scatter of ${profile.phaseScatterDeg}° across the last ${balance.history.length} runs; a stable vector points at imbalance rather than damage.`,
      weight: round(clamp(1 - profile.phaseScatterDeg / 80, 0.05, 0.95), 2),
      supports: profile.phaseScatterDeg <= 22,
    },
    {
      label: "Non-synchronous energy",
      detail: `${Math.round(profile.nonSynchronousShare * 100)}% of spectral energy sits off the shaft orders, typical of bearing or looseness sources.`,
      weight: round(profile.nonSynchronousShare, 2),
      supports: profile.nonSynchronousShare >= 0.3,
    },
    {
      label: "2x / 1x harmonic ratio",
      detail: `Second harmonic at ${Math.round(profile.harmonicRatio * 100)}% of the fundamental; sustained values above 40% accompany rubs.`,
      weight: round(profile.harmonicRatio, 2),
      supports: profile.harmonicRatio >= 0.4,
    },
    {
      label: "Trend rate",
      detail: `${shaft.slopePer100Cycles > 0 ? "+" : ""}${shaft.slopePer100Cycles} ${shaft.unit} per 100 cycles over the last 180 days.`,
      weight: round(clamp(Math.abs(shaft.slopePer100Cycles) * 4, 0.05, 0.9), 2),
      supports: shaft.slopePer100Cycles > 0.02,
    },
  ];

  const summary =
    top.kind === "nominal"
      ? `All three shafts are inside advisory limits with a stable ${profile.phaseScatterDeg}° imbalance vector. No vibration-driven action required.`
      : top.kind === "fan-imbalance"
        ? `Energy is concentrated at 1x N1 with a ${profile.phaseScatterDeg}° phase vector — the classic fan imbalance signature. ${
            balance.trimmable
              ? `A trim shot is predicted to recover the level to ${balance.predictedResidualIps} IPS.`
              : balance.magnitudeIps > TRIM_LIMIT_IPS
                ? `At ${balance.magnitudeIps} IPS the imbalance is beyond the ${TRIM_LIMIT_IPS} IPS on-wing trim envelope, so the fan blade set needs moment-weight re-distribution.`
                : "The vector is migrating between runs, so a trim weight would not hold."
          }`
        : top.kind === "rotor-imbalance"
          ? `1x ${shaft.shaft} dominates with limited harmonic content, consistent with a core rotor imbalance rather than fan-side damage.`
          : top.kind === "bearing-distress"
            ? `Non-synchronous energy at ${profile.bearingOrder}x ${shaft.shaft} dominates the spectrum — the signature of an outer race defect, not a balance condition.`
            : `Strong 2x and 3x content with a wandering phase points to a rotor-to-casing rub; trimming would mask, not fix, the condition.`;

  return {
    engineId: engine.id,
    kind: top.kind,
    label: SIGNATURE_LABELS[top.kind],
    confidence,
    status,
    likelyModule: module,
    ataChapter: "77-30",
    summary,
    evidence,
    recommendedAction,
    actionWindowHours,
    differential: {
      kind: second.kind,
      label: SIGNATURE_LABELS[second.kind],
      confidence: round(clamp(second.score / total, 0.02, 0.9), 2),
    },
    onWingRecoverable: top.kind === "fan-imbalance" ? balance.trimmable : top.kind === "nominal",
  };
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

let blockHoursByAircraft: Map<string, number> | null = null;

function averageBlockHours(data: Dataset, aircraftId: string | null): number {
  if (!blockHoursByAircraft) {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const flight of data.flights) {
      const entry = totals.get(flight.aircraftId) ?? { sum: 0, count: 0 };
      entry.sum += flight.blockHours;
      entry.count += 1;
      totals.set(flight.aircraftId, entry);
    }
    blockHoursByAircraft = new Map([...totals].map(([key, v]) => [key, round(v.sum / Math.max(1, v.count), 2)]));
  }
  if (!aircraftId) return 7;
  return blockHoursByAircraft.get(aircraftId) ?? 7;
}

const trackedOrderCache = new Map<string, ShaftVibration[]>();

/** The three tracked-order channels for an engine, memoised per process. */
export function trackedOrders(engine: Engine): ShaftVibration[] {
  const cached = trackedOrderCache.get(engine.id);
  if (cached) return cached;
  const data = getDataset();
  const blockHours = averageBlockHours(data, engine.aircraftId);
  const shafts = VIBRATION_SHAFTS.map((spec) => shaftVibration(engine, spec, blockHours));
  trackedOrderCache.set(engine.id, shafts);
  return shafts;
}

/** Broadband (unfiltered, 10-1000 Hz) overall level, derived from the tracked orders. */
export function broadbandSeries(engine: Engine): Series {
  const profile = signatureProfile(engine);
  const shafts = trackedOrders(engine);
  const [n1, n2, n3] = shafts as [ShaftVibration, ShaftVibration, ShaftVibration];
  const points = n1.series.points.map((point, index) => {
    const a = point.v;
    const b = n2.series.points[index]?.v ?? 0;
    const c = n3.series.points[index]?.v ?? 0;
    const rms = Math.sqrt(a * a + b * b + c * c) * (1 + profile.nonSynchronousShare * 0.35);
    return { t: point.t, v: round(rms, 2) };
  });
  return {
    id: `${engine.id}:vib-broadband`,
    label: "Broadband overall",
    unit: "IPS",
    points,
    amberThreshold: 2.6,
    redThreshold: 4,
  };
}

export function engineVibrationProfile(engine: Engine): EngineVibrationProfile {
  const data = getDataset();
  const shafts = trackedOrders(engine);
  const { shaft, ratio } = worstShaft(shafts);
  const broadband = broadbandSeries(engine);
  const broadbandIps = broadband.points[broadband.points.length - 1]?.v ?? 0;
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const diagnosis = vibrationDiagnosis(engine);
  const hoursAtExceedance = round(
    shafts.reduce((s, item) => s + item.hoursAtExceedance, 0),
    1,
  );
  const status = shafts.some((s) => s.status === "red") ? "red" : shafts.some((s) => s.status === "amber") ? "amber" : "green";

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorName: operator?.name ?? "Unassigned",
    operatorCode: operator?.code ?? "--",
    tail: aircraft?.tail ?? null,
    position: engine.position,
    location: engine.location,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    status,
    worstShaft: shaft.shaft,
    worstRatio: ratio,
    broadbandIps,
    broadbandStatus: statusFor(broadbandIps, 2.6, 4),
    broadbandSeries: broadband,
    shafts,
    hoursAtExceedance,
    severityScore: round(ratio * 60 + hoursAtExceedance * 0.05 + (diagnosis.onWingRecoverable ? 0 : 12), 1),
    diagnosis,
    balance: rotorBalance(engine),
  };
}

let fleetCache: EngineVibrationProfile[] | null = null;

/** Every monitored engine, ranked by vibration severity. */
export function fleetVibrationProfiles(): EngineVibrationProfile[] {
  if (fleetCache) return fleetCache;
  fleetCache = getDataset()
    .engines.map((engine) => engineVibrationProfile(engine))
    .sort((a, b) => b.severityScore - a.severityScore);
  return fleetCache;
}

/** Engines at or beyond the advisory limit on any shaft. */
export function vibrationExceedances(): EngineVibrationProfile[] {
  return fleetVibrationProfiles().filter((p) => p.status !== "green");
}

export function vibrationFleetSummary(): VibrationFleetSummary {
  const profiles = fleetVibrationProfiles();
  const red = profiles.filter((p) => p.status === "red");
  const amber = profiles.filter((p) => p.status === "amber");
  const exceeding = [...red, ...amber];
  return {
    enginesMonitored: profiles.length,
    redCount: red.length,
    amberCount: amber.length,
    greenCount: profiles.length - red.length - amber.length,
    trimmableCount: exceeding.filter((p) => p.diagnosis.onWingRecoverable).length,
    damageCount: exceeding.filter((p) => !p.diagnosis.onWingRecoverable).length,
    hoursAtExceedance: round(
      exceeding.reduce((s, p) => s + p.hoursAtExceedance, 0),
      0,
    ),
    worstEngineId: profiles[0]?.engineId ?? null,
  };
}

/** Signature mix across the engines currently in exceedance. */
export function signatureBreakdown(): { kind: VibrationSignatureKind; label: string; count: number; onWingRecoverable: boolean }[] {
  const counts = new Map<VibrationSignatureKind, number>();
  for (const profile of vibrationExceedances()) {
    counts.set(profile.diagnosis.kind, (counts.get(profile.diagnosis.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({
      kind,
      label: SIGNATURE_LABELS[kind],
      count,
      onWingRecoverable: kind === "fan-imbalance" || kind === "nominal",
    }))
    .sort((a, b) => b.count - a.count);
}

export function getVibrationProfile(engineId: string): EngineVibrationProfile | undefined {
  const engine = getDataset().engines.find((e) => e.id === engineId || e.esn === engineId);
  return engine ? engineVibrationProfile(engine) : undefined;
}

/** Vibration-sourced alerts, used to tie the page back to the alert queue. */
export function vibrationAlerts(engineId?: string) {
  return getDataset().alerts.filter(
    (alert) =>
      (alert.source === "vibration-analysis" || alert.parameter === "vibN1" || alert.parameter === "vibN2" || alert.parameter === "vibN3") &&
      alert.state !== "closed" &&
      alert.state !== "false-positive" &&
      (engineId ? alert.engineId === engineId : true),
  );
}

/** The signature factors behind a profile, exposed for tests and the API. */
export function vibrationSignatureProfile(engine: Engine): SignatureProfile {
  return signatureProfile(engine);
}
