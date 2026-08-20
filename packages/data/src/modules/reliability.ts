/**
 * Reliability KPIs — derived selectors.
 *
 * Everything is computed from the generated fleet: flights give exposure (engine
 * flight hours and departures), alerts give in-service events, and work orders
 * give unscheduled removals. Rates are exposure-normalised over the observation
 * window each event class actually covers, so they are window-independent and
 * can be reported as rolling 12-month figures.
 *
 * Two documented modelling assumptions:
 *
 * 1. The sector log is a *sample* (~13 sectors per aircraft over 45 days), so it
 *    gives each aircraft's relative utilisation and mean sector length but not
 *    absolute exposure. Utilisation is normalised to the programme planning
 *    assumption of {@link PROGRAMME_ANNUAL_EFH_PER_ENGINE} engine flight hours
 *    per installed engine per year, preserving per-aircraft variation.
 * 2. The event log covers 2-4 months, so the earlier months of the rolling
 *    12-month history are back-cast deterministically from the measured value.
 *
 * Every headline number, ranking, Pareto and Weibull fit is measured from the
 * dataset, not invented.
 */

import type {
  Alert,
  Engine,
  EngineFamily,
  MetricDirection,
  Point,
  RecurringDefect,
  ReliabilityAction,
  ReliabilityMeasure,
  ReliabilityMetricDefinition,
  ReliabilityMetricId,
  ReliabilityOverview,
  ReliabilitySegment,
  ReliabilitySegmentKind,
  RemovalCause,
  ScorecardRow,
  StatusLevel,
  Trend,
  WeibullFit,
  WorkOrder,
} from "@rr/types";
import { FAILURE_MODES } from "../catalog";
import { generateDataset, type Dataset } from "../generate";
import { clamp, createRng, daysAgo, hashString, iso, NOW, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Metric definitions                                                  */
/* ------------------------------------------------------------------ */

export const RELIABILITY_METRICS: ReliabilityMetricDefinition[] = [
  {
    id: "dispatch-reliability",
    label: "Dispatch reliability",
    shortLabel: "Dispatch",
    unit: "%",
    direction: "higher-is-better",
    target: 99.9,
    amberTolerance: 0.001,
    decimals: 2,
    description: "Departures free of an engine-attributed technical delay over 15 minutes or cancellation.",
  },
  {
    id: "ifsd-rate",
    label: "IFSD rate",
    shortLabel: "IFSD",
    unit: "/1000 EFH",
    direction: "lower-is-better",
    /** The 180-minute ETOPS in-flight shut-down rate requirement. */
    target: 0.02,
    amberTolerance: 0.35,
    decimals: 3,
    description: "In-flight shut-downs per 1,000 engine flight hours, against the 180-minute ETOPS requirement.",
  },
  {
    id: "unscheduled-removal-rate",
    label: "Unscheduled removal rate",
    shortLabel: "UER",
    unit: "/1000 EFH",
    direction: "lower-is-better",
    target: 0.06,
    amberTolerance: 0.2,
    decimals: 3,
    description: "Engine removals not planned in the maintenance programme, per 1,000 engine flight hours.",
  },
  {
    id: "delay-cancellation-rate",
    label: "Delay & cancellation rate",
    shortLabel: "D&C",
    unit: "/100 dep",
    direction: "lower-is-better",
    target: 0.1,
    amberTolerance: 0.5,
    decimals: 2,
    description: "Engine-attributed technical delays and cancellations per 100 departures.",
  },
  {
    id: "mtbur",
    label: "MTBUR",
    shortLabel: "MTBUR",
    unit: "hours",
    direction: "higher-is-better",
    target: 12000,
    amberTolerance: 0.12,
    decimals: 0,
    description: "Mean engine flight hours between unscheduled removals.",
  },
];

const METRIC_BY_ID = new Map(RELIABILITY_METRICS.map((m) => [m.id, m]));

const METRIC_IDS: ReliabilityMetricId[] = RELIABILITY_METRICS.map((m) => m.id);

/** Work order types that always take an engine off wing outside the planned programme. */
const REMOVAL_TYPES: WorkOrder["type"][] = ["module-swap", "aog-recovery", "on-wing-repair"];

const WINDOW_MONTHS = 12;

/**
 * Programme planning utilisation for an installed engine. The sector log is a
 * sample, so measured utilisation is scaled to this fleet mean while keeping
 * each aircraft's relative utilisation and sector length.
 */
export const PROGRAMME_ANNUAL_EFH_PER_ENGINE = 3800;

/* ------------------------------------------------------------------ */
/* Exposure                                                            */
/* ------------------------------------------------------------------ */

interface Exposure {
  /** Engine flight hours per engine per month. */
  efhPerMonth: Map<string, number>;
  /** Departures per engine per month. */
  departuresPerMonth: Map<string, number>;
}

function daysSpan(dates: string[]): number {
  if (dates.length === 0) return 30;
  const oldest = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const days = (NOW.getTime() - new Date(oldest).getTime()) / 86_400_000;
  return Math.max(7, round(days, 2));
}

/**
 * Engine exposure derived from the flight log: an installed engine accumulates
 * the block hours and departures of its aircraft.
 */
function computeExposure(data: Dataset): Exposure {
  const hoursByAircraft = new Map<string, number>();
  const sectorsByAircraft = new Map<string, number>();
  for (const flight of data.flights) {
    hoursByAircraft.set(flight.aircraftId, (hoursByAircraft.get(flight.aircraftId) ?? 0) + flight.blockHours);
    sectorsByAircraft.set(flight.aircraftId, (sectorsByAircraft.get(flight.aircraftId) ?? 0) + 1);
  }
  const flightWindowDays = daysSpan(data.flights.map((f) => f.departedAt));
  const monthsObserved = flightWindowDays / 30.44;

  const efhPerMonth = new Map<string, number>();
  const departuresPerMonth = new Map<string, number>();
  const fleetMeanHours =
    [...hoursByAircraft.values()].reduce((s, v) => s + v, 0) / Math.max(1, hoursByAircraft.size) / monthsObserved;
  const fleetMeanSectors =
    [...sectorsByAircraft.values()].reduce((s, v) => s + v, 0) / Math.max(1, sectorsByAircraft.size) / monthsObserved;

  for (const engine of data.engines) {
    const aircraftId = engine.aircraftId;
    const stored = aircraftId ? data.aircraft.find((a) => a.id === aircraftId)?.status === "stored" : true;
    if (!aircraftId || stored) {
      efhPerMonth.set(engine.id, 0);
      departuresPerMonth.set(engine.id, 0);
      continue;
    }
    efhPerMonth.set(engine.id, (hoursByAircraft.get(aircraftId) ?? fleetMeanHours * monthsObserved) / monthsObserved);
    departuresPerMonth.set(
      engine.id,
      (sectorsByAircraft.get(aircraftId) ?? fleetMeanSectors * monthsObserved) / monthsObserved,
    );
  }

  // Normalise the sampled log to programme utilisation across installed engines.
  const installed = [...efhPerMonth.values()].filter((v) => v > 0).length;
  const sampledTotal = [...efhPerMonth.values()].reduce((s, v) => s + v, 0);
  const scale = sampledTotal > 0 ? (installed * (PROGRAMME_ANNUAL_EFH_PER_ENGINE / 12)) / sampledTotal : 1;
  for (const [engineId, value] of efhPerMonth) efhPerMonth.set(engineId, value * scale);
  for (const [engineId, value] of departuresPerMonth) departuresPerMonth.set(engineId, value * scale);

  return { efhPerMonth, departuresPerMonth };
}

/* ------------------------------------------------------------------ */
/* Event classification                                                */
/* ------------------------------------------------------------------ */

/**
 * An in-flight shut-down: a critical event reported from the aircraft itself,
 * either by the crew or over the ACARS downlink.
 */
function isIfsdEvent(alert: Alert): boolean {
  return (
    alert.severity === "critical" &&
    alert.state !== "false-positive" &&
    (alert.source === "pilot-report" || alert.source === "ACARS")
  );
}

/** Alerts consistent with an engine-attributed technical delay or cancellation. */
function isDelayEvent(alert: Alert): boolean {
  return (
    alert.state !== "false-positive" &&
    (alert.severity === "critical" || alert.severity === "high") &&
    (alert.source === "line-maintenance" || alert.source === "pilot-report")
  );
}

/**
 * An unscheduled removal: an off-wing event outside the planned programme, plus
 * shop visits raised at high or critical priority (i.e. driven by a finding
 * rather than by the maintenance plan).
 */
function isUnscheduledRemoval(wo: WorkOrder): boolean {
  if (wo.state === "cancelled" || wo.state === "draft") return false;
  if (REMOVAL_TYPES.includes(wo.type)) return true;
  return wo.type === "shop-visit" && (wo.priority === "critical" || wo.priority === "high");
}

/** The failure mode a removal is attributed to, taken from its triggering alert. */
function causeOf(wo: WorkOrder, alertsById: Map<string, Alert>) {
  for (const alertId of wo.triggeringAlertIds) {
    const alert = alertsById.get(alertId);
    if (!alert) continue;
    const mode = alert.title.split(" — ")[0];
    const known = FAILURE_MODES.find((f) => f.mode === mode);
    if (known) return { cause: known.mode, moduleCode: known.module, ataChapter: known.ata };
  }
  return { cause: "Unconfirmed — under investigation", moduleCode: "EXTERNALS" as const, ataChapter: "72-00" };
}

/* ------------------------------------------------------------------ */
/* Measures                                                            */
/* ------------------------------------------------------------------ */

function statusFor(value: number, definition: ReliabilityMetricDefinition): StatusLevel {
  const { target, direction, amberTolerance } = definition;
  const amberLimit = direction === "higher-is-better" ? target * (1 - amberTolerance) : target * (1 + amberTolerance);
  if (direction === "higher-is-better") {
    if (value >= target) return "green";
    return value >= amberLimit ? "amber" : "red";
  }
  if (value <= target) return "green";
  return value <= amberLimit ? "amber" : "red";
}

/** 100 = on target; higher is always better regardless of metric direction. */
function attainment(value: number, target: number, direction: MetricDirection): number {
  if (target === 0) return value === 0 ? 100 : 0;
  const ratio = direction === "higher-is-better" ? value / target : target / Math.max(value, target * 0.01);
  return round(clamp(ratio * 100, 0, 160), 1);
}

/**
 * Rolling 12-month history ending at the measured value. The direction and
 * magnitude of the back-cast are seeded from the population id so the same
 * population always reads the same way across processes.
 */
function rollingHistory(
  seed: string,
  value: number,
  improving: boolean,
  definition: ReliabilityMetricDefinition,
): Point[] {
  const rng = createRng(`reliability:${seed}`);
  // Percentages cannot read above 100 in a back-cast, so their swing works in the headroom below it.
  const ceiling = definition.unit === "%" ? 100 : Number.POSITIVE_INFINITY;
  const scale = Number.isFinite(ceiling) ? Math.min(Math.abs(value), (ceiling - value) * 3) : Math.abs(value);
  const swing = scale * rand.float(rng, 0.03, 0.09);
  // A worse reading is a lower one for higher-is-better metrics and a higher one otherwise.
  const worseDirection = definition.direction === "higher-is-better" ? -1 : 1;
  const totalDrift = (improving ? worseDirection : -worseDirection) * swing * 2;
  const points: Point[] = [];
  for (let i = WINDOW_MONTHS - 1; i >= 0; i -= 1) {
    const progress = (WINDOW_MONTHS - 1 - i) / (WINDOW_MONTHS - 1);
    const wobble = rand.gaussian(rng, 0, swing * 0.35);
    const raw = value + totalDrift * (1 - progress) + (i === 0 ? 0 : wobble);
    points.push({ t: iso(daysAgo(i * 30.44)), v: round(clamp(raw, 0, ceiling), definition.decimals + 1) });
  }
  return points;
}

function trendOf(history: Point[], direction: MetricDirection): { trend: Trend; deltaPct: number } {
  const first = history[0]?.v ?? 0;
  const last = history[history.length - 1]?.v ?? 0;
  const deltaPct = first === 0 ? 0 : round(((last - first) / Math.abs(first)) * 100, 1);
  const materially = Math.abs(deltaPct) >= 0.4;
  const trend: Trend = !materially ? "flat" : last > first ? "up" : "down";
  void direction;
  return { trend, deltaPct };
}

function makeMeasure(id: ReliabilityMetricId, value: number, seed: string): ReliabilityMeasure {
  const definition = METRIC_BY_ID.get(id)!;
  const status = statusFor(value, definition);
  const improving = status === "green";
  const history = rollingHistory(`${seed}:${id}`, value, improving, definition);
  history[history.length - 1] = { t: iso(NOW), v: round(value, definition.decimals + 1) };
  const { trend, deltaPct } = trendOf(history, definition.direction);
  return {
    id,
    value: round(value, definition.decimals),
    target: definition.target,
    attainmentPct: attainment(value, definition.target, definition.direction),
    status,
    trend,
    deltaPct,
    history,
  };
}

interface PopulationInput {
  id: string;
  kind: ReliabilitySegmentKind;
  label: string;
  sublabel: string;
  engines: Engine[];
}

interface Context {
  data: Dataset;
  exposure: Exposure;
  alertWindowDays: number;
  workOrderWindowDays: number;
  alertsById: Map<string, Alert>;
  removals: WorkOrder[];
}

function buildContext(data: Dataset): Context {
  return {
    data,
    exposure: computeExposure(data),
    alertWindowDays: daysSpan(data.alerts.map((a) => a.raisedAt)),
    workOrderWindowDays: daysSpan(data.workOrders.map((w) => w.raisedAt)),
    alertsById: new Map(data.alerts.map((a) => [a.id, a])),
    removals: data.workOrders.filter(isUnscheduledRemoval),
  };
}

function segmentFor(ctx: Context, input: PopulationInput): ReliabilitySegment {
  const engineIds = new Set(input.engines.map((e) => e.id));
  const efhPerMonth = input.engines.reduce((s, e) => s + (ctx.exposure.efhPerMonth.get(e.id) ?? 0), 0);
  const depPerMonth = input.engines.reduce((s, e) => s + (ctx.exposure.departuresPerMonth.get(e.id) ?? 0), 0);

  const ifsdEvents = ctx.data.alerts.filter((a) => engineIds.has(a.engineId) && isIfsdEvent(a)).length;
  const delayEvents = ctx.data.alerts.filter((a) => engineIds.has(a.engineId) && isDelayEvent(a)).length;
  const removals = ctx.removals.filter((w) => engineIds.has(w.engineId)).length;

  const alertMonths = ctx.alertWindowDays / 30.44;
  const removalMonths = ctx.workOrderWindowDays / 30.44;

  const efhOverAlertWindow = Math.max(1, efhPerMonth * alertMonths);
  const efhOverRemovalWindow = Math.max(1, efhPerMonth * removalMonths);
  const departuresOverAlertWindow = Math.max(1, depPerMonth * alertMonths);

  const ifsdRate = (ifsdEvents / efhOverAlertWindow) * 1000;
  const removalRate = (removals / efhOverRemovalWindow) * 1000;
  const delayRate = (delayEvents / departuresOverAlertWindow) * 100;
  const dispatch = clamp(100 - delayRate, 90, 100);
  const mtbur = removals === 0 ? efhOverRemovalWindow : efhOverRemovalWindow / removals;

  const measures: Record<ReliabilityMetricId, ReliabilityMeasure> = {
    "dispatch-reliability": makeMeasure("dispatch-reliability", dispatch, input.id),
    "ifsd-rate": makeMeasure("ifsd-rate", ifsdRate, input.id),
    "unscheduled-removal-rate": makeMeasure("unscheduled-removal-rate", removalRate, input.id),
    "delay-cancellation-rate": makeMeasure("delay-cancellation-rate", delayRate, input.id),
    mtbur: makeMeasure("mtbur", mtbur, input.id),
  };

  const ranked = [...METRIC_IDS].sort((a, b) => measures[a].attainmentPct - measures[b].attainmentPct);
  const driverMetricId = ranked[0];
  const status: StatusLevel = METRIC_IDS.some((id) => measures[id].status === "red")
    ? "red"
    : METRIC_IDS.some((id) => measures[id].status === "amber")
      ? "amber"
      : "green";

  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    sublabel: input.sublabel,
    engines: input.engines.length,
    efh: Math.round(efhPerMonth * WINDOW_MONTHS),
    departures: Math.round(depPerMonth * WINDOW_MONTHS),
    measures,
    driverMetricId,
    status,
  };
}

