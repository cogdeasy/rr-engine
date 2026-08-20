/**
 * @rr/types — shared domain model for the Rolls-Royce engine health & MRO platform.
 *
 * Every package and app in the monorepo imports its domain vocabulary from here.
 * Feature modules may add their own types in `src/modules/<module-id>.ts` and
 * re-export them from `src/modules/index.ts`.
 */

export * from "./modules";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** ISO-8601 timestamp, always UTC. */
export type Iso = string;

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Operational status colour used consistently across the whole UI. */
export type StatusLevel = "red" | "amber" | "green" | "grey";

export type Trend = "up" | "down" | "flat";

export interface Range {
  min: number;
  max: number;
}

/** A single point in a time series. */
export interface Point {
  t: Iso;
  v: number;
}

export interface Series {
  id: string;
  label: string;
  unit: string;
  points: Point[];
  /** Operator/OEM alert threshold, if one applies to this parameter. */
  amberThreshold?: number;
  redThreshold?: number;
}

/* ------------------------------------------------------------------ */
/* Fleet: operators, aircraft, engines                                 */
/* ------------------------------------------------------------------ */

export type EngineFamily =
  | "Trent XWB-84"
  | "Trent XWB-97"
  | "Trent 1000 TEN"
  | "Trent 7000"
  | "Trent 900"
  | "UltraFan";

export type AircraftType =
  | "A350-900"
  | "A350-1000"
  | "B787-8"
  | "B787-9"
  | "B787-10"
  | "A330-900neo"
  | "A380-800";

export type Region =
  | "Europe"
  | "North America"
  | "South America"
  | "Middle East"
  | "Africa"
  | "Asia Pacific"
  | "Greater China";

export interface Operator {
  id: string;
  /** IATA code, e.g. "BA". */
  code: string;
  name: string;
  region: Region;
  /** Primary maintenance base, ICAO. */
  homeBase: string;
  contractId: string;
  fleetSize: number;
}

export interface Aircraft {
  id: string;
  /** Registration, e.g. "G-XWBA". */
  tail: string;
  type: AircraftType;
  operatorId: string;
  msn: string;
  deliveredAt: Iso;
  /** Engine serial numbers by position (1 = left outboard). */
  engineIds: string[];
  status: "in-service" | "in-maintenance" | "aog" | "stored";
}

export type EngineLifeStage = "new" | "mature" | "pre-shop-visit" | "in-shop" | "post-overhaul";

export interface Engine {
  id: string;
  /** Engine serial number, e.g. "ESN-21042". */
  esn: string;
  family: EngineFamily;
  operatorId: string;
  aircraftId: string | null;
  /** 1-based installed position; null when off-wing. */
  position: 1 | 2 | 3 | 4 | null;
  installedAt: Iso | null;
  buildStandard: string;
  lifeStage: EngineLifeStage;
  /** Cumulative since new. */
  totalFlightHours: number;
  totalFlightCycles: number;
  /** Cumulative since last shop visit. */
  hoursSinceOverhaul: number;
  cyclesSinceOverhaul: number;
  /** Degrees C of EGT margin remaining — the headline health parameter. */
  egtMargin: number;
  /** Fleet-relative health score, 0-100. */
  healthScore: number;
  status: StatusLevel;
  /** Predicted remaining useful life before removal is required. */
  rulCycles: number;
  /** Environmental severity of the routes flown, 1 (benign) to 5 (harsh/sandy). */
  environmentSeverity: number;
  thrustRating: string;
  location: string;
}

/** Physical module breakdown used for workscoping and 3D twin hotspots. */
export type ModuleCode =
  | "FAN"
  | "IPC"
  | "HPC"
  | "COMBUSTOR"
  | "HPT"
  | "IPT"
  | "LPT"
  | "GEARBOX"
  | "ACCESSORY"
  | "NACELLE"
  | "EXTERNALS";

