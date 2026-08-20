import type { ShortageRisk } from "@rr/types";
import { cn, formatDate } from "@rr/ui";

/**
 * Ninety-day material horizon. Each row runs from today to the required-on-dock
 * date; the red overhang past that mark is the shop-visit delay the shortage
 * causes, which is the only thing coloured red on the chart.
 */
export function CoverageHorizon({
  shortages,
  horizonDays,
  startDays = 0,
}: {
  shortages: ShortageRisk[];
  horizonDays: number;
  startDays?: number;
}) {
  const span = horizonDays - startDays;
  const pct = (days: number) => ((Math.max(startDays, Math.min(horizonDays, days)) - startDays) / span) * 100;
  // Quarter marks across whatever span is asked for, so the axis stays legible
  // (and keys stay unique) for horizons other than the default 90 days.
  const ticks = [0, 1, 2, 3].map((i) => Math.round(startDays + (span * i) / 3));

  return (
    <div>
      <div className="mb-2 grid grid-cols-[38%_62%] gap-3" aria-hidden>
        <span />
        <div className="relative h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={cn(
                "rr-label absolute text-[10px] text-rr-slate",
                tick === 0 ? "left-0" : tick === horizonDays ? "right-0" : "-translate-x-1/2",
              )}
              style={tick === 0 || tick === horizonDays ? undefined : { left: `${pct(tick)}%` }}
            >
              {tick === 0 ? "Today" : `+${tick}d`}
            </span>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {shortages.map((shortage) => {
          const coverDays = shortage.daysToRequired + shortage.gapDays;
          const needPct = pct(shortage.daysToRequired);
          const coverPct = pct(shortage.daysToRequired + shortage.gapDays);
          const clipped = shortage.daysToRequired + shortage.gapDays > horizonDays;
          return (
            <li key={shortage.id} className="grid grid-cols-[38%_62%] items-center gap-3">
              <div className="min-w-0 pr-2">
                <p className="truncate text-xs font-semibold text-rr-ink">{shortage.description}</p>
                <p className="rr-numeric truncate text-[11px] text-rr-slate">
                  {shortage.workOrderReference} · {shortage.engineEsn} · {shortage.facilityName}
                </p>
              </div>
              <div className="relative h-7">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rr-ink/8" />
                <div
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-rr-blue/25"
                  style={{ left: `${pct(0)}%`, width: `${Math.max(0.5, needPct - pct(0))}%` }}
                  title={`Planned window to ${formatDate(shortage.requiredOnDock)}`}
                />
                <div
                  className={cn(
                    "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm",
                    shortage.status === "red" ? "bg-status-red" : "bg-status-amber",
                  )}
                  style={{ left: `${needPct}%`, width: `${Math.max(0.8, coverPct - needPct)}%` }}
                  title={`${shortage.projectedDelayDays} day delay — cover lands ${formatDate(shortage.earliestCoverAt)}`}
                />
                <span
                  className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-rr-ink/40"
                  style={{ left: `${needPct}%` }}
                  title={`Required on dock ${formatDate(shortage.requiredOnDock)}`}
                />
                <span
                  className="rr-numeric absolute top-1/2 -translate-y-1/2 pl-1.5 text-[11px] font-semibold text-status-red"
                  style={{ left: `${Math.min(coverPct, 92)}%` }}
                >
                  {clipped ? `+${shortage.projectedDelayDays}d ›` : `+${shortage.projectedDelayDays}d`}
                </span>
                <span className="sr-only">
                  {shortage.partNumber} required on {formatDate(shortage.requiredOnDock)}, cover in {coverDays} days,{" "}
                  {shortage.projectedDelayDays} day delay.
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
        <LegendSwatch className="bg-rr-blue/25" label="Time to required on dock" />
        <LegendSwatch className="bg-status-red" label="Shop-visit delay caused by the shortage" />
        <LegendSwatch className="bg-status-amber" label="Cover inside five days of need" />
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-1.5 w-6 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}
