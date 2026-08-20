/**
 * Engine explorer selectors.
 *
 * Turns the raw fleet dataset into a decision-ready register: every managed
 * engine with its threshold breaches, projected shop-visit date and a composite
 * priority score that answers "in what order do we work them?".
 */

import type {
  EngineDriver,
  EngineExplorerData,
  EngineExplorerFacets,
  EngineExplorerSummary,
  EngineRegisterRow,
  EngineSavedView,
  FacetOption,
  Point,
  StatusLevel,
} from "@rr/types";
import { ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { clamp, createRng, iso, NOW, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Thresholds — the single place the explorer's colour rules live       */
/* ------------------------------------------------------------------ */

/** EGT margin, °C remaining. Lower is worse; below 12°C means plan a removal. */
export const EGT_MARGIN_THRESHOLDS = { red: 12, amber: 25 } as const;
/** Fleet-relative health score, 0-100. */
export const HEALTH_SCORE_THRESHOLDS = { red: 45, amber: 70 } as const;
/** Remaining useful life in cycles before removal is required. */
export const RUL_THRESHOLDS = { red: 350, amber: 900 } as const;
/** Projected days until the engine must come off wing. */
export const SHOP_VISIT_THRESHOLDS = { red: 45, amber: 90 } as const;

/** Number of recent sectors shown in the register sparkline. */
const TREND_SECTORS = 30;

function lowerIsWorse(value: number, thresholds: { red: number; amber: number }): StatusLevel {
  if (value <= thresholds.red) return "red";
  if (value <= thresholds.amber) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* Derived per-engine signals                                          */
/* ------------------------------------------------------------------ */

/**
 * EGT margin over the engine's last {@link TREND_SECTORS} recorded sectors.
 *
 * Each sector's deterioration is driven by the real flight record — derate,
 * outside air temperature and dust exposure — so the sparkline is a function of
 * the fleet data rather than decoration.
 */
export function engineEgtSectorTrend(engineId: string, sectors = TREND_SECTORS): Point[] {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine) return [];
  const flights = data.flights
    .filter((f) => f.aircraftId === engine.aircraftId)
    .sort((a, b) => (a.departedAt < b.departedAt ? 1 : -1))
    .slice(0, sectors)
    .reverse();
  if (flights.length === 0) return [];

  const rng = createRng(`${engine.id}:egt-sector-trend`);
  /* Per-sector margin loss, in °C: a benign sector costs a few hundredths of a
     degree, a hot-and-sandy sector at full thrust an order of magnitude more —
     an in-service Trent gives up roughly 1-4°C per 100 cycles. */
  const costs = flights.map(
    (flight) =>
      (0.016 + flight.environmentalExposure * 0.042 + Math.max(0, flight.outsideAirTempC - 20) * 0.0012) *
      (1 - flight.derate / 90),
  );
  const totalCost = costs.reduce((sum, c) => sum + c, 0);

  // Walk backwards from today's margin so the series ends on the current value.
  let value = engine.egtMargin + totalCost;
  return flights.map((flight, index) => {
    value -= costs[index] ?? 0;
    return { t: flight.arrivedAt, v: round(value + rand.gaussian(rng, 0, 0.05), 2) };
  });
}

/**
 * Sectors per day flown by the engine's aircraft.
 *
 * The flight table is a sample of recent sectors rather than an exhaustive log,
 * so utilisation is taken from the engine's whole life (cycles since new over
 * days since the airframe was delivered) and clamped to a plausible widebody
 * band. The sampled sectors still provide the last-flight timestamp.
 */
function utilisation(engineId: string): { cyclesPerDay: number | null; lastFlightAt: string | null } {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  const aircraft = data.aircraft.find((a) => a.id === engine?.aircraftId);
  if (!engine || !aircraft) return { cyclesPerDay: null, lastFlightAt: null };

  const flights = data.flights.filter((f) => f.aircraftId === aircraft.id);
  const lastFlightAt =
    flights.length > 0 ? iso(new Date(Math.max(...flights.map((f) => new Date(f.departedAt).getTime())))) : null;

  if (aircraft.status === "stored" || aircraft.status === "aog") return { cyclesPerDay: null, lastFlightAt };

  const daysInService = Math.max(30, (NOW.getTime() - new Date(aircraft.deliveredAt).getTime()) / 86400000);
  const cyclesPerDay = round(clamp(engine.totalFlightCycles / daysInService, 0.35, 3.5), 2);
  return { cyclesPerDay, lastFlightAt };
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

function buildRow(engineId: string): EngineRegisterRow {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId)!;
  const operator = data.operators.find((o) => o.id === engine.operatorId)!;
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId) ?? null;
  const spec = ENGINE_FAMILIES.find((f) => f.family === engine.family)!;

  const openAlerts = data.alerts.filter(
    (a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive",
  );
  const criticalAlerts = openAlerts.filter((a) => a.severity === "critical");
  const nextActionHours = openAlerts
    .map((a) => a.timeToActionHours)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b)[0];

  const workOrder = data.workOrders
    .filter((w) => w.engineId === engine.id && w.state !== "complete" && w.state !== "cancelled")
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];

  const llpRed = data.llps.filter((l) => l.engineId === engine.id && l.status === "red").length;

  const { cyclesPerDay, lastFlightAt } = utilisation(engine.id);
  const daysToShopVisit = cyclesPerDay && cyclesPerDay > 0 ? Math.round(engine.rulCycles / cyclesPerDay) : null;

  const egtTrend = engineEgtSectorTrend(engine.id);
  const decayPer100Cycles =
    egtTrend.length > 1
      ? round(((egtTrend[0]!.v - egtTrend[egtTrend.length - 1]!.v) / (egtTrend.length - 1)) * 100, 1)
      : 0;

  const egtMarginStatus = lowerIsWorse(engine.egtMargin, EGT_MARGIN_THRESHOLDS);
  const healthStatus = lowerIsWorse(engine.healthScore, HEALTH_SCORE_THRESHOLDS);
  const rulStatus = lowerIsWorse(engine.rulCycles, RUL_THRESHOLDS);
  const shopVisitStatus: StatusLevel =
    daysToShopVisit === null ? "grey" : lowerIsWorse(daysToShopVisit, SHOP_VISIT_THRESHOLDS);

  /* Priority: every point is attributable to a named driver, so any red row on
     the page can be explained by reading its drivers back to the controller. */
  const drivers: EngineDriver[] = [];
  const addDriver = (code: EngineDriver["code"], label: string, weight: number) => {
    if (weight > 0.5) drivers.push({ code, label, weight: round(weight, 0) });
  };

  addDriver(
    "egt-margin",
    `EGT margin ${engine.egtMargin}°C (red below ${EGT_MARGIN_THRESHOLDS.red}°C)`,
    clamp((EGT_MARGIN_THRESHOLDS.amber - engine.egtMargin) * 1.6, 0, 34),
  );
  addDriver(
    "critical-alert",
    criticalAlerts.length > 0
      ? `${criticalAlerts.length} critical alert${criticalAlerts.length > 1 ? "s" : ""} open`
      : `${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"}`,
    criticalAlerts.length * 9 + Math.min(openAlerts.length, 5) * 2.5,
  );
  addDriver(
    "rul",
    `${engine.rulCycles.toLocaleString("en-GB")} cycles of life remaining`,
    clamp((RUL_THRESHOLDS.amber - engine.rulCycles) / 40, 0, 22),
  );
  addDriver(
    "shop-visit-due",
    daysToShopVisit === null ? "No recorded utilisation" : `Shop visit projected in ${daysToShopVisit} days`,
    daysToShopVisit === null ? 0 : clamp((SHOP_VISIT_THRESHOLDS.amber - daysToShopVisit) / 4, 0, 18),
  );
  addDriver("llp-expiry", `${llpRed} life-limited part${llpRed === 1 ? "" : "s"} at limit`, llpRed * 6);
  addDriver(
    "health-score",
    `Health score ${engine.healthScore}/100`,
    clamp((HEALTH_SCORE_THRESHOLDS.amber - engine.healthScore) / 3, 0, 14),
  );

  drivers.sort((a, b) => b.weight - a.weight);
  const priorityScore = round(clamp(drivers.reduce((sum, d) => sum + d.weight, 0), 0, 100), 0);

  const recommendation = recommend({
    status: engine.status,
    egtMarginStatus,
    shopVisitStatus,
    rulStatus,
    criticalAlerts: criticalAlerts.length,
    hasWorkOrder: Boolean(workOrder),
    alertAction: criticalAlerts[0]?.recommendedAction ?? openAlerts[0]?.recommendedAction,
    workOrderReference: workOrder?.reference,
    engineId: engine.id,
  });

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    buildStandard: engine.buildStandard,
    thrustRating: engine.thrustRating,

    operatorId: operator.id,
    operatorCode: operator.code,
    operatorName: operator.name,
    region: operator.region,

    aircraftId: engine.aircraftId,
    aircraftTail: aircraft?.tail ?? null,
    aircraftType: aircraft?.type ?? null,
    position: engine.position,
    location: engine.location,

    lifeStage: engine.lifeStage,
    totalFlightHours: engine.totalFlightHours,
    totalFlightCycles: engine.totalFlightCycles,
    hoursSinceOverhaul: engine.hoursSinceOverhaul,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,

    egtMargin: engine.egtMargin,
    egtMarginStatus,
    egtMarginPctOfNew: round((engine.egtMargin / spec.newEgtMargin) * 100, 0),
    egtMarginDecayPer100Cycles: decayPer100Cycles,

    healthScore: engine.healthScore,
    healthStatus,

    rulCycles: engine.rulCycles,
    rulStatus,
    cyclesPerDay,
    daysToShopVisit,
    shopVisitStatus,

    openAlerts: openAlerts.length,
    criticalAlerts: criticalAlerts.length,
    nextActionHours: nextActionHours ?? null,

    workOrderReference: workOrder?.reference ?? null,
    workOrderState: workOrder?.state ?? null,

    status: engine.status,
    priorityScore,
    priorityRank: 0,
    drivers: drivers.slice(0, 4),
    recommendedAction: recommendation.action,
    recommendedActionRoute: recommendation.route,

    egtTrend,
    lastFlightAt,
  };
}

