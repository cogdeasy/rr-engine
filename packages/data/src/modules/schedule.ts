/**
 * Maintenance schedule selectors.
 *
 * Builds the rolling 24-month network plan from the generated fleet: existing
 * work orders provide the committed and planned events, and every engine whose
 * remaining useful life expires inside the horizon without a booked shop visit
 * generates forecast removal demand. Demand is then slotted against facility
 * capacity, and anything that cannot be slotted before life expiry is a red
 * conflict.
 *
 * Domain assumptions (deliberate, and visible in the UI):
 *  - Only overhaul bases, partner shops and test cells hold shop slots; line
 *    stations carry on-wing work which does not consume a shop slot.
 *  - A slot is booked as late as possible before life expiry, so the operator
 *    extracts maximum life from the engine before removal.
 *  - Mandatory bulletin embodiment enters the plan once inside the 120-day
 *    planning freeze; before that it is tracked by the compliance module.
 */

import type {
  Engine,
  EngineFamily,
  FacilityLoadRow,
  FacilityMonthLoad,
  MaintenanceSchedule,
  ModuleCode,
  ScheduleConflict,
  ScheduleDependency,
  ScheduleDriver,
  ScheduleEvent,
  ScheduleEventKind,
  ScheduleEventState,
  ScheduleMonth,
  StatusLevel,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, createRng, iso, NOW, rand, round } from "../rng";

export const SCHEDULE_HORIZON_MONTHS = 24;

/** Facility kinds that hold engine shop slots. */
const SHOP_KINDS = new Set(["overhaul-base", "partner-shop", "test-cell"]);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const WORKSCOPE_BY_KIND: Record<ScheduleEventKind, string> = {
  "shop-visit": "Performance restoration shop visit",
  "module-swap": "Module exchange, engine remains on lease pool",
  "on-wing-task": "On-wing repair and re-baseline",
  borescope: "Scheduled borescope inspection",
  "line-check": "Line maintenance check",
  "forecast-removal": "Forecast removal — full performance restoration",
};

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function buildMonths(windowStart: Date, count: number): ScheduleMonth[] {
  return Array.from({ length: count }, (_, index) => {
    const start = addMonths(windowStart, index);
    const end = addDays(addMonths(windowStart, index + 1), -1);
    return {
      index,
      label: `${MONTH_NAMES[start.getUTCMonth()]} ${String(start.getUTCFullYear()).slice(2)}`,
      shortLabel: MONTH_NAMES[start.getUTCMonth()]!,
      year: start.getUTCFullYear(),
      start: iso(start),
      end: iso(end),
    };
  });
}

function monthIndexOf(date: Date, windowStart: Date): number {
  return (date.getUTCFullYear() - windowStart.getUTCFullYear()) * 12 + (date.getUTCMonth() - windowStart.getUTCMonth());
}

function kindFromWorkOrder(type: WorkOrder["type"]): ScheduleEventKind {
  switch (type) {
    case "shop-visit":
      return "shop-visit";
    case "module-swap":
      return "module-swap";
    case "borescope":
      return "borescope";
    case "on-wing-repair":
    case "aog-recovery":
      return "on-wing-task";
    default:
      return "line-check";
  }
}

function stateFromWorkOrder(state: WorkOrder["state"]): ScheduleEventState {
  return state === "released" || state === "in-progress" || state === "awaiting-parts" ? "committed" : "planned";
}

/** Consumes a shop slot for the duration of the visit. */
export function consumesShopSlot(kind: ScheduleEventKind): boolean {
  return kind === "shop-visit" || kind === "module-swap" || kind === "forecast-removal";
}

/** Assumed daily aircraft utilisation for a wide-body operation, block hours. */
const DAILY_BLOCK_HOURS = 13;

/**
 * Utilisation in cycles per day, derived from the average sector length the
 * engine actually flies against a wide-body daily utilisation of
 * {@link DAILY_BLOCK_HOURS} block hours.
 */
export function engineCyclesPerDay(engine: Engine): number {
  const flights = getDataset().flights.filter((f) => f.aircraftId === engine.aircraftId);
  if (flights.length > 0) {
    const meanSectorHours = flights.reduce((s, f) => s + f.blockHours, 0) / flights.length;
    return round(Math.max(0.5, Math.min(4, DAILY_BLOCK_HOURS / Math.max(1, meanSectorHours))), 3);
  }
  const rng = createRng(`${engine.id}:utilisation`);
  return rand.float(rng, 0.6, 2.2, 3);
}

