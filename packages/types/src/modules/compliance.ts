/**
 * Airworthiness compliance (`compliance` module).
 *
 * A service bulletin or airworthiness directive is applicable to a population of
 * engines; each engine-level obligation is a `ComplianceTask` with its own
 * governing limit (calendar date, flight hours or flight cycles), embodiment
 * state and evidence of accomplishment.
 */

import type { EngineFamily, Iso, StatusLevel } from "../index";

/** The limit that runs out first for a given engine-level obligation. */
export type ComplianceLimitDriver = "calendar" | "hours" | "cycles";

export type ComplianceDisposition = "overdue" | "due-soon" | "planned" | "embodied" | "not-applicable";

/** Certificate of accomplishment recorded against an embodied task. */
export interface ComplianceEvidence {
  certificateRef: string;
  embodiedAt: Iso;
  signatory: string;
  facilityIcao: string;
  workOrderReference: string | null;
}

/** An opportunity to embody the bulletin inside already-planned downtime. */
export interface ComplianceBundleOption {
  workOrderId: string;
  workOrderReference: string;
  facilityIcao: string;
  scheduledStart: Iso;
  /** Slack between the planned shop input and the compliance deadline. */
  marginDays: number;
  /** Avoided access, transport and out-of-service cost when bundled. */
  savingUsd: number;
}

/** One bulletin applied to one engine — the atomic unit of compliance. */
export interface ComplianceTask {
  id: string;
  bulletinId: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  mandatory: boolean;
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  onWing: boolean;
  embodied: boolean;
  evidence: ComplianceEvidence | null;
  /** Calendar deadline published with the bulletin. */
  dueAt: Iso;
  calendarDaysRemaining: number;
  /** Utilisation limits, where the bulletin imposes them. */
  hoursLimit: number | null;
  cyclesLimit: number | null;
  hoursRemaining: number | null;
  cyclesRemaining: number | null;
  /** Days to the first limit to expire, across all drivers. */
  daysRemaining: number;
  drivingLimit: ComplianceLimitDriver;
  disposition: ComplianceDisposition;
  status: StatusLevel;
  labourHours: number;
  costUsd: number;
  bundle: ComplianceBundleOption | null;
  recommendedAction: string;
}

/** Bulletin-level roll-up across its applicable engine population. */
export interface ComplianceBulletin {
  id: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  family: EngineFamily;
  mandatory: boolean;
  issuedAt: Iso;
  dueAt: Iso;
  applicabilityRule: string;
  applicable: number;
  embodied: number;
  outstanding: number;
  overdue: number;
  dueSoon: number;
  bundleable: number;
  compliancePct: number;
  status: StatusLevel;
  labourHoursPerEngine: number;
  outstandingLabourHours: number;
  outstandingCostUsd: number;
  /** Earliest outstanding deadline in the population. */
  nextDueAt: Iso | null;
  recommendedAction: string;
}

export interface ComplianceOperatorRollup {
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  engines: number;
  applicable: number;
  embodied: number;
  overdue: number;
  dueSoon: number;
  compliancePct: number;
  status: StatusLevel;
  exposureUsd: number;
}

/** Outstanding obligations grouped into planning buckets. */
export interface ComplianceHorizonBucket {
  id: string;
  label: string;
  tasks: number;
  labourHours: number;
  status: StatusLevel;
}

export interface ComplianceSummary {
  /** Planning horizon in days used to classify "due soon". */
  horizonDays: number;
  bulletins: number;
  mandatoryBulletins: number;
  applicableTasks: number;
  embodiedTasks: number;
  outstandingTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  bundleableTasks: number;
  compliancePct: number;
  mandatoryCompliancePct: number;
  enginesAffected: number;
  enginesOverdue: number;
  outstandingLabourHours: number;
  outstandingCostUsd: number;
  bundleSavingUsd: number;
  horizon: ComplianceHorizonBucket[];
}

/** One cell of the engine x bulletin compliance matrix. */
export interface ComplianceMatrixCell {
  bulletinId: string;
  taskId: string | null;
  status: StatusLevel;
  disposition: ComplianceDisposition;
  daysRemaining: number | null;
}

export interface ComplianceMatrixRow {
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorCode: string;
  aircraftTail: string | null;
  overdue: number;
  dueSoon: number;
  outstanding: number;
  compliancePct: number;
  status: StatusLevel;
  cells: ComplianceMatrixCell[];
}

export interface ComplianceMatrix {
  bulletins: {
    id: string;
    reference: string;
    kind: "SB" | "AD" | "ASB";
    mandatory: boolean;
    status: StatusLevel;
  }[];
  rows: ComplianceMatrixRow[];
}
