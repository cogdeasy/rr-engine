import * as React from "react";
import type { EngineLlpStack, LlpExpiryBucket, LlpLine, LlpRemovalOption, StatusLevel } from "@rr/types";
import { cn, formatNumber, formatUsd, statusStyles } from "../../utils";

/**
 * LLP life management visualisations. All are dependency-free SVG/flex so they
 * render on the server, and all colour is semantic: red = act now, amber =
 * watchlist, green = nominal.
 */

/** Life consumed on a single part, with the stub that would be scrapped shown hatched. */
export function LlpLifeBar({ line, cyclesToRemoval }: { line: LlpLine; cyclesToRemoval: number }) {
  const usedPct = Math.min(100, (line.cyclesUsed / line.cyclicLimit) * 100);
  const burnPct = Math.min(100 - usedPct, (Math.min(cyclesToRemoval, line.cyclesRemaining) / line.cyclicLimit) * 100);
  const stubPct = Math.max(0, 100 - usedPct - burnPct);
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-rr-mist"
      role="img"
      aria-label={`${formatNumber(line.cyclesUsed)} of ${formatNumber(line.cyclicLimit)} cycles used, ${formatNumber(
        line.stubCycles,
      )} cycles of stub life at removal`}
    >
      <div className="bg-rr-navy-500" style={{ width: `${usedPct}%` }} />
      <div className="bg-rr-blue-200" style={{ width: `${burnPct}%` }} />
      <div className={cn(stubPct > 0 && line.mustReplace ? "bg-status-red" : "bg-status-green")} style={{ width: `${stubPct}%` }} />
    </div>
  );
}

/** Monthly LLP expiry profile across the managed fleet. */
export function LlpExpiryTimeline({ buckets, height = 148 }: { buckets: LlpExpiryBucket[]; height?: number }) {
  // A backlog of already-expired parts lands in the first bucket and would
  // flatten every other month, so the axis is capped just above the second
  // largest month and taller bars are drawn clipped.
  const counts = [...buckets.map((b) => b.count)].sort((a, b) => b - a);
  const highest = counts[0] ?? 1;
  const runnerUp = counts[1] ?? 1;
  const scaleMax = Math.max(1, highest > runnerUp * 2.5 ? Math.round(runnerUp * 1.25) : highest);
  const plot = height - 20;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {buckets.map((bucket) => {
          const clipped = bucket.count > scaleMax;
          const total = Math.min(1, bucket.count / scaleMax) * plot;
          const red = Math.min(1, bucket.redCount / scaleMax) * plot;
          return (
            <div key={bucket.monthStart} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className={cn("rr-numeric text-[10px]", clipped ? "font-semibold text-status-red" : "text-rr-slate")}>
                {bucket.count > 0 ? bucket.count : ""}
              </span>
              <div
                className={cn(
                  "flex w-full flex-col justify-end overflow-hidden rounded-sm bg-rr-blue/70",
                  clipped && "rounded-t-none border-t-2 border-dashed border-white",
                )}
                style={{ height: Math.max(bucket.count > 0 ? 3 : 1, total) }}
                title={`${bucket.label}: ${bucket.count} parts expiring on ${bucket.engineCount} engines`}
              >
                <div className="w-full bg-status-red" style={{ height: red }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {buckets.map((bucket, index) => (
          <span key={bucket.monthStart} className="flex-1 text-center text-[10px] text-rr-slate">
            {index % 3 === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Cost of removing the engine on each candidate date: scrapped stub life and
 * forgone green time against the cost of carrying condition risk.
 */
export function LlpTradeCurve({
  options,
  recommendedDate,
  proposedDate,
  height = 168,
}: {
  options: LlpRemovalOption[];
  recommendedDate: string;
  proposedDate: string;
  height?: number;
}) {
  const max = Math.max(1, ...options.map((o) => o.totalCostUsd));
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {options.map((option) => {
          const life = ((option.stubValueUsd + option.greenTimeCostUsd) / max) * (height - 26);
          const risk = (option.riskCostUsd / max) * (height - 26);
          const isRecommended = option.date === recommendedDate;
          const isProposed = option.date === proposedDate;
          return (
            <div key={option.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span
                className={cn(
                  "rr-numeric text-[10px]",
                  isRecommended ? "font-semibold text-rr-blue" : "text-rr-slate",
                )}
              >
                {formatUsd(option.totalCostUsd)}
              </span>
              <div
                className={cn(
                  "flex w-full flex-col justify-end rounded-sm",
                  !option.feasible && "opacity-30",
                  isRecommended && "ring-2 ring-rr-blue ring-offset-1",
                )}
                style={{ height: Math.max(4, life + risk) }}
                title={`${option.deltaDays > 0 ? "+" : ""}${option.deltaDays} days · stub ${formatUsd(
                  option.stubValueUsd,
                )} · green time ${formatUsd(option.greenTimeCostUsd)} · risk ${formatUsd(option.riskCostUsd)}`}
              >
                <div className="w-full rounded-t-sm bg-status-amber" style={{ height: risk }} />
                <div className="w-full bg-rr-blue" style={{ height: life }} />
              </div>
              <span
                className={cn(
                  "rr-numeric text-[10px]",
                  isProposed ? "font-semibold text-rr-ink" : "text-rr-slate",
                )}
              >
                {option.deltaDays > 0 ? `+${option.deltaDays}` : option.deltaDays}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-rr-slate">
        <LegendSwatch className="bg-rr-blue" label="Scrapped life & green time" />
        <LegendSwatch className="bg-status-amber" label="Unplanned-removal risk" />
        <span>Days relative to the planned removal date</span>
      </div>
    </div>
  );
}

export function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

/** Where an engine's removal driver sits: LLP limit versus condition forecast. */
export function LlpDriverBar({ stack }: { stack: EngineLlpStack }) {
  const total = Math.max(stack.minCyclesRemaining, stack.rulCycles, 1);
  const llpPct = (stack.minCyclesRemaining / total) * 100;
  const conditionPct = (stack.rulCycles / total) * 100;
  return (
    <div className="space-y-2">
      <DriverRow label="LLP limit" value={stack.minCyclesRemaining} pct={llpPct} tone="bg-rr-blue" />
      <DriverRow label="Condition RUL" value={stack.rulCycles} pct={conditionPct} tone="bg-status-amber" />
    </div>
  );
}

function DriverRow({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="rr-label w-28 shrink-0 text-rr-slate">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-rr-mist">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className="rr-numeric w-20 shrink-0 text-right text-xs font-semibold text-rr-ink">
        {formatNumber(value)}
      </span>
    </div>
  );
}

/** Compact status summary of an engine's LLP stack, one chip per part. */
export function LlpStackChips({ statuses }: { statuses: StatusLevel[] }) {
  return (
    <span
      className="inline-flex gap-1"
      role="img"
      aria-label={`LLP stack: ${statuses.filter((s) => s === "red").length} at limit, ${
        statuses.filter((s) => s === "amber").length
      } on watch, ${statuses.filter((s) => s === "green").length} within life`}
    >
      {statuses.map((status, index) => (
        <span key={index} className={cn("h-4 w-1.5 rounded-sm", statusStyles[status].dot)} />
      ))}
    </span>
  );
}
