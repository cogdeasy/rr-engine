import type { BorescopeModuleTrend } from "@rr/types";
import { Panel, PanelHeader, cn, statusStyles } from "@rr/ui";

/**
 * Findings by engine module and severity across the fleet, with the quarterly
 * exceedance count so a rising module is obvious without reading the table.
 */
export function ModuleTrendPanel({ trends }: { trends: BorescopeModuleTrend[] }) {
  const maxQuarter = Math.max(1, ...trends.flatMap((t) => t.history.map((h) => h.total)));

  return (
    <Panel>
      <PanelHeader
        title="Findings by module and severity"
        subtitle="Every recorded finding across the managed fleet; red bars are findings beyond the serviceable limit"
      />
      <ul className="space-y-4">
        {trends.map((trend) => {
          const total = Math.max(1, trend.total);
          return (
            <li key={trend.moduleCode} className="grid grid-cols-12 items-center gap-4">
              <div className="col-span-3">
                <p className="text-[13px] font-medium text-rr-ink">{trend.label}</p>
                <p className="rr-label text-rr-slate">
                  {trend.moduleCode} · {trend.findingRate} per inspection
                </p>
              </div>
              <div className="col-span-5">
                <div className="flex h-3 overflow-hidden rounded-full bg-rr-mist">
                  {trend.red > 0 ? <div className="bg-status-red" style={{ width: `${(trend.red / total) * 100}%` }} /> : null}
                  {trend.amber > 0 ? <div className="bg-status-amber" style={{ width: `${(trend.amber / total) * 100}%` }} /> : null}
                  {trend.green > 0 ? <div className="bg-status-green" style={{ width: `${(trend.green / total) * 100}%` }} /> : null}
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">
                  <span className="rr-numeric font-semibold text-status-red">{trend.red}</span> beyond limit ·{" "}
                  <span className="rr-numeric font-semibold text-status-amber">{trend.amber}</span> monitored ·{" "}
                  <span className="rr-numeric">{trend.total}</span> total
                </p>
              </div>
              <div className="col-span-4 flex items-end justify-end gap-1.5" aria-hidden>
                {trend.history.map((quarter) => (
                  <div key={quarter.period} className="flex w-9 flex-col items-center gap-1">
                    <div className="flex h-12 w-full items-end justify-center gap-0.5">
                      <div
                        className="w-2.5 rounded-t-sm bg-rr-blue/25"
                        style={{ height: `${Math.max(3, (quarter.total / maxQuarter) * 100)}%` }}
                        title={`${quarter.total} findings in ${quarter.period}`}
                      />
                      <div
                        className={cn("w-2.5 rounded-t-sm", quarter.exceedances > 0 ? "bg-status-red" : "bg-rr-mist")}
                        style={{ height: `${Math.max(3, (quarter.exceedances / maxQuarter) * 100)}%` }}
                        title={`${quarter.exceedances} exceedances in ${quarter.period}`}
                      />
                    </div>
                    <span className="rr-label text-[9px] text-rr-slate">{quarter.period}</span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
        <LegendSwatch className={statusStyles.red.dot} label="Beyond serviceable limit — act now" />
        <LegendSwatch className={statusStyles.amber.dot} label="Within limit, on watch" />
        <LegendSwatch className={statusStyles.green.dot} label="Serviceable as found" />
        <LegendSwatch className="bg-rr-blue/25" label="Quarterly findings" />
      </div>
    </Panel>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", className)} />
      {label}
    </span>
  );
}