/** Date at which the engine's predicted remaining useful life runs out. */
export function rulExpiryDate(engine: Engine): Date {
  return addDays(NOW, Math.round(engine.rulCycles / engineCyclesPerDay(engine)));
}

function shopVisitDurationDays(engine: Engine): number {
  const rng = createRng(`${engine.id}:tat`);
  const base = engine.family === "UltraFan" ? 70 : engine.family.startsWith("Trent XWB") ? 62 : 58;
  const severity = engine.status === "red" ? 1.25 : engine.status === "amber" ? 1.1 : 1;
  return Math.round(base * severity + rand.gaussian(rng, 0, 6));
}

function workscopeModulesFor(engine: Engine): ModuleCode[] {
  return getDataset()
    .engineModules.filter((m) => m.engineId === engine.id && m.status !== "green")
    .sort((a, b) => b.lifeConsumedPct - a.lifeConsumedPct)
    .slice(0, 4)
    .map((m) => m.code);
}

function driversFor(engine: Engine): ScheduleDriver[] {
  const data = getDataset();
  const prognostic = data.prognostics
    .filter((p) => p.engineId === engine.id)
    .sort((a, b) => b.probability - a.probability)[0];
  const llp = data.llps
    .filter((l) => l.engineId === engine.id)
    .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining)[0];
  const drivers: ScheduleDriver[] = [
    { label: "EGT margin", detail: `${engine.egtMargin}°C remaining, health index ${engine.healthScore}` },
    { label: "Life used", detail: `${engine.cyclesSinceOverhaul.toLocaleString("en-GB")} cycles since overhaul` },
  ];
  if (prognostic) {
    drivers.push({
      label: prognostic.failureMode,
      detail: `${Math.round(prognostic.probability * 100)}% within ${prognostic.horizonCycles.toLocaleString("en-GB")} cycles (${prognostic.moduleCode})`,
    });
  }
  if (llp) {
    drivers.push({
      label: `LLP ${llp.partNumber}`,
      detail: `${llp.cyclesRemaining.toLocaleString("en-GB")} cycles remaining on ${llp.moduleCode}`,
    });
  }
  return drivers;
}

function dependenciesFor(engine: Engine, facilityId: string | null, start: Date, kind: ScheduleEventKind): ScheduleDependency[] {
  const data = getDataset();
  const out: ScheduleDependency[] = [];
  const modules = workscopeModulesFor(engine);
  // Only shop work pulls life-limited hardware; on-wing tasks draw from station stock.
  const criticalPart = consumesShopSlot(kind)
    ? data.parts.filter((p) => modules.includes(p.moduleCode) && p.lifeLimited).sort((a, b) => b.leadTimeDays - a.leadTimeDays)[0]
    : undefined;
  if (criticalPart) {
    const orderBy = addDays(start, -criticalPart.leadTimeDays);
    const late = orderBy.getTime() < NOW.getTime();
    const imminent = daysBetween(NOW, start) <= 120;
    out.push({
      label: `Long-lead part ${criticalPart.partNumber}`,
      detail: `${criticalPart.leadTimeDays} day lead time — order by ${orderBy.toISOString().slice(0, 10)}`,
      status: late && imminent ? "red" : late || criticalPart.leadTimeDays > 120 ? "amber" : "green",
    });
  }
  if (facilityId) {
    const facility = data.facilities.find((f) => f.id === facilityId);
    const certified = data.technicians.filter(
      (t) => t.facilityId === facilityId && t.certifiedFamilies.includes(engine.family),
    ).length;
    out.push({
      label: `${facility?.icao ?? "Unassigned"} labour`,
      detail: `${certified} technicians certified on ${engine.family}`,
      status: certified === 0 ? "red" : certified < 4 ? "amber" : "green",
    });
  }
  const bulletin = data.serviceBulletins.find(
    (sb) => sb.mandatory && sb.affectedEngineIds.includes(engine.id) && !sb.embodiedEngineIds.includes(engine.id),
  );
  if (bulletin) {
    out.push({
      label: `${bulletin.reference} embodiment`,
      detail: `Due ${bulletin.complianceDueAt.slice(0, 10)} — ${bulletin.estimatedHoursPerEngine}h added to workscope`,
      status: new Date(bulletin.complianceDueAt).getTime() < start.getTime() ? "red" : "amber",
    });
  }
  return out;
}

