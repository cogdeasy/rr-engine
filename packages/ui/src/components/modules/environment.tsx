"use client";

import * as React from "react";
import type { AirportExposure, ExposureCorrelation, ExposureDriverId, StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Environmental exposure visualisations.
 *
 * Driver breakdowns use a monochrome Rolls-Royce blue ramp so that red, amber
 * and green stay reserved for operational state.
 */

export const EXPOSURE_DRIVER_TINTS: Record<ExposureDriverId, string> = {
  dust: "#6a63ff",
  sand: "#3B2FC0",
  salinity: "#6B63D6",
  pollution: "#9B95E4",
  temperature: "#C7C3F1",
};

export const EXPOSURE_DRIVER_LABELS: Record<ExposureDriverId, string> = {
  dust: "Dust",
  sand: "Sand",
  salinity: "Salt",
  pollution: "Pollution",
  temperature: "Temperature",
};

const DRIVER_ORDER: ExposureDriverId[] = ["dust", "sand", "salinity", "pollution", "temperature"];

/** Stacked bar of the driver points that make up a composite severity index. */
export function DriverBreakdownBar({
  contributions,
  total = 100,
  height = 8,
  className,
}: {
  contributions: Record<ExposureDriverId, number>;
  total?: number;
  height?: number;
  className?: string;
}) {
  const sum = DRIVER_ORDER.reduce((s, id) => s + contributions[id], 0);
  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full bg-rr-mist", className)}
      style={{ height }}
      role="img"
      aria-label={DRIVER_ORDER.map((id) => `${EXPOSURE_DRIVER_LABELS[id]} ${contributions[id].toFixed(1)}`).join(", ")}
    >
      {DRIVER_ORDER.map((id) => (
        <span
          key={id}
          className="h-full"
          style={{ width: `${(contributions[id] / total) * 100}%`, backgroundColor: EXPOSURE_DRIVER_TINTS[id] }}
        />
      ))}
      <span className="h-full flex-1" style={{ width: `${Math.max(0, ((total - sum) / total) * 100)}%` }} />
    </div>
  );
}

export function DriverLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {DRIVER_ORDER.map((id) => (
        <li key={id} className="flex items-center gap-1.5 text-[11px] text-rr-slate">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EXPOSURE_DRIVER_TINTS[id] }} aria-hidden />
          {EXPOSURE_DRIVER_LABELS[id]}
        </li>
      ))}
    </ul>
  );
}

