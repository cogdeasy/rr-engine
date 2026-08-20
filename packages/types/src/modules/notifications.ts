/**
 * Escalations module — ownership and acknowledgement of red conditions.
 *
 * A red condition (a critical or high severity open alert) is only under
 * control once an accountable owner has acknowledged it inside the tier SLA.
 * These types model that workflow: who was notified, through which channel,
 * who owns it now, and how much time is left before the acknowledgement SLA
 * is breached.
 */

import type { Iso, Severity, StatusLevel } from "../index";

/** Escalation tiers run from the duty desk (T1) up to the executive on call (T4). */
export type EscalationTier = "T1" | "T2" | "T3" | "T4";

export type AcknowledgementState = "unacknowledged" | "acknowledged" | "resolved";

export type NotificationChannel = "console" | "email" | "sms" | "phone" | "acars" | "operator-portal";

export type EscalationEventKind =
  | "raised"
  | "notified"
  | "viewed"
  | "acknowledged"
  | "escalated"
  | "reassigned"
  | "resolved";

export interface EscalationOwner {
  id: string;
  name: string;
  role: string;
  email: string;
  /** ICAO of the base the owner operates from. */
  base: string;
  tier: EscalationTier;
}

export interface EscalationEvent {
  id: string;
  at: Iso;
  kind: EscalationEventKind;
  actor: string;
  channel: NotificationChannel;
  tier: EscalationTier;
  detail: string;
}

export interface Escalation {
  id: string;
  alertId: string;
  engineId: string;
  esn: string;
  engineFamily: string;
  operatorId: string;
  operatorName: string;
  aircraftTail: string | null;
  title: string;
  /** Why this condition is red, in one operator-readable sentence. */
  reason: string;
  recommendedAction: string;
  severity: Severity;
  status: StatusLevel;
  source: string;
  ataChapter: string;
  raisedAt: Iso;
  tier: EscalationTier;
  owner: EscalationOwner;
  acknowledgementState: AcknowledgementState;
  acknowledgedAt: Iso | null;
  acknowledgedBy: string | null;
  /** Minutes between raise and acknowledgement, or raise and now when open. */
  elapsedMinutes: number;
  /** Contractual acknowledgement window for the tier and severity. */
  slaMinutes: number;
  slaDueAt: Iso;
  /** Negative once the acknowledgement SLA has been breached. */
  slaRemainingMinutes: number;
  breached: boolean;
  /** Number of distinct people or systems notified so far. */
  notifiedCount: number;
  reassignments: number;
  trail: EscalationEvent[];
  relatedWorkOrderRef: string | null;
}

export interface EscalationTierGroup {
  tier: EscalationTier;
  label: string;
  description: string;
  slaMinutes: number;
  escalations: Escalation[];
  unacknowledged: number;
  breached: number;
}

export interface EscalationSummary {
  total: number;
  unacknowledged: number;
  breached: number;
  /** Mean acknowledgement time in minutes across acknowledged escalations. */
  meanAckMinutes: number;
  /** Mean acknowledgement time for the previous period, for the delta. */
  priorMeanAckMinutes: number;
  acknowledgedWithinSla: number;
  ackCoveragePct: number;
  oldestUnacknowledgedMinutes: number;
  byTier: Record<EscalationTier, { total: number; unacknowledged: number; breached: number }>;
}
