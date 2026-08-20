/**
 * Oil & debris monitoring generators and selectors.
 *
 * Everything here is derived deterministically from the base fleet so the API,
 * the web app and tests observe the same oil condition for a given engine.
 *
 * Domain model, kept deliberately simple but physically plausible:
 *  - Oil consumption drifts slowly with deterioration, and a subset of engines
 *    show a *step change* — the classic bearing distress signature.
 *  - Debris indications (chip detector / SOAP) cluster after that step change,
 *    and load-path metal (M50 bearing steel) is what escalates the response.
 *  - Vibration and EGT margin are read from the shared parameter series so the
 *    correlation view lines up with the vibration and hot-section modules.
 */

import type {
  BearingChamber,
  DebrisEvent,
  DebrisDetectionSource,
  DebrisMaterial,
  Engine,
  OilCondition,
  OilCorrelationTimeline,
  OilFleetSummary,
  OilRecommendedAction,
  Point,
  Series,
  StatusLevel,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import { engineSeries } from "../generate";
import { getDataset } from "../index";
import { clamp, createRng, daysAgo, iso, NOW, rand, round, type Rng } from "../rng";

const OIL_WINDOW_DAYS = 180;
const OIL_SAMPLE_STEP_DAYS = 3;

const CHAMBERS: BearingChamber[] = ["front", "intershaft", "rear", "gearbox"];

const CHAMBER_LABELS: Record<BearingChamber, string> = {
  front: "Front bearing chamber (locations 1-2)",
  intershaft: "Intershaft bearing chamber (location 3)",
  rear: "Rear bearing chamber (locations 4-5)",
  gearbox: "Accessory gearbox / oil tank",
};

export function bearingChamberLabel(chamber: BearingChamber): string {
  return CHAMBER_LABELS[chamber];
}

const LOAD_PATH_MATERIALS: DebrisMaterial[] = ["M50 bearing steel", "carburised steel", "silver plating"];
const BENIGN_MATERIALS: DebrisMaterial[] = ["copper alloy", "titanium", "aluminium", "carbon seal", "non-metallic"];

const SOURCES: DebrisDetectionSource[] = [
  "electric-chip-detector",
  "magnetic-chip-detector",
  "oil-filter-inspection",
  "SOAP-sample",
];

export function isLoadPathMaterial(material: DebrisMaterial): boolean {
  return LOAD_PATH_MATERIALS.includes(material);
}

/* ------------------------------------------------------------------ */
/* Oil consumption series with step-change signature                   */
/* ------------------------------------------------------------------ */

interface ConsumptionProfile {
  points: Point[];
  stepIndex: number | null;
  stepMagnitude: number;
}

/**
 * Consumption profile for one engine: a slow deterioration ramp plus, for
 * distressed engines, a step change part-way through the window.
 */
function consumptionProfile(engine: Engine, rng: Rng): ConsumptionProfile {
  const def = PARAMETERS.oilConsumption;
  const health = engine.healthScore / 100;
  const severity = engine.environmentSeverity / 5;
  const base = def.nominal.min + (def.nominal.max - def.nominal.min) * (0.12 + (1 - health) * 0.5);
  const rampPerDay = ((1 - health) * 0.0005 + severity * 0.0001) * def.nominal.max;

  // A step change is the bearing-distress tell; only a few engines ever show one.
  const stepProbability = clamp(0.42 - health * 0.42, 0.01, 0.17);
  const hasStep = rand.bool(rng, stepProbability);
  const stepDayFromEnd = rand.int(rng, 12, 90);
  const stepMagnitude = hasStep ? round(rand.float(rng, 0.1, 0.4) * (0.6 + (1 - health)), 3) : 0;

  const points: Point[] = [];
  let stepIndex: number | null = null;
  let index = 0;
  for (let day = OIL_WINDOW_DAYS; day >= 0; day -= OIL_SAMPLE_STEP_DAYS) {
    const elapsed = OIL_WINDOW_DAYS - day;
    let value = base + rampPerDay * elapsed + rand.gaussian(rng, 0, base * 0.05);
    if (hasStep && day <= stepDayFromEnd) {
      if (stepIndex === null) stepIndex = index;
      value += stepMagnitude;
    }
    points.push({ t: iso(daysAgo(day)), v: round(clamp(value, 0.02, 1.6), 3) });
    index += 1;
  }

  return { points, stepIndex, stepMagnitude };
}

function consumptionSeries(engine: Engine, profile: ConsumptionProfile): Series {
  const def = PARAMETERS.oilConsumption;
  return {
    id: `${engine.id}:oilConsumption`,
    label: def.label,
    unit: def.unit,
    points: profile.points,
    amberThreshold: def.amber.min,
    redThreshold: def.red.min,
  };
}

/**
 * Shaft vibration as the oil module sees it: the shared vibN3 trend with the
 * bearing-distress contribution superimposed after a consumption step change,
 * so the correlation view shows the same event in both parameters.
 */
function distressAdjustedVibration(base: Series, profile: ConsumptionProfile): Series {
  if (profile.stepIndex === null || profile.stepMagnitude === 0) return base;
  const stepAt = new Date(profile.points[profile.stepIndex]!.t).getTime();
  const end = new Date(base.points[base.points.length - 1]!.t).getTime();
  const span = Math.max(1, end - stepAt);
  const peak = profile.stepMagnitude * 1.6;
  return {
    ...base,
    points: base.points.map((point) => {
      const t = new Date(point.t).getTime();
      if (t < stepAt) return point;
      const progress = clamp((t - stepAt) / span, 0, 1);
      return { t: point.t, v: round(point.v + peak * (0.35 + 0.65 * progress), 2) };
    }),
  };
}

function statusFor(value: number, parameter: "oilPressure" | "oilTemp" | "oilConsumption"): StatusLevel {
  const def = PARAMETERS[parameter];
  if (def.direction === "higher-is-worse") {
    if (value >= def.red.min) return "red";
    if (value >= def.amber.min) return "amber";
    return "green";
  }
  if (value <= def.red.max) return "red";
  if (value <= def.amber.max) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* Debris events                                                       */
/* ------------------------------------------------------------------ */

function makeDebrisEvents(engine: Engine, profile: ConsumptionProfile, rng: Rng): DebrisEvent[] {
  const health = engine.healthScore / 100;
  const stepPoint = profile.stepIndex !== null ? profile.points[profile.stepIndex] : undefined;
  const stepAt = stepPoint ? new Date(stepPoint.t).getTime() : null;

  // Baseline sampling activity plus extra indications once distress starts.
  const routineCount = rand.int(rng, 1, 4);
  const distressCount = stepAt ? rand.int(rng, 2, 6) : rand.bool(rng, (1 - health) * 0.35) ? rand.int(rng, 1, 2) : 0;

  const events: DebrisEvent[] = [];
  const flights = getDataset().flights.filter((f) => f.aircraftId === engine.aircraftId);

  const push = (daysBack: number, distressed: boolean, n: number) => {
    const detectedAt = daysAgo(daysBack);
    const material = distressed
      ? rand.weighted(rng, [
          { value: "M50 bearing steel" as DebrisMaterial, weight: 46 },
          { value: "carburised steel" as DebrisMaterial, weight: 24 },
          { value: "silver plating" as DebrisMaterial, weight: 12 },
          { value: "copper alloy" as DebrisMaterial, weight: 10 },
          { value: "carbon seal" as DebrisMaterial, weight: 8 },
        ])
      : rand.pick(rng, BENIGN_MATERIALS);
    const loadPathMetal = isLoadPathMaterial(material);
    const particleCount = distressed ? rand.int(rng, 12, 140) : rand.int(rng, 1, 11);
    const maxParticleMicrons = distressed ? rand.int(rng, 180, 1400) : rand.int(rng, 25, 190);
    const chamber = distressed
      ? rand.weighted(rng, [
          { value: "rear" as BearingChamber, weight: 40 },
          { value: "intershaft" as BearingChamber, weight: 30 },
          { value: "front" as BearingChamber, weight: 18 },
          { value: "gearbox" as BearingChamber, weight: 12 },
        ])
      : rand.pick(rng, CHAMBERS);
    const status: StatusLevel =
      loadPathMetal && particleCount >= 40 ? "red" : loadPathMetal || particleCount >= 20 ? "amber" : "green";
    const flight = flights.length > 0 ? rand.pick(rng, flights) : null;
    const source = distressed
      ? rand.weighted(rng, [
          { value: "electric-chip-detector" as DebrisDetectionSource, weight: 45 },
          { value: "oil-filter-inspection" as DebrisDetectionSource, weight: 25 },
          { value: "SOAP-sample" as DebrisDetectionSource, weight: 20 },
          { value: "magnetic-chip-detector" as DebrisDetectionSource, weight: 10 },
        ])
      : rand.pick(rng, SOURCES);

    events.push({
      id: `DB-${engine.id.slice(3)}-${String(n).padStart(2, "0")}`,
      engineId: engine.id,
      detectedAt: iso(detectedAt),
      source,
      chamber,
      particleCount,
      maxParticleMicrons,
      material,
      loadPathMetal,
      status,
      flightId: flight ? flight.id : null,
      note: loadPathMetal
        ? `${material} fragments recovered from the ${chamber} chamber; consistent with rolling-element spalling.`
        : `${material} particles within expected wear population for the ${chamber} chamber.`,
    });
  };

  let n = 0;
  for (let i = 0; i < routineCount; i += 1) {
    n += 1;
    push(rand.int(rng, 20, OIL_WINDOW_DAYS), false, n);
  }
  const stepDaysBack = stepAt !== null ? Math.round((NOW.getTime() - stepAt) / 86400000) : 0;
  for (let i = 0; i < distressCount; i += 1) {
    n += 1;
    push(stepAt !== null ? rand.int(rng, 0, Math.max(1, stepDaysBack)) : rand.int(rng, 0, 60), true, n);
  }

  return events.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Recommended action                                                  */
/* ------------------------------------------------------------------ */

function recommendedAction(input: {
  consumption: number;
  amberLimit: number;
  redLimit: number;
  stepChangeQtPerHr: number;
  loadPathEvents90d: number;
  debrisCount30d: number;
  maxParticleMicrons: number;
  vibrationDeltaIps: number;
  egtMargin: number;
  distressIndex: number;
}): OilRecommendedAction {
  const rationale: string[] = [];
  if (input.consumption >= input.redLimit) {
    rationale.push(`Oil consumption ${input.consumption.toFixed(2)} qt/h is above the ${input.redLimit} qt/h removal limit`);
  } else if (input.consumption >= input.amberLimit) {
    rationale.push(`Oil consumption ${input.consumption.toFixed(2)} qt/h is above the ${input.amberLimit} qt/h watch limit`);
  }
  if (input.stepChangeQtPerHr > 0) {
    rationale.push(`Step change of +${input.stepChangeQtPerHr.toFixed(2)} qt/h in the consumption trend`);
  }
  if (input.loadPathEvents90d > 0) {
    rationale.push(`${input.loadPathEvents90d} load-path metal indication${input.loadPathEvents90d > 1 ? "s" : ""} in 90 days`);
  }
  if (input.maxParticleMicrons >= 500) {
    rationale.push(`Largest particle ${input.maxParticleMicrons} µm exceeds the 500 µm spalling threshold`);
  }
  if (input.vibrationDeltaIps >= 0.25) {
    rationale.push(`Vibration up ${input.vibrationDeltaIps.toFixed(2)} IPS over the same window`);
  }
  if (input.egtMargin < 12) {
    rationale.push(`EGT margin ${input.egtMargin.toFixed(0)}°C leaves no thermal headroom`);
  }

  if (input.loadPathEvents90d >= 4 || (input.consumption >= input.redLimit && input.loadPathEvents90d >= 2)) {
    return {
      kind: "remove-engine",
      label: "Remove engine at next available slot",
      status: "red",
      dueWithinHours: 72,
      rationale,
      reference: "EMM 79-00-00 / bearing distress disposition",
    };
  }
  if (input.loadPathEvents90d >= 2 || (input.loadPathEvents90d >= 1 && input.maxParticleMicrons >= 500) || input.distressIndex >= 78) {
    return {
      kind: "borescope",
      label: "Borescope bearing chamber before next departure",
      status: "red",
      dueWithinHours: 24,
      rationale,
      reference: "EMM 72-20-00 borescope task 601",
    };
  }
  if (input.consumption >= input.amberLimit || input.stepChangeQtPerHr > 0 || input.distressIndex >= 45) {
    return {
      kind: "oil-sample-lab",
      label: "Send SOAP sample to lab and confirm trend",
      status: "amber",
      dueWithinHours: 96,
      rationale,
      reference: "SB enhanced oil debris monitoring sampling",
    };
  }
  if (input.debrisCount30d > 0 || input.distressIndex >= 30) {
    return {
      kind: "increase-sampling",
      label: "Increase oil sampling to every 25 flight hours",
      status: "amber",
      dueWithinHours: 168,
      rationale: rationale.length > 0 ? rationale : ["Debris indications present but below the load-path threshold"],
      reference: "Operator oil monitoring programme",
    };
  }
  return {
    kind: "nominal",
    label: "No action — continue routine monitoring",
    status: "green",
    dueWithinHours: null,
    rationale: ["All oil and debris parameters within limits"],
    reference: "Routine EHM download",
  };
}

/* ------------------------------------------------------------------ */
/* Per-engine condition                                                */
/* ------------------------------------------------------------------ */

interface OilRecord {
  condition: OilCondition;
  events: DebrisEvent[];
  timeline: OilCorrelationTimeline;
}

function buildRecord(engine: Engine): OilRecord {
  const data = getDataset();
  const rng = createRng(`oil-debris:${engine.id}`);
  const profile = consumptionProfile(engine, rng);
  const events = makeDebrisEvents(engine, profile, rng);

  const consumptionDef = PARAMETERS.oilConsumption;
  const points = profile.points;
  const latest = points[points.length - 1]!.v;
  const thirtyDaysAgoIndex = Math.max(0, points.length - 1 - Math.round(30 / OIL_SAMPLE_STEP_DAYS));
  const previous = points[thirtyDaysAgoIndex]!.v;
  const consumptionTrendPct = round(((latest - previous) / Math.max(previous, 0.01)) * 100, 1);
  const stepChangeAt = profile.stepIndex !== null ? points[profile.stepIndex]!.t : null;

  const pressureSeries = engineSeries(engine, "oilPressure", 90);
  const tempSeries = engineSeries(engine, "oilTemp", 90);
  const vibrationSeries = distressAdjustedVibration(engineSeries(engine, "vibN3", OIL_WINDOW_DAYS), profile);
  const egtSeries = engineSeries(engine, "egtMargin", OIL_WINDOW_DAYS);

  const oilPressurePsi = pressureSeries.points[pressureSeries.points.length - 1]!.v;
  const oilTempC = tempSeries.points[tempSeries.points.length - 1]!.v;
  const vibrationIps = vibrationSeries.points[vibrationSeries.points.length - 1]!.v;
  const vibrationRef = vibrationSeries.points[Math.max(0, vibrationSeries.points.length - 11)]!.v;
  const vibrationDeltaIps = round(vibrationIps - vibrationRef, 2);

  const within = (event: DebrisEvent, days: number) =>
    NOW.getTime() - new Date(event.detectedAt).getTime() <= days * 86400000;
  const events30 = events.filter((e) => within(e, 30));
  const events90 = events.filter((e) => within(e, 90));
  const loadPathEvents90d = events90.filter((e) => e.loadPathMetal).length;
  const debrisCount30d = events30.reduce((sum, e) => sum + e.particleCount, 0);
  const debrisCount90d = events90.reduce((sum, e) => sum + e.particleCount, 0);
  const maxParticleMicrons = events90.reduce((max, e) => Math.max(max, e.maxParticleMicrons), 0);

  const dominant = <T extends string>(values: T[]): T | null => {
    if (values.length === 0) return null;
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };

  const consumptionScore = clamp(((latest - consumptionDef.nominal.min) / (consumptionDef.red.min - consumptionDef.nominal.min)) * 55, 0, 55);
  const debrisScore = clamp(loadPathEvents90d * 12 + Math.min(debrisCount90d, 240) / 12, 0, 32);
  const vibrationScore = clamp(vibrationDeltaIps * 26, 0, 13);
  const bearingDistressIndex = Math.round(clamp(consumptionScore + debrisScore + vibrationScore, 0, 100));

  const action = recommendedAction({
    consumption: latest,
    amberLimit: consumptionDef.amber.min,
    redLimit: consumptionDef.red.min,
    stepChangeQtPerHr: profile.stepMagnitude,
    loadPathEvents90d,
    debrisCount30d,
    maxParticleMicrons,
    vibrationDeltaIps,
    egtMargin: engine.egtMargin,
    distressIndex: bearingDistressIndex,
  });

  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);

  const condition: OilCondition = {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    aircraftTail: aircraft?.tail ?? null,
    location: engine.location,
    consumptionQtPerHr: latest,
    consumptionAmberLimit: consumptionDef.amber.min,
    consumptionRedLimit: consumptionDef.red.min,
    consumptionTrendPct,
    stepChangeAt,
    stepChangeQtPerHr: profile.stepMagnitude,
    oilPressurePsi,
    oilTempC,
    oilPressureStatus: statusFor(oilPressurePsi, "oilPressure"),
    oilTempStatus: statusFor(oilTempC, "oilTemp"),
    debrisCount30d,
    debrisCount90d,
    loadPathEvents90d,
    lastDebrisAt: events[0]?.detectedAt ?? null,
    dominantMaterial: dominant(events90.map((e) => e.material)),
    dominantChamber: dominant(events90.map((e) => e.chamber)),
    vibrationIps,
    vibrationDeltaIps,
    egtMargin: engine.egtMargin,
    bearingDistressIndex,
    status: action.status,
    action,
  };

  const timeline: OilCorrelationTimeline = {
    engineId: engine.id,
    consumption: consumptionSeries(engine, profile),
    vibration: vibrationSeries,
    egtMargin: egtSeries,
    debris: events
      .filter((e) => within(e, OIL_WINDOW_DAYS))
      .map((e) => ({ t: e.detectedAt, v: e.particleCount }))
      .sort((a, b) => (a.t < b.t ? -1 : 1)),
    stepChangeAt,
  };

  return { condition, events, timeline };
}

let cache: Map<string, OilRecord> | null = null;

function records(): Map<string, OilRecord> {
  if (!cache) {
    cache = new Map();
    for (const engine of getDataset().engines) cache.set(engine.id, buildRecord(engine));
  }
  return cache;
}

/* ------------------------------------------------------------------ */
/* Public selectors                                                    */
/* ------------------------------------------------------------------ */

/** Oil condition for every monitored engine, worst first. */
export function oilConditions(): OilCondition[] {
  return [...records().values()]
    .map((record) => record.condition)
    .sort((a, b) => b.bearingDistressIndex - a.bearingDistressIndex);
}

export function getOilCondition(engineId: string): OilCondition | undefined {
  const direct = records().get(engineId);
  if (direct) return direct.condition;
  return oilConditions().find((c) => c.esn === engineId);
}

export function getDebrisEvents(engineId: string): DebrisEvent[] {
  return records().get(engineId)?.events ?? [];
}

/** Every debris indication in the fleet, most recent first. */
export function recentDebrisEvents(days = 30, limit = 40): DebrisEvent[] {
  const cutoff = NOW.getTime() - days * 86400000;
  return [...records().values()]
    .flatMap((record) => record.events)
    .filter((event) => new Date(event.detectedAt).getTime() >= cutoff)
    .sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1))
    .slice(0, limit);
}

