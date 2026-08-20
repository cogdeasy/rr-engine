/**
 * Contracts & TotalCare selectors.
 *
 * Everything here is derived from the generated fleet (engines, flights, work
 * orders, alerts) plus the contract register, so the commercial view always
 * reconciles with the engineering view. Concepts the base dataset does not
 * carry — liquidated damages rates, guaranteed shop visit rates, monthly
 * availability history — are generated deterministically from the contract id.
 */

import type {
  BreachDriver,
  Contract,
  ContractBreachRisk,
  ContractFinancials,
  ContractGuarantee,
  ContractPerformance,
  ContractPortfolioSummary,
  ContractPosition,
  EngineFamily,
  Point,
  StatusLevel,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { clamp, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

const MS_PER_DAY = 86_400_000;
/** Window over which the dataset raises work orders; used to annualise observed cost. */
const WORK_ORDER_WINDOW_DAYS = 120;
const CYCLES_PER_YEAR = 620;
/** Plausible band for annual utilisation of a single engine, in flight hours. */
const MIN_ANNUAL_EFH_PER_ENGINE = 1_500;
const MAX_ANNUAL_EFH_PER_ENGINE = 5_200;

function statusFromGap(gapPts: number): StatusLevel {
  if (gapPts <= -0.5) return "red";
  if (gapPts < 0.15) return "amber";
  return "green";
}

function monthlyHistory(seed: string, latest: number, months: number, spread: number, drift: number): Point[] {
  const rng = createRng(seed);
  const points: Point[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const value = latest - drift * i + rand.gaussian(rng, 0, spread);
    points.push({ t: iso(daysAgo(i * 30)), v: round(value, 2) });
  }
  return points;
}

/**
 * Annualised engine flight hours for a contract. Utilisation per engine is its
 * lifetime hours over the years its airframe has been in service, bounded to a
 * plausible band (the flight log is a sample of sectors, not the full log).
 */
function annualEfhFor(contract: Contract): number {
  const data = getDataset();
  const covered = new Set(contract.coveredEngineIds);
  const engines = data.engines.filter((e) => covered.has(e.id));
  const efh = engines.reduce((sum, engine) => {
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const yearsInService = aircraft
      ? Math.max(1, (NOW.getTime() - new Date(aircraft.deliveredAt).getTime()) / (MS_PER_DAY * 365))
      : 6;
    return sum + clamp(engine.totalFlightHours / yearsInService, MIN_ANNUAL_EFH_PER_ENGINE, MAX_ANNUAL_EFH_PER_ENGINE);
  }, 0);
  return Math.round(efh);
}

function performanceFor(contract: Contract): ContractPerformance {
  const data = getDataset();
  const rng = createRng(`${contract.id}:performance`);
  const covered = new Set(contract.coveredEngineIds);
  const engines = data.engines.filter((e) => covered.has(e.id));
  const enginesRed = engines.filter((e) => e.status === "red").length;
  const enginesAmber = engines.filter((e) => e.status === "amber").length;

  const drift = round((contract.availabilityActual - contract.availabilityTarget) * 0.06, 3);
  const availabilityHistory = monthlyHistory(`${contract.id}:avail`, contract.availabilityActual, 12, 0.28, drift).map(
    (p) => ({ t: p.t, v: round(clamp(p.v, 88, 100), 2) }),
  );
  const recent = availabilityHistory.slice(-3);
  const quarterToDate = round(recent.reduce((s, p) => s + p.v, 0) / recent.length, 2);
  const slope = round(
    (availabilityHistory[availabilityHistory.length - 1]!.v - availabilityHistory[availabilityHistory.length - 4]!.v) / 3,
    3,
  );
  const projectedQuarterEnd = round(clamp(quarterToDate + slope * 2, 88, 100), 2);

  const dispatchTarget = rand.pick(rng, [99.2, 99.4, 99.5]);
  const dispatchPenalty = enginesRed * 0.06 + enginesAmber * 0.012;
  const dispatchReliability = round(clamp(99.92 - dispatchPenalty + rand.gaussian(rng, 0, 0.06), 97.5, 99.98), 2);

  const workOrders = data.workOrders.filter((w) => covered.has(w.engineId));
  const aogEvents = workOrders.filter((w) => w.type === "aog-recovery").length;
  const unscheduledRemovals = workOrders.filter(
    (w) => (w.type === "module-swap" || w.type === "shop-visit") && w.priority !== "low" && w.state !== "complete",
  ).length;
  const engineDaysDown = workOrders
    .filter((w) => w.state === "in-progress" || w.state === "awaiting-parts")
    .reduce((s, w) => s + w.tatDays, 0);

  return {
    availabilityTarget: contract.availabilityTarget,
    availabilityActual: contract.availabilityActual,
    quarterToDate,
    projectedQuarterEnd,
    projectedGapPts: round(projectedQuarterEnd - contract.availabilityTarget, 2),
    dispatchTarget,
    dispatchReliability,
    availabilityHistory,
    dispatchHistory: monthlyHistory(`${contract.id}:dispatch`, dispatchReliability, 12, 0.08, -0.01).map((p) => ({
      t: p.t,
      v: round(clamp(p.v, 97, 100), 2),
    })),
    engineDaysDown,
    aogEvents,
    unscheduledRemovals,
    enginesRed,
    enginesAmber,
  };
}

function financialsFor(contract: Contract, performance: ContractPerformance): ContractFinancials {
  const data = getDataset();
  const rng = createRng(`${contract.id}:financials`);
  const covered = new Set(contract.coveredEngineIds);
  const engines = data.engines.filter((e) => covered.has(e.id));
  const annualEfh = annualEfhFor(contract);

  const yearsElapsed = Math.max(0.25, (NOW.getTime() - new Date(contract.startsAt).getTime()) / (MS_PER_DAY * 365));
  const yearsRemaining = Math.max(0, (new Date(contract.endsAt).getTime() - NOW.getTime()) / (MS_PER_DAY * 365));

  const revenueAccruedUsd = Math.round(annualEfh * contract.ratePerEfhUsd * yearsElapsed);

  // Cost is put on the same footing as revenue: the dataset only raises work
  // orders over a short recent window, so line maintenance is annualised from
  // that window, while shop visits — a once-per-overhaul-interval event — are
  // amortised across the interval they buy, as a TotalCare accrual would be.
  const workOrders = data.workOrders.filter((w) => covered.has(w.engineId) && w.state !== "cancelled");
  const costOf = (w: (typeof workOrders)[number]) => w.actualCostUsd ?? w.estimatedCostUsd;
  const lineCostRunRate =
    workOrders.filter((w) => w.type !== "shop-visit").reduce((s, w) => s + costOf(w), 0) /
    (WORK_ORDER_WINDOW_DAYS / 365);
  const overhaulIntervalYears =
    engines.reduce(
      (s, e) => s + (ENGINE_FAMILIES.find((f) => f.family === e.family)?.overhaulIntervalCycles ?? 5000) / CYCLES_PER_YEAR,
      0,
    ) / Math.max(1, engines.length);
  const shopVisitCostRunRate =
    workOrders.filter((w) => w.type === "shop-visit").reduce((s, w) => s + costOf(w), 0) /
    Math.max(1, overhaulIntervalYears);
  const annualCostRunRate = lineCostRunRate + shopVisitCostRunRate;
  const maintenanceCostUsd = Math.round(annualCostRunRate * yearsElapsed);
  const marginUsd = revenueAccruedUsd - maintenanceCostUsd;

  // Shop visits still to come inside the remaining term: engines whose predicted
  // remaining life is consumed before the contract ends.
  const forecastShopVisits = engines.filter((e) => e.rulCycles <= CYCLES_PER_YEAR * yearsRemaining).length;
  const shopVisitUnitCost = rand.int(rng, 4_200_000, 7_800_000);
  const forecastShopVisitCostUsd = forecastShopVisits * shopVisitUnitCost;

  const ldPerTenthPtUsd = rand.int(rng, 60_000, 240_000) * (contract.kind === "TotalCare" ? 1.4 : 1);
  const shortfallPts = Math.max(0, -performance.projectedGapPts);
  const quartersRemaining = Math.max(1, Math.round(yearsRemaining * 4));
  const projectedPenaltiesUsd = Math.round(
    contract.penaltiesUsd + (shortfallPts / 0.1) * ldPerTenthPtUsd * Math.min(4, quartersRemaining),
  );

  const projectedRevenueUsd = Math.round(revenueAccruedUsd + annualEfh * contract.ratePerEfhUsd * yearsRemaining);
  const projectedCostUsd = Math.round(
    maintenanceCostUsd + annualCostRunRate * yearsRemaining * 0.55 + forecastShopVisitCostUsd,
  );
  const projectedMarginUsd = projectedRevenueUsd - projectedCostUsd - projectedPenaltiesUsd;

  return {
    annualEfh,
    revenueAccruedUsd,
    maintenanceCostUsd,
    marginUsd,
    marginPct: round((marginUsd / Math.max(1, revenueAccruedUsd)) * 100, 1),
    costPerEfhUsd: round(maintenanceCostUsd / Math.max(1, annualEfh * yearsElapsed), 2),
    penaltiesAccruedUsd: contract.penaltiesUsd,
    ldPerTenthPtUsd: Math.round(ldPerTenthPtUsd),
    projectedPenaltiesUsd,
    projectedRevenueUsd,
    projectedCostUsd,
    projectedMarginUsd,
    projectedMarginPct: round((projectedMarginUsd / Math.max(1, projectedRevenueUsd)) * 100, 1),
    forecastShopVisits,
    forecastShopVisitCostUsd,
  };
}

function guaranteeStatus(guarantee: Omit<ContractGuarantee, "status" | "headroomPct">): ContractGuarantee {
  const { guaranteed, actual, direction } = guarantee;
  const headroomPct =
    direction === "higher-is-worse"
      ? round(((guaranteed - actual) / Math.abs(guaranteed || 1)) * 100, 1)
      : round(((actual - guaranteed) / Math.abs(guaranteed || 1)) * 100, 1);
  const status: StatusLevel = headroomPct < 0 ? "red" : headroomPct < 6 ? "amber" : "green";
  return { ...guarantee, headroomPct, status };
}

function guaranteesFor(contract: Contract, financials: ContractFinancials, performance: ContractPerformance): ContractGuarantee[] {
  const data = getDataset();
  const rng = createRng(`${contract.id}:guarantees`);
  const covered = new Set(contract.coveredEngineIds);
  const engines = data.engines.filter((e) => covered.has(e.id));

  const shopVisits = data.workOrders.filter((w) => covered.has(w.engineId) && w.type === "shop-visit").length;
  const svrActual = round(shopVisits / Math.max(1, financials.annualEfh / 1000), 2);
  const svrGuaranteed = round(svrActual * rand.float(rng, 0.78, 1.22), 2);

  const familySpecs = engines.map((e) => ENGINE_FAMILIES.find((f) => f.family === e.family));
  const guaranteedOnWing = Math.round(
    familySpecs.reduce((s, f) => s + (f?.overhaulIntervalCycles ?? 5000), 0) / Math.max(1, familySpecs.length),
  );
  const actualOnWing = Math.round(
    engines.reduce((s, e) => s + e.cyclesSinceOverhaul + e.rulCycles, 0) / Math.max(1, engines.length),
  );

  const egtGuaranteed = round(rand.float(rng, 14, 24), 1);
  const egtActual = round(engines.reduce((s, e) => s + e.egtMargin, 0) / Math.max(1, engines.length), 1);

  return [
    guaranteeStatus({
      id: `${contract.id}-svr`,
      label: "Shop visit rate",
      unit: "/1000 EFH",
      guaranteed: svrGuaranteed,
      actual: svrActual,
      direction: "higher-is-worse",
      basis: `${shopVisits} shop visits against ${Math.round(financials.annualEfh / 1000)}k annual EFH`,
    }),
    guaranteeStatus({
      id: `${contract.id}-owl`,
      label: "On-wing life",
      unit: "cycles",
      guaranteed: guaranteedOnWing,
      actual: actualOnWing,
      direction: "lower-is-worse",
      basis: `Mean achieved interval across ${engines.length} covered engines`,
    }),
    guaranteeStatus({
      id: `${contract.id}-egt`,
      label: "EGT margin retention",
      unit: "°C",
      guaranteed: egtGuaranteed,
      actual: egtActual,
      direction: "lower-is-worse",
      basis: "Fleet mean margin at contract mid-life checkpoint",
    }),
    guaranteeStatus({
      id: `${contract.id}-dispatch`,
      label: "Dispatch reliability",
      unit: "%",
      guaranteed: performance.dispatchTarget,
      actual: performance.dispatchReliability,
      direction: "lower-is-worse",
      basis: "Rolling 12-month technical dispatch, covered fleet",
    }),
  ];
}

function breachRiskFor(
  contract: Contract,
  performance: ContractPerformance,
  financials: ContractFinancials,
  guarantees: ContractGuarantee[],
): ContractBreachRisk {
  const gap = performance.projectedGapPts;
  const drivers: BreachDriver[] = [];

  if (gap < 0) {
    drivers.push({
      label: "Availability shortfall",
      detail: `Projected ${performance.projectedQuarterEnd.toFixed(2)}% against a ${contract.availabilityTarget.toFixed(1)}% commitment (${gap.toFixed(2)} pts)`,
      status: gap <= -0.5 ? "red" : "amber",
    });
  }
  if (performance.enginesRed > 0) {
    drivers.push({
      label: "Engines flagged red",
      detail: `${performance.enginesRed} covered engine${performance.enginesRed === 1 ? "" : "s"} require action now`,
      status: performance.enginesRed > 2 ? "red" : "amber",
    });
  }
  if (performance.engineDaysDown > 60) {
    drivers.push({
      label: "Engine-days down",
      detail: `${performance.engineDaysDown} engine-days committed to in-progress or parts-held work`,
      status: performance.engineDaysDown > 140 ? "red" : "amber",
    });
  }
  if (performance.aogEvents > 0) {
    drivers.push({
      label: "AOG recovery",
      detail: `${performance.aogEvents} AOG recovery event${performance.aogEvents === 1 ? "" : "s"} on covered engines`,
      status: "red",
    });
  }
  const breachedGuarantees = guarantees.filter((g) => g.status === "red");
  if (breachedGuarantees.length > 0) {
    drivers.push({
      label: "Guarantee breached",
      detail: breachedGuarantees.map((g) => g.label).join(", "),
      status: "red",
    });
  }
  if (financials.forecastShopVisits > 0) {
    drivers.push({
      label: "Shop visit bow wave",
      detail: `${financials.forecastShopVisits} shop visit${financials.forecastShopVisits === 1 ? "" : "s"} due before term end`,
      status: financials.forecastShopVisits > 3 ? "amber" : "green",
    });
  }

  const score = Math.round(
    clamp(
      Math.max(0, -gap) * 55 +
        performance.enginesRed * 7 +
        performance.enginesAmber * 1.5 +
        performance.aogEvents * 9 +
        breachedGuarantees.length * 8 +
        Math.min(18, performance.engineDaysDown / 12),
      0,
      100,
    ),
  );
  const status: StatusLevel = score >= 55 || gap <= -0.5 ? "red" : score >= 25 || gap < 0.15 ? "amber" : "green";

  const recommendedAction =
    status === "red"
      ? performance.enginesRed > 0
        ? `Pull forward ${Math.min(performance.enginesRed, 2)} removal${performance.enginesRed === 1 ? "" : "s"} into the spare engine pool and re-baseline the quarter`
        : "Deploy a lease engine against the shortfall and open an LD mitigation case with the customer"
      : status === "amber"
        ? "Hold weekly availability review with the operator and protect spare cover for the quarter"
        : "No action — maintain current maintenance plan and quarterly reporting cadence";

  return {
    status,
    score,
    headline:
      status === "red"
        ? `Breaching by ${Math.abs(gap).toFixed(2)} pts — ${formatShortUsd(financials.projectedPenaltiesUsd)} LD exposure`
        : status === "amber"
          ? `Within ${Math.abs(gap).toFixed(2)} pts of the commitment`
          : `${gap.toFixed(2)} pts of headroom against commitment`,
    drivers: drivers.slice(0, 4),
    recommendedAction,
    actionOwner: status === "green" ? "Customer business manager" : "Fleet availability controller",
  };
}

function formatShortUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

let positionsCache: ContractPosition[] | undefined;

/** The full commercial position for every contract in the register. */
export function contractPositions(): ContractPosition[] {
  if (positionsCache) return positionsCache;
  const data = getDataset();
  positionsCache = data.contracts
    .map((contract) => {
      const operator = data.operators.find((o) => o.id === contract.operatorId)!;
      const covered = new Set(contract.coveredEngineIds);
      const engines = data.engines.filter((e) => covered.has(e.id));
      const families = [...new Set(engines.map((e) => e.family))] as EngineFamily[];
      const aircraft = data.aircraft.filter((a) => a.engineIds.some((id) => covered.has(id)));

      const performance = performanceFor(contract);
      const financials = financialsFor(contract, performance);
      const guarantees = guaranteesFor(contract, financials, performance);
      const breachRisk = breachRiskFor(contract, performance, financials, guarantees);

      const startMs = new Date(contract.startsAt).getTime();
      const endMs = new Date(contract.endsAt).getTime();
      const termRemainingDays = Math.max(0, Math.round((endMs - NOW.getTime()) / MS_PER_DAY));

      return {
        contract,
        operator,
        coveredEngines: engines.length,
        coveredAircraft: aircraft.length,
        families,
        termEndsAt: contract.endsAt,
        termRemainingDays,
        termElapsedPct: round(clamp(((NOW.getTime() - startMs) / (endMs - startMs)) * 100, 0, 100), 1),
        performance,
        financials,
        guarantees,
        breachRisk,
        status: breachRisk.status,
      } satisfies ContractPosition;
    })
    .sort((a, b) => b.breachRisk.score - a.breachRisk.score);
  return positionsCache;
}

export function contractPosition(contractId: string): ContractPosition | undefined {
  return contractPositions().find((p) => p.contract.id === contractId);
}

/** Contracts whose projected quarter-end availability is at or below commitment. */
export function contractsAtRisk(): ContractPosition[] {
  return contractPositions().filter((p) => p.status !== "green");
}

export function contractPortfolioSummary(): ContractPortfolioSummary {
  const positions = contractPositions();
  const coveredEngines = positions.reduce((s, p) => s + p.coveredEngines, 0);
  const weight = (p: ContractPosition) => p.coveredEngines / Math.max(1, coveredEngines);
  const revenueAccruedUsd = positions.reduce((s, p) => s + p.financials.revenueAccruedUsd, 0);
  const marginUsd = positions.reduce((s, p) => s + p.financials.marginUsd, 0);

  return {
    contracts: positions.length,
    coveredEngines,
    atRisk: positions.filter((p) => p.status === "amber").length,
    breaching: positions.filter((p) => p.status === "red").length,
    weightedAvailability: round(
      positions.reduce((s, p) => s + p.performance.quarterToDate * weight(p), 0),
      2,
    ),
    weightedCommitment: round(
      positions.reduce((s, p) => s + p.contract.availabilityTarget * weight(p), 0),
      2,
    ),
    penaltiesAccruedUsd: positions.reduce((s, p) => s + p.financials.penaltiesAccruedUsd, 0),
    projectedPenaltiesUsd: positions.reduce((s, p) => s + p.financials.projectedPenaltiesUsd, 0),
    revenueAccruedUsd,
    marginPct: round((marginUsd / Math.max(1, revenueAccruedUsd)) * 100, 1),
    annualEfh: positions.reduce((s, p) => s + p.financials.annualEfh, 0),
    guaranteesBreached: positions.reduce((s, p) => s + p.guarantees.filter((g) => g.status === "red").length, 0),
  };
}

export { statusFromGap as contractAvailabilityStatus };
