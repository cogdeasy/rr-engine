/**
 * Warranty claims module — claim capture, recovery value and settlement status.
 *
 * The domain question: "is this repair recoverable under warranty or campaign
 * cover?" Claims are raised against a maintenance event, assessed against the
 * cover in force for the engine, and settled at some fraction of the amount
 * claimed. Everything here is derived from the core dataset in `@rr/data`.
 */

import type { Iso, ModuleCode, StatusLevel } from "../index";

/** Where the entitlement comes from. */
export type WarrantyCoverKind =
  | "new-engine-warranty"
  | "parts-warranty"
  | "campaign"
  | "service-bulletin"
  | "totalcare"
  | "goodwill";

/** Lifecycle of a claim from capture to settlement. */
export type WarrantyClaimState = "draft" | "submitted" | "under-review" | "approved" | "rejected";

/** The maintenance event the claim is raised against. */
export type WarrantyEventType =
  | "unscheduled-removal"
  | "shop-finding"
  | "on-wing-repair"
  | "component-failure"
  | "campaign-embodiment";

export type WarrantyRejectionReason =
  | "outside-time-limit"
  | "outside-cycle-limit"
  | "operator-induced-damage"
  | "foreign-object-damage"
  | "insufficient-evidence"
  | "part-not-covered"
  | "unapproved-repair-shop"
  | "duplicate-claim";

export interface WarrantyClaim {
  id: string;
  /** Human reference, e.g. "WC-2026-0142". */
  reference: string;
  engineId: string;
  esn: string;
  operatorId: string;
  operatorName: string;
  contractId: string;
  workOrderId: string;
  workOrderReference: string;
  eventType: WarrantyEventType;
  coverKind: WarrantyCoverKind;
  moduleCode: ModuleCode;
  partNumber: string;
  summary: string;
  state: WarrantyClaimState;
  /** Amount claimed from Rolls-Royce, USD. */
  claimedUsd: number;
  /** Amount agreed so far; zero until a decision is taken. */
  approvedUsd: number;
  /** approvedUsd / claimedUsd as a percentage; null before decision. */
  recoveryRatePct: number | null;
  raisedAt: Iso;
  submittedAt: Iso | null;
  decidedAt: Iso | null;
  /** Days since the claim was raised (open) or to decision (closed). */
  ageDays: number;
  /** Contractual assessment window for this cover kind, in days. */
  slaDays: number;
  /** Days past the assessment SLA; negative when still inside it. */
  slaBreachDays: number;
  rejectionReason: WarrantyRejectionReason | null;
  evidenceComplete: boolean;
  handler: string;
  status: StatusLevel;
  recommendedAction: string;
}

/** One warranted item on an engine, assessed against hours / cycles / calendar. */
export interface WarrantyCoverageItem {
  id: string;
  engineId: string;
  moduleCode: ModuleCode;
  partNumber: string;
  description: string;
  coverKind: WarrantyCoverKind;
  hoursLimit: number;
  cyclesLimit: number;
  expiresAt: Iso;
  hoursUsed: number;
  cyclesUsed: number;
  hoursRemaining: number;
  cyclesRemaining: number;
  daysRemaining: number;
  covered: boolean;
  /** Which of the three limits runs out first. */
  limitingFactor: "hours" | "cycles" | "calendar";
  /** Percentage of the binding limit consumed, 0-100+. */
  consumedPct: number;
  /** Value recoverable if the item fails today. Zero once cover has lapsed. */
  recoverableUsd: number;
  /** Replacement cost the operator carries if cover has lapsed. */
  exposureUsd: number;
  status: StatusLevel;
}

/** Result of running the eligibility checker against one removal candidate. */
export interface WarrantyEligibility {
  engineId: string;
  esn: string;
  operatorId: string;
  operatorName: string;
  family: string;
  contractKind: string;
  workOrderId: string | null;
  workOrderReference: string | null;
  eventSummary: string;
  assessedAt: Iso;
  coverStartsAt: Iso;
  hoursSinceNew: number;
  cyclesSinceNew: number;
  items: WarrantyCoverageItem[];
  coveredCount: number;
  totalCount: number;
  recoverableUsd: number;
  exposureUsd: number;
  /** Recoverable as a share of the total event value. */
  recoveryPotentialPct: number;
  status: StatusLevel;
  recommendation: string;
}

export interface WarrantyAgeingBucket {
  id: string;
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  valueUsd: number;
  status: StatusLevel;
}

export interface WarrantyRejectionBreakdown {
  reason: WarrantyRejectionReason;
  label: string;
  count: number;
  valueUsd: number;
  sharePct: number;
  /** The control that would prevent this reason recurring. */
  mitigation: string;
}

export interface WarrantySummary {
  claims: number;
  openClaims: number;
  claimedUsd: number;
  recoveredUsd: number;
  openValueUsd: number;
  rejectedValueUsd: number;
  recoveryRatePct: number;
  averageSettlementDays: number;
  slaBreaches: number;
  evidenceGaps: number;
  /** Drafts left unsubmitted for more than 20 days — capture risk. */
  staleDrafts: number;
}
