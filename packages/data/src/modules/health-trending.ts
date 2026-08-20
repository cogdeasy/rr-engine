/**
 * Selectors for the `health-trending` module.
 *
 * Everything here is derived deterministically from the generated fleet so the
 * API, the web app and tests agree on every number shown on the workbench.
 */

import type {
  Engine,
  EngineFamily,
  FleetBandPoint,
  FleetComparison,
  ParameterId,
  Point,
  Series,
  StatusLevel,
  TrendEngineOption,
  TrendEvent,
  TrendExceedance,
  TrendParameterOption,
  TrendRecommendation,
  TrendSeriesBundle,
  TrendStatistics,
  TrendStepChange,
  TrendingWorkbenchData,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import { engineSeries } from "../generate";
import { getDataset } from "../index";
import { addDays, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

/** The parameters an EHM analyst trends together on a performance review. */
export const TRENDED_PARAMETERS: ParameterId[] = [
  "egtMargin",
  "egt",
  "vibN1",
  "vibN2",
  "vibN3",
  "oilPressure",
  "oilTemp",
  "oilConsumption",
  "fuelFlow",
];

const SHORT_LABELS: Partial<Record<ParameterId, string>> = {
  egtMargin: "EGT margin",
  egt: "TGT / EGT",
  vibN1: "Vib N1",
  vibN2: "Vib N2",
  vibN3: "Vib N3",
  oilPressure: "Oil press.",
  oilTemp: "Oil temp",
  oilConsumption: "Oil cons.",
  fuelFlow: "Fuel flow",
};

export function trendParameterOptions(): TrendParameterOption[] {
  return TRENDED_PARAMETERS.map((id) => {
    const def = PARAMETERS[id];
    const worse = def.direction === "higher-is-worse";
    return {
      id,
      label: def.label,
      shortLabel: SHORT_LABELS[id] ?? def.label,
      unit: def.unit,
      direction: def.direction,
      amberThreshold: worse ? def.amber.min : def.amber.max,
      redThreshold: worse ? def.red.min : def.red.max,
      ataChapter: def.ataChapter,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Utilisation                                                         */
/* ------------------------------------------------------------------ */

/** Block hours an installed engine is assumed to fly per calendar day. */
const DAILY_BLOCK_HOURS = 11;

/**
 * Sectors per day, derived from the engine's own hours-per-cycle ratio.
 *
 * The flight log is a sample rather than a complete record, so utilisation is
 * taken from lifetime hours/cycles against an assumed daily block-hour figure;
 * an off-wing engine flies nothing but keeps its historic ratio for projection.
 */
export function cyclesPerDay(engine: Engine): number {
  const data = getDataset();
  const hoursPerCycle = engine.totalFlightCycles > 0 ? engine.totalFlightHours / engine.totalFlightCycles : 6;
  const sectors = engine.aircraftId
    ? data.flights.filter((f) => f.aircraftId === engine.aircraftId).length
    : 0;
  /** Aircraft flying more sampled sectors are the harder-worked tails. */
  const intensity = sectors > 0 ? 0.85 + Math.min(sectors, 18) / 60 : 1;
  const perDay = (DAILY_BLOCK_HOURS * intensity) / Math.max(hoursPerCycle, 1);
  return round(Math.min(Math.max(perDay, 0.4), 5), 2);
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function linearFit(points: Point[]) {
  const t0 = new Date(points[0]!.t).getTime();
  const xs = points.map((p) => (new Date(p.t).getTime() - t0) / 86400000);
  const ys = points.map((p) => p.v);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const rSquared = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const residualSigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  return { slope, intercept, rSquared, residualSigma };
}

function detectStepChange(points: Point[], residualSigma: number, events: TrendEvent[]): TrendStepChange | null {
  const w = 5;
  if (points.length < w * 2 + 1) return null;
  let best: { index: number; magnitude: number; beforeMean: number; afterMean: number } | null = null;
  for (let i = w; i <= points.length - w; i += 1) {
    const before = points.slice(i - w, i);
    const after = points.slice(i, i + w);
    const beforeMean = before.reduce((s, p) => s + p.v, 0) / before.length;
    const afterMean = after.reduce((s, p) => s + p.v, 0) / after.length;
    const magnitude = afterMean - beforeMean;
    if (!best || Math.abs(magnitude) > Math.abs(best.magnitude)) {
      best = { index: i, magnitude, beforeMean, afterMean };
    }
  }
  if (!best) return null;
  const at = points[best.index]!.t;
  const sigmaRatio = residualSigma === 0 ? 0 : Math.abs(best.magnitude) / residualSigma;
  const attributedTo = events.find((e) => Math.abs(new Date(e.at).getTime() - new Date(at).getTime()) <= 10 * 86400000 && e.kind !== "alert");
  return {
    at,
    magnitude: round(best.magnitude, 3),
    beforeMean: round(best.beforeMean, 2),
    afterMean: round(best.afterMean, 2),
    sigmaRatio: round(sigmaRatio, 2),
    significant: sigmaRatio >= 2.5,
    attributedTo,
  };
}

function exceedanceRegions(points: Point[], amber: number, red: number, worse: boolean): TrendExceedance[] {
  const level = (v: number): "amber" | "red" | null => {
    if (worse) return v >= red ? "red" : v >= amber ? "amber" : null;
    return v <= red ? "red" : v <= amber ? "amber" : null;
  };
  const out: TrendExceedance[] = [];
  let open: TrendExceedance | null = null;
  for (const point of points) {
    const l = level(point.v);
    if (l === null) {
      if (open) {
        out.push(open);
        open = null;
      }
      continue;
    }
    if (!open || open.level !== l) {
      if (open) out.push(open);
      open = { from: point.t, to: point.t, level: l, peak: point.v };
    } else {
      open.to = point.t;
      open.peak = worse ? Math.max(open.peak, point.v) : Math.min(open.peak, point.v);
    }
  }
  if (open) out.push(open);
  return out.map((e) => ({ ...e, peak: round(e.peak, 2) }));
}

function daysToLevel(current: number, slopePerDay: number, threshold: number, worse: boolean): number | null {
  const remaining = worse ? threshold - current : current - threshold;
  if (remaining <= 0) return 0;
  const closing = worse ? slopePerDay : -slopePerDay;
  if (closing <= 0.000001) return null;
  return Math.round(remaining / closing);
}

export function trendStatistics(engine: Engine, parameter: ParameterId, series: Series, events: TrendEvent[]): TrendStatistics {
  const def = PARAMETERS[parameter];
  const worse = def.direction === "higher-is-worse";
  const amber = worse ? def.amber.min : def.amber.max;
  const red = worse ? def.red.min : def.red.max;
  const points = series.points;
  const current = points[points.length - 1]!.v;
  const baseline = points[0]!.v;
  const { slope, rSquared, residualSigma } = linearFit(points);
  const cpd = cyclesPerDay(engine);
  const daysToAmber = daysToLevel(current, slope, amber, worse);
  const daysToRed = daysToLevel(current, slope, red, worse);
  const exceedances = exceedanceRegions(points, amber, red, worse);
  const breachingRed = worse ? current >= red : current <= red;
  const breachingAmber = worse ? current >= amber : current <= amber;

  let status: StatusLevel;
  let statusReason: string;
  if (breachingRed) {
    status = "red";
    statusReason = `Current ${current}${def.unit} is beyond the red limit of ${red}${def.unit}.`;
  } else if (daysToRed !== null && daysToRed <= 60) {
    status = "red";
    statusReason = `Projected to cross the red limit in ${daysToRed} days at the current rate.`;
  } else if (breachingAmber) {
    status = "amber";
    statusReason = `Current ${current}${def.unit} is beyond the amber limit of ${amber}${def.unit}.`;
  } else if (daysToAmber !== null && daysToAmber <= 120) {
    status = "amber";
    statusReason = `Projected to cross the amber limit in ${daysToAmber} days at the current rate.`;
  } else {
    status = "green";
    statusReason =
      daysToAmber === null
        ? "Trend is stable or improving; no threshold crossing projected."
        : `Amber limit is ${daysToAmber} days away at the current rate.`;
  }

  return {
    engineId: engine.id,
    parameter,
    unit: def.unit,
    direction: def.direction,
    current,
    baseline,
    deltaFromBaseline: round(current - baseline, 2),
    deltaFromBaselinePct: baseline === 0 ? 0 : round(((current - baseline) / Math.abs(baseline)) * 100, 1),
    slopePerDay: round(slope, 4),
    slopePer100Cycles: round((slope / cpd) * 100, 2),
    cyclesPerDay: cpd,
    rSquared: round(rSquared, 3),
    residualSigma: round(residualSigma, 3),
    amberThreshold: amber,
    redThreshold: red,
    daysToAmber,
    daysToRed,
    cyclesToAmber: daysToAmber === null ? null : Math.round(daysToAmber * cpd),
    cyclesToRed: daysToRed === null ? null : Math.round(daysToRed * cpd),
    projectedAmberAt: daysToAmber === null ? null : iso(addDays(NOW, daysToAmber)),
    projectedRedAt: daysToRed === null ? null : iso(addDays(NOW, daysToRed)),
    status,
    statusReason,
    stepChange: detectStepChange(points, residualSigma, events),
    exceedances,
  };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** Maintenance and alert events overlaid on the trend charts. */
export function engineTrendEvents(engine: Engine, windowDays = 180): TrendEvent[] {
  const data = getDataset();
  const from = daysAgo(windowDays).getTime();
  const inWindow = (at: string) => {
    const t = new Date(at).getTime();
    return t >= from && t <= NOW.getTime();
  };
  const out: TrendEvent[] = [];

  // On-wing compressor water washes are planned on a recurring interval that
  // varies by environmental severity; harsher routes wash more often.
  const rng = createRng(`${engine.id}:water-wash`);
  const intervalDays = 120 - engine.environmentSeverity * 12;
  let offset = rand.int(rng, 5, Math.max(10, intervalDays));
  while (offset < windowDays) {
    const at = daysAgo(windowDays - offset);
    out.push({
      id: `${engine.id}-ww-${offset}`,
      engineId: engine.id,
      kind: "water-wash",
      at: iso(at),
      label: "Water wash",
      detail: `On-wing compressor wash — severity ${engine.environmentSeverity}/5 route profile`,
      parameter: "egtMargin",
    });
    offset += intervalDays;
  }

  for (const wo of data.workOrders.filter((w) => w.engineId === engine.id)) {
    const at = wo.actualStart ?? wo.scheduledStart;
    if (!inWindow(at)) continue;
    if (wo.type === "shop-visit") {
      out.push({
        id: `${engine.id}-sv-${wo.id}`,
        engineId: engine.id,
        kind: "shop-visit",
        at,
        label: "Shop visit",
        detail: `${wo.reference} — ${wo.tatDays} day turnaround at ${wo.facilityId}`,
      });
    } else if (wo.type === "module-swap") {
      out.push({
        id: `${engine.id}-ms-${wo.id}`,
        engineId: engine.id,
        kind: "module-change",
        at,
        label: "Module change",
        detail: `${wo.reference} — module replacement`,
      });
    } else if (wo.type === "borescope") {
      out.push({
        id: `${engine.id}-bs-${wo.id}`,
        engineId: engine.id,
        kind: "borescope",
        at,
        label: "Borescope",
        detail: `${wo.reference} — borescope inspection`,
      });
    }
  }

  for (const alert of data.alerts.filter((a) => a.engineId === engine.id)) {
    if (!inWindow(alert.raisedAt)) continue;
    out.push({
      id: `${engine.id}-al-${alert.id}`,
      engineId: engine.id,
      kind: "alert",
      at: alert.raisedAt,
      label: alert.severity === "critical" || alert.severity === "high" ? "Alert raised" : "Advisory",
      detail: alert.title,
      parameter: alert.parameter,
    });
  }

  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Series & fleet comparison                                           */
/* ------------------------------------------------------------------ */

export function engineTrendBundle(engine: Engine, parameter: ParameterId, windowDays = 180): TrendSeriesBundle {
  const series = engineSeries(engine, parameter, windowDays);
  const events = engineTrendEvents(engine, windowDays);
  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    parameter,
    series,
    statistics: trendStatistics(engine, parameter, series, events),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

/** Median and p10–p90 band for a family, sampled on the same grid as the engine series. */
export function fleetBand(family: EngineFamily, parameter: ParameterId, windowDays = 180, sampleSize = 18): FleetComparison {
  const engines = getDataset().engines.filter((e) => e.family === family);
  const rng = createRng(`${family}:${parameter}:band`);
  const sample = engines.length <= sampleSize ? engines : rand.sample(rng, engines, sampleSize);
  const seriesList = sample.map((engine) => engineSeries(engine, parameter, windowDays));
  const reference = seriesList[0];
  const points: FleetBandPoint[] = [];
  if (reference) {
    for (let i = 0; i < reference.points.length; i += 1) {
      const values = seriesList.map((s) => s.points[i]?.v).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      points.push({
        t: reference.points[i]!.t,
        median: round(percentile(values, 0.5), 2),
        p10: round(percentile(values, 0.1), 2),
        p90: round(percentile(values, 0.9), 2),
      });
    }
  }
  return { family, parameter, sampleSize: sample.length, points };
}

/** Where the engine's EGT-margin decay rate sits within its family, 0 = slowest decay. */
export function decayPercentile(engine: Engine, engines: Engine[] = getDataset().engines): number {
  const family = engines.filter((e) => e.family === engine.family);
  const rate = (e: Engine) => {
    const series = engineSeries(e, "egtMargin", 90);
    return linearFit(series.points).slope;
  };
  const own = rate(engine);
  // Lower (more negative) slope = faster margin loss = higher percentile.
  const worse = family.filter((e) => rate(e) < own).length;
  return Math.round((worse / Math.max(1, family.length)) * 100);
}

/* ------------------------------------------------------------------ */
/* Workbench assembly                                                  */
/* ------------------------------------------------------------------ */

function recommendationFor(bundle: TrendSeriesBundle): TrendRecommendation | null {
  const s = bundle.statistics;
  if (s.status === "green") return null;
  const label = SHORT_LABELS[bundle.parameter] ?? PARAMETERS[bundle.parameter].label;
  const cyclesAvailable = s.status === "red" ? s.cyclesToRed : s.cyclesToAmber;
  const action =
    bundle.parameter === "egtMargin"
      ? s.status === "red"
        ? "Raise a removal planning case and book a shop visit slot"
        : "Schedule an on-wing water wash and re-baseline performance"
      : bundle.parameter.startsWith("vib")
        ? s.status === "red"
          ? "Ground pending vibration survey and trim balance"
          : "Book a trim balance at the next line opportunity"
        : bundle.parameter.startsWith("oil")
          ? s.status === "red"
            ? "Send an oil sample for laboratory analysis before next despatch"
            : "Increase oil sampling to every 25 flight hours"
          : s.status === "red"
            ? "Raise a work order for performance investigation"
            : "Increase EHM sampling rate and monitor for a further 25 cycles";
  return {
    engineId: bundle.engineId,
    esn: bundle.esn,
    parameter: bundle.parameter,
    status: s.status,
    headline: `${bundle.esn} — ${label} ${s.status === "red" ? "beyond limit" : "on watchlist"}`,
    action,
    cyclesAvailable,
    reason: s.statusReason,
  };
}

export function trendEngineOptions(limit = 14): TrendEngineOption[] {
  const data = getDataset();
  const candidates = [...data.engines]
    .sort((a, b) => a.healthScore - b.healthScore || a.egtMargin - b.egtMargin)
    .slice(0, limit);
  return candidates.map((engine) => {
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    return {
      id: engine.id,
      esn: engine.esn,
      family: engine.family,
      buildStandard: engine.buildStandard,
      operator: operator?.name ?? "Unassigned",
      operatorCode: operator?.code ?? "--",
      tail: aircraft?.tail ?? null,
      status: engine.status,
      egtMargin: engine.egtMargin,
      healthScore: engine.healthScore,
      cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
      decayPercentile: decayPercentile(engine, data.engines),
    };
  });
}

/**
 * Everything the trending workbench renders: a candidate engine set, every
 * trended parameter for each of them, the events that explain the shapes, and
 * the same-family fleet bands used by compare mode.
 */
export function trendingWorkbenchData(windowDays = 180, engineLimit = 14): TrendingWorkbenchData {
  const data = getDataset();
  const engines = trendEngineOptions(engineLimit);
  const engineById = new Map(data.engines.map((e) => [e.id, e]));
  const bundles: TrendSeriesBundle[] = [];
  const events: TrendEvent[] = [];

  for (const option of engines) {
    const engine = engineById.get(option.id)!;
    events.push(...engineTrendEvents(engine, windowDays));
    for (const parameter of TRENDED_PARAMETERS) {
      bundles.push(engineTrendBundle(engine, parameter, windowDays));
    }
  }

  const families = [...new Set(engines.map((e) => e.family))];
  const fleetBands: FleetComparison[] = [];
  for (const family of families) {
    for (const parameter of TRENDED_PARAMETERS) {
      fleetBands.push(fleetBand(family, parameter, windowDays));
    }
  }

  const recommendations = bundles
    .map(recommendationFor)
    .filter((r): r is TrendRecommendation => r !== null)
    .sort((a, b) => {
      const rank = (s: StatusLevel) => (s === "red" ? 2 : s === "amber" ? 1 : 0);
      if (rank(b.status) !== rank(a.status)) return rank(b.status) - rank(a.status);
      return (a.cyclesAvailable ?? Number.MAX_SAFE_INTEGER) - (b.cyclesAvailable ?? Number.MAX_SAFE_INTEGER);
    });

  return {
    windowDays,
    generatedAt: iso(NOW),
    parameters: trendParameterOptions(),
    engines,
    bundles,
    events,
    fleetBands,
    recommendations,
  };
}
