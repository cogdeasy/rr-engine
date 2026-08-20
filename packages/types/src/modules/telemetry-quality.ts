/**
 * Telemetry quality — data trust model.
 *
 * The module answers "can we trust the data behind a red flag on this engine?".
 * Everything here describes the *feed*, never the engine's physical condition:
 * coverage of expected snapshots, freshness, and signal integrity.
 */

import type { Iso, ParameterId, StatusLevel } from "../index";

/** Why a feed is not fully trustworthy. */
export type FeedIssue = "no-data" | "gap" | "stale" | "frozen" | "out-of-range";

export interface ParameterFeedQuality {
  engineId: string;
  parameter: ParameterId;
  label: string;
  unit: string;
  ataChapter: string;
  /** False when the sensor is not part of this engine's data acquisition standard. */
  fitted: boolean;
  /** Snapshots expected in the reporting window, one per flown sector. */
  expectedSnapshots: number;
  receivedSnapshots: number;
  missingSnapshots: number;
  coveragePct: number;
  lastSampleAt: Iso | null;
  hoursSinceLastSample: number | null;
  /** Consecutive identical samples — a stuck sensor or a cached ACARS value. */
  frozenSamples: number;
  /** Samples outside the physically plausible envelope for the parameter. */
  outOfRangeSamples: number;
  issues: FeedIssue[];
  status: StatusLevel;
}

export interface EngineFeedQuality {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  position: number | null;
  engineStatus: StatusLevel;
  /** Number of sectors flown in the reporting window. */
  sectorsFlown: number;
  sectorsReported: number;
  sectorsMissing: number;
  coveragePct: number;
  lastSampleAt: Iso | null;
  hoursSinceLastSample: number | null;
  degradedParameters: number;
  /** Fitted parameters that returned nothing at all in the window. */
  deadParameters: number;
  unfittedParameters: number;
  frozenSignals: number;
  outOfRangeSamples: number;
  /** 0-100 composite of coverage, freshness and signal integrity. */
  trustIndex: number;
  status: StatusLevel;
  /** Open alerts on this engine that rest on a degraded feed. */
  impactedAlertIds: string[];
  recommendedAction: string;
  parameters: ParameterFeedQuality[];
}

export interface IngestDay {
  date: Iso;
  expected: number;
  received: number;
  coveragePct: number;
  status: StatusLevel;
}

export interface FlightDataGap {
  flightId: string;
  flightNumber: string;
  aircraftTail: string;
  operatorCode: string;
  route: string;
  departedAt: Iso;
  blockHours: number;
  engineIds: string[];
  expectedParameters: number;
  receivedParameters: number;
  missingParameters: ParameterId[];
  kind: "missing" | "partial";
  status: StatusLevel;
}

export interface ParameterRollup {
  parameter: ParameterId;
  label: string;
  unit: string;
  ataChapter: string;
  coveragePct: number;
  enginesNoData: number;
  enginesNotFitted: number;
  enginesDegraded: number;
  frozenSignals: number;
  outOfRangeSamples: number;
  status: StatusLevel;
}

/** A downstream analytic whose output is degraded by the current gaps. */
export interface DownstreamImpact {
  id: string;
  analytic: string;
  href: string;
  dependsOn: ParameterId[];
  coveragePct: number;
  enginesAffected: number;
  /** Engines whose feed is dead for at least one required parameter. */
  enginesBlind: number;
  status: StatusLevel;
  consequence: string;
}

export interface TelemetryQualitySummary {
  windowDays: number;
  engines: number;
  enginesGreen: number;
  enginesAmber: number;
  enginesRed: number;
  enginesNoData: number;
  parametersMonitored: number;
  snapshotsExpected: number;
  snapshotsReceived: number;
  fleetCoveragePct: number;
  fleetTrustIndex: number;
  staleFeeds: number;
  frozenSignals: number;
  outOfRangeSamples: number;
  flightsMissingData: number;
  flightsPartialData: number;
  /** Open red alerts sitting on an untrustworthy feed. */
  unverifiableRedAlerts: number;
}

export interface TelemetryQualityReport {
  summary: TelemetryQualitySummary;
  engines: EngineFeedQuality[];
  parameters: ParameterRollup[];
  ingest: IngestDay[];
  flightGaps: FlightDataGap[];
  impacts: DownstreamImpact[];
}
