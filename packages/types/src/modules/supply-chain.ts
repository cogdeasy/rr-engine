/**
 * Supply chain module — supplier performance, purchase orders, shortage risk.
 *
 * The domain question: "Which shortages will delay a shop visit in the next 90
 * days, and is expediting cheaper than the delay it avoids?"
 */

import type { Iso, ModuleCode, StatusLevel } from "../index";

export type PurchaseOrderState =
  | "requisitioned"
  | "placed"
  | "acknowledged"
  | "in-manufacture"
  | "in-transit"
  | "customs-hold"
  | "received";

export interface PurchaseOrder {
  id: string;
  reference: string;
  partNumber: string;
  description: string;
  supplier: string;
  facilityId: string;
  qty: number;
  valueUsd: number;
  raisedAt: Iso;
  /** Date the supplier originally committed to. */
  promisedAt: Iso;
  /** Current best estimate, including any slip notified by the supplier. */
  expectedAt: Iso;
  /** Days later than the original promise; negative means ahead of promise. */
  slipDays: number;
  state: PurchaseOrderState;
  status: StatusLevel;
  /** Work orders whose material demand this order covers. */
  workOrderIds: string[];
  /** Earliest required-on-dock date across the covered work orders, if any. */
  requiredOnDock: Iso | null;
  /** Positive = the order lands after it is needed. */
  lateByDays: number | null;
}

export interface SupplierPerformance {
  supplier: string;
  /** Deliveries received on or before the promised date, percent. */
  onTimeDeliveryPct: number;
  /** Non-conformances raised per 1,000 parts received. */
  qualityEscapesPer1000: number;
  /** Standard deviation of actual vs quoted lead time, days. */
  leadTimeVarianceDays: number;
  /** Mean quoted lead time across the supplied catalogue, days. */
  averageLeadTimeDays: number;
  openPoCount: number;
  openPoValueUsd: number;
  latePoCount: number;
  singleSourcePartCount: number;
  criticalShortageCount: number;
  status: StatusLevel;
  history: { t: Iso; v: number }[];
}

/**
 * A part whose available cover does not reach the date it is needed on dock for
 * a planned work order.
 */
export interface ShortageRisk {
  id: string;
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  supplier: string;
  singleSource: boolean;
  /** The work order the shortage would delay. */
  workOrderId: string;
  workOrderReference: string;
  workOrderType: string;
  engineId: string;
  engineEsn: string;
  operatorId: string;
  operatorCode: string;
  facilityId: string;
  facilityName: string;
  requiredOnDock: Iso;
  /** Days from today until the part must be on dock. */
  daysToRequired: number;
  qtyRequired: number;
  qtyAvailable: number;
  qtyOnOrder: number;
  /** Quoted supplier lead time for a fresh order. */
  leadTimeDays: number;
  /** Best arrival date given stock, open orders or a fresh order. */
  earliestCoverAt: Iso;
  /** Positive = the part lands after it is needed, i.e. the work order slips. */
  gapDays: number;
  /** Days of shop-visit delay the shortage causes if nothing is done. */
  projectedDelayDays: number;
  /** Cost of the delay: liquidated damages plus lost availability. */
  delayCostUsd: number;
  status: StatusLevel;
  coveringPoId: string | null;
  recommendedAction: string;
}

export type ExpediteMethod = "air-freight" | "supplier-overtime" | "alternate-source" | "loan-from-pool";

export interface ExpediteOption {
  id: string;
  shortageId: string;
  partNumber: string;
  description: string;
  supplier: string;
  workOrderReference: string;
  engineEsn: string;
  method: ExpediteMethod;
  /** Days pulled forward against the earliest cover date. */
  daysRecovered: number;
  /** Shop-visit delay days avoided by acting. */
  delayAvoidedDays: number;
  expediteCostUsd: number;
  delayCostUsd: number;
  netBenefitUsd: number;
  /** Probability the expedite lands on the recovered date, 0-1. */
  confidence: number;
  decideBy: Iso;
  status: StatusLevel;
  recommendation: "expedite" | "monitor" | "replan";
}

export interface CriticalPartRegisterEntry {
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  supplier: string;
  leadTimeDays: number;
  singleSource: boolean;
  longLead: boolean;
  unitCostUsd: number;
  onHand: number;
  onOrder: number;
  /** Open demand across planned work orders in the horizon. */
  demand90d: number;
  /** Days of cover at current demand rate; null when there is no demand. */
  coverDays: number | null;
  status: StatusLevel;
}

export interface SupplyChainSummary {
  horizonDays: number;
  shortages: number;
  criticalShortages: number;
  shopVisitsAtRisk: number;
  delayDaysExposed: number;
  delayCostExposureUsd: number;
  expediteCostUsd: number;
  netBenefitUsd: number;
  openPoCount: number;
  openPoValueUsd: number;
  latePoCount: number;
  fleetOnTimeDeliveryPct: number;
  singleSourceParts: number;
  longLeadParts: number;
}
