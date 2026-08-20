import * as React from "react";
import type { CostBridgeStep, CostForecastPoint, CostMonth, StatusLevel } from "@rr/types";
import { cn } from "../../utils";

/**
 * Cost analytics visuals. Plain SVG so they render on the server with no
 * client bundle: a bridge (waterfall) that explains the movement in unit cost,
 * a forecast band against plan, and a category mix bar.
 */

const STATUS_FILL: Record<StatusLevel, string> = {
  red: "#ff5f6d",
  amber: "#ffb43d",
  green: "#2fd39b",
  grey: "#8f96bb",
};

const RR_BLUE = "#6a63ff";

export const COST_CATEGORY_FILL: Record<string, string> = {
  labour: "#6a63ff",
  materials: "#3f37c9",
  llp: "#6b74d8",
  transport: "#9aa1e6",
  penalties: "#b07cff",
};

function money(value: number, dp = 0): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/* ------------------------------------------------------------------ */
/* Bridge                                                              */
/* ------------------------------------------------------------------ */

/**
 * Waterfall from the prior period unit cost to the current one. A rising step
 * is adverse; it is amber on the watchlist and red once it moves unit cost by
 * more than the red tolerance on its own.
 */
export function CostBridgeChart({
  steps,
  redStepPct = 2,
  height = 260,
  className,
}: {
  steps: CostBridgeStep[];
  /** A single step moving unit cost by more than this share is act-now red. */
  redStepPct?: number;
  height?: number;
  className?: string;
}) {
  if (steps.length === 0) return null;
  const opening = steps[0]!.value;
  /* The scale zooms to the movement, so a two-dollar step is still readable. */
  const values = steps.flatMap((step) => (step.kind === "delta" ? [step.start, step.end] : [step.end]));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || max * 0.1 || 1;
  const top = max + range * 0.35;
  const floor = Math.max(0, min - range * 0.8);
  const span = top - floor || 1;

  const width = 760;
  const plot = height - 34;
  const slot = width / steps.length;
  const barWidth = Math.min(72, slot * 0.56);
  const y = (value: number) => plot - ((value - floor) / span) * plot;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Cost per engine flight hour bridge">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={width} y1={plot * f} y2={plot * f} stroke="#e7eaf8" strokeOpacity={0.154} strokeWidth={1} />
        ))}
        {steps.map((step, index) => {
          const centre = slot * index + slot / 2;
          const x = centre - barWidth / 2;
          const isTotal = step.kind !== "delta";
          const negligible = Math.abs(step.value) < 0.05;
          const adverse = step.value >= 0;
          const material = Math.abs(step.value) >= (opening * redStepPct) / 100;
          const fill = isTotal
            ? RR_BLUE
            : negligible
              ? STATUS_FILL.grey
              : adverse
                ? material
                  ? STATUS_FILL.red
                  : STATUS_FILL.amber
                : STATUS_FILL.green;
          const barTop = isTotal ? y(step.end) : y(Math.max(step.start, step.end));
          const barBottom = isTotal ? plot : y(Math.min(step.start, step.end));
          const barHeight = Math.max(2, barBottom - barTop);
          const previous = steps[index - 1];
          return (
            <g key={step.id}>
              {previous ? (
                <line
                  x1={slot * (index - 1) + slot / 2 + barWidth / 2}
                  x2={x}
                  y1={y(previous.end)}
                  y2={y(previous.end)}
                  stroke="#e7eaf8"
                  strokeOpacity={0.25}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              ) : null}
              <rect x={x} y={barTop} width={barWidth} height={barHeight} fill={fill} fillOpacity={isTotal ? 1 : 0.9} rx={1} />
              <text
                x={centre}
                y={barTop - 8}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={isTotal ? "#e7eaf8" : fill}
                className="rr-numeric"
              >
                {isTotal
                  ? money(step.value, 0)
                  : negligible
                    ? "0.0"
                    : `${step.value >= 0 ? "+" : ""}${money(step.value, 1)}`}
              </text>
              <text x={centre} y={plot + 16} textAnchor="middle" fontSize={10.5} fill="#4b5068">
                {step.label.length > 18 ? `${step.label.slice(0, 17)}…` : step.label}
              </text>
              <text x={centre} y={plot + 29} textAnchor="middle" fontSize={9.5} fill="#8f96bb">
                {isTotal ? "USD/EFH" : step.category ? "category" : "volume"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast                                                            */
/* ------------------------------------------------------------------ */

/** Actuals then a 12-month forecast band, both read against the plan line. */
export function CostForecastChart({
  history,
  forecast,
  height = 250,
  className,
}: {
  history: CostMonth[];
  forecast: CostForecastPoint[];
  height?: number;
  className?: string;
}) {
  if (forecast.length === 0) return null;
  const budget = forecast[0]!.budgetPerEfh;
  const series = [
    ...history.map((month) => ({ label: month.label, value: month.costPerEfh, low: month.costPerEfh, high: month.costPerEfh, actual: true })),
    ...forecast.map((point) => ({ label: point.label, value: point.costPerEfh, low: point.low, high: point.high, actual: false })),
  ];
  const values = series.flatMap((p) => [p.low, p.high]).concat(budget);
  const max = Math.max(...values) * 1.04;
  const min = Math.min(...values) * 0.94;
  const width = 760;
  const plot = height - 26;
  const x = (i: number) => (i / (series.length - 1)) * width;
  const y = (v: number) => plot - ((v - min) / (max - min || 1)) * plot;

  const actualPath = series
    .filter((p) => p.actual)
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const firstForecast = history.length - 1;
  const forecastPath = series
    .slice(firstForecast)
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(firstForecast + i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const band = `${series
    .slice(firstForecast)
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(firstForecast + i).toFixed(1)},${y(p.high).toFixed(1)}`)
    .join(" ")} ${series
    .slice(firstForecast)
    .reverse()
    .map((p, i) => `L${x(series.length - 1 - i).toFixed(1)},${y(p.low).toFixed(1)}`)
    .join(" ")} Z`;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Unit cost forecast against plan">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={plot * f} y2={plot * f} stroke="#e7eaf8" strokeOpacity={0.132} strokeWidth={1} />
        ))}
        <path d={band} fill={RR_BLUE} fillOpacity={0.1} />
        <line x1={0} x2={width} y1={y(budget)} y2={y(budget)} stroke="#2fd39b" strokeDasharray="6 4" strokeWidth={1.4} />
        <text x={6} y={y(budget) - 6} fontSize={10} fill="#2fd39b" className="rr-numeric">
          PLAN {money(budget, 0)} USD/EFH
        </text>
        <path d={actualPath} fill="none" stroke={RR_BLUE} strokeWidth={2} />
        <path d={forecastPath} fill="none" stroke={RR_BLUE} strokeWidth={2} strokeDasharray="5 4" />
        {series.map((point, index) =>
          point.actual || point.value < budget ? null : (
            <circle key={point.label} cx={x(index)} cy={y(point.value)} r={2.6} fill={STATUS_FILL.red} />
          ),
        )}
        {series.map((point, index) =>
          index % 3 === 0 ? (
            <text key={`l-${point.label}`} x={x(index)} y={plot + 17} textAnchor="middle" fontSize={10} fill="#8f96bb">
              {point.label}
            </text>
          ) : null,
        )}
        <line x1={x(firstForecast)} x2={x(firstForecast)} y1={0} y2={plot} stroke="#e7eaf8" strokeOpacity={0.396} strokeWidth={1} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mix                                                                 */
/* ------------------------------------------------------------------ */

/** Stacked share-of-spend bar with a legend that carries the money. */
export function CostMixBar({
  segments,
  className,
}: {
  segments: { id: string; label: string; valueUsd: number; perEfh: number; deltaPct: number }[];
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.valueUsd, 0) || 1;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="h-full"
            style={{ width: `${(segment.valueUsd / total) * 100}%`, backgroundColor: COST_CATEGORY_FILL[segment.id] ?? RR_BLUE }}
            title={`${segment.label} ${((segment.valueUsd / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="space-y-2">
        {segments.map((segment) => (
          <li key={segment.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-rr-slate">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COST_CATEGORY_FILL[segment.id] ?? RR_BLUE }}
                aria-hidden
              />
              {segment.label}
            </span>
            <span className="flex items-center gap-3">
              <span className="rr-numeric font-semibold text-rr-ink">{money(segment.perEfh, 1)}</span>
              <span className="rr-numeric w-14 text-right text-rr-slate">{((segment.valueUsd / total) * 100).toFixed(1)}%</span>
              <span
                className={cn(
                  "rr-numeric w-14 text-right font-semibold",
                  segment.deltaPct > 4 ? "text-status-red" : segment.deltaPct > 0 ? "text-status-amber" : "text-status-green",
                )}
              >
                {segment.deltaPct >= 0 ? "+" : ""}
                {segment.deltaPct.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
