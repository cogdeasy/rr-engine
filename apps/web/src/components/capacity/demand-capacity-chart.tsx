import type { NetworkMonth } from "@rr/types";
import { cn } from "@rr/ui";

/**
 * Demand vs capacity across the network, month by month. Demand bars are drawn
 * against the contracted bay line; the red cap on each bar is the per-shop
 * shortfall — demand no capable shop can absorb — and is the only red here.
 */
export function DemandCapacityChart({ months }: { months: NetworkMonth[] }) {
  const capacity = months[0]?.capacityBayMonths ?? 1;
  const peak = Math.max(capacity, ...months.map((m) => m.demandBayMonths));
  const scaleMax = Math.ceil((peak * 1.15) / 5) * 5;
  const height = 210;
  const toY = (value: number) => height - (value / scaleMax) * height;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(scaleMax * f));

  return (
    <div className="flex gap-3">
      <div className="relative w-10 shrink-0" style={{ height }}>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="rr-numeric absolute right-0 -translate-y-1/2 text-[10px] leading-none text-rr-slate"
            style={{ top: toY(tick) }}
          >
            {tick}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-rr-ink/6"
              style={{ top: toY(tick) }}
              aria-hidden
            />
          ))}
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-rr-blue"
            style={{ top: toY(capacity) }}
            aria-hidden
          />
          <div className="absolute inset-0 flex items-end gap-2">
            {months.map((month) => {
              // Red is the per-shop shortfall reported elsewhere on the page: spare
              // bays at a shop that cannot take the family do not absorb it.
              const over = month.shortfallBayMonths;
              const absorbed = Math.max(0, month.demandBayMonths - over);
              return (
                <div key={month.month} className="group flex h-full flex-1 flex-col justify-end">
                  {over > 0 ? (
                    <div
                      className="w-full rounded-t-[2px] bg-status-red"
                      style={{ height: (over / scaleMax) * height }}
                      title={`${month.label}: ${over.toFixed(1)} bay-months no capable shop can absorb`}
                    />
                  ) : null}
                  <div
                    className={cn("w-full", month.status === "amber" ? "bg-status-amber/70" : "bg-rr-blue/75", over === 0 && "rounded-t-[2px]")}
                    style={{ height: (absorbed / scaleMax) * height }}
                    title={`${month.label}: ${month.demandBayMonths.toFixed(1)} of ${capacity} bay-months demanded`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          {months.map((month) => (
            <div key={month.month} className="flex-1 text-center">
              <p className="rr-label text-rr-slate">{month.label.split(" ")[0]}</p>
              <p
                className={cn(
                  "rr-numeric text-[11px] font-semibold",
                  month.status === "red" ? "text-status-red" : month.status === "amber" ? "text-status-amber" : "text-rr-slate",
                )}
              >
                {month.utilisationPct}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChartLegend({ capacity }: { capacity: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-rr-slate">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-rr-blue/75" />
        Demand absorbed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-status-red" />
        Shortfall — no bay available
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-rr-blue" />
        Contracted capacity {capacity} bay-months
      </span>
    </div>
  );
}
