/**
 * Selectors for the `operator-portal` module.
 *
 * Everything here is derived from the deterministic dataset and deliberately
 * filtered to what an airline customer is entitled to see: no internal cost,
 * margin, penalty or rate data ever leaves these functions.
 */

import type {
  Aircraft,
  Alert,
  Engine,
  OperatorAction,
  OperatorAdvisory,
  OperatorAogEvent,
  OperatorAvailabilitySummary,
  OperatorContractSummary,
  OperatorEngineRow,
  OperatorEventKind,
  OperatorMonthlySummary,
  OperatorPlannedEvent,
  OperatorPortalOption,
  OperatorPortalView,
  Point,
  StatusLevel,
  Trend,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

const DAY_MS = 86_400_000;

function daysFromNow(at: string): number {
  return Math.round((new Date(at).getTime() - NOW.getTime()) / DAY_MS);
}

function statusForDays(days: number, redWithin: number, amberWithin: number): StatusLevel {
  if (days <= redWithin) return "red";
  if (days <= amberWithin) return "amber";
  return "green";
}

function trendOf(points: Point[]): Trend {
  if (points.length < 2) return "flat";
  const delta = points[points.length - 1]!.v - points[points.length - 2]!.v;
  if (Math.abs(delta) < 0.02) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Deterministic monthly history that lands exactly on `end`. */
function monthlyHistory(seed: string, end: number, months: number, spread: number): Point[] {
  const rng = createRng(seed);
  const points: Point[] = [];
  for (let i = months; i >= 0; i -= 1) {
    const value = i === 0 ? end : end + rand.gaussian(rng, 0, spread) - (i / months) * spread * 0.4;
    points.push({ t: iso(addDays(NOW, -i * 30)), v: round(clamp(value, 0, 100), 2) });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Operator switcher                                                   */
/* ------------------------------------------------------------------ */

export function listOperatorPortalOptions(): OperatorPortalOption[] {
  const d = getDataset();
  return d.operators
    .map((operator) => {
      const engines = d.engines.filter((e) => e.operatorId === operator.id);
      const aircraft = d.aircraft.filter((a) => a.operatorId === operator.id);
      const red = engines.filter((e) => e.status === "red").length;
      const amber = engines.filter((e) => e.status === "amber").length;
      const aog = aircraft.filter((a) => a.status === "aog").length;
      return {
        id: operator.id,
        code: operator.code,
        name: operator.name,
        region: operator.region,
        homeBase: operator.homeBase,
        aircraft: aircraft.length,
        engines: engines.length,
        openActions: buildOperatorActions(operator.id).length,
        status: (red > 0 || aog > 0 ? "red" : amber > 0 ? "amber" : "green") as StatusLevel,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getDefaultOperatorId(): string {
  const options = listOperatorPortalOptions();
  return (options.find((o) => o.status === "red") ?? options[0]!).id;
}

/* ------------------------------------------------------------------ */
/* Action list — "what we need from you"                               */
/* ------------------------------------------------------------------ */

function engineLabel(engine: Engine | undefined, aircraft: Aircraft | undefined): { esn?: string; tail?: string } {
  return { esn: engine?.esn, tail: aircraft?.tail };
}

export function buildOperatorActions(operatorId: string): OperatorAction[] {
  const d = getDataset();
  const engines = d.engines.filter((e) => e.operatorId === operatorId);
  const engineById = new Map(engines.map((e) => [e.id, e]));
  const aircraftById = new Map(d.aircraft.map((a) => [a.id, a]));
  const facilityById = new Map(d.facilities.map((f) => [f.id, f]));
  const actions: OperatorAction[] = [];

  const workOrders = d.workOrders.filter((w) => w.operatorId === operatorId && w.state !== "complete" && w.state !== "cancelled");

  for (const wo of workOrders) {
    const engine = engineById.get(wo.engineId);
    const aircraft = engine?.aircraftId ? aircraftById.get(engine.aircraftId) : undefined;
    const facility = facilityById.get(wo.facilityId);
    const inDays = daysFromNow(wo.scheduledStart);
    if ((wo.state === "planned" || wo.state === "draft") && inDays <= 60) {
      const status = statusForDays(inDays, 7, 21);
      actions.push({
        id: `ACT-SLOT-${wo.id}`,
        category: "slot-confirmation",
        title: `Confirm ${wo.type.replace(/-/g, " ")} slot at ${facility?.name ?? "the assigned base"}`,
        detail: `${wo.reference} is provisionally booked for ${wo.tatDays} days from ${new Date(wo.scheduledStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}. Rolls-Royce needs your written release of the aircraft to lock the slot.`,
        reason:
          status === "red"
            ? `Slot starts in ${inDays} days and is not yet released by you — the induction date is at risk.`
            : `Slot starts in ${inDays} days; confirmation keeps the plan stable.`,
        recommendedAction: inDays <= 7 ? "Release the aircraft now or request the next available slot" : "Confirm the proposed dates",
        dueAt: wo.scheduledStart,
        dueInDays: inDays,
        status,
        reference: wo.reference,
        ...engineLabel(engine, aircraft),
      });
    }
    if (wo.state === "awaiting-parts") {
      const inDaysEnd = daysFromNow(wo.scheduledEnd);
      actions.push({
        id: `ACT-PARTS-${wo.id}`,
        category: "parts-decision",
        title: `Agree recovery option for ${wo.reference}`,
        detail: `Work is paused awaiting parts at ${facility?.name ?? "the maintenance base"}. Options are to wait for the confirmed delivery or to accept a leased replacement engine to protect your schedule.`,
        reason: `Return to service currently forecast for ${new Date(wo.scheduledEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}; the aircraft stays out of service until then.`,
        recommendedAction: "Accept the lease offer to return the aircraft to service earlier",
        dueAt: wo.scheduledEnd,
        dueInDays: inDaysEnd,
        status: inDaysEnd <= 14 ? "red" : "amber",
        reference: wo.reference,
        ...engineLabel(engine, aircraft),
      });
    }
  }

  const openAlerts = d.alerts.filter(
    (a) => a.operatorId === operatorId && (a.state === "new" || a.state === "triaged") && (a.severity === "critical" || a.severity === "high"),
  );
  for (const alert of openAlerts) {
    const engine = engineById.get(alert.engineId);
    const aircraft = engine?.aircraftId ? aircraftById.get(engine.aircraftId) : undefined;
    const hours = alert.timeToActionHours ?? 720;
    const dueAt = iso(new Date(NOW.getTime() + hours * 3_600_000));
    actions.push({
      id: `ACT-ALERT-${alert.id}`,
      category: "approval",
      title: `Approve recommended action on ${engine?.esn ?? alert.engineId}`,
      detail: `${alert.title}. Detected by ${alert.source}, ATA ${alert.ataChapter}. Rolls-Royce recommends: ${alert.recommendedAction.toLowerCase()}.`,
      reason:
        alert.severity === "critical"
          ? `Critical engine condition with ${hours}h to the action deadline.`
          : `High-severity condition; deferral beyond ${hours}h increases removal risk.`,
      recommendedAction: alert.recommendedAction,
      dueAt,
      dueInDays: Math.round(hours / 24),
      status: alert.severity === "critical" ? "red" : "amber",
      reference: alert.id,
      ...engineLabel(engine, aircraft),
    });
  }

  const engineIds = new Set(engines.map((e) => e.id));
  for (const sb of d.serviceBulletins) {
    if (!sb.mandatory) continue;
    const affected = sb.affectedEngineIds.filter((id) => engineIds.has(id));
    const outstanding = affected.filter((id) => !sb.embodiedEngineIds.includes(id));
    if (outstanding.length === 0) continue;
    const inDays = daysFromNow(sb.complianceDueAt);
    if (inDays > 180) continue;
    actions.push({
      id: `ACT-SB-${sb.id}`,
      category: "compliance",
      title: `Schedule ${sb.kind} ${sb.reference} on ${outstanding.length} engine${outstanding.length === 1 ? "" : "s"}`,
      detail: `${sb.title}. Mandatory embodiment, approximately ${sb.estimatedHoursPerEngine}h per engine.`,
      reason: inDays < 0 ? `Compliance date passed ${Math.abs(inDays)} days ago.` : `Compliance date in ${inDays} days with ${outstanding.length} engines outstanding.`,
      recommendedAction: "Nominate aircraft for embodiment at the next base maintenance opportunity",
      dueAt: sb.complianceDueAt,
      dueInDays: inDays,
      status: statusForDays(inDays, 0, 60),
      reference: sb.reference,
    });
  }

  for (const llp of d.llps) {
    if (!engineIds.has(llp.engineId) || llp.status === "green") continue;
    const engine = engineById.get(llp.engineId);
    const aircraft = engine?.aircraftId ? aircraftById.get(engine.aircraftId) : undefined;
    const inDays = daysFromNow(llp.projectedExpiryDate);
    if (inDays > 365) continue;
    actions.push({
      id: `ACT-LLP-${llp.id}`,
      category: "approval",
      title: `Agree removal plan for life-limited part ${llp.partNumber}`,
      detail: `${llp.cyclesRemaining.toLocaleString("en-GB")} cycles remaining of ${llp.cyclicLimit.toLocaleString("en-GB")} on ${engine?.esn ?? llp.engineId} (${llp.moduleCode}).`,
      reason:
        llp.status === "red"
          ? `Fewer than 400 cycles remain — the engine must come off wing before the limit.`
          : `Under 1,500 cycles remain; planning now avoids an unscheduled removal.`,
      recommendedAction: "Align the LLP replacement with the next planned shop visit",
      dueAt: llp.projectedExpiryDate,
      dueInDays: inDays,
      status: llp.status,
      reference: llp.partNumber,
      ...engineLabel(engine, aircraft),
    });
  }

  const rank: Record<StatusLevel, number> = { red: 0, amber: 1, green: 2, grey: 3 };
  return actions.sort((a, b) => rank[a.status] - rank[b.status] || a.dueInDays - b.dueInDays).slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Fleet, events and performance                                       */
/* ------------------------------------------------------------------ */

function engineReason(engine: Engine, alerts: Alert[], nextEvent: WorkOrder | undefined): string {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  if (engine.status === "red") {
    if (critical > 0) return `${critical} critical alert${critical === 1 ? "" : "s"} open and EGT margin down to ${engine.egtMargin}°C.`;
    return `Health score ${engine.healthScore} with ${engine.rulCycles.toLocaleString("en-GB")} cycles of predicted life remaining.`;
  }
  if (engine.status === "amber") {
    if (nextEvent) return `On watchlist — ${nextEvent.type.replace(/-/g, " ")} planned, ${alerts.length} open alert${alerts.length === 1 ? "" : "s"}.`;
    return `On watchlist — EGT margin ${engine.egtMargin}°C, health score ${engine.healthScore}.`;
  }
  if (engine.status === "grey") return "No recent engine health data received.";
  return `Within limits — EGT margin ${engine.egtMargin}°C, health score ${engine.healthScore}.`;
}

const EVENT_KIND: Record<string, OperatorEventKind> = {
  "shop-visit": "shop-visit",
  "module-swap": "module-swap",
  borescope: "on-wing-inspection",
  "on-wing-repair": "on-wing-inspection",
  line: "line-maintenance",
  base: "scheduled-removal",
  "aog-recovery": "scheduled-removal",
};

const EVENT_LABEL: Record<OperatorEventKind, string> = {
  "scheduled-removal": "Scheduled removal",
  "shop-visit": "Shop visit",
  "module-swap": "Module swap",
  "on-wing-inspection": "On-wing inspection",
  "line-maintenance": "Line maintenance",
};

function buildAvailability(operatorId: string): OperatorAvailabilitySummary {
  const d = getDataset();
  const contract = d.contracts.find((c) => c.operatorId === operatorId);
  const aircraft = d.aircraft.filter((a) => a.operatorId === operatorId);
  const disrupted = aircraft.filter((a) => a.status === "aog" || a.status === "in-maintenance").length;
  const actual = contract?.availabilityActual ?? 98;
  const target = contract?.availabilityTarget ?? 98.5;
  const rng = createRng(`operator-portal:dispatch:${operatorId}`);
  const dispatch = round(clamp(99.9 - disrupted * 0.12 - rand.float(rng, 0, 0.35), 97.5, 99.95), 2);
  const history = monthlyHistory(`operator-portal:availability:${operatorId}`, actual, 11, 0.9);
  const dispatchHistory = monthlyHistory(`operator-portal:dispatch-history:${operatorId}`, dispatch, 11, 0.25);
  const previous = history[history.length - 2]?.v ?? actual;

  return {
    actual,
    target,
    status: actual < target - 0.8 ? "red" : actual < target ? "amber" : "green",
    trend: trendOf(history),
    deltaPct: round(actual - previous, 2),
    history,
    dispatchReliability: dispatch,
    dispatchTarget: 99.5,
    dispatchTrend: trendOf(dispatchHistory),
    dispatchHistory,
    aircraftDaysLost: d.workOrders
      .filter((w) => w.operatorId === operatorId && (w.state === "in-progress" || w.state === "awaiting-parts"))
      .reduce((sum, w) => sum + w.tatDays, 0),
  };
}

function buildMonthlySummary(operatorId: string, availability: OperatorAvailabilitySummary): OperatorMonthlySummary {
  const d = getDataset();
  const since = NOW.getTime() - 30 * DAY_MS;
  const flights = d.flights.filter((f) => f.operatorId === operatorId && new Date(f.departedAt).getTime() >= since);
  const blockHours = flights.reduce((s, f) => s + f.blockHours, 0);
  const alerts = d.alerts.filter((a) => a.operatorId === operatorId);
  const workOrders = d.workOrders.filter((w) => w.operatorId === operatorId);
  const completed = workOrders.filter((w) => w.state === "complete");
  const onTime = completed.filter((w) => w.tatDays <= (w.type === "shop-visit" ? 70 : 10)).length;

  return {
    periodLabel: NOW.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    reference: `RR-OPS-${operatorId}-${NOW.getUTCFullYear()}${String(NOW.getUTCMonth() + 1).padStart(2, "0")}`,
    issuedAt: iso(NOW),
    sectors: flights.length,
    blockHours: round(blockHours, 0),
    engineFlightHours: round(blockHours * 2, 0),
    averageDerate: flights.length === 0 ? 0 : round(flights.reduce((s, f) => s + f.derate, 0) / flights.length, 1),
    alertsRaised: alerts.filter((a) => new Date(a.raisedAt).getTime() >= since).length,
    alertsClosed: alerts.filter((a) => a.state === "closed" || a.state === "false-positive").length,
    eventsCompleted: completed.length,
    removalsPlanned: workOrders.filter((w) => (w.type === "shop-visit" || w.type === "module-swap") && w.state !== "complete" && w.state !== "cancelled").length,
    availability: availability.actual,
    availabilityTarget: availability.target,
    dispatchReliability: availability.dispatchReliability,
    onTimeEventCompletionPct: completed.length === 0 ? 100 : Math.round((onTime / completed.length) * 100),
  };
}

export function buildOperatorPortalView(operatorId: string): OperatorPortalView | undefined {
  const d = getDataset();
  const option = listOperatorPortalOptions().find((o) => o.id === operatorId);
  const operator = d.operators.find((o) => o.id === operatorId);
  if (!option || !operator) return undefined;

  const engines = d.engines.filter((e) => e.operatorId === operatorId);
  const aircraft = d.aircraft.filter((a) => a.operatorId === operatorId);
  const aircraftById = new Map(d.aircraft.map((a) => [a.id, a]));
  const facilityById = new Map(d.facilities.map((f) => [f.id, f]));
  const workOrders = d.workOrders.filter((w) => w.operatorId === operatorId);
  const openWorkOrders = workOrders.filter((w) => w.state !== "complete" && w.state !== "cancelled");
  const contract = d.contracts.find((c) => c.operatorId === operatorId);

  const byStatus: Record<StatusLevel, number> = { red: 0, amber: 0, green: 0, grey: 0 };
  for (const engine of engines) byStatus[engine.status] += 1;

  const engineRows: OperatorEngineRow[] = engines
    .map((engine) => {
      const alerts = d.alerts.filter((a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive");
      const nextEvent = openWorkOrders
        .filter((w) => w.engineId === engine.id)
        .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];
      return {
        engineId: engine.id,
        esn: engine.esn,
        family: engine.family,
        tail: engine.aircraftId ? aircraftById.get(engine.aircraftId)?.tail ?? null : null,
        position: engine.position,
        status: engine.status,
        reason: engineReason(engine, alerts, nextEvent),
        healthScore: engine.healthScore,
        egtMargin: engine.egtMargin,
        cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
        rulCycles: engine.rulCycles,
        openAlerts: alerts.length,
        nextEvent: nextEvent ? EVENT_LABEL[EVENT_KIND[nextEvent.type] ?? "line-maintenance"] : null,
        nextEventAt: nextEvent?.scheduledStart ?? null,
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore);

  const plannedEvents: OperatorPlannedEvent[] = openWorkOrders
    .map((wo) => {
      const engine = engines.find((e) => e.id === wo.engineId);
      const startsInDays = daysFromNow(wo.scheduledStart);
      const kind = EVENT_KIND[wo.type] ?? "line-maintenance";
      const confirmed = wo.state === "released" || wo.state === "in-progress";
      return {
        id: wo.id,
        reference: wo.reference,
        kind,
        label: EVENT_LABEL[kind],
        esn: engine?.esn ?? wo.engineId,
        tail: engine?.aircraftId ? aircraftById.get(engine.aircraftId)?.tail ?? null : null,
        facility: facilityById.get(wo.facilityId)?.name ?? "To be confirmed",
        startsAt: wo.scheduledStart,
        endsAt: wo.scheduledEnd,
        downtimeDays: wo.tatDays,
        startsInDays,
        confirmed,
        status: (wo.state === "awaiting-parts" ? "red" : confirmed ? "green" : startsInDays <= 21 ? "amber" : "grey") as StatusLevel,
        reason:
          wo.state === "awaiting-parts"
            ? "Held awaiting parts — return-to-service date at risk."
            : confirmed
              ? "Slot confirmed and resourced."
              : startsInDays <= 21
                ? `Awaiting your release with ${startsInDays} days to induction.`
                : "Provisional booking, no action needed yet.",
      };
    })
    .sort((a, b) => a.startsInDays - b.startsInDays);

  const aogEvents: OperatorAogEvent[] = aircraft
    .filter((a) => a.status === "aog")
    .map((ac) => {
      const engine = engines.find((e) => e.aircraftId === ac.id && e.status !== "green") ?? engines.find((e) => e.aircraftId === ac.id);
      const alert = d.alerts
        .filter((a) => a.engineId === engine?.id)
        .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))[0];
      const recovery = openWorkOrders.find((w) => w.engineId === engine?.id);
      const raisedAt = alert?.raisedAt ?? iso(addDays(NOW, -2));
      return {
        id: `AOG-${ac.id}`,
        tail: ac.tail,
        aircraftType: ac.type,
        esn: engine?.esn ?? "—",
        location: engine?.location ?? "—",
        raisedAt,
        hoursGrounded: Math.max(1, Math.round((NOW.getTime() - new Date(raisedAt).getTime()) / 3_600_000)),
        cause: alert?.title ?? "Engine condition under investigation",
        recoveryPlan: recovery
          ? `${recovery.reference} — ${recovery.type.replace(/-/g, " ")} at ${facilityById.get(recovery.facilityId)?.name ?? "assigned base"}`
          : "Recovery team mobilising, plan to be issued",
        expectedReturnAt: recovery?.scheduledEnd ?? null,
        status: "red" as StatusLevel,
      };
    });

  const engineIds = new Set(engines.map((e) => e.id));
  const advisories: OperatorAdvisory[] = d.serviceBulletins
    .map((sb) => {
      const affected = sb.affectedEngineIds.filter((id) => engineIds.has(id));
      const embodied = sb.embodiedEngineIds.filter((id) => engineIds.has(id));
      return { sb, affected, embodied };
    })
    .filter((x) => x.affected.length > 0)
    .map(({ sb, affected, embodied }) => {
      const inDays = daysFromNow(sb.complianceDueAt);
      const outstanding = affected.length - embodied.length;
      return {
        id: sb.id,
        reference: sb.reference,
        kind: sb.kind,
        title: sb.title,
        family: sb.family,
        mandatory: sb.mandatory,
        dueAt: sb.complianceDueAt,
        affectedEngines: affected.length,
        embodiedEngines: embodied.length,
        status: (outstanding === 0 ? "green" : sb.mandatory ? statusForDays(inDays, 0, 90) : "grey") as StatusLevel,
      };
    })
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))
    .slice(0, 8);

  const availability = buildAvailability(operatorId);
  const contractSummary: OperatorContractSummary = {
    id: contract?.id ?? operator.contractId,
    kind: contract?.kind ?? "TotalCare",
    startsAt: contract?.startsAt ?? iso(addDays(NOW, -900)),
    endsAt: contract?.endsAt ?? iso(addDays(NOW, 900)),
    monthsRemaining: Math.max(0, Math.round(daysFromNow(contract?.endsAt ?? iso(addDays(NOW, 900))) / 30)),
    coveredEngines: contract?.coveredEngineIds.length ?? engines.length,
    availabilityTarget: availability.target,
    availabilityActual: availability.actual,
    status: availability.status,
  };

  return {
    operator: option,
    contract: contractSummary,
    fleet: {
      aircraft: aircraft.length,
      engines: engines.length,
      inService: aircraft.filter((a) => a.status === "in-service").length,
      inMaintenance: aircraft.filter((a) => a.status === "in-maintenance").length,
      aog: aircraft.filter((a) => a.status === "aog").length,
      byStatus,
      averageHealthScore: Math.round(engines.reduce((s, e) => s + e.healthScore, 0) / Math.max(1, engines.length)),
    },
    availability,
    actions: buildOperatorActions(operatorId),
    engines: engineRows,
    plannedEvents,
    aogEvents,
    advisories,
    monthly: buildMonthlySummary(operatorId, availability),
  };
}
