/**
 * Borescope inspection domain model.
 *
 * A borescope inspection records what the probe saw inside an engine module:
 * discrete findings, each measured against the engine manual's serviceable and
 * repairable limits, dispositioned, and — where the damage persists — tracked
 * across successive inspections so progression can be judged.
 */

import type { Iso, ModuleCode, Severity, StatusLevel } from "../index";

export type BorescopeDamageType =
  | "crack"
  | "burn-through"
  | "coating loss"
  | "tip curl"
  | "erosion"
  | "FOD dent"
  | "nick"
  | "spallation"
  | "distortion"
  | "cooling-hole blockage"
  | "missing material";

/** What the inspector decided to do about a finding. */
export type BorescopeDisposition = "serviceable" | "monitor" | "repair" | "remove";

/** Why the inspection happened. */
export type BorescopeTrigger =
  | "scheduled"
  | "repeat"
  | "alert-driven"
  | "SB/AD compliance"
  | "post-event";

/** The dimension the engine manual limits for a given damage type. */
export type BorescopeDimension = "length" | "depth" | "width" | "area";

/** A single engine-manual limit line for a damage type at a location. */
export interface BorescopeLimit {
  id: string;
  moduleCode: ModuleCode;
  damageType: BorescopeDamageType;
  dimension: BorescopeDimension;
  unit: "mm" | "mm²";
  /** At or below this, the part stays in service as found. */
  serviceableMax: number;
  /** Above serviceableMax and at or below this, an approved repair applies. */
  repairableMax: number;
  reference: string;
}

/** One discrete piece of damage seen by the probe. */
export interface BorescopeFinding {
  id: string;
  inspectionId: string;
  engineId: string;
  moduleCode: ModuleCode;
  /** Gas-path stage, e.g. "HPT stage 1". */
  stage: string;
  /** Blade / vane / tile number within the stage, null for non-discrete items. */
  bladeNumber: number | null;
  /** Clock position of the damage in the annulus, 1-12. */
  clockPosition: number;
  damageType: BorescopeDamageType;
  dimension: BorescopeDimension;
  unit: "mm" | "mm²";
  measured: number;
  serviceableLimit: number;
  repairableLimit: number;
  /** measured / serviceableLimit, 1.0 means exactly at the limit. */
  limitRatio: number;
  /** True when the measurement is beyond the serviceable limit. */
  exceedsServiceable: boolean;
  /** True when the measurement is beyond the repairable limit — removal. */
  exceedsRepairable: boolean;
  severity: Severity;
  status: StatusLevel;
  disposition: BorescopeDisposition;
  recommendedAction: string;
  /** Stable seed for the synthetic probe frame rendering. */
  imageSeed: string;
  /** Identity of the damage site, shared by the same defect across inspections. */
  trackId: string;
  /** The same site's measurement at the previous inspection, when tracked. */
  previousMeasured: number | null;
  previousInspectionId: string | null;
  previousObservedAt: Iso | null;
  /** Growth of the measurement per 1,000 cycles since the previous inspection. */
  growthPerKCycles: number | null;
  /** Cycles until the site reaches the serviceable limit at the observed rate. */
  cyclesToServiceableLimit: number | null;
  observedAt: Iso;
  inspector: string;
  notes: string;
  limitReference: string;
}

export interface BorescopeInspection {
  id: string;
  reference: string;
  engineId: string;
  operatorId: string;
  aircraftId: string | null;
  facilityId: string;
  trigger: BorescopeTrigger;
  performedAt: Iso;
  inspector: string;
  probe: string;
  modulesInspected: ModuleCode[];
  /** Engine cycles since new at the time of inspection. */
  cyclesAtInspection: number;
  findingCount: number;
  exceedanceCount: number;
  /** The most severe disposition across the inspection's findings. */
  worstDisposition: BorescopeDisposition;
  status: StatusLevel;
  /** Repeat interval agreed at the inspection, in cycles. */
  intervalCycles: number;
  /** Cycles flown since this inspection. */
  cyclesSince: number;
  /** Cycles remaining before the re-inspection is due; negative = overdue. */
  cyclesToNextDue: number;
  nextDueAt: Iso;
  /** True only for the latest inspection of an engine that is past due. */
  overdue: boolean;
  summary: string;
}

/** Rolled-up fleet position used by the module's decision header. */
export interface BorescopeSummary {
  inspections: number;
  inspectionsLast30Days: number;
  findings: number;
  openExceedances: number;
  enginesWithExceedance: number;
  removalCandidates: number;
  repairCandidates: number;
  monitorCount: number;
  overdueEngines: number;
  dueSoonEngines: number;
  medianIntervalCycles: number;
}

/** Findings grouped by engine module for the fleet trend panel. */
export interface BorescopeModuleTrend {
  moduleCode: ModuleCode;
  label: string;
  total: number;
  red: number;
  amber: number;
  green: number;
  /** Findings per inspection that covered this module. */
  findingRate: number;
  status: StatusLevel;
  /** Findings per quarter for the last six quarters. */
  history: { period: string; total: number; exceedances: number }[];
}

/** An engine whose repeat borescope inspection is due or overdue. */
export interface BorescopeReinspection {
  engineId: string;
  esn: string;
  operatorCode: string;
  family: string;
  tail: string | null;
  lastInspectionId: string;
  lastInspectedAt: Iso;
  intervalCycles: number;
  cyclesSince: number;
  cyclesToNextDue: number;
  nextDueAt: Iso;
  status: StatusLevel;
  driver: string;
}
