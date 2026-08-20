/**
 * Parameter explorer: finding the handful of continuous-strand parameters that
 * separate a confirmed failure event from normal operation, across a catalogue
 * far too large to eyeball.
 */

import type { StatusLevel } from "../index";

/** Engine system a parameter is measured on. */
export type ParameterSystem =
  | "fan"
  | "lp-compressor"
  | "hp-compressor"
  | "combustor"
  | "hp-turbine"
  | "ip-turbine"
  | "lp-turbine"
  | "oil"
  | "fuel"
  | "air-system"
  | "control"
  | "vibration"
  | "sensor-health";

export interface ParameterMeta {
  id: string;
  /** Short mnemonic as it appears in the schema, e.g. `HPT_TM_STG1_AVG`. */
  code: string;
  name: string;
  system: ParameterSystem;
  unit: string;
  /** Sample rate in Hz on the continuous strand. */
  hz: number;
  /** Share of flights where the parameter is present, 0-100. */
  coveragePct: number;
}

/**
 * A parameter scored against one investigation: how strongly it separates the
 * event population from normal, and how early it does so.
 */
export interface ParameterSignal {
  parameter: ParameterMeta;
  /** Point-biserial correlation with the event label, -1 to 1. */
  correlation: number;
  /** Separation between event and normal populations, in standard deviations. */
  separationSigma: number;
  /** Days before the event the signal first separates. */
  leadDays: number;
  /** Probability the separation is chance, expressed as a p-value. */
  pValue: number;
  /** Highest absolute correlation with a higher-ranked signal, 0-1. */
  redundancy: number;
  /** Red = strong and early, amber = usable, green = weak. Ranking, not health. */
  strength: StatusLevel;
  /** Already carried by a live analytic. */
  inLiveAnalytic: boolean;
}

/** A confirmed in-service event the explorer is trying to explain. */
export interface Investigation {
  id: string;
  failureMode: string;
  engineFamily: string;
  /** Engines with a confirmed event. */
  eventEngines: number;
  /** Engines in the matched normal population. */
  normalEngines: number;
  /** Flights swept on Databricks. */
  flights: number;
  /** Parameters in scope on the continuous strand. */
  parametersInScope: number;
  /** Data points swept, in millions. */
  dataPointsM: number;
  /** Compute minutes consumed by the last sweep. */
  sweepMinutes: number;
  status: StatusLevel;
  owner: string;
  updatedAt: string;
}

export interface ParameterTracePoint {
  /** Days relative to the event; negative is before. */
  day: number;
  /** Median of the event population, normalised to sigma from the normal mean. */
  event: number;
  /** Upper bound of the normal population band, in sigma. */
  normalHigh: number;
  /** Lower bound of the normal population band, in sigma. */
  normalLow: number;
}

export interface ParameterExplorerSummary {
  investigations: number;
  parametersInScope: number;
  dataPointsM: number;
  /** Shortlisted signals across all investigations: strong, early and non-redundant. */
  candidateSignals: number;
  /** Best lead time found, in days. */
  bestLeadDays: number;
  /** Signals not yet carried by any live analytic. */
  unexploited: number;
  sweepMinutes: number;
}
