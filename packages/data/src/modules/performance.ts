/**
 * Performance & fuel burn selectors.
 *
 * Everything here is derived deterministically from the generated fleet: engine
 * deterioration state (EGT margin against the family's new-engine margin),
 * the sectors actually flown (for annualised fuel burn) and the operator's
 * contract rate (for the availability cost of wash downtime).
 */

import type {
  DeteriorationSlice,
  EnginePerformance,
  Engine,
  FleetPerformanceSummary,
  PerformanceThresholds,
  Point,
  Series,
  StatusLevel,
  WashCase,
  WashEvent,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

export const PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  amberSfcDeviationPct: 1.5,
  redSfcDeviationPct: 2.5,
  /** Jet A-1, blended fleet price assumption. */
  jetFuelUsdPerKg: 0.86,
  /** Well-established combustion factor for kerosene. */
  co2KgPerFuelKg: 3.16,
};

const CAUSE_LABELS: Record<DeteriorationSlice["cause"], string> = {
  fouling: "Fan & compressor fouling",
  "hot-section": "Hot-section deterioration",
  seals: "Seal & tip clearance wear",
};

/** A wash only recovers deposits; it cannot restore burnt hardware or clearances. */
const RECOVERABLE: Record<DeteriorationSlice["cause"], number> = {
  fouling: 0.78,
  "hot-section": 0.05,
  seals: 0,
};

function familySpec(engine: Engine) {
  return ENGINE_FAMILIES.find((f) => f.family === engine.family) ?? ENGINE_FAMILIES[0]!;
}

/** Annualised engine flight hours and fuel burn, from the sectors this engine flew. */
function annualisedBurn(engine: Engine) {
  const data = getDataset();
  const flights = engine.aircraftId ? data.flights.filter((f) => f.aircraftId === engine.aircraftId) : [];
  if (flights.length === 0) return { annualEfh: 0, annualFuelKg: 0, sectors: 0 };
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const engineCount = Math.max(1, aircraft?.engineIds.length ?? 2);
  const windowDays = 45;
  const hours = flights.reduce((sum, f) => sum + f.blockHours, 0);
  const fuel = flights.reduce((sum, f) => sum + f.fuelBurnKg, 0) / engineCount;
  const scale = 365 / windowDays;
  return { annualEfh: Math.round(hours * scale), annualFuelKg: Math.round(fuel * scale), sectors: flights.length };
}

function lastWashFor(engine: Engine): WashEvent | null {
  const rng = createRng(`${engine.id}:wash`);
  // Engines fresh out of overhaul are effectively just washed; the rest are on an
  // opportunistic wash cycle driven by how dirty their routes are.
  if (engine.lifeStage === "in-shop") return null;
  if (!rand.bool(rng, 0.82)) return null;
  const interval = 340 - engine.environmentSeverity * 34;
  const days = rand.int(rng, 25, Math.max(60, interval + 220));
  const kind = rand.bool(rng, 0.78) ? "on-wing water wash" : "off-wing core wash";
  return {
    at: iso(daysAgo(days)),
    kind,
    egtRecoveredC: round(rand.float(rng, 4, 14), 1),
    fuelRecoveredPct: round(rand.float(rng, 0.25, 1.1), 2),
    downtimeHours: kind === "on-wing water wash" ? rand.int(rng, 4, 9) : rand.int(rng, 18, 34),
    costUsd: kind === "on-wing water wash" ? rand.int(rng, 3_200, 7_400) : rand.int(rng, 14_000, 26_000),
  };
}

function attributionFor(engine: Engine, totalDeviationPct: number, daysSinceWash: number | null): DeteriorationSlice[] {
  const rng = createRng(`${engine.id}:attribution`);
  const spec = familySpec(engine);
  const coreLife = clamp(engine.cyclesSinceOverhaul / spec.overhaulIntervalCycles, 0, 1.2);
  // Fouling accumulates with dirty air and time on wing since the last wash.
  const foulingWeight =
    0.22 + engine.environmentSeverity * 0.06 + Math.min(0.35, (daysSinceWash ?? 420) / 1400) + rand.float(rng, -0.03, 0.03);
  const hotWeight = 0.24 + coreLife * 0.26 + rand.float(rng, -0.03, 0.03);
  const sealWeight = 0.16 + coreLife * 0.14 + rand.float(rng, -0.03, 0.03);
  const total = foulingWeight + hotWeight + sealWeight;
  const weights: Record<DeteriorationSlice["cause"], number> = {
    fouling: foulingWeight / total,
    "hot-section": hotWeight / total,
    seals: sealWeight / total,
  };
  return (Object.keys(weights) as DeteriorationSlice["cause"][]).map((cause) => ({
    cause,
    label: CAUSE_LABELS[cause],
    deviationPct: round(totalDeviationPct * weights[cause], 3),
    share: round(weights[cause], 3),
    recoverableFraction: RECOVERABLE[cause],
  }));
}

