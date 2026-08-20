/**
 * Types for the alert triage module (`/alerts`).
 *
 * The triage queue enriches raw `Alert` records with the fleet context a duty
 * controller needs to disposition them: which engine and airframe they sit on,
 * how long is left before the aircraft flies again, and the evidence behind the
 * trigger.
 */

import type { Alert, Iso, Series, StatusLevel, WorkOrder } from "../index";

/** Dispositions a controller can apply to an alert from the triage queue. */
export type DispositionKind = "acknowledge" | "escalate" | "raise-work-order" | "false-positive";

export interface DispositionEntry {
  id: string;
  alertId: string;
  kind: DispositionKind;
  at: Iso;
  actor: string;
  /** Resulting alert state after the disposition was applied. */
  resultingState: Alert["state"];
  detail: string;
}

/** An alert plus the fleet context needed to triage it without another lookup. */
export interface TriageAlert {
  alert: Alert;
  engineId: string;
  esn: string;
  family: string;
  /** Installed position label, e.g. "#2", or "off wing". */
  positionLabel: string;
  engineStatus: StatusLevel;
  engineHealthScore: number;
  egtMargin: number;
  aircraftTail: string | null;
  aircraftType: string | null;
  operatorCode: string;
  operatorName: string;
  /** Hours until the airframe's next scheduled departure; null when not flying. */
  hoursToNextSector: number | null;
  nextSectorAt: Iso | null;
  /** True when the recommended action must be closed out before the aircraft flies again. */
  needsActionBeforeNextSector: boolean;
  /** Hours since the alert was raised. */
  ageHours: number;
  /** Composite ranking score: severity first, then urgency. Higher triages first. */
  priorityScore: number;
  /** Number of other open alerts on the same engine. */
  relatedOpenAlerts: number;
  workOrderReference: string | null;
}

/** Evidence assembled for the detail pane of a single alert. */
export interface AlertEvidence {
  alertId: string;
  /** Trend of the parameter that triggered the alert, with thresholds. */
  series: Series | null;
  parameterLabel: string | null;
  parameterUnit: string | null;
  latestValue: number | null;
  amberThreshold: number | null;
  redThreshold: number | null;
  direction: "higher-is-worse" | "lower-is-worse" | null;
  /** Other open alerts on the same engine. */
  relatedAlerts: Alert[];
  workOrder: WorkOrder | null;
  /** Historical disposition activity already recorded against this alert. */
  history: DispositionEntry[];
}

export interface TriageSummary {
  total: number;
  bySeverity: Record<Alert["severity"], number>;
  byState: Record<Alert["state"], number>;
  bySource: Record<string, number>;
  /** Open alerts whose action deadline falls before the next departure. */
  beforeNextSector: number;
  /** Open alerts already past their action deadline. */
  overdue: number;
  criticalUnactioned: number;
  medianAgeHours: number;
  enginesAffected: number;
}
