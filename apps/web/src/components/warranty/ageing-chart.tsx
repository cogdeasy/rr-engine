import type { WarrantyAgeingBucket } from "@rr/types";
import { cn, formatUsd, statusStyles } from "@rr/ui";

const BAR: Record<string, string> = {
  red: "bg-status-red",
  amber: "bg-status-amber",
  green: "bg-status-green",
  grey: "bg-status-grey",
};

/**
 * Ageing profile of open claims. Cash sitting in the 180+ bucket is the reason
 * this chart exists — it is the value the desk is failing to convert.
 */
export function AgeingChart({ buckets }: { buckets: WarrantyAgeingBucket[] }) {
  const maxValue = Math.max(1, ...buckets.map((b) => b.valueUsd));

  return (
    <ul className="space-y-3">
      {buckets.map((bucket) => (
        <li key={bucket.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-rr-ink">{bucket.label}</span>
            <span className="rr-numeric text-[11px] text-rr-slate">
              {bucket.count} claim{bucket.count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-6 flex-1 overflow-hidden rounded-sm bg-rr-mist">
              <div
                className={cn("h-full rounded-sm", BAR[bucket.status])}
                style={{ width: `${Math.max(bucket.valueUsd > 0 ? 3 : 0, (bucket.valueUsd / maxValue) * 100)}%` }}
              />
            </div>
            <span className={cn("rr-numeric w-20 shrink-0 text-right text-[13px] font-semibold", statusStyles[bucket.status].text)}>
              {formatUsd(bucket.valueUsd)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
