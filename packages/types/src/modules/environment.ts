/**
 * Environmental exposure module — sand, dust and salt accumulated per engine and route.
 *
 * The severity index is a 0-100 score built from five physical drivers observed
 * at the airports an engine actually operates through, weighted by sectors flown.
 */

import type { EngineFamily, Iso, Region, StatusLevel } from "../index";

export type ExposureDriverId = "dust" | "sand" | "salinity" | "pollution" | "temperature";

export interface ExposureDriverDefinition {
  id: ExposureDriverId;
  label: string;
  /** Short explanation of the damage mechanism the driver represents. */
  mechanism: string;
  /** Share of the composite severity index, 0-1. Sums to 1 across drivers. */
  weight: number;
  unit: string;
}

/** Airport-level environmental profile derived from climate reference data. */
export interface AirportExposure {
  icao: string;
  iata: string;
  city: string;
  lat: number;
  lon: number;
  region: Region;
  climate: string;
  /** Per-driver intensity, 0-100. */
  drivers: Record<ExposureDriverId, number>;
  /** Weighted composite, 0-100. */
  severityIndex: number;
  status: StatusLevel;
  /** Sectors flown through this airport by the managed fleet in the sample window. */
  sectors: number;
  enginesExposed: number;
}

/** A directionless origin/destination pair flown by the managed fleet. */
export interface RouteExposure {
  id: string;
  origin: string;
  destination: string;
  originIata: string;
  destinationIata: string;
  label: string;
  sectors: number;
  severityIndex: number;
  status: StatusLevel;
  /** Dominant driver on the pairing. */
  worstDriver: ExposureDriverId;
  operatorCodes: string[];
  engineCount: number;
  blockHours: number;
}

/** Per-engine accumulated exposure and the interval consequence of it. */
export interface EngineExposure {
  engineId: string;
  esn: string;
  family: EngineFamily;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: Region;
  aircraftTail: string | null;
  sectors: number;
  /** Weighted composite, 0-100. */
  severityIndex: number;
  status: StatusLevel;
  /** Points of the composite index contributed by each driver; sums to severityIndex. */
  contributions: Record<ExposureDriverId, number>;
  /** Share of sectors touching an airport scored red, 0-100. */
  harshSectorPct: number;
  worstRouteId: string | null;
  worstRouteLabel: string | null;
  cyclesSinceOverhaul: number;
  egtMargin: number;
  /** EGT margin lost per 1,000 cycles since the last shop visit. */
  deteriorationRate: number;
  /** Published overhaul interval for the family. */
  baselineIntervalCycles: number;
  /** Severity-adjusted interval the model supports. */
  adjustedIntervalCycles: number;
  intervalDeltaCycles: number;
  cyclesPerYear: number;
  /** Cycles left before the severity-adjusted removal point. */
  cyclesToAdjustedRemoval: number;
  recommendedAction: string;
}

export interface ExposureCorrelation {
  points: { engineId: string; esn: string; severityIndex: number; deteriorationRate: number; status: StatusLevel }[];
  /** Least-squares fit of deterioration rate against severity index. */
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  sampleSize: number;
  /** Extra EGT margin lost per 1,000 cycles for every 10 points of severity. */
  ratePer10Points: number;
}

export type RotationAction = "rotate" | "shorten-interval" | "monitor" | "hold";

/** Recommended interval adjustment for one operator × route-group population. */
export interface IntervalRecommendation {
  id: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: Region;
  routeGroup: string;
  engineCount: number;
  meanSeverityIndex: number;
  status: StatusLevel;
  baselineIntervalCycles: number;
  recommendedIntervalCycles: number;
  deltaPct: number;
  /** Unplanned-removal exposure avoided per year by adopting the adjustment. */
  annualCostImpactUsd: number;
  action: RotationAction;
  rationale: string;
}

export interface EnvironmentSummary {
  enginesAssessed: number;
  sectorsAnalysed: number;
  windowDays: number;
  meanSeverityIndex: number;
  redEngines: number;
  amberEngines: number;
  /** Percentage of fleet sectors touching a red-scored airport. */
  harshSectorPct: number;
  /** EGT margin penalty of the harshest quartile against the mildest, °C per 1,000 cycles. */
  marginPenalty: number;
  cyclesAtRisk: number;
  annualCostImpactUsd: number;
  worstAirport: { iata: string; city: string; severityIndex: number } | null;
  generatedAt: Iso;
}

export interface EnvironmentExposureReport {
  summary: EnvironmentSummary;
  drivers: ExposureDriverDefinition[];
  airports: AirportExposure[];
  routes: RouteExposure[];
  engines: EngineExposure[];
  correlation: ExposureCorrelation;
  recommendations: IntervalRecommendation[];
}