function recommend(input: {
  status: StatusLevel;
  egtMarginStatus: StatusLevel;
  rulStatus: StatusLevel;
  shopVisitStatus: StatusLevel;
  criticalAlerts: number;
  hasWorkOrder: boolean;
  alertAction?: string;
  workOrderReference?: string;
  engineId: string;
}): { action: string; route: string } {
  if (input.hasWorkOrder) {
    return {
      action: `Track work order ${input.workOrderReference}`,
      route: "/execute/work-orders",
    };
  }
  if (input.criticalAlerts > 0) {
    return { action: input.alertAction ?? "Triage critical alert", route: "/alerts" };
  }
  if (input.egtMarginStatus === "red") {
    return { action: "Plan removal — EGT margin below red line", route: "/plan/workscope" };
  }
  if (input.shopVisitStatus === "red" || input.shopVisitStatus === "amber") {
    return { action: "Book a shop visit slot", route: "/plan/schedule" };
  }
  if (input.rulStatus === "red") {
    return { action: "Plan removal — remaining life below the red line", route: "/plan/workscope" };
  }
  /* Engine status is fleet-relative health, so a row can be red without any of
     the specific breaches above. Red always earns an action. */
  if (input.status === "red") {
    return { action: "Investigate health deterioration and raise a workscope", route: "/health/trending" };
  }
  if (input.status === "amber") {
    return { action: input.alertAction ?? "Add to watchlist and re-baseline performance", route: "/health/trending" };
  }
  return { action: "No action — continue routine EHM monitoring", route: `/engines/${input.engineId}` };
}

