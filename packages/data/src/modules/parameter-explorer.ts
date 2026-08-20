/**
 * Deterministic selectors for the `parameter-explorer` module.
 *
 * The continuous strand carries roughly 3,000 parameters at 1 Hz. For each
 * investigation the sweep scores every in-scope parameter against the event
 * label, and the explorer surfaces the few that separate early and cleanly.
 * Scores are derived from an RNG seeded on investigation + parameter, so the
 * ranking is stable across the API, the page and any test.
 */

import type {
  Investigation,
  ParameterExplorerSummary,
  ParameterMeta,
  ParameterSignal,
  ParameterSystem,
  ParameterTracePoint,
  StatusLevel,
} from "@rr/types";
import { createRng, iso, NOW, rand, round } from "../rng";

export const PARAMETER_SYSTEM_LABELS: Record<ParameterSystem, string> = {
  fan: "Fan",
  "lp-compressor": "LP compressor",
  "hp-compressor": "HP compressor",
  combustor: "Combustor",
  "hp-turbine": "HP turbine",
  "ip-turbine": "IP turbine",
  "lp-turbine": "LP turbine",
  oil: "Oil system",
  fuel: "Fuel system",
  "air-system": "Air system",
  control: "Control",
  vibration: "Vibration",
  "sensor-health": "Sensor health",
};

/** Measurement families per system, used to build schema-style mnemonics. */
const SYSTEM_MEASURES: Record<ParameterSystem, { code: string; name: string; unit: string }[]> = {
  fan: [
    { code: "N1", name: "Fan speed", unit: "%" },
    { code: "TIP_CLR", name: "Fan tip clearance", unit: "mm" },
    { code: "INLET_P", name: "Inlet total pressure", unit: "kPa" },
  ],
  "lp-compressor": [
    { code: "P24", name: "LPC exit pressure", unit: "kPa" },
    { code: "T24", name: "LPC exit temperature", unit: "°C" },
  ],
  "hp-compressor": [
    { code: "N2", name: "HP spool speed", unit: "%" },
    { code: "P30", name: "HPC delivery pressure", unit: "kPa" },
    { code: "T30", name: "HPC delivery temperature", unit: "°C" },
    { code: "VSV_POS", name: "Variable stator vane position", unit: "deg" },
  ],
  combustor: [
    { code: "WF", name: "Fuel flow", unit: "kg/h" },
    { code: "P40", name: "Combustor exit pressure", unit: "kPa" },
    { code: "LINER_DT", name: "Liner delta temperature", unit: "°C" },
  ],
  "hp-turbine": [
    { code: "TGT", name: "Turbine gas temperature", unit: "°C" },
    { code: "TM_STG1", name: "Stage 1 metal temperature", unit: "°C" },
    { code: "COOL_DP", name: "Cooling air delta pressure", unit: "kPa" },
  ],
  "ip-turbine": [
    { code: "N3", name: "IP spool speed", unit: "%" },
    { code: "T45", name: "IPT inlet temperature", unit: "°C" },
  ],
  "lp-turbine": [
    { code: "T50", name: "LPT exit temperature", unit: "°C" },
    { code: "EPR", name: "Engine pressure ratio", unit: "" },
  ],
  oil: [
    { code: "OIL_P", name: "Oil pressure", unit: "kPa" },
    { code: "OIL_T", name: "Oil temperature", unit: "°C" },
    { code: "OIL_QTY", name: "Oil quantity", unit: "l" },
    { code: "SCAV_T", name: "Scavenge temperature", unit: "°C" },
  ],
  fuel: [
    { code: "FMU_POS", name: "Fuel metering unit position", unit: "%" },
    { code: "FUEL_T", name: "Fuel temperature", unit: "°C" },
  ],
  "air-system": [
    { code: "BLEED_POS", name: "Bleed valve position", unit: "%" },
    { code: "HPSOV", name: "HP shut-off valve state", unit: "" },
  ],
  control: [
    { code: "TLA", name: "Thrust lever angle", unit: "deg" },
    { code: "DERATE", name: "Take-off derate", unit: "%" },
  ],
  vibration: [
    { code: "VIB_N1", name: "N1 tracked-order vibration", unit: "ips" },
    { code: "VIB_N2", name: "N2 tracked-order vibration", unit: "ips" },
    { code: "VIB_BB", name: "Broadband vibration", unit: "ips" },
    { code: "PHASE", name: "Vibration phase angle", unit: "deg" },
  ],
  "sensor-health": [
    { code: "FEED_GAP", name: "Feed continuity gap", unit: "s" },
    { code: "SENS_DRIFT", name: "Sensor drift residual", unit: "σ" },
  ],
};

