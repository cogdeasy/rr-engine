/**
 * AOG command centre — the domain vocabulary for aircraft-on-ground recovery.
 *
 * An AOG event is the recovery of one grounded aircraft: a clock running against
 * a contractual return-to-service target, a five stage recovery plan with exactly
 * one blocking step, and a ranked set of paths back to service.
 */

import type { AircraftType, ContractKind, EngineFamily, Iso, ModuleCode, StatusLevel } from "../index";

/** How far up the organisation the event has been escalated. */
export type AogEscalation = "station" | "duty-manager" | "regional" | "executive";

export type AogStepId = "diagnose" | "parts" | "labour" | "test" | "release";

export type AogStepState = "complete" | "in-progress" | "blocked" | "pending";

export interface AogRecoveryStep {
  id: AogStepId;
  label: string;
  /** What the step delivers, in controller language. */
  detail: string;
  plannedHours: number;
  /** Hours already consumed by this step. */
  elapsedHours: number;
  state: AogStepState;
  /** Exactly one step per event is the blocking step. */
  blocking: boolean;
  owner: string;
  status: StatusLevel;
}

export interface AogPartSource {
  facilityId: string;
  facilityName: string;
  icao: string;
  available: number;
  distanceKm: number;
  /** Ferry/AOG freight time to the grounded aircraft's station. */
  transitHours: number;
}

export interface AogPartPosition {
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  requiredQty: number;
  /** Unreserved stock at the station holding the aircraft. */
  onHandAtStation: number;
  /** Nearest facilities holding unreserved stock, closest first. */
  sources: AogPartSource[];
  supplier: string;
  leadTimeDays: number;
  unitCostUsd: number;
  nextDeliveryAt: Iso | null;
  status: StatusLevel;
}

export interface AogFacilityOption {
  facilityId: string;
  name: string;
  icao: string;
  kind: "overhaul-base" | "line-station" | "test-cell" | "partner-shop";
  distanceKm: number;
  transitHours: number;
  slotsFree: number;
  utilisationPct: number;
  /** Technicians certified on the affected engine family. */
  capableTechnicians: number;
  status: StatusLevel;
}

export interface AogTechnicianAvailability {
  technicianId: string;
  name: string;
  facilityIcao: string;
  shift: "early" | "late" | "night";
  skills: string[];
  utilisationPct: number;
  /** Hours until the technician can be on the aircraft. */
  availableInHours: number;
  status: StatusLevel;
}

/** One candidate path back to service, ranked against the others. */
export interface AogRecoveryOption {
  id: string;
  label: string;
  detail: string;
  hoursToRts: number;
  costUsd: number;
  /** Planner confidence in the duration estimate, 0-1. */
  confidence: number;
  recommended: boolean;
  constraints: string[];
}

export interface AogEvent {
  id: string;
  aircraftId: string;
  tail: string;
  aircraftType: AircraftType;
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  contractKind: ContractKind;

  engineId: string;
  esn: string;
  engineFamily: EngineFamily;
  enginePosition: number;
  moduleCode: ModuleCode;

  stationIcao: string;
  stationCity: string;

  groundedAt: Iso;
  targetRtsAt: Iso;
  projectedRtsAt: Iso;
  hoursGrounded: number;
  /** Negative when the contractual target has already been breached. */
  hoursToTarget: number;
  /** Projected overrun against the target, hours; zero when on plan. */
  slipHours: number;

  cause: string;
  causeDetail: string;
  ataChapter: string;
  alertId: string | null;
  workOrderReference: string | null;

  escalation: AogEscalation;
  owner: string;
  ownerRole: string;
  status: StatusLevel;

  steps: AogRecoveryStep[];
  blockingStepId: AogStepId;
  parts: AogPartPosition[];
  facilities: AogFacilityOption[];
  technicians: AogTechnicianAvailability[];
  options: AogRecoveryOption[];

  costPerHourUsd: number;
  /** Cost already incurred plus projected cost to the projected RTS. */
  exposureUsd: number;
  passengersAffected: number;
  cancelledSectors: number;
}

export interface AogOperatorExposure {
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  events: number;
  exposureUsd: number;
  worstHoursGrounded: number;
  status: StatusLevel;
}

export interface AogFleetExposure {
  events: number;
  aircraftGrounded: number;
  targetsBreached: number;
  partsBlocked: number;
  exposureUsd: number;
  exposurePerHourUsd: number;
  averageHoursGrounded: number;
  longestHoursGrounded: number;
  passengersAffected: number;
  /** Hours saved by taking the recommended path over the next best one on every event. */
  recoverableHours: number;
  byOperator: AogOperatorExposure[];
}
