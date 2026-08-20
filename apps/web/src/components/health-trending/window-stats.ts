import type { Point, TrendEvent, TrendExceedance, TrendStatistics, TrendStepChange } from "@rr/types";

/**
 * Refits the trend statistics of a bundle over a narrower slice of its samples.
 *
 * The server computes statistics over the full generated window; when the operator narrows the
 * window buttons or drags the chart brush the slope, projections, step change and exceedances all
 * have to be recomputed over what is on screen, otherwise the panel contradicts the chart. The
 * limits, unit, direction and utilisation are properties of the engine/parameter and are carried
 * over from the server-computed statistics.
 */
export function windowStatistics(
  base: TrendStatistics,
  points: Point[],
  events: TrendEvent[],
  now: string,
): TrendStatistics {
  if (points.length < 3) return base;

  const worse = base.direction === "higher-is-worse";
  const amber = base.amberThreshold;
  const red = base.redThreshold;
  const unit = base.unit;
  const cpd = base.cyclesPerDay;

  const current = points[points.length - 1]!.v;
  const baseline = points[0]!.v;
  const { slope, rSquared, residualSigma } = linearFit(points);
  const daysToAmber = daysToLevel(current, slope, amber, worse);
  const daysToRed = daysToLevel(current, slope, red, worse);
  const breachingRed = worse ? current >= red : current <= red;
  const breachingAmber = worse ? current >= amber : current <= amber;

  let status: TrendStatistics["status"];
  let statusReason: string;
  if (breachingRed) {
    status = "red";
    statusReason = `Current ${round(current, 2)}${unit} is beyond the red limit of ${red}${unit}.`;
  } else if (daysToRed !== null && daysToRed <= 60) {
    status = "red";
    statusReason = `Projected to cross the red limit in ${daysToRed} days at the current rate.`;
  } else if (breachingAmber) {
    status = "amber";
    statusReason = `Current ${round(current, 2)}${unit} is beyond the amber limit of ${amber}${unit}.`;
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
    ...base,
    current,
    baseline,
    deltaFromBaseline: round(current - baseline, 2),
    deltaFromBaselinePct: baseline === 0 ? 0 : round(((current - baseline) / Math.abs(baseline)) * 100, 1),
    slopePerDay: round(slope, 4),
    slopePer100Cycles: round((slope / cpd) * 100, 2),
    rSquared: round(rSquared, 3),
    residualSigma: round(residualSigma, 3),
    daysToAmber,
    daysToRed,
    cyclesToAmber: daysToAmber === null ? null : Math.round(daysToAmber * cpd),
    cyclesToRed: daysToRed === null ? null : Math.round(daysToRed * cpd),
    projectedAmberAt: daysToAmber === null ? null : addDays(now, daysToAmber),
    projectedRedAt: daysToRed === null ? null : addDays(now, daysToRed),
    status,
    statusReason,
    stepChange: detectStepChange(points, residualSigma, events),
    exceedances: exceedanceRegions(points, amber, red, worse),
  };
}

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

function addDays(from: string, days: number): string {
  return new Date(new Date(from).getTime() + days * 86400000).toISOString();
}

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
  const attributedTo = events.find(
    (e) => e.kind !== "alert" && Math.abs(new Date(e.at).getTime() - new Date(at).getTime()) <= 10 * 86400000,
  );
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
