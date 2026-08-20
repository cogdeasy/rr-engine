import type { IngestDay } from "@rr/types";
import { cn, formatNumber, statusStyles } from "@rr/ui";

/**
 * Snapshots received per day against snapshots expected. The pale segment on top
 * of each bar is the shortfall, so a gap day reads as missing volume, not as a dip.
 */
export function IngestTimeline({ days }: { days: IngestDay[] }) {
  const peak = Math.max(...days.map((d) => d.expected), 1);

  return (
    <div>
      <div className="flex items-end gap-1" role="img" aria-label="Daily telemetry snapshots received against expected over the last 30 days">
        {days.map((day) => {
          const expectedHeight = (day.expected / peak) * 100;
          const receivedShare = day.expected === 0 ? 0 : (day.received / day.expected) * 100;
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="flex w-full flex-col justify-end rounded-[2px] bg-rr-mist"
                style={{ height: 132 }}
                title={`${new Date(day.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}: ${formatNumber(
                  day.received,
                )} of ${formatNumber(day.expected)} snapshots (${day.coveragePct}%)`}
              >
                <div className="flex w-full flex-col justify-end rounded-[2px] bg-rr-cloud/50" style={{ height: `${expectedHeight}%` }}>
                  <div className={cn("w-full rounded-b-[2px]", statusStyles[day.status].dot)} style={{ height: `${receivedShare}%` }} />
                </div>
              </div>
              <span className="rr-numeric text-[9px] text-rr-slate">{new Date(day.date).getUTCDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-rr-slate">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-status-green" aria-hidden /> Received
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px] bg-rr-cloud/60" aria-hidden /> Shortfall against expected
        </span>
      </div>
    </div>
  );
}
