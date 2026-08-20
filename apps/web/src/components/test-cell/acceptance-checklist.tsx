import type { AcceptanceCriterion } from "@rr/types";
import { StatusPill, ThresholdBar, cn, formatNumber, statusStyles } from "@rr/ui";
import { TEST_POINT_LABEL } from "./outcome";

/**
 * The acceptance checklist an inspector signs off. Every line states the
 * measured value, the limit it is judged against and how much of the allowable
 * band it consumed, so a red line explains itself without a second click.
 */
export function AcceptanceChecklist({ criteria }: { criteria: AcceptanceCriterion[] }) {
  const ordered = [...criteria].sort((a, b) => b.marginUsedPct - a.marginUsedPct);
  return (
    <div className="divide-y divide-rr-ink/8">
      {ordered.map((criterion) => {
        const dp = Math.abs(criterion.measured) < 20 ? 1 : 0;
        const barMin = Math.min(criterion.measured, criterion.limit, criterion.nominal) * 0.9;
        const barMax = Math.max(criterion.measured, criterion.limit, criterion.nominal) * 1.08;
        return (
          <div key={criterion.id} className="grid grid-cols-12 items-center gap-3 py-3">
            <div className="col-span-4 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[criterion.status].dot)} aria-hidden />
                <p className="truncate text-sm font-medium text-rr-ink">{criterion.label}</p>
              </div>
              <p className="rr-label mt-1 pl-3.5 text-rr-slate">
                {TEST_POINT_LABEL[criterion.testPoint] ?? criterion.testPoint} · ATA {criterion.ataChapter}
              </p>
            </div>
            <div className="col-span-2 text-right">
              <p className={cn("rr-numeric text-base font-semibold", statusStyles[criterion.status].text)}>
                {formatNumber(criterion.measured, dp)}
                <span className="ml-1 text-[11px] font-medium text-rr-slate">{criterion.unit}</span>
              </p>
              <p className="rr-numeric text-[11px] text-rr-slate">
                nominal {formatNumber(criterion.nominal, dp)}
              </p>
            </div>
            <div className="col-span-4">
              <ThresholdBar
                value={criterion.measured}
                min={Math.round(barMin * 10) / 10}
                max={Math.round(barMax * 10) / 10}
                amber={criterion.warn}
                red={criterion.limit}
                unit={criterion.unit}
                direction={criterion.direction}
              />
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2">
              <span className="rr-numeric text-xs text-rr-slate">{Math.round(criterion.marginUsedPct)}% used</span>
              <StatusPill status={criterion.status}>
                {criterion.status === "red" ? "Out" : criterion.status === "amber" ? "Watch" : "In limit"}
              </StatusPill>
            </div>
          </div>
        );
      })}
    </div>
  );
}
