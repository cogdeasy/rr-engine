/**
 * Hot section condition — derived selectors.
 *
 * The generated fleet carries EGT margin, module life consumption, prognostics
 * and sector history; this file turns those into the hot section view of the
 * world: how fast margin is being consumed, when it runs out, what the turbine
 * and combustor hardware looks like, and what a water wash buys.
 *
 * Everything is a pure function of the deterministic dataset, so the API, the
 * web app and tests agree on every number.
 */

import type {
  Engine,
  EngineModule,
  HotSectionAction,
  HotSectionAssessment,
  HotSectionBandPoint,
  HotSectionDriver,
  HotSectionFleetSummary,
  HotSectionIndicator,
  HotSectionMarginCurve,
  HotSectionMarginPoint,
  HotSectionWashEvent,
  HotSectionWashProfile,
  ModuleCode,
  StatusLevel,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

/** Margin at or below this is a red condition; below the amber value it is a watchlist item. */
const RED_MARGIN_C = 12;
const AMBER_MARGIN_C = 25;
/** Planning horizon used by the fleet roll-up. */
const HORIZON_DAYS = 180;
/** Fleet mean values used to express one engine's exposure relative to the rest. */
const FLEET_MEAN_SEVERITY = 3;
const FLEET_MEAN_DERATE = 12.5;

function familySpec(engine: Engine) {
  return ENGINE_FAMILIES.find((f) => f.family === engine.family) ?? ENGINE_FAMILIES[0]!;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[index]!;
}

function statusFromIndex(index: number): StatusLevel {
  if (index >= 75) return "red";
  if (index >= 50) return "amber";
  return "green";
}

function daysBetween(from: string, to: Date = NOW): number {
  return Math.round((to.getTime() - new Date(from).getTime()) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Utilisation                                                         */
/* ------------------------------------------------------------------ */

export interface HotSectionUtilisation {
  cyclesPerDay: number;
  meanDeratePct: number;
  meanEnvironmentalExposure: number;
  sectorsSampled: number;
}

/** Recent sector profile for the aircraft this engine is installed on. */
export function hotSectionUtilisation(engine: Engine): HotSectionUtilisation {
  const flights = getDataset().flights.filter((f) => f.aircraftId === engine.aircraftId);
  if (flights.length === 0) {
    return { cyclesPerDay: 1.4, meanDeratePct: FLEET_MEAN_DERATE, meanEnvironmentalExposure: 0.2, sectorsSampled: 0 };
  }
  const window = Math.max(...flights.map((f) => daysBetween(f.departedAt)), 30);
  return {
    cyclesPerDay: round(clamp(flights.length / window, 0.4, 6), 2),
    meanDeratePct: round(flights.reduce((s, f) => s + f.derate, 0) / flights.length, 1),
    meanEnvironmentalExposure: round(flights.reduce((s, f) => s + f.environmentalExposure, 0) / flights.length, 2),
    sectorsSampled: flights.length,
  };
}

/* ------------------------------------------------------------------ */
/* Deterioration                                                       */
/* ------------------------------------------------------------------ */

interface Deterioration {
  lifeFraction: number;
  /** Mean rate observed since the last shop visit, °C per 100 cycles. */
  averageRatePer100Cycles: number;
  /** Rate now, adjusted for late-life acceleration, environment and derate. */
  ratePer100Cycles: number;
  severityFactor: number;
  derateFactor: number;
  lateLifeFactor: number;
}

function deterioration(engine: Engine, utilisation: HotSectionUtilisation): Deterioration {
  const spec = familySpec(engine);
  const lifeFraction = clamp(engine.cyclesSinceOverhaul / spec.overhaulIntervalCycles, 0.02, 1.4);
  const consumed = Math.max(2, spec.newEgtMargin - engine.egtMargin);
  const averageRatePer100Cycles = round((consumed / Math.max(150, engine.cyclesSinceOverhaul)) * 100, 3);
  const severityFactor = round(1 + (engine.environmentSeverity - FLEET_MEAN_SEVERITY) * 0.07, 3);
  const derateFactor = round(clamp(1 + (FLEET_MEAN_DERATE - utilisation.meanDeratePct) * 0.006, 0.9, 1.12), 3);
  const lateLifeFactor = round(1 + 0.35 * lifeFraction, 3);
  return {
    lifeFraction,
    averageRatePer100Cycles,
    ratePer100Cycles: round(
      Math.max(0.05, averageRatePer100Cycles * severityFactor * derateFactor * lateLifeFactor),
      3,
    ),
    severityFactor,
    derateFactor,
    lateLifeFactor,
  };
}

const familyMedianRates = new Map<string, number>();

function familyMedianRate(family: string): number {
  const cached = familyMedianRates.get(family);
  if (cached !== undefined) return cached;
  const rates = getDataset()
    .engines.filter((e) => e.family === family)
    .map((e) => deterioration(e, hotSectionUtilisation(e)).ratePer100Cycles)
    .sort((a, b) => a - b);
  const median = round(percentile(rates, 0.5), 3);
  familyMedianRates.set(family, median);
  return median;
}

/* ------------------------------------------------------------------ */
/* Condition matrix                                                    */
/* ------------------------------------------------------------------ */

/** Columns of the hot section condition matrix, in gas-path order. */
export const HOT_SECTION_INDICATORS: { id: string; label: string; short: string; moduleCode: ModuleCode; failureMode: string }[] = [
  { id: "combustor-liner", label: "Combustor liner condition", short: "Liner", moduleCode: "COMBUSTOR", failureMode: "Combustor tile liberation" },
  { id: "tbc-distress", label: "TBC distress", short: "TBC", moduleCode: "COMBUSTOR", failureMode: "Combustor tile liberation" },
  { id: "hpt-blade", label: "HPT blade condition", short: "HPT blade", moduleCode: "HPT", failureMode: "HPT blade tip oxidation" },
  { id: "hpt-coating", label: "Blade coating loss", short: "Coating", moduleCode: "HPT", failureMode: "HPT blade tip oxidation" },
  { id: "hpt-ngv", label: "NGV cracking", short: "NGV", moduleCode: "HPT", failureMode: "HPT NGV cracking" },
  { id: "lpt-sulphidation", label: "LPT sulphidation", short: "LPT", moduleCode: "LPT", failureMode: "LPT sulphidation attack" },
];

/** Beyond this, an inspection is too old to be treated as evidence. */
const EVIDENCE_STALE_DAYS = 300;

function indicatorsFor(engine: Engine, utilisation: HotSectionUtilisation): HotSectionIndicator[] {
  const data = getDataset();
  const modules = new Map<ModuleCode, EngineModule>(
    data.engineModules.filter((m) => m.engineId === engine.id).map((m) => [m.code, m]),
  );
  const prognostics = data.prognostics.filter((p) => p.engineId === engine.id);
  const env = engine.environmentSeverity;
  const exposure = utilisation.meanEnvironmentalExposure;

  return HOT_SECTION_INDICATORS.map((definition) => {
    const mod = modules.get(definition.moduleCode);
    const life = mod?.lifeConsumedPct ?? 0;
    const prognostic = prognostics.find((p) => p.failureMode === definition.failureMode);
    const probability = prognostic?.probability ?? 0;
    const weights: Record<string, number> = {
      "combustor-liner": life * 0.72 + probability * 22,
      "tbc-distress": life * 0.6 + probability * 28 + (env - FLEET_MEAN_SEVERITY) * 4,
      "hpt-blade": life * 0.78 + probability * 25 + (env - FLEET_MEAN_SEVERITY) * 3,
      "hpt-coating": life * 0.62 + (env - FLEET_MEAN_SEVERITY) * 6 + (exposure - 0.3) * 30,
      "hpt-ngv": life * 0.58 + probability * 30,
      "lpt-sulphidation": life * 0.5 + probability * 28 + (env - FLEET_MEAN_SEVERITY) * 6,
    };
    const index = round(clamp(weights[definition.id] ?? life, 0, 100), 0);
    const inspectionAgeDays = mod?.lastInspectedAt ? daysBetween(mod.lastInspectedAt) : null;
    const stale = inspectionAgeDays === null || inspectionAgeDays > EVIDENCE_STALE_DAYS;
    const hasEvidence = !stale || prognostic !== undefined;
    return {
      id: definition.id,
      label: definition.label,
      moduleCode: definition.moduleCode,
      index,
      status: hasEvidence ? statusFromIndex(index) : "grey",
      evidence: hasEvidence
        ? [
            stale ? null : "Borescope evidence",
            prognostic ? `prognostic p=${probability.toFixed(2)} (${prognostic.modelVersion})` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : `No inspection for ${inspectionAgeDays ?? "?"} days and no prognostic — index is a model estimate`,
      lastInspectedAt: mod?.lastInspectedAt ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Water wash                                                          */
/* ------------------------------------------------------------------ */

const WASH_HISTORY_DAYS = 730;

function washProfile(
  engine: Engine,
  utilisation: HotSectionUtilisation,
  wear: Deterioration,
  ratePer100Cycles: number,
): HotSectionWashProfile {
  const spec = familySpec(engine);
  const rng = createRng(`${engine.id}:hot-section-wash`);
  const recommendedIntervalDays = clamp(
    Math.round((165 - engine.environmentSeverity * 14 - wear.lifeFraction * 25) / 15) * 15,
    60,
    165,
  );

  const recoveryAt = (lifeFraction: number, jitter: number) =>
    round(
      clamp(
        spec.newEgtMargin * (0.05 + jitter * 0.04) * (1 - 0.45 * clamp(lifeFraction, 0, 1)) * (0.85 + engine.environmentSeverity * 0.05),
        0.8,
        14,
      ),
      1,
    );

  const events: HotSectionWashEvent[] = [];
  let daysAgoCursor = WASH_HISTORY_DAYS;
  while (daysAgoCursor > 0) {
    const at = addDays(NOW, -daysAgoCursor);
    const cyclesAt = Math.max(0, Math.round(engine.cyclesSinceOverhaul - daysAgoCursor * utilisation.cyclesPerDay));
    if (cyclesAt > 0) {
      events.push({
        at: iso(at),
        cyclesAt,
        marginRecoveredC: recoveryAt(cyclesAt / spec.overhaulIntervalCycles, rng()),
        downtimeHours: round(rand.float(rng, 3.5, 7.5), 1),
        facilityIcao: engine.location,
      });
    }
    daysAgoCursor -= Math.round(recommendedIntervalDays * rand.float(rng, 0.8, 1.55));
  }

  const last = events[events.length - 1] ?? null;
  const daysSinceLastWash = last ? daysBetween(last.at) : null;
  const meanRecoveredC = events.length
    ? round(events.reduce((s, e) => s + e.marginRecoveredC, 0) / events.length, 1)
    : 0;
  const expectedRecoveryC = recoveryAt(wear.lifeFraction, 0.5);
  const nextWashDue = last ? addDays(new Date(last.at), recommendedIntervalDays) : NOW;
  const overdueDays = Math.max(0, daysBetween(iso(nextWashDue)));
  // Margin recovered buys back cycles at the current deterioration rate. Capped
  // at a year: beyond that the projection is dominated by other life limiters.
  const cyclesGained = expectedRecoveryC / (ratePer100Cycles / 100);
  const deferralDays = Math.min(365, Math.round(cyclesGained / utilisation.cyclesPerDay));

  return {
    engineId: engine.id,
    events,
    meanRecoveredC,
    expectedRecoveryC,
    lastWashAt: last?.at ?? null,
    daysSinceLastWash,
    recommendedIntervalDays,
    nextWashDueAt: iso(nextWashDue),
    overdueDays,
    deferralDays,
    status: overdueDays > 0 ? (engine.egtMargin <= AMBER_MARGIN_C ? "red" : "amber") : "green",
  };
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

function driversFor(engine: Engine, utilisation: HotSectionUtilisation, wear: Deterioration, familyMedian: number): HotSectionDriver[] {
  const base = wear.averageRatePer100Cycles;
  const raw = [
    {
      label: "Deterioration rate",
      value: base,
      detail: `${wear.ratePer100Cycles.toFixed(2)} °C/100 cyc against a family median of ${familyMedian.toFixed(2)}`,
    },
    {
      label: "Environment severity",
      value: base * 0.6 * ((engine.environmentSeverity - 1) / 4),
      detail: `Severity ${engine.environmentSeverity}/5 · dust exposure index ${utilisation.meanEnvironmentalExposure.toFixed(2)}`,
    },
    {
      label: "Derate usage",
      value: base * 0.4 * clamp((25 - utilisation.meanDeratePct) / 25, 0, 1),
      detail: `Mean take-off derate ${utilisation.meanDeratePct.toFixed(0)}% across ${utilisation.sectorsSampled} sectors`,
    },
  ];
  const total = raw.reduce((s, r) => s + r.value, 0) || 1;
  return raw.map((r) => ({ label: r.label, share: round(r.value / total, 3), detail: r.detail }));
}

function actionFor(
  engine: Engine,
  wash: HotSectionWashProfile,
  worstIndicator: HotSectionIndicator,
  daysToExhaustion: number,
  exhaustionDate: string,
): HotSectionAction {
  if (engine.egtMargin <= RED_MARGIN_C || daysToExhaustion <= 90) {
    return {
      kind: "workscope",
      label: "Raise hot section restoration workscope",
      detail:
        daysToExhaustion <= 0
          ? "EGT margin is already spent — the engine is running on borrowed time, so book the shop slot and workscope HPT and combustor together."
          : `Margin exhausts in ${Math.round(daysToExhaustion)} days — book a shop slot and workscope HPT and combustor together.`,
      status: "red",
      byDate: exhaustionDate,
    };
  }
  if (worstIndicator.status === "red") {
    return {
      kind: "borescope",
      label: `Borescope ${worstIndicator.moduleCode} within 25 cycles`,
      detail: `${worstIndicator.label} at ${worstIndicator.index}/100 — confirm against serviceable limits before further margin is spent.`,
      status: "red",
      byDate: iso(addDays(NOW, 21)),
    };
  }
  if (wash.overdueDays > 0) {
    return {
      kind: "wash",
      label: `Water wash — ${wash.overdueDays} days overdue`,
      detail: `Recovers about ${wash.expectedRecoveryC.toFixed(1)} °C and defers removal by roughly ${wash.deferralDays} days for ${wash.events[wash.events.length - 1]?.downtimeHours ?? 5} hours of downtime.`,
      status: engine.egtMargin <= AMBER_MARGIN_C ? "red" : "amber",
      byDate: wash.nextWashDueAt,
    };
  }
  if (engine.environmentSeverity >= 4 && daysToExhaustion < 365) {
    return {
      kind: "reroute",
      label: "Rotate away from harsh-environment sectors",
      detail: `Severity ${engine.environmentSeverity}/5 routing is driving the rate; rotation typically returns 10-15% of the deterioration rate.`,
      status: "amber",
      byDate: null,
    };
  }
  return {
    kind: "monitor",
    label: "Monitor — no hot section action required",
    detail: `Within the family band with ${
      daysToExhaustion > 1825 ? "more than five years" : `${Math.round(daysToExhaustion)} days`
    } of margin remaining; next review at the ${wash.recommendedIntervalDays}-day wash.`,
    status: "green",
    byDate: wash.nextWashDueAt,
  };
}

function assess(engine: Engine): HotSectionAssessment {
  const data = getDataset();
  const spec = familySpec(engine);
  const utilisation = hotSectionUtilisation(engine);
  const wear = deterioration(engine, utilisation);
  const familyMedian = familyMedianRate(engine.family);
  const indicators = indicatorsFor(engine, utilisation);
  const wash = washProfile(engine, utilisation, wear, wear.ratePer100Cycles);

  const cyclesToExhaustion = Math.max(0, Math.round(Math.max(0, engine.egtMargin) / (wear.ratePer100Cycles / 100)));
  const daysToExhaustion = Math.round(cyclesToExhaustion / utilisation.cyclesPerDay);
  const exhaustionDate = iso(addDays(NOW, daysToExhaustion));

  const worstIndicator = [...indicators].sort((a, b) => b.index - a.index)[0]!;
  const status: StatusLevel =
    engine.egtMargin <= RED_MARGIN_C || daysToExhaustion <= 90
      ? "red"
      : engine.egtMargin <= AMBER_MARGIN_C || daysToExhaustion <= 270
        ? "amber"
        : "green";

  const urgency = round(
    clamp(
      0.4 * clamp(100 - daysToExhaustion / 7.3, 0, 100) +
        0.2 * clamp((1 - engine.egtMargin / spec.newEgtMargin) * 100, 0, 100) +
        0.25 * worstIndicator.index +
        0.15 * clamp((wear.ratePer100Cycles / Math.max(0.05, familyMedian)) * 50, 0, 100),
      0,
      100,
    ),
    0,
  );

  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const shopVisit = data.workOrders
    .filter((w) => w.engineId === engine.id && (w.type === "shop-visit" || w.type === "module-swap") && w.state !== "cancelled")
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    operatorName: operator?.name ?? "Unknown operator",
    operatorCode: operator?.code ?? "--",
    tail: aircraft?.tail ?? null,
    location: engine.location,
    egtMargin: engine.egtMargin,
    newEgtMargin: spec.newEgtMargin,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    overhaulIntervalCycles: spec.overhaulIntervalCycles,
    environmentSeverity: engine.environmentSeverity,
    meanDeratePct: utilisation.meanDeratePct,
    cyclesPerDay: utilisation.cyclesPerDay,
    deteriorationRatePer100Cycles: wear.ratePer100Cycles,
    familyMedianRatePer100Cycles: familyMedian,
    cyclesToExhaustion,
    daysToExhaustion,
    exhaustionDate,
    urgency,
    status,
    worstIndicatorIndex: worstIndicator.index,
    indicators,
    drivers: driversFor(engine, utilisation, wear, familyMedian),
    wash,
    action: actionFor(engine, wash, worstIndicator, daysToExhaustion, exhaustionDate),
    openAlertCount: data.alerts.filter(
      (a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive",
    ).length,
    plannedShopVisitAt: shopVisit?.scheduledStart ?? null,
  };
}

let assessmentCache: HotSectionAssessment[] | null = null;

/** Every installed engine assessed for hot section condition, most urgent first. */
export function hotSectionAssessments(): HotSectionAssessment[] {
  if (!assessmentCache) {
    assessmentCache = getDataset()
      .engines.filter((e) => e.lifeStage !== "in-shop")
      .map(assess)
      .sort((a, b) => b.urgency - a.urgency);
  }
  return assessmentCache;
}

export function hotSectionAssessment(engineId: string): HotSectionAssessment | undefined {
  return hotSectionAssessments().find((a) => a.engineId === engineId || a.esn === engineId);
}

/* ------------------------------------------------------------------ */
/* Curves                                                              */
/* ------------------------------------------------------------------ */

const CURVE_POINTS = 44;

/** Family deterioration band: p10/p50/p90 of the observed rate, projected from new. */
export function hotSectionFamilyBand(family: string, maxCycles: number): HotSectionBandPoint[] {
  const spec = ENGINE_FAMILIES.find((f) => f.family === family) ?? ENGINE_FAMILIES[0]!;
  const rates = getDataset()
    .engines.filter((e) => e.family === family)
    .map((e) => deterioration(e, hotSectionUtilisation(e)).ratePer100Cycles)
    .sort((a, b) => a - b);
  const fast = percentile(rates, 0.9);
  const median = percentile(rates, 0.5);
  const slow = percentile(rates, 0.1);
  const points: HotSectionBandPoint[] = [];
  for (let i = 0; i <= 20; i += 1) {
    const cycles = Math.round((maxCycles / 20) * i);
    points.push({
      cycles,
      p10: round(Math.max(0, spec.newEgtMargin - (fast / 100) * cycles), 1),
      p50: round(Math.max(0, spec.newEgtMargin - (median / 100) * cycles), 1),
      p90: round(Math.max(0, spec.newEgtMargin - (slow / 100) * cycles), 1),
    });
  }
  return points;
}

/**
 * Observed margin history plus forward projection for one engine.
 *
 * History is modelled as steady deterioration with an exponential recovery bump
 * at each recorded water wash, then offset so that the final point equals the
 * engine's reported EGT margin.
 */
export function hotSectionMarginCurve(engineId: string): HotSectionMarginCurve | undefined {
  const engine = getDataset().engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;
  const spec = familySpec(engine);
  const utilisation = hotSectionUtilisation(engine);
  const wear = deterioration(engine, utilisation);
  const wash = washProfile(engine, utilisation, wear, wear.ratePer100Cycles);
  const rng = createRng(`${engine.id}:hot-section-curve`);

  const decayCycles = Math.max(120, wash.recommendedIntervalDays * utilisation.cyclesPerDay);
  const modelled = (cycles: number) => {
    const trend = spec.newEgtMargin - (wear.averageRatePer100Cycles / 100) * cycles * (1 + 0.35 * (cycles / spec.overhaulIntervalCycles));
    const bump = wash.events
      .filter((e) => e.cyclesAt <= cycles)
      .reduce((sum, e) => sum + e.marginRecoveredC * Math.exp(-(cycles - e.cyclesAt) / decayCycles), 0);
    return trend + bump;
  };

  const cyclesBack = Math.min(
    Math.max(600, wash.recommendedIntervalDays * utilisation.cyclesPerDay * 4),
    1095 * utilisation.cyclesPerDay,
    engine.cyclesSinceOverhaul,
  );
  const start = Math.max(0, engine.cyclesSinceOverhaul - cyclesBack);
  const step = (engine.cyclesSinceOverhaul - start) / (CURVE_POINTS - 1) || 1;
  const offset = engine.egtMargin - modelled(engine.cyclesSinceOverhaul);

  const history: HotSectionMarginPoint[] = [];
  for (let i = 0; i < CURVE_POINTS; i += 1) {
    const cycles = Math.round(start + step * i);
    const previousCycles = i === 0 ? start : Math.round(start + step * (i - 1));
    const daysAgo = (engine.cyclesSinceOverhaul - cycles) / utilisation.cyclesPerDay;
    const noise = i === CURVE_POINTS - 1 ? 0 : rand.gaussian(rng, 0, 0.4);
    history.push({
      cycles,
      margin: round(Math.max(-8, modelled(cycles) + offset + noise), 1),
      at: iso(addDays(NOW, -daysAgo)),
      wash: wash.events.some((e) => e.cyclesAt > previousCycles && e.cyclesAt <= cycles) || undefined,
    });
  }

  const projection: HotSectionMarginPoint[] = [];
  const projectionCycles = Math.min(4000, Math.max(120, Math.round(engine.egtMargin / (wear.ratePer100Cycles / 100))));
  for (let i = 0; i <= 12; i += 1) {
    const cycles = Math.round(engine.cyclesSinceOverhaul + (projectionCycles / 12) * i);
    const days = (cycles - engine.cyclesSinceOverhaul) / utilisation.cyclesPerDay;
    projection.push({
      cycles,
      margin: round(Math.max(0, engine.egtMargin - (wear.ratePer100Cycles / 100) * (cycles - engine.cyclesSinceOverhaul)), 1),
      at: iso(addDays(NOW, days)),
    });
  }

  const maxCycles = Math.max(projection[projection.length - 1]!.cycles, spec.overhaulIntervalCycles);
  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    history,
    projection,
    band: hotSectionFamilyBand(engine.family, maxCycles),
    overhaulIntervalCycles: spec.overhaulIntervalCycles,
    amberThreshold: AMBER_MARGIN_C,
    redThreshold: RED_MARGIN_C,
  };
}

/* ------------------------------------------------------------------ */
/* Roll-up                                                             */
/* ------------------------------------------------------------------ */

export function hotSectionFleetSummary(): HotSectionFleetSummary {
  const assessments = hotSectionAssessments();
  const rates = assessments.map((a) => a.deteriorationRatePer100Cycles).sort((a, b) => a - b);
  const earliest = [...assessments].sort((a, b) => a.daysToExhaustion - b.daysToExhaustion)[0];
  return {
    enginesAssessed: assessments.length,
    red: assessments.filter((a) => a.status === "red").length,
    amber: assessments.filter((a) => a.status === "amber").length,
    green: assessments.filter((a) => a.status === "green").length,
    exhaustingWithin180Days: assessments.filter((a) => a.daysToExhaustion <= HORIZON_DAYS).length,
    earliestExhaustion: earliest
      ? { engineId: earliest.engineId, esn: earliest.esn, at: earliest.exhaustionDate, days: earliest.daysToExhaustion }
      : null,
    medianRatePer100Cycles: round(percentile(rates, 0.5), 2),
    recoverableMarginC: round(
      assessments.filter((a) => a.wash.overdueDays > 0).reduce((s, a) => s + a.wash.expectedRecoveryC, 0),
      0,
    ),
    washesOverdue: assessments.filter((a) => a.wash.overdueDays > 0).length,
    awaitingEvidence: assessments.filter((a) => a.indicators.some((i) => i.status === "grey")).length,
  };
}

const statusRank = (status: StatusLevel): number => ({ red: 3, amber: 2, green: 1, grey: 0 })[status];

/** Wash effectiveness roll-up: what washing actually returns across the fleet. */
export function hotSectionWashEffectiveness() {
  const assessments = hotSectionAssessments();
  const events = assessments.flatMap((a) => a.wash.events);
  const byInterval = new Map<number, { intervalDays: number; recovered: number[]; engines: number }>();
  for (const assessment of assessments) {
    const bucket = byInterval.get(assessment.wash.recommendedIntervalDays) ?? {
      intervalDays: assessment.wash.recommendedIntervalDays,
      recovered: [],
      engines: 0,
    };
    bucket.recovered.push(assessment.wash.meanRecoveredC);
    bucket.engines += 1;
    byInterval.set(assessment.wash.recommendedIntervalDays, bucket);
  }
  return {
    washesRecorded: events.length,
    meanRecoveredC: events.length ? round(events.reduce((s, e) => s + e.marginRecoveredC, 0) / events.length, 1) : 0,
    meanDowntimeHours: events.length ? round(events.reduce((s, e) => s + e.downtimeHours, 0) / events.length, 1) : 0,
    /** Margin returned per hour of downtime — the number that justifies the wash. */
    marginPerDowntimeHour: events.length
      ? round(
          events.reduce((s, e) => s + e.marginRecoveredC, 0) / events.reduce((s, e) => s + e.downtimeHours, 0),
          2,
        )
      : 0,
    byInterval: [...byInterval.values()]
      .sort((a, b) => a.intervalDays - b.intervalDays)
      .map((b) => ({
        intervalDays: b.intervalDays,
        engines: b.engines,
        meanRecoveredC: round(b.recovered.reduce((s, v) => s + v, 0) / b.recovered.length, 1),
      })),
    overdue: assessments
      .filter((a) => a.wash.overdueDays > 0)
      // Worst margin first: an overdue wash matters most where margin is scarce.
      .sort((a, b) => statusRank(b.wash.status) - statusRank(a.wash.status) || a.egtMargin - b.egtMargin)
      .slice(0, 8)
      .map((a) => ({
        engineId: a.engineId,
        esn: a.esn,
        operatorCode: a.operatorCode,
        overdueDays: a.wash.overdueDays,
        expectedRecoveryC: a.wash.expectedRecoveryC,
        deferralDays: a.wash.deferralDays,
        status: a.wash.status,
      })),
  };
}

export type HotSectionWashEffectiveness = ReturnType<typeof hotSectionWashEffectiveness>;
