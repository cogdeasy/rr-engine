/**
 * Deterministic digital-twin model behind the What-if simulation module.
 *
 * Everything in this file is a pure function of the generated dataset and the
 * lever settings passed in: the same levers always produce the same numbers on
 * the server, in the browser and in the API. No randomness, no clocks.
 *
 * `getSimulationBaseline` is the only function that touches the dataset; the
 * model itself takes a baseline plus levers, so the browser can re-run it on
 * every slider drag without loading the fleet.
 *
 * Domain assumptions (documented rather than hidden in the UI):
 *  - EGT margin decays linearly with cycles at a rate set by the build standard,
 *    scaled by route severity and take-off derate.
 *  - On-wing water washes recover a fixed amount of margin per wash with
 *    diminishing returns as the interval shortens.
 *  - Cruise fuel burn deteriorates in proportion to margin consumed, so the
 *    fuel penalty is integrated over the on-wing period rather than spot-valued.
 *  - Removing an engine before its remaining useful life is exhausted wastes
 *    certified life, valued pro-rata against the shop-visit price.
 */

import type {
  Point,
  ScenarioRecommendation,
  SensitivityEntry,
  SimulationBaseline,
  SimulationCandidate,
  SimulationDelta,
  SimulationLevers,
  SimulationOutcome,
  StatusLevel,
  WorkscopeLevel,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, hashString, iso, NOW, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Model constants                                                     */
/* ------------------------------------------------------------------ */

const FUEL_USD_PER_KG = 0.92;
/** USD per on-wing water wash, including the ground time it consumes. */
const WASH_EVENT_COST_USD = 6_400;
/** Margin recovered by a single wash on a benign route, °C. */
const WASH_RECOVERY_BASE_C = 1.6;
/** Fuel burn penalty at fully consumed EGT margin, percent. */
const FUEL_PENALTY_AT_ZERO_MARGIN_PCT = 3.2;
/** Extra cruise fuel burn per point of take-off derate, percent. */
const DERATE_FUEL_PENALTY_PCT = 0.012;
/** Recovery premium for a removal that was not planned. */
const UNSCHEDULED_PREMIUM_USD = 1_850_000;
/** Typical widebody annual utilisation, used to turn sector length into cycles per year. */
const ANNUAL_FLIGHT_HOURS = 3_800;

const WORKSCOPE_COST_FACTOR: Record<WorkscopeLevel, number> = {
  minimum: 0.56,
  "performance-restoration": 0.84,
  "full-overhaul": 1.18,
};

/** Margin restored by the shop visit, as a share of new-engine margin. */
const WORKSCOPE_MARGIN_RESTORED: Record<WorkscopeLevel, number> = {
  minimum: 0.62,
  "performance-restoration": 0.86,
  "full-overhaul": 0.98,
};

/** Shop days consumed by the visit. */
const WORKSCOPE_TAT_DAYS: Record<WorkscopeLevel, number> = {
  minimum: 26,
  "performance-restoration": 48,
  "full-overhaul": 68,
};

export const WORKSCOPE_LEVELS: { id: WorkscopeLevel; label: string; description: string }[] = [
  { id: "minimum", label: "Minimum", description: "Life-limited parts and mandatory findings only." },
  {
    id: "performance-restoration",
    label: "Performance restoration",
    description: "Core refurbishment restoring the bulk of EGT margin.",
  },
  { id: "full-overhaul", label: "Full overhaul", description: "All modules opened; margin returned to near new." },
];

/** Slider ranges shared by the UI and the sensitivity sweep. */
export const LEVER_RANGES = {
  removalOffsetCycles: { min: -900, max: 900, step: 50, unit: "cycles" },
  deratePct: { min: 0, max: 25, step: 1, unit: "%" },
  routeSeverity: { min: 1, max: 5, step: 0.1, unit: "index" },
  washIntervalDays: { min: 0, max: 540, step: 30, unit: "days" },
} as const;

/** Normalises the decay multipliers so a nominal profile scores 1.0. */
const NOMINAL_DECAY_FACTOR = severityFactor(3) * derateFactor(12);

function severityFactor(routeSeverity: number): number {
  return 0.7 + 0.15 * clamp(routeSeverity, 1, 5);
}

function derateFactor(deratePct: number): number {
  return 1.15 - 0.009 * clamp(deratePct, 0, 25);
}

/** Compact USD used in model-authored copy, matching the console's formatter. */
function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/* ------------------------------------------------------------------ */
/* Baseline derivation                                                 */
/* ------------------------------------------------------------------ */

/** Engines worth simulating: anything not comfortably green, worst first. */
function rankedEngineIds(): string[] {
  const rank: Record<StatusLevel, number> = { red: 3, amber: 2, green: 1, grey: 0 };
  return [...getDataset().engines]
    .sort((a, b) => rank[b.status] - rank[a.status] || a.healthScore - b.healthScore)
    .map((e) => e.id);
}

/**
 * Builds the modelling inputs for one engine from the generated fleet: its
 * flown profile comes from the sectors its aircraft actually flew.
 */
export function getSimulationBaseline(engineId: string): SimulationBaseline | undefined {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;

  const spec = ENGINE_FAMILIES.find((f) => f.family === engine.family) ?? ENGINE_FAMILIES[0]!;
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const contract = data.contracts.find((c) => c.operatorId === engine.operatorId);
  const flights = aircraft ? data.flights.filter((f) => f.aircraftId === aircraft.id) : [];

  const mean = (pick: (f: (typeof flights)[number]) => number) =>
    flights.length === 0 ? 0 : flights.reduce((sum, f) => sum + pick(f), 0) / flights.length;

  const blockHoursPerCycle = round(flights.length > 0 ? mean((f) => f.blockHours) : 6.5, 2);
  // Sectors are a sample rather than a full log, so utilisation is derived from
  // a widebody annual flying-hours assumption divided by the flown sector length.
  const cyclesPerYear = clamp(Math.round(ANNUAL_FLIGHT_HOURS / blockHoursPerCycle), 120, 900);
  const fuelBurnKgPerCycle = Math.round(flights.length > 0 ? mean((f) => f.fuelBurnKg) : blockHoursPerCycle * 6_200);
  const exposure = flights.length > 0 ? mean((f) => f.environmentalExposure) : 0.25;
  const flownDerate = flights.length > 0 ? Math.round(mean((f) => f.derate)) : 12;

  // Route severity blends the engine's assigned environment with the dust
  // exposure actually accumulated on its sectors.
  const routeSeverity = round(clamp(0.62 * engine.environmentSeverity + 0.38 * (1 + 4 * exposure), 1, 5), 1);

  // The wash programme in force today is a property of the operator's practice;
  // derived deterministically from the engine identity so it never drifts.
  const washIntervalDays = [0, 180, 270, 360, 540][hashString(`${engine.id}:wash`) % 5]!;

  const lifeFraction = engine.cyclesSinceOverhaul / spec.overhaulIntervalCycles;
  const plannedWorkscope: WorkscopeLevel =
    lifeFraction > 0.9 ? "full-overhaul" : lifeFraction > 0.62 ? "performance-restoration" : "minimum";

  const minimumEgtMargin = 8;
  const shopVisitBaseCostUsd = Math.round(3_100_000 + (spec.thrustLbf / 1000) * 42_000);

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    buildStandard: engine.buildStandard,
    operatorName: operator?.name ?? "Unassigned",
    operatorCode: operator?.code ?? "--",
    aircraftTail: aircraft?.tail ?? "off wing",
    contractKind: contract?.kind ?? "Time & Materials",
    status: engine.status,
    egtMargin: engine.egtMargin,
    newEgtMargin: spec.newEgtMargin,
    minimumEgtMargin,
    healthScore: engine.healthScore,
    prognosticRisk: prognosticPressure(engine.id),
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    overhaulIntervalCycles: spec.overhaulIntervalCycles,
    plannedRemovalCycles: Math.max(120, engine.rulCycles),
    cyclesPerYear,
    blockHoursPerCycle,
    fuelBurnKgPerCycle,
    ratePerEfhUsd: contract?.ratePerEfhUsd ?? 280,
    availabilityTarget: contract?.availabilityTarget ?? 98.5,
    shopVisitBaseCostUsd,
    levers: {
      removalOffsetCycles: 0,
      deratePct: flownDerate,
      routeSeverity,
      washIntervalDays,
      workscope: plannedWorkscope,
    },
  };
}

