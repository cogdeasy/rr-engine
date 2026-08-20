/**
 * LLP life management selectors.
 *
 * Everything here is derived from the deterministic dataset: LLP records, the
 * parts catalogue (unit cost, lead time), the flight record (utilisation) and
 * the maintenance plan (already-scheduled shop visits). No display rows are
 * hardcoded — the API and the web app both call these selectors.
 */

import type {
  EngineLlpStack,
  Engine,
  LlpExpiryBucket,
  LlpFleetRow,
  LlpFleetSummary,
  LlpLine,
  LlpRecommendation,
  LlpRemovalBasis,
  LlpRemovalDriver,
  LlpRemovalOption,
  StatusLevel,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, clamp, NOW, iso, round } from "../rng";

/**
 * Cycles an LLP must be able to cover to stay on wing for the next planned
 * interval. A part with less life than this is scrapped at the shop visit
 * because it could not survive to the following one.
 */
export const NEXT_INTERVAL_CYCLES = 3200;

/** Premium paid for an unplanned removal versus the planned event. */
const UNPLANNED_REMOVAL_COST_USD = 2_400_000;

/**
 * Ownership value of one cycle of on-wing life. Removing early throws away
 * green time the operator has already paid for, which is what stops the
 * optimiser from simply recommending the earliest possible removal.
 */
const GREEN_TIME_USD_PER_CYCLE = 950;

/** Shop-visit induction lead time the planner needs on the bench. */
const BENCH_BUFFER_DAYS = 21;

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Planning utilisation, in engine cycles per calendar day.
 *
 * The flight record is a sample rather than a complete log, so sector length is
 * taken from the flights actually flown by the aircraft (falling back to the
 * engine's own hours-per-cycle) and turned into cycles per day against a
 * widebody daily utilisation assumption.
 */
const DAILY_BLOCK_HOURS = 13.5;

export function engineCyclesPerDay(engineId: string): number {
  const d = getDataset();
  const engine = d.engines.find((e) => e.id === engineId);
  if (!engine) return 1.5;
  const flights = engine.aircraftId ? d.flights.filter((f) => f.aircraftId === engine.aircraftId) : [];
  const sectorHours =
    flights.length > 0
      ? flights.reduce((sum, f) => sum + f.blockHours, 0) / flights.length
      : engine.totalFlightHours / Math.max(1, engine.totalFlightCycles);
  const perDay = DAILY_BLOCK_HOURS / Math.max(1.5, sectorHours);
  // Off-wing engines accrue no cycles until they are re-installed.
  return round(clamp(engine.aircraftId ? perDay : perDay * 0.35, 0.35, 4), 2);
}

function lineStatus(cyclesRemaining: number, cyclesToRemoval: number): StatusLevel {
  if (cyclesRemaining <= cyclesToRemoval) return "red";
  if (cyclesRemaining - cyclesToRemoval < NEXT_INTERVAL_CYCLES) return "amber";
  return "green";
}

/** Value of the unused certified life still on a part. */
function stubValue(stubCycles: number, cyclicLimit: number, unitCostUsd: number): number {
  return Math.round((Math.max(0, stubCycles) / cyclicLimit) * unitCostUsd);
}

/**
 * The date the planner currently intends to remove the engine: an already
 * scheduled shop visit if one exists, otherwise the earlier of LLP expiry and
 * the condition forecast.
 */
function proposedRemoval(engine: Engine, minCyclesRemaining: number, cyclesPerDay: number) {
  const scheduled = getDataset()
    .workOrders.filter(
      (w) =>
        w.engineId === engine.id &&
        (w.type === "shop-visit" || w.type === "module-swap") &&
        w.state !== "complete" &&
        w.state !== "cancelled",
    )
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];

  const llpDays = Math.round(minCyclesRemaining / cyclesPerDay);
  const conditionDays = Math.round(engine.rulCycles / cyclesPerDay);

  if (scheduled) {
    return { date: new Date(scheduled.scheduledStart), basis: "scheduled-shop-visit" as LlpRemovalBasis };
  }
  return llpDays <= conditionDays
    ? { date: addDays(NOW, llpDays), basis: "llp-expiry" as LlpRemovalBasis }
    : { date: addDays(NOW, conditionDays), basis: "condition-forecast" as LlpRemovalBasis };
}

/** Probability of an unplanned removal before `cycles` further cycles are flown. */
function unplannedRisk(engine: Engine, cyclesToRemoval: number): number {
  const rul = Math.max(200, engine.rulCycles);
  const exposure = (cyclesToRemoval - rul * 0.65) / (rul * 0.7);
  const severity = 1 + (engine.environmentSeverity - 3) * 0.06;
  return round(clamp(exposure * severity, 0, 0.94), 3);
}

