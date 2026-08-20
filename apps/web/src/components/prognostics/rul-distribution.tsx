import type { RulDistributionBucket } from "@rr/types";
import { cn, formatNumber, statusStyles } from "@rr/ui";

/**
 * Fleet remaining-life histogram. Bar colour is the planning urgency of the
 * band; the solid inner segment is the share of engines in that band that
 * already have a removal slot inside their window.
 */
export function RulDistribution({ buckets, medianCycles }: { buckets: RulDistributionBucket[]; medianCycles: number }) {
  const max = Math.max(...buckets.map((b) => b.engines), 1);

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 210 }}>
        {buckets.map((bucket) => {
          const height = (bucket.engines / max) * 100;
          const slottedShare = bucket.engines === 0 ? 0 : (bucket.slotted / bucket.engines) * 100;
          const isMedianBand = medianCycles >= bucket.from && medianCycles < bucket.to;
          return (
            <div key={bucket.label} className="flex h-full flex-1 flex-col justify-end gap-2">
              <span className="rr-numeric text-center text-[11px] font-semibold text-rr-ink">{bucket.engines}</span>
              <div
                className={cn("relative w-full rounded-t-[1px]", statusStyles[bucket.status].bg)}
                style={{ height: `${Math.max(height, 1.5)}%` }}
                title={`${bucket.engines} engines with ${bucket.label} cycles remaining, ${bucket.slotted} already slotted`}
              >
                <div className={cn("absolute inset-x-0 bottom-0 rounded-t-[1px]", statusStyles[bucket.status].dot)} style={{ height: `${slottedShare}%`, opacity: 0.85 }} />
                <div className={cn("absolute inset-x-0 top-0 h-0.5", statusStyles[bucket.status].dot)} />
                {isMedianBand ? <div className="absolute -top-4 left-1/2 h-3 w-px -translate-x-1/2 bg-rr-blue" /> : null}
              </div>
              <span className="rr-numeric text-center text-[10px] text-rr-slate">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-[1px] bg-status-red-soft" /> Act now band
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-[1px] bg-status-amber-soft" /> Watchlist band
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-[1px] bg-rr-slate" /> Solid lower segment: slot already booked
          </span>
        </span>
        <span className="rr-numeric">Fleet median {formatNumber(medianCycles)} cycles</span>
      </div>
    </div>
  );
}
