/**
 * Failure risk module (`risk`, /predict/risk).
 *
 * Contracts for the probability x consequence view of the fleet: what could
 * fail before the next maintenance opportunity, what it would cost the
 * operator, and which mitigation buys down the most risk.
 */

import type { Iso, ModuleCode, Point, Range, StatusLevel } from "../index";

/** Operational consequence of the failure mode being realised in service. */
export type RiskConsequenceClass = "ifsd" | "aog" | "delay-cancellation" | "performance";

/** Mitigations an engineer can commit to from the risk register. */
export type RiskMitigationKind = "monitor" | "inspect" | "derate" | "remove";

/** 1 (remote) to 5 (probable) — the rows of the risk matrix. */
export type RiskLikelihoodBand = 1 | 2 | 3 | 4 | 5;

/** 1 (performance only) to 4 (in-flight shutdown) — the columns of the matrix. */
export type RiskConsequenceBand = 1 | 2 | 3 | 4;

export interface RiskMitigation {
  kind: RiskMitigationKind;
  label: string;
  /** What the engineer actually commits to. */
  detail: string;
  leadTimeDays: number;
  costUsd: number;
  /** Fractional reduction applied to the failure probability, 0-1. */
  effectiveness: number;
  residualProbability: number;
  residualExposureUsd: number;
  /** Exposure removed, net of the mitigation cost. */
  netBenefitUsd: number;
  residualStatus: StatusLevel;
  /** True when this is the mitigation the model recommends. */
  recommended: boolean;
}

export interface RiskDriver {
  label: string;
  contribution: number;
}

/** One failure mode on one engine, scored to the next maintenance opportunity. */
export interface EngineRiskItem {
  id: string;
  engineId: string;
  esn: string;
  family: string;
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: string;
  aircraftTail: string | null;
  moduleCode: ModuleCode;
  failureMode: string;
  ataChapter: string;
  /** Probability of failure before the next maintenance opportunity, 0-1. */
  probability: number;
  likelihoodBand: RiskLikelihoodBand;
  consequenceClass: RiskConsequenceClass;
  consequenceBand: RiskConsequenceBand;
  /** likelihoodBand x consequenceBand, 1-20. */
  riskScore: number;
  status: StatusLevel;
  /** Why the row is coloured the way it is, in one sentence. */
  rationale: string;
  cyclesToOpportunity: number;
  opportunityLabel: string;
  opportunityAt: Iso;
  /** Cost to the operator if the failure is realised. */
  consequenceCostUsd: number;
  /** probability x consequenceCostUsd. */
  exposureUsd: number;
  confidence: number;
  confidenceInterval: Range;
  modelVersion: string;
  computedAt: Iso;
  drivers: RiskDriver[];
  mitigations: RiskMitigation[];
  recommendedMitigation: RiskMitigation;
  residualExposureUsd: number;
}

export interface RiskMatrixCell {
  likelihood: RiskLikelihoodBand;
  consequence: RiskConsequenceBand;
  count: number;
  exposureUsd: number;
  status: StatusLevel;
  itemIds: string[];
}

export interface FailureModeContribution {
  failureMode: string;
  moduleCode: ModuleCode;
  ataChapter: string;
  engines: number;
  /** Risks in this mode scored intolerable. */
  intolerable: number;
  meanProbability: number;
  exposureUsd: number;
  sharePct: number;
  residualExposureUsd: number;
  status: StatusLevel;
  dominantConsequence: RiskConsequenceClass;
  history: Point[];
}

export interface RiskExposureTrend {
  /** Gross expected disruption cost across the fleet, last 90 days. */
  gross: Point[];
  /** Exposure remaining once committed mitigations are applied. */
  residual: Point[];
  deltaPct: number;
  peakUsd: number;
  currentUsd: number;
}

export interface RiskSummary {
  engines: number;
  /** Engines with no prognostic coverage — grey, not green. */
  unscoredEngines: number;
  scoredItems: number;
  intolerable: number;
  watchlist: number;
  exposureUsd: number;
  residualExposureUsd: number;
  buydownUsd: number;
  mitigationCostUsd: number;
  expectedIfsdEvents: number;
  expectedAogEvents: number;
  meanConfidence: number;
  lowConfidenceItems: number;
  dominantFailureMode: string;
  dominantFailureModeSharePct: number;
  worstOperatorCode: string;
  worstOperatorExposureUsd: number;
}

export interface OperatorRiskExposure {
  operatorId: string;
  operatorCode: string;
  operatorName: string;
  region: string;
  engines: number;
  intolerable: number;
  exposureUsd: number;
  residualExposureUsd: number;
  status: StatusLevel;
}

export interface RiskBoard {
  generatedAt: Iso;
  summary: RiskSummary;
  items: EngineRiskItem[];
  matrix: RiskMatrixCell[];
  failureModes: FailureModeContribution[];
  operators: OperatorRiskExposure[];
  trend: RiskExposureTrend;
}