function buildLines(engineId: string, cyclesToRemoval: number, cyclesPerDay: number, removalDate: Date): LlpLine[] {
  const d = getDataset();
  return d.llps
    .filter((llp) => llp.engineId === engineId)
    .map((llp) => {
      const part = d.parts.find((p) => p.partNumber === llp.partNumber);
      const unitCostUsd = part?.unitCostUsd ?? 480_000;
      const leadTimeDays = part?.leadTimeDays ?? 90;
      const stubCycles = Math.max(0, llp.cyclesRemaining - cyclesToRemoval);
      const remainingAfterVisit = llp.cyclesRemaining - cyclesToRemoval;
      return {
        id: llp.id,
        engineId: llp.engineId,
        partNumber: llp.partNumber,
        serialNumber: llp.serialNumber,
        moduleCode: llp.moduleCode,
        description: part?.description ?? "Life-limited rotative",
        cyclesUsed: llp.cyclesUsed,
        cyclicLimit: llp.cyclicLimit,
        cyclesRemaining: llp.cyclesRemaining,
        lifeUsedPct: round((llp.cyclesUsed / llp.cyclicLimit) * 100, 1),
        status: lineStatus(llp.cyclesRemaining, cyclesToRemoval),
        projectedExpiryDate: iso(addDays(NOW, Math.round(llp.cyclesRemaining / cyclesPerDay))),
        unitCostUsd,
        leadTimeDays,
        supplier: part?.supplier ?? "Rolls-Royce Derby",
        stubCycles,
        stubValueUsd: remainingAfterVisit < NEXT_INTERVAL_CYCLES ? stubValue(stubCycles, llp.cyclicLimit, unitCostUsd) : 0,
        mustReplace: remainingAfterVisit < NEXT_INTERVAL_CYCLES,
        expiresBeforeRemoval: remainingAfterVisit <= 0,
        orderByDate: iso(addDays(removalDate, -(leadTimeDays + BENCH_BUFFER_DAYS))),
        leadTimeAtRisk:
          remainingAfterVisit < NEXT_INTERVAL_CYCLES &&
          addDays(removalDate, -(leadTimeDays + BENCH_BUFFER_DAYS)).getTime() < NOW.getTime(),
      } satisfies LlpLine;
    })
    .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining);
}

function evaluateOption(
  engine: Engine,
  lines: LlpLine[],
  minCyclesRemaining: number,
  cyclesPerDay: number,
  proposedDate: Date,
  deltaDays: number,
): LlpRemovalOption {
  const date = addDays(proposedDate, deltaDays);
  const cyclesToRemoval = Math.max(0, Math.round(daysBetween(NOW, date) * cyclesPerDay));
  const stubValueUsd = lines.reduce((sum, line) => {
    const remainingAfterVisit = line.cyclesRemaining - cyclesToRemoval;
    if (remainingAfterVisit >= NEXT_INTERVAL_CYCLES) return sum;
    return sum + stubValue(Math.max(0, remainingAfterVisit), line.cyclicLimit, line.unitCostUsd);
  }, 0);
  const risk = unplannedRisk(engine, cyclesToRemoval);
  const forgoneCycles = Math.max(0, minCyclesRemaining - cyclesToRemoval);
  const greenTimeCostUsd = Math.round(forgoneCycles * GREEN_TIME_USD_PER_CYCLE);
  return {
    date: iso(date),
    deltaDays,
    cyclesToRemoval,
    stubValueUsd,
    unplannedRisk: risk,
    riskCostUsd: Math.round(risk * UNPLANNED_REMOVAL_COST_USD),
    forgoneCycles,
    greenTimeCostUsd,
    totalCostUsd: Math.round(stubValueUsd + risk * UNPLANNED_REMOVAL_COST_USD + greenTimeCostUsd),
    feasible: cyclesToRemoval <= minCyclesRemaining && daysBetween(NOW, date) >= BENCH_BUFFER_DAYS,
  };
}

const OPTION_OFFSETS = [-120, -90, -60, -30, 0, 30, 60, 90, 120, 180];

