"use client";

import * as React from "react";
import type { FleetMapAircraftNode, FleetMapStation, StatusLevel } from "@rr/types";
import { cn } from "@rr/ui";
import {
  GRATICULE_LATS,
  GRATICULE_LONS,
  LAT_MAX,
  LAT_MIN,
  MAP_HEIGHT,
  MAP_WIDTH,
  greatCirclePath,
  project,
  ringToPath,
} from "./projection";
import { LAND_RINGS } from "./world";

/** Map-tuned status palette: the same semantics, legible on the navy surface. */
export const MAP_STATUS_COLOUR: Record<StatusLevel, string> = {
  red: "#ff3b47",
  amber: "#ffa41b",
  green: "#2bb673",
  grey: "#8a90ab",
};

const LAND_PATHS = LAND_RINGS.map(ringToPath);

export interface FleetMapCanvasProps {
  aircraft: FleetMapAircraftNode[];
  stations: FleetMapStation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function FleetMapCanvas({ aircraft, stations, selectedId, onSelect, className }: FleetMapCanvasProps) {
  const selected = aircraft.find((node) => node.id === selectedId) ?? null;
  // Flagged airframes render last so red never hides behind green.
  const ordered = React.useMemo(
    () => [...aircraft].sort((a, b) => rank(a.status) - rank(b.status)),
    [aircraft],
  );

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className={cn("block w-full", className)}
      role="group"
      aria-label="Geographic view of the managed fleet, maintenance stations and in-flight routes"
    >
      <defs>
        <radialGradient id="fm-ocean" cx="52%" cy="12%" r="85%">
          <stop offset="0%" stopColor="#141a45" />
          <stop offset="60%" stopColor="#080b26" />
          <stop offset="100%" stopColor="#04061a" />
        </radialGradient>
        <filter id="fm-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#fm-ocean)" />

      {/* Graticule */}
      <g stroke="rgba(169,165,230,0.10)" strokeWidth={0.5}>
        {GRATICULE_LONS.map((lon) => {
          const { x } = project({ lat: 0, lon });
          return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={MAP_HEIGHT} />;
        })}
        {GRATICULE_LATS.map((lat) => {
          const { y } = project({ lat, lon: 0 });
          return <line key={`lat-${lat}`} x1={0} y1={y} x2={MAP_WIDTH} y2={y} strokeDasharray={lat === 0 ? undefined : "3 5"} />;
        })}
      </g>
      <g fill="rgba(201,203,224,0.35)" fontSize={7} fontFamily="var(--font-mono)">
        {GRATICULE_LATS.filter((lat) => lat !== 0).map((lat) => {
          const { y } = project({ lat, lon: -178 });
          return (
            <text key={`lab-${lat}`} x={6} y={y - 3}>
              {Math.abs(lat)}°{lat > 0 ? "N" : "S"}
            </text>
          );
        })}
      </g>

      {/* Land */}
      <g fill="#151b40" stroke="rgba(169,165,230,0.28)" strokeWidth={0.5} strokeLinejoin="round">
        {LAND_PATHS.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>

      {/* Route arcs for airborne aircraft */}
      <g fill="none" strokeLinecap="round">
        {ordered
          .filter((node) => node.phase === "in-flight" && node.origin && node.destination)
          .map((node) => {
            const isSelected = node.id === selectedId;
            const colour = MAP_STATUS_COLOUR[node.status];
            const dim = node.status === "green" && !isSelected;
            return (
              <g key={`route-${node.id}`} opacity={isSelected ? 1 : dim ? 0.22 : 0.5}>
                <path
                  d={greatCirclePath(node.origin!, node.destination!, 1)}
                  stroke="rgba(201,203,224,0.30)"
                  strokeWidth={isSelected ? 0.9 : 0.5}
                  strokeDasharray="2 4"
                />
                <path
                  d={greatCirclePath(node.origin!, node.destination!, node.progress)}
                  stroke={colour}
                  strokeWidth={isSelected ? 1.6 : 0.9}
                />
              </g>
            );
          })}
      </g>

      {/* Reach line from the selected aircraft to the station that can take it */}
      {selected?.nearestCapable
        ? (() => {
            const station = stations.find((s) => s.id === selected.nearestCapable!.stationId);
            if (!station) return null;
            const a = project(selected);
            const b = project(station);
            return (
              <g>
                <path
                  d={greatCirclePath(selected, station, 1)}
                  fill="none"
                  stroke="#a9a5e6"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 5}
                  textAnchor="middle"
                  fill="#e7e6fb"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                >
                  {selected.nearestCapable.distanceKm.toLocaleString("en-GB")} km · {selected.nearestCapable.ferryHours}h
                </text>
              </g>
            );
          })()
        : null}

      {/* Maintenance network */}
      <g>
        {stations.map((station) => {
          const { x, y } = project(station);
          const colour = station.freeSlots === 0 ? MAP_STATUS_COLOUR.red : "#ffffff";
          return (
            <g key={station.id}>
              <rect
                x={x - 4}
                y={y - 4}
                width={8}
                height={8}
                transform={`rotate(45 ${x} ${y})`}
                fill="#0b0d33"
                stroke={colour}
                strokeWidth={1.2}
              />
              <circle cx={x} cy={y} r={1.4} fill={colour} />
              <text x={x} y={y + 14} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.72)">
                {station.icao}
              </text>
              <text x={x} y={y + 22} textAnchor="middle" fontSize={7} fontFamily="var(--font-mono)" fill="rgba(201,203,224,0.55)">
                {station.freeSlots} free
              </text>
            </g>
          );
        })}
      </g>

      {/* Aircraft */}
      <g>
        {ordered.map((node) => {
          const { x, y } = project(node);
          const colour = MAP_STATUS_COLOUR[node.status];
          const isSelected = node.id === selectedId;
          const flagged = node.status === "red" || node.status === "amber";
          const radius = node.status === "red" ? 4 : node.status === "amber" ? 3.4 : 2.6;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={flagged || isSelected ? 0 : -1}
              aria-label={`${node.tail}, ${node.operatorName}, ${node.status} status, ${
                node.phase === "in-flight" ? `in flight to ${node.destination?.iata ?? "destination"}` : `on ground at ${node.destination?.iata ?? "station"}`
              }`}
              aria-pressed={isSelected}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.id);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>circle:last-of-type]:stroke-white"
            >
              {isSelected ? <circle cx={x} cy={y} r={radius + 7} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.9} /> : null}
              {node.status === "red" ? (
                <circle cx={x} cy={y} r={radius + 3.5} fill={colour} opacity={0.18} filter="url(#fm-glow)" />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill={colour}
                fillOpacity={node.phase === "in-flight" ? 1 : 0.35}
                stroke={colour}
                strokeWidth={1.2}
              />
              {isSelected || node.status === "red" ? (
                <text x={x + radius + 4} y={y + 3} fontSize={7.5} fontFamily="var(--font-mono)" fill="#ffffff">
                  {node.tail}
                </text>
              ) : null}
              <title>{`${node.tail} · ${node.operatorCode} · ${node.type}`}</title>
            </g>
          );
        })}
      </g>

      <text x={MAP_WIDTH - 8} y={MAP_HEIGHT - 8} textAnchor="end" fontSize={7} fontFamily="var(--font-mono)" fill="rgba(201,203,224,0.4)">
        Equirectangular projection · {LAT_MAX}°N to {Math.abs(LAT_MIN)}°S
      </text>
    </svg>
  );
}

function rank(status: StatusLevel): number {
  return { grey: 0, green: 1, amber: 2, red: 3 }[status];
}
