/**
 * EHM analytics factory: how quickly the team turns an emerging failure mode
 * into a live Diagnostic Notification (DN), how noisy the resulting analytic is,
 * and what disruption it avoids under power-by-the-hour.
 */

import type { StatusLevel } from "../index";

/** The two data strands an analytic can be built on. */
export type AnalyticStrand = "snapshot" | "continuous";

/** Phases of analytic development, in the order they are worked. */
export type DevPhase = "data-exploration" | "parameter-selection" | "model-development" | "validation" | "deployment";

export interface DevPhaseSplit {
  phase: DevPhase;
  label: string;
  /** Working days spent in this phase. */
  days: number;
  /** Share of total cycle time, 0-100. */
  sharePct: number;
}

export interface Analytic {
  id: string;
  /** Failure mode the analytic detects. */
  name: string;
  engineFamily: string;
  strand: AnalyticStrand;
  /** Parameters the model consumes. */
  parameters: number;
  /** Calendar days from requirement capture to production. */
  cycleDays: number;
  /** Contracted target for this strand. */
  targetDays: number;
  phases: DevPhaseSplit[];
  /** Live in production, or still in the backlog / in build. */
  live: boolean;
  /** Notifications raised to operators over the last 12 months. */
  notifications: number;
  /** Internal observations generated over the last 12 months. */
  observations: number;
  /** Confirmed detections / all notifications, 0-100. */
  precisionPct: number;
  falsePositives: number;
  /** Avoidable disruptions caught per six months. */
  avoidableEvents: number;
  /** Disruption cost avoided over 12 months, USD. */
  costAvoidedUsd: number;
  /** Databricks compute spend over 12 months, USD. */
  computeCostUsd: number;
  /** Red = over target and noisy, amber = one of the two, green = neither. */
  status: StatusLevel;
  owner: string;
}

export interface StrandProfile {
  strand: AnalyticStrand;
  label: string;
  analytics: number;
  parameters: number;
  medianCycleDays: number;
  targetDays: number;
  /** Median cycle time as a multiple of target. */
  targetMultiple: number;
  medianPrecisionPct: number;
}

export interface EhmFactorySummary {
  analytics: number;
  live: number;
  backlog: number;
  medianCycleDays: number;
  /** Cycle days that would be removed by hitting target on every analytic. */
  daysAboveTarget: number;
  notifications: number;
  observations: number;
  falsePositives: number;
  medianPrecisionPct: number;
  avoidableEvents: number;
  costAvoidedUsd: number;
  computeCostUsd: number;
  strands: StrandProfile[];
  /** Cycle-time split aggregated across every analytic. */
  phases: DevPhaseSplit[];
}