/** Highest prognostic probability on the engine — the model's own failure signal. */
function prognosticPressure(engineId: string): number {
  const prognostics = getDataset().prognostics.filter((p) => p.engineId === engineId);
  if (prognostics.length === 0) return 0.1;
  return Math.max(...prognostics.map((p) => p.probability));
}

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

export function normaliseLevers(baseline: SimulationBaseline, levers: SimulationLevers): SimulationLevers {
  return {
    removalOffsetCycles: clamp(
      Math.round(levers.removalOffsetCycles),
      Math.max(LEVER_RANGES.removalOffsetCycles.min, -(baseline.plannedRemovalCycles - 120)),
      LEVER_RANGES.removalOffsetCycles.max,
    ),
    deratePct: clamp(Math.round(levers.deratePct), LEVER_RANGES.deratePct.min, LEVER_RANGES.deratePct.max),
    routeSeverity: round(clamp(levers.routeSeverity, LEVER_RANGES.routeSeverity.min, LEVER_RANGES.routeSeverity.max), 1),
    washIntervalDays: clamp(
      Math.round(levers.washIntervalDays / 30) * 30,
      LEVER_RANGES.washIntervalDays.min,
      LEVER_RANGES.washIntervalDays.max,
    ),
    workscope: levers.workscope,
  };
}

