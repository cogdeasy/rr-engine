"use client";

import * as React from "react";
import type { HotSectionMarginCurve } from "@rr/types";

/**
 * EGT margin deterioration curve for one engine, plotted against cycles since
 * overhaul so the family band can be overlaid on the same axis.
 *
 * Blue = this engine's observed margin (with water-wash recoveries marked),
 * dashed red = the projection at the current deterioration rate, shaded blue =
 * the family p10-p90 band at the same point of life.
 */

const WIDTH = 780;
const HEIGHT = 290;
const PAD = { top: 14, right: 116, bottom: 32, left: 44 };

function resampleBand(
  band: HotSectionMarginCurve["band"],
  from: number,
  to: number,
  samples: number,
): HotSectionMarginCurve["band"] {
  if (band.length < 2) return band;
  const at = (cycles: number) => {
    const upperIndex = band.findIndex((b) => b.cycles >= cycles);
    if (upperIndex <= 0) return band[upperIndex === 0 ? 0 : band.length - 1]!;
    const lower = band[upperIndex - 1]!;
    const upper = band[upperIndex]!;
    const t = (cycles - lower.cycles) / Math.max(1, upper.cycles - lower.cycles);
    return {
      cycles,
      p10: lower.p10 + (upper.p10 - lower.p10) * t,
      p50: lower.p50 + (upper.p50 - lower.p50) * t,
      p90: lower.p90 + (upper.p90 - lower.p90) * t,
    };
  };
  return Array.from({ length: samples }, (_, i) => {
    const cycles = from + ((to - from) / (samples - 1)) * i;
    return { ...at(cycles), cycles };
  });
}

function niceCeil(value: number): number {
  const step = value > 60 ? 20 : 10;
  return Math.ceil(value / step) * step;
}

