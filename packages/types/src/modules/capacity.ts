/**
 * Shop capacity module — slot utilisation across overhaul bases and partner shops.
 *
 * The domain question is "where is the next available slot that meets the
 * removal date?", so the model is built around three objects: the induction
 * demand (an engine that must come off wing by a date), the capacity a facility
 * can offer (bays x days), and the moves that recover slack when the two do not
 * line up.
 */

import type { EngineFamily, Iso, Region, StatusLevel } from "../index";

export type ShopFacilityKind = "overhaul-base" | "partner-shop";

/** Why an engine is due for induction. Drives the workscope and the TAT. */
export type InductionDriver = "llp-expiry" | "egt-margin" | "prognostic-risk" | "scheduled-interval";

export type Workscope = "full-overhaul" | "performance-restoration" | "module-swap" | "quick-turn";

export interface CapacityMonth {
  /** `YYYY-MM`. */
  key: string;
  /** `Sep 26`. */
  label: string;
  startsAt: Iso;
  days: number;
}

/** What a facility is certified and tooled to do for one engine family. */
export interface FacilityCapability {
  family: EngineFamily;
  certified: boolean;
  /** Historic mean turn-around for this family at this facility. */
  averageTatDays: number;
  /** Fleet share of this family currently inducted here. */
  inductions: number;
}

/** One cell of the month x facility heat grid. */
export interface CapacityCell {
  facilityId: string;
  month: string;
  bays: number;
  /** Bay-months the facility can sell in the month. */
  capacityBayMonths: number;
  /** Bay-months requested if every engine is inducted on its removal date. */
  demandBayMonths: number;
  utilisationPct: number;
  /** Demand that cannot be absorbed in the month. */
  overloadBayMonths: number;
  inductions: number;
  status: StatusLevel;
}

/** An engine that must be inducted inside the planning horizon. */
export interface InductionDemand {
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: Region;
  driver: InductionDriver;
  driverDetail: string;
  workscope: Workscope;
  /** Latest date the engine can stay on wing. */
  removalDue: Iso;
  rulCycles: number;
  cyclesPerDay: number;
  tatDays: number;
  preferredFacilityId: string;
  plannedFacilityId: string;
  plannedStart: Iso;
  plannedEnd: Iso;
  /** Days the planned slot slips past the removal date; 0 when it is met. */
  delayDays: number;
  /** Ferry distance from the operator's home base to the planned facility. */
  ferryKm: number;
  status: StatusLevel;
}

export interface FacilityCapacityProfile {
  facilityId: string;
  name: string;
  icao: string;
  region: Region;
  kind: ShopFacilityKind;
  bays: number;
  technicians: number;
  /** Engines physically in work today. */
  wipEngines: number;
  queueLength: number;
  averageTatDays: number;
  throughputPerYear: number;
  utilisationPct: number;
  peakUtilisationPct: number;
  peakMonth: string;
  overloadedMonths: number;
  /** First date a bay is free for a nominal slot; null when the horizon is full. */
  nextFreeSlot: Iso | null;
  status: StatusLevel;
  capabilities: FacilityCapability[];
}

export interface NetworkMonth {
  month: string;
  label: string;
  capacityBayMonths: number;
  demandBayMonths: number;
  shortfallBayMonths: number;
  utilisationPct: number;
  status: StatusLevel;
}

/** A proposed reroute that pulls a late induction back towards its removal date. */
export interface LoadLevellingMove {
  id: string;
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorName: string;
  removalDue: Iso;
  fromFacilityId: string;
  fromFacilityName: string;
  toFacilityId: string;
  toFacilityName: string;
  currentStart: Iso;
  proposedStart: Iso;
  daysRecovered: number;
  /** Delay still remaining after the move; 0 means the removal date is met. */
  residualDelayDays: number;
  extraFerryKm: number;
  tatDeltaDays: number;
  rationale: string;
  status: StatusLevel;
}

export interface CapacitySummary {
  inductions: number;
  atRiskInductions: number;
  watchlistInductions: number;
  overloadedFacilityMonths: number;
  networkUtilisationPct: number;
  peakShortfallBayMonths: number;
  peakShortfallMonth: string;
  bayMonthsShortfall: number;
  totalDelayDays: number;
  recoverableDelayDays: number;
  nextFreeSlot: { facilityId: string; facilityName: string; icao: string; startsAt: Iso } | null;
}

export interface CapacityOverview {
  horizonMonths: number;
  months: CapacityMonth[];
  cells: CapacityCell[];
  facilities: FacilityCapacityProfile[];
  network: NetworkMonth[];
  demand: InductionDemand[];
  moves: LoadLevellingMove[];
  summary: CapacitySummary;
}
