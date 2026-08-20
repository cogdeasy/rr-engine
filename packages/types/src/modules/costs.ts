/**
 * Cost analytics (`costs`) — maintenance cost per engine flight hour.
 *
 * All money is USD and all rates are expressed per engine flight hour (EFH) on
 * an accrual basis: heavy maintenance and life-limited part consumption are
 * amortised across the interval they buy, which is how TotalCare-style
 * contracts are priced and how a cost controller reasons about drift.
 */

import type { EngineFamily, Iso, ModuleCode, Point, Region, StatusLevel } from "../index";

export const COST_CATEGORIES = ["labour", "materials", "llp", "transport", "penalties"] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export type CostBreakdown = Record<CostCategory, number>;

/** Aggregated cost and volume for a bounded period. */
export interface CostPeriod {
  label: string;
  startsAt: Iso;
  endsAt: Iso;
  efh: number;
  cycles: number;
  cost: CostBreakdown;
  totalCostUsd: number;
  costPerEfh: number;
  budgetPerEfh: number;
}

export interface CostMonth {
  month: Iso;
  label: string;
  efh: number;
  cost: CostBreakdown;
  totalCostUsd: number;
  costPerEfh: number;
  budgetPerEfh: number;
}

/** One step of the cost-per-EFH bridge from the prior period to the current one. */
export interface CostBridgeStep {
  id: string;
  label: string;
  kind: "opening" | "delta" | "closing";
  /** Signed $/EFH movement for delta steps; the absolute rate for opening/closing. */
  value: number;
  /** Cumulative $/EFH before and after this step, for waterfall geometry. */
  start: number;
  end: number;
  category?: CostCategory;
  explanation: string;
}

export interface CostForecastPoint {
  month: Iso;
  label: string;
  costPerEfh: number;
  low: number;
  high: number;
  budgetPerEfh: number;
  /** Heavy events already in the plan for that month — the lumpy cash exposure. */
  scheduledEvents: number;
  scheduledCostUsd: number;
  status: StatusLevel;
}

export interface CostDriver {
  id: string;
  label: string;
  category: CostCategory;
  moduleCode: ModuleCode | null;
  /** Events per year across the managed fleet. */
  events: number;
  unitCostUsd: number;
  annualCostUsd: number;
  costPerEfh: number;
  sharePct: number;
  deltaPctVsPrior: number;
  status: StatusLevel;
  recommendedAction: string;
}

export interface OperatorCostRow {
  operatorId: string;
  code: string;
  name: string;
  region: Region;
  contractKind: string;
  engines: number;
  efh: number;
  cost: CostBreakdown;
  totalCostUsd: number;
  costPerEfh: number;
  budgetPerEfh: number;
  variancePct: number;
  deltaPctVsPrior: number;
  penaltiesUsd: number;
  topCategory: CostCategory;
  status: StatusLevel;
  history: Point[];
}

export interface FamilyCostRow {
  family: EngineFamily;
  engines: number;
  efh: number;
  costPerEfh: number;
  budgetPerEfh: number;
  variancePct: number;
  llpSharePct: number;
  status: StatusLevel;
}

export interface AogExposureRow {
  id: string;
  tail: string;
  aircraftType: string;
  operatorCode: string;
  engineEsn: string;
  cause: string;
  downSinceAt: Iso;
  hoursDown: number;
  expectedDaysRemaining: number;
  dailyDisruptionCostUsd: number;
  exposureUsd: number;
  status: StatusLevel;
  recommendedAction: string;
}

export interface BudgetVarianceRow {
  id: string;
  scope: "category" | "operator";
  label: string;
  budgetUsd: number;
  actualUsd: number;
  varianceUsd: number;
  variancePct: number;
  tolerancePct: number;
  status: StatusLevel;
}

/** A decision the page leads with, not a statistic. */
export interface CostAction {
  id: string;
  title: string;
  detail: string;
  impactUsd: number;
  status: StatusLevel;
  action: string;
  href: string;
}

export interface CostAnalytics {
  generatedAt: Iso;
  current: CostPeriod;
  prior: CostPeriod;
  /** Trailing 24 months, oldest first. */
  months: CostMonth[];
  bridge: CostBridgeStep[];
  forecast: CostForecastPoint[];
  drivers: CostDriver[];
  operators: OperatorCostRow[];
  families: FamilyCostRow[];
  budget: BudgetVarianceRow[];
  aog: {
    aircraftDown: number;
    exposureUsd: number;
    penaltiesAccruedUsd: number;
    rows: AogExposureRow[];
  };
  actions: CostAction[];
  tolerance: { amberPct: number; redPct: number };
}
