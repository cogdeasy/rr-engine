/**
 * Cost analytics selectors.
 *
 * Everything here is derived from the generated fleet: flights give utilisation,
 * work orders and task cards give maintenance activity, LLP status and the part
 * catalogue give life-limited part consumption, contracts give penalties.
 *
 * Accounting convention (the same one TotalCare-style contracts use):
 *
 *  - Heavy maintenance is accrued across the interval it buys. Each engine's
 *    achieved interval is `cyclesSinceOverhaul + rulCycles`, so a deteriorating
 *    engine accrues a higher rate than a healthy one of the same family.
 *  - Life-limited parts are accrued per cycle at `unit cost / cyclic limit`.
 *  - Line, base and on-wing work orders are taken as the annual run rate.
 *  - Availability penalties are accrued against the operator that earned them.
 *
 * Utilisation: the flight table is a 45-day sample, so per-engine hours are
 * annualised from it and then normalised so the fleet mean matches the
 * widebody planning assumption of `FLEET_ANNUAL_EFH` hours per engine per year.
 */

import type {
  AircraftType,
  CostAction,
  CostAnalytics,
  CostBreakdown,
  CostBridgeStep,
  CostCategory,
  CostDriver,
  CostForecastPoint,
  CostMonth,
  CostPeriod,
  Engine,
  EngineFamily,
  ModuleCode,
  OperatorCostRow,
  Point,
  Region,
  StatusLevel,
} from "@rr/types";
import { COST_CATEGORIES } from "@rr/types";
import { ENGINE_FAMILIES, ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { clamp, createRng, iso, NOW, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Planning constants                                                  */
/* ------------------------------------------------------------------ */

/** Fleet-mean utilisation assumption for a managed widebody engine. */
const FLEET_ANNUAL_EFH = 3_800;
const FLIGHT_SAMPLE_DAYS = 45;
const MONTHS_OF_HISTORY = 24;
const PERIOD_MONTHS = 3;
/** Planned escalation applied to last year's actuals to set this year's budget. */
const BUDGET_ESCALATION = 0.025;
const TOLERANCE_AMBER_PCT = 3;
const TOLERANCE_RED_PCT = 6;

/** Fully-burdened labour rate by region of the performing facility, USD/hour. */
const LABOUR_RATE_BY_REGION: Record<Region, number> = {
  Europe: 118,
  "North America": 132,
  "Middle East": 96,
  "Asia Pacific": 88,
  "Greater China": 79,
  Africa: 84,
  "South America": 87,
};

/** Engine shipping, cradles, customs and AOG logistics per heavy event. */
const TRANSPORT_PER_HEAVY_EVENT_USD = 145_000;
/** Split of a shop visit that is not life-limited hardware. */
const HEAVY_LABOUR_SHARE = 0.36;

/** Operator disruption cost of a grounded aircraft, USD/day. */
const DISRUPTION_COST_BY_TYPE: Record<AircraftType, number> = {
  "A350-900": 340_000,
  "A350-1000": 385_000,
  "B787-8": 265_000,
  "B787-9": 300_000,
  "B787-10": 320_000,
  "A330-900neo": 240_000,
  "A380-800": 520_000,
};

const MONTHLY_DRIFT: Record<CostCategory, number> = {
  labour: 0.0035,
  materials: 0.0045,
  llp: 0.0072,
  transport: 0.0018,
  penalties: 0.0055,
};

const HEAVY_TYPES = new Set(["shop-visit", "module-swap"]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function emptyBreakdown(): CostBreakdown {
  return { labour: 0, materials: 0, llp: 0, transport: 0, penalties: 0 };
}

function addBreakdown(target: CostBreakdown, source: CostBreakdown, scale = 1): CostBreakdown {
  for (const category of COST_CATEGORIES) target[category] += source[category] * scale;
  return target;
}

function totalOf(breakdown: CostBreakdown): number {
  return COST_CATEGORIES.reduce((sum, category) => sum + breakdown[category], 0);
}

function monthStart(offsetFromNow: number): Date {
  return new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + offsetFromNow, 1));
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Variance status: only overspend is operationally red. */
export function varianceStatus(variancePct: number): StatusLevel {
  if (variancePct >= TOLERANCE_RED_PCT) return "red";
  if (variancePct >= TOLERANCE_AMBER_PCT) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* Per-engine cost model                                               */
/* ------------------------------------------------------------------ */

export interface EngineCostProfile {
  engine: Engine;
  /** Annualised engine flight hours and cycles. */
  annualEfh: number;
  annualCycles: number;
  hoursPerCycle: number;
  /** Annual accrued cost by category, USD. */
  annual: CostBreakdown;
  annualTotalUsd: number;
  costPerEfh: number;
  /** Planned unit cost: the same engine reaching its certified interval. */
  budgetPerEfh: number;
  /** Achieved heavy-maintenance interval used for the accrual, in EFH. */
  heavyIntervalEfh: number;
  heavyEventCostUsd: number;
}

let profileCache: EngineCostProfile[] | null = null;

export function engineCostProfiles(): EngineCostProfile[] {
  if (profileCache) return profileCache;
  const data = getDataset();

  const partByNumber = new Map(data.parts.map((p) => [p.partNumber, p]));
  const facilityById = new Map(data.facilities.map((f) => [f.id, f]));
  const taskCardsByWorkOrder = new Map<string, typeof data.taskCards>();
  for (const card of data.taskCards) {
    const bucket = taskCardsByWorkOrder.get(card.workOrderId) ?? [];
    bucket.push(card);
    taskCardsByWorkOrder.set(card.workOrderId, bucket);
  }

  /* Sampled utilisation, normalised to the fleet planning assumption. */
  const sampledHours = new Map<string, number>();
  const sampledCycles = new Map<string, number>();
  for (const flight of data.flights) {
    sampledHours.set(flight.aircraftId, (sampledHours.get(flight.aircraftId) ?? 0) + flight.blockHours);
    sampledCycles.set(flight.aircraftId, (sampledCycles.get(flight.aircraftId) ?? 0) + flight.cycles);
  }
  const annualiser = 365 / FLIGHT_SAMPLE_DAYS;
  const rawAnnual = data.engines.map((engine) =>
    engine.aircraftId ? (sampledHours.get(engine.aircraftId) ?? 0) * annualiser : 0,
  );
  const rawMean = rawAnnual.reduce((s, v) => s + v, 0) / Math.max(1, rawAnnual.length);
  const utilisationScale = rawMean > 0 ? FLEET_ANNUAL_EFH / rawMean : 1;

  /* Typical heavy-event cost by family, taken from the shop visits on the books. */
  const heavyCostByFamily = new Map<EngineFamily, number>();
  const heavyByFamily = new Map<EngineFamily, number[]>();
  for (const wo of data.workOrders) {
    if (wo.type !== "shop-visit") continue;
    const engine = data.engines.find((e) => e.id === wo.engineId);
    if (!engine) continue;
    const bucket = heavyByFamily.get(engine.family) ?? [];
    bucket.push(wo.actualCostUsd ?? wo.estimatedCostUsd);
    heavyByFamily.set(engine.family, bucket);
  }
  const allHeavy = [...heavyByFamily.values()].flat();
  const fleetHeavyMean = allHeavy.reduce((s, v) => s + v, 0) / Math.max(1, allHeavy.length);
  for (const [family, costs] of heavyByFamily) {
    heavyCostByFamily.set(family, costs.reduce((s, v) => s + v, 0) / costs.length);
  }

  /* Light maintenance run rate and labour, per engine. */
  const lightMaterials = new Map<string, number>();
  const labourCost = new Map<string, number>();
  const transportCost = new Map<string, number>();
  for (const wo of data.workOrders) {
    const facility = facilityById.get(wo.facilityId);
    const rate = LABOUR_RATE_BY_REGION[facility?.region ?? "Europe"];
    const hours = (taskCardsByWorkOrder.get(wo.id) ?? []).reduce(
      (sum, card) => sum + (card.actualHours ?? card.estimatedHours),
      0,
    );
    const labour = hours * rate;
    /* Heavy events are accrued across their interval, labour included, so neither
       their hardware nor their shop hours are expensed here. */
    if (HEAVY_TYPES.has(wo.type)) continue;
    labourCost.set(wo.engineId, (labourCost.get(wo.engineId) ?? 0) + labour);
    const cost = wo.actualCostUsd ?? wo.estimatedCostUsd;
    lightMaterials.set(wo.engineId, (lightMaterials.get(wo.engineId) ?? 0) + Math.max(cost - labour, cost * 0.2));
    if (wo.type === "aog-recovery") {
      transportCost.set(wo.engineId, (transportCost.get(wo.engineId) ?? 0) + TRANSPORT_PER_HEAVY_EVENT_USD * 0.6);
    }
  }

  /* LLP accrual per cycle. */
  const llpPerCycle = new Map<string, number>();
  for (const llp of data.llps) {
    const part = partByNumber.get(llp.partNumber);
    if (!part || !llp.cyclicLimit) continue;
    llpPerCycle.set(llp.engineId, (llpPerCycle.get(llp.engineId) ?? 0) + part.unitCostUsd / llp.cyclicLimit);
  }

  profileCache = data.engines.map((engine, index) => {
    const annualEfh = Math.max(400, round(rawAnnual[index]! * utilisationScale, 0));
    const hoursPerCycle = clamp(engine.totalFlightHours / Math.max(1, engine.totalFlightCycles), 4, 12);
    const annualCycles = round(annualEfh / hoursPerCycle, 0);

    const heavyEventCostUsd = heavyCostByFamily.get(engine.family) ?? fleetHeavyMean;
    const heavyIntervalEfh = Math.max(
      6_000,
      (engine.cyclesSinceOverhaul + engine.rulCycles) * hoursPerCycle,
    );
    const heavyPerEfh = heavyEventCostUsd / heavyIntervalEfh;
    const certifiedIntervalEfh =
      (ENGINE_FAMILIES.find((f) => f.family === engine.family)?.overhaulIntervalCycles ?? 5_000) * hoursPerCycle;
    const plannedHeavyPerEfh = heavyEventCostUsd / certifiedIntervalEfh;

    const annual: CostBreakdown = {
      labour: heavyPerEfh * HEAVY_LABOUR_SHARE * annualEfh + (labourCost.get(engine.id) ?? 0),
      materials: heavyPerEfh * (1 - HEAVY_LABOUR_SHARE) * annualEfh + (lightMaterials.get(engine.id) ?? 0),
      llp: (llpPerCycle.get(engine.id) ?? 0) * annualCycles,
      transport:
        (TRANSPORT_PER_HEAVY_EVENT_USD / heavyIntervalEfh) * annualEfh + (transportCost.get(engine.id) ?? 0),
      penalties: 0,
    };

    const plannedTotal =
      (plannedHeavyPerEfh + TRANSPORT_PER_HEAVY_EVENT_USD / certifiedIntervalEfh) * annualEfh +
      (labourCost.get(engine.id) ?? 0) +
      (lightMaterials.get(engine.id) ?? 0) +
      (llpPerCycle.get(engine.id) ?? 0) * annualCycles;

    return {
      engine,
      annualEfh,
      annualCycles,
      hoursPerCycle: round(hoursPerCycle, 2),
      annual,
      annualTotalUsd: totalOf(annual),
      costPerEfh: round(totalOf(annual) / annualEfh, 2),
      budgetPerEfh: round((plannedTotal / annualEfh) * (1 + BUDGET_ESCALATION), 2),
      heavyIntervalEfh: round(heavyIntervalEfh, 0),
      heavyEventCostUsd: round(heavyEventCostUsd, 0),
    };
  });

  /* Availability penalties are an operator-level accrual, spread over its engines. */
  for (const contract of data.contracts) {
    const covered = profileCache.filter((p) => p.engine.operatorId === contract.operatorId);
    const operatorEfh = covered.reduce((s, p) => s + p.annualEfh, 0);
    if (operatorEfh === 0 || contract.penaltiesUsd === 0) continue;
    for (const profile of covered) {
      const share = contract.penaltiesUsd * (profile.annualEfh / operatorEfh);
      profile.annual.penalties += share;
      profile.annualTotalUsd += share;
      profile.costPerEfh = round(profile.annualTotalUsd / profile.annualEfh, 2);
    }
  }

  return profileCache;
}

/* ------------------------------------------------------------------ */
/* Monthly history                                                     */
/* ------------------------------------------------------------------ */

interface MonthlyShape {
  months: CostMonth[];
  /** Per-operator monthly history, keyed by operator id. */
  byOperator: Map<string, CostMonth[]>;
}

/**
 * Spreads the annual accrual across 24 months with a deterministic seasonal and
 * escalation profile, so the current month reconciles to the accrual model and
 * the history explains how it got there.
 */
function monthlyHistory(): MonthlyShape {
  const profiles = engineCostProfiles();
  const byOperatorProfiles = new Map<string, EngineCostProfile[]>();
  for (const profile of profiles) {
    const bucket = byOperatorProfiles.get(profile.engine.operatorId) ?? [];
    bucket.push(profile);
    byOperatorProfiles.set(profile.engine.operatorId, bucket);
  }

  const byOperator = new Map<string, CostMonth[]>();
  const fleetMonths: CostMonth[] = [];
  const last = MONTHS_OF_HISTORY - 1;

  for (let m = 0; m <= last; m += 1) {
    const date = monthStart(m - last);
    fleetMonths.push({
      month: iso(date),
      label: monthLabel(date),
      efh: 0,
      cost: emptyBreakdown(),
      totalCostUsd: 0,
      costPerEfh: 0,
      budgetPerEfh: 0,
    });
  }

  for (const [operatorId, operatorProfiles] of byOperatorProfiles) {
    const annualEfh = operatorProfiles.reduce((s, p) => s + p.annualEfh, 0);
    const annual = operatorProfiles.reduce((acc, p) => addBreakdown(acc, p.annual), emptyBreakdown());
    const months: CostMonth[] = [];
    /* Operators diverge from the fleet escalation: some hold plan, some drift. */
    const driftFactor = rand.float(createRng(`costs:drift:${operatorId}`), -0.8, 2.1, 3);

    for (let m = 0; m <= last; m += 1) {
      const date = monthStart(m - last);
      const utilisationRng = createRng(`costs:efh:${operatorId}:${m}`);
      const seasonal = 1 + 0.055 * Math.sin((2 * Math.PI * date.getUTCMonth()) / 12);
      const efh = (annualEfh / 12) * seasonal * (1 + rand.gaussian(utilisationRng, 0, 0.025));

      const cost = emptyBreakdown();
      for (const category of COST_CATEGORIES) {
        const rng = createRng(`costs:${operatorId}:${category}:${m}`);
        const trend = 1 + MONTHLY_DRIFT[category] * driftFactor * (m - last);
        const noise = 1 + rand.gaussian(rng, 0, category === "penalties" ? 0.16 : 0.05);
        cost[category] = Math.max(0, (annual[category] / 12) * trend * noise);
      }

      const totalCostUsd = totalOf(cost);
      months.push({
        month: iso(date),
        label: monthLabel(date),
        efh: round(efh, 0),
        cost,
        totalCostUsd: round(totalCostUsd, 0),
        costPerEfh: round(totalCostUsd / Math.max(1, efh), 2),
        budgetPerEfh: 0,
      });

      const fleetMonth = fleetMonths[m]!;
      fleetMonth.efh += efh;
      addBreakdown(fleetMonth.cost, cost);
    }

    /* Budget: last year's actual unit cost plus planned escalation, held flat. */
    const priorYear = months.slice(0, 12);
    const priorYearCost = priorYear.reduce((s, month) => s + month.totalCostUsd, 0);
    const priorYearEfh = priorYear.reduce((s, month) => s + month.efh, 0);
    const budgetPerEfh = round((priorYearCost / Math.max(1, priorYearEfh)) * (1 + BUDGET_ESCALATION), 2);
    for (const month of months) month.budgetPerEfh = budgetPerEfh;

    byOperator.set(operatorId, months);
  }

  for (const month of fleetMonths) {
    month.efh = round(month.efh, 0);
    month.totalCostUsd = round(totalOf(month.cost), 0);
    month.costPerEfh = round(month.totalCostUsd / Math.max(1, month.efh), 2);
  }
  const fleetPriorYear = fleetMonths.slice(0, 12);
  const fleetBudget = round(
    (fleetPriorYear.reduce((s, m) => s + m.totalCostUsd, 0) /
      Math.max(1, fleetPriorYear.reduce((s, m) => s + m.efh, 0))) *
      (1 + BUDGET_ESCALATION),
    2,
  );
  for (const month of fleetMonths) month.budgetPerEfh = fleetBudget;

  return { months: fleetMonths, byOperator };
}

function periodFrom(months: CostMonth[], label: string, budgetPerEfh: number): CostPeriod {
  const cost = months.reduce((acc, month) => addBreakdown(acc, month.cost), emptyBreakdown());
  const efh = months.reduce((s, month) => s + month.efh, 0);
  const totalCostUsd = totalOf(cost);
  const cyclesPerHour = 1 / 7;
  return {
    label,
    startsAt: months[0]!.month,
    endsAt: months[months.length - 1]!.month,
    efh: round(efh, 0),
    cycles: round(efh * cyclesPerHour, 0),
    cost,
    totalCostUsd: round(totalCostUsd, 0),
    costPerEfh: round(totalCostUsd / Math.max(1, efh), 2),
    budgetPerEfh,
  };
}

/* ------------------------------------------------------------------ */
/* Bridge, forecast, drivers                                           */
/* ------------------------------------------------------------------ */

const CATEGORY_LABEL: Record<CostCategory, string> = {
  labour: "Labour",
  materials: "Materials & repairs",
  llp: "Life-limited parts",
  transport: "Transport & logistics",
  penalties: "Availability penalties",
};

export function costCategoryLabel(category: CostCategory): string {
  return CATEGORY_LABEL[category];
}

function buildBridge(current: CostPeriod, prior: CostPeriod): CostBridgeStep[] {
  const steps: CostBridgeStep[] = [];
  let cursor = prior.costPerEfh;
  steps.push({
    id: "opening",
    label: `${prior.label} actual`,
    kind: "opening",
    value: prior.costPerEfh,
    start: 0,
    end: prior.costPerEfh,
    explanation: `${prior.label} maintenance cost of ${Math.round(prior.totalCostUsd).toLocaleString("en-GB")} USD over ${Math.round(prior.efh).toLocaleString("en-GB")} EFH.`,
  });

  const volume = prior.totalCostUsd / Math.max(1, current.efh) - prior.costPerEfh;
  steps.push({
    id: "volume",
    label: "Utilisation",
    kind: "delta",
    value: round(volume, 2),
    start: cursor,
    end: round(cursor + volume, 2),
    explanation:
      volume < 0
        ? `Flying hours rose ${Math.round(((current.efh - prior.efh) / Math.max(1, prior.efh)) * 100)}%, diluting the fixed accrual across more hours.`
        : `Flying hours fell ${Math.round(((prior.efh - current.efh) / Math.max(1, prior.efh)) * 100)}%, so the same accrual is spread across fewer hours.`,
  });
  cursor += volume;

  for (const category of COST_CATEGORIES) {
    const delta = (current.cost[category] - prior.cost[category]) / Math.max(1, current.efh);
    steps.push({
      id: category,
      label: CATEGORY_LABEL[category],
      kind: "delta",
      value: round(delta, 2),
      start: round(cursor, 2),
      end: round(cursor + delta, 2),
      category,
      explanation: `${CATEGORY_LABEL[category]} spend moved ${delta >= 0 ? "+" : ""}${Math.round(((current.cost[category] - prior.cost[category]) / Math.max(1, prior.cost[category])) * 100)}% against the prior quarter.`,
    });
    cursor += delta;
  }

  steps.push({
    id: "closing",
    label: `${current.label} actual`,
    kind: "closing",
    value: round(current.costPerEfh, 2),
    start: 0,
    end: round(current.costPerEfh, 2),
    explanation: `${current.label} unit cost against a budget of ${current.budgetPerEfh.toFixed(0)} USD per EFH.`,
  });

  return steps;
}

function buildForecast(months: CostMonth[], budgetPerEfh: number): CostForecastPoint[] {
  const data = getDataset();
  const recent = months.slice(-6);
  const n = recent.length;
  const meanX = (n - 1) / 2;
  const meanY = recent.reduce((s, m) => s + m.costPerEfh, 0) / n;
  const cov = recent.reduce((s, m, i) => s + (i - meanX) * (m.costPerEfh - meanY), 0);
  const varX = recent.reduce((s, _m, i) => s + (i - meanX) ** 2, 0);
  const slope = varX === 0 ? 0 : cov / varX;
  const anchor = months[months.length - 1]!.costPerEfh;

  const out: CostForecastPoint[] = [];
  for (let h = 1; h <= 12; h += 1) {
    const date = monthStart(h);
    const rng = createRng(`costs:forecast:${h}`);
    const value = round(anchor + slope * h + rand.gaussian(rng, 0, anchor * 0.006), 2);
    const spread = round(value * (0.025 + 0.0075 * h), 2);
    const scheduled = data.workOrders.filter((wo) => {
      if (!HEAVY_TYPES.has(wo.type)) return false;
      const start = new Date(wo.scheduledStart);
      return start.getUTCFullYear() === date.getUTCFullYear() && start.getUTCMonth() === date.getUTCMonth();
    });
    out.push({
      month: iso(date),
      label: monthLabel(date),
      costPerEfh: value,
      low: round(value - spread, 2),
      high: round(value + spread, 2),
      budgetPerEfh,
      scheduledEvents: scheduled.length,
      scheduledCostUsd: round(
        scheduled.reduce((s, wo) => s + (wo.actualCostUsd ?? wo.estimatedCostUsd), 0),
        0,
      ),
      status: varianceStatus(((value - budgetPerEfh) / budgetPerEfh) * 100),
    });
  }
  return out;
}

const DRIVER_ACTIONS: Record<CostCategory, string[]> = {
  llp: [
    "Bundle LLP replacement into the next scheduled shop visit to avoid a second strip",
    "Re-life against the harsher route mix and re-baseline the accrual rate",
  ],
  materials: [
    "Move to a repair-first workscope and qualify a second-source vendor",
    "Negotiate a fixed-price repair package for the top three part numbers",
  ],
  labour: [
    "Shift work to the lower-rate partner shop with available slots",
    "Rebalance shift patterns to cut overtime on the critical path",
  ],
  transport: [
    "Consolidate engine movements onto scheduled freighter capacity",
    "Pre-position a lease engine at the affected base",
  ],
  penalties: [
    "Escalate the availability recovery plan with the operator",
    "Re-sequence removals to protect the contractual availability commitment",
  ],
};

function buildDrivers(current: CostPeriod, prior: CostPeriod): CostDriver[] {
  const data = getDataset();
  const profiles = engineCostProfiles();
  const fleetAnnualEfh = profiles.reduce((s, p) => s + p.annualEfh, 0);
  const partByNumber = new Map(data.parts.map((p) => [p.partNumber, p]));
  const facilityById = new Map(data.facilities.map((f) => [f.id, f]));
  const profileByEngine = new Map(profiles.map((p) => [p.engine.id, p]));

  const drivers: Omit<CostDriver, "sharePct" | "status" | "recommendedAction">[] = [];

  /* LLP consumption by engine module. */
  const moduleLabel = new Map<ModuleCode, string>(ENGINE_MODULES.map((m) => [m.code, m.label]));
  const llpByModule = new Map<ModuleCode, { cost: number; events: number; unit: number[] }>();
  for (const llp of data.llps) {
    const part = partByNumber.get(llp.partNumber);
    const profile = profileByEngine.get(llp.engineId);
    if (!part || !profile || !llp.cyclicLimit) continue;
    const bucket = llpByModule.get(llp.moduleCode) ?? { cost: 0, events: 0, unit: [] };
    bucket.cost += (part.unitCostUsd / llp.cyclicLimit) * profile.annualCycles;
    bucket.events += profile.annualCycles / llp.cyclicLimit;
    bucket.unit.push(part.unitCostUsd);
    llpByModule.set(llp.moduleCode, bucket);
  }
  for (const [moduleCode, bucket] of llpByModule) {
    drivers.push({
      id: `llp-${moduleCode}`,
      label: `${moduleLabel.get(moduleCode) ?? moduleCode} life-limited parts`,
      category: "llp",
      moduleCode,
      events: Math.max(1, Math.round(bucket.events)),
      unitCostUsd: round(bucket.unit.reduce((s, v) => s + v, 0) / bucket.unit.length, 0),
      annualCostUsd: round(bucket.cost, 0),
      costPerEfh: round(bucket.cost / fleetAnnualEfh, 2),
      deltaPctVsPrior: 0,
    });
  }

  /* Event-driven drivers taken straight off the work order book. */
  const eventGroups: { id: string; label: string; category: CostCategory; types: string[] }[] = [
    { id: "shop-visits", label: "Scheduled shop visits", category: "materials", types: ["shop-visit"] },
    { id: "module-swaps", label: "Unscheduled module swaps", category: "materials", types: ["module-swap"] },
    { id: "aog-recovery", label: "AOG recovery events", category: "transport", types: ["aog-recovery"] },
    { id: "borescope", label: "Borescope inspections", category: "labour", types: ["borescope"] },
    { id: "line", label: "Line & on-wing maintenance", category: "labour", types: ["line", "on-wing-repair", "base"] },
  ];

  for (const group of eventGroups) {
    const orders = data.workOrders.filter((wo) => group.types.includes(wo.type));
    if (orders.length === 0) continue;
    const cost = orders.reduce((s, wo) => s + (wo.actualCostUsd ?? wo.estimatedCostUsd), 0);
    drivers.push({
      id: group.id,
      label: group.label,
      category: group.category,
      moduleCode: null,
      events: orders.length,
      unitCostUsd: round(cost / orders.length, 0),
      annualCostUsd: round(cost, 0),
      costPerEfh: round(cost / fleetAnnualEfh, 2),
      deltaPctVsPrior: 0,
    });
  }

  /* Labour by facility region — the rate arbitrage a cost controller can act on. */
  const labourByRegion = new Map<Region, { hours: number; cost: number; orders: number }>();
  const cardsByWorkOrder = new Map<string, number>();
  for (const card of data.taskCards) {
    cardsByWorkOrder.set(card.workOrderId, (cardsByWorkOrder.get(card.workOrderId) ?? 0) + (card.actualHours ?? card.estimatedHours));
  }
  for (const wo of data.workOrders) {
    const region = facilityById.get(wo.facilityId)?.region ?? "Europe";
    const hours = cardsByWorkOrder.get(wo.id) ?? 0;
    const bucket = labourByRegion.get(region) ?? { hours: 0, cost: 0, orders: 0 };
    bucket.hours += hours;
    bucket.cost += hours * LABOUR_RATE_BY_REGION[region];
    bucket.orders += 1;
    labourByRegion.set(region, bucket);
  }
  const dearestRegion = [...labourByRegion.entries()].sort((a, b) => b[1].cost - a[1].cost)[0];
  if (dearestRegion) {
    const [region, bucket] = dearestRegion;
    drivers.push({
      id: `labour-${region}`,
      label: `${region} shop labour`,
      category: "labour",
      moduleCode: null,
      events: bucket.orders,
      unitCostUsd: LABOUR_RATE_BY_REGION[region],
      annualCostUsd: round(bucket.cost, 0),
      costPerEfh: round(bucket.cost / fleetAnnualEfh, 2),
      deltaPctVsPrior: 0,
    });
  }

  /* Availability penalties. */
  const penalising = data.contracts.filter((c) => c.penaltiesUsd > 0);
  if (penalising.length > 0) {
    const cost = penalising.reduce((s, c) => s + c.penaltiesUsd, 0);
    drivers.push({
      id: "penalties",
      label: "Availability penalties",
      category: "penalties",
      moduleCode: null,
      events: penalising.length,
      unitCostUsd: round(cost / penalising.length, 0),
      annualCostUsd: round(cost, 0),
      costPerEfh: round(cost / fleetAnnualEfh, 2),
      deltaPctVsPrior: 0,
    });
  }

  const totalDriverCost = drivers.reduce((s, d) => s + d.annualCostUsd, 0);

  return drivers
    .map((driver) => {
      const categoryDelta =
        ((current.cost[driver.category] / Math.max(1, current.efh)) /
          Math.max(0.01, prior.cost[driver.category] / Math.max(1, prior.efh)) -
          1) *
        100;
      const rng = createRng(`costs:driver:${driver.id}`);
      const deltaPctVsPrior = round(categoryDelta + rand.gaussian(rng, 0, 3.4), 1);
      const sharePct = round((driver.annualCostUsd / Math.max(1, totalDriverCost)) * 100, 1);
      const status: StatusLevel =
        deltaPctVsPrior >= 8 && sharePct >= 6 ? "red" : deltaPctVsPrior >= 3 ? "amber" : "green";
      return {
        ...driver,
        deltaPctVsPrior,
        sharePct,
        status,
        /* Only material drivers carry an action, so the table stays scannable. */
        recommendedAction:
          sharePct >= 3 || status === "red"
            ? rand.pick(createRng(`costs:action:${driver.id}`), DRIVER_ACTIONS[driver.category])
            : "",
      };
    })
    .sort((a, b) => b.annualCostUsd - a.annualCostUsd);
}

/* ------------------------------------------------------------------ */
/* Public selector                                                     */
/* ------------------------------------------------------------------ */

let analyticsCache: CostAnalytics | null = null;

export function costAnalytics(): CostAnalytics {
  if (analyticsCache) return analyticsCache;
  const data = getDataset();
  const profiles = engineCostProfiles();
  const { months, byOperator } = monthlyHistory();
  const budgetPerEfh = months[months.length - 1]!.budgetPerEfh;

  const currentMonths = months.slice(-PERIOD_MONTHS);
  const priorMonths = months.slice(-PERIOD_MONTHS * 2, -PERIOD_MONTHS);
  const currentLabel = `${currentMonths[0]!.label}–${currentMonths[currentMonths.length - 1]!.label}`;
  const priorLabel = `${priorMonths[0]!.label}–${priorMonths[priorMonths.length - 1]!.label}`;
  const current = periodFrom(currentMonths, currentLabel, budgetPerEfh);
  const prior = periodFrom(priorMonths, priorLabel, budgetPerEfh);

  /* Operators */
  const operators: OperatorCostRow[] = data.operators
    .map((operator): OperatorCostRow | null => {
      const operatorMonths = byOperator.get(operator.id) ?? [];
      if (operatorMonths.length === 0) return null;
      const opBudget = operatorMonths[0]!.budgetPerEfh;
      const opCurrent = periodFrom(operatorMonths.slice(-PERIOD_MONTHS), currentLabel, opBudget);
      const opPrior = periodFrom(operatorMonths.slice(-PERIOD_MONTHS * 2, -PERIOD_MONTHS), priorLabel, opBudget);
      const contract = data.contracts.find((c) => c.operatorId === operator.id);
      const engines = profiles.filter((p) => p.engine.operatorId === operator.id);
      const variancePct = round(((opCurrent.costPerEfh - opBudget) / opBudget) * 100, 1);
      const topCategory = COST_CATEGORIES.reduce((best, category) =>
        opCurrent.cost[category] > opCurrent.cost[best] ? category : best,
      );
      const history: Point[] = operatorMonths.slice(-12).map((month) => ({ t: month.month, v: month.costPerEfh }));
      return {
        operatorId: operator.id,
        code: operator.code,
        name: operator.name,
        region: operator.region,
        contractKind: contract?.kind ?? "Time & Materials",
        engines: engines.length,
        efh: opCurrent.efh,
        cost: opCurrent.cost,
        totalCostUsd: opCurrent.totalCostUsd,
        costPerEfh: opCurrent.costPerEfh,
        budgetPerEfh: opBudget,
        variancePct,
        deltaPctVsPrior: round(
          ((opCurrent.costPerEfh - opPrior.costPerEfh) / Math.max(0.01, opPrior.costPerEfh)) * 100,
          1,
        ),
        penaltiesUsd: contract?.penaltiesUsd ?? 0,
        topCategory,
        status: varianceStatus(variancePct),
        history,
      } satisfies OperatorCostRow;
    })
    .filter((row): row is OperatorCostRow => row !== null)
    .sort((a, b) => b.variancePct - a.variancePct);

  /* Families */
  const families = [...new Set(profiles.map((p) => p.engine.family))]
    .map((family) => {
      const members = profiles.filter((p) => p.engine.family === family);
      const efh = members.reduce((s, p) => s + p.annualEfh, 0);
      const cost = members.reduce((acc, p) => addBreakdown(acc, p.annual), emptyBreakdown());
      const total = totalOf(cost);
      const costPerEfh = round(total / Math.max(1, efh), 2);
      /* Plan assumes every engine reaches its certified overhaul interval. */
      const familyBudget = round(
        members.reduce((s, p) => s + p.budgetPerEfh * p.annualEfh, 0) / Math.max(1, efh),
        2,
      );
      const variancePct = round(((costPerEfh - familyBudget) / familyBudget) * 100, 1);
      return {
        family,
        engines: members.length,
        efh: round(efh, 0),
        costPerEfh,
        budgetPerEfh: familyBudget,
        variancePct,
        llpSharePct: round((cost.llp / Math.max(1, total)) * 100, 1),
        status: varianceStatus(variancePct),
      };
    })
    .sort((a, b) => b.costPerEfh - a.costPerEfh);

  /* Budget vs actual, by category and by worst operators. */
  const priorYear = months.slice(0, 12);
  const priorYearEfh = priorYear.reduce((s, m) => s + m.efh, 0);
  const budget = [
    ...COST_CATEGORIES.map((category) => {
      const perEfhBudget =
        (priorYear.reduce((s, m) => s + m.cost[category], 0) / Math.max(1, priorYearEfh)) * (1 + BUDGET_ESCALATION);
      const budgetUsd = perEfhBudget * current.efh;
      const actualUsd = current.cost[category];
      const variancePct = round(((actualUsd - budgetUsd) / Math.max(1, budgetUsd)) * 100, 1);
      return {
        id: `budget-${category}`,
        scope: "category" as const,
        label: CATEGORY_LABEL[category],
        budgetUsd: round(budgetUsd, 0),
        actualUsd: round(actualUsd, 0),
        varianceUsd: round(actualUsd - budgetUsd, 0),
        variancePct,
        tolerancePct: TOLERANCE_AMBER_PCT,
        status: varianceStatus(variancePct),
      };
    }),
    ...operators.slice(0, 4).map((operator) => ({
      id: `budget-${operator.operatorId}`,
      scope: "operator" as const,
      label: `${operator.name} (${operator.code})`,
      budgetUsd: round(operator.budgetPerEfh * operator.efh, 0),
      actualUsd: round(operator.totalCostUsd, 0),
      varianceUsd: round(operator.totalCostUsd - operator.budgetPerEfh * operator.efh, 0),
      variancePct: operator.variancePct,
      tolerancePct: TOLERANCE_AMBER_PCT,
      status: operator.status,
    })),
  ];

  /* AOG and disruption exposure. */
  const aogAircraft = data.aircraft.filter((a) => a.status === "aog");
  const aogRows = aogAircraft.map((aircraft) => {
    const operator = data.operators.find((o) => o.id === aircraft.operatorId);
    const engines = data.engines.filter((e) => aircraft.engineIds.includes(e.id));
    const worst = [...engines].sort((a, b) => a.healthScore - b.healthScore)[0];
    const workOrder = data.workOrders
      .filter((wo) => engines.some((e) => e.id === wo.engineId) && wo.state !== "complete")
      .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];
    const alert = worst ? data.alerts.find((a) => a.engineId === worst.id && a.state !== "closed") : undefined;
    const rng = createRng(`costs:aog:${aircraft.id}`);
    const hoursDown = rand.int(rng, 6, 96);
    const expectedDaysRemaining = workOrder
      ? Math.max(1, Math.round(workOrder.tatDays * rand.float(rng, 0.3, 0.8)))
      : rand.int(rng, 1, 4);
    const daily = DISRUPTION_COST_BY_TYPE[aircraft.type];
    const contract = data.contracts.find((c) => c.operatorId === aircraft.operatorId);
    const penaltyExposure = contract && contract.availabilityActual < contract.availabilityTarget ? contract.penaltiesUsd * 0.12 : 0;
    const exposureUsd = round(daily * expectedDaysRemaining + penaltyExposure, 0);
    return {
      id: aircraft.id,
      tail: aircraft.tail,
      aircraftType: aircraft.type,
      operatorCode: operator?.code ?? "—",
      engineEsn: worst?.esn ?? "—",
      cause: alert?.title ?? workOrder?.reference ?? "Awaiting technical assessment",
      downSinceAt: iso(new Date(NOW.getTime() - hoursDown * 3_600_000)),
      hoursDown,
      expectedDaysRemaining,
      dailyDisruptionCostUsd: daily,
      exposureUsd,
      status: (expectedDaysRemaining >= 3 ? "red" : expectedDaysRemaining >= 2 ? "amber" : "green") as StatusLevel,
      recommendedAction:
        workOrder?.state === "awaiting-parts"
          ? "Expedite the blocking part from the nearest pool and re-plan the slot"
          : "Release a lease engine and recover the aircraft to service inside 48h",
    };
  });

  const drivers = buildDrivers(current, prior);
  const bridge = buildBridge(current, prior);
  const forecast = buildForecast(months, budgetPerEfh);

  /* Decision-first headline actions. */
  const worstOperator = operators[0];
  const worstDriver = drivers.find((d) => d.status === "red") ?? drivers[0];
  const exposureUsd = round(aogRows.reduce((s, row) => s + row.exposureUsd, 0), 0);
  const penaltiesAccruedUsd = round(data.contracts.reduce((s, c) => s + c.penaltiesUsd, 0), 0);
  const breachMonth = forecast.find((point) => point.status === "red");

  const actions: CostAction[] = [];
  if (worstOperator && worstOperator.variancePct >= TOLERANCE_AMBER_PCT) {
    actions.push({
      id: "operator-variance",
      title: `${worstOperator.name} is ${worstOperator.variancePct.toFixed(1)}% over plan`,
      detail: `${CATEGORY_LABEL[worstOperator.topCategory]} is the largest block of a ${Math.round(worstOperator.costPerEfh)} USD/EFH unit cost against a ${Math.round(worstOperator.budgetPerEfh)} USD/EFH budget on a ${worstOperator.contractKind} contract.`,
      impactUsd: round((worstOperator.costPerEfh - worstOperator.budgetPerEfh) * worstOperator.efh, 0),
      status: worstOperator.status,
      action: "Open the contract review",
      href: "/commercial/contracts",
    });
  }
  if (worstDriver) {
    actions.push({
      id: "driver",
      title: `${worstDriver.label} up ${worstDriver.deltaPctVsPrior.toFixed(1)}% on the quarter`,
      detail: worstDriver.recommendedAction,
      impactUsd: round(worstDriver.annualCostUsd * (worstDriver.deltaPctVsPrior / 100), 0),
      status: worstDriver.status,
      action: "Review workscope policy",
      href: "/plan/workscope",
    });
  }
  if (aogRows.length > 0) {
    actions.push({
      id: "aog",
      title: `${aogRows.length} aircraft AOG, ${Math.round(exposureUsd / 1_000_000)}m USD exposure`,
      detail: `Disruption cost accrues daily and feeds availability penalties already standing at ${Math.round(penaltiesAccruedUsd / 1_000_000)}m USD across the contract base.`,
      impactUsd: exposureUsd,
      status: "red",
      action: "Go to AOG desk",
      href: "/aog",
    });
  }
  if (breachMonth) {
    actions.push({
      id: "forecast",
      title: `Forecast breaches budget in ${breachMonth.label}`,
      detail: `Unit cost is trending to ${Math.round(breachMonth.costPerEfh)} USD/EFH against a ${Math.round(breachMonth.budgetPerEfh)} USD/EFH plan, driven by ${breachMonth.scheduledEvents} heavy events already in the schedule.`,
      impactUsd: round((breachMonth.costPerEfh - breachMonth.budgetPerEfh) * (current.efh / PERIOD_MONTHS), 0),
      status: "amber",
      action: "Re-sequence the plan",
      href: "/plan/schedule",
    });
  }

  analyticsCache = {
    generatedAt: iso(NOW),
    current,
    prior,
    months,
    bridge,
    forecast,
    drivers,
    operators,
    families,
    budget,
    aog: {
      aircraftDown: aogRows.length,
      exposureUsd,
      penaltiesAccruedUsd,
      rows: aogRows.sort((a, b) => b.exposureUsd - a.exposureUsd),
    },
    actions: actions.slice(0, 4),
    tolerance: { amberPct: TOLERANCE_AMBER_PCT, redPct: TOLERANCE_RED_PCT },
  };
  return analyticsCache;
}

/** Cost detail for a single operator, used by the API. */
export function operatorCostDetail(operatorId: string) {
  const analytics = costAnalytics();
  const row = analytics.operators.find((o) => o.operatorId === operatorId);
  if (!row) return undefined;
  const engines = engineCostProfiles()
    .filter((p) => p.engine.operatorId === operatorId)
    .sort((a, b) => b.costPerEfh - a.costPerEfh)
    .map((p) => ({
      engineId: p.engine.id,
      esn: p.engine.esn,
      family: p.engine.family,
      annualEfh: p.annualEfh,
      costPerEfh: p.costPerEfh,
      heavyIntervalEfh: p.heavyIntervalEfh,
      status: p.engine.status,
    }));
  return { ...row, engines };
}
