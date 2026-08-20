/**
 * Build records — as-built engine configuration, module serial history and
 * part traceability.
 *
 * The domain question: "what is actually installed in this engine right now,
 * where did each item come from, and does it match the fleet standard?"
 */

import type { Iso, ModuleCode, StatusLevel } from "../index";

/** How a module or part arrived on the engine. */
export type BuildPartSource = "new" | "overhauled" | "repaired" | "used-serviceable" | "loan";

/** Conformance of an installed item against the published fleet standard. */
export type ConfigConformance = "standard" | "superseded" | "non-standard";

export interface ModuleInstallation {
  id: string;
  engineId: string;
  moduleCode: ModuleCode;
  label: string;
  /** Module (major assembly) serial number. */
  serialNumber: string;
  /** Module build standard revision, e.g. "XWB84/HPT-C". */
  buildStandard: string;
  /** Published fleet standard for this family and module. */
  fleetStandard: string;
  conformance: ConfigConformance;
  source: BuildPartSource;
  installedAt: Iso;
  facilityId: string;
  cyclesSinceInstall: number;
  hoursSinceInstall: number;
  lifeConsumedPct: number;
  status: StatusLevel;
  /** Life-limited parts serialised inside this module. */
  llpCount: number;
  /** False when a release certificate is missing from the build pack. */
  traceComplete: boolean;
  ataChapter: string;
}

export type BuildEventKind =
  | "engine-build"
  | "module-replaced"
  | "module-overhauled"
  | "llp-replaced"
  | "sb-embodied"
  | "repair-embodied"
  | "configuration-deviation";

export interface BuildEvent {
  id: string;
  engineId: string;
  at: Iso;
  kind: BuildEventKind;
  moduleCode: ModuleCode | null;
  facilityId: string;
  /** Serial removed, when the event swapped hardware. */
  fromSerial: string | null;
  /** Serial fitted, when the event swapped hardware. */
  toSerial: string | null;
  reason: string;
  reference: string;
  certifiedBy: string;
  status: StatusLevel;
}

export interface ConfigDiffRow {
  moduleCode: ModuleCode;
  label: string;
  installedStandard: string;
  fleetStandard: string;
  conformance: ConfigConformance;
  source: BuildPartSource;
  /** Revisions behind the published fleet standard; 0 when at standard. */
  revisionsBehind: number;
  impact: string;
  recommendedAction: string;
  status: StatusLevel;
}

export interface TraceabilityPart {
  partNumber: string;
  description: string;
  serialNumber: string;
  moduleCode: ModuleCode;
  lifeLimited: boolean;
  cyclesUsed: number;
  cyclicLimit: number | null;
  cyclesRemaining: number | null;
  supplier: string;
  /** Airworthiness release certificate reference, null when the pack is short. */
  releaseCertificate: string | null;
  batch: string;
  source: BuildPartSource;
  status: StatusLevel;
}

export interface TraceabilityNode {
  moduleCode: ModuleCode;
  label: string;
  serialNumber: string;
  source: BuildPartSource;
  traceComplete: boolean;
  parts: TraceabilityPart[];
}

export interface SbEmbodimentRow {
  bulletinId: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  mandatory: boolean;
  embodied: boolean;
  dueAt: Iso;
  daysToDue: number;
  estimatedHours: number;
  status: StatusLevel;
}

export interface EngineBuildRecord {
  engineId: string;
  esn: string;
  family: string;
  operatorName: string;
  aircraftTail: string | null;
  buildStandard: string;
  lastBuildAt: Iso;
  lastBuildFacilityId: string;
  totalFlightCycles: number;
  cyclesSinceOverhaul: number;
  modules: ModuleInstallation[];
  events: BuildEvent[];
  diff: ConfigDiffRow[];
  traceability: TraceabilityNode[];
  bulletins: SbEmbodimentRow[];
  /** Modules behind the published fleet standard. */
  supersededCount: number;
  /** Modules fitted outside the approved standard (loan / used-serviceable). */
  nonStandardCount: number;
  /** Serialised parts without a release certificate in the build pack. */
  traceGapCount: number;
  overdueBulletinCount: number;
  configurationStatus: StatusLevel;
  /** Percentage of installed modules at the published fleet standard. */
  conformancePct: number;
  recommendedAction: string;
}

/** Compact row used by the fleet-level configuration picker and roll-up. */
export interface BuildRecordSummary {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  buildStandard: string;
  conformancePct: number;
  supersededCount: number;
  nonStandardCount: number;
  traceGapCount: number;
  overdueBulletinCount: number;
  lastBuildAt: Iso;
  configurationStatus: StatusLevel;
}

export interface BuildRecordsFleetSummary {
  engines: number;
  atStandard: number;
  superseded: number;
  nonStandard: number;
  traceGaps: number;
  overdueBulletins: number;
  averageConformancePct: number;
  /** Engines whose configuration needs action, worst first. */
  attention: BuildRecordSummary[];
}
