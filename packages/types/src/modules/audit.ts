/**
 * Audit trail module types.
 *
 * The audit trail is the platform's evidential record: every consequential
 * action (alert disposition, work order state change, sign-off, configuration
 * change) is captured as an append-only {@link AuditRecord} carrying the actor,
 * the before/after of what changed and the evidence the decision rested on.
 * Records are hash-chained so that any retrospective edit is detectable.
 */

import type { Iso, Severity, StatusLevel } from "../index";

export type AuditActorKind = "engineer" | "controller" | "planner" | "quality" | "operator" | "system";

export type AuditEntityType =
  | "Engine"
  | "Alert"
  | "WorkOrder"
  | "TaskCard"
  | "ServiceBulletin"
  | "Contract"
  | "Configuration";

export type AuditCategory =
  | "alert-disposition"
  | "work-order"
  | "sign-off"
  | "configuration"
  | "compliance"
  | "commercial";

export type AuditEvidenceKind = "telemetry" | "prognostic" | "borescope" | "document" | "policy" | "inspection";

export interface AuditActor {
  id: string;
  name: string;
  handle: string;
  kind: AuditActorKind;
  role: string;
  organisation: string;
}

/** One field mutated by an action; `null` means the field had no prior value. */
export interface AuditFieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface AuditEvidence {
  kind: AuditEvidenceKind;
  reference: string;
  label: string;
}

export interface AuditRecord {
  id: string;
  /** Monotonic position in the append-only ledger; 1 is the oldest record. */
  sequence: number;
  at: Iso;
  actor: AuditActor;
  /** Dotted action verb, e.g. `alert.escalated`. */
  action: string;
  category: AuditCategory;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  /** Engine context, where the entity resolves to one. */
  engineId?: string;
  esn?: string;
  operatorId?: string;
  operatorCode?: string;
  detail: string;
  changes: AuditFieldChange[];
  evidence: AuditEvidence[];
  /** Set when the actor departed from the model or procedural recommendation. */
  override: boolean;
  /** Justification captured at the time of an override. */
  overrideReason?: string;
  /** Quality-gated actions need a second signature before they are final. */
  requiresCountersignature: boolean;
  countersignedBy?: string;
  countersignedAt?: Iso;
  severity: Severity;
  /**
   * Operational colour: red = unresolved evidential gap that must be closed,
   * amber = watchlist, green = complete and countersigned, grey = system noise.
   */
  status: StatusLevel;
  /** Hash of this record's canonical form chained onto {@link previousHash}. */
  hash: string;
  previousHash: string;
}

export interface AuditDayGroup {
  /** `YYYY-MM-DD` in UTC. */
  date: string;
  records: AuditRecord[];
  overrides: number;
  awaitingCountersignature: number;
}

export interface AuditIntegrity {
  totalRecords: number;
  firstAt: Iso;
  lastAt: Iso;
  headHash: string;
  /** True when every record's hash matches its recomputed canonical form. */
  chainVerified: boolean;
  brokenAt: string[];
  retentionYears: number;
  retentionUntil: Iso;
  lastVerifiedAt: Iso;
  writeMode: "append-only";
}

export interface AuditActorSummary {
  actor: AuditActor;
  records: number;
  overrides: number;
  awaitingCountersignature: number;
  lastActiveAt: Iso;
}

export interface AuditAttentionItem {
  record: AuditRecord;
  reason: string;
  ageHours: number;
}

export interface AuditEntityTimeline {
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  engineId?: string;
  esn?: string;
  operatorCode?: string;
  records: AuditRecord[];
  firstAt: Iso;
  lastAt: Iso;
  overrides: number;
  distinctActors: number;
}

export interface AuditTrailSummary {
  records: AuditRecord[];
  integrity: AuditIntegrity;
  actors: AuditActorSummary[];
  attention: AuditAttentionItem[];
  countsByCategory: Record<AuditCategory, number>;
  countsByEntityType: Record<AuditEntityType, number>;
  recordsLast7Days: number;
  overridesLast30Days: number;
  countersignatureCompliancePct: number;
  evidenceCoveragePct: number;
  dailyVolume: { t: Iso; v: number }[];
}
