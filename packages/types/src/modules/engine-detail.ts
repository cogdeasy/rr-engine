/**
 * Types for the `engine-detail` module — the per-engine dossier and its 3D twin.
 */

import type {
  Aircraft,
  Alert,
  Engine,
  EngineFamily,
  Iso,
  LlpStatus,
  ModuleCode,
  Operator,
  ParameterId,
  Prognostic,
  Series,
  ServiceBulletin,
  StatusLevel,
  TaskCard,
  WorkOrder,
} from "../index";

/** A single live reading shown against a module in the twin's condition panel. */
export interface ModuleParameterReading {
  id: ParameterId;
  label: string;
  unit: string;
  value: number;
  status: StatusLevel;
  amber: number;
  red: number;
  min: number;
  max: number;
  direction: "higher-is-worse" | "lower-is-worse";
}

/** Everything the UI needs to explain the condition of one physical module. */
export interface ModuleCondition {
  code: ModuleCode;
  label: string;
  description: string;
  ataChapter: string;
  status: StatusLevel;
  /** Percentage of certified life consumed. */
  lifeConsumedPct: number;
  lastInspectedAt: Iso | null;
  /** Substring hints used to match glTF node names in the 3D asset. */
  gltfNodes: string[];
  openAlertIds: string[];
  /** Highest-severity open alert attributable to this module. */
  drivingAlert: Alert | null;
  /** Most probable predicted failure mode for this module. */
  prognostic: Prognostic | null;
  readings: ModuleParameterReading[];
  /** Plain-language explanation of why this module carries its status colour. */
  reason: string;
  recommendedAction: string | null;
}

/** The single decision this page leads with. */
export interface EngineRecommendedAction {
  status: StatusLevel;
  headline: string;
  detail: string;
  /** Hours until the action must be taken; null when there is no deadline. */
  dueInHours: number | null;
  moduleCode: ModuleCode | null;
  alertId: string | null;
  cta: string;
}

/** Reference profile for the engine family, used in the dossier header. */
export interface EngineFamilyProfile {
  family: EngineFamily;
  thrustLbf: number;
  fanDiameterIn: number;
  bypassRatio: number;
  entryIntoService: number;
  overhaulIntervalCycles: number;
  newEgtMargin: number;
  blurb: string;
}

/** The GLB asset backing the twin for an engine family. */
export interface EngineTwinAsset {
  key: string;
  label: string;
  /** Official Rolls-Royce CMS URL, preferred at runtime. */
  url: string;
  /** Gitignored local development cache. */
  localPath: string;
  /** Animation clip names used for the cutaway/exploded view. */
  explodeClip: string;
  recombineClip: string;
}

export interface EngineFlightSummary {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departedAt: Iso;
  blockHours: number;
  derate: number;
  outsideAirTempC: number;
  environmentalExposure: number;
}

/** Full per-engine dossier assembled from the deterministic fleet dataset. */
export interface EngineDossier {
  engine: Engine;
  operator: Operator | null;
  aircraft: Aircraft | null;
  familyProfile: EngineFamilyProfile;
  twin: EngineTwinAsset | null;
  modules: ModuleCondition[];
  recommendedAction: EngineRecommendedAction;
  alerts: Alert[];
  prognostics: Prognostic[];
  workOrders: WorkOrder[];
  taskCards: TaskCard[];
  llps: LlpStatus[];
  serviceBulletins: ServiceBulletin[];
  trends: Series[];
  recentFlights: EngineFlightSummary[];
  /** Cycles remaining before the family's scheduled overhaul interval is reached. */
  cyclesToOverhaulInterval: number;
}
