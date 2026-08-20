import * as React from "react";
import type { DeteriorationSlice } from "@rr/types";
import { cn } from "../../utils";

/**
 * Shared visuals for the Performance & fuel burn module.
 *
 * Colour here encodes mechanism, not operational state: the wash-recoverable
 * share is the only part rendered in brand blue, so a reader can see at a
 * glance how much of a deviation is actually actionable.
 */

const CAUSE_FILL: Record<DeteriorationSlice["cause"], string> = {
  fouling: "bg-rr-blue",
  "hot-section": "bg-rr-navy-500",
  seals: "bg-rr-cloud",
};

const CAUSE_SWATCH: Record<DeteriorationSlice["cause"], string> = {
  fouling: "bg-rr-blue",
  "hot-section": "bg-rr-navy-500",
  seals: "bg-rr-cloud",
};

export function DeteriorationSplitBar({
  slices,
  height = 8,
  className,
  ariaLabel = "Deterioration attribution",
}: {
  slices: DeteriorationSlice[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.deviationPct, 0) || 1;
  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full bg-rr-mist", className)}
      style={{ height }}
      role="img"
      aria-label={`${ariaLabel}: ${slices.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`}
    >
      {slices.map((slice) => (
        <div key={slice.cause} className={CAUSE_FILL[slice.cause]} style={{ width: `${(slice.deviationPct / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function DeteriorationLegend({ slices, className }: { slices: DeteriorationSlice[]; className?: string }) {
  return (
    <ul className={cn("grid gap-2", className)}>
      {slices.map((slice) => (
        <li key={slice.cause} className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-rr-slate">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", CAUSE_SWATCH[slice.cause])} aria-hidden />
            {slice.label}
          </span>
          <span className="flex items-baseline gap-2">
            <span className="rr-numeric font-semibold text-rr-ink">{slice.deviationPct.toFixed(2)}pp</span>
            <span className="rr-numeric w-9 text-right text-rr-slate">{Math.round(slice.share * 100)}%</span>
            <span
              className={cn(
                "rr-numeric w-24 text-right text-[11px]",
                slice.recoverableFraction > 0.3 ? "text-rr-blue" : "text-rr-slate/70",
              )}
            >
              {Math.round(slice.recoverableFraction * 100)}% washable
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Before/after bar used to show what a wash buys on a single parameter. */
export function RecoveryBar({
  label,
  before,
  after,
  unit,
  max,
  betterIs = "lower",
  className,
}: {
  label: string;
  before: number;
  after: number;
  unit: string;
  max: number;
  betterIs?: "lower" | "higher";
  className?: string;
}) {
  const pct = (v: number) => Math.max(2, Math.min(100, (v / max) * 100));
  const improved = betterIs === "lower" ? after < before : after > before;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <span className="rr-label text-rr-slate">{label}</span>
        <span className="rr-numeric text-xs text-rr-slate">
          {before.toFixed(2)}
          {unit} <span aria-hidden>→</span>{" "}
          <span className={cn("font-semibold", improved ? "text-rr-blue" : "text-rr-ink")}>
            {after.toFixed(2)}
            {unit}
          </span>
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-rr-mist">
        <div className="absolute inset-y-0 left-0 bg-rr-navy-500/30" style={{ width: `${pct(before)}%` }} />
        <div className="absolute inset-y-0 left-0 bg-rr-blue" style={{ width: `${pct(after)}%` }} />
      </div>
    </div>
  );
}