export function getOilCorrelationTimeline(engineId: string): OilCorrelationTimeline | undefined {
  return records().get(engineId)?.timeline;
}

export function oilFleetSummary(): OilFleetSummary {
  const conditions = oilConditions();
  const sorted = [...conditions].map((c) => c.consumptionQtPerHr).sort((a, b) => a - b);
  const cutoff = NOW.getTime() - 30 * 86400000;
  const loadPath30 = [...records().values()]
    .flatMap((record) => record.events)
    .filter((e) => e.loadPathMetal && new Date(e.detectedAt).getTime() >= cutoff).length;

  return {
    enginesMonitored: conditions.length,
    red: conditions.filter((c) => c.status === "red").length,
    amber: conditions.filter((c) => c.status === "amber").length,
    green: conditions.filter((c) => c.status === "green").length,
    overConsumptionLimit: conditions.filter((c) => c.consumptionQtPerHr >= c.consumptionAmberLimit).length,
    stepChanges: conditions.filter((c) => c.stepChangeAt !== null).length,
    loadPathDetections30d: loadPath30,
    removalsRecommended: conditions.filter((c) => c.action.kind === "remove-engine").length,
    borescopesRecommended: conditions.filter((c) => c.action.kind === "borescope").length,
    medianConsumption: round(sorted[Math.floor(sorted.length / 2)] ?? 0, 3),
  };
}

/** Debris burden per bearing chamber, used to point the investigation. */
export function debrisByChamber(days = 90): { chamber: BearingChamber; label: string; events: number; particles: number; loadPath: number }[] {
  const cutoff = NOW.getTime() - days * 86400000;
  return CHAMBERS.map((chamber) => {
    const events = [...records().values()]
      .flatMap((record) => record.events)
      .filter((e) => e.chamber === chamber && new Date(e.detectedAt).getTime() >= cutoff);
    return {
      chamber,
      label: CHAMBER_LABELS[chamber],
      events: events.length,
      particles: events.reduce((sum, e) => sum + e.particleCount, 0),
      loadPath: events.filter((e) => e.loadPathMetal).length,
    };
  }).sort((a, b) => b.loadPath - a.loadPath || b.particles - a.particles);
}
