/**
 * Prognostics & RUL selectors.
 *
 * Everything here is derived from the deterministic dataset: the per-engine
 * prognostic records supply the limiting failure mode and cycle prediction, the
 * flight log supplies observed utilisation (cycles/day) so cycles can be turned
 * into calendar dates, and the work order book tells us whether a removal slot
 * already exists in the plan.
 */

import type {
  EngineRulAssessment,
  EngineSurvivalCurve,
  FleetRulOutlook,
  Prognostic,
  RulDistributionBucket,
  RulModelProvenance,
  RulPlannedSlot,
  RulUrgency,
  StatusLevel,
  SurvivalPoint,
} from "@rr/types";
import { ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

/** Work order types that can absorb an engine removal. */
const REMOVAL_SLOT_TYPES = new Set(["shop-visit", "module-swap", "base"]);
const LIVE_WORK_ORDER_STATES = new Set(["planned", "released", "in-progress", "awaiting-parts", "draft"]);

/** Fleet-average sectors per day, used when an engine has no recent flights. */
const FALLBACK_CYCLES_PER_DAY = 1.6;
/**
 * The flight log holds a 45-day sample of sectors per aircraft (8–18), not the
 * complete movement history, so the sector count is a relative utilisation
 * index. Dividing by this scales it onto the 1.6–3.6 sectors/day band that
 * wide-body twins actually fly.
 */
const SECTOR_SAMPLE_DIVISOR = 5;

function moduleLabel(code: string): string {
  return ENGINE_MODULES.find((m) => m.code === code)?.label ?? code;
}

/** Observed sectors per day for the aircraft an engine is installed on. */
export function cyclesPerDayForEngine(engineId: string): number {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine?.aircraftId) return FALLBACK_CYCLES_PER_DAY;
  const flights = data.flights.filter((f) => f.aircraftId === engine.aircraftId);
  if (flights.length === 0) return FALLBACK_CYCLES_PER_DAY;
  return round(clamp(flights.length / SECTOR_SAMPLE_DIVISOR, 0.5, 6), 2);
}

/** The prognostic that will take the engine off wing first. */
export function limitingPrognostic(engineId: string): Prognostic | undefined {
  return getDataset()
    .prognostics.filter((p) => p.engineId === engineId)
    .sort((a, b) => a.rulCycles - b.rulCycles || b.probability - a.probability)[0];
}

function urgencyFor(rulDays: number, lowerBoundDays: number, probability: number): RulUrgency {
  if (lowerBoundDays <= 60 || rulDays <= 75 || (probability >= 0.75 && rulDays <= 180)) return "act-now";
  if (lowerBoundDays <= 180 || (probability >= 0.4 && rulDays <= 365)) return "watchlist";
  return "nominal";
}

export function urgencyStatus(urgency: RulUrgency): StatusLevel {
  return urgency === "act-now" ? "red" : urgency === "watchlist" ? "amber" : urgency === "nominal" ? "green" : "grey";
}

function recommendedAction(urgency: RulUrgency, slot: RulPlannedSlot | null, moduleCode: string): string {
  if (urgency === "act-now") {
    if (slot?.insideWindow) return `Confirm removal at ${slot.facilityIcao} — slot already inside the window`;
    if (slot) return `Re-phase ${slot.reference} earlier; current slot falls outside the window`;
    return `Book a removal slot now — no ${moduleCode} capacity is reserved`;
  }
  if (urgency === "watchlist") {
    return slot ? `Hold ${slot.reference}; re-score after the next 100 cycles` : "Pencil a slot at the next planning round";
  }
  return "No action — continue on-wing monitoring";
}

function rationaleFor(
  urgency: RulUrgency,
  rulDays: number,
  lowerBoundDays: number,
  probability: number,
  failureMode: string,
  hasSlot: boolean,
): string {
  if (urgency === "act-now") {
    return `${failureMode} reaches its limit in ${rulDays} days (worst case ${lowerBoundDays} days) at ${Math.round(
      probability * 100,
    )}% exceedance probability${hasSlot ? "" : " and no slot is reserved"}.`;
  }
  if (urgency === "watchlist") {
    return `${failureMode} trends to removal in ${rulDays} days; inside the ${Math.round(
      lowerBoundDays,
    )}-day planning horizon but not yet critical.`;
  }
  return `${failureMode} exceedance probability is ${Math.round(probability * 100)}% with ${rulDays} days of predicted life remaining.`;
}