function recommend(
  engine: Engine,
  lines: LlpLine[],
  minCyclesRemaining: number,
  cyclesPerDay: number,
  proposedDate: Date,
  driver: LlpRemovalDriver,
): LlpRecommendation {
  const options = OPTION_OFFSETS.map((delta) =>
    evaluateOption(engine, lines, minCyclesRemaining, cyclesPerDay, proposedDate, delta),
  );
  const proposed = options.find((o) => o.deltaDays === 0)!;
  const feasible = options.filter((o) => o.feasible);
  const best = (feasible.length > 0 ? feasible : [proposed]).reduce((a, b) => (b.totalCostUsd < a.totalCostUsd ? b : a));
  const netBenefitUsd = proposed.totalCostUsd - best.totalCostUsd;

  const action =
    best.deltaDays === 0
      ? "Hold the planned removal date"
      : best.deltaDays > 0
        ? `Defer removal by ${best.deltaDays} days`
        : `Pull removal forward ${Math.abs(best.deltaDays)} days`;

  const rationale =
    best.deltaDays === 0
      ? driver === "condition-limited"
        ? "Condition risk already outweighs the life left in the stack; further deferral buys nothing."
        : "The planned date sits at the cheapest point of the stub-life / risk trade."
      : best.deltaDays > 0
        ? `Recovers ${formatUsdCompact(
            proposed.stubValueUsd - best.stubValueUsd + (proposed.greenTimeCostUsd - best.greenTimeCostUsd),
          )} of stub life and green time for ${formatUsdCompact(best.riskCostUsd - proposed.riskCostUsd)} of added condition risk.`
        : `Cuts ${formatUsdCompact(proposed.riskCostUsd - best.riskCostUsd)} of unplanned-removal exposure for ${formatUsdCompact(
            best.stubValueUsd - proposed.stubValueUsd + (best.greenTimeCostUsd - proposed.greenTimeCostUsd),
          )} of scrapped life and forgone green time.`;

  const status: StatusLevel =
    netBenefitUsd >= 750_000 ? "red" : netBenefitUsd >= 150_000 ? "amber" : "green";

  return {
    action,
    rationale,
    recommendedRemovalDate: best.date,
    deltaDays: best.deltaDays,
    stubValueAtProposedUsd: proposed.stubValueUsd,
    stubValueAtRecommendedUsd: best.stubValueUsd,
    riskCostAtRecommendedUsd: best.riskCostUsd,
    netBenefitUsd,
    status,
    options,
  };
}

function formatUsdCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

/** Full LLP planning picture for one engine. */
export function llpStackForEngine(engineId: string): EngineLlpStack | undefined {
  const d = getDataset();
  const engine = d.engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;
  const records = d.llps.filter((l) => l.engineId === engine.id);
  if (records.length === 0) return undefined;

  const cyclesPerDay = engineCyclesPerDay(engine.id);
  const minCyclesRemaining = Math.min(...records.map((l) => l.cyclesRemaining));
  const { date: proposedDate, basis } = proposedRemoval(engine, minCyclesRemaining, cyclesPerDay);
  const daysToRemoval = daysBetween(NOW, proposedDate);
  const cyclesToRemoval = Math.max(0, Math.round(daysToRemoval * cyclesPerDay));

  const lines = buildLines(engine.id, cyclesToRemoval, cyclesPerDay, proposedDate);
  const limitingLine = lines[0]!;

  const driverMarginCycles = engine.rulCycles - minCyclesRemaining;
  const driver: LlpRemovalDriver =
    driverMarginCycles > 600 ? "llp-limited" : driverMarginCycles < -600 ? "condition-limited" : "balanced";

  const operator = d.operators.find((o) => o.id === engine.operatorId);
  const aircraft = d.aircraft.find((a) => a.id === engine.aircraftId);
  const stubValueUsd = lines.reduce((sum, line) => sum + line.stubValueUsd, 0);
  const mustReplace = lines.filter((line) => line.mustReplace);
  const recommendation = recommend(engine, lines, minCyclesRemaining, cyclesPerDay, proposedDate, driver);

  const status: StatusLevel = lines.some((l) => l.status === "red")
    ? "red"
    : lines.some((l) => l.status === "amber")
      ? "amber"
      : "green";

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    operatorName: operator?.name ?? "Unassigned",
    operatorCode: operator?.code ?? "--",
    aircraftTail: aircraft?.tail ?? null,
    location: engine.location,
    engineStatus: engine.status,
    healthScore: engine.healthScore,
    egtMargin: engine.egtMargin,
    rulCycles: engine.rulCycles,
    totalFlightCycles: engine.totalFlightCycles,
    cyclesPerDay,
    lines,
    limitingLine,
    minCyclesRemaining,
    llpExpiryDate: iso(addDays(NOW, Math.round(minCyclesRemaining / cyclesPerDay))),
    driver,
    driverMarginCycles,
    proposedRemovalDate: iso(proposedDate),
    proposedRemovalBasis: basis,
    daysToRemoval,
    cyclesToRemoval,
    status,
    stubValueUsd,
    mustReplaceCount: mustReplace.length,
    mustReplaceCostUsd: mustReplace.reduce((sum, line) => sum + line.unitCostUsd, 0),
    recommendation,
  };
}

let stacksCache: EngineLlpStack[] | null = null;

