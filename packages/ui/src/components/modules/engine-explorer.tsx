import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Engine explorer cells. Threshold-coloured numerics used in the engine
 * register and anywhere else the same parameter is listed, so the colour rule
 * for a parameter is defined once.
 */

export function ThresholdValue({
  value,
  unit,
  status,
  caption,
  align = "right",
  className,
}: {
  value: React.ReactNode;
  unit?: string;
  status: StatusLevel;
  caption?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", align === "right" ? "items-end" : "items-start", className)}>
      <span className={cn("rr-numeric text-[15px] font-semibold leading-none", statusStyles[status].text)}>
        {value}
        {unit ? <span className="ml-0.5 text-[11px] font-medium text-rr-slate">{unit}</span> : null}
      </span>
      {caption ? <span className="mt-1 text-[10px] leading-none text-rr-slate">{caption}</span> : null}
    </div>
  );
}

/** Compact rank chip: 1 = work this engine first. */
export function PriorityRank({ rank, status }: { rank: number; status: StatusLevel }) {
  return (
    <span
      className={cn(
        "rr-numeric inline-flex h-6 min-w-6 items-center justify-center rounded-sm border px-1.5 text-[11px] font-semibold",
        statusStyles[status].bg,
        statusStyles[status].text,
        statusStyles[status].border,
      )}
      aria-label={`Priority rank ${rank}`}
    >
      {rank}
    </span>
  );
}

/** Segmented bar showing how a value sits between a floor and a ceiling. */
export function MiniMeter({ pct, status, className }: { pct: number; status: StatusLevel; className?: string }) {
  return (
    <span className={cn("inline-block h-1 w-14 overflow-hidden rounded-full bg-rr-mist align-middle", className)}>
      <span
        className={cn("block h-full rounded-full", statusStyles[status].dot)}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </span>
  );
}
