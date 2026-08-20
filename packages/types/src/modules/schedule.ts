/**
 * Maintenance schedule module — the forward plan of engine removals, shop
 * visits and on-wing tasks across the network over a rolling 24-month horizon.
 */

import type { EngineFamily, Iso, ModuleCode, StatusLevel } from "../index";

export type ScheduleEventKind =
  | "shop-visit"
  | "module-swap"
  | "on-wing-task"
  | "borescope"
  | "line-check"
  | "forecast-removal";

/**
 * `committed` — released work order, slot held.
 * `planned` — work order planned, slot provisional.
 * `forecast` — no work order yet; slot proposed by the planner against RUL.
 * `unscheduled` — demand with no slot before the engine runs out of life.
 */
export type ScheduleEventState = "committed" | "planned" | "forecast" | "unscheduled";

export interface ScheduleDriver {
  label: string;
  detail: string;
}

export interface ScheduleDependency {
  label: string;
  detail: string;
  status: StatusLevel;
}

export interface ScheduleEvent {
  id: string;
  workOrderId: string | null;
  reference: string;
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  facilityId: string | null;
  facilityIcao: string | null;
  facilityName: string | null;
  kind: ScheduleEventKind;
  state: ScheduleEventState;
  /** Slot start; for unscheduled demand this is the earliest date a slot exists. */
  start: Iso;
  end: Iso;
  durationDays: number;
  /** Days between today and the slot start. */
  leadTimeDays: number;
  status: StatusLevel;
  /** Plain-language explanation of the status colour, always populated. */
  statusReason: string;
  workscope: string;
  workscopeModules: ModuleCode[];
  drivers: ScheduleDriver[];
  dependencies: ScheduleDependency[];
  /** Date the engine's remaining useful life expires, where a limit applies. */
  rulExpiryAt: Iso | null;
  /** Days between the slot start and RUL expiry; negative means the slot opens after life expiry. */
  slackDays: number | null;
  estimatedCostUsd: number;
  recommendedAction: string;
  conflictIds: string[];
}

export interface ScheduleMonth {
  index: number;
  /** e.g. "Sep 26". */
  label: string;
  /** e.g. "Sep". */
  shortLabel: string;
  year: number;
  start: Iso;
  end: Iso;
}

export interface FacilityMonthLoad {
  facilityId: string;
  facilityIcao: string;
  monthIndex: number;
  capacity: number;
  /** Slots already committed to the wider network before this plan. */
  baselineDemand: number;
  /** Slots this plan adds for the managed fleet. */
  planDemand: number;
  demand: number;
  utilisationPct: number;
  status: StatusLevel;
}

export interface FacilityLoadRow {
  facilityId: string;
  facilityName: string;
  facilityIcao: string;
  kind: string;
  capacity: number;
  /** Slots held by the wider network, unavailable to this plan. */
  baselineDemand: number;
  months: FacilityMonthLoad[];
  peakUtilisationPct: number;
  overCommittedMonths: number;
  status: StatusLevel;
}

export type ScheduleConflictKind = "capacity-overrun" | "no-slot-before-rul" | "slot-after-rul";

export interface ScheduleConflict {
  id: string;
  kind: ScheduleConflictKind;
  status: StatusLevel;
  title: string;
  detail: string;
  engineIds: string[];
  facilityId: string | null;
  monthIndex: number | null;
  recommendedAction: string;
  /** Availability exposure if the conflict is not resolved, in USD. */
  exposureUsd: number;
}

export interface ScheduleKpis {
  unscheduledRed: number;
  slotUtilisationPct: number;
  averageLeadTimeDays: number;
  eventsInHorizon: number;
  capacityConflicts: number;
  committedCostUsd: number;
  /** Availability shortfall against contractual commitments, percentage points. */
  availabilityAtRiskPct: number;
}

export interface MaintenanceSchedule {
  generatedAt: Iso;
  horizonMonths: number;
  windowStart: Iso;
  windowEnd: Iso;
  months: ScheduleMonth[];
  events: ScheduleEvent[];
  facilityLoad: FacilityLoadRow[];
  conflicts: ScheduleConflict[];
  kpis: ScheduleKpis;
  filters: {
    operators: { id: string; code: string; name: string }[];
    families: EngineFamily[];
    facilities: { id: string; icao: string; name: string }[];
  };
}