/** LLP planning picture for the whole managed fleet, ranked by urgency. */
export function llpFleetStacks(): EngineLlpStack[] {
  if (stacksCache) return stacksCache;
  const rank: Record<StatusLevel, number> = { red: 3, amber: 2, green: 1, grey: 0 };
  stacksCache = getDataset()
    .engines.map((engine) => llpStackForEngine(engine.id))
    .filter((stack): stack is EngineLlpStack => stack !== undefined)
    .sort((a, b) => rank[b.status] - rank[a.status] || a.minCyclesRemaining - b.minCyclesRemaining);
  return stacksCache;
}

/** Whole-fleet rows for the exposure table, without the optimiser detail. */
export function llpFleetRows(): LlpFleetRow[] {
  return llpFleetStacks().map((stack) => ({
    engineId: stack.engineId,
    esn: stack.esn,
    family: stack.family,
    operatorCode: stack.operatorCode,
    operatorName: stack.operatorName,
    aircraftTail: stack.aircraftTail,
    stackStatuses: stack.lines.map((line) => line.status),
    limitingPartNumber: stack.limitingLine.partNumber,
    limitingSerialNumber: stack.limitingLine.serialNumber,
    limitingModuleCode: stack.limitingLine.moduleCode,
    minCyclesRemaining: stack.minCyclesRemaining,
    llpExpiryDate: stack.llpExpiryDate,
    driver: stack.driver,
    rulCycles: stack.rulCycles,
    egtMargin: stack.egtMargin,
    proposedRemovalDate: stack.proposedRemovalDate,
    daysToRemoval: stack.daysToRemoval,
    stubValueUsd: stack.stubValueUsd,
    mustReplaceCount: stack.mustReplaceCount,
    recommendedAction: stack.recommendation.action,
    netBenefitUsd: stack.recommendation.netBenefitUsd,
    status: stack.status,
  }));
}

/** Engines whose removal is set by an LLP limit rather than by condition. */
export function llpDrivenEngines(limit = 8): EngineLlpStack[] {
  return llpFleetStacks()
    .filter((s) => s.driver === "llp-limited")
    .sort((a, b) => a.minCyclesRemaining - b.minCyclesRemaining)
    .slice(0, limit);
}

/** Month-by-month LLP expiry profile used for the fleet timeline. */
export function llpExpiryTimeline(months = 24): LlpExpiryBucket[] {
  const buckets = new Map<string, LlpExpiryBucket & { engines: Set<string> }>();
  for (let i = 0; i < months; i += 1) {
    const start = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + i, 1));
    buckets.set(start.toISOString(), {
      monthStart: start.toISOString(),
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      count: 0,
      redCount: 0,
      engineCount: 0,
      valueUsd: 0,
      engines: new Set<string>(),
    });
  }

  for (const stack of llpFleetStacks()) {
    for (const line of stack.lines) {
      const expiry = new Date(line.projectedExpiryDate);
      const key = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), 1)).toISOString();
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.count += 1;
      if (line.status === "red") bucket.redCount += 1;
      bucket.valueUsd += line.unitCostUsd;
      bucket.engines.add(stack.engineId);
    }
  }

  return [...buckets.values()].map(({ engines, ...bucket }) => ({ ...bucket, engineCount: engines.size }));
}

/** Fleet roll-up powering the decision header of the LLP module. */
export function llpFleetSummary(): LlpFleetSummary {
  const stacks = llpFleetStacks();
  const lines = stacks.flatMap((s) => s.lines);
  const horizon = addDays(NOW, 90).getTime();
  const mustReplace = lines.filter((l) => l.mustReplace);
  return {
    enginesTracked: stacks.length,
    partsTracked: lines.length,
    redParts: lines.filter((l) => l.status === "red").length,
    amberParts: lines.filter((l) => l.status === "amber").length,
    expiringIn90Days: lines.filter((l) => new Date(l.projectedExpiryDate).getTime() <= horizon).length,
    llpDrivenEngines: stacks.filter((s) => s.driver === "llp-limited").length,
    conditionDrivenEngines: stacks.filter((s) => s.driver === "condition-limited").length,
    stubValueAtRiskUsd: stacks.reduce((sum, s) => sum + s.stubValueUsd, 0),
    recoverableUsd: stacks.reduce((sum, s) => sum + Math.max(0, s.recommendation.netBenefitUsd), 0),
    mustReplaceParts: mustReplace.length,
    mustReplaceCostUsd: mustReplace.reduce((sum, l) => sum + l.unitCostUsd, 0),
    leadTimeAtRiskParts: lines.filter((l) => l.leadTimeAtRisk).length,
    timeline: llpExpiryTimeline(),
  };
}