function sfcTrendFor(engine: Engine, current: number, lastWash: WashEvent | null): Point[] {
  const rng = createRng(`${engine.id}:sfc-trend`);
  const months = 24;
  const washMonthsAgo = lastWash ? (NOW.getTime() - new Date(lastWash.at).getTime()) / 86_400_000 / 30.4 : null;
  const points: Point[] = [];
  // Walk backwards from today's deviation, undoing drift and the wash step.
  let value = current;
  const drift = Math.max(0.008, current / 44);
  for (let i = 0; i <= months; i += 1) {
    points.push({ t: iso(addDays(NOW, -i * 30)), v: round(Math.max(0.05, value), 2) });
    value -= drift + rand.gaussian(rng, 0, 0.012);
    if (lastWash && washMonthsAgo !== null && i === Math.round(washMonthsAgo)) value += lastWash.fuelRecoveredPct;
  }
  return points.reverse();
}

function washCaseFor(
  engine: Engine,
  attribution: DeteriorationSlice[],
  annualFuelKg: number,
  deviationPct: number,
): WashCase {
  const rng = createRng(`${engine.id}:wash-case`);
  const data = getDataset();
  const contract = data.contracts.find((c) => c.operatorId === engine.operatorId);
  const recoveredPct = round(
    attribution.reduce((sum, slice) => sum + slice.deviationPct * slice.recoverableFraction, 0),
    3,
  );
  // Baseline burn is today's burn stripped of the deviation.
  const baselineFuelKg = annualFuelKg / (1 + deviationPct / 100);
  const fuelSavedKgPerYear = Math.round(baselineFuelKg * (recoveredPct / 100));
  const fuelSavedUsdPerYear = Math.round(fuelSavedKgPerYear * PERFORMANCE_THRESHOLDS.jetFuelUsdPerKg);
  const co2SavedTonnesPerYear = round((fuelSavedKgPerYear * PERFORMANCE_THRESHOLDS.co2KgPerFuelKg) / 1000, 1);
  const egtMarginRecoveredC = round(recoveredPct * rand.float(rng, 8, 12), 1);

  const downtimeHours = rand.int(rng, 5, 10);
  const washCostUsd = rand.int(rng, 3_400, 7_600);
  // Lost availability priced at the contract rate for the hours the engine is off line.
  const utilisationPerDay = 0.42;
  const downtimeCostUsd = Math.round(downtimeHours * utilisationPerDay * (contract?.ratePerEfhUsd ?? 280));
  const totalCostUsd = washCostUsd + downtimeCostUsd;
  const netBenefitUsdPerYear = fuelSavedUsdPerYear - totalCostUsd;
  const paybackDays = fuelSavedUsdPerYear > 0 ? Math.round((totalCostUsd / fuelSavedUsdPerYear) * 365) : null;

  let recommendation: WashCase["recommendation"];
  let status: StatusLevel;
  let rationale: string;
  if (paybackDays !== null && paybackDays <= 45 && recoveredPct >= 0.4) {
    recommendation = "wash-now";
    status = "red";
    rationale = `Recovers ${recoveredPct.toFixed(2)}pp of fuel burn and pays back in ${paybackDays} days — book the next line slot.`;
  } else if (paybackDays !== null && paybackDays <= 150 && recoveredPct >= 0.2) {
    recommendation = "schedule";
    status = "amber";
    rationale = `Worthwhile at the next planned ground event: ${paybackDays}-day payback, ${downtimeHours}h off line.`;
  } else if (netBenefitUsdPerYear > 0) {
    recommendation = "monitor";
    status = "green";
    rationale = "Marginal gain — keep on trend watch and revisit after the next 200 cycles.";
  } else {
    recommendation = "not-worthwhile";
    // Green, not grey: grey is reserved for "no data", and this is a data-backed
    // verdict that no wash action is needed.
    status = "green";
    rationale = "Deterioration is hardware-driven; washing would not repay the downtime.";
  }

  return {
    engineId: engine.id,
    fuelRecoveredPct: recoveredPct,
    egtMarginRecoveredC,
    fuelSavedKgPerYear,
    fuelSavedUsdPerYear,
    co2SavedTonnesPerYear,
    washCostUsd,
    downtimeHours,
    downtimeCostUsd,
    totalCostUsd,
    netBenefitUsdPerYear,
    paybackDays,
    recommendation,
    status,
    rationale,
  };
}