/** Where in the flight the parameter is sampled from. */
const PHASES = ["START", "TO", "CLB", "CRZ", "DES", "APP", "IDLE"] as const;
const STATS = ["AVG", "MAX", "STD", "SLOPE"] as const;
/** Raw signal, corrected to ISA conditions, and delta to the engine baseline. */
const VARIANTS = ["RAW", "CORR", "DELTA"] as const;

const SYSTEMS = Object.keys(SYSTEM_MEASURES) as ParameterSystem[];

let catalogueCache: ParameterMeta[] | null = null;

/**
 * The continuous-strand parameter catalogue: measurement × flight phase ×
 * statistic × variant, which is how a ~3,000-parameter schema gets that big.
 */
export function parameterCatalogue(): ParameterMeta[] {
  if (catalogueCache) return catalogueCache;
  const out: ParameterMeta[] = [];
  let index = 0;
  for (const system of SYSTEMS) {
    for (const measure of SYSTEM_MEASURES[system]) {
      for (const phase of PHASES) {
        for (const stat of STATS) {
          for (const variant of VARIANTS) {
            index += 1;
            const code = `${measure.code}_${phase}_${stat}_${variant}`;
            const rng = createRng(`param:${code}`);
            out.push({
              id: `P-${String(index).padStart(4, "0")}`,
              code,
              name: `${measure.name} — ${phase} ${stat.toLowerCase()} (${variant.toLowerCase()})`,
              system,
              unit: measure.unit,
              hz: 1,
              coveragePct: rand.int(rng, 74, 100),
            });
          }
        }
      }
    }
  }
  catalogueCache = out;
  return out;
}

const INVESTIGATION_SEEDS: { failureMode: string; family: string; owner: string }[] = [
  { failureMode: "HPT stage 1 blade distress", family: "Trent XWB-97", owner: "r.swallow@rolls-royce.com" },
  { failureMode: "Bearing chamber scavenge blockage", family: "Trent 1000 TEN", owner: "a.hughes@rolls-royce.com" },
  { failureMode: "Fan blade imbalance onset", family: "Trent 7000", owner: "s.nakamura@rolls-royce.com" },
  { failureMode: "Compressor surge margin loss", family: "Trent 900", owner: "l.bergstrom@rolls-royce.com" },
  { failureMode: "Combustor liner cracking", family: "Trent XWB-84", owner: "j.okafor@rolls-royce.com" },
  { failureMode: "Fuel nozzle coking", family: "UltraFan", owner: "a.hughes@rolls-royce.com" },
];

/**
 * Systems that plausibly carry the leading indicator for a failure mode; the
 * sweep scores everything, but these are where the strong signals sit.
 */
const MODE_SYSTEMS: Record<string, ParameterSystem[]> = {
  "HPT stage 1 blade distress": ["hp-turbine", "combustor", "air-system"],
  "Bearing chamber scavenge blockage": ["oil", "vibration"],
  "Fan blade imbalance onset": ["vibration", "fan"],
  "Compressor surge margin loss": ["hp-compressor", "lp-compressor", "control"],
  "Combustor liner cracking": ["combustor", "hp-turbine", "fuel"],
  "Fuel nozzle coking": ["fuel", "combustor", "hp-compressor"],
};

