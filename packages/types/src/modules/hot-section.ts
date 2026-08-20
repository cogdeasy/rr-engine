/**
 * Hot section condition — domain types.
 *
 * The module answers one question: how much hot section life remains before a
 * shop visit is forced? Everything here is derived from the generated fleet in
 * `@rr/data`; nothing is presentation state.
 */

import type { Iso, ModuleCode, StatusLevel } from "../index";

/** Point on an EGT margin deterioration curve, plotted against cycles since overhaul. */
export interface HotSectionMarginPoint {
  cycles: number;
  margin: number;
  at: Iso;
  /** Set when an on-wing water wash was performed at this point. */
  wash?: boolean;
}

/** Family deterioration band (p10 / p50 / p90 of the fleet at the same life point). */
export interface HotSectionBandPoint {
  cycles: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface HotSectionMarginCurve {
  engineId: string;
  esn: string;
  family: string;
  /** Observed margin history, oldest first. */
  history: HotSectionMarginPoint[];
  /** Forward projection at the current deterioration rate, ending at zero margin. */
  projection: HotSectionMarginPoint[];
  /** Family deterioration band over the same cycle range. */
  band: HotSectionBandPoint[];
  /** Certified overhaul interval for the family, in cycles. */
  overhaulIntervalCycles: number;
  amberThreshold: number;
  redThreshold: number;
}

/** One cell of the per-module hot section condition matrix. */
export interface HotSectionIndicator {
  id: string;
  label: string;
  moduleCode: ModuleCode;
  /** Distress index, 0 (as new) to 100 (serviceable limit reached). */
  index: number;
  status: StatusLevel;
  /** Evidence behind the index — inspection, prognostic model or both. */
  evidence: string;
  lastInspectedAt: Iso | null;
}

/** Share of the deterioration rate attributable to one driver. */
export interface HotSectionDriver {
  label: string;
  /** Fraction of the total, 0-1. */
  share: number;
  detail: string;
}

export interface HotSectionWashEvent {
  at: Iso;
  cyclesAt: number;
  marginRecoveredC: number;
  downtimeHours: number;
  facilityIcao: string;
}

export interface HotSectionWashProfile {
  engineId: string;
  events: HotSectionWashEvent[];
  /** Mean margin recovered across the recorded washes. */
  meanRecoveredC: number;
  /** Recovery expected from a wash performed now, °C. */
  expectedRecoveryC: number;
  lastWashAt: Iso | null;
  daysSinceLastWash: number | null;
  recommendedIntervalDays: number;
  nextWashDueAt: Iso;
  overdueDays: number;
  /** Days the removal date moves right if the engine is washed now. */
  deferralDays: number;
  status: StatusLevel;
}

export type HotSectionActionKind = "wash" | "borescope" | "workscope" | "monitor" | "reroute";

export interface HotSectionAction {
  kind: HotSectionActionKind;
  label: string;
  detail: string;
  status: StatusLevel;
  /** Deadline for the action, when the domain implies one. */
  byDate: Iso | null;
}

export interface HotSectionAssessment {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  tail: string | null;
  location: string;
  egtMargin: number;
  newEgtMargin: number;
  cyclesSinceOverhaul: number;
  overhaulIntervalCycles: number;
  environmentSeverity: number;
  /** Mean take-off derate across recent sectors, %. */
  meanDeratePct: number;
  /** Cycles flown per day, from recent sector history. */
  cyclesPerDay: number;
  /** Current deterioration rate in °C of EGT margin per 100 cycles. */
  deteriorationRatePer100Cycles: number;
  /** Family median rate at the same life point, for comparison. */
  familyMedianRatePer100Cycles: number;
  cyclesToExhaustion: number;
  daysToExhaustion: number;
  exhaustionDate: Iso;
  /** Composite restoration urgency, 0-100 (higher = sooner). */
  urgency: number;
  status: StatusLevel;
  /** Worst hot section distress index across the condition matrix. */
  worstIndicatorIndex: number;
  indicators: HotSectionIndicator[];
  drivers: HotSectionDriver[];
  wash: HotSectionWashProfile;
  action: HotSectionAction;
  openAlertCount: number;
  plannedShopVisitAt: Iso | null;
}

export interface HotSectionFleetSummary {
  enginesAssessed: number;
  red: number;
  amber: number;
  green: number;
  /** Engines whose margin is exhausted inside the planning horizon. */
  exhaustingWithin180Days: number;
  earliestExhaustion: { engineId: string; esn: string; at: Iso; days: number } | null;
  medianRatePer100Cycles: number;
  /** Margin recoverable across the fleet by washing every wash-due engine now. */
  recoverableMarginC: number;
  washesOverdue: number;
  /** Engines with no recent hot section inspection evidence. */
  awaitingEvidence: number;
}