function performanceFor(engine: Engine): EnginePerformance {
  const data = getDataset();
  const spec = familySpec(engine);
  const rng = createRng(`${engine.id}:performance`);
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = engine.aircraftId ? data.aircraft.find((a) => a.id === engine.aircraftId) : undefined;

  const lastWash = lastWashFor(engine);
  const daysSinceWash = lastWash ? Math.round((NOW.getTime() - new Date(lastWash.at).getTime()) / 86_400_000) : null;

  // Lost EGT margin is the primary observable of core deterioration; fuel burn
  // rises roughly linearly with it, aggravated by dirty operating environments.
  const marginLost = clamp(1 - engine.egtMargin / spec.newEgtMargin, 0, 1);
  const foulingLoad = Math.min(1, (daysSinceWash ?? 420) / 900) * (0.4 + engine.environmentSeverity * 0.12);
  const fuelFlowDeviationPct = round(
    clamp(marginLost * 3.1 + foulingLoad * 1.1 + rand.gaussian(rng, 0, 0.12), 0.08, 6.5),
    2,
  );
  const sfcDeviationPct = round(clamp(fuelFlowDeviationPct * rand.float(rng, 0.86, 0.98), 0.05, 6.5), 2);
  const cruiseRetentionPct = round(clamp(100 - sfcDeviationPct * 1.15, 88, 100), 1);

  const { annualEfh, annualFuelKg } = annualisedBurn(engine);
  const annualFuelPenaltyKg = Math.round((annualFuelKg / (1 + sfcDeviationPct / 100)) * (sfcDeviationPct / 100));
  const annualFuelPenaltyUsd = Math.round(annualFuelPenaltyKg * PERFORMANCE_THRESHOLDS.jetFuelUsdPerKg);
  const annualCo2PenaltyTonnes = round((annualFuelPenaltyKg * PERFORMANCE_THRESHOLDS.co2KgPerFuelKg) / 1000, 1);

  const attribution = attributionFor(engine, sfcDeviationPct, daysSinceWash);
  const washCase = washCaseFor(engine, attribution, annualFuelKg, sfcDeviationPct);

  const hasData = annualEfh > 0;
  const status: StatusLevel = !hasData
    ? "grey"
    : sfcDeviationPct >= PERFORMANCE_THRESHOLDS.redSfcDeviationPct
      ? "red"
      : sfcDeviationPct >= PERFORMANCE_THRESHOLDS.amberSfcDeviationPct
        ? "amber"
        : "green";
  const statusReason = !hasData
    ? "No recent sectors — engine is off wing, so no cruise performance data."
    : status === "red"
      ? `SFC is ${sfcDeviationPct.toFixed(2)}% above baseline, past the ${PERFORMANCE_THRESHOLDS.redSfcDeviationPct}% action limit, costing ${Math.round(annualFuelPenaltyUsd / 1000)}k USD a year.`
      : status === "amber"
        ? `SFC is ${sfcDeviationPct.toFixed(2)}% above baseline, past the ${PERFORMANCE_THRESHOLDS.amberSfcDeviationPct}% watch limit.`
        : `SFC is within ${PERFORMANCE_THRESHOLDS.amberSfcDeviationPct}% of baseline.`;

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    operatorCode: operator?.code ?? "—",
    operatorName: operator?.name ?? "Unassigned",
    aircraftTail: aircraft?.tail ?? null,
    location: engine.location,
    fuelFlowDeviationPct,
    sfcDeviationPct,
    cruiseRetentionPct,
    egtMargin: engine.egtMargin,
    annualEfh,
    annualFuelKg,
    annualFuelPenaltyKg,
    annualFuelPenaltyUsd,
    annualCo2PenaltyTonnes,
    attribution,
    lastWash,
    daysSinceWash,
    washCase,
    status,
    statusReason,
    environmentSeverity: engine.environmentSeverity,
    sfcTrend: sfcTrendFor(engine, sfcDeviationPct, lastWash),
  };
}

let cache: EnginePerformance[] | null = null;

/** Fuel-burn performance for every managed engine, ranked worst first. */
export function getFleetPerformance(): EnginePerformance[] {
  if (!cache) {
    cache = getDataset()
      .engines.map(performanceFor)
      .sort((a, b) => b.annualFuelPenaltyUsd - a.annualFuelPenaltyUsd);
  }
  return cache;
}

export function getEnginePerformance(engineId: string): EnginePerformance | undefined {
  return getFleetPerformance().find((p) => p.engineId === engineId || p.esn === engineId);
}

