import { AttainmentBar, MetricReading, Sparkline, StatusPill, TrendArrow, cn, statusStyles } from "@rr/ui";
import type { ReliabilityMetricDefinition, ScorecardRow } from "@rr/types";

/**
 * Target-vs-actual scorecard. Each tile carries the reading, the commitment it
 * is measured against and the reason it is coloured the way it is.
 */
export function ScorecardGrid({
  rows,
  definitions,
}: {
  rows: ScorecardRow[];
  definitions: ReliabilityMetricDefinition[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {rows.map((row) => {
        const definition = definitions.find((d) => d.id === row.metricId)!;
        const better = definition.direction === "higher-is-better";
        const good = row.trend === "flat" ? undefined : (row.trend === "up") === better;
        const gap = row.value - row.target;
        return (
          <div key={row.id} className={cn("rr-panel flex flex-col gap-3 border-t-2 p-4", statusStyles[row.status].border.replace("border-", "border-t-"))}>
            <div className="flex items-start justify-between gap-2">
              <span className="rr-label text-rr-slate">{definition.shortLabel}</span>
              <StatusPill status={row.status} />
            </div>
            <MetricReading value={row.value} unit={definition.unit} decimals={row.decimals} status={row.status} />
            <Sparkline points={row.history} status={row.status} height={26} />
            <AttainmentBar attainmentPct={row.attainmentPct} status={row.status} />
            <div className="flex items-center justify-between text-[11px] text-rr-slate">
              <span className="rr-numeric">
                target {definition.target}
                {definition.unit === "%" ? "%" : ""}
              </span>
              <span className="rr-numeric font-semibold text-rr-ink">{row.attainmentPct}% of target</span>
            </div>
            <p className="text-[11px] leading-snug text-rr-slate">
              <TrendArrow trend={row.trend} good={good} />{" "}
              {gap === 0
                ? "on commitment"
                : `${Math.abs(gap).toLocaleString("en-GB", { maximumFractionDigits: row.decimals })}${/^[a-z]/i.test(definition.unit) ? " " : ""}${definition.unit} ${gap > 0 ? "above" : "below"} target`}{" "}
              over the rolling window.
            </p>
          </div>
        );
      })}
    </div>
  );
}
