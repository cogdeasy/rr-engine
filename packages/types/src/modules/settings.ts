/**
 * Settings & access — governance model for the platform.
 *
 * Answers "who can act on what, and at which thresholds do we alert?": the role
 * and permission model, the red/amber limits shared by every other module, the
 * escalation policy behind alerting, and the health of the platform itself.
 */

import type { Iso, ParameterId, Region, Severity, StatusLevel } from "../index";

export type PlatformRoleId =
  | "duty-controller"
  | "reliability-engineer"
  | "planner"
  | "shop-supervisor"
  | "operator-user";

/** What a role may do inside a module group. Ordered least to most privileged. */
export type PermissionLevel = "none" | "view" | "action" | "approve";

export interface RoleDefinition {
  id: PlatformRoleId;
  label: string;
  /** One line describing what the role is accountable for. */
  mandate: string;
  /** Paging tier: 1 is first responder. */
  escalationTier: 1 | 2 | 3;
  /** Permission granted per module group id. */
  permissions: Record<string, PermissionLevel>;
  memberCount: number;
  /** Members whose access record needs attention. */
  flaggedCount: number;
}

export type AccessScopeKind = "global" | "facility" | "operator";

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  roleId: PlatformRoleId;
  organisation: string;
  scopeKind: AccessScopeKind;
  /** Human readable scope, e.g. "EGLL line station" or "Global fleet". */
  scopeLabel: string;
  region: Region;
  lastActiveAt: Iso;
  mfaEnrolled: boolean;
  /** Days until the periodic access review falls due; negative when overdue. */
  accessReviewDueDays: number;
  actionsLast30d: number;
  status: StatusLevel;
  /** Why the record is red or amber; null when nominal. */
  exception: string | null;
}

export type ThresholdDirection = "higher-is-worse" | "lower-is-worse";

/**
 * A fleet-wide alerting limit. `values` carries the current population reading
 * for every asset the limit applies to, so the console can preview the
 * affected-asset count as an engineer drags the limit.
 */
export interface ThresholdPolicy {
  id: string;
  label: string;
  description: string;
  parameter: ParameterId | null;
  unit: string;
  direction: ThresholdDirection;
  min: number;
  max: number;
  step: number;
  amber: number;
  red: number;
  ataChapter: string | null;
  /** Population the limit is evaluated against, e.g. "engines" or "LLPs". */
  population: string;
  owner: PlatformRoleId;
  lastChangedAt: Iso;
  lastChangedBy: string;
  values: number[];
}

export interface ThresholdImpact {
  red: number;
  amber: number;
  green: number;
  total: number;
}

export interface EscalationPolicy {
  severity: Severity;
  label: string;
  /** First responder and the role paged if acknowledgement lapses. */
  primaryRoleId: PlatformRoleId;
  escalateToRoleId: PlatformRoleId;
  channels: string[];
  ackSlaMinutes: number;
  resolveSlaHours: number;
  /** Live alert counts measured against this policy. */
  openCount: number;
  breachedCount: number;
  medianAckMinutes: number;
  status: StatusLevel;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  kind: "telemetry" | "airline" | "mro" | "supply" | "commercial" | "model";
  direction: "inbound" | "outbound" | "bidirectional";
  lastSyncAt: Iso;
  ageMinutes: number;
  expectedIntervalMinutes: number;
  volumePerDay: number;
  owner: PlatformRoleId;
  status: StatusLevel;
  note: string;
}

export interface DataFreshness {
  id: string;
  label: string;
  lastUpdatedAt: Iso;
  ageMinutes: number;
  expectedIntervalMinutes: number;
  records: number;
  status: StatusLevel;
}

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  scope: string;
  enginesCovered: number;
  lastScoredAt: Iso;
  meanConfidence: number;
  status: StatusLevel;
}

export interface PlatformHealth {
  datasetSeed: string;
  generatedAt: Iso;
  freshness: DataFreshness[];
  integrations: IntegrationStatus[];
  models: ModelVersion[];
}

/** A single recommended governance action surfaced at the top of the page. */
export interface GovernanceAction {
  id: string;
  title: string;
  detail: string;
  status: StatusLevel;
  ctaLabel: string;
  owner: PlatformRoleId;
}

export interface AccessSummary {
  users: number;
  flagged: number;
  withoutMfa: number;
  reviewsOverdue: number;
  approvers: number;
  /** Users with no recorded activity in the last 45 days. */
  dormant: number;
}

export interface SettingsSnapshot {
  moduleGroups: { id: string; label: string }[];
  roles: RoleDefinition[];
  users: PlatformUser[];
  accessSummary: AccessSummary;
  thresholds: ThresholdPolicy[];
  escalations: EscalationPolicy[];
  health: PlatformHealth;
  actions: GovernanceAction[];
}
