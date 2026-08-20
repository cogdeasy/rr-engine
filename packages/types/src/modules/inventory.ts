/**
 * Parts & inventory module contracts.
 *
 * The module answers one question: will the parts be on the shelf when the
 * engine arrives? Everything here is derived from the base dataset (parts,
 * inventory, work orders, task cards, facilities) by `@rr/data`.
 */

import type { Iso, ModuleCode, Severity, StatusLevel } from "../index";

/** A single planned consumption of a part against a scheduled work order. */
export interface PartDemandLine {
  id: string;
  partNumber: string;
  facilityId: string;
  workOrderId: string;
  workOrderRef: string;
  taskCardId: string;
  engineId: string;
  qty: number;
  neededBy: Iso;
  daysToNeed: number;
  priority: Severity;
  /** The work order or task card is already held for this part. */
  blocking: boolean;
}

/** Stock position for one part number at one facility, with 90-day exposure. */
export interface StockPosition {
  id: string;
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  facilityId: string;
  facilityIcao: string;
  facilityName: string;
  supplier: string;
  lifeLimited: boolean;
  onHand: number;
  reserved: number;
  available: number;
  onOrder: number;
  reorderPoint: number;
  unitCostUsd: number;
  leadTimeDays: number;
  nextDeliveryAt: Iso | null;
  /** Total quantity required by planned work in the next 90 days. */
  demand90: number;
  /** Demand lines that are already holding a work order. */
  blockingDemand: number;
  /** available + inbound-inside-horizon − demand90. Negative means short. */
  projectedBalance: number;
  shortfall: number;
  /** Days of cover at the planned consumption rate; null when there is no demand. */
  coverDays: number | null;
  daysToFirstNeed: number | null;
  /** Inbound stock arrives after the first need date. */
  inboundLate: boolean;
  valueUsd: number;
  status: StatusLevel;
  /** Plain-English justification for the status colour. */
  reason: string;
}

/** A shortage the planner has to act on, with the recommended recovery. */
export interface ShortageLine {
  position: StockPosition;
  action: "expedite" | "transfer" | "raise-po" | "monitor";
  actionLabel: string;
  /** Facility holding surplus of the same part number, when one exists. */
  transferFromIcao: string | null;
  transferQty: number;
  workOrderRefs: string[];
  engineIds: string[];
  exposureUsd: number;
}

export type RotableCondition = "serviceable" | "unserviceable" | "in-repair" | "in-transit";

/** Rotable pool position: repairable assets cycling through the shop. */
export interface RotablePoolEntry {
  partNumber: string;
  description: string;
  moduleCode: ModuleCode;
  facilityId: string;
  facilityIcao: string;
  poolSize: number;
  serviceable: number;
  unserviceable: number;
  inRepair: number;
  inTransit: number;
  /** Actual repair turn time, days. */
  turnTimeDays: number;
  targetTurnDays: number;
  /** Pool units required to keep planned work covered. */
  requiredServiceable: number;
  status: StatusLevel;
  reason: string;
}

export interface RotablePoolSummary {
  poolUnits: number;
  serviceable: number;
  unserviceable: number;
  inRepair: number;
  inTransit: number;
  averageTurnDays: number;
  targetTurnDays: number;
  entriesBelowCover: number;
}

export interface FacilityStockSummary {
  facilityId: string;
  icao: string;
  name: string;
  lines: number;
  valueUsd: number;
  shortLines: number;
  blockingLines: number;
  fillRatePct: number;
  status: StatusLevel;
}

export interface ModuleStockValue {
  moduleCode: ModuleCode;
  valueUsd: number;
  lines: number;
}

/** Stock with no planned consumption — capital tied up on the shelf. */
export interface SlowMoverLine {
  partNumber: string;
  description: string;
  facilityIcao: string;
  onHand: number;
  excessUnits: number;
  valueUsd: number;
  excessValueUsd: number;
  daysSinceMovement: number;
  status: StatusLevel;
}

export interface InventorySummary {
  totalValueUsd: number;
  linesTracked: number;
  shortLines: number;
  blockingLines: number;
  blockedWorkOrders: number;
  stockoutLines: number;
  /** Share of 90-day demand lines coverable from on-hand stock. */
  fillRatePct: number;
  exposureUsd: number;
  slowMoverValueUsd: number;
  facilitiesAtRisk: number;
  horizonDays: number;
}
