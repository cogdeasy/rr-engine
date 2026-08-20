"use client";

import * as React from "react";
import type { TestProfilePoint } from "@rr/types";
import { cn } from "@rr/ui";

/**
 * Acceleration / deceleration profile flown at the end of a pass-off run.
 *
 * EGT is plotted against the certified redline with the amber attention band
 * above it, N1 and thrust share the right-hand percentage axis, and the slam
 * windows the acceptance criteria are measured over are called out on the
 * baseline.
 */

const WIDTH = 940;
const HEIGHT = 300;
const PAD = { top: 18, right: 54, bottom: 30, left: 52 };

const EGT_MIN = 280;
const EGT_MAX = 920;
/** Certified take-off EGT redline and the attention band beneath it. */
const EGT_RED = 900;
const EGT_AMBER = 855;

const ACCEL_WINDOW = { from: 30, to: 55 };
const DECEL_WINDOW = { from: 110, to: 140 };

export function RunProfileChart({
  profile,
  peakVibrationMm,
  vibrationLimitMm,
  className,
}: {
  profile: TestProfilePoint[];
  peakVibrationMm: number;
  vibrationLimitMm: number;
  className?: string;
}) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const tMax = profile[profile.length - 1]?.t ?? 1;
  const maxThrust = Math.max(...profile.map((p) => p.thrustLbf), 1);

  const x = (t: number) => PAD.left + (t / tMax) * plotWidth;
  const yEgt = (v: number) => PAD.top + plotHeight - ((v - EGT_MIN) / (EGT_MAX - EGT_MIN)) * plotHeight;
  const yPct = (v: number) => PAD.top + plotHeight - (v / 100) * plotHeight;

  const path = (values: number[], toY: (v: number) => number) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(profile[i]!.t).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const egtPath = path(profile.map((p) => p.egtC), yEgt);
  const n1Path = path(profile.map((p) => p.n1), yPct);
  const thrustPath = path(profile.map((p) => (p.thrustLbf / maxThrust) * 100), yPct);
  const active = hoverIndex === null ? null : profile[hoverIndex] ?? null;

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const t = ((ratio - PAD.left) / plotWidth) * tMax;
    const index = profile.reduce((best, point, i) => (Math.abs(point.t - t) < Math.abs(profile[best]!.t - t) ? i : best), 0);
    setHoverIndex(index);
  }

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Acceleration and deceleration profile. Peak EGT ${Math.max(...profile.map((p) => p.egtC))} degrees against a ${EGT_RED} degree redline.`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* Limit bands */}
        <rect x={PAD.left} y={yEgt(EGT_MAX)} width={plotWidth} height={Math.max(0, yEgt(EGT_RED) - yEgt(EGT_MAX))} fill="#ff5f6d" opacity={0.09} />
        <rect x={PAD.left} y={yEgt(EGT_RED)} width={plotWidth} height={Math.max(0, yEgt(EGT_AMBER) - yEgt(EGT_RED))} fill="#ffb43d" opacity={0.1} />
        <line x1={PAD.left} x2={PAD.left + plotWidth} y1={yEgt(EGT_RED)} y2={yEgt(EGT_RED)} stroke="#ff5f6d" strokeWidth={1} strokeDasharray="6 4" />
        <text x={PAD.left + plotWidth} y={yEgt(EGT_RED) - 5} textAnchor="end" fontSize={10} fill="#ff5f6d" className="rr-label">
          EGT redline {EGT_RED}°C
        </text>

        {/* Slam windows */}
        {[
          { window: ACCEL_WINDOW, label: "Accel window" },
          { window: DECEL_WINDOW, label: "Decel window" },
        ].map(({ window, label }) => (
          <g key={label}>
            <rect
              x={x(window.from)}
              y={PAD.top}
              width={x(window.to) - x(window.from)}
              height={plotHeight}
              fill="#6a63ff"
              opacity={0.045}
            />
            <text x={(x(window.from) + x(window.to)) / 2} y={HEIGHT - 10} textAnchor="middle" fontSize={9} fill="#98a0c6" className="rr-label">
              {label}
            </text>
          </g>
        ))}

        {/* Gridlines + axes */}
        {[300, 450, 600, 750, 900].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + plotWidth} y1={yEgt(v)} y2={yEgt(v)} stroke="#e7eaf8" strokeOpacity={0.132} />
            <text x={PAD.left - 8} y={yEgt(v) + 3} textAnchor="end" fontSize={10} fill="#98a0c6" className="rr-numeric">
              {v}
            </text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => (
          <text key={v} x={PAD.left + plotWidth + 8} y={yPct(v) + 3} fontSize={10} fill="#98a0c6" className="rr-numeric">
            {v}%
          </text>
        ))}
        {[0, 45, 90, 135, 180].filter((t) => t <= tMax).map((t) => (
          <text key={t} x={x(t)} y={HEIGHT - 22} textAnchor="middle" fontSize={10} fill="#98a0c6" className="rr-numeric">
            {t}s
          </text>
        ))}

        {/* Series */}
        <path d={thrustPath} fill="none" stroke="#35c8ff" strokeWidth={1.4} strokeDasharray="3 3" />
        <path d={n1Path} fill="none" stroke="#8b85ff" strokeWidth={1.4} />
        <path d={egtPath} fill="none" stroke="#6a63ff" strokeWidth={2.2} />

        {/* Crosshair */}
        {active ? (
          <g>
            <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={PAD.top + plotHeight} stroke="#e7eaf8" strokeOpacity={0.5} />
            <circle cx={x(active.t)} cy={yEgt(active.egtC)} r={3.5} fill="#6a63ff" />
            <circle cx={x(active.t)} cy={yPct(active.n1)} r={3} fill="#8b85ff" />
          </g>
        ) : null}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-rr-slate">
        <div className="flex flex-wrap items-center gap-4">
          <LegendSwatch colour="#6a63ff" label="EGT °C" />
          <LegendSwatch colour="#8b85ff" label="N1 %" />
          <LegendSwatch colour="#35c8ff" label="Thrust % of achieved" dashed />
        </div>
        <div className="rr-numeric flex flex-wrap items-center gap-4">
          {active ? (
            <>
              <span>t {active.t}s</span>
              <span>EGT {active.egtC}°C</span>
              <span>N1 {active.n1}%</span>
              <span>{(active.thrustLbf / 1000).toFixed(1)}k lbf</span>
              <span>vib {active.vibMm} mm/s</span>
            </>
          ) : (
            <span className="text-rr-slate/80">
              Peak vibration {peakVibrationMm} mm/s against a {vibrationLimitMm} mm/s limit — hover the trace for values
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ colour, label, dashed }: { colour: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0 w-6 border-t-2"
        style={{ borderColor: colour, borderStyle: dashed ? "dashed" : "solid" }}
        aria-hidden
      />
      {label}
    </span>
  );
}
