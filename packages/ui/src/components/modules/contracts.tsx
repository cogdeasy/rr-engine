import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Availability against a contractual commitment, rendered as a bar with the
 * commitment marked. Shared by the contract register and the contract dossier.
 */
export function CommitmentBar({
  actual,
  target,
  floor = 95,
  ceiling = 100,
  status,
  className,
}: {
  actual: number;
  target: number;
  /** Lower bound of the visualised band. */
  floor?: number;
  ceiling?: number;
  status: StatusLevel;
  className?: string;
}) {
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - floor) / (ceiling - floor)) * 100));
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-rr-mist">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", statusStyles[status].dot)}
          style={{ width: `${pct(actual)}%` }}
        />
        <div
          className="absolute inset-y-[-2px] w-px bg-rr-ink/70"
          style={{ left: `${pct(target)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
        <span className={cn("rr-numeric font-semibold", statusStyles[status].text)}>{actual.toFixed(2)}%</span>
        <span className="rr-numeric whitespace-nowrap text-rr-slate">commitment {target.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/** A guaranteed value tracked against its actual outturn. */
export function GuaranteeRow({
  label,
  unit,
  guaranteed,
  actual,
  headroomPct,
  status,
  basis,
}: {
  label: string;
  unit: string;
  guaranteed: number;
  actual: number;
  headroomPct: number;
  status: StatusLevel;
  basis?: string;
}) {
  const fill = Math.max(4, Math.min(100, 50 + headroomPct * 1.6));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-rr-ink/5 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[status].dot)} aria-hidden />
          <p className="truncate text-[13px] font-medium text-rr-ink">{label}</p>
        </div>
        {basis ? <p className="mt-0.5 pl-3.5 text-[11px] leading-snug text-rr-slate">{basis}</p> : null}
        <div className="mt-2 ml-3.5 h-1 w-[calc(100%-0.875rem)] overflow-hidden rounded-full bg-rr-mist">
          <div className={cn("h-full rounded-full", statusStyles[status].dot)} style={{ width: `${fill}%` }} />
        </div>
      </div>
      <div className="text-right">
        <p className={cn("rr-numeric text-lg font-semibold leading-none", statusStyles[status].text)}>
          {actual.toLocaleString("en-GB")}
          <span className="ml-1 text-[11px] font-medium text-rr-slate">{unit}</span>
        </p>
        <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
          guarantee {guaranteed.toLocaleString("en-GB")} · {headroomPct >= 0 ? "+" : ""}
          {headroomPct}%
        </p>
      </div>
    </div>
  );
}