/**
 * Schedule status describes the plan, not the engine: red means the slot does
 * not protect the engine's life or cannot be resourced, amber means it sits
 * inside a planning margin that needs watching, green means nominal.
 */
function plannedEventStatus(
  slackDays: number | null,
  dependencies: ScheduleDependency[],
  workOrderState: WorkOrder["state"] | null,
): { status: StatusLevel; statusReason: string } {
  if (slackDays !== null && slackDays < 0) {
    return { status: "red", statusReason: `Slot starts ${Math.abs(slackDays)} days after predicted life expiry` };
  }
  const blocking = dependencies.find((d) => d.status === "red");
  if (blocking) return { status: "red", statusReason: `${blocking.label}: ${blocking.detail}` };
  if (workOrderState === "awaiting-parts") {
    return { status: "amber", statusReason: "Work order is awaiting parts, so the slot is at risk" };
  }
  if (slackDays !== null && slackDays < 90) {
    return { status: "amber", statusReason: `Only ${slackDays} days of life margin ahead of the slot` };
  }
  const watch = dependencies.find((d) => d.status === "amber");
  if (watch) return { status: "amber", statusReason: `${watch.label}: ${watch.detail}` };
  return { status: "green", statusReason: "Slot holds, with life and resource margin in hand" };
}

interface Load {
  [facilityId: string]: number[];
}

function occupy(load: Load, facilityId: string, from: number, to: number, months: number) {
  const row = load[facilityId];
  if (!row) return;
  for (let m = Math.max(0, from); m <= Math.min(months - 1, to); m += 1) row[m] = (row[m] ?? 0) + 1;
}

function hasCapacity(load: Load, facilityId: string, from: number, to: number, capacity: number, months: number) {
  const row = load[facilityId];
  if (!row) return false;
  for (let m = Math.max(0, from); m <= Math.min(months - 1, to); m += 1) {
    if ((row[m] ?? 0) >= capacity) return false;
  }
  return true;
}

let cachedSchedule: MaintenanceSchedule | null = null;

