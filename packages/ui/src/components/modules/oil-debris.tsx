import * as React from "react";
import type { Point, Series } from "@rr/types";
import { cn } from "../../utils";

/**
 * Correlation chart for the oil & debris module.
 *
 * Oil consumption, shaft vibration and EGT margin are plotted against a single
 * time axis, each normalised to its own range, with debris indications drawn as
 * columns underneath. A step change in consumption that lines up with debris and
 * rising vibration is the bearing-distress signature engineers look for.
 */

const TRACES = [
  { key: "consumption", colour: "#6a63ff", label: "Oil consumption" },
  { key: "vibration", colour: "#35c8ff", label: "Vibration N3" },
  { key: "egtMargin", colour: "#b07cff", label: "EGT margin" },
] as const;

type TraceKey = (typeof TRACES)[number]["key"];

function extent(points: Point[]): [number, number] {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export interface OilCorrelationChartProps {
  consumption: Series;
  vibration: Series;
  egtMargin: Series;
  debris: Point[];
  stepChangeAt?: string | null;
  height?: number;
  className?: string;
}

export function OilCorrelationChart({
  consumption,
  vibration,
  egtMargin,
  debris,
  stepChangeAt,
  height = 260,
  className,
}: OilCorrelationChartProps) {
  const width = 960;
  const debrisBand = 46;
  const plotHeight = height - debrisBand;
  const seriesByKey: Record<TraceKey, Series> = { consumption, vibration, egtMargin };

  const times = consumption.points.map((p) => new Date(p.t).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const toX = (t: string) => ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * width;

  const paths = TRACES.map((trace) => {
    const series = seriesByKey[trace.key];
    const [min, max] = extent(series.points);
    const toY = (v: number) => plotHeight - ((v - min) / (max - min)) * (plotHeight - 12) - 6;
    const d = series.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t).toFixed(2)},${toY(p.v).toFixed(2)}`)
      .join(" ");
    return { ...trace, d, latest: series.points[series.points.length - 1]!, unit: series.unit };
  });

  const maxDebris = Math.max(1, ...debris.map((p) => p.v));
  const stepX = stepChangeAt ? toX(stepChangeAt) : null;

  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {paths.map((trace) => (
          <span key={trace.key} className="inline-flex items-baseline gap-2 text-[11px] text-rr-slate">
            <span className="inline-block h-0.5 w-5 rounded-full" style={{ backgroundColor: trace.colour }} aria-hidden />
            <span className="rr-label">{trace.label}</span>
            <span className="rr-numeric font-semibold text-rr-ink">
              {trace.latest.v} {trace.unit}
            </span>
          </span>
        ))}
        <span className="inline-flex items-baseline gap-2 text-[11px] text-rr-slate">
          <span className="inline-block h-2.5 w-1.5 rounded-sm bg-status-amber" aria-hidden />
          <span className="rr-label">Debris indications</span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Oil consumption, vibration and EGT margin against a common timeline with debris indications"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={plotHeight * f} y2={plotHeight * f} stroke="#e7eaf8" strokeOpacity={0.132} strokeWidth={1} />
        ))}
        <line x1={0} x2={width} y1={plotHeight} y2={plotHeight} stroke="#e7eaf8" strokeOpacity={0.264} strokeWidth={1} />

        {stepX !== null ? (
          <g>
            <rect x={stepX} y={0} width={Math.max(0, width - stepX)} height={plotHeight} fill="#ff5f6d" opacity={0.045} />
            <line x1={stepX} x2={stepX} y1={0} y2={height} stroke="#ff5f6d" strokeWidth={1.4} strokeDasharray="5 4" />
          </g>
        ) : null}

        {paths.map((trace) => (
          <path
            key={trace.key}
            d={trace.d}
            fill="none"
            stroke={trace.colour}
            strokeWidth={trace.key === "consumption" ? 2.2 : 1.5}
            strokeOpacity={trace.key === "consumption" ? 1 : 0.75}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {debris.map((point, i) => {
          const barHeight = Math.max(3, (point.v / maxDebris) * (debrisBand - 14));
          return (
            <rect
              key={`${point.t}-${i}`}
              x={Math.min(width - 3, Math.max(0, toX(point.t) - 1.5))}
              y={height - barHeight}
              width={3}
              height={barHeight}
              fill={point.v >= maxDebris * 0.6 ? "#ff5f6d" : "#ffb43d"}
              rx={1}
            />
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[11px] text-rr-slate">
        <span>{new Date(t0).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</span>
        {stepChangeAt ? (
          <span className="text-status-red">
            Step change {new Date(stepChangeAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
          </span>
        ) : (
          <span>No step change detected</span>
        )}
        <span>{new Date(t1).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</span>
      </div>
    </figure>
  );
}