let investigationCache: Investigation[] | null = null;

export function investigations(): Investigation[] {
  if (investigationCache) return investigationCache;
  const catalogue = parameterCatalogue();

  investigationCache = INVESTIGATION_SEEDS.map((seed, index) => {
    const id = `INV-${String(index + 1).padStart(2, "0")}`;
    const rng = createRng(`investigation:${id}`);
    const eventEngines = rand.int(rng, 4, 23);
    const flights = rand.int(rng, 180_000, 940_000);
    const parametersInScope = catalogue.length;
    return {
      id,
      failureMode: seed.failureMode,
      engineFamily: seed.family,
      eventEngines,
      normalEngines: rand.int(rng, 240, 1_900),
      flights,
      parametersInScope,
      dataPointsM: Math.round((flights * parametersInScope) / 1_000_000),
      sweepMinutes: rand.int(rng, 12, 148),
      // Fewer than eight confirmed events is a thin population to model on.
      status: eventEngines < 8 ? "red" : eventEngines < 14 ? "amber" : "green",
      owner: seed.owner,
      updatedAt: iso(new Date(NOW.getTime() - rand.int(rng, 1, 26) * 86_400_000)),
    };
  });

  return investigationCache;
}

export function investigation(investigationId: string): Investigation | undefined {
  return investigations().find((entry) => entry.id === investigationId);
}

function strengthOf(correlation: number, leadDays: number): StatusLevel {
  const abs = Math.abs(correlation);
  if (abs >= 0.62 && leadDays >= 20) return "red";
  if (abs >= 0.45) return "amber";
  return "green";
}

const signalCache = new Map<string, ParameterSignal[]>();

/**
 * The measurement a code belongs to, i.e. everything before the trailing
 * phase / statistic / variant tokens. Measure codes contain underscores of
 * their own (`OIL_P`, `VIB_N1`), so the first token is not the measurement.
 */
function measureOf(code: string): string {
  return code.split("_").slice(0, -3).join("_");
}

/**
 * Every catalogue parameter scored against one investigation, strongest
 * absolute correlation first.
 */
export function parameterSignals(investigationId: string): ParameterSignal[] {
  const cached = signalCache.get(investigationId);
  if (cached) return cached;
  const inv = investigation(investigationId);
  if (!inv) return [];

  const informative = new Set(MODE_SYSTEMS[inv.failureMode] ?? []);
  const scored = parameterCatalogue().map((parameter) => {
    const rng = createRng(`signal:${investigationId}:${parameter.code}`);
    const relevant = informative.has(parameter.system);
    // Skewed so that strong correlations stay rare: over a schema this size a
    // uniform draw would put hundreds of parameters at the ceiling.
    const draw = rand.float(rng, 0, 1, 4);
    const abs = relevant
      ? round(0.3 + 0.64 * draw ** 2.2, 3)
      : round(0.01 + 0.4 * draw ** 1.6, 3);
    const correlation = abs * (rand.bool(rng, relevant ? 0.7 : 0.5) ? 1 : -1);
    const leadDays = relevant ? rand.int(rng, 4, 62) : rand.int(rng, 0, 12);
    return {
      parameter,
      correlation,
      separationSigma: round(abs * rand.float(rng, 2.4, 4.6, 2), 2),
      leadDays,
      // Strong separations over hundreds of thousands of flights are not marginal.
      pValue: round(Math.max(0.0001, (1 - abs) ** 4 * rand.float(rng, 0.2, 1.4, 3)), 4),
      redundancy: 0,
      strength: strengthOf(correlation, leadDays),
      inLiveAnalytic: relevant && rand.bool(rng, 0.22),
    } satisfies ParameterSignal;
  });

  scored.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // Redundancy against higher-ranked signals: parameters from the same system
  // and measurement family largely repeat each other.
  const withRedundancy = scored.map((signal, index) => {
    if (index === 0) return signal;
    const rng = createRng(`redundancy:${investigationId}:${signal.parameter.code}`);
    const family = measureOf(signal.parameter.code);
    const duplicateFamily = scored.slice(0, index).some((higher) => measureOf(higher.parameter.code) === family);
    return {
      ...signal,
      redundancy: duplicateFamily ? rand.float(rng, 0.72, 0.97, 2) : rand.float(rng, 0.05, 0.55, 2),
    };
  });

  signalCache.set(investigationId, withRedundancy);
  return withRedundancy;
}