/** The full engine register, ranked so that rank 1 is the engine to work first. */
export function engineRegister(): EngineRegisterRow[] {
  const rows = getDataset().engines.map((engine) => buildRow(engine.id));
  rows.sort((a, b) => b.priorityScore - a.priorityScore || a.egtMargin - b.egtMargin);
  rows.forEach((row, index) => {
    row.priorityRank = index + 1;
  });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Facets, summary and saved views                                     */
/* ------------------------------------------------------------------ */

function facet(rows: EngineRegisterRow[], key: (row: EngineRegisterRow) => string, label?: (value: string) => string): FacetOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label ? label(value) : value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function engineExplorerFacets(rows: EngineRegisterRow[]): EngineExplorerFacets {
  const statusOrder: StatusLevel[] = ["red", "amber", "green", "grey"];
  return {
    families: facet(rows, (r) => r.family),
    operators: facet(rows, (r) => r.operatorId, (id) => getDataset().operators.find((o) => o.id === id)?.name ?? id),
    statuses: facet(rows, (r) => r.status).sort(
      (a, b) => statusOrder.indexOf(a.value as StatusLevel) - statusOrder.indexOf(b.value as StatusLevel),
    ),
    lifeStages: facet(rows, (r) => r.lifeStage, (v) => v.replace(/-/g, " ")),
    regions: facet(rows, (r) => r.region),
  };
}

export function engineExplorerSummary(rows: EngineRegisterRow[]): EngineExplorerSummary {
  const margins = rows.map((r) => r.egtMargin).sort((a, b) => a - b);
  const mid = Math.floor(margins.length / 2);
  return {
    engines: rows.length,
    red: rows.filter((r) => r.status === "red").length,
    amber: rows.filter((r) => r.status === "amber").length,
    green: rows.filter((r) => r.status === "green").length,
    belowEgtRedLine: rows.filter((r) => r.egtMarginStatus === "red").length,
    shopVisitWithin90Days: rows.filter((r) => r.daysToShopVisit !== null && r.daysToShopVisit <= 90).length,
    criticalAlerts: rows.reduce((sum, r) => sum + r.criticalAlerts, 0),
    medianEgtMargin:
      margins.length === 0
        ? 0
        : round(margins.length % 2 === 0 ? ((margins[mid - 1] ?? 0) + (margins[mid] ?? 0)) / 2 : margins[mid]!, 1),
    unassignedRedEngines: rows.filter((r) => r.status === "red" && !r.workOrderReference).length,
  };
}

export const ENGINE_EXPLORER_SAVED_VIEWS: EngineSavedView[] = [
  {
    id: "all",
    label: "All engines",
    description: "Every managed engine, ranked by priority score.",
    filters: {},
  },
  {
    id: "red-engines",
    label: "Red engines",
    description: "Engines requiring action now.",
    filters: { statuses: ["red"] },
  },
  {
    id: "egt-margin",
    label: "EGT margin < 15",
    description: "Approaching or through the EGT margin red line.",
    filters: { maxEgtMargin: 15 },
  },
  {
    id: "shop-visit",
    label: "Due shop visit ≤ 90 days",
    description: "Projected removal inside the planning horizon.",
    filters: { maxDaysToShopVisit: 90 },
  },
  {
    id: "alerting",
    label: "Open alerts",
    description: "Engines with at least one open alert awaiting disposition.",
    filters: { minOpenAlerts: 1 },
  },
];

/** Everything the Engine explorer page renders, in one deterministic call. */
export function engineExplorerData(): EngineExplorerData {
  const rows = engineRegister();
  return {
    rows,
    facets: engineExplorerFacets(rows),
    summary: engineExplorerSummary(rows),
    savedViews: ENGINE_EXPLORER_SAVED_VIEWS,
  };
}

/** Timestamp the register was derived from; the dataset's fixed "now". */
export const ENGINE_REGISTER_AS_OF = iso(NOW);