/** °C of EGT margin lost per cycle under a given profile. */
export function decayPerCycle(baseline: SimulationBaseline, levers: SimulationLevers): number {
  const base = baseline.newEgtMargin / baseline.overhaulIntervalCycles;
  const gross = (base * severityFactor(levers.routeSeverity) * derateFactor(levers.deratePct)) / NOMINAL_DECAY_FACTOR;
  // Washes only recover fouling, so they can never remove more than a fraction
  // of the deterioration: the rest is irreversible hot-section damage.
  return Math.max(gross * 0.55, gross - washRecoveryPerCycle(baseline, levers));
}

/** °C recovered per cycle by the wash programme, with diminishing returns. */
export function washRecoveryPerCycle(baseline: SimulationBaseline, levers: SimulationLevers): number {
  if (levers.washIntervalDays <= 0) return 0;
  const washesPerYear = 365 / levers.washIntervalDays;
  const effective = washesPerYear / (1 + 0.2 * Math.max(0, washesPerYear - 1));
  const perWash = WASH_RECOVERY_BASE_C * (0.75 + 0.14 * levers.routeSeverity);
  return (effective * perWash) / baseline.cyclesPerYear;
}

function marginStatusFor(margin: number): StatusLevel {
  if (margin < 8) return "red";
  if (margin < 20) return "amber";
  return "green";
}

function riskStatusFor(risk: number): StatusLevel {
  if (risk >= 0.35) return "red";
  if (risk >= 0.18) return "amber";
  return "green";
}

function projection(baseline: SimulationBaseline, decay: number, onWingCycles: number): Point[] {
  const steps = 16;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const cycles = (onWingCycles / steps) * i;
    const days = (cycles / baseline.cyclesPerYear) * 365;
    points.push({ t: iso(addDays(NOW, Math.round(days))), v: round(baseline.egtMargin - decay * cycles, 1) });
  }
  return points;
}

/**
 * Runs one scenario. Pure: the only inputs are the baseline and the levers.
 */