function slotForEngine(engineId: string, windowFrom: Date, windowTo: Date): RulPlannedSlot | null {
  const data = getDataset();
  const candidates = data.workOrders
    .filter((w) => w.engineId === engineId && REMOVAL_SLOT_TYPES.has(w.type) && LIVE_WORK_ORDER_STATES.has(w.state))
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1));
  const workOrder = candidates[0];
  if (!workOrder) return null;
  const start = new Date(workOrder.scheduledStart);
  const facility = data.facilities.find((f) => f.id === workOrder.facilityId);
  return {
    workOrderId: workOrder.id,
    reference: workOrder.reference,
    facilityIcao: facility?.icao ?? "—",
    scheduledStart: workOrder.scheduledStart,
    type: workOrder.type,
    insideWindow: start >= windowFrom && start <= windowTo,
  };
}

/** Full RUL assessment for a single engine. */
export function engineRulAssessment(engineId: string): EngineRulAssessment | undefined {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine) return undefined;
  const prognostic = limitingPrognostic(engineId);
  if (!prognostic) return undefined;

  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const cyclesPerDay = cyclesPerDayForEngine(engineId);
  const rulDays = Math.round(prognostic.rulCycles / cyclesPerDay);
  const lowerBoundDays = Math.round(prognostic.confidenceInterval.min / cyclesPerDay);

  const opensAt = addDays(NOW, lowerBoundDays);
  const closesAt = addDays(NOW, rulDays);
  const urgency = urgencyFor(rulDays, lowerBoundDays, prognostic.probability);
  const slot = slotForEngine(engineId, opensAt, closesAt);

  // Confidence tightens as the credible interval narrows relative to the P50.
  const spread = (prognostic.confidenceInterval.max - prognostic.confidenceInterval.min) / Math.max(1, prognostic.rulCycles);
  const confidence = round(clamp(1 - spread * 0.55, 0.4, 0.97), 2);

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    operatorCode: operator?.code ?? "—",
    operatorName: operator?.name ?? "Unknown operator",
    aircraftTail: aircraft?.tail ?? null,
    location: engine.location,
    status: urgencyStatus(urgency),
    urgency,
    limitingModule: prognostic.moduleCode,
    limitingModuleLabel: moduleLabel(prognostic.moduleCode),
    failureMode: prognostic.failureMode,
    rulCycles: prognostic.rulCycles,
    confidenceInterval: prognostic.confidenceInterval,
    confidence,
    probability: prognostic.probability,
    cyclesPerDay,
    rulDays,
    removalWindow: {
      opensAt: iso(opensAt),
      closesAt: iso(closesAt),
      days: Math.max(0, rulDays - lowerBoundDays),
    },
    plannedSlot: slot,
    recommendedAction: recommendedAction(urgency, slot, prognostic.moduleCode),
    rationale: rationaleFor(urgency, rulDays, lowerBoundDays, prognostic.probability, prognostic.failureMode, slot !== null),
    egtMargin: engine.egtMargin,
    healthScore: engine.healthScore,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    modelVersion: prognostic.modelVersion,
    computedAt: prognostic.computedAt,
    drivers: [...prognostic.drivers].sort((a, b) => b.contribution - a.contribution),
  };
}

/** Every engine that carries a prognostic, ranked by shortest remaining life. */
export function fleetRulAssessments(): EngineRulAssessment[] {
  return getDataset()
    .engines.map((engine) => engineRulAssessment(engine.id))
    .filter((a): a is EngineRulAssessment => a !== undefined)
    .sort((a, b) => a.rulDays - b.rulDays || a.rulCycles - b.rulCycles);
}

const DISTRIBUTION_BANDS: { label: string; from: number; to: number }[] = [
  { label: "0–250", from: 0, to: 250 },
  { label: "250–500", from: 250, to: 500 },
  { label: "500–1k", from: 500, to: 1000 },
  { label: "1k–1.5k", from: 1000, to: 1500 },
  { label: "1.5k–2k", from: 1500, to: 2000 },
  { label: "2k–3k", from: 2000, to: 3000 },
  { label: "3k–4k", from: 3000, to: 4000 },
  { label: "4k+", from: 4000, to: Number.POSITIVE_INFINITY },
];

/**
 * A band is red when most of the engines in it are act-now and amber when most
 * are act-now or watchlist, so bar colour always agrees with the queue.
 */
function bandStatus(inBand: EngineRulAssessment[]): StatusLevel {
  if (inBand.length === 0) return "grey";
  const actNow = inBand.filter((a) => a.urgency === "act-now").length;
  const watching = inBand.filter((a) => a.urgency === "watchlist").length;
  if (actNow * 2 >= inBand.length) return "red";
  if ((actNow + watching) * 2 >= inBand.length) return "amber";
  return "green";
}

/** Histogram of fleet remaining life, coloured by planning urgency. */
export function rulDistribution(assessments = fleetRulAssessments()): RulDistributionBucket[] {
  return DISTRIBUTION_BANDS.map((band) => {
    const inBand = assessments.filter((a) => a.rulCycles >= band.from && a.rulCycles < band.to);
    return {
      label: band.label,
      from: band.from,
      to: band.to,
      status: bandStatus(inBand),
      engines: inBand.length,
      slotted: inBand.filter((a) => a.plannedSlot?.insideWindow).length,
    };
  });
}

