import * as React from "react";
import type { Point } from "@rr/types";
import { cn } from "../../utils";

/**
 * Charts contributed by the What-if simulation module.
 *
 * They are dependency-free SVG like the rest of the design system, so they
 * render identically on the server and inside the client-side simulator.
 */

const CHART_WIDTH = 640;

function extent(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.14 || Math.abs(max) * 0.1 || 1;
  return { min: min - pad, max: max + pad };
}

function path(points: Point[], toX: (i: number) => number, toY: (v: number) => number) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(2)},${toY(p.v).toFixed(2)}`).join(" ");
}

/**
 * Baseline versus scenario EGT margin projection with the removal limit drawn
 * in: the single chart that answers "does this profile stay legal?".
 */
export function ScenarioProjectionChart({
  baseline,
  scenario,
  limit,
  unit = "°C",
  height = 208,
  className,
}: {
  baseline: Point[];
  scenario: Point[];
  limit: number;
  unit?: string;
  height?: number;
  className?: string;
}) {
  if (baseline.length < 2 || scenario.length < 2) return null;
  const { min, max } = extent([...baseline, ...scenario].map((p) => p.v).concat(limit));
  const toY = (v: number) => height - ((v - min) / (max - min)) * height;
  const toXFactory = (points: Point[]) => (i: number) => (i / (points.length - 1)) * CHART_WIDTH;
  const scenarioPath = path(scenario, toXFactory(scenario), toY);
  const baselinePath = path(baseline, toXFactory(baseline), toY);
  const end = scenario[scenario.length - 1]!;
  const breached = end.v < limit;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="EGT margin projection, baseline against scenario"
      >
        <defs>
          <linearGradient id="rr-sim-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10069f" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10069f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={CHART_WIDTH} y1={height * f} y2={height * f} stroke="#05061f" strokeOpacity={0.06} />
        ))}
        {limit > min && limit < max ? (
          <>
            <rect x={0} y={toY(limit)} width={CHART_WIDTH} height={Math.max(0, height - toY(limit))} fill="#d81e2b" fillOpacity={0.07} />
            <line x1={0} x2={CHART_WIDTH} y1={toY(limit)} y2={toY(limit)} stroke="#d81e2b" strokeDasharray="6 4" strokeWidth={1.2} />
          </>
        ) : null}
        <path d={`${scenarioPath} L${CHART_WIDTH},${height} L0,${height} Z`} fill="url(#rr-sim-fill)" />
        <path d={baselinePath} fill="none" stroke="#6b7089" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <path
          d={scenarioPath}
          fill="none"
          stroke={breached ? "#d81e2b" : "#10069f"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-rr-slate">
        <span className="inline-flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-rr-blue" aria-hidden />
            Scenario
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-status-grey" aria-hidden />
            Baseline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-status-red" aria-hidden />
            Removal limit {limit}
            {unit}
          </span>
        </span>
        <span className={cn("rr-numeric font-semibold", breached ? "text-status-red" : "text-rr-ink")}>
          {end.v}
          {unit} at removal
        </span>
      </div>
    </div>
  );
}

export interface SensitivityBarItem {
  id: string;
  label: string;
  /** Bar length, in the same unit for every item. */
  value: number;
  share: number;
  lowSetting: string;
  highSetting: string;
  caption: string;
}

/** Horizontal tornado bars ranking which lever moves the outcome most. */
export function SensitivityBars({
  items,
  formatValue,
  className,
}: {
  items: SensitivityBarItem[];
  formatValue: (value: number) => string;
  className?: string;
}) {
  const peak = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium text-rr-ink">
              {index === 0 ? <span className="rr-label mr-2 text-rr-blue">Dominant</span> : null}
              {item.label}
            </span>
            <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatValue(item.value)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rr-mist">
            <div
              className={cn("h-full rounded-full", index === 0 ? "bg-rr-blue" : "bg-rr-blue-400/70")}
              style={{ width: `${Math.max(2, (item.value / peak) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-rr-slate">
            {item.lowSetting} → {item.highSetting} · {item.caption} · {Math.round(item.share * 100)}% of total swing
          </p>
        </li>
      ))}
    </ul>
  );
}

export interface CostSegment {
  id: string;
  label: string;
  value: number;
}

const COST_COLOURS = ["#10069f", "#3b32c2", "#00a3d3", "#7b4bd8", "#6b7089"];

/** Stacked breakdown of where the money in a scenario goes. */
export function CostStack({ segments, formatValue, className }: { segments: CostSegment[]; formatValue: (v: number) => string; className?: string }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-rr-mist">
        {segments.map((segment, i) => (
          <div
            key={segment.id}
            style={{ width: `${(Math.max(0, segment.value) / total) * 100}%`, backgroundColor: COST_COLOURS[i % COST_COLOURS.length] }}
            title={`${segment.label}: ${formatValue(segment.value)}`}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 xl:grid-cols-3">
        {segments.map((segment, i) => (
          <div key={segment.id} className="flex items-center justify-between gap-2">
            <dt className="inline-flex items-center gap-2 text-[11px] text-rr-slate">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: COST_COLOURS[i % COST_COLOURS.length] }}
                aria-hidden
              />
              {segment.label}
            </dt>
            <dd className="rr-numeric text-[11px] font-semibold text-rr-ink">{formatValue(segment.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