export function simulate(baseline: SimulationBaseline, rawLevers: SimulationLevers): SimulationOutcome {
  const levers = normaliseLevers(baseline, rawLevers);
  const decay = decayPerCycle(baseline, levers);
  const usableMargin = Math.max(0, baseline.egtMargin - baseline.minimumEgtMargin);
  const rulCycles = Math.round(usableMargin / decay);
  const onWingCycles = Math.max(120, Math.round(baseline.plannedRemovalCycles + levers.removalOffsetCycles));
  const years = onWingCycles / baseline.cyclesPerYear;
  const egtMarginAtRemoval = round(baseline.egtMargin - decay * onWingCycles, 1);

  // Fuel: integrate the penalty over the period using the mean margin consumed.
  const meanMargin = (baseline.egtMargin + egtMarginAtRemoval) / 2;
  const consumedShare = clamp(1 - meanMargin / baseline.newEgtMargin, 0, 1);
  const fuelBurnPenaltyPct = round(
    consumedShare * FUEL_PENALTY_AT_ZERO_MARGIN_PCT + levers.deratePct * DERATE_FUEL_PENALTY_PCT,
    2,
  );
  const fuelPenaltyCostUsd = Math.round(
    baseline.fuelBurnKgPerCycle * onWingCycles * (fuelBurnPenaltyPct / 100) * FUEL_USD_PER_KG,
  );

  const washesPerYear = levers.washIntervalDays > 0 ? 365 / levers.washIntervalDays : 0;
  const washProgrammeCostUsd = Math.round(washesPerYear * years * WASH_EVENT_COST_USD);

  // A shop visit entered with less margin costs more: more distress to repair.
  const distressUplift = 1 + clamp((baseline.minimumEgtMargin - egtMarginAtRemoval) / 55, 0, 0.4);
  const shopVisitCostUsd = Math.round(
    baseline.shopVisitBaseCostUsd * WORKSCOPE_COST_FACTOR[levers.workscope] * distressUplift,
  );

  const unusedCycles = Math.max(0, rulCycles - onWingCycles);
  const lifeWasteCostUsd = Math.round(
    unusedCycles * (baseline.shopVisitBaseCostUsd / baseline.overhaulIntervalCycles),
  );

  // Risk rises steeply once the plan runs past the modelled remaining life, and
  // is amplified by the engine's own prognostic signal.
  const utilisationRatio = onWingCycles / Math.max(1, rulCycles);
  const geometricRisk = logistic(5.4 * (utilisationRatio - 1.15));
  const unscheduledRemovalRisk = round(
    clamp(geometricRisk * (0.55 + 0.7 * baseline.prognosticRisk), 0.01, 0.95),
    3,
  );

  const ldExposureUsd = baseline.ratePerEfhUsd * baseline.blockHoursPerCycle * 820;
  const disruptionCostUsd = Math.round(
    unscheduledRemovalRisk * (UNSCHEDULED_PREMIUM_USD + baseline.shopVisitBaseCostUsd * 0.3 + ldExposureUsd),
  );

  const plannedDownDays = WORKSCOPE_TAT_DAYS[levers.workscope];
  const expectedDownDays = plannedDownDays + unscheduledRemovalRisk * 45;
  const availabilityPct = round(clamp(100 - (expectedDownDays / (years * 365 + expectedDownDays)) * 100, 60, 100), 2);

  const totalCostUsd =
    fuelPenaltyCostUsd + washProgrammeCostUsd + shopVisitCostUsd + lifeWasteCostUsd + disruptionCostUsd;

  return {
    onWingCycles,
    onWingMonths: round(years * 12, 1),
    decayPerThousandCycles: round(decay * 1000, 2),
    egtMarginAtRemoval,
    rulCycles,
    fuelBurnPenaltyPct,
    fuelPenaltyCostUsd,
    washProgrammeCostUsd,
    shopVisitCostUsd,
    lifeWasteCostUsd,
    unscheduledRemovalRisk,
    disruptionCostUsd,
    totalCostUsd,
    costPerCycleUsd: round(totalCostUsd / onWingCycles, 0),
    availabilityPct,
    marginStatus: marginStatusFor(egtMarginAtRemoval),
    riskStatus: riskStatusFor(unscheduledRemovalRisk),
    availabilityStatus:
      availabilityPct >= baseline.availabilityTarget
        ? "green"
        : availabilityPct >= baseline.availabilityTarget - 1
          ? "amber"
          : "red",
    marginProjection: projection(baseline, decay, onWingCycles),
  };
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

interface DeltaSpec {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  direction: SimulationDelta["direction"];
  note: string;
  value: (o: SimulationOutcome) => number;
}

const DELTA_SPECS: DeltaSpec[] = [
  {
    key: "onWingCycles",
    label: "On-wing cycles",
    unit: "cycles",
    decimals: 0,
    direction: "higher-is-better",
    note: "Cycles delivered before the engine is removed.",
    value: (o) => o.onWingCycles,
  },
  {
    key: "egtMarginAtRemoval",
    label: "EGT margin at removal",
    unit: "°C",
    decimals: 1,
    direction: "higher-is-better",
    note: "Margin left the day the engine comes off wing; below 8 °C the limit is breached.",
    value: (o) => o.egtMarginAtRemoval,
  },
  {
    key: "rulCycles",
    label: "Modelled RUL",
    unit: "cycles",
    decimals: 0,
    direction: "higher-is-better",
    note: "Cycles available before minimum margin under this operating profile.",
    value: (o) => o.rulCycles,
  },
  {
    key: "decayPerThousandCycles",
    label: "Margin decay rate",
    unit: "°C/1k cyc",
    decimals: 2,
    direction: "lower-is-better",
    note: "Deterioration rate driven by severity, derate and the wash programme.",
    value: (o) => o.decayPerThousandCycles,
  },
  {
    key: "unscheduledRemovalRisk",
    label: "Unscheduled removal risk",
    unit: "%",
    decimals: 1,
    direction: "lower-is-better",
    note: "Probability the engine comes off before the planned removal.",
    value: (o) => o.unscheduledRemovalRisk * 100,
  },
  {
    key: "availabilityPct",
    label: "Modelled availability",
    unit: "%",
    decimals: 2,
    direction: "higher-is-better",
    note: "Availability across the on-wing period including expected disruption.",
    value: (o) => o.availabilityPct,
  },
  {
    key: "fuelBurnPenaltyPct",
    label: "Fuel burn penalty",
    unit: "%",
    decimals: 2,
    direction: "lower-is-better",
    note: "Cruise SFC deterioration versus a freshly overhauled engine.",
    value: (o) => o.fuelBurnPenaltyPct,
  },
  {
    key: "totalCostUsd",
    label: "Total cost of the interval",
    unit: "USD",
    decimals: 0,
    direction: "lower-is-better",
    note: "Shop visit, fuel penalty, washes, wasted life and risk-weighted disruption.",
    value: (o) => o.totalCostUsd,
  },
  {
    key: "costPerCycleUsd",
    label: "Cost per cycle",
    unit: "USD/cyc",
    decimals: 0,
    direction: "lower-is-better",
    note: "The comparable unit economics of the interval.",
    value: (o) => o.costPerCycleUsd,
  },
];

export function compareScenario(
  baseline: SimulationBaseline,
  levers: SimulationLevers,
  baselineOutcome = simulate(baseline, baseline.levers),
  scenarioOutcome = simulate(baseline, levers),
): SimulationDelta[] {
  return DELTA_SPECS.map((spec) => {
    const base = round(spec.value(baselineOutcome), spec.decimals);
    const scenario = round(spec.value(scenarioOutcome), spec.decimals);
    const delta = round(scenario - base, spec.decimals);
    const improved = spec.direction === "higher-is-better" ? delta > 0 : delta < 0;
    const material = Math.abs(delta) > Math.abs(base) * 0.005;
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      baseline: base,
      scenario,
      delta,
      deltaPct: base === 0 ? 0 : round((delta / Math.abs(base)) * 100, 1),
      direction: spec.direction,
      status: !material ? "grey" : improved ? "green" : "red",
      decimals: spec.decimals,
      note: spec.note,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Sensitivity                                                         */
/* ------------------------------------------------------------------ */

interface SensitivitySpec {
  lever: keyof SimulationLevers;
  label: string;
  low: (b: SimulationBaseline, l: SimulationLevers) => { levers: SimulationLevers; setting: string };
  high: (b: SimulationBaseline, l: SimulationLevers) => { levers: SimulationLevers; setting: string };
}

const SENSITIVITY_SPECS: SensitivitySpec[] = [
  {
    lever: "deratePct",
    label: "Take-off derate",
    low: (_b, l) => ({ levers: { ...l, deratePct: 0 }, setting: "0%" }),
    high: (_b, l) => ({ levers: { ...l, deratePct: 25 }, setting: "25%" }),
  },
  {
    lever: "routeSeverity",
    label: "Route severity mix",
    low: (_b, l) => ({ levers: { ...l, routeSeverity: 1 }, setting: "1.0 benign" }),
    high: (_b, l) => ({ levers: { ...l, routeSeverity: 5 }, setting: "5.0 harsh" }),
  },
  {
    lever: "washIntervalDays",
    label: "Wash interval",
    low: (_b, l) => ({ levers: { ...l, washIntervalDays: 90 }, setting: "90 days" }),
    high: (_b, l) => ({ levers: { ...l, washIntervalDays: 0 }, setting: "no washes" }),
  },
  {
    lever: "removalOffsetCycles",
    label: "Removal date",
    low: (b, l) => ({
      levers: { ...l, removalOffsetCycles: -Math.min(900, b.plannedRemovalCycles - 120) },
      setting: `-${Math.min(900, b.plannedRemovalCycles - 120)} cyc`,
    }),
    high: (_b, l) => ({ levers: { ...l, removalOffsetCycles: 900 }, setting: "+900 cyc" }),
  },
  {
    lever: "workscope",
    label: "Workscope level",
    low: (_b, l) => ({ levers: { ...l, workscope: "minimum" }, setting: "Minimum" }),
    high: (_b, l) => ({ levers: { ...l, workscope: "full-overhaul" }, setting: "Full overhaul" }),
  },
];

/** Which lever moves the outcome most, evaluated around the current scenario. */
export function sensitivity(baseline: SimulationBaseline, levers: SimulationLevers): SensitivityEntry[] {
  const entries = SENSITIVITY_SPECS.map((spec) => {
    const low = spec.low(baseline, levers);
    const high = spec.high(baseline, levers);
    const lowOutcome = simulate(baseline, low.levers);
    const highOutcome = simulate(baseline, high.levers);
    return {
      lever: spec.lever,
      label: spec.label,
      lowSetting: low.setting,
      highSetting: high.setting,
      costSwingUsd: Math.abs(highOutcome.totalCostUsd - lowOutcome.totalCostUsd),
      cycleSwing: Math.abs(highOutcome.onWingCycles - lowOutcome.onWingCycles),
      marginSwing: round(Math.abs(highOutcome.egtMarginAtRemoval - lowOutcome.egtMarginAtRemoval), 1),
      share: 0,
    } satisfies SensitivityEntry;
  });
  const total = entries.reduce((sum, e) => sum + e.costSwingUsd, 0) || 1;
  return entries
    .map((entry) => ({ ...entry, share: round(entry.costSwingUsd / total, 3) }))
    .sort((a, b) => b.costSwingUsd - a.costSwingUsd);
}

/* ------------------------------------------------------------------ */
/* Recommendation                                                      */
/* ------------------------------------------------------------------ */

const DERATE_OPTIONS = [8, 14, 20, 25];
const WASH_OPTIONS = [0, 120, 180, 365];
const OFFSET_OPTIONS = [-600, -300, 0, 300, 600, 900];

/**
 * Deterministic sweep of the lever grid for the cheapest compliant scenario:
 * margin must stay above the limit at removal and risk must stay off red.
 */
export function recommendScenario(baseline: SimulationBaseline): ScenarioRecommendation {
  const baseOutcome = simulate(baseline, baseline.levers);
  // A recommendation may never buy savings with materially more risk than the
  // engine already carries, and never crosses the red threshold.
  const riskCap = Math.max(0.12, Math.min(0.35, baseOutcome.unscheduledRemovalRisk + 0.05));
  let best: { levers: SimulationLevers; outcome: SimulationOutcome } | null = null;

  for (const deratePct of DERATE_OPTIONS) {
    for (const washIntervalDays of WASH_OPTIONS) {
      for (const removalOffsetCycles of OFFSET_OPTIONS) {
        for (const workscope of WORKSCOPE_LEVELS) {
          for (const severityShift of [-1, -0.5, 0]) {
            const levers = normaliseLevers(baseline, {
              deratePct,
              washIntervalDays,
              removalOffsetCycles,
              workscope: workscope.id,
              routeSeverity: clamp(baseline.levers.routeSeverity + severityShift, 1, 5),
            });
            const outcome = simulate(baseline, levers);
            if (outcome.egtMarginAtRemoval < baseline.minimumEgtMargin) continue;
            if (outcome.unscheduledRemovalRisk > riskCap) continue;
            if (outcome.availabilityPct < baseline.availabilityTarget - 1) continue;
            if (!best || outcome.costPerCycleUsd < best.outcome.costPerCycleUsd) best = { levers, outcome };
          }
        }
      }
    }
  }

  if (!best) {
    // Nothing satisfies the constraints: pull the removal forward on the
    // deepest workscope, which is the safe fallback an operator would take.
    const levers = normaliseLevers(baseline, {
      ...baseline.levers,
      removalOffsetCycles: -Math.round(baseline.plannedRemovalCycles * 0.35),
      deratePct: 25,
      washIntervalDays: 120,
      workscope: "full-overhaul",
    });
    const outcome = simulate(baseline, levers);
    return {
      levers,
      headline: `Remove ${Math.abs(levers.removalOffsetCycles)} cycles early and overhaul`,
      rationale: [
        "No profile keeps this engine inside the margin limit for the planned interval.",
        "Pulling the removal forward on a full overhaul is the only compliant option modelled.",
      ],
      savingUsd: baseOutcome.totalCostUsd - outcome.totalCostUsd,
      cyclesGained: outcome.onWingCycles - baseOutcome.onWingCycles,
      riskDelta: round(outcome.unscheduledRemovalRisk - baseOutcome.unscheduledRemovalRisk, 3),
    };
  }

  const { levers, outcome } = best;
  // Compare like with like: candidate levers are normalised, so the as-flown
  // profile has to be too, or an off-grid baseline reads as a change.
  const flown = normaliseLevers(baseline, baseline.levers);
  const rationale: string[] = [];
  if (levers.deratePct > flown.deratePct) {
    rationale.push(
      `Raise average take-off derate from ${flown.deratePct}% to ${levers.deratePct}%, slowing margin decay to ${outcome.decayPerThousandCycles} °C per 1,000 cycles.`,
    );
  }
  if (levers.washIntervalDays !== flown.washIntervalDays) {
    rationale.push(
      levers.washIntervalDays === 0
        ? "Stand down the wash programme — it is not paying for itself on this engine."
        : `Wash every ${levers.washIntervalDays} days instead of ${flown.washIntervalDays === 0 ? "never" : `${flown.washIntervalDays} days`}.`,
    );
  }
  if (levers.routeSeverity < flown.routeSeverity) {
    rationale.push(
      `Rotate onto a milder route mix (severity ${levers.routeSeverity} versus ${flown.routeSeverity} today).`,
    );
  }
  if (levers.removalOffsetCycles !== 0) {
    rationale.push(
      levers.removalOffsetCycles > 0
        ? `Defer removal by ${levers.removalOffsetCycles} cycles, taking the interval to ${outcome.onWingCycles} cycles.`
        : `Pull removal forward by ${Math.abs(levers.removalOffsetCycles)} cycles to stay clear of the limit.`,
    );
  }
  if (levers.workscope !== flown.workscope) {
    rationale.push(
      `Change the planned workscope to ${WORKSCOPE_LEVELS.find((w) => w.id === levers.workscope)!.label.toLowerCase()}, restoring ${Math.round(WORKSCOPE_MARGIN_RESTORED[levers.workscope] * 100)}% of new-engine margin.`,
    );
  }
  if (rationale.length === 0) rationale.push("The engine is already flying the cheapest compliant profile modelled.");

  const savingUsd = baseOutcome.totalCostUsd - outcome.totalCostUsd;
  return {
    levers,
    headline:
      savingUsd > 0
        ? `Save ${usd(savingUsd)} over the interval`
        : "Hold the current operating profile",
    rationale,
    savingUsd,
    cyclesGained: outcome.onWingCycles - baseOutcome.onWingCycles,
    riskDelta: round(outcome.unscheduledRemovalRisk - baseOutcome.unscheduledRemovalRisk, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/** Engines still deteriorating are worth simulating; the pool is deliberately wider than the list shown. */
const CANDIDATE_POOL = 24;

const candidateCache = new Map<number, SimulationCandidate[]>();

/**
 * Engines with the largest modelled opportunity. The pool is ranked by
 * condition, then ordered by the saving the recommended profile would deliver,
 * so the engine the console opens on is one where the levers still change the
 * answer. Cached because the sweep behind each candidate is deterministic.
 */
export function listSimulationCandidates(limit = 12): SimulationCandidate[] {
  const cached = candidateCache.get(limit);
  if (cached) return cached;
  const candidates = rankedEngineIds()
    .slice(0, CANDIDATE_POOL)
    .flatMap((engineId) => {
      const baseline = getSimulationBaseline(engineId);
      if (!baseline) return [];
      const outcome = simulate(baseline, baseline.levers);
      const recommendation = recommendScenario(baseline);
      return [
        {
          engineId: baseline.engineId,
          esn: baseline.esn,
          family: baseline.family,
          operatorCode: baseline.operatorCode,
          aircraftTail: baseline.aircraftTail,
          status: baseline.status,
          egtMargin: baseline.egtMargin,
          plannedRemovalCycles: baseline.plannedRemovalCycles,
          unscheduledRemovalRisk: outcome.unscheduledRemovalRisk,
          opportunityUsd: Math.max(0, Math.round(recommendation.savingUsd)),
        } satisfies SimulationCandidate,
      ];
    })
    .sort((a, b) => b.opportunityUsd - a.opportunityUsd || b.unscheduledRemovalRisk - a.unscheduledRemovalRisk)
    .slice(0, limit);
  candidateCache.set(limit, candidates);
  return candidates;
}

/** Fleet-level roll-up of the opportunity the simulator has identified. */
export function simulationFleetSummary(limit = 12) {
  const candidates = listSimulationCandidates(limit);
  return {
    engines: candidates.length,
    atRisk: candidates.filter((c) => c.unscheduledRemovalRisk >= 0.35).length,
    watchlist: candidates.filter((c) => c.unscheduledRemovalRisk >= 0.18 && c.unscheduledRemovalRisk < 0.35).length,
    opportunityUsd: candidates.reduce((sum, c) => sum + c.opportunityUsd, 0),
    meanRisk: round(candidates.reduce((sum, c) => sum + c.unscheduledRemovalRisk, 0) / Math.max(1, candidates.length), 3),
  };
}