/** Wash candidates ordered by the money a wash returns, best first. */
export function getWashCandidates(limit = 6): EnginePerformance[] {
  return getFleetPerformance()
    .filter((p) => p.washCase.recommendation === "wash-now" || p.washCase.recommendation === "schedule")
    .sort((a, b) => b.washCase.netBenefitUsdPerYear - a.washCase.netBenefitUsdPerYear)
    .slice(0, limit);
}

export function getFleetPerformanceSummary(): FleetPerformanceSummary {
  const fleet = getFleetPerformance();
  const withData = fleet.filter((p) => p.status !== "grey");
  const programme = fleet.filter(
    (p) => p.washCase.recommendation === "wash-now" || p.washCase.recommendation === "schedule",
  );
  const totals: Record<DeteriorationSlice["cause"], number> = { fouling: 0, "hot-section": 0, seals: 0 };
  for (const engine of withData) {
    for (const slice of engine.attribution) totals[slice.cause] += slice.deviationPct;
  }
  const totalDeviation = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  const recoverableFuelKg = fleet.reduce((s, p) => s + p.washCase.fuelSavedKgPerYear, 0);

  return {
    engines: fleet.length,
    meanSfcDeviationPct: round(
      withData.reduce((s, p) => s + p.sfcDeviationPct, 0) / Math.max(1, withData.length),
      2,
    ),
    annualFuelPenaltyUsd: fleet.reduce((s, p) => s + p.annualFuelPenaltyUsd, 0),
    annualCo2PenaltyTonnes: Math.round(fleet.reduce((s, p) => s + p.annualCo2PenaltyTonnes, 0)),
    recoverableUsd: fleet.reduce((s, p) => s + p.washCase.fuelSavedUsdPerYear, 0),
    recoverableCo2Tonnes: Math.round((recoverableFuelKg * PERFORMANCE_THRESHOLDS.co2KgPerFuelKg) / 1000),
    recoverableFuelKg,
    washNow: fleet.filter((p) => p.washCase.recommendation === "wash-now").length,
    schedule: fleet.filter((p) => p.washCase.recommendation === "schedule").length,
    monitor: fleet.filter((p) => p.washCase.recommendation === "monitor").length,
    noData: fleet.filter((p) => p.status === "grey").length,
    attribution: (Object.keys(totals) as DeteriorationSlice["cause"][]).map((cause) => ({
      cause,
      label: CAUSE_LABELS[cause],
      deviationPct: round(totals[cause] / Math.max(1, withData.length), 3),
      share: round(totals[cause] / totalDeviation, 3),
      recoverableFraction: RECOVERABLE[cause],
    })),
    programmeNetBenefitUsd: programme.reduce((s, p) => s + p.washCase.netBenefitUsdPerYear, 0),
    programmeDowntimeHours: programme.reduce((s, p) => s + p.washCase.downtimeHours, 0),
    programmeCostUsd: programme.reduce((s, p) => s + p.washCase.totalCostUsd, 0),
  };
}

/** SFC deviation history as a chartable series, with the action limits attached. */
export function getSfcSeries(engineId: string): Series | undefined {
  const performance = getEnginePerformance(engineId);
  if (!performance) return undefined;
  return {
    id: `${performance.engineId}:sfc-deviation`,
    label: "SFC deviation vs baseline",
    unit: "%",
    points: performance.sfcTrend,
    amberThreshold: PERFORMANCE_THRESHOLDS.amberSfcDeviationPct,
    redThreshold: PERFORMANCE_THRESHOLDS.redSfcDeviationPct,
  };
}

/** Fleet fuel-burn penalty aggregated by operator, worst first. */
export function getOperatorFuelPenalty() {
  const data = getDataset();
  const fleet = getFleetPerformance();
  return data.operators
    .map((operator) => {
      const engines = fleet.filter((p) => p.operatorId === operator.id);
      const withData = engines.filter((p) => p.status !== "grey");
      return {
        operatorId: operator.id,
        code: operator.code,
        name: operator.name,
        region: operator.region,
        engines: engines.length,
        meanSfcDeviationPct: round(
          withData.reduce((s, p) => s + p.sfcDeviationPct, 0) / Math.max(1, withData.length),
          2,
        ),
        annualFuelPenaltyUsd: engines.reduce((s, p) => s + p.annualFuelPenaltyUsd, 0),
        annualCo2PenaltyTonnes: Math.round(engines.reduce((s, p) => s + p.annualCo2PenaltyTonnes, 0)),
        recoverableUsd: engines.reduce((s, p) => s + p.washCase.fuelSavedUsdPerYear, 0),
        washNow: engines.filter((p) => p.washCase.recommendation === "wash-now").length,
      };
    })
    .sort((a, b) => b.annualFuelPenaltyUsd - a.annualFuelPenaltyUsd);
}
