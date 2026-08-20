/**
 * Reliability KPIs module — domain contracts.
 *
 * The module answers a single question: "is fleet reliability trending toward
 * or away from target?" Everything below is derived from the generated fleet in
 * `@rr/data`; nothing here is display-only formatting.
 */

import type { EngineFamily, Iso, ModuleCode, Point, StatusLevel, Trend } from "../index";

/** The five contractual reliability measures reported to operators. */
export type ReliabilityMetricId =
  | "dispatch-reliability"
  | "ifsd-rate"
  | "unscheduled-removal-rate"
  | "delay-cancellation-rate"
  | "mtbur";

/** Whether a higher reading is better (dispatch reliability) or worse (IFSD rate). */
export type MetricDirection = "higher-is-better" | "lower-is-better";

export interface ReliabilityMetricDefinition {
  id: ReliabilityMetricId;
  label: string;
  /** Uppercase micro-label shown above the numeric. */
  shortLabel: string;
  unit: string;
  direction: MetricDirection;
  /** Fleet-level contractual target. */
  target: number;
  /** Fractional deviation from target at which the metric turns amber. */
  amberTolerance: number;
  decimals: number;
  description: string;
}

/** A metric evaluated over the rolling 12-month window for one population. */
export interface ReliabilityMeasure {
  id: ReliabilityMetricId;
  value: number;
  target: number;
  /** Signed attainment: 100 = exactly on target, >100 = better than target. */
  attainmentPct: number;
  status: StatusLevel;
  trend: Trend;
  /** Percentage change from the start of the rolling window to the current reading. */
  deltaPct: number;
  /** Rolling 12-month history, oldest first. */
  history: Point[];
}

export type ReliabilitySegmentKind = "fleet" | "family" | "operator";

/** A population (whole fleet, an engine family or an operator) with its measures. */
export interface ReliabilitySegment {
  id: string;
  kind: ReliabilitySegmentKind;
  label: string;
  sublabel: string;
  engines: number;
  /** Engine flight hours accumulated over the rolling window. */
  efh: number;
  /** Departures flown by the population over the rolling window. */
  departures: number;
  measures: Record<ReliabilityMetricId, ReliabilityMeasure>;
  /** Worst-performing measure — the reason the segment is red or amber. */
  driverMetricId: ReliabilityMetricId;
  status: StatusLevel;
}

/** One bar of the removal-cause Pareto. */
export interface RemovalCause {
  id: string;
  cause: string;
  moduleCode: ModuleCode;
  ataChapter: string;
  removals: number;
  sharePct: number;
  cumulativePct: number;
  /** Mean shop turn-around time for removals attributed to this cause. */
  meanTatDays: number;
  costUsd: number;
  /** True for the causes that make up the leading 80% of removals. */
  vitalFew: boolean;
  status: StatusLevel;
}

export interface RecurringDefect {
  id: string;
  title: string;
  moduleCode: ModuleCode;
  ataChapter: string;
  family: EngineFamily;
  occurrences: number;
  engines: number;
  operators: number;
  /** Mean engine flight hours between occurrences of this defect. */
  mtbfHours: number;
  lastOccurredAt: Iso;
  trend: Trend;
  status: StatusLevel;
  recommendedAction: string;
}

/** Deterministic two-parameter Weibull fit for one failure mode. */
export interface WeibullFit {
  id: string;
  failureMode: string;
  moduleCode: ModuleCode;
  /** Shape — <1 infant mortality, ~1 random, >1 wear-out. */
  beta: number;
  /** Characteristic life (63.2% failed), cycles. */
  etaCycles: number;
  /** Cycles by which 10% of the population is expected to have failed. */
  b10Cycles: number;
  medianLifeCycles: number;
  /** Number of removal/alert observations behind the fit. */
  samples: number;
  /** Goodness of fit of the median-rank regression, 0-1. */
  rSquared: number;
  regime: "infant-mortality" | "random" | "wear-out";
  status: StatusLevel;
  /** Survival curve, cycles vs reliability 0-1. */
  curve: { cycles: number; reliability: number; hazard: number }[];
  /** Engines currently past B10 for this mode. */
  enginesPastB10: number;
  /** Mean predicted survival across the fleet at its current cycles since overhaul, percent. */
  fleetSurvivalPct: number;
}

export interface ScorecardRow {
  id: string;
  label: string;
  sublabel: string;
  metricId: ReliabilityMetricId;
  value: number;
  target: number;
  unit: string;
  decimals: number;
  attainmentPct: number;
  status: StatusLevel;
  trend: Trend;
  history: Point[];
}

/** A concrete next step the reliability engineer can take from this page. */
export interface ReliabilityAction {
  id: string;
  title: string;
  rationale: string;
  metricId: ReliabilityMetricId;
  status: StatusLevel;
  owner: string;
  /** Engines the action applies to. */
  engineIds: string[];
  impact: string;
  href: string;
}

export interface ReliabilityOverview {
  generatedAt: Iso;
  windowMonths: number;
  definitions: ReliabilityMetricDefinition[];
  fleet: ReliabilitySegment;
  families: ReliabilitySegment[];
  operators: ReliabilitySegment[];
  causes: RemovalCause[];
  defects: RecurringDefect[];
  weibull: WeibullFit[];
  scorecard: ScorecardRow[];
  actions: ReliabilityAction[];
  /** Counts behind the headline numbers, for the evidence strip. */
  evidence: {
    unscheduledRemovals: number;
    ifsdEvents: number;
    delayEvents: number;
    departures: number;
    efh: number;
    engines: number;
  };
}