/**
 * Weibull survival and hazard curve for one engine.
 *
 * Shape is inferred from the width of the credible interval — a tight interval
 * means a well-characterised wear-out process (high shape), a wide interval a
 * more random one. Scale is chosen so that survival is 0.5 at the P50 RUL.
 */
export function engineSurvivalCurve(engineId: string, steps = 48): EngineSurvivalCurve | undefined {
  const assessment = engineRulAssessment(engineId);
  if (!assessment) return undefined;
  const { confidenceInterval: ci, rulCycles } = assessment;
  const spread = (ci.max - ci.min) / Math.max(1, rulCycles);
  const shape = round(clamp(4.6 - spread * 3.2, 1.6, 6.5), 2);
  const scaleCycles = Math.round(rulCycles / Math.log(2) ** (1 / shape));
  const horizon = Math.max(ci.max * 1.25, rulCycles * 1.6);

  const points: SurvivalPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const cycles = Math.round((horizon * i) / steps);
    const ratio = cycles / scaleCycles;
    const survival = round(Math.exp(-(ratio ** shape)), 4);
    const hazard = cycles === 0 ? 0 : round(((shape / scaleCycles) * ratio ** (shape - 1)) * 1000, 4);
    points.push({ cycles, survival, hazardPer1kCycles: hazard });
  }

  return {
    engineId: assessment.engineId,
    esn: assessment.esn,
    shape,
    scaleCycles,
    points,
    windowFromCycles: ci.min,
    windowToCycles: rulCycles,
  };
}

/**
 * Provenance for each model version currently scoring the fleet. Accuracy
 * figures are deterministic per model version so the panel is stable across
 * renders and processes.
 */
export function rulModelProvenance(assessments = fleetRulAssessments()): RulModelProvenance[] {
  const byVersion = new Map<string, EngineRulAssessment[]>();
  for (const assessment of assessments) {
    // Point releases are scoring builds of the same model line; planners judge
    // trust at the model line, so provenance is reported per major version.
    const line = `${assessment.modelVersion.split(".")[0]}.x`;
    const bucket = byVersion.get(line) ?? [];
    bucket.push(assessment);
    byVersion.set(line, bucket);
  }

  return [...byVersion.entries()]
    .map(([modelVersion, scored]) => {
      const rng = createRng(`provenance:${modelVersion}`);
      const importance = new Map<string, number>();
      for (const assessment of scored) {
        for (const driver of assessment.drivers) {
          importance.set(driver.label, (importance.get(driver.label) ?? 0) + driver.contribution);
        }
      }
      const featureWeights = [...importance.entries()]
        .map(([label, contribution]) => ({ label, contribution }))
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 5);
      const totalContribution = featureWeights.reduce((sum, d) => sum + d.contribution, 0) || 1;
      const lastScoredAt = scored.reduce((latest, a) => (a.computedAt > latest ? a.computedAt : latest), scored[0]!.computedAt);
      return {
        modelVersion,
        trainedAt: iso(addDays(NOW, -rand.int(rng, 21, 180))),
        enginesScored: scored.length,
        trainingRemovals: rand.int(rng, 480, 2600),
        windowAccuracy: round(rand.float(rng, 0.74, 0.94), 2),
        maeCycles: rand.int(rng, 42, 210),
        earlyCallRate: round(rand.float(rng, 0.55, 0.86), 2),
        features: featureWeights.map((d) => ({ label: d.label, importance: round(d.contribution / totalContribution, 2) })),
        lastScoredAt,
      };
    })
    .sort((a, b) => b.enginesScored - a.enginesScored);
}

/** Everything the Prognostics & RUL page needs, in one deterministic call. */
export function fleetRulOutlook(): FleetRulOutlook {
  const assessments = fleetRulAssessments();
  const actNow = assessments.filter((a) => a.urgency === "act-now");
  const watchlist = assessments.filter((a) => a.urgency === "watchlist");
  const sortedCycles = assessments.map((a) => a.rulCycles).sort((a, b) => a - b);
  const median = sortedCycles.length === 0 ? 0 : sortedCycles[Math.floor(sortedCycles.length / 2)]!;

  return {
    assessments,
    distribution: rulDistribution(assessments),
    provenance: rulModelProvenance(assessments),
    summary: {
      engines: assessments.length,
      actNow: actNow.length,
      watchlist: watchlist.length,
      nominal: assessments.filter((a) => a.urgency === "nominal").length,
      unslottedInside90Days: assessments.filter((a) => a.rulDays <= 90 && !a.plannedSlot?.insideWindow).length,
      medianRulCycles: median,
      cyclesAtRiskInside180Days: assessments.filter((a) => a.rulDays <= 180).reduce((sum, a) => sum + a.rulCycles, 0),
    },
  };
}