/* ------------------------------------------------------------------ */
/* Pareto of removal causes                                            */
/* ------------------------------------------------------------------ */

function removalCauses(ctx: Context): RemovalCause[] {
  const groups = new Map<string, { cause: string; moduleCode: RemovalCause["moduleCode"]; ataChapter: string; orders: WorkOrder[] }>();
  for (const wo of ctx.removals) {
    const cause = causeOf(wo, ctx.alertsById);
    const key = cause.cause;
    const group = groups.get(key) ?? { ...cause, orders: [] };
    group.orders.push(wo);
    groups.set(key, group);
  }

  const total = ctx.removals.length || 1;
  const sorted = [...groups.values()].sort((a, b) => b.orders.length - a.orders.length);
  let cumulative = 0;
  return sorted.map((group, rank) => {
    const removals = group.orders.length;
    const sharePct = round((removals / total) * 100, 1);
    cumulative = round(cumulative + sharePct, 1);
    const vitalFew = cumulative - sharePct < 80;
    const costUsd = group.orders.reduce((s, w) => s + (w.actualCostUsd ?? w.estimatedCostUsd), 0);
    return {
      id: `cause-${hashString(group.cause).toString(36)}`,
      cause: group.cause,
      moduleCode: group.moduleCode,
      ataChapter: group.ataChapter,
      removals,
      sharePct,
      cumulativePct: Math.min(100, cumulative),
      meanTatDays: round(group.orders.reduce((s, w) => s + w.tatDays, 0) / removals, 1),
      costUsd,
      vitalFew,
      // The three biggest drivers are the ones a campaign would target first.
      status: rank < 3 ? "red" : vitalFew ? "amber" : "green",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Recurring defects                                                   */
/* ------------------------------------------------------------------ */

function recurringDefects(ctx: Context): RecurringDefect[] {
  const enginesById = new Map(ctx.data.engines.map((e) => [e.id, e]));
  const groups = new Map<string, { mode: string; family: EngineFamily; alerts: Alert[] }>();
  for (const alert of ctx.data.alerts) {
    // A reportable defect is a high or critical in-service event, not every EHM signature.
    if (alert.state === "false-positive") continue;
    if (alert.severity !== "critical" && alert.severity !== "high") continue;
    const engine = enginesById.get(alert.engineId);
    if (!engine) continue;
    const mode = alert.title.split(" — ")[0];
    if (!FAILURE_MODES.some((f) => f.mode === mode)) continue;
    const key = `${mode}::${engine.family}`;
    const group = groups.get(key) ?? { mode, family: engine.family, alerts: [] };
    group.alerts.push(alert);
    groups.set(key, group);
  }

  const midpoint = iso(daysAgo(ctx.alertWindowDays / 2));

  return [...groups.values()]
    .map((group) => {
      const failure = FAILURE_MODES.find((f) => f.mode === group.mode)!;
      const engineIds = new Set(group.alerts.map((a) => a.engineId));
      const operatorIds = new Set(group.alerts.map((a) => a.operatorId));
      // Exposure is the whole population at risk — every engine in the family.
      const efhPerMonth = ctx.data.engines
        .filter((e) => e.family === group.family)
        .reduce((s, e) => s + (ctx.exposure.efhPerMonth.get(e.id) ?? 0), 0);
      const exposureHours = Math.max(1, efhPerMonth * (ctx.alertWindowDays / 30.44));
      const recent = group.alerts.filter((a) => a.raisedAt >= midpoint).length;
      const older = group.alerts.length - recent;
      const trend: Trend = recent > older ? "up" : recent < older ? "down" : "flat";
      const eventsPerEngine = round(group.alerts.length / Math.max(1, engineIds.size), 1);
      const openCritical = group.alerts.filter((a) => a.severity === "critical" && a.state !== "closed").length;
      const status: StatusLevel =
        openCritical > 0 && trend === "up" ? "red" : openCritical > 0 || trend === "up" ? "amber" : "green";
      const actionCounts = new Map<string, number>();
      for (const alert of group.alerts) {
        actionCounts.set(alert.recommendedAction, (actionCounts.get(alert.recommendedAction) ?? 0) + 1);
      }
      const recommendedAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Monitor trend";
      return {
        id: `defect-${hashString(`${group.mode}${group.family}`).toString(36)}`,
        title: group.mode,
        moduleCode: failure.module,
        ataChapter: failure.ata,
        family: group.family,
        occurrences: group.alerts.length,
        engines: engineIds.size,
        operators: operatorIds.size,
        mtbfHours: Math.round(exposureHours / group.alerts.length),
        eventsPerEngine,
        lastOccurredAt: group.alerts.reduce((latest, a) => (a.raisedAt > latest ? a.raisedAt : latest), group.alerts[0].raisedAt),
        trend,
        status,
        recommendedAction,
      };
    })
    // A single event is not yet a recurring defect.
    .filter((defect) => defect.occurrences > 1)
    .sort((a, b) => b.occurrences - a.occurrences || a.mtbfHours - b.mtbfHours);
}

/* ------------------------------------------------------------------ */
/* Weibull fits                                                        */
/* ------------------------------------------------------------------ */

/**
 * Two-parameter Weibull fitted by median-rank regression over the cycles-since-
 * overhaul at which each occurrence of the failure mode was observed.
 */
function fitWeibull(lives: number[]): { beta: number; eta: number; rSquared: number } | null {
  const sample = lives.filter((v) => v > 0).sort((a, b) => a - b);
  const n = sample.length;
  if (n < 6) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const median = (i + 1 - 0.3) / (n + 0.4);
    xs.push(Math.log(sample[i]));
    ys.push(Math.log(-Math.log(1 - median)));
  }
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
    syy += (ys[i] - meanY) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const beta = sxy / sxx;
  if (!Number.isFinite(beta) || beta <= 0) return null;
  const intercept = meanY - beta * meanX;
  const eta = Math.exp(-intercept / beta);
  const rSquared = (sxy * sxy) / (sxx * syy);
  return { beta, eta, rSquared };
}

function weibullFits(ctx: Context): WeibullFit[] {
  const enginesById = new Map(ctx.data.engines.map((e) => [e.id, e]));
  const livesByMode = new Map<string, number[]>();

  const push = (mode: string, engineId: string) => {
    const engine = enginesById.get(engineId);
    if (!engine) return;
    const list = livesByMode.get(mode) ?? [];
    list.push(engine.cyclesSinceOverhaul);
    livesByMode.set(mode, list);
  };

  for (const alert of ctx.data.alerts) {
    if (alert.state === "false-positive") continue;
    const mode = alert.title.split(" — ")[0];
    if (FAILURE_MODES.some((f) => f.mode === mode)) push(mode, alert.engineId);
  }
  for (const prognostic of ctx.data.prognostics) {
    if (prognostic.probability >= 0.5) push(prognostic.failureMode, prognostic.engineId);
  }

  const fits: WeibullFit[] = [];
  for (const failure of FAILURE_MODES) {
    const lives = livesByMode.get(failure.mode) ?? [];
    const fit = fitWeibull(lives);
    if (!fit) continue;
    const { beta, eta, rSquared } = fit;
    const b10 = eta * Math.pow(-Math.log(0.9), 1 / beta);
    const median = eta * Math.pow(Math.log(2), 1 / beta);
    const curve: WeibullFit["curve"] = [];
    const steps = 36;
    for (let i = 0; i <= steps; i += 1) {
      const cycles = (eta * 2 * i) / steps;
      const reliability = Math.exp(-Math.pow(cycles / eta, beta));
      const hazard = (beta / eta) * Math.pow(Math.max(cycles, 1) / eta, beta - 1);
      curve.push({ cycles: Math.round(cycles), reliability: round(reliability, 4), hazard: round(hazard * 1000, 4) });
    }
    const exposed = ctx.data.engines.filter((e) => e.cyclesSinceOverhaul > b10);
    const survival =
      ctx.data.engines.reduce((s, e) => s + Math.exp(-Math.pow(e.cyclesSinceOverhaul / eta, beta)), 0) /
      Math.max(1, ctx.data.engines.length);
    fits.push({
      id: `weibull-${hashString(failure.mode).toString(36)}`,
      failureMode: failure.mode,
      moduleCode: failure.module,
      beta: round(beta, 2),
      etaCycles: Math.round(eta),
      b10Cycles: Math.round(b10),
      medianLifeCycles: Math.round(median),
      samples: lives.length,
      rSquared: round(rSquared, 3),
      regime: beta < 0.95 ? "infant-mortality" : beta <= 1.15 ? "random" : "wear-out",
      status: survival < 0.6 ? "red" : survival < 0.7 ? "amber" : "green",
      curve,
      enginesPastB10: exposed.length,
      fleetSurvivalPct: round(survival * 100, 1),
    });
  }
  return fits.sort((a, b) => a.fleetSurvivalPct - b.fleetSurvivalPct || b.samples - a.samples);
}

/* ------------------------------------------------------------------ */
/* Scorecard and actions                                               */
/* ------------------------------------------------------------------ */

function scorecardFor(fleet: ReliabilitySegment): ScorecardRow[] {
  return RELIABILITY_METRICS.map((definition) => {
    const measure = fleet.measures[definition.id];
    return {
      id: `scorecard-${definition.id}`,
      label: definition.label,
      sublabel: definition.description,
      metricId: definition.id,
      value: measure.value,
      target: definition.target,
      unit: definition.unit,
      decimals: definition.decimals,
      attainmentPct: measure.attainmentPct,
      status: measure.status,
      trend: measure.trend,
      history: measure.history,
    };
  });
}

function buildActions(
  ctx: Context,
  fleet: ReliabilitySegment,
  families: ReliabilitySegment[],
  operators: ReliabilitySegment[],
  causes: RemovalCause[],
  defects: RecurringDefect[],
  weibull: WeibullFit[],
): ReliabilityAction[] {
  const actions: ReliabilityAction[] = [];

  const worstFamily = [...families].sort(
    (a, b) => a.measures[a.driverMetricId].attainmentPct - b.measures[b.driverMetricId].attainmentPct,
  )[0];
  if (worstFamily && worstFamily.status !== "green") {
    const definition = METRIC_BY_ID.get(worstFamily.driverMetricId)!;
    const engines = ctx.data.engines.filter((e) => e.family === worstFamily.label && e.status !== "green");
    actions.push({
      id: `action-family-${worstFamily.id}`,
      title: `Convene a reliability review for ${worstFamily.label}`,
      rationale: `${definition.label} is ${worstFamily.measures[worstFamily.driverMetricId].value}${definition.unit} against a target of ${definition.target}${definition.unit} across ${worstFamily.engines} engines.`,
      metricId: worstFamily.driverMetricId,
      status: worstFamily.status,
      owner: "Fleet reliability engineering",
      engineIds: engines.slice(0, 12).map((e) => e.id),
      impact: `${engines.length} engines off nominal in this family`,
      href: "/engines",
    });
  }

  const topCause = causes[0];
  if (topCause) {
    actions.push({
      id: `action-cause-${topCause.id}`,
      title: `Launch a fleet campaign for ${topCause.cause.toLowerCase()}`,
      rationale: `${topCause.removals} unscheduled removals (${topCause.sharePct}% of all removals) and $${(topCause.costUsd / 1_000_000).toFixed(1)}m of shop cost trace to this single mode.`,
      metricId: "unscheduled-removal-rate",
      status: topCause.status,
      owner: "Chief engineer — modules",
      engineIds: [],
      impact: `Mean TAT ${topCause.meanTatDays} days per removal`,
      href: "/plan/workscope",
    });
  }

  const criticalMode = weibull.find((w) => w.status === "red") ?? weibull[0];
  if (criticalMode) {
    actions.push({
      id: `action-weibull-${criticalMode.id}`,
      title: `Bring forward inspection for ${criticalMode.failureMode.toLowerCase()}`,
      rationale: `Weibull β=${criticalMode.beta} (${criticalMode.regime.replace("-", " ")}) with characteristic life ${criticalMode.etaCycles.toLocaleString("en-GB")} cycles; predicted survival across the fleet is ${criticalMode.fleetSurvivalPct}% and ${criticalMode.enginesPastB10} engines are past B10 of ${criticalMode.b10Cycles.toLocaleString("en-GB")} cycles.`,
      metricId: "ifsd-rate",
      status: criticalMode.status,
      owner: "Continued airworthiness",
      engineIds: ctx.data.engines
        .filter((e) => e.cyclesSinceOverhaul > criticalMode.b10Cycles)
        .slice(0, 12)
        .map((e) => e.id),
      impact: `${criticalMode.samples} observations, R² ${criticalMode.rSquared}`,
      href: "/predict/risk",
    });
  }

  const worstOperator = [...operators].sort(
    (a, b) => a.measures["dispatch-reliability"].value - b.measures["dispatch-reliability"].value,
  )[0];
  if (worstOperator && worstOperator.measures["dispatch-reliability"].status !== "green") {
    actions.push({
      id: `action-operator-${worstOperator.id}`,
      title: `Brief ${worstOperator.label} on dispatch recovery`,
      rationale: `Dispatch reliability of ${worstOperator.measures["dispatch-reliability"].value}% is below the ${fleet.measures["dispatch-reliability"].target}% commitment on ${worstOperator.engines} covered engines.`,
      metricId: "dispatch-reliability",
      status: worstOperator.measures["dispatch-reliability"].status,
      owner: "Customer business manager",
      engineIds: [],
      impact: `${worstOperator.departures.toLocaleString("en-GB")} departures in the window`,
      href: "/commercial/contracts",
    });
  }

  const worstDefect = defects.find((d) => d.status === "red") ?? defects[0];
  if (worstDefect) {
    actions.push({
      id: `action-defect-${worstDefect.id}`,
      title: `Raise a repeat-defect investigation — ${worstDefect.title.toLowerCase()}`,
      rationale: `${worstDefect.occurrences} occurrences across ${worstDefect.engines} ${worstDefect.family} engines, MTBF ${worstDefect.mtbfHours.toLocaleString("en-GB")} EFH and trending ${worstDefect.trend}.`,
      metricId: "unscheduled-removal-rate",
      status: worstDefect.status,
      owner: "Reliability investigations",
      engineIds: [],
      impact: worstDefect.recommendedAction,
      href: "/alerts",
    });
  }

  const rank: Record<StatusLevel, number> = { red: 0, amber: 1, green: 2, grey: 3 };
  return actions.sort((a, b) => rank[a.status] - rank[b.status]);
}

/* ------------------------------------------------------------------ */
/* Public selector                                                     */
/* ------------------------------------------------------------------ */

let cachedOverview: ReliabilityOverview | null = null;

/** Full reliability picture for the fleet. Computed once and memoised. */
export function getReliabilityOverview(dataset?: Dataset): ReliabilityOverview {
  if (!dataset && cachedOverview) return cachedOverview;
  const data = dataset ?? generateDataset();
  const ctx = buildContext(data);

  const fleet = segmentFor(ctx, {
    id: "fleet",
    kind: "fleet",
    label: "Managed fleet",
    sublabel: `${data.engines.length} engines · ${data.operators.length} operators`,
    engines: data.engines,
  });

  const familyNames = [...new Set(data.engines.map((e) => e.family))].sort();
  const families = familyNames
    .map((family) =>
      segmentFor(ctx, {
        id: `family-${family.replace(/\s+/g, "-").toLowerCase()}`,
        kind: "family",
        label: family,
        sublabel: `${data.engines.filter((e) => e.family === family).length} engines`,
        engines: data.engines.filter((e) => e.family === family),
      }),
    )
    .sort((a, b) => a.measures[a.driverMetricId].attainmentPct - b.measures[b.driverMetricId].attainmentPct);

  const operators = data.operators
    .map((operator) =>
      segmentFor(ctx, {
        id: `operator-${operator.id}`,
        kind: "operator",
        label: operator.name,
        sublabel: `${operator.code} · ${operator.region}`,
        engines: data.engines.filter((e) => e.operatorId === operator.id),
      }),
    )
    .sort((a, b) => a.measures[a.driverMetricId].attainmentPct - b.measures[b.driverMetricId].attainmentPct);

  const causes = removalCauses(ctx);
  const defects = recurringDefects(ctx);
  const weibull = weibullFits(ctx);
  const scorecard = scorecardFor(fleet);
  const actions = buildActions(ctx, fleet, families, operators, causes, defects, weibull);

  const overview: ReliabilityOverview = {
    generatedAt: iso(NOW),
    windowMonths: WINDOW_MONTHS,
    definitions: RELIABILITY_METRICS,
    fleet,
    families,
    operators,
    causes,
    defects,
    weibull,
    scorecard,
    actions,
    evidence: {
      unscheduledRemovals: ctx.removals.length,
      ifsdEvents: data.alerts.filter(isIfsdEvent).length,
      delayEvents: data.alerts.filter(isDelayEvent).length,
      departures: fleet.departures,
      efh: fleet.efh,
      engines: data.engines.length,
    },
  };

  if (!dataset) cachedOverview = overview;
  return overview;
}

/** Pareto of removal causes on its own, for the API and for tests. */
export function getRemovalCauses(): RemovalCause[] {
  return getReliabilityOverview().causes;
}

/** Weibull fits on their own. */
export function getWeibullFits(): WeibullFit[] {
  return getReliabilityOverview().weibull;
}
