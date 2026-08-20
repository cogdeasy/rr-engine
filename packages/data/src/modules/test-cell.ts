/**
 * Test cell results — derived pass-off run dataset.
 *
 * Runs are derived deterministically from the shop visits already present in
 * the generated fleet: every completed or in-flight shop visit / module swap
 * ends with a pass-off run on a test bed, and a failed run spawns a retest.
 * Nothing here is hardcoded for display — the page renders whatever the fleet
 * produces.
 */

import type {
  AcceptanceCriterion,
  AcceptanceCriterionId,
  Engine,
  ModuleCode,
  Point,
  StatusLevel,
  TestCellFamilyStat,
  TestCellFleetSummary,
  TestCellRun,
  TestCellRunSummary,
  TestCellUtilisation,
  TestFailureCause,
  TestFailureCauseStat,
  TestPointId,
  TestProfilePoint,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { addHours, clamp, createRng, daysAgo, iso, NOW, rand, round, type Rng } from "../rng";

/** Bed hire and instrumentation cost of a single pass-off run. */
export const TEST_CELL_RUN_COST_USD = 118_000;

const WITNESSES = [
  "A. Hughes (RR Test Authority)",
  "R. Patel (RR Test Authority)",
  "M. Silva (Customer witness)",
  "L. Fischer (RR Test Authority)",
  "Y. Haddad (Customer witness)",
];

const FAILURE_MODULES: Record<TestFailureCause, ModuleCode | null> = {
  "EGT margin below acceptance": "HPT",
  "Vibration exceedance": "FAN",
  "Thrust shortfall": "HPC",
  "Fuel flow high": "COMBUSTOR",
  "Oil consumption high": "GEARBOX",
  "Slow acceleration": "HPC",
  "Oil pressure out of band": "ACCESSORY",
  "Instrumentation fault": "EXTERNALS",
};

const RECOMMENDED_ACTIONS: Record<TestFailureCause, string> = {
  "EGT margin below acceptance": "Re-blend HPT stage 1 blades and refit uprated seal segments, then re-run pass-off",
  "Vibration exceedance": "Trim balance the fan and IP rotor on the bed, then repeat the vibration survey",
  "Thrust shortfall": "Re-shim HPC variable stator vanes and re-calibrate the thrust rig load cell",
  "Fuel flow high": "Replace combustor fuel spray nozzles and re-run the fuel schedule check",
  "Oil consumption high": "Strip and reseal the internal gearbox oil feed; repeat the 3-hour consumption run",
  "Slow acceleration": "Re-schedule EEC acceleration fuel law and re-run the slam acceptance points",
  "Oil pressure out of band": "Replace oil pressure regulating valve and re-run at idle and take-off",
  "Instrumentation fault": "Re-instrument the bed harness and repeat the affected acceptance points only",
};

const PASS_ACTIONS = [
  "Release to service — raise EASA Form 1 and return engine to the operator pool",
  "Release to service — schedule installation at the operator's next base input",
  "Release to service — dispatch to spare engine pool at the operator home base",
];

const CONDITIONAL_ACTIONS = [
  "Release under concession with EHM sampling every sector for the first 50 cycles",
  "Release under concession — re-baseline performance after 25 cycles on wing",
  "Hold for engineering disposition before signing the release certificate",
];

interface CriterionSpec {
  id: AcceptanceCriterionId;
  label: string;
  unit: string;
  direction: AcceptanceCriterion["direction"];
  testPoint: TestPointId;
  ataChapter: string;
}

const CRITERIA_SPECS: CriterionSpec[] = [
  { id: "thrust", label: "Thrust achieved", unit: "lbf", direction: "lower-is-worse", testPoint: "take-off", ataChapter: "71-00" },
  { id: "egtMargin", label: "EGT margin at test", unit: "°C", direction: "lower-is-worse", testPoint: "take-off", ataChapter: "77-20" },
  { id: "vibN1", label: "Vibration N1 (fan)", unit: "mm/s", direction: "higher-is-worse", testPoint: "max-climb", ataChapter: "77-30" },
  { id: "vibN2", label: "Vibration N2 (IP)", unit: "mm/s", direction: "higher-is-worse", testPoint: "max-continuous", ataChapter: "77-30" },
  { id: "vibN3", label: "Vibration N3 (HP)", unit: "mm/s", direction: "higher-is-worse", testPoint: "take-off", ataChapter: "77-30" },
  { id: "fuelFlow", label: "Fuel flow at take-off", unit: "kg/h", direction: "higher-is-worse", testPoint: "take-off", ataChapter: "73-00" },
  { id: "oilConsumption", label: "Oil consumption", unit: "L/h", direction: "higher-is-worse", testPoint: "max-continuous", ataChapter: "79-00" },
  { id: "accelTime", label: "Acceleration idle to take-off", unit: "s", direction: "higher-is-worse", testPoint: "reslam", ataChapter: "73-20" },
  { id: "decelTime", label: "Deceleration take-off to idle", unit: "s", direction: "higher-is-worse", testPoint: "reslam", ataChapter: "73-20" },
  { id: "startTime", label: "Ground start time", unit: "s", direction: "higher-is-worse", testPoint: "idle", ataChapter: "80-00" },
  { id: "oilPressure", label: "Oil pressure", unit: "psi", direction: "lower-is-worse", testPoint: "take-off", ataChapter: "79-30" },
  { id: "surgeMargin", label: "HP surge margin", unit: "%", direction: "lower-is-worse", testPoint: "max-climb", ataChapter: "75-30" },
];

function criterionStatus(measured: number, warn: number, limit: number, direction: AcceptanceCriterion["direction"]): StatusLevel {
  if (direction === "higher-is-worse") return measured >= limit ? "red" : measured >= warn ? "amber" : "green";
  return measured <= limit ? "red" : measured <= warn ? "amber" : "green";
}

/** Percentage of the nominal-to-limit band that the measurement has consumed. */
function marginUsedPct(measured: number, nominal: number, limit: number): number {
  const band = limit - nominal;
  if (band === 0) return 100;
  return round(clamp(((measured - nominal) / band) * 100, -40, 190), 0);
}

function buildCriterion(spec: CriterionSpec, measured: number, nominal: number, warn: number, limit: number): AcceptanceCriterion {
  const dp = spec.unit === "lbf" || spec.unit === "kg/h" ? 0 : 2;
  return {
    id: spec.id,
    label: spec.label,
    unit: spec.unit,
    measured: round(measured, dp),
    nominal: round(nominal, dp),
    limit: round(limit, dp),
    warn: round(warn, dp),
    direction: spec.direction,
    status: criterionStatus(measured, warn, limit, spec.direction),
    marginUsedPct: marginUsedPct(measured, nominal, limit),
    testPoint: spec.testPoint,
    ataChapter: spec.ataChapter,
  };
}

const spec = (id: AcceptanceCriterionId) => CRITERIA_SPECS.find((c) => c.id === id)!;

/** The slam schedule flown at the end of every pass-off run. */
function buildProfile(rng: Rng, thrustLbf: number, egtPeakC: number, fuelFlowKgH: number, peakVib: number): TestProfilePoint[] {
  const points: TestProfilePoint[] = [];
  const total = 180;
  for (let t = 0; t <= total; t += 3) {
    // idle → accelerate → take-off dwell → decelerate → idle
    let fraction: number;
    if (t < 30) fraction = 0.24;
    else if (t < 55) fraction = 0.24 + ((t - 30) / 25) * 0.76;
    else if (t < 110) fraction = 1;
    else if (t < 140) fraction = 1 - ((t - 110) / 30) * 0.76;
    else fraction = 0.24;
    const noise = rand.gaussian(rng, 0, 0.004);
    const f = clamp(fraction + noise, 0.2, 1.02);
    points.push({
      t,
      n1: round(22 + f * 78, 1),
      egtC: round(320 + f ** 1.35 * (egtPeakC - 320), 0),
      thrustLbf: round(f ** 1.5 * thrustLbf, 0),
      fuelFlowKgH: round(0.14 * fuelFlowKgH + f ** 1.4 * fuelFlowKgH * 0.86, 0),
      vibMm: round(clamp(peakVib * (0.35 + f * 0.68) + rand.gaussian(rng, 0, 0.06), 0.2, peakVib * 1.15), 2),
    });
  }
  return points;
}

/** Criteria that force an engineering disposition even on their own. */
const GOVERNING_CRITERIA: AcceptanceCriterionId[] = ["egtMargin", "vibN1", "thrust"];

function outcomeFor(criteria: AcceptanceCriterion[]): "pass" | "conditional" | "fail" {
  const reds = criteria.filter((c) => c.status === "red");
  const ambers = criteria.filter((c) => c.status === "amber");
  if (reds.length > 0) return "fail";
  if (ambers.length >= 2) return "conditional";
  if (ambers.length === 1 && GOVERNING_CRITERIA.includes(ambers[0]!.id)) return "conditional";
  return "pass";
}

function worstCause(criteria: AcceptanceCriterion[]): TestFailureCause | null {
  const offenders = criteria.filter((c) => c.status !== "green");
  const reds = offenders.filter((c) => c.status === "red");
  const worst = [...(reds.length > 0 ? reds : offenders)].sort((a, b) => b.marginUsedPct - a.marginUsedPct)[0];
  if (!worst) return null;
  const map: Partial<Record<AcceptanceCriterionId, TestFailureCause>> = {
    egtMargin: "EGT margin below acceptance",
    vibN1: "Vibration exceedance",
    vibN2: "Vibration exceedance",
    vibN3: "Vibration exceedance",
    thrust: "Thrust shortfall",
    fuelFlow: "Fuel flow high",
    oilConsumption: "Oil consumption high",
    accelTime: "Slow acceleration",
    decelTime: "Slow acceleration",
    oilPressure: "Oil pressure out of band",
    startTime: "Instrumentation fault",
    surgeMargin: "Thrust shortfall",
  };
  return map[worst.id] ?? null;
}

function buildRun(
  engine: Engine,
  workOrderId: string | null,
  facilityId: string,
  attempt: number,
  retestOf: string | null,
  daysBeforeNow: number,
  seedKey: string,
  runNumber: number,
  quality: number,
  live: boolean,
): TestCellRun {
  const rng = createRng(seedKey);
  const familySpec = ENGINE_FAMILIES.find((f) => f.family === engine.family)!;
  const newMargin = familySpec.newEgtMargin;
  const thrustRequired = familySpec.thrustLbf;

  const preRemoval = round(clamp(newMargin * rand.float(rng, 0.03, 0.22) + rand.gaussian(rng, 0, 2), -8, newMargin * 0.35), 1);
  // quality 0..1 — how well the shop visit restored the engine.
  const marginAtTest = round(clamp(newMargin * (0.42 + quality * 0.58) + rand.gaussian(rng, 0, 3.5), 8, newMargin * 1.02), 1);
  const marginLimit = round(newMargin * 0.62, 1);
  const marginWarn = round(newMargin * 0.72, 1);

  const thrustAchieved = round(thrustRequired * (0.978 + quality * 0.042 + rand.gaussian(rng, 0, 0.006)), 0);
  const peakVib = round(clamp(5.6 - quality * 3.9 + rand.gaussian(rng, 0, 0.55), 0.6, 7.2), 2);
  const nominalFuelFlow = thrustRequired * 0.0755;
  const fuelFlow = round(nominalFuelFlow * (1.05 - quality * 0.05 + rand.gaussian(rng, 0, 0.01)), 0);
  const oilConsumption = round(clamp(0.72 - quality * 0.62 + rand.gaussian(rng, 0, 0.09), 0.04, 0.95), 2);
  const accelTime = round(clamp(9.6 - quality * 4.4 + rand.gaussian(rng, 0, 0.7), 3.2, 12), 2);
  const decelTime = round(clamp(8.8 - quality * 4.0 + rand.gaussian(rng, 0, 0.35), 3, 11), 2);
  const startTime = round(clamp(62 - quality * 22 + rand.gaussian(rng, 0, 3), 28, 78), 1);
  const oilPressure = round(clamp(40 + quality * 20 + rand.gaussian(rng, 0, 2.4), 30, 70), 1);
  const surgeMargin = round(clamp(6 + quality * 14 + rand.gaussian(rng, 0, 1.1), 3, 24), 2);

  const criteria: AcceptanceCriterion[] = [
    buildCriterion(spec("thrust"), thrustAchieved, thrustRequired * 1.012, thrustRequired, thrustRequired * 0.99),
    buildCriterion(spec("egtMargin"), marginAtTest, newMargin, marginWarn, marginLimit),
    buildCriterion(spec("vibN1"), peakVib, 1.4, 3.2, 4.5),
    buildCriterion(spec("vibN2"), round(peakVib * rand.float(rng, 0.55, 0.9), 2), 1.2, 2.9, 4.0),
    buildCriterion(spec("vibN3"), round(peakVib * rand.float(rng, 0.45, 0.85), 2), 1.1, 2.7, 3.8),
    buildCriterion(spec("fuelFlow"), fuelFlow, nominalFuelFlow, nominalFuelFlow * 1.028, nominalFuelFlow * 1.045),
    buildCriterion(spec("oilConsumption"), oilConsumption, 0.18, 0.42, 0.6),
    buildCriterion(spec("accelTime"), accelTime, 5.2, 7.4, 8.5),
    buildCriterion(spec("decelTime"), decelTime, 4.8, 6.8, 8.0),
    buildCriterion(spec("startTime"), startTime, 42, 58, 65),
    buildCriterion(spec("oilPressure"), oilPressure, 58, 44, 38),
    buildCriterion(spec("surgeMargin"), surgeMargin, 18, 10, 7),
  ];

  const resolved = live ? "running" : outcomeFor(criteria);
  const cause = resolved === "pass" || resolved === "running" ? null : worstCause(criteria);
  const status: StatusLevel = resolved === "fail" ? "red" : resolved === "conditional" ? "amber" : resolved === "running" ? "grey" : "green";
  const startedAt = daysAgo(daysBeforeNow);
  const durationMinutes = live ? Math.round((NOW.getTime() - startedAt.getTime()) / 60000) : rand.int(rng, 165, 430);
  const restoration = round(
    clamp(((marginAtTest - preRemoval) / Math.max(1, newMargin - preRemoval)) * 100, 0, 100),
    1,
  );

  const observations = [
    `Slam schedule flown to ${familySpec.family} build ${engine.buildStandard} acceptance sheet; ${criteria.length} acceptance points recorded.`,
    `Pass-off run at ${round(thrustAchieved / 1000, 1)}k lbf against a ${round(thrustRequired / 1000, 0)}k lbf rating with a ${marginAtTest}°C EGT margin at take-off.`,
    cause
      ? `${cause} observed at the ${criteria.find((c) => c.status !== "green")?.testPoint ?? "take-off"} point — run stopped for engineering disposition.`
      : "All acceptance points within limits; vibration survey stable across the full speed range.",
  ];

  return {
    id: `TR-${String(runNumber).padStart(4, "0")}`,
    reference: `PO-2026-${String(runNumber).padStart(4, "0")}${attempt > 1 ? `R${attempt - 1}` : ""}`,
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: engine.operatorId,
    buildStandard: engine.buildStandard,
    workOrderId,
    facilityId,
    cellId: `CELL-${rand.int(rng, 1, 4)}`,
    attempt,
    retestOf,
    startedAt: iso(startedAt),
    completedAt: live ? null : iso(addHours(startedAt, durationMinutes / 60)),
    durationMinutes,
    outcome: resolved,
    status,
    thrustAchievedLbf: thrustAchieved,
    thrustRequiredLbf: thrustRequired,
    egtMarginAtTestC: marginAtTest,
    preRemovalEgtMarginC: preRemoval,
    newEngineEgtMarginC: newMargin,
    restorationPct: restoration,
    peakVibrationMm: peakVib,
    fuelFlowKgH: fuelFlow,
    oilConsumptionLPerH: oilConsumption,
    criteria,
    profile: buildProfile(rng, thrustAchieved, 700 + (newMargin - marginAtTest) * 3.4, fuelFlow, peakVib),
    failureCause: cause,
    failureModule: cause ? FAILURE_MODULES[cause] : null,
    observations,
    recommendedAction:
      resolved === "fail" && cause
        ? RECOMMENDED_ACTIONS[cause]
        : resolved === "conditional"
          ? rand.pick(rng, CONDITIONAL_ACTIONS)
          : resolved === "running"
            ? "Run in progress — hold release paperwork until the acceptance sheet is complete"
            : rand.pick(rng, PASS_ACTIONS),
    reworkHours: resolved === "fail" ? rand.int(rng, 18, 220) : resolved === "conditional" ? rand.int(rng, 0, 24) : 0,
    witnessedBy: rand.pick(rng, WITNESSES),
    releasedToService: resolved === "pass" || (resolved === "conditional" && rand.bool(rng, 0.55)),
  };
}

/** Mean daily utilisation used to date an engine's last pass-off from its hours. */
const DAILY_UTILISATION_HOURS = 9.2;

/** Pass-off records older than this are archived out of the operational view. */
const HISTORY_WINDOW_DAYS = 730;

let cachedRuns: TestCellRun[] | null = null;

/**
 * Every pass-off run the shop network has produced in the last two years.
 *
 * An engine earns a pass-off record two ways: it is in the shop now (an open
 * shop visit or module swap), or it has been overhauled before and its hours
 * since overhaul date that shop visit inside the reporting window.
 */
export function getTestCellRuns(): TestCellRun[] {
  if (cachedRuns) return cachedRuns;
  const data = getDataset();
  const beds = data.facilities.filter((f) => f.kind === "test-cell" || f.kind === "overhaul-base" || f.kind === "partner-shop");

  const inShop = new Map<string, { workOrderId: string; facilityId: string; live: boolean }>();
  for (const workOrder of data.workOrders) {
    if (workOrder.type !== "shop-visit" && workOrder.type !== "module-swap") continue;
    if (workOrder.state !== "complete" && workOrder.state !== "in-progress") continue;
    if (inShop.has(workOrder.engineId)) continue;
    inShop.set(workOrder.engineId, {
      workOrderId: workOrder.id,
      facilityId: workOrder.facilityId,
      live: workOrder.state === "in-progress",
    });
  }

  const runs: TestCellRun[] = [];
  let n = 0;

  for (const engine of data.engines) {
    const shop = inShop.get(engine.id);
    const overhauledBefore = engine.totalFlightCycles > engine.cyclesSinceOverhaul + 200;
    const daysSinceOverhaul = Math.round(engine.hoursSinceOverhaul / DAILY_UTILISATION_HOURS);
    if (!shop && (!overhauledBefore || daysSinceOverhaul > HISTORY_WINDOW_DAYS)) continue;

    const rng = createRng(`test-cell:${engine.id}`);
    const bed = beds.find((f) => f.id === shop?.facilityId) ?? rand.pick(rng, beds);
    // Deeply deteriorated engines are the hardest to restore to acceptance.
    const quality = clamp(0.2 + (engine.healthScore / 100) * 0.72 + rand.gaussian(rng, 0, 0.22), 0.04, 0.995);
    const firstDays = shop?.live ? rand.int(rng, 0, 9) : Math.min(HISTORY_WINDOW_DAYS, Math.max(1, daysSinceOverhaul));

    n += 1;
    const first = buildRun(
      engine,
      shop?.workOrderId ?? null,
      bed.id,
      1,
      null,
      firstDays,
      `test-cell:${engine.id}:1`,
      n,
      quality,
      Boolean(shop?.live) && rand.bool(rng, 0.35),
    );
    runs.push(first);

    let previous = first;
    let previousDays = firstDays;
    for (let attempt = 2; attempt <= 3 && previous.outcome === "fail"; attempt += 1) {
      // Count back from the previous attempt so retests stay in chronological order.
      const nextDays = Math.max(0, previousDays - rand.int(rng, 4, 26));
      n += 1;
      const retest = buildRun(
        engine,
        shop?.workOrderId ?? null,
        bed.id,
        attempt,
        previous.reference,
        nextDays,
        `test-cell:${engine.id}:${attempt}`,
        n,
        clamp(quality + 0.18 * (attempt - 1) + rand.float(rng, 0, 0.12), 0.04, 0.995),
        nextDays < 3 && rand.bool(rng, 0.45),
      );
      runs.push(retest);
      previous = retest;
      previousDays = nextDays;
    }
  }

  cachedRuns = runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return cachedRuns;
}

/** Strips the per-sample payload so lists can be handed to client components. */
export function toTestCellRunSummary(run: TestCellRun): TestCellRunSummary {
  const { profile, criteria, observations, ...summary } = run;
  void profile;
  void criteria;
  void observations;
  return summary;
}

export function getTestCellRun(runId: string): TestCellRun | undefined {
  return getTestCellRuns().find((r) => r.id === runId || r.reference === runId);
}

export function getTestCellRunsForEngine(engineId: string): TestCellRun[] {
  return getTestCellRuns().filter((r) => r.engineId === engineId || r.esn === engineId);
}

/** The runs that still need a human decision: failures and unreleased conditionals. */
export function getTestCellActionQueue(): TestCellRun[] {
  const byEngineLatest = new Map<string, TestCellRun>();
  for (const run of getTestCellRuns()) {
    if (!byEngineLatest.has(run.engineId)) byEngineLatest.set(run.engineId, run);
  }
  return [...byEngineLatest.values()]
    .filter((run) => run.outcome === "fail" || (run.outcome === "conditional" && !run.releasedToService) || run.outcome === "running")
    .sort((a, b) => rankOutcome(b) - rankOutcome(a) || (a.startedAt < b.startedAt ? 1 : -1));
}

function rankOutcome(run: TestCellRun): number {
  return run.outcome === "fail" ? 3 : run.outcome === "conditional" ? 2 : run.outcome === "running" ? 1 : 0;
}

function mean(values: number[], dp = 1): number {
  if (values.length === 0) return 0;
  return round(values.reduce((s, v) => s + v, 0) / values.length, dp);
}

function firstPassYieldFor(runs: TestCellRun[]): number {
  const engines = new Set(runs.map((r) => r.engineId));
  if (engines.size === 0) return 0;
  let passedFirst = 0;
  for (const engineId of engines) {
    const first = runs.filter((r) => r.engineId === engineId).find((r) => r.attempt === 1);
    if (first && first.outcome === "pass") passedFirst += 1;
  }
  return round((passedFirst / engines.size) * 100, 1);
}

/** Ten-month first-pass yield history, bucketed by run start month. */
function yieldHistory(runs: TestCellRun[]): Point[] {
  const points: Point[] = [];
  for (let i = 9; i >= 0; i -= 1) {
    const from = daysAgo((i + 1) * 30).getTime();
    const to = daysAgo(i * 30).getTime();
    const bucket = runs.filter((r) => {
      if (r.attempt !== 1) return false;
      const t = new Date(r.startedAt).getTime();
      return t >= from && t < to;
    });
    points.push({ t: iso(daysAgo(i * 30)), v: bucket.length > 0 ? firstPassYieldFor(bucket) : 0 });
  }
  return points.filter((p) => p.v > 0);
}

export function testCellFleetSummary(runs = getTestCellRuns()): TestCellFleetSummary {
  const completed = runs.filter((r) => r.outcome !== "running");
  const retests = runs.filter((r) => r.attempt > 1);
  return {
    runs: runs.length,
    engines: new Set(runs.map((r) => r.engineId)).size,
    passed: runs.filter((r) => r.outcome === "pass").length,
    conditional: runs.filter((r) => r.outcome === "conditional").length,
    failed: runs.filter((r) => r.outcome === "fail").length,
    running: runs.filter((r) => r.outcome === "running").length,
    firstPassYieldPct: firstPassYieldFor(runs),
    retestRatePct: runs.length === 0 ? 0 : round((retests.length / runs.length) * 100, 1),
    meanRestorationPct: mean(completed.map((r) => r.restorationPct)),
    meanEgtMarginAtTestC: mean(completed.map((r) => r.egtMarginAtTestC)),
    meanDurationMinutes: mean(completed.map((r) => r.durationMinutes), 0),
    retestCostUsd: retests.length * TEST_CELL_RUN_COST_USD,
    // Failed runs are counted separately — they need rework, not a release decision.
    awaitingRelease: runs.filter((r) => r.outcome === "conditional" && !r.releasedToService).length,
    firstPassYieldHistory: yieldHistory(runs),
  };
}

export function testCellFailureCauses(runs = getTestCellRuns()): TestFailureCauseStat[] {
  const failing = runs.filter((r) => r.failureCause !== null);
  const grouped = new Map<TestFailureCause, TestCellRun[]>();
  for (const run of failing) {
    const cause = run.failureCause!;
    grouped.set(cause, [...(grouped.get(cause) ?? []), run]);
  }
  return [...grouped.entries()]
    .map(([cause, causeRuns]) => ({
      cause,
      runs: causeRuns.length,
      engines: new Set(causeRuns.map((r) => r.engineId)).size,
      sharePct: round((causeRuns.length / Math.max(1, failing.length)) * 100, 1),
      meanReworkHours: mean(causeRuns.map((r) => r.reworkHours), 0),
      module: FAILURE_MODULES[cause],
    }))
    .sort((a, b) => b.runs - a.runs);
}

export function testCellUtilisation(runs = getTestCellRuns()): TestCellUtilisation[] {
  const data = getDataset();
  const grouped = new Map<string, TestCellRun[]>();
  for (const run of runs) grouped.set(run.facilityId, [...(grouped.get(run.facilityId) ?? []), run]);
  return [...grouped.entries()]
    .map(([facilityId, facilityRuns]) => {
      const facility = data.facilities.find((f) => f.id === facilityId);
      const completed = facilityRuns.filter((r) => r.outcome !== "running");
      return {
        facilityId,
        facilityName: facility?.name ?? facilityId,
        icao: facility?.icao ?? "—",
        runs: facilityRuns.length,
        passRatePct:
          completed.length === 0 ? 0 : round((completed.filter((r) => r.outcome === "pass").length / completed.length) * 100, 1),
        meanDurationMinutes: mean(completed.map((r) => r.durationMinutes), 0),
        cells: new Set(facilityRuns.map((r) => r.cellId)).size,
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

export function testCellFamilyStats(runs = getTestCellRuns()): TestCellFamilyStat[] {
  const grouped = new Map<string, TestCellRun[]>();
  for (const run of runs) grouped.set(run.family, [...(grouped.get(run.family) ?? []), run]);
  return [...grouped.entries()]
    .map(([family, familyRuns]) => ({
      family,
      runs: familyRuns.length,
      firstPassYieldPct: firstPassYieldFor(familyRuns),
      meanRestorationPct: mean(familyRuns.map((r) => r.restorationPct)),
      meanEgtMarginAtTestC: mean(familyRuns.map((r) => r.egtMarginAtTestC)),
      newEngineEgtMarginC: ENGINE_FAMILIES.find((f) => f.family === family)?.newEgtMargin ?? 0,
    }))
    .sort((a, b) => b.runs - a.runs);
}
