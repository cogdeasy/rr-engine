/**
 * Performance & fuel burn module.
 *
 * Models the specific fuel consumption (SFC) deviation of every managed engine
 * against its new-engine baseline, splits that deviation into the physical
 * mechanisms that caused it, and prices the recoverable portion so a controller
 * can answer one question: is a water wash worth the downtime?
 */

import type { Iso, Point, StatusLevel } from "../index";

/** Physical mechanism behind a slice of the fuel-burn deviation. */
export type DeteriorationCause = "fouling" | "hot-section" | "seals";

export interface DeteriorationSlice {
  cause: DeteriorationCause;
  label: string;
  /** Percentage points of fuel-burn deviation attributed to this mechanism. */
  deviationPct: number;
  /** Share of the total deviation, 0-1. */
  share: number;
  /** Fraction of this slice a core/water wash can recover, 0-1. */
  recoverableFraction: number;
}

export interface WashEvent {
  at: Iso;
  kind: "on-wing water wash" | "off-wing core wash";
  /** EGT margin recovered on the day of the wash. */
  egtRecoveredC: number;
  /** Fuel-burn percentage points recovered on the day of the wash. */
  fuelRecoveredPct: number;
  downtimeHours: number;
  costUsd: number;
}

/** Modelled outcome of washing an engine now. */
export interface WashCase {
  engineId: string;
  /** Fuel-burn percentage points a wash would recover today. */
  fuelRecoveredPct: number;
  egtMarginRecoveredC: number;
  fuelSavedKgPerYear: number;
  fuelSavedUsdPerYear: number;
  co2SavedTonnesPerYear: number;
  /** Wash line cost plus consumables. */
  washCostUsd: number;
  downtimeHours: number;
  /** Availability cost of the downtime, priced at the operator's contract rate. */
  downtimeCostUsd: number;
  totalCostUsd: number;
  netBenefitUsdPerYear: number;
  paybackDays: number | null;
  recommendation: "wash-now" | "schedule" | "monitor" | "not-worthwhile";
  status: StatusLevel;
  rationale: string;
}

export interface EnginePerformance {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  location: string;
  /** Fuel flow above the new-engine baseline at cruise, percent. */
  fuelFlowDeviationPct: number;
  /** Specific fuel consumption deviation, percent — the contractual measure. */
  sfcDeviationPct: number;
  /** Share of new-engine cruise performance still retained, percent. */
  cruiseRetentionPct: number;
  egtMargin: number;
  /** Engine flight hours flown per year, annualised from recent sectors. */
  annualEfh: number;
  annualFuelKg: number;
  /** Extra fuel burnt per year because of the deviation. */
  annualFuelPenaltyKg: number;
  annualFuelPenaltyUsd: number;
  annualCo2PenaltyTonnes: number;
  attribution: DeteriorationSlice[];
  lastWash: WashEvent | null;
  daysSinceWash: number | null;
  washCase: WashCase;
  status: StatusLevel;
  /** Why the row is coloured the way it is, in one sentence. */
  statusReason: string;
  environmentSeverity: number;
  /** Monthly SFC deviation history, oldest first. */
  sfcTrend: Point[];
}

export interface FleetPerformanceSummary {
  engines: number;
  /** Fleet mean SFC deviation, percent. */
  meanSfcDeviationPct: number;
  annualFuelPenaltyUsd: number;
  annualCo2PenaltyTonnes: number;
  /** Portion of the penalty a wash programme would recover. */
  recoverableUsd: number;
  recoverableCo2Tonnes: number;
  recoverableFuelKg: number;
  washNow: number;
  schedule: number;
  monitor: number;
  noData: number;
  /** Fleet-wide deviation split by mechanism. */
  attribution: DeteriorationSlice[];
  /** Net annual benefit of actioning every wash-now and schedule candidate. */
  programmeNetBenefitUsd: number;
  programmeDowntimeHours: number;
  programmeCostUsd: number;
}

export interface PerformanceThresholds {
  amberSfcDeviationPct: number;
  redSfcDeviationPct: number;
  jetFuelUsdPerKg: number;
  co2KgPerFuelKg: number;
}
