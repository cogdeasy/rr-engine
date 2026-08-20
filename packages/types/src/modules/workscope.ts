/**
 * Shop visit workscoping — module-by-module workscope build-up with cost, TAT
 * and the on-wing life each scenario buys back.
 */

import type { Iso, ModuleCode, StatusLevel } from "../index";

/** Depth of work carried out on a module during the shop visit. */
export type WorkscopeLevel = "inspect" | "repair" | "restore" | "replace";

export type WorkscopeScenarioId = "minimum-viable" | "performance-restoration" | "full-overhaul";

/** A single piece of evidence that pushed a module up the workscope ladder. */
export interface WorkscopeDriver {
  label: string;
  detail: string;
  /** Points contributed to the module severity index, 0-100. */
  contribution: number;
  status: StatusLevel;
}

export interface WorkscopeLlpLine {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  moduleCode: ModuleCode;
  cyclesRemaining: number;
  cyclicLimit: number;
  /** Unused life scrapped if the part is changed at this visit. */
  stubCyclesScrapped: number;
  unitCostUsd: number;
  leadTimeDays: number;
  supplier: string;
  status: StatusLevel;
  /** True when the part cannot survive the next planned on-wing interval. */
  mandatory: boolean;
  reason: string;
}

export interface WorkscopeModuleLine {
  code: ModuleCode;
  label: string;
  ataChapter: string;
  status: StatusLevel;
  lifeConsumedPct: number;
  lastInspectedAt: Iso | null;
  /** 0-100 condition-driven severity; the level ladder is a function of this. */
  severityIndex: number;
  /** Level the evidence supports, independent of the scenario. */
  recommendedLevel: WorkscopeLevel;
  /** Level applied within the scenario this line belongs to. */
  level: WorkscopeLevel;
  labourHours: number;
  labourUsd: number;
  materialUsd: number;
  costUsd: number;
  /** Bench days on the critical path for this module. */
  shopDays: number;
  egtMarginRestoredC: number;
  llps: WorkscopeLlpLine[];
  drivers: WorkscopeDriver[];
  rationale: string;
}

export interface WorkscopeScenario {
  id: WorkscopeScenarioId;
  label: string;
  intent: string;
  modules: WorkscopeModuleLine[];
  /** Modules actually opened (level above inspect-only). */
  modulesOpened: number;
  llps: WorkscopeLlpLine[];
  labourUsd: number;
  materialUsd: number;
  costUsd: number;
  labourHours: number;
  tatDays: number;
  egtMarginRestoredC: number;
  projectedEgtMarginC: number;
  /** Cycles of on-wing life the scenario buys before the next removal. */
  onWingCyclesAdded: number;
  nextRemovalCycles: number;
  nextRemovalAt: Iso;
  /** What ends the next on-wing period: performance decay or an LLP expiry. */
  nextRemovalLimiter: "performance" | "llp";
  costPerOnWingCycleUsd: number;
  risks: string[];
}

export interface EngineWorkscope {
  engineId: string;
  esn: string;
  family: string;
  buildStandard: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  location: string;
  status: StatusLevel;
  healthScore: number;
  egtMarginC: number;
  newEgtMarginC: number;
  cyclesSinceOverhaul: number;
  overhaulIntervalCycles: number;
  rulCycles: number;
  environmentSeverity: number;
  cyclesPerDay: number;
  /** Why the engine is in the workscoping queue at all. */
  removalReason: string;
  removalWithinCycles: number;
  removalBy: Iso;
  urgency: StatusLevel;
  openAlerts: number;
  scenarios: WorkscopeScenario[];
  recommendedScenarioId: WorkscopeScenarioId;
  recommendationRationale: string;
}

/** Queue row: one engine awaiting a workscope decision. */
export interface WorkscopeCandidate {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  operatorName: string;
  status: StatusLevel;
  urgency: StatusLevel;
  egtMarginC: number;
  healthScore: number;
  removalWithinCycles: number;
  removalBy: Iso;
  redModules: number;
  llpsDue: number;
  recommendedScenarioId: WorkscopeScenarioId;
  recommendedCostUsd: number;
  recommendedTatDays: number;
}

export interface WorkscopeQueueSummary {
  candidates: number;
  urgent: number;
  committedCostUsd: number;
  averageTatDays: number;
  modulesToOpen: number;
  llpsToReplace: number;
  marginRestoredC: number;
  deferralSavingsUsd: number;
}