/** 0-100 severity index shown against the amber (45) and red (62) bands. */
export function SeverityMeter({
  value,
  status,
  showScale = false,
  className,
}: {
  value: number;
  status: StatusLevel;
  showScale?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-status-green-soft">
        <span className="absolute inset-y-0 bg-status-amber-soft" style={{ left: "45%", right: 0 }} />
        <span className="absolute inset-y-0 bg-status-red-soft" style={{ left: "62%", right: 0 }} />
        <span
          className={cn("absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-sm", statusStyles[status].dot)}
          style={{ left: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      {showScale ? (
        <div className="mt-1 flex justify-between text-[10px] text-rr-slate">
          <span className="rr-numeric">0</span>
          <span className="rr-numeric">45 watchlist</span>
          <span className="rr-numeric">62 act</span>
          <span className="rr-numeric">100</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Exposure vs deterioration scatter with the least-squares fit line — the
 * evidence for severity-adjusted overhaul intervals.
 */
export function ExposureScatter({
  correlation,
  height = 260,
  className,
}: {
  correlation: ExposureCorrelation;
  height?: number;
  className?: string;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const width = 640;
  const pad = { top: 12, right: 16, bottom: 30, left: 44 };
  const points = correlation.points;
  if (points.length === 0) return null;

  const xMin = 0;
  const xMax = 100;
  const yMax = Math.max(...points.map((p) => p.deteriorationRate)) * 1.08;
  const yMin = Math.min(0, Math.min(...points.map((p) => p.deteriorationRate)));

  const x = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * (width - pad.left - pad.right);
  const y = (v: number) => height - pad.bottom - ((v - yMin) / (yMax - yMin || 1)) * (height - pad.top - pad.bottom);

  const fitFrom = correlation.intercept + correlation.slope * xMin;
  const fitTo = correlation.intercept + correlation.slope * xMax;
  const active = points.find((p) => p.engineId === hovered) ?? null;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Environmental severity index against EGT margin deterioration rate">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const value = yMin + (yMax - yMin) * f;
          return (
            <g key={f}>
              <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="#e7eaf8" strokeOpacity={0.154} />
              <text x={pad.left - 8} y={y(value) + 3} textAnchor="end" fontSize={9} fill="#8f96bb" className="rr-numeric">
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}
        <rect x={x(45)} y={pad.top} width={x(62) - x(45)} height={height - pad.top - pad.bottom} fill="#ffb43d" fillOpacity={0.06} />
        <rect x={x(62)} y={pad.top} width={width - pad.right - x(62)} height={height - pad.top - pad.bottom} fill="#ff5f6d" fillOpacity={0.06} />
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <text key={v} x={x(v)} y={height - 10} textAnchor="middle" fontSize={9} fill="#8f96bb" className="rr-numeric">
            {v}
          </text>
        ))}
        {points.map((p) => (
          <circle
            key={p.engineId}
            cx={x(p.severityIndex)}
            cy={y(p.deteriorationRate)}
            r={hovered === p.engineId ? 5 : 3}
            fill={{ red: "#ff5f6d", amber: "#ffb43d", green: "#2fd39b", grey: "#8f96bb" }[p.status]}
            fillOpacity={hovered && hovered !== p.engineId ? 0.25 : 0.72}
            onMouseEnter={() => setHovered(p.engineId)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <line x1={x(xMin)} y1={y(fitFrom)} x2={x(xMax)} y2={y(fitTo)} stroke="#6a63ff" strokeWidth={2} strokeDasharray="7 4" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-rr-slate">
        <span className="rr-label">Severity index →</span>
        <span aria-live="polite" className="rr-numeric">
          {active ? `${active.esn} · severity ${active.severityIndex} · ${active.deteriorationRate}°C/1,000 cyc` : `n = ${correlation.sampleSize} engines`}
        </span>
      </div>
    </div>
  );
}

/**
 * Equirectangular plot of the network: airport severity plus the harshest
 * route pairings the managed fleet is currently flying.
 */
export function ExposureGeography({
  airports,
  routes,
  height = 300,
  className,
}: {
  airports: AirportExposure[];
  routes: { origin: string; destination: string; severityIndex: number; status: StatusLevel; label: string }[];
  height?: number;
  className?: string;
}) {
  const width = 1200;
  const pad = 44;
  /* Fit the graticule to the flown network rather than the whole globe. */
  const lats = airports.map((a) => a.lat);
  const lons = airports.map((a) => a.lon);
  const latMax = Math.max(...lats) + 8;
  const latMin = Math.min(...lats) - 8;
  const lonMax = Math.max(...lons) + 10;
  const lonMin = Math.min(...lons) - 10;
  const project = (lat: number, lon: number) => ({
    cx: pad + ((lon - lonMin) / (lonMax - lonMin)) * (width - pad * 2),
    cy: pad + ((latMax - lat) / (latMax - latMin)) * (height - pad * 2),
  });
  const byIcao = new Map(airports.map((a) => [a.icao, a]));
  const maxSectors = Math.max(1, ...airports.map((a) => a.sectors));
  const placed: { cx: number; cy: number }[] = [];

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-sm bg-rr-abyss"
        role="img"
        aria-label="Geographic distribution of airport environmental severity across the flown network"
      >
        {[-60, -30, 0, 30, 60].map((lat) => {
          const { cy } = project(lat, lonMin);
          if (cy < 0 || cy > height) return null;
          return <line key={lat} x1={0} x2={width} y1={cy} y2={cy} stroke="#ffffff" strokeOpacity={lat === 0 ? 0.18 : 0.07} />;
        })}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
          const { cx } = project(latMin, lon);
          if (cx < 0 || cx > width) return null;
          return <line key={lon} x1={cx} x2={cx} y1={0} y2={height} stroke="#ffffff" strokeOpacity={0.07} />;
        })}
        {routes.map((route) => {
          const from = byIcao.get(route.origin);
          const to = byIcao.get(route.destination);
          if (!from || !to) return null;
          const a = project(from.lat, from.lon);
          const b = project(to.lat, to.lon);
          const mx = (a.cx + b.cx) / 2;
          const my = (a.cy + b.cy) / 2 - Math.abs(b.cx - a.cx) * 0.16;
          return (
            <path
              key={route.label}
              d={`M${a.cx},${a.cy} Q${mx},${my} ${b.cx},${b.cy}`}
              fill="none"
              stroke={{ red: "#ff5f6d", amber: "#ffb43d", green: "#2fd39b", grey: "#8f96bb" }[route.status]}
              strokeOpacity={0.55}
              strokeWidth={1.2}
            />
          );
        })}
        {airports.map((airport) => {
          const { cx, cy } = project(airport.lat, airport.lon);
          const r = 4 + (airport.sectors / maxSectors) * 8;
          const colour = { red: "#ff5f6d", amber: "#ffb43d", green: "#2fd39b", grey: "#8f96bb" }[airport.status];
          /* Nudge labels of tightly clustered stations so codes stay legible. */
          const crowded = placed.filter((p) => Math.abs(p.cx - cx) < 40 && Math.abs(p.cy - cy) < 14).length;
          placed.push({ cx, cy });
          const labelDy = crowded === 0 ? 3 : crowded % 2 === 1 ? -r - 5 : r + 11;
          return (
            <g key={airport.icao}>
              <circle cx={cx} cy={cy} r={r + 4} fill={colour} fillOpacity={0.14} />
              <circle cx={cx} cy={cy} r={r} fill={colour} fillOpacity={0.85} />
              <text x={cx + r + 4} y={cy + labelDy} fontSize={11} fill="#ffffff" fillOpacity={airport.status === "red" ? 0.95 : 0.6} className="rr-numeric">
                {airport.iata}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