export function MarginCurveChart({ curve }: { curve: HotSectionMarginCurve }) {
  const history = curve.history;
  const projection = curve.projection;
  const first = history[0];
  const current = history[history.length - 1];
  const exhaustion = projection[projection.length - 1];
  if (!first || !current || !exhaustion) return null;

  const xMin = first.cycles;
  const xMax = Math.max(exhaustion.cycles, current.cycles + 10);
  // The family band is published on a coarse grid; resample it across the
  // plotted window so the shaded area follows the whole x-axis.
  const band = resampleBand(curve.band, xMin, xMax, 32);
  const yMaxRaw = Math.max(
    ...history.map((p) => p.margin),
    ...band.map((b) => b.p90),
    curve.amberThreshold + 10,
  );
  const yMax = niceCeil(yMaxRaw);
  const yMin = Math.min(0, ...history.map((p) => p.margin)) - 2;

  const x = (cycles: number) => PAD.left + ((cycles - xMin) / (xMax - xMin || 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (margin: number) => {
    const raw = PAD.top + (1 - (margin - yMin) / (yMax - yMin || 1)) * (HEIGHT - PAD.top - PAD.bottom);
    return Math.min(HEIGHT - PAD.bottom, Math.max(PAD.top, raw));
  };

  const line = (points: { cycles: number; margin: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cycles).toFixed(1)},${y(p.margin).toFixed(1)}`).join(" ");

  const bandArea =
    band.length > 1
      ? `${band.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.cycles).toFixed(1)},${y(b.p90).toFixed(1)}`).join(" ")} ${[...band]
          .reverse()
          .map((b) => `L${x(b.cycles).toFixed(1)},${y(b.p10).toFixed(1)}`)
          .join(" ")} Z`
      : "";

  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round(xMin + ((xMax - xMin) / 4) * i));
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round(yMin + ((yMax - yMin) / 4) * i));
  const exhaustionDate = new Date(exhaustion.at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`EGT margin for ${curve.esn}: ${current.margin} degrees C at ${current.cycles} cycles since overhaul, projected to zero by ${exhaustionDate}.`}
      >
        {/* Operational zones: below the red line the engine must come off wing. */}
        <rect
          x={PAD.left}
          y={y(curve.amberThreshold)}
          width={WIDTH - PAD.left - PAD.right}
          height={Math.max(0, y(curve.redThreshold) - y(curve.amberThreshold))}
          fill="#f08c00"
          fillOpacity={0.07}
        />
        <rect
          x={PAD.left}
          y={y(curve.redThreshold)}
          width={WIDTH - PAD.left - PAD.right}
          height={Math.max(0, HEIGHT - PAD.bottom - y(curve.redThreshold))}
          fill="#d81e2b"
          fillOpacity={0.08}
        />

        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#05061f" strokeOpacity={0.07} />
            <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="#4b4f77" className="rr-numeric">
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={`x-${tick}`} x={x(tick)} y={HEIGHT - 10} textAnchor="middle" fontSize={10} fill="#4b4f77" className="rr-numeric">
            {tick.toLocaleString("en-GB")}
          </text>
        ))}

        {bandArea ? <path d={bandArea} fill="#10069f" fillOpacity={0.09} /> : null}
        {band.length > 1 ? (
          <path d={line(band.map((b) => ({ cycles: b.cycles, margin: b.p50 })))} fill="none" stroke="#a9a5e6" strokeWidth={1.4} strokeDasharray="5 4" />
        ) : null}

        <path d={line(history)} fill="none" stroke="#10069f" strokeWidth={2.2} />
        <path d={line([current, ...projection])} fill="none" stroke="#d81e2b" strokeWidth={1.8} strokeDasharray="6 4" />

        {history
          .filter((p) => p.wash)
          .map((p) => (
            <circle key={`wash-${p.cycles}`} cx={x(p.cycles)} cy={y(p.margin)} r={3.2} fill="#ffffff" stroke="#10069f" strokeWidth={1.4}>
              <title>{`Water wash at ${p.cycles.toLocaleString("en-GB")} cycles`}</title>
            </circle>
          ))}

        <circle cx={x(current.cycles)} cy={y(current.margin)} r={4} fill="#10069f" />
        <text x={x(current.cycles)} y={y(current.margin) - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#10069f" className="rr-numeric">
          {current.margin}°C
        </text>

        <circle cx={x(exhaustion.cycles)} cy={y(exhaustion.margin)} r={4} fill="#d81e2b" />
        <line
          x1={x(exhaustion.cycles)}
          x2={x(exhaustion.cycles)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="#d81e2b"
          strokeOpacity={0.35}
          strokeDasharray="3 4"
        />
        <text x={Math.min(WIDTH - 6, x(exhaustion.cycles) + 8)} y={y(exhaustion.margin) - 12} fontSize={10} fill="#d81e2b" fontWeight={600}>
          Margin exhausted
        </text>
        <text x={Math.min(WIDTH - 6, x(exhaustion.cycles) + 8)} y={y(exhaustion.margin)} fontSize={10} fill="#d81e2b" className="rr-numeric">
          {exhaustionDate}
        </text>
        <text
          x={Math.min(WIDTH - 6, x(exhaustion.cycles) + 8)}
          y={y(exhaustion.margin) + 12}
          fontSize={10}
          fill="#4b4f77"
          className="rr-numeric"
        >
          {exhaustion.cycles.toLocaleString("en-GB")} cyc
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-3 text-[11px] text-rr-slate">
        <span className="rr-label">Cycles since overhaul →</span>
        <span className="flex flex-wrap items-center gap-4">
          <LegendKey colour="#10069f">Observed margin</LegendKey>
          <LegendKey colour="#10069f" faded>
            Family p10-p90 band
          </LegendKey>
          <LegendKey colour="#d81e2b" dashed>
            Projection at current rate
          </LegendKey>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-rr-blue bg-white" aria-hidden />
            Water wash
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function LegendKey({ colour, faded, dashed, children }: { colour: string; faded?: boolean; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-0.5 w-5 rounded-full"
        style={{
          backgroundColor: dashed ? "transparent" : colour,
          opacity: faded ? 0.25 : 1,
          backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${colour} 0 4px, transparent 4px 8px)` : undefined,
          height: faded ? 8 : undefined,
        }}
      />
      {children}
    </span>
  );
}
