/**
 * Contracts & TotalCare — derived commercial view of the contract portfolio.
 *
 * The base `Contract` record describes the commercial agreement; the types here
 * describe the *position* of that contract: how it is performing against its
 * availability commitment, where the money stands and which guarantees are at
 * risk of being called.
 */

import type { Contract, EngineFamily, Iso, Operator, Point, StatusLevel } from "../index";

/** A contractual guarantee tracked against the actual fleet outturn. */
export interface ContractGuarantee {
  id: string;
  label: string;
  unit: string;
  guaranteed: number;
  actual: number;
  /** Which way is bad — shop visit rate is higher-is-worse, on-wing life is not. */
  direction: "higher-is-worse" | "lower-is-worse";
  /** Percentage headroom against the guarantee; negative means the guarantee is breached. */
  headroomPct: number;
  status: StatusLevel;
  basis: string;
}

export interface ContractPerformance {
  availabilityTarget: number;
  availabilityActual: number;
  /** Rolling three-month (quarter-to-date) availability. */
  quarterToDate: number;
  /** Quarter-end availability if the current trend continues. */
  projectedQuarterEnd: number;
  /** projectedQuarterEnd − availabilityTarget, in percentage points. */
  projectedGapPts: number;
  dispatchTarget: number;
  dispatchReliability: number;
  availabilityHistory: Point[];
  dispatchHistory: Point[];
  /** Engine-days lost to unserviceability in the quarter. */
  engineDaysDown: number;
  aogEvents: number;
  unscheduledRemovals: number;
  enginesRed: number;
  enginesAmber: number;
}

export interface ContractFinancials {
  /** Annualised engine flight hours across the covered fleet. */
  annualEfh: number;
  revenueAccruedUsd: number;
  maintenanceCostUsd: number;
  marginUsd: number;
  marginPct: number;
  costPerEfhUsd: number;
  penaltiesAccruedUsd: number;
  /** Liquidated damages payable per 0.1 pt of availability shortfall per quarter. */
  ldPerTenthPtUsd: number;
  projectedPenaltiesUsd: number;
  projectedRevenueUsd: number;
  projectedCostUsd: number;
  projectedMarginUsd: number;
  projectedMarginPct: number;
  /** Shop visits forecast inside the remaining term, and their expected cost. */
  forecastShopVisits: number;
  forecastShopVisitCostUsd: number;
}

export interface BreachDriver {
  label: string;
  detail: string;
  status: StatusLevel;
}

export interface ContractBreachRisk {
  status: StatusLevel;
  /** 0-100; higher means more likely to breach the availability commitment. */
  score: number;
  headline: string;
  drivers: BreachDriver[];
  recommendedAction: string;
  actionOwner: string;
}

export interface ContractPosition {
  contract: Contract;
  operator: Operator;
  coveredEngines: number;
  coveredAircraft: number;
  families: EngineFamily[];
  termEndsAt: Iso;
  termRemainingDays: number;
  termElapsedPct: number;
  performance: ContractPerformance;
  financials: ContractFinancials;
  guarantees: ContractGuarantee[];
  breachRisk: ContractBreachRisk;
  status: StatusLevel;
}

export interface ContractPortfolioSummary {
  contracts: number;
  coveredEngines: number;
  atRisk: number;
  breaching: number;
  /** Fleet-weighted availability against the fleet-weighted commitment. */
  weightedAvailability: number;
  weightedCommitment: number;
  penaltiesAccruedUsd: number;
  projectedPenaltiesUsd: number;
  revenueAccruedUsd: number;
  marginPct: number;
  annualEfh: number;
  guaranteesBreached: number;
}