/** Threshold above which a signal is worth shortlisting for an analytic. */
export const SHORTLIST_CORRELATION = 0.6;

/**
 * The shortlist: strong, early, non-redundant signals — what a data scientist
 * would actually take into model development.
 */
export function shortlist(investigationId: string, limit = 12): ParameterSignal[] {
  return parameterSignals(investigationId)
    .filter(
      (signal) =>
        Math.abs(signal.correlation) >= SHORTLIST_CORRELATION && signal.redundancy < 0.7 && signal.leadDays >= 7,
    )
    .slice(0, limit);
}

/**
 * Cross-correlation between shortlisted signals, so collinear parameters are
 * obvious before they all go into the same model.
 */
export function correlationMatrix(investigationId: string, limit = 8): { codes: string[]; values: number[][] } {
  const signals = shortlist(investigationId, limit);
  const codes = signals.map((signal) => signal.parameter.code);
  const values = signals.map((rowSignal, row) =>
    signals.map((colSignal, col) => {
      if (row === col) return 1;
      const [a, b] = row < col ? [rowSignal, colSignal] : [colSignal, rowSignal];
      const rng = createRng(`pair:${investigationId}:${a.parameter.code}:${b.parameter.code}`);
      const sameSystem = a.parameter.system === b.parameter.system;
      return round(rand.float(rng, sameSystem ? 0.45 : -0.4, sameSystem ? 0.96 : 0.5, 2), 2);
    }),
  );
  return { codes, values };
}

/**
 * Normalised trace of one parameter through the 90 days before the event,
 * against the band the normal population sits in.
 */
export function parameterTrace(investigationId: string, parameterCode: string): ParameterTracePoint[] {
  const signal = parameterSignals(investigationId).find((entry) => entry.parameter.code === parameterCode);
  if (!signal) return [];
  const rng = createRng(`trace:${investigationId}:${parameterCode}`);
  const points: ParameterTracePoint[] = [];
  for (let day = -90; day <= 0; day += 3) {
    // The event population departs the normal band once inside the lead window.
    const lead = Math.max(signal.leadDays, 1);
    const intoLead = Math.max(0, (day + lead) / lead);
    const drift = signal.separationSigma * intoLead * (signal.correlation < 0 ? -1 : 1);
    points.push({
      day,
      event: round(drift + rand.float(rng, -0.28, 0.28, 2), 2),
      normalHigh: round(1 + rand.float(rng, -0.12, 0.12, 2), 2),
      normalLow: round(-1 + rand.float(rng, -0.12, 0.12, 2), 2),
    });
  }
  return points;
}

export function parameterExplorerSummary(): ParameterExplorerSummary {
  const all = investigations();
  const shortlists = all.map((inv) => shortlist(inv.id));
  const flat = shortlists.flat();
  return {
    investigations: all.length,
    parametersInScope: parameterCatalogue().length,
    dataPointsM: all.reduce((sum, inv) => sum + inv.dataPointsM, 0),
    candidateSignals: flat.length,
    bestLeadDays: flat.reduce((best, signal) => Math.max(best, signal.leadDays), 0),
    unexploited: flat.filter((signal) => !signal.inLiveAnalytic).length,
    sweepMinutes: all.reduce((sum, inv) => sum + inv.sweepMinutes, 0),
  };
}
