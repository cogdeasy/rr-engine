/**
 * Types for the `operator-portal` module — the customer-facing view an airline
 * sees of its own fleet. Nothing in these shapes may carry Rolls-Royce internal
 * commercial data (cost, margin, penalties, rate per EFH).
 */

import type { ContractKind, EngineFamily, Iso, Point, Region, StatusLevel, Trend } from "../index";

/** Entry in the operator switcher. */
export interface OperatorPortalOption {
  id: string;
  code: string;
  name: string;
  region: Region;
  homeBase: string;
  aircraft: number;
  engines: number;
  /** Number of items the operator must respond to. */
  openActions: number;
  status: StatusLevel;
}

/** Contract facts the customer is entitled to see. */
export interface OperatorContractSummary {
  id: string;
  kind: ContractKind;
  startsAt: Iso;
  endsAt: Iso;
  monthsRemaining: number;
  coveredEngines: number;
  availabilityTarget: number;
  availabilityActual: number;
  status: StatusLevel;
}

export type OperatorActionCategory =
  | "slot-confirmation"
  | "approval"
  | "compliance"
  | "parts-decision"
  | "information";

/** A single "what we need from you" item. */
export interface OperatorAction {
  id: string;
  category: OperatorActionCategory;
  title: string;
  detail: string;
  /** Plain-language justification for the colour shown against this action. */
  reason: string;
  recommendedAction: string;
  dueAt: Iso;
  dueInDays: number;
  status: StatusLevel;
  reference: string;
  engineEsn?: string;
  tail?: string;
}

export interface OperatorEngineRow {
  engineId: string;
  esn: string;
  family: EngineFamily;
  tail: string | null;
  position: number | null;
  status: StatusLevel;
  /** Plain-language explanation of the status colour. */
  reason: string;
  healthScore: number;
  egtMargin: number;
  cyclesSinceOverhaul: number;
  rulCycles: number;
  openAlerts: number;
  nextEvent: string | null;
  nextEventAt: Iso | null;
}

export type OperatorEventKind =
  | "scheduled-removal"
  | "shop-visit"
  | "module-swap"
  | "on-wing-inspection"
  | "line-maintenance";

export interface OperatorPlannedEvent {
  id: string;
  reference: string;
  kind: OperatorEventKind;
  label: string;
  esn: string;
  tail: string | null;
  facility: string;
  startsAt: Iso;
  endsAt: Iso;
  /** Days the aircraft or engine is unavailable to the operator. */
  downtimeDays: number;
  startsInDays: number;
  confirmed: boolean;
  status: StatusLevel;
  reason: string;
}

export interface OperatorAogEvent {
  id: string;
  tail: string;
  aircraftType: string;
  esn: string;
  location: string;
  raisedAt: Iso;
  hoursGrounded: number;
  cause: string;
  recoveryPlan: string;
  expectedReturnAt: Iso | null;
  status: StatusLevel;
}

export interface OperatorAdvisory {
  id: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  family: EngineFamily;
  mandatory: boolean;
  dueAt: Iso;
  affectedEngines: number;
  embodiedEngines: number;
  status: StatusLevel;
}

export interface OperatorAvailabilitySummary {
  actual: number;
  target: number;
  status: StatusLevel;
  trend: Trend;
  /** Percentage change against the previous month, not a points delta. */
  deltaPct: number;
  history: Point[];
  dispatchReliability: number;
  dispatchTarget: number;
  dispatchTrend: Trend;
  dispatchHistory: Point[];
  /** Aircraft-days lost to unscheduled events this period. */
  aircraftDaysLost: number;
}

export interface OperatorMonthlySummary {
  periodLabel: string;
  reference: string;
  issuedAt: Iso;
  sectors: number;
  blockHours: number;
  engineFlightHours: number;
  averageDerate: number;
  alertsRaised: number;
  alertsClosed: number;
  eventsCompleted: number;
  removalsPlanned: number;
  availability: number;
  availabilityTarget: number;
  dispatchReliability: number;
  onTimeEventCompletionPct: number;
}

export interface OperatorPortalView {
  operator: OperatorPortalOption;
  contract: OperatorContractSummary;
  fleet: {
    aircraft: number;
    engines: number;
    inService: number;
    inMaintenance: number;
    aog: number;
    byStatus: Record<StatusLevel, number>;
    averageHealthScore: number;
  };
  availability: OperatorAvailabilitySummary;
  actions: OperatorAction[];
  engines: OperatorEngineRow[];
  plannedEvents: OperatorPlannedEvent[];
  aogEvents: OperatorAogEvent[];
  advisories: OperatorAdvisory[];
  monthly: OperatorMonthlySummary;
}
