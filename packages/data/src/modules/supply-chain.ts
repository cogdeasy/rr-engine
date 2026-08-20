/**
 * Supply chain selectors.
 *
 * Everything here is derived from the deterministic core dataset: material
 * demand comes from the task cards of planned work orders, cover comes from
 * inventory and open purchase orders, and the shortage/expedite economics are
 * computed from the work order type and the operator's contract exposure.
 *
 * Nothing is hardcoded for display — the same functions back the API routes.
 */

import type {
  CriticalPartRegisterEntry,
  ExpediteMethod,
  ExpediteOption,
  Part,
  PurchaseOrder,
  PurchaseOrderState,
  ShortageRisk,
  StatusLevel,
  SupplierPerformance,
  SupplyChainSummary,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

export const SUPPLY_CHAIN_HORIZON_DAYS = 90;

/** Long-lead threshold used by planners: anything a quarter out or worse. */
const LONG_LEAD_DAYS = 120;

/** Cost of one day of shop-visit slip, by work order type (USD). */
const DELAY_COST_PER_DAY: Record<WorkOrder["type"], number> = {
  "shop-visit": 42_000,
  "module-swap": 28_000,
  "aog-recovery": 95_000,
  "on-wing-repair": 15_000,
  borescope: 6_000,
  base: 11_000,
  line: 8_000,
};

const EXPEDITE_METHOD_LABEL: Record<ExpediteMethod, string> = {
  "air-freight": "Charter air freight",
  "supplier-overtime": "Supplier weekend working",
  "alternate-source": "Release to alternate source",
  "loan-from-pool": "Loan from lease pool",
};

export function expediteMethodLabel(method: ExpediteMethod): string {
  return EXPEDITE_METHOD_LABEL[method];
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Deterministic single-source flag — roughly a quarter of the catalogue. */
export function isSingleSource(part: Part): boolean {
  const rng = createRng(`single-source:${part.partNumber}`);
  return rand.bool(rng, part.lifeLimited ? 0.46 : 0.2);
}

/**
 * Baseline delivery reliability of a supplier, 0-1. Drives purchase-order slip
 * so that on-time performance, lead-time variance and shortage counts all tell
 * the same story about the same supplier.
 */
export function supplierReliability(supplier: string): number {
  return round(rand.float(createRng(`reliability:${supplier}`), 0.62, 0.98), 3);
}

export function isLongLead(part: Part): boolean {
  return part.leadTimeDays >= LONG_LEAD_DAYS;
}

/* ------------------------------------------------------------------ */
/* Material demand                                                     */
/* ------------------------------------------------------------------ */

export interface MaterialDemandLine {
  workOrder: WorkOrder;
  part: Part;
  qty: number;
  requiredOnDock: string;
}

const OPEN_WORK_ORDER_STATES: WorkOrder["state"][] = ["draft", "planned", "released", "in-progress", "awaiting-parts"];

/**
 * When material with no stock cover lands.
 *
 * Planners release procurement ahead of the required-on-dock date with a float
 * that scales with the quoted lead time; the supplier then delivers against
 * that lead time with its own variance. A shortage therefore arises either from
 * a late material release or from supplier slip, which is what a controller
 * needs to tell apart.
 */
function pipelineArrival(line: MaterialDemandLine): Date {
  const { part, workOrder } = line;
  const rng = createRng(`pipeline:${workOrder.id}:${part.partNumber}`);
  const reliability = supplierReliability(part.supplier);
  const releasedLate = rand.bool(rng, 0.09);
  const floatFactor = releasedLate ? rand.float(rng, 0.6, 0.96) : rand.float(rng, 1.06, 1.45);
  const releasedAt = addDays(new Date(line.requiredOnDock), -Math.round(part.leadTimeDays * floatFactor));
  const supplierSlip = clamp(rand.gaussian(rng, (1 - reliability) * 0.28, 0.06), -0.08, 0.4);
  const actualLeadTimeDays = Math.round(part.leadTimeDays * (1 + supplierSlip));
  return addDays(releasedAt, actualLeadTimeDays);
}

/**
 * Material demand for every open work order, derived from the modules its task
 * cards touch. Task cards carry no bill of material in the core dataset, so the
 * kit is drawn deterministically from the module's part catalogue.
 */
export function materialDemand(): MaterialDemandLine[] {
  const data = getDataset();
  const partsByModule = new Map<string, Part[]>();
  for (const part of data.parts) {
    const list = partsByModule.get(part.moduleCode) ?? [];
    list.push(part);
    partsByModule.set(part.moduleCode, list);
  }

  const lines: MaterialDemandLine[] = [];
  for (const workOrder of data.workOrders) {
    if (!OPEN_WORK_ORDER_STATES.includes(workOrder.state)) continue;
    const cards = data.taskCards.filter((c) => c.workOrderId === workOrder.id);
    const seen = new Set<string>();
    for (const card of cards) {
      if (!card.moduleCode) continue;
      const pool = partsByModule.get(card.moduleCode);
      if (!pool || pool.length === 0) continue;
      const rng = createRng(`demand:${card.id}`);
      const kit = rand.sample(rng, pool, workOrder.type === "shop-visit" ? 2 : 1);
      for (const part of kit) {
        if (seen.has(part.partNumber)) continue;
        seen.add(part.partNumber);
        lines.push({
          workOrder,
          part,
          qty: part.lifeLimited ? rand.int(rng, 1, 2) : rand.int(rng, 1, 4),
          requiredOnDock: workOrder.scheduledStart,
        });
      }
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Purchase orders                                                     */
/* ------------------------------------------------------------------ */

function poState(expected: Date, raised: Date, leadTimeDays: number): PurchaseOrderState {
  const toArrival = daysBetween(NOW, expected);
  if (toArrival < 0) return "received";
  const elapsedFraction = clamp(daysBetween(raised, NOW) / Math.max(1, leadTimeDays), 0, 1);
  if (toArrival <= 7) return "in-transit";
  if (elapsedFraction > 0.55) return "in-manufacture";
  if (elapsedFraction > 0.2) return "acknowledged";
  return "placed";
}

let cachedOrders: PurchaseOrder[] | null = null;

/**
 * Open purchase orders. One order per inventory line with stock on order, so
 * the book always reconciles with the inventory module's `onOrder` figures.
 */
export function purchaseOrders(): PurchaseOrder[] {
  if (cachedOrders) return cachedOrders;
  const data = getDataset();
  const demand = materialDemand();
  const orders: PurchaseOrder[] = [];
  let n = 0;

  for (const item of data.inventory) {
    if (item.onOrder <= 0) continue;
    const part = data.parts.find((p) => p.partNumber === item.partNumber);
    if (!part) continue;
    n += 1;
    const rng = createRng(`po:${item.id}`);
    const raisedAt = addDays(NOW, -rand.int(rng, 5, Math.max(6, Math.round(part.leadTimeDays * 0.8))));
    const promised = item.nextDeliveryAt ? new Date(item.nextDeliveryAt) : addDays(raisedAt, part.leadTimeDays);
    const reliability = supplierReliability(part.supplier);
    const slipDays = rand.weighted(rng, [
      { value: -rand.int(rng, 1, 4), weight: reliability * 30 },
      { value: 0, weight: reliability * 70 },
      { value: rand.int(rng, 1, 9), weight: (1 - reliability) * 130 },
      { value: rand.int(rng, 10, 34), weight: (1 - reliability) * 90 },
      { value: rand.int(rng, 35, 70), weight: (1 - reliability) * 40 },
    ]);
    const expected = addDays(promised, slipDays);
    const covered = demand.filter(
      (d) =>
        d.part.partNumber === item.partNumber &&
        d.workOrder.facilityId === item.facilityId &&
        new Date(d.requiredOnDock).getTime() >= NOW.getTime(),
    );
    const requiredOnDock = covered
      .map((d) => d.requiredOnDock)
      .sort()
      .at(0);
    const lateByDays = requiredOnDock ? daysBetween(new Date(requiredOnDock), expected) : null;
    const state = poState(expected, raisedAt, part.leadTimeDays);
    const status: StatusLevel =
      lateByDays !== null && lateByDays > 0 ? "red" : slipDays >= 10 ? "amber" : state === "received" ? "green" : slipDays > 0 ? "amber" : "green";

    orders.push({
      id: `PO-${String(n).padStart(4, "0")}`,
      reference: `PO-26-${String(4200 + n)}`,
      partNumber: part.partNumber,
      description: part.description,
      supplier: part.supplier,
      facilityId: item.facilityId,
      qty: item.onOrder,
      valueUsd: item.onOrder * part.unitCostUsd,
      raisedAt: iso(raisedAt),
      promisedAt: iso(promised),
      expectedAt: iso(expected),
      slipDays,
      state: rand.bool(createRng(`customs:${item.id}`), 0.06) && state === "in-transit" ? "customs-hold" : state,
      status,
      workOrderIds: covered.map((d) => d.workOrder.id),
      requiredOnDock: requiredOnDock ?? null,
      lateByDays,
    });
  }

  cachedOrders = orders.sort((a, b) => (a.expectedAt < b.expectedAt ? -1 : 1));
  return cachedOrders;
}

export function openPurchaseOrders(): PurchaseOrder[] {
  return purchaseOrders().filter((po) => po.state !== "received");
}

/* ------------------------------------------------------------------ */
/* Shortage risk                                                       */
/* ------------------------------------------------------------------ */

let cachedShortages: ShortageRisk[] | null = null;

/**
 * Every demand line whose cover date is close to — or later than — the date the
 * part is needed on dock. Red is strictly "the part lands after it is needed".
 */
export function shortageRisks(horizonDays = SUPPLY_CHAIN_HORIZON_DAYS): ShortageRisk[] {
  if (!cachedShortages) cachedShortages = computeShortages();
  return cachedShortages.filter((s) => s.daysToRequired <= horizonDays);
}

function computeShortages(): ShortageRisk[] {
  const data = getDataset();
  const orders = purchaseOrders();
  const out: ShortageRisk[] = [];

  for (const line of materialDemand()) {
    const { workOrder, part, qty } = line;
    const required = new Date(line.requiredOnDock);
    const daysToRequired = daysBetween(NOW, required);
    if (daysToRequired < -14) continue;

    const stock = data.inventory.filter((i) => i.partNumber === part.partNumber && i.facilityId === workOrder.facilityId);
    const available = stock.reduce((sum, i) => sum + Math.max(0, i.onHand - i.reserved), 0);
    const onOrder = stock.reduce((sum, i) => sum + i.onOrder, 0);
    const coveringPo = orders.find((po) => po.partNumber === part.partNumber && po.facilityId === workOrder.facilityId) ?? null;

    let earliestCover: Date;
    if (available >= qty) earliestCover = NOW;
    else if (onOrder >= qty - available && coveringPo) earliestCover = new Date(coveringPo.expectedAt);
    else earliestCover = pipelineArrival(line);

    const gapDays = daysBetween(required, earliestCover);
    if (gapDays <= -10) continue;

    const engine = data.engines.find((e) => e.id === workOrder.engineId);
    const operator = data.operators.find((o) => o.id === workOrder.operatorId);
    const facility = data.facilities.find((f) => f.id === workOrder.facilityId);
    const projectedDelayDays = Math.max(0, gapDays);
    const costPerDay = DELAY_COST_PER_DAY[workOrder.type];
    const contract = data.contracts.find((c) => c.operatorId === workOrder.operatorId);
    const contractMultiplier = contract?.kind === "TotalCare" ? 1.25 : contract?.kind === "TotalCare Flex" ? 1.1 : 0.85;
    const delayCostUsd = Math.round(projectedDelayDays * costPerDay * contractMultiplier);
    const status: StatusLevel = gapDays > 0 ? "red" : gapDays > -5 ? "amber" : "green";
    const singleSource = isSingleSource(part);

    out.push({
      id: `SH-${workOrder.id}-${part.partNumber}`,
      partNumber: part.partNumber,
      description: part.description,
      moduleCode: part.moduleCode,
      supplier: part.supplier,
      singleSource,
      workOrderId: workOrder.id,
      workOrderReference: workOrder.reference,
      workOrderType: workOrder.type,
      engineId: workOrder.engineId,
      engineEsn: engine?.esn ?? workOrder.engineId,
      operatorId: workOrder.operatorId,
      operatorCode: operator?.code ?? "—",
      facilityId: workOrder.facilityId,
      facilityName: facility?.name ?? workOrder.facilityId,
      requiredOnDock: line.requiredOnDock,
      daysToRequired,
      qtyRequired: qty,
      qtyAvailable: available,
      qtyOnOrder: onOrder,
      leadTimeDays: part.leadTimeDays,
      earliestCoverAt: iso(earliestCover),
      gapDays,
      projectedDelayDays,
      delayCostUsd,
      status,
      coveringPoId: coveringPo?.id ?? null,
      recommendedAction:
        gapDays > 0
          ? singleSource
            ? `Escalate to ${part.supplier} for a pull-in; no alternate source approved`
            : coveringPo
              ? `Expedite ${coveringPo.reference} or release to an alternate source`
              : "Raise an expedited purchase order today"
          : gapDays > -5
            ? "Hold — confirm supplier commitment weekly"
            : "No action; cover is ahead of need",
    });
  }

  return out.sort((a, b) => b.gapDays - a.gapDays || b.delayCostUsd - a.delayCostUsd);
}

export function criticalShortages(horizonDays = SUPPLY_CHAIN_HORIZON_DAYS): ShortageRisk[] {
  return shortageRisks(horizonDays).filter((s) => s.status === "red");
}

/* ------------------------------------------------------------------ */
/* Expedite economics                                                  */
/* ------------------------------------------------------------------ */

function methodFor(shortage: ShortageRisk, hasOpenPo: boolean, poolStock: boolean): ExpediteMethod {
  if (hasOpenPo) return "air-freight";
  // Nothing on order: a pool loan is the only recovery fast enough close to the
  // need date; further out there is time to place the work elsewhere.
  if (poolStock && shortage.daysToRequired <= 21) return "loan-from-pool";
  return shortage.singleSource ? "supplier-overtime" : "alternate-source";
}

/** Free stock of the part held at any other facility in the network. */
function networkStock(shortage: ShortageRisk): number {
  return getDataset()
    .inventory.filter((i) => i.partNumber === shortage.partNumber && i.facilityId !== shortage.facilityId)
    .reduce((sum, i) => sum + Math.max(0, i.onHand - i.reserved), 0);
}

/**
 * For each red shortage, the cheapest credible recovery and whether it pays for
 * itself against the delay it avoids.
 */
export function expediteOptions(horizonDays = SUPPLY_CHAIN_HORIZON_DAYS): ExpediteOption[] {
  const data = getDataset();
  return criticalShortages(horizonDays)
    .map((shortage) => {
      const rng = createRng(`expedite:${shortage.id}`);
      const part = data.parts.find((p) => p.partNumber === shortage.partNumber);
      const unitCost = part?.unitCostUsd ?? 40_000;
      const method = methodFor(shortage, shortage.coveringPoId !== null, networkStock(shortage) >= shortage.qtyRequired);
      const recoverable =
        method === "air-freight"
          ? rand.int(rng, 6, 21)
          : method === "supplier-overtime"
            ? rand.int(rng, 4, 16)
            : method === "alternate-source"
              ? rand.int(rng, 10, 38)
              : rand.int(rng, 14, 45);
      const daysRecovered = Math.min(recoverable, shortage.gapDays + 3);
      const delayAvoidedDays = Math.min(daysRecovered, shortage.projectedDelayDays);
      const costPerDay = shortage.projectedDelayDays > 0 ? shortage.delayCostUsd / shortage.projectedDelayDays : 0;
      const expediteCostUsd = Math.round(
        (method === "air-freight" ? 38_000 : method === "supplier-overtime" ? 26_000 : method === "alternate-source" ? 64_000 : 88_000) +
          unitCost * (method === "alternate-source" ? 0.18 : 0.06) * shortage.qtyRequired +
          daysRecovered * rand.int(rng, 900, 3_400),
      );
      const netBenefitUsd = Math.round(delayAvoidedDays * costPerDay - expediteCostUsd);
      const confidence = round(
        clamp(
          (method === "air-freight" ? 0.86 : method === "supplier-overtime" ? 0.72 : method === "alternate-source" ? 0.6 : 0.68) +
            rand.gaussian(rng, 0, 0.05),
          0.4,
          0.97,
        ),
        2,
      );
      const recommendation: ExpediteOption["recommendation"] =
        netBenefitUsd > 0 && confidence >= 0.6 ? "expedite" : shortage.projectedDelayDays > 14 ? "replan" : "monitor";

      return {
        id: `EX-${shortage.id}`,
        shortageId: shortage.id,
        partNumber: shortage.partNumber,
        description: shortage.description,
        supplier: shortage.supplier,
        workOrderReference: shortage.workOrderReference,
        engineEsn: shortage.engineEsn,
        method,
        daysRecovered,
        delayAvoidedDays,
        expediteCostUsd,
        delayCostUsd: shortage.delayCostUsd,
        netBenefitUsd,
        confidence,
        decideBy: iso(addDays(new Date(shortage.requiredOnDock), -(shortage.leadTimeDays > 60 ? 21 : 7))),
        status: recommendation === "expedite" ? "red" : recommendation === "replan" ? "amber" : "grey",
        recommendation,
      } satisfies ExpediteOption;
    })
    .sort((a, b) => b.netBenefitUsd - a.netBenefitUsd);
}

/* ------------------------------------------------------------------ */
/* Supplier performance                                                */
/* ------------------------------------------------------------------ */

export function supplierPerformance(): SupplierPerformance[] {
  const data = getDataset();
  const orders = purchaseOrders();
  const shortages = criticalShortages();
  const suppliers = [...new Set(data.parts.map((p) => p.supplier))];

  return suppliers
    .map((supplier) => {
      const parts = data.parts.filter((p) => p.supplier === supplier);
      const supplierOrders = orders.filter((po) => po.supplier === supplier);
      const open = supplierOrders.filter((po) => po.state !== "received");
      const onTime = supplierOrders.filter((po) => po.slipDays <= 0).length;
      // Blend the observed book with the supplier's long-run reliability so a
      // handful of orders cannot swing the score to an implausible extreme.
      const prior = supplierReliability(supplier);
      const priorWeight = 10;
      const onTimeDeliveryPct = round(
        ((onTime + prior * priorWeight) / (supplierOrders.length + priorWeight)) * 100,
        1,
      );
      const slips = supplierOrders.map((po) => po.slipDays);
      const mean = slips.length ? slips.reduce((s, v) => s + v, 0) / slips.length : 0;
      const leadTimeVarianceDays = round(
        slips.length > 1 ? Math.sqrt(slips.reduce((s, v) => s + (v - mean) ** 2, 0) / (slips.length - 1)) : 0,
        1,
      );
      const rng = createRng(`quality:${supplier}`);
      const qualityEscapesPer1000 = round(rand.float(rng, 0.4, 9.5), 1);
      const averageLeadTimeDays = Math.round(parts.reduce((s, p) => s + p.leadTimeDays, 0) / Math.max(1, parts.length));
      const latePoCount = open.filter((po) => po.status === "red").length;
      const criticalShortageCount = shortages.filter((s) => s.supplier === supplier).length;
      const status: StatusLevel =
        onTimeDeliveryPct < 85 || qualityEscapesPer1000 > 7.5
          ? "red"
          : onTimeDeliveryPct < 94 || leadTimeVarianceDays > 12 || qualityEscapesPer1000 > 4.5
            ? "amber"
            : "green";

      const historyRng = createRng(`otd-history:${supplier}`);
      const history = Array.from({ length: 12 }, (_, i) => ({
        t: iso(addDays(NOW, -(11 - i) * 30)),
        v: round(clamp(onTimeDeliveryPct + rand.gaussian(historyRng, (11 - i) * 0.4, 3.2), 55, 100), 1),
      }));

      return {
        supplier,
        onTimeDeliveryPct,
        qualityEscapesPer1000,
        leadTimeVarianceDays,
        averageLeadTimeDays,
        openPoCount: open.length,
        openPoValueUsd: Math.round(open.reduce((s, po) => s + po.valueUsd, 0)),
        latePoCount,
        singleSourcePartCount: parts.filter(isSingleSource).length,
        criticalShortageCount,
        status,
        history,
      } satisfies SupplierPerformance;
    })
    .sort((a, b) => b.criticalShortageCount - a.criticalShortageCount || a.onTimeDeliveryPct - b.onTimeDeliveryPct);
}

/* ------------------------------------------------------------------ */
/* Critical part register                                              */
/* ------------------------------------------------------------------ */

export function criticalPartRegister(): CriticalPartRegisterEntry[] {
  const data = getDataset();
  const demand = materialDemand();

  return data.parts
    .map((part) => {
      const singleSource = isSingleSource(part);
      const longLead = isLongLead(part);
      const stock = data.inventory.filter((i) => i.partNumber === part.partNumber);
      const onHand = stock.reduce((s, i) => s + i.onHand, 0);
      const onOrder = stock.reduce((s, i) => s + i.onOrder, 0);
      const demand90d = demand
        .filter((d) => {
          if (d.part.partNumber !== part.partNumber) return false;
          const days = daysBetween(NOW, new Date(d.requiredOnDock));
          return days >= 0 && days <= SUPPLY_CHAIN_HORIZON_DAYS;
        })
        .reduce((s, d) => s + d.qty, 0);
      const dailyDemand = demand90d / SUPPLY_CHAIN_HORIZON_DAYS;
      const coverDays = dailyDemand > 0 ? Math.round(onHand / dailyDemand) : null;
      const status: StatusLevel =
        demand90d === 0
          ? "grey"
          : coverDays !== null && coverDays < part.leadTimeDays && onOrder === 0
            ? "red"
            : coverDays !== null && coverDays < part.leadTimeDays
              ? "amber"
              : "green";
      return {
        partNumber: part.partNumber,
        description: part.description,
        moduleCode: part.moduleCode,
        supplier: part.supplier,
        leadTimeDays: part.leadTimeDays,
        singleSource,
        longLead,
        unitCostUsd: part.unitCostUsd,
        onHand,
        onOrder,
        demand90d,
        coverDays,
        status,
      } satisfies CriticalPartRegisterEntry;
    })
    .filter((entry) => entry.singleSource || entry.longLead || entry.demand90d > 0)
    .sort((a, b) => b.leadTimeDays - a.leadTimeDays);
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export function supplyChainSummary(horizonDays = SUPPLY_CHAIN_HORIZON_DAYS): SupplyChainSummary {
  const shortages = shortageRisks(horizonDays);
  const critical = shortages.filter((s) => s.status === "red");
  const expedites = expediteOptions(horizonDays).filter((e) => e.recommendation === "expedite");
  const open = openPurchaseOrders();
  const suppliers = supplierPerformance();
  const register = criticalPartRegister();

  return {
    horizonDays,
    shortages: shortages.length,
    criticalShortages: critical.length,
    shopVisitsAtRisk: new Set(critical.map((s) => s.workOrderId)).size,
    delayDaysExposed: critical.reduce((s, x) => s + x.projectedDelayDays, 0),
    delayCostExposureUsd: critical.reduce((s, x) => s + x.delayCostUsd, 0),
    expediteCostUsd: expedites.reduce((s, x) => s + x.expediteCostUsd, 0),
    netBenefitUsd: expedites.reduce((s, x) => s + x.netBenefitUsd, 0),
    openPoCount: open.length,
    openPoValueUsd: Math.round(open.reduce((s, po) => s + po.valueUsd, 0)),
    latePoCount: open.filter((po) => po.status === "red").length,
    // Weighted by open order count so a supplier with a single order cannot move
    // the fleet figure as much as one carrying the book.
    fleetOnTimeDeliveryPct: round(
      suppliers.reduce((s, x) => s + x.onTimeDeliveryPct * (x.openPoCount + 1), 0) /
        Math.max(1, suppliers.reduce((s, x) => s + x.openPoCount + 1, 0)),
      1,
    ),
    singleSourceParts: register.filter((r) => r.singleSource).length,
    longLeadParts: register.filter((r) => r.longLead).length,
  };
}
