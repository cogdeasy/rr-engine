/**
 * Types for the `fleet-map` module — the geographic view answering
 * "which flagged engines are near a station that can act on them?".
 */

import type { Aircraft, AircraftType, EngineFamily, Facility, Iso, Region, Severity, StatusLevel } from "../index";

/** Where an airframe is right now, relative to the network. */
export type FleetMapPhase = "in-flight" | "on-ground" | "in-shop";

export interface FleetMapPlace {
  icao: string;
  iata: string;
  city: string;
  lat: number;
  lon: number;
}

export interface FleetMapEngineSummary {
  id: string;
  esn: string;
  family: EngineFamily;
  position: number | null;
  status: StatusLevel;
  egtMargin: number;
  healthScore: number;
  rulCycles: number;
  openAlerts: number;
}

export interface FleetMapAlertSummary {
  id: string;
  engineId: string;
  esn: string;
  title: string;
  severity: Severity;
  status: StatusLevel;
  source: string;
  ataChapter: string;
  raisedAt: Iso;
  recommendedAction: string;
  timeToActionHours: number | null;
}

/** A maintenance station evaluated against one specific airframe. */
export interface FleetMapStationMatch {
  stationId: string;
  name: string;
  icao: string;
  kind: Facility["kind"];
  distanceKm: number;
  ferryHours: number;
  freeSlots: number;
  utilisationPct: number;
  /** Technicians on station certified on the engine family that is flagged. */
  certifiedTechnicians: number;
  /** Free slot plus certified manpower for the flagged family. */
  capable: boolean;
}

export interface FleetMapStation {
  id: string;
  name: string;
  icao: string;
  region: Region;
  kind: Facility["kind"];
  lat: number;
  lon: number;
  capacity: number;
  utilisationPct: number;
  freeSlots: number;
  technicians: number;
  certifiedFamilies: EngineFamily[];
  /** Aircraft currently inbound or on stand within the capability radius. */
  flaggedInRange: number;
  status: StatusLevel;
}

export interface FleetMapAircraftNode {
  id: string;
  tail: string;
  type: AircraftType;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  fleetStatus: Aircraft["status"];
  phase: FleetMapPhase;
  lat: number;
  lon: number;
  region: Region;
  origin: FleetMapPlace | null;
  destination: FleetMapPlace | null;
  /** Fraction of the active sector completed, 0-1. */
  progress: number;
  etaMinutes: number | null;
  altitudeFt: number | null;
  groundSpeedKts: number | null;
  status: StatusLevel;
  families: EngineFamily[];
  engines: FleetMapEngineSummary[];
  redEngines: number;
  amberEngines: number;
  openAlerts: number;
  worstAlert: FleetMapAlertSummary | null;
  /** Nearest station able to take the flagged engine (slot + certified crew). */
  nearestCapable: FleetMapStationMatch | null;
  /** Nearest three stations regardless of capability, for fallback planning. */
  nearbyStations: FleetMapStationMatch[];
  recommendedAction: string;
  actionWindowHours: number | null;
  /** True when the action window is shorter than the ferry time to a capable base. */
  outOfReach: boolean;
}

export interface FleetMapRegionSummary {
  region: Region;
  aircraft: number;
  flaggedEngines: number;
  redEngines: number;
  amberEngines: number;
  stations: number;
  freeSlots: number;
  /** Flagged aircraft with no capable station inside their action window. */
  unreachable: number;
  status: StatusLevel;
}

export interface FleetMapSnapshot {
  generatedAt: Iso;
  aircraft: FleetMapAircraftNode[];
  stations: FleetMapStation[];
  regions: FleetMapRegionSummary[];
  operators: { id: string; code: string; name: string; region: Region }[];
  families: EngineFamily[];
  totals: {
    aircraft: number;
    inFlight: number;
    flaggedAircraft: number;
    redEngines: number;
    amberEngines: number;
    unreachable: number;
    nearCapableBase: number;
    freeSlots: number;
  };
}
