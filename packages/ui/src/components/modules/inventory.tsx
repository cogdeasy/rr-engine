import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Cover bar for a stock line: available stock rendered against the planned
 * 90-day demand, with inbound stock shown as a hatched extension. Colour is
 * driven by the operational status of the line, never by the quantities alone.
 */
export function CoverageBar({
  available,
  demand,
  inbound = 0,
  status,
  className,
}: {
  available: number;
  demand: number;
  inbound?: number;
  status: StatusLevel;
  className?: string;
}) {
  const scale = Math.max(available + inbound, demand, 1);
  const availablePct = (available / scale) * 100;
  const inboundPct = (inbound / scale) * 100;
  const demandPct = (demand / scale) * 100;
  const label = `${available} available, ${inbound} inbound, ${demand} required`;

  return (
    <div className={cn("w-full", className)} title={label} aria-label={label}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", statusStyles[status].dot)} style={{ width: `${availablePct}%` }} />
        {inbound > 0 ? (
          <div
            className="absolute inset-y-0 rounded-full bg-rr-blue/25"
            style={{ left: `${availablePct}%`, width: `${inboundPct}%` }}
          />
        ) : null}
        {demand > 0 ? (
          <div className="absolute inset-y-0 w-px bg-rr-ink/70" style={{ left: `${Math.min(100, demandPct)}%` }} />
        ) : null}
      </div>
    </div>
  );
}

/** Four-segment rotable condition bar: serviceable / unserviceable / in-repair / in-transit. */
export function ConditionMixBar({
  serviceable,
  unserviceable,
  inRepair,
  inTransit,
  className,
}: {
  serviceable: number;
  unserviceable: number;
  inRepair: number;
  inTransit: number;
  className?: string;
}) {
  const total = Math.max(1, serviceable + unserviceable + inRepair + inTransit);
  const segments: { key: string; value: number; className: string }[] = [
    { key: "serviceable", value: serviceable, className: "bg-status-green" },
    { key: "unserviceable", value: unserviceable, className: "bg-status-red" },
    { key: "in-repair", value: inRepair, className: "bg-status-amber" },
    { key: "in-transit", value: inTransit, className: "bg-rr-blue-400" },
  ];
  const label = segments.map((s) => `${s.value} ${s.key}`).join(", ");

  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-rr-mist", className)} aria-label={label} title={label}>
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <div key={segment.key} className={segment.className} style={{ width: `${(segment.value / total) * 100}%` }} />
        ))}
    </div>
  );
}
