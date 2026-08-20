/**
 * Task cards module — execution, sign-off and man-hour tracking.
 *
 * The base `TaskCard` in the core domain model describes what has to be done.
 * These types describe how the card is actually being executed on the floor:
 * step progress, man-hours burned against estimate, tooling and part readiness,
 * the dual mechanic/inspector sign-off and the audit trail it produces.
 */

import type { Iso, ModuleCode, Severity, StatusLevel, TaskCard } from "../index";

export type TaskCardStepState = "done" | "active" | "blocked" | "pending";

export interface TaskCardStep {
  id: string;
  /** 1-based position within the card. */
  index: number;
  instruction: string;
  state: TaskCardStepState;
  estimatedHours: number;
  actualHours?: number;
  /** Steps that cannot be closed by the mechanic alone. */
  requiresInspection: boolean;
  note?: string;
}

export type TaskCardSignOffRole = "mechanic" | "inspector";

export interface TaskCardSignOff {
  role: TaskCardSignOffRole;
  name: string;
  /** Authorisation stamp recorded against the release-to-service. */
  stamp: string;
  at: Iso | null;
}

export interface TaskCardTrailEntry {
  id: string;
  at: Iso;
  actor: string;
  action: string;
  detail: string;
}

export interface TaskCardPartLine {
  partNumber: string;
  description: string;
  qty: number;
  onHand: number;
  leadTimeDays: number;
  status: StatusLevel;
}

/** A task card enriched with everything the shop floor needs to act on it. */
export interface TaskCardExecution {
  card: TaskCard;
  reference: string;
  title: string;
  ataChapter: string;
  moduleCode: ModuleCode | null;
  skillRequired: string;
  state: TaskCard["state"];

  workOrderId: string;
  workOrderReference: string;
  priority: Severity;
  dueAt: Iso;
  engineEsn: string;
  engineFamily: string;
  operatorName: string;
  facilityId: string;
  facilityName: string;
  facilityIcao: string;

  technicianName: string | null;
  inspectorName: string | null;

  estimatedHours: number;
  /** Man-hours booked to the card so far. */
  hoursToDate: number;
  /** Hours the card is forecast to consume at the current burn rate. */
  projectedHours: number;
  varianceHours: number;
  variancePct: number;
  progressPct: number;

  awaitingInspection: boolean;
  blockedReason: string | null;
  status: StatusLevel;
  /** Plain-language explanation of the status colour. */
  reason: string;
  recommendedAction: string;

  steps: TaskCardStep[];
  tooling: string[];
  parts: TaskCardPartLine[];
  safetyNotes: string[];
  signOffs: TaskCardSignOff[];
  trail: TaskCardTrailEntry[];
}

/** Progress roll-up for every card on a single work order. */
export interface WorkOrderCardProgress {
  workOrderId: string;
  reference: string;
  engineEsn: string;
  operatorName: string;
  facilityId: string;
  facilityIcao: string;
  priority: Severity;
  dueAt: Iso;
  totalCards: number;
  signedOff: number;
  inProgress: number;
  blocked: number;
  awaitingInspection: number;
  open: number;
  estimatedHours: number;
  hoursToDate: number;
  projectedHours: number;
  varianceHours: number;
  variancePct: number;
  completionPct: number;
  status: StatusLevel;
  /** The single card most responsible for the roll-up status, if any. */
  worstCardReference: string | null;
  worstCardReason: string | null;
}

export interface TaskCardSummary {
  totalCards: number;
  activeCards: number;
  behindEstimate: number;
  blocked: number;
  awaitingInspection: number;
  signedOff: number;
  estimatedHours: number;
  hoursToDate: number;
  projectedHours: number;
  varianceHours: number;
  variancePct: number;
  /** Man-hours of overrun forecast on cards that are not yet signed off. */
  manHoursAtRisk: number;
  /** Share of signed-off cards closed at or under estimate. */
  firstTimeQualityPct: number;
}

export interface TaskCardVarianceDriver {
  label: string;
  cards: number;
  varianceHours: number;
}
