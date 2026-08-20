/**
 * LLP life management — types for life-limited part stacks, stub-life analysis
 * and removal optimisation.
 *
 * Vocabulary
 * - **Stub life**: certified cycles still remaining on an LLP at the moment the
 *   engine is removed. If the part has to come off at that shop visit, those
 *   cycles are scrapped and the money spent buying them is lost.
 * - **Driver**: whether the removal date is dictated by an LLP cyclic limit or
 *   by deteriorating condition (EGT margin / prognostic RUL).
 */

import type { Iso, LlpStatus, ModuleCode, StatusLevel } from "../index";

export type LlpRemovalDriver = "llp-limited" | "condition-limited" | "balanced";

/** Why the proposed removal date is what it is. */
export type LlpRemovalBasis = "scheduled-shop-visit" | "llp-expiry" | "condition-forecast";

/** One life-limited part on one engine, enriched for the planning decision. */
export interface LlpLine {
  id: string;
  engineId: string;
  partNumber: string;
  serialNumber: string;
  moduleCode: ModuleCode;
  description: string;
  cyclesUsed: number;
  cyclicLimit: number;
  cyclesRemaining: number;
  lifeUsedPct: number;
  status: StatusLevel;
  projectedExpiryDate: Iso;
  unitCostUsd: number;
  leadTimeDays: number;
  supplier: string;
  /** Certified cycles left on the part at the proposed removal date. */
  stubCycles: number;
  /** Value of that unused life at the part's cyclic cost. */
  stubValueUsd: number;
  /** True when the part cannot cover the next planned on-wing interval. */
  mustReplace: boolean;
  /** True when the part expires before the proposed removal date. */
  expiresBeforeRemoval: boolean;
  /** Order-by date to have the replacement on the bench for the shop visit. */
  orderByDate: Iso;
  /** Lead time does not fit before the proposed removal date. */
  leadTimeAtRisk: boolean;
}

export interface LlpRemovalOption {
  date: Iso;
  deltaDays: number;
  cyclesToRemoval: number;
  /** Value of unused LLP life scrapped if the engine is removed on this date. */
  stubValueUsd: number;
  /** Probability of an unplanned removal before this date, 0-1. */
  unplannedRisk: number;
  /** Risk-weighted cost of an unplanned removal. */
  riskCostUsd: number;
  /** On-wing cycles given up by removing before the LLP limit. */
  forgoneCycles: number;
  /** Ownership value of that unflown green time. */
  greenTimeCostUsd: number;
  totalCostUsd: number;
  /** No LLP expires in service before this date and the bench buffer still fits. */
  feasible: boolean;
}

export interface LlpRecommendation {
  action: string;
  rationale: string;
  recommendedRemovalDate: Iso;
  /** Positive = defer, negative = pull forward, relative to the proposed date. */
  deltaDays: number;
  stubValueAtProposedUsd: number;
  stubValueAtRecommendedUsd: number;
  riskCostAtRecommendedUsd: number;
  netBenefitUsd: number;
  status: StatusLevel;
  options: LlpRemovalOption[];
}

export interface EngineLlpStack {
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  aircraftTail: string | null;
  location: string;
  engineStatus: StatusLevel;
  healthScore: number;
  egtMargin: number;
  rulCycles: number;
  totalFlightCycles: number;
  /** Deterministic utilisation derived from the flight record. */
  cyclesPerDay: number;
  lines: LlpLine[];
  /** The LLP with the fewest cycles remaining — the one that sets the limit. */
  limitingLine: LlpLine;
  minCyclesRemaining: number;
  llpExpiryDate: Iso;
  driver: LlpRemovalDriver;
  /** Cycles between the LLP limit and the condition-based RUL. */
  driverMarginCycles: number;
  proposedRemovalDate: Iso;
  proposedRemovalBasis: LlpRemovalBasis;
  daysToRemoval: number;
  cyclesToRemoval: number;
  status: StatusLevel;
  stubValueUsd: number;
  mustReplaceCount: number;
  mustReplaceCostUsd: number;
  recommendation: LlpRecommendation;
}

/**
 * Compact projection of {@link EngineLlpStack} for fleet-wide tables: the whole
 * managed fleet can be sent to the client without the per-candidate-date
 * optimisation detail.
 */
export interface LlpFleetRow {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  /** Status of each part in the stack, in stack order. */
  stackStatuses: StatusLevel[];
  limitingPartNumber: string;
  limitingSerialNumber: string;
  limitingModuleCode: ModuleCode;
  minCyclesRemaining: number;
  llpExpiryDate: Iso;
  driver: LlpRemovalDriver;
  rulCycles: number;
  egtMargin: number;
  proposedRemovalDate: Iso;
  daysToRemoval: number;
  stubValueUsd: number;
  mustReplaceCount: number;
  recommendedAction: string;
  netBenefitUsd: number;
  status: StatusLevel;
}

export interface LlpExpiryBucket {
  /** First day of the month the LLPs expire in. */
  monthStart: Iso;
  label: string;
  count: number;
  redCount: number;
  engineCount: number;
  valueUsd: number;
}

export interface LlpFleetSummary {
  enginesTracked: number;
  partsTracked: number;
  redParts: number;
  amberParts: number;
  expiringIn90Days: number;
  llpDrivenEngines: number;
  conditionDrivenEngines: number;
  /** Stub life scrapped fleet-wide if every engine comes off as planned. */
  stubValueAtRiskUsd: number;
  /** Portion of that recoverable by adopting the recommended removal dates. */
  recoverableUsd: number;
  mustReplaceParts: number;
  mustReplaceCostUsd: number;
  leadTimeAtRiskParts: number;
  timeline: LlpExpiryBucket[];
}

/** Raw dataset record re-exported for convenience at the module boundary. */
export type LlpRecord = LlpStatus;
