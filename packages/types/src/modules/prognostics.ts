/**
 * Prognostics & RUL module types.
 *
 * The module answers a single operational question — "how many cycles can this
 * engine safely stay on wing?" — so every type here is expressed in the units a
 * planner acts on: cycles, days and calendar removal windows.
 */

import type { Iso, ModuleCode, Range, StatusLevel } from "../index";

/** How urgently a removal decision has to be taken for an engine. */
export type RulUrgency = "act-now" | "watchlist" | "nominal" | "no-data";

export interface RulRemovalWindow {
  /** Earliest prudent removal — the lower confidence bound on remaining life. */
  opensAt: Iso;
  /** Latest defensible removal — the P50 prediction. */
  closesAt: Iso;
  /** Width of the window in days; a narrow window is hard to plan around. */
  days: number;
}

/** A planned maintenance event that could absorb the removal. */
export interface RulPlannedSlot {
  workOrderId: string;
  reference: string;
  facilityIcao: string;
  scheduledStart: Iso;
  type: string;
  /** True when the slot falls inside the recommended removal window. */
  insideWindow: boolean;
}

/** Per-engine remaining useful life assessment, ranked fleet-wide. */
export interface EngineRulAssessment {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  location: string;
  status: StatusLevel;
  urgency: RulUrgency;
  /** Limiting module and failure mode — the reason this engine comes off. */
  limitingModule: ModuleCode;
  limitingModuleLabel: string;
  failureMode: string;
  /** P50 remaining useful life in cycles. */
  rulCycles: number;
  /** 80% credible interval on remaining cycles. */
  confidenceInterval: Range;
  /** Model confidence in the prediction, 0-1. */
  confidence: number;
  /** Probability of exceedance inside the model horizon, 0-1. */
  probability: number;
  /** Observed utilisation used to convert cycles into calendar time. */
  cyclesPerDay: number;
  rulDays: number;
  removalWindow: RulRemovalWindow;
  plannedSlot: RulPlannedSlot | null;
  recommendedAction: string;
  /** Plain-language justification for the colour shown against the engine. */
  rationale: string;
  egtMargin: number;
  healthScore: number;
  cyclesSinceOverhaul: number;
  modelVersion: string;
  computedAt: Iso;
  drivers: { label: string; contribution: number }[];
}

/** One bar of the fleet RUL histogram. */
export interface RulDistributionBucket {
  label: string;
  /** Inclusive lower and exclusive upper cycle bound. */
  from: number;
  to: number;
  engines: number;
  status: StatusLevel;
  /** Engines in this bucket that already have a slot in the plan. */
  slotted: number;
}

/** A point on the survival / hazard curve for one engine. */
export interface SurvivalPoint {
  cycles: number;
  /** Probability the engine is still serviceable at this cycle count, 0-1. */
  survival: number;
  /** Instantaneous failure rate per 1,000 cycles. */
  hazardPer1kCycles: number;
}

export interface EngineSurvivalCurve {
  engineId: string;
  esn: string;
  /** Weibull shape; >1 means a wear-out (accelerating) failure process. */
  shape: number;
  /** Weibull scale in cycles. */
  scaleCycles: number;
  points: SurvivalPoint[];
  /** Cycles at which the recommended removal window opens and closes. */
  windowFromCycles: number;
  windowToCycles: number;
}

/** Evidence a planner needs to decide how far to trust the model. */
export interface RulModelProvenance {
  modelVersion: string;
  trainedAt: Iso;
  /** Engines whose current prediction came from this model version. */
  enginesScored: number;
  /** Historical removals used in training. */
  trainingRemovals: number;
  /** Share of removals predicted inside the stated window, 0-1. */
  windowAccuracy: number;
  /** Mean absolute error of the cycle prediction. */
  maeCycles: number;
  /** Proportion of predictions that were early vs late, 0-1. */
  earlyCallRate: number;
  features: { label: string; importance: number }[];
  lastScoredAt: Iso;
}

export interface FleetRulOutlook {
  assessments: EngineRulAssessment[];
  distribution: RulDistributionBucket[];
  provenance: RulModelProvenance[];
  summary: {
    engines: number;
    actNow: number;
    watchlist: number;
    nominal: number;
    /** Engines needing removal inside 90 days with no slot in the plan. */
    unslottedInside90Days: number;
    medianRulCycles: number;
    cyclesAtRiskInside180Days: number;
  };
}
