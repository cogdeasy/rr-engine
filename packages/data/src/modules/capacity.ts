/**
 * Shop capacity selectors.
 *
 * Everything here is derived from the deterministic dataset: engines give the
 * induction demand (via RUL, LLP expiry, EGT margin and prognostics), the
 * facility catalogue gives the bays that can absorb it, and a day-resolution
 * bay scheduler turns the two into a plan, a heat grid and a set of
 * load-levelling moves.
 *
 * Bays are modelled as the share of each shop physically allocated to the
 * managed portfolio (`PORTFOLIO_BAY_SHARE`) — the rest of each shop serves
 * engines outside these contracts and is not sellable to this planner.
 */

import type {
  CapacityCell,
  CapacityMonth,
  CapacityOverview,
  Engine,
  EngineFamily,
  Facility,
  FacilityCapability,
  FacilityCapacityProfile,
  InductionDemand,
  InductionDriver,
  LoadLevellingMove,
  NetworkMonth,
  ShopFacilityKind,
  StatusLevel,
  Workscope,
} from "@rr/types";
import { AIRPORTS, ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { clamp, createRng, iso, NOW, rand, round } from "../rng";

const MS_DAY = 86_400_000;
const HORIZON_MONTHS = 12;
/** Days of look-ahead used by the scheduler; wider than the reported horizon. */
const SCHEDULE_WINDOW_DAYS = 600;
/** A slot long enough to be worth advertising as "next free". */
const NOMINAL_SLOT_DAYS = 60;
/** Share of each shop's bays contracted to the managed portfolio. */
const PORTFOLIO_BAY_SHARE = 0.6;

const SHOP_KINDS: ShopFacilityKind[] = ["overhaul-base", "partner-shop"];

const WORKSCOPE_TAT: Record<Workscope, number> = {
  "full-overhaul": 86,
  "performance-restoration": 64,
  "module-swap": 28,
  "quick-turn": 14,
};

/* ------------------------------------------------------------------ */
/* Calendar helpers                                                    */
/* ------------------------------------------------------------------ */

const HORIZON_START = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function dayIndex(date: Date): number {
  return Math.floor((date.getTime() - HORIZON_START.getTime()) / MS_DAY);
}

function dateOfIndex(index: number): Date {
  return new Date(HORIZON_START.getTime() + index * MS_DAY);
}

/** The 12 reported months, starting with the current one. */
export function capacityMonths(): CapacityMonth[] {
  return Array.from({ length: HORIZON_MONTHS }, (_, i) => {
    const start = new Date(Date.UTC(HORIZON_START.getUTCFullYear(), HORIZON_START.getUTCMonth() + i, 1));
    const next = new Date(Date.UTC(HORIZON_START.getUTCFullYear(), HORIZON_START.getUTCMonth() + i + 1, 1));
    return {
      key: monthKeyOf(start),
      label: monthLabelOf(start),
      startsAt: iso(start),
      days: Math.round((next.getTime() - start.getTime()) / MS_DAY),
    };
  });
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/* ------------------------------------------------------------------ */
/* Facilities                                                          */
/* ------------------------------------------------------------------ */

/** Overhaul bases and partner shops — the only facilities that can induct engines. */
export function shopFacilities(): Facility[] {
  return getDataset().facilities.filter((f) => (SHOP_KINDS as string[]).includes(f.kind));
}

function allocatedBays(facility: Facility): number {
  return Math.max(1, Math.round(facility.capacity * PORTFOLIO_BAY_SHARE));
}

/** Which families a shop is certified for, and what it historically turns them in. */
export function facilityCapabilities(facilityId: string): FacilityCapability[] {
  const facility = getDataset().facilities.find((f) => f.id === facilityId);
  if (!facility) return [];
  const dataset = getDataset();
  return ENGINE_FAMILIES.map((spec) => {
    const rng = createRng(`capacity:cap:${facilityId}:${spec.family}`);
    const certified = facility.icao === "EGNX" ? true : facility.kind === "overhaul-base" ? rand.bool(rng, 0.78) : rand.bool(rng, 0.55);
    const penalty = facility.kind === "partner-shop" ? 7 : 0;
    return {
      family: spec.family,
      certified,
      averageTatDays: Math.round(clamp(spec.overhaulIntervalCycles / 90 + rand.int(rng, -6, 12) + penalty, 34, 104)),
      inductions: dataset.engines.filter((e) => e.family === spec.family && e.location === facility.icao).length,
    };
  });
}

function capabilityIndex(): Map<string, FacilityCapability[]> {
  const index = new Map<string, FacilityCapability[]>();
  const shops = shopFacilities();
  for (const facility of shops) index.set(facility.id, facilityCapabilities(facility.id));
  // Every family must be servable somewhere sensible: guarantee at least two shops.
  for (const spec of ENGINE_FAMILIES) {
    const certifiedCount = shops.filter((f) => index.get(f.id)?.find((c) => c.family === spec.family)?.certified).length;
    if (certifiedCount >= 2) continue;
    for (const facility of shops.filter((f) => f.kind === "overhaul-base").slice(0, 2)) {
      const capability = index.get(facility.id)?.find((c) => c.family === spec.family);
      if (capability) capability.certified = true;
    }
  }
  return index;
}

/* ------------------------------------------------------------------ */
/* Induction demand                                                    */
/* ------------------------------------------------------------------ */

function cyclesPerDay(engine: Engine): number {
  const aircraft = getDataset().aircraft.find((a) => a.id === engine.aircraftId);
  if (!aircraft) return 1.1;
  const ageDays = Math.max(120, (NOW.getTime() - new Date(aircraft.deliveredAt).getTime()) / MS_DAY);
  return round(clamp(engine.totalFlightCycles / ageDays, 0.6, 3.5), 2);
}

interface DriverCandidate {
  driver: InductionDriver;
  days: number;
  detail: string;
}

function removalDrivers(engine: Engine, rate: number): DriverCandidate[] {
  const dataset = getDataset();
  const candidates: DriverCandidate[] = [
    {
      driver: "scheduled-interval",
      days: engine.rulCycles / rate,
      detail: `${engine.rulCycles.toLocaleString("en-GB")} cycles to interval at ${rate}/day`,
    },
  ];

  // Parts already at their cyclic limit were replaced at the last shop visit,
  // so only stack that still has life drives the next removal.
  const llp = dataset.llps
    .filter((l) => l.engineId === engine.id && l.cyclesRemaining > 0)
    .sort((a, b) => (a.projectedExpiryDate < b.projectedExpiryDate ? -1 : 1))[0];
  if (llp) {
    candidates.push({
      driver: "llp-expiry",
      days: (new Date(llp.projectedExpiryDate).getTime() - NOW.getTime()) / MS_DAY,
      detail: `${llp.partNumber} ${llp.cyclesRemaining.toLocaleString("en-GB")} cycles remaining`,
    });
  }

  const prognostic = dataset.prognostics
    .filter((p) => p.engineId === engine.id && p.probability >= 0.6)
    .sort((a, b) => a.rulCycles - b.rulCycles)[0];
  if (prognostic) {
    candidates.push({
      driver: "prognostic-risk",
      days: prognostic.rulCycles / rate,
      detail: `${prognostic.failureMode} p=${prognostic.probability.toFixed(2)} (${prognostic.moduleCode})`,
    });
  }

  if (engine.egtMargin < 14) {
    candidates.push({
      driver: "egt-margin",
      days: clamp(engine.egtMargin * 14, 4, 400),
      detail: `EGT margin ${engine.egtMargin}°C — restoration required`,
    });
  }

  return candidates;
}

function workscopeFor(driver: InductionDriver, engine: Engine): Workscope {
  if (driver === "llp-expiry") return "full-overhaul";
  if (driver === "prognostic-risk") return engine.healthScore > 68 ? "quick-turn" : "module-swap";
  if (driver === "egt-margin") return "performance-restoration";
  return engine.cyclesSinceOverhaul > 3200 ? "full-overhaul" : "performance-restoration";
}

/** Every engine that has to be inducted inside the planning horizon. */
export function inductionDemand(): Omit<InductionDemand, "plannedFacilityId" | "plannedStart" | "plannedEnd" | "delayDays" | "ferryKm" | "status">[] {
  const dataset = getDataset();
  const capabilities = capabilityIndex();
  const shops = shopFacilities();
  const horizonEndIndex = HORIZON_MONTHS * 31;

  const demand = [];
  for (const engine of dataset.engines) {
    const rate = cyclesPerDay(engine);
    const soonest = removalDrivers(engine, rate).sort((a, b) => a.days - b.days)[0];
    if (!soonest) continue;
    const days = Math.round(clamp(soonest.days, 0, 4000));
    if (days > horizonEndIndex) continue;

    const operator = dataset.operators.find((o) => o.id === engine.operatorId);
    if (!operator) continue;
    const rng = createRng(`capacity:demand:${engine.id}`);
    const workscope = workscopeFor(soonest.driver, engine);
    const tatDays = Math.round(clamp(WORKSCOPE_TAT[workscope] + rand.int(rng, -7, 11), 10, 110));

    const capable = shops.filter((f) => capabilities.get(f.id)?.find((c) => c.family === engine.family)?.certified);
    const home = AIRPORTS.find((a) => a.icao === operator.homeBase) ?? AIRPORTS[0]!;
    const preferred = [...(capable.length > 0 ? capable : shops)].sort(
      (a, b) => haversineKm(home, a) - haversineKm(home, b),
    )[0]!;

    demand.push({
      engineId: engine.id,
      esn: engine.esn,
      family: engine.family,
      operatorId: operator.id,
      operatorCode: operator.code,
      operatorName: operator.name,
      region: operator.region,
      driver: soonest.driver,
      driverDetail: soonest.detail,
      workscope,
      removalDue: iso(new Date(NOW.getTime() + days * MS_DAY)),
      rulCycles: engine.rulCycles,
      cyclesPerDay: rate,
      tatDays,
      preferredFacilityId: preferred.id,
    });
  }

  return demand.sort((a, b) => (a.removalDue < b.removalDue ? -1 : a.removalDue > b.removalDue ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* Bay scheduler                                                       */
/* ------------------------------------------------------------------ */

type Occupancy = Map<string, Int16Array>;

function seedOccupancy(): Occupancy {
  const dataset = getDataset();
  const occupancy: Occupancy = new Map();
  for (const facility of shopFacilities()) occupancy.set(facility.id, new Int16Array(SCHEDULE_WINDOW_DAYS));

  // Work already in the shops holds bays before any new induction can be planned.
  const live = dataset.workOrders.filter(
    (w) =>
      (w.type === "shop-visit" || w.type === "module-swap") &&
      (w.state === "in-progress" || w.state === "awaiting-parts" || w.state === "released"),
  );
  for (const workOrder of live) {
    const lane = occupancy.get(workOrder.facilityId);
    if (!lane) continue;
    const from = Math.max(0, dayIndex(new Date(workOrder.scheduledStart)));
    const to = Math.min(SCHEDULE_WINDOW_DAYS - 1, dayIndex(new Date(workOrder.scheduledEnd)));
    for (let d = from; d <= to; d += 1) lane[d] += 1;
  }
  return occupancy;
}

function earliestStart(lane: Int16Array, bays: number, from: number, tatDays: number): number {
  let run = 0;
  for (let d = Math.max(0, from); d < SCHEDULE_WINDOW_DAYS; d += 1) {
    run = (lane[d] ?? 0) < bays ? run + 1 : 0;
    if (run >= tatDays) return d - tatDays + 1;
  }
  return -1;
}

function occupy(lane: Int16Array, start: number, tatDays: number): void {
  for (let d = start; d < Math.min(SCHEDULE_WINDOW_DAYS, start + tatDays); d += 1) lane[d] += 1;
}

function release(lane: Int16Array, start: number, tatDays: number): void {
  for (let d = start; d < Math.min(SCHEDULE_WINDOW_DAYS, start + tatDays); d += 1) lane[d] -= 1;
}

function delayStatus(delayDays: number): StatusLevel {
  if (delayDays > 14) return "red";
  if (delayDays > 0) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

let cachedOverview: CapacityOverview | null = null;

/** The whole module in one deterministic object; memoised per process. */
export function capacityOverview(): CapacityOverview {
  if (cachedOverview) return cachedOverview;

  const dataset = getDataset();
  const months = capacityMonths();
  const shops = shopFacilities();
  const capabilities = capabilityIndex();
  const bays = new Map(shops.map((f) => [f.id, allocatedBays(f)]));
  const facilityById = new Map(shops.map((f) => [f.id, f]));

  /* --- plan every induction at its preferred shop, first bay that fits --- */
  const occupancy = seedOccupancy();
  const planned: InductionDemand[] = [];

  for (const item of inductionDemand()) {
    const facility = facilityById.get(item.preferredFacilityId);
    const lane = occupancy.get(item.preferredFacilityId);
    if (!facility || !lane) continue;
    const dueIndex = Math.max(0, dayIndex(new Date(item.removalDue)));
    const start = earliestStart(lane, bays.get(facility.id) ?? 1, dueIndex, item.tatDays);
    if (start < 0) continue;
    occupy(lane, start, item.tatDays);

    const operator = dataset.operators.find((o) => o.id === item.operatorId);
    const home = AIRPORTS.find((a) => a.icao === operator?.homeBase) ?? AIRPORTS[0]!;
    const delayDays = Math.max(0, start - dueIndex);

    planned.push({
      ...item,
      plannedFacilityId: facility.id,
      plannedStart: iso(dateOfIndex(start)),
      plannedEnd: iso(dateOfIndex(start + item.tatDays)),
      delayDays,
      ferryKm: haversineKm(home, facility),
      status: delayStatus(delayDays),
    });
  }

  /* --- heat grid: demand if every engine is inducted on its removal date --- */
  const cells: CapacityCell[] = [];
  for (const facility of shops) {
    const facilityBays = bays.get(facility.id) ?? 1;
    for (const month of months) {
      const monthStart = dayIndex(new Date(month.startsAt));
      const monthEnd = monthStart + month.days;
      let demandDays = 0;
      let inductions = 0;
      for (const item of planned) {
        if (item.preferredFacilityId !== facility.id) continue;
        const dueIndex = Math.max(0, dayIndex(new Date(item.removalDue)));
        const end = dueIndex + item.tatDays;
        const overlap = Math.min(end, monthEnd) - Math.max(dueIndex, monthStart);
        if (overlap > 0) demandDays += overlap;
        if (dueIndex >= monthStart && dueIndex < monthEnd) inductions += 1;
      }
      const capacityBayMonths = facilityBays;
      const demandBayMonths = round(demandDays / month.days, 2);
      const utilisationPct = Math.round((demandBayMonths / capacityBayMonths) * 100);
      cells.push({
        facilityId: facility.id,
        month: month.key,
        bays: facilityBays,
        capacityBayMonths,
        demandBayMonths,
        utilisationPct,
        overloadBayMonths: round(Math.max(0, demandBayMonths - capacityBayMonths), 2),
        inductions,
        status: utilisationPct > 100 ? "red" : utilisationPct >= 85 ? "amber" : utilisationPct > 0 ? "green" : "grey",
      });
    }
  }

  /* --- network demand vs capacity by month --- */
  const network: NetworkMonth[] = months.map((month) => {
    const monthCells = cells.filter((c) => c.month === month.key);
    const capacityBayMonths = monthCells.reduce((s, c) => s + c.capacityBayMonths, 0);
    const demandBayMonths = round(monthCells.reduce((s, c) => s + c.demandBayMonths, 0), 2);
    // Shortfall is counted per shop: spare bays in a shop that cannot take the
    // family do not relieve an overloaded shop elsewhere.
    const shortfallBayMonths = round(monthCells.reduce((s, c) => s + c.overloadBayMonths, 0), 2);
    const utilisationPct = Math.round((demandBayMonths / Math.max(1, capacityBayMonths)) * 100);
    return {
      month: month.key,
      label: month.label,
      capacityBayMonths,
      demandBayMonths,
      shortfallBayMonths,
      utilisationPct,
      status: shortfallBayMonths > 0 ? "red" : utilisationPct >= 85 ? "amber" : "green",
    };
  });

  /* --- load levelling: reroute late inductions to capable shops with room --- */
  const trialOccupancy: Occupancy = new Map();
  for (const [facilityId, lane] of occupancy) trialOccupancy.set(facilityId, Int16Array.from(lane));

  const moves: LoadLevellingMove[] = [];
  for (const item of [...planned].filter((p) => p.delayDays > 0).sort((a, b) => b.delayDays - a.delayDays)) {
    const from = facilityById.get(item.plannedFacilityId);
    const fromLane = trialOccupancy.get(item.plannedFacilityId);
    if (!from || !fromLane) continue;
    const dueIndex = Math.max(0, dayIndex(new Date(item.removalDue)));
    const currentStart = dayIndex(new Date(item.plannedStart));

    let best: { facility: Facility; start: number } | null = null;
    for (const candidate of shops) {
      if (candidate.id === from.id) continue;
      if (!capabilities.get(candidate.id)?.find((c) => c.family === item.family)?.certified) continue;
      const lane = trialOccupancy.get(candidate.id);
      if (!lane) continue;
      const start = earliestStart(lane, bays.get(candidate.id) ?? 1, dueIndex, item.tatDays);
      if (start < 0 || start >= currentStart - 2) continue;
      if (!best || start < best.start) best = { facility: candidate, start };
    }
    if (!best) continue;

    release(fromLane, currentStart, item.tatDays);
    occupy(trialOccupancy.get(best.facility.id)!, best.start, item.tatDays);

    const operator = dataset.operators.find((o) => o.id === item.operatorId);
    const home = AIRPORTS.find((a) => a.icao === operator?.homeBase) ?? AIRPORTS[0]!;
    const residualDelayDays = Math.max(0, best.start - dueIndex);
    const fromTat = capabilities.get(from.id)?.find((c) => c.family === item.family)?.averageTatDays ?? item.tatDays;
    const toTat = capabilities.get(best.facility.id)?.find((c) => c.family === item.family)?.averageTatDays ?? item.tatDays;

    moves.push({
      id: `MV-${item.engineId}`,
      engineId: item.engineId,
      esn: item.esn,
      family: item.family,
      operatorName: item.operatorName,
      removalDue: item.removalDue,
      fromFacilityId: from.id,
      fromFacilityName: from.name,
      toFacilityId: best.facility.id,
      toFacilityName: best.facility.name,
      currentStart: item.plannedStart,
      proposedStart: iso(dateOfIndex(best.start)),
      daysRecovered: currentStart - best.start,
      residualDelayDays,
      extraFerryKm: haversineKm(home, best.facility) - item.ferryKm,
      tatDeltaDays: toTat - fromTat,
      rationale:
        residualDelayDays === 0
          ? `${from.icao} is full until ${monthLabelOf(dateOfIndex(currentStart))}; ${best.facility.icao} meets the removal date`
          : `${best.facility.icao} halves the slip at ${from.icao} — ${residualDelayDays} days still to recover`,
      status: residualDelayDays === 0 ? "green" : "amber",
    });
  }

  /* --- facility profiles --- */
  const facilities: FacilityCapacityProfile[] = shops.map((facility) => {
    const facilityBays = bays.get(facility.id) ?? 1;
    const facilityCells = cells.filter((c) => c.facilityId === facility.id);
    const queue = planned.filter((p) => p.plannedFacilityId === facility.id);
    const workOrders = dataset.workOrders.filter((w) => w.facilityId === facility.id);
    const shopWork = workOrders.filter((w) => w.type === "shop-visit" || w.type === "module-swap");
    const averageTatDays = Math.round(
      shopWork.length > 0 ? shopWork.reduce((s, w) => s + w.tatDays, 0) / shopWork.length : 60,
    );
    const peak = [...facilityCells].sort((a, b) => b.utilisationPct - a.utilisationPct)[0];
    const utilisationPct = Math.round(facilityCells.reduce((s, c) => s + c.utilisationPct, 0) / Math.max(1, facilityCells.length));
    const overloadedMonths = facilityCells.filter((c) => c.status === "red").length;
    const free = earliestStart(occupancy.get(facility.id)!, facilityBays, 0, NOMINAL_SLOT_DAYS);

    return {
      facilityId: facility.id,
      name: facility.name,
      icao: facility.icao,
      region: facility.region,
      kind: facility.kind as ShopFacilityKind,
      bays: facilityBays,
      technicians: dataset.technicians.filter((t) => t.facilityId === facility.id).length,
      wipEngines: shopWork.filter((w) => w.state === "in-progress" || w.state === "awaiting-parts").length,
      queueLength: queue.length,
      averageTatDays,
      throughputPerYear: Math.round((facilityBays * 365) / Math.max(1, averageTatDays)),
      utilisationPct,
      peakUtilisationPct: peak?.utilisationPct ?? 0,
      peakMonth: months.find((m) => m.key === peak?.month)?.label ?? "—",
      overloadedMonths,
      nextFreeSlot: free >= 0 ? iso(dateOfIndex(free)) : null,
      status: overloadedMonths > 0 ? "red" : utilisationPct >= 85 ? "amber" : "green",
      capabilities: capabilities.get(facility.id) ?? [],
    };
  });

  const nextFree = facilities
    .filter((f) => f.nextFreeSlot)
    .sort((a, b) => (a.nextFreeSlot! < b.nextFreeSlot! ? -1 : 1))[0];
  const peakShortfall = [...network].sort((a, b) => b.shortfallBayMonths - a.shortfallBayMonths)[0];

  cachedOverview = {
    horizonMonths: HORIZON_MONTHS,
    months,
    cells,
    facilities,
    network,
    demand: planned,
    moves: moves.sort((a, b) => b.daysRecovered - a.daysRecovered),
    summary: {
      inductions: planned.length,
      atRiskInductions: planned.filter((p) => p.status === "red").length,
      watchlistInductions: planned.filter((p) => p.status === "amber").length,
      overloadedFacilityMonths: cells.filter((c) => c.status === "red").length,
      networkUtilisationPct: Math.round(
        (network.reduce((s, m) => s + m.demandBayMonths, 0) / Math.max(1, network.reduce((s, m) => s + m.capacityBayMonths, 0))) * 100,
      ),
      peakShortfallBayMonths: peakShortfall?.shortfallBayMonths ?? 0,
      peakShortfallMonth: peakShortfall?.label ?? "—",
      bayMonthsShortfall: round(network.reduce((s, m) => s + m.shortfallBayMonths, 0), 1),
      totalDelayDays: planned.reduce((s, p) => s + p.delayDays, 0),
      recoverableDelayDays: moves.reduce((s, m) => s + m.daysRecovered, 0),
      nextFreeSlot: nextFree
        ? { facilityId: nextFree.facilityId, facilityName: nextFree.name, icao: nextFree.icao, startsAt: nextFree.nextFreeSlot! }
        : null,
    },
  };

  return cachedOverview;
}

/** Induction queue for one shop, in slot order. */
export function facilityInductionQueue(facilityId: string): InductionDemand[] {
  return capacityOverview()
    .demand.filter((d) => d.plannedFacilityId === facilityId)
    .sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
}

/** Facility profile plus its queue, for the facility detail view and the API. */
export function facilityCapacity(facilityId: string): { profile: FacilityCapacityProfile; queue: InductionDemand[] } | null {
  const profile = capacityOverview().facilities.find((f) => f.facilityId === facilityId);
  if (!profile) return null;
  return { profile, queue: facilityInductionQueue(facilityId) };
}

/** Families a shop can take, used by the reroute affordance. */
export function certifiedFamilies(facilityId: string): EngineFamily[] {
  return (capacityOverview().facilities.find((f) => f.facilityId === facilityId)?.capabilities ?? [])
    .filter((c) => c.certified)
    .map((c) => c.family);
}