export interface EngineModule {
  code: ModuleCode;
  label: string;
  engineId: string;
  status: StatusLevel;
  /** Percentage of certified life consumed. */
  lifeConsumedPct: number;
  lastInspectedAt: Iso | null;
  /** Node name(s) inside the glTF asset, used to highlight the module in 3D. */
  gltfNodes: string[];
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Flights & telemetry                                                 */
/* ------------------------------------------------------------------ */

export interface Flight {
  id: string;
  aircraftId: string;
  operatorId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departedAt: Iso;
  arrivedAt: Iso;
  blockHours: number;
  cycles: 1;
  /** Reduced-thrust take-off percentage; higher derate preserves EGT margin. */
  derate: number;
  outsideAirTempC: number;
  fuelBurnKg: number;
  /** Dust/sand exposure index accumulated over the sector, 0-1. */
  environmentalExposure: number;
}

export type ParameterId =
  | "egt"
  | "egtMargin"
  | "n1"
  | "n2"
  | "n3"
  | "oilPressure"
  | "oilTemp"
  | "oilConsumption"
  | "vibN1"
  | "vibN2"
  | "vibN3"
  | "fuelFlow"
  | "t30"
  | "p30"
  | "bleedPressure"
  | "tipClearance"
  | "oilDebrisCount";

export interface ParameterDefinition {
  id: ParameterId;
  label: string;
  unit: string;
  /** Normal operating envelope. */
  nominal: Range;
  amber: Range;
  red: Range;
  /** Higher-is-worse (e.g. vibration) vs lower-is-worse (e.g. EGT margin). */
  direction: "higher-is-worse" | "lower-is-worse";
  ataChapter: string;
}

export interface TelemetrySnapshot {
  engineId: string;
  t: Iso;
  values: Partial<Record<ParameterId, number>>;
}

/* ------------------------------------------------------------------ */
/* Alerts, events & prognostics                                        */
/* ------------------------------------------------------------------ */

export type AlertSource =
  | "EHM"
  | "ACARS"
  | "pilot-report"
  | "borescope"
  | "oil-debris"
  | "vibration-analysis"
  | "prognostic-model"
  | "line-maintenance";

export type AlertState = "new" | "triaged" | "investigating" | "actioned" | "closed" | "false-positive";

export interface Alert {
  id: string;
  engineId: string;
  operatorId: string;
  raisedAt: Iso;
  source: AlertSource;
  severity: Severity;
  status: StatusLevel;
  state: AlertState;
  title: string;
  description: string;
  parameter?: ParameterId;
  ataChapter: string;
  /** Model confidence for prognostic alerts, 0-1. */
  confidence?: number;
  recommendedAction: string;
  /** Hours until the recommended action must be taken. */
  timeToActionHours: number | null;
  assignee?: string;
  relatedWorkOrderId?: string;
}

export interface Prognostic {
  id: string;
  engineId: string;
  moduleCode: ModuleCode;
  failureMode: string;
  /** Probability of exceedance before the horizon, 0-1. */
  probability: number;
  horizonCycles: number;
  rulCycles: number;
  confidenceInterval: Range;
  modelVersion: string;
  computedAt: Iso;
  drivers: { label: string; contribution: number }[];
}

/* ------------------------------------------------------------------ */
/* Maintenance: work orders, shop visits, task cards                   */
/* ------------------------------------------------------------------ */

export type MaintenanceType =
  | "line"
  | "base"
  | "shop-visit"
  | "borescope"
  | "on-wing-repair"
  | "module-swap"
  | "aog-recovery";

export type WorkOrderState = "draft" | "planned" | "released" | "in-progress" | "awaiting-parts" | "complete" | "cancelled";

export interface WorkOrder {
  id: string;
  reference: string;
  engineId: string;
  operatorId: string;
  type: MaintenanceType;
  state: WorkOrderState;
  priority: Severity;
  raisedAt: Iso;
  scheduledStart: Iso;
  scheduledEnd: Iso;
  actualStart?: Iso;
  actualEnd?: Iso;
  facilityId: string;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  taskCardIds: string[];
  triggeringAlertIds: string[];
  /** Turn-around time in days. */
  tatDays: number;
  status: StatusLevel;
}

export interface TaskCard {
  id: string;
  workOrderId: string;
  reference: string;
  title: string;
  ataChapter: string;
  moduleCode: ModuleCode | null;
  estimatedHours: number;
  actualHours?: number;
  skillRequired: string;
  state: "open" | "in-progress" | "blocked" | "signed-off";
  assignedTechnicianId?: string;
  partsRequired: { partNumber: string; qty: number }[];
  signOffBy?: string;
  signOffAt?: Iso;
}

export interface Facility {
  id: string;
  name: string;
  icao: string;
  region: Region;
  kind: "overhaul-base" | "line-station" | "test-cell" | "partner-shop";
  /** Concurrent engine slots. */
  capacity: number;
  utilisationPct: number;
  lat: number;
  lon: number;
}

export interface Technician {
  id: string;
  name: string;
  facilityId: string;
  licences: string[];
  skills: string[];
  shift: "early" | "late" | "night";
  utilisationPct: number;
  certifiedFamilies: EngineFamily[];
}

/* ------------------------------------------------------------------ */
/* Parts, LLPs and supply chain                                        */
/* ------------------------------------------------------------------ */

export interface Part {
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  /** Life-limited parts are lifed by cycles and drive shop-visit timing. */
  lifeLimited: boolean;
  cyclicLimit?: number;
  unitCostUsd: number;
  leadTimeDays: number;
  supplier: string;
}

export interface LlpStatus {
  id: string;
  engineId: string;
  partNumber: string;
  serialNumber: string;
  moduleCode: ModuleCode;
  cyclesUsed: number;
  cyclicLimit: number;
  cyclesRemaining: number;
  status: StatusLevel;
  projectedExpiryDate: Iso;
}

export interface InventoryItem {
  id: string;
  partNumber: string;
  facilityId: string;
  onHand: number;
  reserved: number;
  onOrder: number;
  reorderPoint: number;
  status: StatusLevel;
  nextDeliveryAt: Iso | null;
}

/* ------------------------------------------------------------------ */
/* Commercial: contracts, costs, availability                          */
/* ------------------------------------------------------------------ */

export type ContractKind = "TotalCare" | "TotalCare Flex" | "Time & Materials" | "SelectCare";

export interface Contract {
  id: string;
  operatorId: string;
  kind: ContractKind;
  startsAt: Iso;
  endsAt: Iso;
  /** Dollars per engine flight hour. */
  ratePerEfhUsd: number;
  /** Contractual availability commitment, percent. */
  availabilityTarget: number;
  availabilityActual: number;
  /** Liquidated damages accrued this period. */
  penaltiesUsd: number;
  coveredEngineIds: string[];
  status: StatusLevel;
}

export interface KpiSnapshot {
  id: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  trend: Trend;
  /** Percentage change against the previous period. */
  deltaPct: number;
  status: StatusLevel;
  history: Point[];
}

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

export interface ServiceBulletin {
  id: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  family: EngineFamily;
  issuedAt: Iso;
  complianceDueAt: Iso;
  mandatory: boolean;
  affectedEngineIds: string[];
  embodiedEngineIds: string[];
  status: StatusLevel;
  estimatedHoursPerEngine: number;
}

export interface AuditEntry {
  id: string;
  at: Iso;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* API envelopes                                                       */
/* ------------------------------------------------------------------ */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