/** The rolling network maintenance plan. Deterministic and memoised per process. */
export function maintenanceSchedule(): MaintenanceSchedule {
  if (cachedSchedule) return cachedSchedule;
  const data = getDataset();
  const windowStart = startOfMonth(NOW);
  const months = buildMonths(windowStart, SCHEDULE_HORIZON_MONTHS);
  const windowEnd = new Date(months[months.length - 1]!.end);
  const monthCount = months.length;

  const shops = data.facilities.filter((f) => SHOP_KINDS.has(f.kind));

  // Shops already carry load from the wider Rolls-Royce network, so only the
  // free balance of each shop's capacity is available to this plan.
  const baseline: Record<string, number> = {};
  const load: Load = {};
  for (const facility of data.facilities) {
    const held = SHOP_KINDS.has(facility.kind) ? Math.round((facility.capacity * facility.utilisationPct) / 100) : 0;
    baseline[facility.id] = held;
    load[facility.id] = new Array<number>(monthCount).fill(held);
  }

  const events: ScheduleEvent[] = [];
  const conflicts: ScheduleConflict[] = [];

  /* ---------------- existing work orders ---------------- */

  const scheduledEngineIds = new Set<string>();

  for (const wo of data.workOrders) {
    if (wo.state === "cancelled" || wo.state === "complete") continue;
    const start = new Date(wo.scheduledStart);
    const end = new Date(wo.scheduledEnd);
    if (end.getTime() < windowStart.getTime() || start.getTime() > windowEnd.getTime()) continue;
    const engine = data.engines.find((e) => e.id === wo.engineId);
    if (!engine) continue;
    const operator = data.operators.find((o) => o.id === wo.operatorId);
    const facility = data.facilities.find((f) => f.id === wo.facilityId);
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const kind = kindFromWorkOrder(wo.type);
    const expiry = rulExpiryDate(engine);
    const relevantToLife = consumesShopSlot(kind);
    const slackDays = relevantToLife ? daysBetween(start, expiry) : null;
    if (relevantToLife) scheduledEngineIds.add(engine.id);

    const fromMonth = monthIndexOf(start, windowStart);
    const toMonth = monthIndexOf(end, windowStart);
    if (relevantToLife && facility) occupy(load, facility.id, fromMonth, toMonth, monthCount);
    const dependencies = dependenciesFor(engine, facility?.id ?? null, start, kind);
    const { status, statusReason } = plannedEventStatus(slackDays, dependencies, wo.state);

    events.push({
      id: `SE-${wo.id}`,
      workOrderId: wo.id,
      reference: wo.reference,
      engineId: engine.id,
      esn: engine.esn,
      family: engine.family,
      operatorId: engine.operatorId,
      operatorCode: operator?.code ?? "--",
      operatorName: operator?.name ?? "Unknown operator",
      aircraftTail: aircraft?.tail ?? null,
      facilityId: facility?.id ?? null,
      facilityIcao: facility?.icao ?? null,
      facilityName: facility?.name ?? null,
      kind,
      state: stateFromWorkOrder(wo.state),
      start: iso(start),
      end: iso(end),
      durationDays: Math.max(1, daysBetween(start, end)),
      leadTimeDays: daysBetween(NOW, start),
      status,
      statusReason,
      workscope: WORKSCOPE_BY_KIND[kind],
      workscopeModules: relevantToLife ? workscopeModulesFor(engine) : [],
      drivers: driversFor(engine),
      dependencies,
      rulExpiryAt: relevantToLife ? iso(expiry) : null,
      slackDays,
      estimatedCostUsd: wo.estimatedCostUsd,
      recommendedAction:
        slackDays !== null && slackDays < 0
          ? "Pull the slot forward — the engine reaches life expiry before this visit starts"
          : wo.state === "awaiting-parts"
            ? "Expedite outstanding parts to protect the slot"
            : status === "red"
              ? "Place the outstanding long-lead order now to protect the slot"
              : "Hold slot — plan is within contractual availability",
      conflictIds: [],
    });
  }

  /* ---------------- forecast removals ---------------- */

  const forecastCandidates = data.engines
    .filter((engine) => !scheduledEngineIds.has(engine.id))
    .map((engine) => ({ engine, expiry: rulExpiryDate(engine) }))
    .filter(({ expiry }) => expiry.getTime() <= windowEnd.getTime())
    .sort((a, b) => a.expiry.getTime() - b.expiry.getTime());

  let forecastN = 0;
  for (const { engine, expiry } of forecastCandidates) {
    forecastN += 1;
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const duration = shopVisitDurationDays(engine);
    const expiryMonth = Math.min(monthCount - 1, Math.max(0, monthIndexOf(expiry, windowStart)));
    /** Last calendar month a visit starting on the 1st of month `m` still runs into. */
    const endMonthOf = (m: number) => monthIndexOf(addDays(new Date(months[m]!.start), duration), windowStart);

    // Book the slot as late as possible before life expiry, preferring a shop in
    // the operator's own region and then the least loaded shop.
    const ranked = [...shops].sort((a, b) => {
      const regionA = a.region === operator?.region ? 0 : 1;
      const regionB = b.region === operator?.region ? 0 : 1;
      if (regionA !== regionB) return regionA - regionB;
      const loadA = (load[a.id] ?? []).reduce((s, v) => s + v, 0) / a.capacity;
      const loadB = (load[b.id] ?? []).reduce((s, v) => s + v, 0) / b.capacity;
      return loadA - loadB;
    });

    let chosenFacilityId: string | null = null;
    let chosenMonth: number | null = null;
    for (let m = expiryMonth; m >= 0 && chosenMonth === null; m -= 1) {
      for (const shop of ranked) {
        if (hasCapacity(load, shop.id, m, endMonthOf(m), shop.capacity, monthCount)) {
          chosenFacilityId = shop.id;
          chosenMonth = m;
          break;
        }
      }
    }

    const unscheduled = chosenMonth === null;
    const startMonth = chosenMonth ?? expiryMonth;
    const startDate = new Date(months[startMonth]!.start);
    const endDate = addDays(startDate, duration);
    if (chosenFacilityId && chosenMonth !== null) {
      occupy(load, chosenFacilityId, chosenMonth, monthIndexOf(endDate, windowStart), monthCount);
    }
    const facility = data.facilities.find((f) => f.id === chosenFacilityId);
    const slackDays = daysBetween(startDate, expiry);
    const eventId = `SE-FC-${String(forecastN).padStart(4, "0")}`;
    const rng = createRng(`${engine.id}:svcost`);
    const estimatedCostUsd = rand.int(rng, 3_600_000, 9_200_000);

    const dependencies = dependenciesFor(engine, facility?.id ?? null, startDate, "forecast-removal");
    const conflictIds: string[] = [];
    if (unscheduled) {
      const conflictId = `CF-RUL-${engine.id}`;
      conflictIds.push(conflictId);
      conflicts.push({
        id: conflictId,
        kind: "no-slot-before-rul",
        status: "red",
        title: `${engine.esn} has no shop slot before life expiry`,
        detail: `Predicted life expiry ${expiry.toISOString().slice(0, 10)} (${engine.rulCycles.toLocaleString("en-GB")} cycles remaining). Every network shop is at capacity in the months preceding that date.`,
        engineIds: [engine.id],
        facilityId: null,
        monthIndex: expiryMonth,
        recommendedAction: "Release a partner-shop slot or lease a spare engine to cover the gap",
        exposureUsd: estimatedCostUsd,
      });
    }

    events.push({
      id: eventId,
      workOrderId: null,
      reference: `FCST-${engine.esn.replace("ESN-", "")}`,
      engineId: engine.id,
      esn: engine.esn,
      family: engine.family,
      operatorId: engine.operatorId,
      operatorCode: operator?.code ?? "--",
      operatorName: operator?.name ?? "Unknown operator",
      aircraftTail: aircraft?.tail ?? null,
      facilityId: facility?.id ?? null,
      facilityIcao: facility?.icao ?? null,
      facilityName: facility?.name ?? null,
      kind: "forecast-removal",
      state: unscheduled ? "unscheduled" : "forecast",
      start: iso(startDate),
      end: iso(endDate),
      durationDays: duration,
      leadTimeDays: daysBetween(NOW, startDate),
      status: unscheduled ? "red" : plannedEventStatus(slackDays, dependencies, null).status,
      statusReason: unscheduled
        ? `No shop slot exists before predicted life expiry on ${expiry.toISOString().slice(0, 10)}`
        : plannedEventStatus(slackDays, dependencies, null).statusReason,
      workscope: WORKSCOPE_BY_KIND["forecast-removal"],
      workscopeModules: workscopeModulesFor(engine),
      drivers: driversFor(engine),
      dependencies,
      rulExpiryAt: iso(expiry),
      slackDays,
      estimatedCostUsd,
      recommendedAction: unscheduled
        ? "Escalate to network planning — no slot exists before life expiry"
        : slackDays < 90
          ? "Confirm the slot now; the margin to life expiry is inside two months"
          : "Convert the forecast into a planned work order at the next planning board",
      conflictIds,
    });
  }

  /* ---------------- facility load and capacity conflicts ---------------- */

  const facilityLoad: FacilityLoadRow[] = data.facilities
    .filter((f) => SHOP_KINDS.has(f.kind))
    .map((facility) => {
      const held = baseline[facility.id] ?? 0;
      const monthsLoad: FacilityMonthLoad[] = months.map((month) => {
        const demand = load[facility.id]?.[month.index] ?? 0;
        const utilisationPct = round((demand / facility.capacity) * 100, 0);
        return {
          facilityId: facility.id,
          facilityIcao: facility.icao,
          monthIndex: month.index,
          capacity: facility.capacity,
          baselineDemand: held,
          planDemand: Math.max(0, demand - held),
          demand,
          utilisationPct,
          status: utilisationPct > 100 ? "red" : utilisationPct >= 85 ? "amber" : demand === 0 ? "grey" : "green",
        };
      });
      const peak = Math.max(...monthsLoad.map((m) => m.utilisationPct));
      const over = monthsLoad.filter((m) => m.utilisationPct > 100).length;
      return {
        facilityId: facility.id,
        facilityName: facility.name,
        facilityIcao: facility.icao,
        kind: facility.kind,
        capacity: facility.capacity,
        baselineDemand: held,
        months: monthsLoad,
        peakUtilisationPct: peak,
        overCommittedMonths: over,
        status: over > 0 ? "red" : peak >= 85 ? "amber" : "green",
      };
    });

  for (const row of facilityLoad) {
    for (const month of row.months) {
      if (month.utilisationPct <= 100) continue;
      const conflictId = `CF-CAP-${row.facilityId}-${month.monthIndex}`;
      const affected = events.filter(
        (e) =>
          e.facilityId === row.facilityId &&
          consumesShopSlot(e.kind) &&
          monthIndexOf(new Date(e.start), windowStart) <= month.monthIndex &&
          monthIndexOf(new Date(e.end), windowStart) >= month.monthIndex,
      );
      for (const event of affected) event.conflictIds.push(conflictId);
      conflicts.push({
        id: conflictId,
        kind: "capacity-overrun",
        status: "red",
        title: `${row.facilityIcao} over-committed in ${months[month.monthIndex]!.label}`,
        detail: `${month.demand} engines in work against ${month.capacity} slots (${month.utilisationPct}% of capacity).`,
        engineIds: affected.map((e) => e.engineId),
        facilityId: row.facilityId,
        monthIndex: month.monthIndex,
        recommendedAction: "Re-slot the lowest-risk visit into an adjacent month or to a partner shop",
        exposureUsd: affected.reduce((sum, e) => sum + e.estimatedCostUsd, 0),
      });
    }
  }

  /* ---------------- slot-after-rul conflicts on planned work ---------------- */

  for (const event of events) {
    if (event.state === "unscheduled" || event.slackDays === null || event.slackDays >= 0) continue;
    const conflictId = `CF-LATE-${event.id}`;
    event.conflictIds.push(conflictId);
    conflicts.push({
      id: conflictId,
      kind: "slot-after-rul",
      status: "red",
      title: `${event.esn} slot starts after predicted life expiry`,
      detail: `Slot opens ${Math.abs(event.slackDays)} days after the engine reaches its predicted life limit at ${event.facilityIcao ?? "an unassigned facility"}.`,
      engineIds: [event.engineId],
      facilityId: event.facilityId,
      monthIndex: monthIndexOf(new Date(event.start), windowStart),
      recommendedAction: "Pull the visit forward or extend life through an approved on-wing repair",
      exposureUsd: event.estimatedCostUsd,
    });
  }

  /* ---------------- KPIs ---------------- */

  const shopEvents = events.filter((e) => consumesShopSlot(e.kind));
  const slotMonthsUsed = facilityLoad.reduce((sum, row) => sum + row.months.reduce((s, m) => s + Math.min(m.demand, m.capacity), 0), 0);
  const slotMonthsAvailable = facilityLoad.reduce((sum, row) => sum + row.capacity * monthCount, 0);
  const futureEvents = events.filter((e) => e.leadTimeDays >= 0);
  const averageLeadTimeDays = futureEvents.length
    ? Math.round(futureEvents.reduce((s, e) => s + e.leadTimeDays, 0) / futureEvents.length)
    : 0;
  const unscheduledRed = events.filter((e) => e.state === "unscheduled").length;
  const capacityConflicts = conflicts.filter((c) => c.kind === "capacity-overrun").length;
  const atRiskEngines = new Set(events.filter((e) => e.status === "red").map((e) => e.engineId));
  const availabilityAtRiskPct = round((atRiskEngines.size / Math.max(1, data.engines.length)) * 100, 2);

  cachedSchedule = {
    generatedAt: iso(NOW),
    horizonMonths: SCHEDULE_HORIZON_MONTHS,
    windowStart: iso(windowStart),
    windowEnd: iso(windowEnd),
    months,
    events: events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.esn.localeCompare(b.esn))),
    facilityLoad,
    conflicts: conflicts.sort((a, b) => (a.monthIndex ?? 0) - (b.monthIndex ?? 0)),
    kpis: {
      unscheduledRed,
      slotUtilisationPct: round((slotMonthsUsed / Math.max(1, slotMonthsAvailable)) * 100, 1),
      averageLeadTimeDays,
      eventsInHorizon: events.length,
      capacityConflicts,
      committedCostUsd: shopEvents.reduce((s, e) => s + e.estimatedCostUsd, 0),
      availabilityAtRiskPct,
    },
    filters: {
      operators: data.operators
        .map((o) => ({ id: o.id, code: o.code, name: o.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      families: [...new Set(data.engines.map((e) => e.family))].sort() as EngineFamily[],
      facilities: facilityLoad.map((f) => ({ id: f.facilityId, icao: f.facilityIcao, name: f.facilityName })),
    },
  };

  return cachedSchedule;
}

/** Events matching a filter selection, used by the API and by tests. */
export function scheduleEvents(filter: {
  operatorId?: string;
  family?: string;
  facilityId?: string;
  status?: StatusLevel;
} = {}): ScheduleEvent[] {
  return maintenanceSchedule().events.filter(
    (e) =>
      (!filter.operatorId || e.operatorId === filter.operatorId) &&
      (!filter.family || e.family === filter.family) &&
      (!filter.facilityId || e.facilityId === filter.facilityId) &&
      (!filter.status || e.status === filter.status),
  );
}
