/**
 * Engine explorer (`engine-explorer`) — the filterable register of every managed
 * engine, ranked by how urgently it needs to be worked.
 */

import type {
  AircraftType,
  EngineFamily,
  EngineLifeStage,
  Iso,
  Point,
  Region,
  StatusLevel,
} from "../index";

/** Why an engine sits where it does in the work-order queue. */
export type EngineDriverCode =
  | "egt-margin"
  | "critical-alert"
  | "rul"
  | "shop-visit-due"
  | "llp-expiry"
  | "health-score";

export interface EngineDriver {
  code: EngineDriverCode;
  /** Short, operator-readable explanation, e.g. "EGT margin 6.4°C (red < 12°C)". */
  label: string;
  /** Contribution to the priority score, in points. */
  weight: number;
}

/** One row of the engine register: an engine plus everything needed to triage it. */
export interface EngineRegisterRow {
  engineId: string;
  esn: string;
  family: EngineFamily;
  buildStandard: string;
  thrustRating: string;

  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: Region;

  aircraftId: string | null;
  aircraftTail: string | null;
  aircraftType: AircraftType | null;
  position: number | null;
  location: string;

  lifeStage: EngineLifeStage;
  totalFlightHours: number;
  totalFlightCycles: number;
  hoursSinceOverhaul: number;
  cyclesSinceOverhaul: number;

  /** Headline health parameter, degrees C remaining. */
  egtMargin: number;
  egtMarginStatus: StatusLevel;
  /** Percentage of the family's new-engine EGT margin still available. */
  egtMarginPctOfNew: number;
  /** Average °C of margin lost per 100 cycles over the last 30 sectors. */
  egtMarginDecayPer100Cycles: number;

  healthScore: number;
  healthStatus: StatusLevel;

  rulCycles: number;
  rulStatus: StatusLevel;
  /** Cycles per day flown over the observed window; null when the engine is not flying. */
  cyclesPerDay: number | null;
  /** Projected days until removal is required; null when there is no utilisation data. */
  daysToShopVisit: number | null;
  shopVisitStatus: StatusLevel;

  openAlerts: number;
  criticalAlerts: number;
  /** Hours until the most urgent open alert must be actioned. */
  nextActionHours: number | null;

  /** Reference of the open work order covering this engine, if one exists. */
  workOrderReference: string | null;
  workOrderState: string | null;

  status: StatusLevel;
  /** Composite urgency, 0 (nominal) to 100 (act now). */
  priorityScore: number;
  /** 1-based rank across the whole managed fleet, 1 = work first. */
  priorityRank: number;
  drivers: EngineDriver[];
  recommendedAction: string;
  /** Where the recommended action is executed. */
  recommendedActionRoute: string;

  /** EGT margin over the last 30 recorded sectors. */
  egtTrend: Point[];
  lastFlightAt: Iso | null;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface EngineExplorerFacets {
  families: FacetOption[];
  operators: FacetOption[];
  statuses: FacetOption[];
  lifeStages: FacetOption[];
  regions: FacetOption[];
}

export interface EngineExplorerSummary {
  engines: number;
  red: number;
  amber: number;
  green: number;
  /** Engines below the 12°C EGT margin red line. */
  belowEgtRedLine: number;
  /** Engines projected to need a shop visit inside 90 days. */
  shopVisitWithin90Days: number;
  criticalAlerts: number;
  medianEgtMargin: number;
  unassignedRedEngines: number;
}

export interface EngineSavedView {
  id: string;
  label: string;
  description: string;
  /** Serialised filter state applied when the view is selected. */
  filters: {
    statuses?: StatusLevel[];
    families?: EngineFamily[];
    operators?: string[];
    lifeStages?: EngineLifeStage[];
    regions?: Region[];
    maxEgtMargin?: number;
    maxDaysToShopVisit?: number;
    minOpenAlerts?: number;
    search?: string;
  };
}

export interface EngineExplorerData {
  rows: EngineRegisterRow[];
  facets: EngineExplorerFacets;
  summary: EngineExplorerSummary;
  savedViews: EngineSavedView[];
}
