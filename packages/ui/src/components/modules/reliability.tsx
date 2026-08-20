import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Shared presentation pieces for the Reliability KPIs module. Attainment is
 * expressed against target, so 100 always reads as "exactly on commitment"
 * whichever direction the underlying metric runs in.
 */

export function AttainmentBar({
  attainmentPct,
  status,
  className,
}: {
  attainmentPct: number;
  status: StatusLevel;
  className?: string;
}) {
  const scale = 160;
  const width = Math.max(0, Math.min(100, (attainmentPct / scale) * 100));
  const targetMark = (100 / scale) * 100;
  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-rr-mist"
        role="img"
        aria-label={`${attainmentPct}% of target`}
      >
        <div className={cn("absolute inset-y-0 left-0 rounded-full", statusStyles[status].dot)} style={{ width: `${width}%` }} />
        <div className="absolute inset-y-0 w-px bg-rr-ink/35" style={{ left: `${targetMark}%` }} />
      </div>
    </div>
  );
}

/** Renders a metric reading with its unit, in the module's numeric style. */
export function MetricReading({
  value,
  unit,
  decimals,
  status,
  size = "lg",
  className,
}: {
  value: number;
  unit: string;
  decimals: number;
  status?: StatusLevel;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span
        className={cn(
          "rr-numeric font-semibold tracking-tight",
          size === "lg" ? "text-3xl" : "text-sm",
          status ? statusStyles[status].text : "text-rr-ink",
        )}
      >
        {value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </span>
      <span className={cn("font-medium text-rr-slate", size === "lg" ? "text-xs" : "text-[11px]")}>{unit}</span>
    </span>
  );
}
