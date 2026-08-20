"use client";

import * as React from "react";
import type { Point, Series, StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../utils";

/**
 * Lightweight SVG charts. They carry no dependencies so they render identically
 * on the server and in tests; richer interactive charts use Recharts on top.
 */

function bounds(points: Point[]) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1;
  return { min: min - pad, max: max + pad };
}

export function Sparkline({
  points,
  status = "green",
  height = 32,
  className,
}: {
  points: Point[];
  status?: StatusLevel;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return <div className={cn("h-8", className)} />;
  const { min, max } = bounds(points);
  const width = 100;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.v - min) / (max - min)) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke = { red: "#ff5f6d", amber: "#ffb43d", green: "#2fd39b", grey: "#8f96bb" }[status];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }}>
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TrendChart({
  series,
  height = 200,
  className,
  showThresholds = true,
}: {
  series: Series;
  height?: number;
  className?: string;
  showThresholds?: boolean;
}) {
  const points = series.points;
  if (points.length < 2) return null;
  const width = 640;
  const { min, max } = bounds(points);
  const toY = (v: number) => height - ((v - min) / (max - min)) * height;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * width).toFixed(2)},${toY(p.v).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${series.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a63ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6a63ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="#e7eaf8" strokeOpacity={0.132} strokeWidth={1} />
        ))}
        {showThresholds && series.amberThreshold !== undefined && series.amberThreshold > min && series.amberThreshold < max ? (
          <line
            x1={0}
            x2={width}
            y1={toY(series.amberThreshold)}
            y2={toY(series.amberThreshold)}
            stroke="#ffb43d"
            strokeDasharray="6 4"
            strokeWidth={1.2}
          />
        ) : null}
        {showThresholds && series.redThreshold !== undefined && series.redThreshold > min && series.redThreshold < max ? (
          <line
            x1={0}
            x2={width}
            y1={toY(series.redThreshold)}
            y2={toY(series.redThreshold)}
            stroke="#ff5f6d"
            strokeDasharray="6 4"
            strokeWidth={1.2}
          />
        ) : null}
        <path d={area} fill={`url(#grad-${series.id})`} />
        <path d={line} fill="none" stroke="#6a63ff" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-rr-slate">
        <span>{new Date(points[0]!.t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
        <span className="rr-numeric">
          {points[points.length - 1]!.v} {series.unit}
        </span>
        <span>{new Date(points[points.length - 1]!.t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
      </div>
    </div>
  );
}

/** Radial gauge used for health scores and utilisation. */
export function Gauge({
  value,
  max = 100,
  status = "green",
  label,
  size = 120,
}: {
  value: number;
  max?: number;
  status?: StatusLevel;
  label?: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = size / 2 - 8;
  const circumference = Math.PI * radius * 2 * 0.75;
  const stroke = { red: "#ff5f6d", amber: "#ffb43d", green: "#2fd39b", grey: "#8f96bb" }[status];
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(135)`}>
          <circle
            r={radius}
            fill="none"
            stroke="#232a52"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference * 2}`}
          />
          <circle
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${circumference * pct} ${circumference * 2}`}
          />
        </g>
        <text x={size / 2} y={size / 2} textAnchor="middle" className="rr-numeric" fontSize={size * 0.22} fontWeight={600} fill="#e7eaf8">
          {Math.round(value)}
        </text>
      </svg>
      {label ? <span className="rr-label -mt-1 text-rr-slate">{label}</span> : null}
    </div>
  );
}

/** Horizontal bar showing where a reading sits against amber/red limits. */
export function ThresholdBar({
  value,
  min,
  max,
  amber,
  red,
  unit,
  direction = "higher-is-worse",
}: {
  value: number;
  min: number;
  max: number;
  amber: number;
  red: number;
  unit?: string;
  direction?: "higher-is-worse" | "lower-is-worse";
}) {
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const status: StatusLevel =
    direction === "higher-is-worse" ? (value >= red ? "red" : value >= amber ? "amber" : "green") : value <= red ? "red" : value <= amber ? "amber" : "green";
  return (
    <div className="w-full">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-status-green-soft">
        <div
          className="absolute inset-y-0 bg-status-amber-soft"
          style={
            direction === "higher-is-worse"
              ? { left: `${pct(amber)}%`, right: 0 }
              : { left: 0, right: `${100 - pct(amber)}%` }
          }
        />
        <div
          className="absolute inset-y-0 bg-status-red-soft"
          style={direction === "higher-is-worse" ? { left: `${pct(red)}%`, right: 0 } : { left: 0, right: `${100 - pct(red)}%` }}
        />
        <div className={cn("absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-sm", statusStyles[status].dot)} style={{ left: `${pct(value)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-rr-slate">
        <span className="rr-numeric">
          {min}
          {unit}
        </span>
        <span className={cn("rr-numeric font-semibold", statusStyles[status].text)}>
          {value}
          {unit}
        </span>
        <span className="rr-numeric">
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
