/**
 * Oil & debris monitoring (module `oil-debris`).
 *
 * The domain question: has a bearing chamber started to shed material, and is
 * the evidence strong enough to pull the engine off wing?
 */

import type { Iso, Point, Series, StatusLevel } from "../index";

/** Where a debris indication came from. */
export type DebrisDetectionSource =
  | "electric-chip-detector"
  | "magnetic-chip-detector"
  | "oil-filter-inspection"
  | "SOAP-sample";

/** Material classification returned by the lab or the inductive sensor. */
export type DebrisMaterial =
  | "M50 bearing steel"
  | "carburised steel"
  | "silver plating"
  | "copper alloy"
  | "titanium"
  | "aluminium"
  | "carbon seal"
  | "non-metallic";

/** Bearing chambers monitored by the oil debris system on a three-shaft Trent. */
export type BearingChamber = "front" | "intershaft" | "rear" | "gearbox";

export interface DebrisEvent {
  id: string;
  engineId: string;
  detectedAt: Iso;
  source: DebrisDetectionSource;
  chamber: BearingChamber;
  /** Particles counted in the sample or since the previous download. */
  particleCount: number;
  /** Largest particle in the indication. */
  maxParticleMicrons: number;
  material: DebrisMaterial;
  /** True when the material is load-path bearing metal rather than benign wear. */
  loadPathMetal: boolean;
  status: StatusLevel;
  flightId: string | null;
  note: string;
}

export type OilActionKind =
  | "nominal"
  | "increase-sampling"
  | "oil-sample-lab"
  | "borescope"
  | "remove-engine";

export interface OilRecommendedAction {
  kind: OilActionKind;
  label: string;
  status: StatusLevel;
  /** Hours in which the action must be started; null when routine. */
  dueWithinHours: number | null;
  /** Plain-language reasons, each one a threshold that was breached. */
  rationale: string[];
  /** The reference the line engineer quotes when raising the task. */
  reference: string;
}

/** Rolling oil and debris condition for one engine. */
export interface OilCondition {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  aircraftTail: string | null;
  location: string;

  /** Latest smoothed oil consumption and the certified limit for the family. */
  consumptionQtPerHr: number;
  consumptionAmberLimit: number;
  consumptionRedLimit: number;
  /** Percent change over the last 30 days of the consumption trend. */
  consumptionTrendPct: number;
  /** Detected step change in consumption, the classic bearing-distress signature. */
  stepChangeAt: Iso | null;
  stepChangeQtPerHr: number;

  oilPressurePsi: number;
  oilTempC: number;
  oilPressureStatus: StatusLevel;
  oilTempStatus: StatusLevel;

  /** Debris counts over rolling windows. */
  debrisCount30d: number;
  debrisCount90d: number;
  loadPathEvents90d: number;
  lastDebrisAt: Iso | null;
  dominantMaterial: DebrisMaterial | null;
  dominantChamber: BearingChamber | null;

  /** Supporting evidence from the neighbouring parameters. */
  vibrationIps: number;
  vibrationDeltaIps: number;
  egtMargin: number;

  /** 0-100 composite of consumption, debris and vibration evidence. */
  bearingDistressIndex: number;
  status: StatusLevel;
  action: OilRecommendedAction;
}

/** Multi-parameter timeline used for the correlation view. */
export interface OilCorrelationTimeline {
  engineId: string;
  consumption: Series;
  vibration: Series;
  egtMargin: Series;
  /** Debris indications placed on the same time axis. */
  debris: Point[];
  stepChangeAt: Iso | null;
}

export interface OilFleetSummary {
  enginesMonitored: number;
  red: number;
  amber: number;
  green: number;
  overConsumptionLimit: number;
  stepChanges: number;
  loadPathDetections30d: number;
  removalsRecommended: number;
  borescopesRecommended: number;
  medianConsumption: number;
}
