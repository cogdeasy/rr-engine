/**
 * Parts & inventory selectors.
 *
 * The base dataset carries stock positions, parts and work orders but no link
 * between them: task cards are generated with an empty `partsRequired` list.
 * These selectors derive that link deterministically (seeded per task card), so
 * planned demand, shortages, rotable pool state and inventory value are stable
 * across the web app, the API and tests.
 */

import type {
  FacilityStockSummary,
  InventorySummary,
  ModuleCode,
  ModuleStockValue,
  Part,
  PartDemandLine,
  Point,
  RotableCondition,
  RotablePoolEntry,
  RotablePoolSummary,
  Series,
  ShortageLine,
  SlowMoverLine,
  StatusLevel,
  StockPosition,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, daysAgo, iso, NOW, rand, round } from "../rng";

/** Planning horizon for demand, shortage and cover calculations. */
export const INVENTORY_HORIZON_DAYS = 90;

const OPEN_WORK_ORDER_STATES = new Set(["draft", "planned", "released", "in-progress", "awaiting-parts"]);

function daysBetween(from: Date, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - from.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Planned demand                                                      */
/* ------------------------------------------------------------------ */

let demandCache: PartDemandLine[] | null = null;

/**
 * Planned part consumption over the next 90 days, derived from open work orders
 * and their task cards. Each task card consumes one or two parts drawn from the
 * module it touches, seeded on the task card id so the result never moves.
 */
export function partDemandLines(): PartDemandLine[] {
  if (demandCache) return demandCache;
  const data = getDataset();
  const partsByModule = new Map<ModuleCode, Part[]>();
  for (const part of data.parts) {
    const bucket = partsByModule.get(part.moduleCode);
    if (bucket) bucket.push(part);
    else partsByModule.set(part.moduleCode, [part]);
  }

  /** Only parts stocked at the executing facility can be consumed there. */
  const stockedByFacility = new Map<string, Set<string>>();
  for (const item of data.inventory) {
    const bucket = stockedByFacility.get(item.facilityId);
    if (bucket) bucket.add(item.partNumber);
    else stockedByFacility.set(item.facilityId, new Set([item.partNumber]));
  }

  const lines: PartDemandLine[] = [];
  for (const workOrder of data.workOrders) {
    if (!OPEN_WORK_ORDER_STATES.has(workOrder.state)) continue;
    const daysToNeed = daysBetween(NOW, workOrder.scheduledStart);
    if (daysToNeed > INVENTORY_HORIZON_DAYS) continue;
    const stocked = stockedByFacility.get(workOrder.facilityId) ?? new Set<string>();
    const stockedHere = data.parts.filter((part) => stocked.has(part.partNumber));
    if (stockedHere.length === 0) continue;
    for (const cardId of workOrder.taskCardIds) {
      const card = data.taskCards.find((c) => c.id === cardId);
      if (!card) continue;
      const rng = createRng(`inventory:${card.id}`);
      const inModule = (card.moduleCode ? partsByModule.get(card.moduleCode) : undefined)?.filter((part) =>
        stocked.has(part.partNumber),
      );
      const candidates = inModule && inModule.length > 0 ? inModule : stockedHere;
      const picks = rand.sample(rng, candidates, rand.int(rng, 1, 2));
      for (const part of picks) {
        lines.push({
          id: `DM-${card.id}-${part.partNumber}`,
          partNumber: part.partNumber,
          facilityId: workOrder.facilityId,
          workOrderId: workOrder.id,
          workOrderRef: workOrder.reference,
          taskCardId: card.id,
          engineId: workOrder.engineId,
          qty: part.lifeLimited ? rand.int(rng, 1, 2) : rand.int(rng, 1, 4),
          neededBy: workOrder.scheduledStart,
          daysToNeed,
          priority: workOrder.priority,
          blocking: card.state === "blocked" || workOrder.state === "awaiting-parts",
        });
      }
    }
  }
  demandCache = lines.sort((a, b) => a.daysToNeed - b.daysToNeed);
  return demandCache;
}

export function demandForPart(partNumber: string, facilityId?: string): PartDemandLine[] {
  return partDemandLines().filter(
    (line) => line.partNumber === partNumber && (facilityId === undefined || line.facilityId === facilityId),
  );
}

/* ------------------------------------------------------------------ */
/* Stock positions                                                     */
/* ------------------------------------------------------------------ */

let positionCache: StockPosition[] | null = null;

/** Every stocked part/facility pair with its 90-day exposure resolved. */
export function stockPositions(): StockPosition[] {
  if (positionCache) return positionCache;
  const data = getDataset();
  const demand = partDemandLines();

  positionCache = data.inventory.map((item) => {
    const part = data.parts.find((p) => p.partNumber === item.partNumber);
    const facility = data.facilities.find((f) => f.id === item.facilityId);
    const lines = demand.filter((d) => d.partNumber === item.partNumber && d.facilityId === item.facilityId);
    const demand90 = lines.reduce((sum, line) => sum + line.qty, 0);
    const blockingDemand = lines.filter((line) => line.blocking).reduce((sum, line) => sum + line.qty, 0);
    const available = Math.max(0, item.onHand - item.reserved);
    const daysToFirstNeed = lines.length > 0 ? Math.max(0, Math.min(...lines.map((l) => l.daysToNeed))) : null;
    const inboundDays = item.nextDeliveryAt ? daysBetween(NOW, item.nextDeliveryAt) : null;
    const inboundInHorizon = inboundDays !== null && inboundDays <= INVENTORY_HORIZON_DAYS ? item.onOrder : 0;
    const inboundLate =
      inboundDays !== null && daysToFirstNeed !== null && item.onOrder > 0 && inboundDays > daysToFirstNeed;
    const projectedBalance = available + inboundInHorizon - demand90;
    const shortfall = Math.max(0, demand90 - available);
    const unitCostUsd = part?.unitCostUsd ?? 0;
    const coverDays = demand90 > 0 ? round((available / demand90) * INVENTORY_HORIZON_DAYS, 0) : null;

    let status: StatusLevel;
    let reason: string;
    if (shortfall > 0 && blockingDemand > 0) {
      status = "red";
      reason = `${blockingDemand} unit${blockingDemand === 1 ? "" : "s"} already holding work — ${shortfall} short on the shelf`;
    } else if (shortfall > 0 && (daysToFirstNeed ?? Infinity) < (part?.leadTimeDays ?? 0)) {
      status = "red";
      reason = `Short ${shortfall} with ${daysToFirstNeed}d to first need against a ${part?.leadTimeDays}d lead time`;
    } else if (shortfall > 0) {
      status = "amber";
      reason = inboundLate
        ? `Short ${shortfall}; the ${item.onOrder}-unit inbound lands ${inboundDays}d out, after the day ${daysToFirstNeed} need`
        : `Short ${shortfall} against 90-day demand, recoverable inside the ${part?.leadTimeDays}d lead time`;
    } else if (item.onHand <= item.reorderPoint) {
      status = "amber";
      reason = `On-hand ${item.onHand} at or below the reorder point of ${item.reorderPoint}`;
    } else if (demand90 === 0) {
      status = "grey";
      reason = "No planned consumption inside the 90-day horizon";
    } else {
      status = "green";
      reason = `${available} available covers ${demand90} unit${demand90 === 1 ? "" : "s"} of planned demand`;
    }

    return {
      id: item.id,
      partNumber: item.partNumber,
      description: part?.description ?? item.partNumber,
      moduleCode: part?.moduleCode ?? "EXTERNALS",
      facilityId: item.facilityId,
      facilityIcao: facility?.icao ?? "—",
      facilityName: facility?.name ?? "Unknown facility",
      supplier: part?.supplier ?? "—",
      lifeLimited: part?.lifeLimited ?? false,
      onHand: item.onHand,
      reserved: item.reserved,
      available,
      onOrder: item.onOrder,
      reorderPoint: item.reorderPoint,
      unitCostUsd,
      leadTimeDays: part?.leadTimeDays ?? 0,
      nextDeliveryAt: item.nextDeliveryAt,
      demand90,
      blockingDemand,
      projectedBalance,
      shortfall,
      coverDays,
      daysToFirstNeed,
      inboundLate,
      valueUsd: item.onHand * unitCostUsd,
      status,
      reason,
    } satisfies StockPosition;
  });

  return positionCache;
}

/* ------------------------------------------------------------------ */
/* Shortage board                                                      */
/* ------------------------------------------------------------------ */

/** Parts short against planned demand, ordered by how much they hurt. */
export function shortageLines(): ShortageLine[] {
  const positions = stockPositions();
  const surplusByPart = new Map<string, StockPosition[]>();
  /** Surplus is consumed as it is promised, so one donor is never offered twice. */
  const remainingSurplus = new Map<string, number>();
  for (const position of positions) {
    if (position.projectedBalance <= 1) continue;
    const bucket = surplusByPart.get(position.partNumber);
    if (bucket) bucket.push(position);
    else surplusByPart.set(position.partNumber, [position]);
    remainingSurplus.set(position.id, position.projectedBalance);
  }

  return positions
    .filter((position) => position.shortfall > 0)
    .sort(
      (a, b) =>
        Number(b.blockingDemand > 0) - Number(a.blockingDemand > 0) ||
        (a.daysToFirstNeed ?? 999) - (b.daysToFirstNeed ?? 999),
    )
    .map((position) => {
      const lines = demandForPart(position.partNumber, position.facilityId);
      const donor = (surplusByPart.get(position.partNumber) ?? [])
        .filter(
          (candidate) =>
            candidate.facilityId !== position.facilityId && (remainingSurplus.get(candidate.id) ?? 0) > 0,
        )
        .sort((a, b) => (remainingSurplus.get(b.id) ?? 0) - (remainingSurplus.get(a.id) ?? 0))[0];
      const transferQty = donor ? Math.min(position.shortfall, remainingSurplus.get(donor.id) ?? 0) : 0;
      if (donor && transferQty >= position.shortfall) {
        remainingSurplus.set(donor.id, (remainingSurplus.get(donor.id) ?? 0) - transferQty);
      }

      let action: ShortageLine["action"];
      let actionLabel: string;
      if (donor && transferQty >= position.shortfall) {
        action = "transfer";
        actionLabel = `Transfer ${transferQty} from ${donor.facilityIcao}`;
      } else if (position.blockingDemand > 0 || (position.daysToFirstNeed ?? Infinity) < position.leadTimeDays) {
        action = "expedite";
        actionLabel = `Expedite ${position.shortfall} with ${position.supplier}`;
      } else if (position.onOrder > 0) {
        action = "monitor";
        actionLabel = `Confirm inbound ${position.onOrder} lands before day ${position.daysToFirstNeed ?? INVENTORY_HORIZON_DAYS}`;
      } else {
        action = "raise-po";
        actionLabel = `Raise PO for ${position.shortfall} (${position.leadTimeDays}d lead time)`;
      }

      return {
        position,
        action,
        actionLabel,
        transferFromIcao: donor?.facilityIcao ?? null,
        transferQty,
        workOrderRefs: [...new Set(lines.map((line) => line.workOrderRef))],
        engineIds: [...new Set(lines.map((line) => line.engineId))],
        exposureUsd: position.shortfall * position.unitCostUsd,
      } satisfies ShortageLine;
    })
    .sort(
      (a, b) =>
        Number(b.position.blockingDemand > 0) - Number(a.position.blockingDemand > 0) ||
        (a.position.daysToFirstNeed ?? 999) - (b.position.daysToFirstNeed ?? 999) ||
        b.exposureUsd - a.exposureUsd,
    );
}

/* ------------------------------------------------------------------ */
/* Rotable pool                                                        */
/* ------------------------------------------------------------------ */

/** Rotables are the repairable, high-value non-lifed assets that cycle through the shop. */
function isRotable(part: Part): boolean {
  return !part.lifeLimited && part.unitCostUsd >= 25_000;
}

let rotableCache: RotablePoolEntry[] | null = null;

export function rotablePool(): RotablePoolEntry[] {
  if (rotableCache) return rotableCache;
  const data = getDataset();
  const positions = stockPositions();
  const entries: RotablePoolEntry[] = [];

  for (const position of positions) {
    const part = data.parts.find((p) => p.partNumber === position.partNumber);
    if (!part || !isRotable(part)) continue;
    const rng = createRng(`rotable:${position.id}`);
    const serviceable = position.available;
    const unserviceable = rand.int(rng, 0, 4);
    const inRepair = rand.int(rng, 0, 5);
    const inTransit = rand.int(rng, 0, 2);
    const poolSize = serviceable + unserviceable + inRepair + inTransit + position.reserved;
    const targetTurnDays = Math.max(12, Math.round(part.leadTimeDays * 0.35));
    const turnTimeDays = Math.round(targetTurnDays * rand.float(rng, 0.7, 1.9));
    const requiredServiceable = Math.max(1, position.demand90);

    let status: StatusLevel;
    let reason: string;
    if (serviceable === 0 && requiredServiceable > 0) {
      status = "red";
      reason = `No serviceable units against ${requiredServiceable} planned — ${inRepair} in repair`;
    } else if (serviceable < requiredServiceable) {
      status = "red";
      reason = `${serviceable} serviceable against ${requiredServiceable} planned removals`;
    } else if (turnTimeDays > targetTurnDays * 1.25 || unserviceable > serviceable) {
      status = "amber";
      reason = `Turn time ${turnTimeDays}d against a ${targetTurnDays}d target with ${unserviceable} awaiting induction`;
    } else {
      status = "green";
      reason = `${serviceable} serviceable, turn time inside the ${targetTurnDays}d target`;
    }

    entries.push({
      partNumber: position.partNumber,
      description: position.description,
      moduleCode: position.moduleCode,
      facilityId: position.facilityId,
      facilityIcao: position.facilityIcao,
      poolSize,
      serviceable,
      unserviceable,
      inRepair,
      inTransit,
      turnTimeDays,
      targetTurnDays,
      requiredServiceable,
      status,
      reason,
    });
  }

  rotableCache = entries.sort(
    (a, b) => statusWeight(b.status) - statusWeight(a.status) || b.turnTimeDays - a.turnTimeDays,
  );
  return rotableCache;
}

function statusWeight(status: StatusLevel): number {
  return { red: 3, amber: 2, green: 1, grey: 0 }[status];
}

export function rotablePoolSummary(): RotablePoolSummary {
  const entries = rotablePool();
  const sum = (pick: (entry: RotablePoolEntry) => number) => entries.reduce((total, entry) => total + pick(entry), 0);
  const count = Math.max(1, entries.length);
  return {
    poolUnits: sum((e) => e.poolSize),
    serviceable: sum((e) => e.serviceable),
    unserviceable: sum((e) => e.unserviceable),
    inRepair: sum((e) => e.inRepair),
    inTransit: sum((e) => e.inTransit),
    averageTurnDays: round(sum((e) => e.turnTimeDays) / count, 0),
    targetTurnDays: round(sum((e) => e.targetTurnDays) / count, 0),
    entriesBelowCover: entries.filter((e) => e.serviceable < e.requiredServiceable).length,
  };
}

export function rotableConditionMix(): { condition: RotableCondition; units: number }[] {
  const summary = rotablePoolSummary();
  return [
    { condition: "serviceable", units: summary.serviceable },
    { condition: "unserviceable", units: summary.unserviceable },
    { condition: "in-repair", units: summary.inRepair },
    { condition: "in-transit", units: summary.inTransit },
  ];
}

/* ------------------------------------------------------------------ */
/* Value roll-up and slow movers                                       */
/* ------------------------------------------------------------------ */

export function facilityStockSummaries(): FacilityStockSummary[] {
  const data = getDataset();
  const positions = stockPositions();
  return data.facilities
    .map((facility) => {
      const rows = positions.filter((p) => p.facilityId === facility.id);
      const shortLines = rows.filter((p) => p.shortfall > 0).length;
      const blockingLines = rows.filter((p) => p.blockingDemand > 0).length;
      const demandUnits = rows.reduce((sum, p) => sum + p.demand90, 0);
      const coveredUnits = rows.reduce((sum, p) => sum + Math.min(p.demand90, p.available), 0);
      const fillRatePct = demandUnits === 0 ? 100 : round((coveredUnits / demandUnits) * 100, 0);
      return {
        facilityId: facility.id,
        icao: facility.icao,
        name: facility.name,
        lines: rows.length,
        valueUsd: rows.reduce((sum, p) => sum + p.valueUsd, 0),
        shortLines,
        blockingLines,
        fillRatePct,
        status: fillRatePct < 80 ? "red" : fillRatePct < 95 ? "amber" : "green",
      } satisfies FacilityStockSummary;
    })
    .sort((a, b) => b.blockingLines - a.blockingLines || b.shortLines - a.shortLines || b.valueUsd - a.valueUsd);
}

export function moduleStockValues(): ModuleStockValue[] {
  const byModule = new Map<ModuleCode, ModuleStockValue>();
  for (const position of stockPositions()) {
    const entry = byModule.get(position.moduleCode) ?? { moduleCode: position.moduleCode, valueUsd: 0, lines: 0 };
    entry.valueUsd += position.valueUsd;
    entry.lines += 1;
    byModule.set(position.moduleCode, entry);
  }
  return [...byModule.values()].sort((a, b) => b.valueUsd - a.valueUsd);
}

/** Stock with no planned consumption in the horizon — capital sitting still. */
export function slowMovers(): SlowMoverLine[] {
  return stockPositions()
    .filter((position) => position.demand90 === 0 && position.onHand > position.reorderPoint)
    .map((position) => {
      const rng = createRng(`slow:${position.id}`);
      const daysSinceMovement = rand.int(rng, 120, 900);
      const excessUnits = Math.max(0, position.onHand - position.reorderPoint);
      return {
        partNumber: position.partNumber,
        description: position.description,
        facilityIcao: position.facilityIcao,
        onHand: position.onHand,
        excessUnits,
        valueUsd: position.valueUsd,
        excessValueUsd: excessUnits * position.unitCostUsd,
        daysSinceMovement,
        status: daysSinceMovement > 540 ? "amber" : "grey",
      } satisfies SlowMoverLine;
    })
    .sort((a, b) => b.excessValueUsd - a.excessValueUsd);
}

/* ------------------------------------------------------------------ */
/* Headline summary and trend                                          */
/* ------------------------------------------------------------------ */

export function inventorySummary(): InventorySummary {
  const positions = stockPositions();
  const shortages = shortageLines();
  const demandUnits = positions.reduce((sum, p) => sum + p.demand90, 0);
  const coveredUnits = positions.reduce((sum, p) => sum + Math.min(p.demand90, p.available), 0);

  return {
    totalValueUsd: positions.reduce((sum, p) => sum + p.valueUsd, 0),
    linesTracked: positions.length,
    shortLines: shortages.length,
    blockingLines: positions.filter((p) => p.blockingDemand > 0 && p.shortfall > 0).length,
    blockedWorkOrders: new Set(
      shortages
        .filter((s) => s.position.blockingDemand > 0)
        .flatMap((s) =>
          demandForPart(s.position.partNumber, s.position.facilityId)
            .filter((line) => line.blocking)
            .map((line) => line.workOrderRef),
        ),
    ).size,
    stockoutLines: positions.filter((p) => p.onHand === 0).length,
    fillRatePct: demandUnits === 0 ? 100 : round((coveredUnits / demandUnits) * 100, 0),
    exposureUsd: shortages.reduce((sum, s) => sum + s.exposureUsd, 0),
    slowMoverValueUsd: slowMovers().reduce((sum, s) => sum + s.excessValueUsd, 0),
    facilitiesAtRisk: facilityStockSummaries().filter((f) => f.status !== "green").length,
    horizonDays: INVENTORY_HORIZON_DAYS,
  };
}

/** Twelve-month inventory value history, anchored on today's roll-up. */
export function inventoryValueSeries(): Series {
  const total = inventorySummary().totalValueUsd;
  const rng = createRng("inventory:value-history");
  const points: Point[] = [];
  let value = total * 0.86;
  for (let i = 11; i >= 0; i -= 1) {
    value = i === 0 ? total : value * rand.float(rng, 0.985, 1.035);
    points.push({ t: iso(daysAgo(i * 30)), v: round(value / 1_000_000, 1) });
  }
  return { id: "inventory-value", label: "Inventory value", unit: "$m", points };
}
