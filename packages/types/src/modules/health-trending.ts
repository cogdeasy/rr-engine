/**
 * Types for the `health-trending` module — multi-parameter deterioration
 * trending of engine performance parameters against operator/OEM limits.
 */

import type { EngineFamily, Iso, ParameterId, Series, StatusLevel } from "../index";

/** Maintenance or operational events that explain a discontinuity in a trend. */
export type TrendEventKind = "water-wash" | "shop-visit" | "module-change" | "borescope" | "alert";

export interface TrendEvent {
  id: string;
  engineId: string;
  kind: TrendEventKind;
  at: Iso;
  label: string;
  detail: string;
  /** Set when the event relates to a specific trended parameter. */
  parameter?: ParameterId;
}

/** A detected discontinuity: the mean shifts between the windows either side of `at`. */
export interface TrendStepChange {
  at: Iso;
  magnitude: number;
  beforeMean: number;
  afterMean: number;
  /** Multiples of the residual noise level; >= 2.5 is treated as real. */
  sigmaRatio: number;
  significant: boolean;
  /** The maintenance event within +/- 10 days that most likely explains it. */
  attributedTo?: TrendEvent;
}

export interface TrendExceedance {
  from: Iso;
  to: Iso;
  level: "amber" | "red";
  /** Worst reading inside the region. */
  peak: number;
}

export interface TrendStatistics {
  engineId: string;
  parameter: ParameterId;
  unit: string;
  direction: "higher-is-worse" | "lower-is-worse";
  current: number;
  /** First reading in the window, used as the deterioration baseline. */
  baseline: number;
  deltaFromBaseline: number;
  deltaFromBaselinePct: number;
  slopePerDay: number;
  /** The headline deterioration rate an engineer reasons in. */
  slopePer100Cycles: number;
  cyclesPerDay: number;
  rSquared: number;
  residualSigma: number;
  amberThreshold: number;
  redThreshold: number;
  daysToAmber: number | null;
  daysToRed: number | null;
  cyclesToAmber: number | null;
  cyclesToRed: number | null;
  projectedAmberAt: Iso | null;
  projectedRedAt: Iso | null;
  status: StatusLevel;
  /** Plain-language justification for `status` — every red must be explainable. */
  statusReason: string;
  stepChange: TrendStepChange | null;
  exceedances: TrendExceedance[];
}

export interface TrendSeriesBundle {
  engineId: string;
  esn: string;
  family: EngineFamily;
  parameter: ParameterId;
  series: Series;
  statistics: TrendStatistics;
}

export interface FleetBandPoint {
  t: Iso;
  median: number;
  p10: number;
  p90: number;
}

/** Engine measured against the same-family fleet for the same parameter. */
export interface FleetComparison {
  family: EngineFamily;
  parameter: ParameterId;
  sampleSize: number;
  points: FleetBandPoint[];
}

export interface TrendParameterOption {
  id: ParameterId;
  label: string;
  shortLabel: string;
  unit: string;
  direction: "higher-is-worse" | "lower-is-worse";
  amberThreshold: number;
  redThreshold: number;
  ataChapter: string;
}

export interface TrendEngineOption {
  id: string;
  esn: string;
  family: EngineFamily;
  buildStandard: string;
  operator: string;
  operatorCode: string;
  tail: string | null;
  status: StatusLevel;
  egtMargin: number;
  healthScore: number;
  cyclesSinceOverhaul: number;
  /** Percentile of this engine's EGT-margin decay rate within its family (0 = slowest). */
  decayPercentile: number;
}

export interface TrendRecommendation {
  engineId: string;
  esn: string;
  parameter: ParameterId;
  status: StatusLevel;
  headline: string;
  action: string;
  /** Cycles of margin before the recommended action becomes overdue. */
  cyclesAvailable: number | null;
  reason: string;
}

export interface TrendingWorkbenchData {
  windowDays: number;
  generatedAt: Iso;
  parameters: TrendParameterOption[];
  engines: TrendEngineOption[];
  bundles: TrendSeriesBundle[];
  events: TrendEvent[];
  fleetBands: FleetComparison[];
  recommendations: TrendRecommendation[];
}
