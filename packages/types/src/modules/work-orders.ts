/**
 * Types for the `work-orders` execution module.
 *
 * The module answers "what is blocking the work orders in progress today?", so
 * the vocabulary here is deliberately blocker-first: every open order resolves
 * to a board stage, a set of blockers and a single recommended action.
 */

import type { Alert, Iso, ModuleCode, Severity, StatusLevel, WorkOrder } from "../index";

/** Board columns, in flow order. Derived from `WorkOrderState` plus task progress. */
export type WorkOrderStage = "raised" | "planned" | "in-work" | "awaiting-parts" | "test" | "closed";

export type WorkOrderBlockerKind = "parts" | "labour" | "inspection" | "approval" | "capacity" | "aog";

export interface WorkOrderBlocker {
  id: string;
  kind: WorkOrderBlockerKind;
  /** red = the order cannot progress today, amber = it will stall soon. */
  status: StatusLevel;
  title: string;
  detail: string;
  /** How long the order has been held by this blocker. */
  heldDays: number;
  owner: string;
}

export interface WorkOrderPartLine {
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  qtyRequired: number;
  onHand: number;
  onOrder: number;
  leadTimeDays: number;
  supplier: string;
  nextDeliveryAt: Iso | null;
  status: StatusLevel;
}

export interface WorkOrderTaskLine {
  id: string;
  reference: string;
  title: string;
  ataChapter: string;
  moduleCode: ModuleCode | null;
  state: "open" | "in-progress" | "blocked" | "signed-off";
  estimatedHours: number;
  bookedHours: number;
  skillRequired: string;
  technicianName: string | null;
  /** True when no technician on shift at the facility holds the required skill. */
  skillGap: boolean;
}

export interface WorkOrderRecommendation {
  action: string;
  rationale: string;
  status: StatusLevel;
}

/** A work order enriched with everything the execution controller needs on one row. */
export interface WorkOrderView {
  workOrder: WorkOrder;
  reference: string;
  stage: WorkOrderStage;
  status: StatusLevel;
  priority: Severity;
  engineId: string;
  engineEsn: string;
  engineFamily: string;
  aircraftTail: string | null;
  operatorCode: string;
  operatorName: string;
  facilityIcao: string;
  facilityName: string;
  owner: string;
  /** Days since the order was raised. */
  ageingDays: number;
  /** Days until the promised completion date; negative when overdue. */
  daysToPromise: number;
  overdue: boolean;
  aogLinked: boolean;
  /** Signed-off task cards as a share of all task cards, 0-100. */
  progressPct: number;
  estimatedHours: number;
  bookedHours: number;
  taskLines: WorkOrderTaskLine[];
  partLines: WorkOrderPartLine[];
  blockers: WorkOrderBlocker[];
  alerts: Alert[];
  recommendation: WorkOrderRecommendation;
}

export interface WorkOrderKpis {
  open: number;
  overdue: number;
  awaitingParts: number;
  blocked: number;
  aogLinked: number;
  criticalOpen: number;
  /** Mean raise-to-completion days across closed orders. */
  avgCycleTimeDays: number;
  /** Mean raise-to-completion days across orders closed in the previous period. */
  priorCycleTimeDays: number;
  labourHoursBooked: number;
}

export interface WorkOrderBlockerSummary {
  kind: WorkOrderBlockerKind;
  label: string;
  orders: number;
  status: StatusLevel;
  /** Total days of hold accumulated across the affected orders. */
  heldDays: number;
  topDetail: string;
}

export interface WorkOrderStageSummary {
  stage: WorkOrderStage;
  label: string;
  orders: number;
  overdue: number;
  aogLinked: number;
}
