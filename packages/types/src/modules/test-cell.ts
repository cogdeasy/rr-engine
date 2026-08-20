/**
 * Test cell results — post-overhaul pass-off runs.
 *
 * A pass-off run is the acceptance test an engine must pass on the test bed
 * before it can be released to service after a shop visit. Each run measures a
 * fixed set of parameters against the build standard's acceptance limits and
 * produces a pass, a conditional pass (release with a concession) or a fail
 * that forces a rework and a retest.
 */

import type { Iso, ModuleCode, Point, StatusLevel } from "../index";

export type TestCellOutcome = "pass" | "conditional" | "fail" | "running";

/** Standard pass-off schedule points, in the order they are flown on the bed. */
export type TestPointId =
  | "idle"
  | "cruise"
  | "max-continuous"
  | "max-climb"
  | "take-off"
  | "reslam";

export type AcceptanceCriterionId =
  | "thrust"
  | "egtMargin"
  | "vibN1"
  | "vibN2"
  | "vibN3"
  | "fuelFlow"
  | "oilConsumption"
  | "accelTime"
  | "decelTime"
  | "startTime"
  | "oilPressure"
  | "surgeMargin";

export interface AcceptanceCriterion {
  id: AcceptanceCriterionId;
  label: string;
  unit: string;
  /** Measured value at the governing test point. */
  measured: number;
  /** Nominal (expected) value for the build standard. */
  nominal: number;
  /** Acceptance limit. Direction determines whether it is a floor or a ceiling. */
  limit: number;
  /** Attention threshold inside the limit — an amber "watchlist" band. */
  warn: number;
  direction: "higher-is-worse" | "lower-is-worse";
  status: StatusLevel;
  /** Percent of the allowable band consumed; >100 means the limit is breached. */
  marginUsedPct: number;
  testPoint: TestPointId;
  ataChapter: string;
}

/** One sample of the acceleration / deceleration profile flown on the bed. */
export interface TestProfilePoint {
  /** Seconds from the start of the slam schedule. */
  t: number;
  /** Fan speed, percent N1. */
  n1: number;
  egtC: number;
  thrustLbf: number;
  fuelFlowKgH: number;
  vibMm: number;
}

export interface TestCellRun {
  id: string;
  reference: string;
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  buildStandard: string;
  workOrderId: string | null;
  facilityId: string;
  cellId: string;
  /** 1 = first pass-off attempt after the shop visit. */
  attempt: number;
  /** Reference of the first attempt when this run is a retest. */
  retestOf: string | null;
  startedAt: Iso;
  completedAt: Iso | null;
  durationMinutes: number;
  outcome: TestCellOutcome;
  status: StatusLevel;
  /** Headline numbers an operator acts on. */
  thrustAchievedLbf: number;
  thrustRequiredLbf: number;
  egtMarginAtTestC: number;
  /** The engine's EGT margin measured on wing immediately before removal. */
  preRemovalEgtMarginC: number;
  /** Margin the build standard should deliver when new. */
  newEngineEgtMarginC: number;
  /** Percentage of the lost margin recovered by the shop visit. */
  restorationPct: number;
  peakVibrationMm: number;
  fuelFlowKgH: number;
  oilConsumptionLPerH: number;
  criteria: AcceptanceCriterion[];
  profile: TestProfilePoint[];
  /** Populated for conditional and failed runs. */
  failureCause: TestFailureCause | null;
  failureModule: ModuleCode | null;
  observations: string[];
  recommendedAction: string;
  /** Hours of rework the recommended action is expected to consume. */
  reworkHours: number;
  witnessedBy: string;
  releasedToService: boolean;
}

export type TestFailureCause =
  | "EGT margin below acceptance"
  | "Vibration exceedance"
  | "Thrust shortfall"
  | "Fuel flow high"
  | "Oil consumption high"
  | "Slow acceleration"
  | "Oil pressure out of band"
  | "Instrumentation fault";

/** A run without its heavy per-sample payload, for lists and tables. */
export type TestCellRunSummary = Omit<TestCellRun, "profile" | "criteria" | "observations">;

export interface TestCellFleetSummary {
  runs: number;
  engines: number;
  passed: number;
  conditional: number;
  failed: number;
  running: number;
  /** Engines whose first attempt passed, as a percentage of engines tested. */
  firstPassYieldPct: number;
  /** Runs that were a second-or-later attempt, as a percentage of all runs. */
  retestRatePct: number;
  meanRestorationPct: number;
  meanEgtMarginAtTestC: number;
  meanDurationMinutes: number;
  /** Cost of retesting at the standard bed rate. */
  retestCostUsd: number;
  awaitingRelease: number;
  firstPassYieldHistory: Point[];
}

export interface TestFailureCauseStat {
  cause: TestFailureCause;
  runs: number;
  engines: number;
  sharePct: number;
  meanReworkHours: number;
  module: ModuleCode | null;
}

export interface TestCellUtilisation {
  facilityId: string;
  facilityName: string;
  icao: string;
  runs: number;
  passRatePct: number;
  meanDurationMinutes: number;
  cells: number;
}

export interface TestCellFamilyStat {
  family: string;
  runs: number;
  firstPassYieldPct: number;
  meanRestorationPct: number;
  meanEgtMarginAtTestC: number;
  newEngineEgtMarginC: number;
}
