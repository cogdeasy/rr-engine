import type { BuildEvent } from "@rr/types";
import { StatusPill, cn, formatDate, statusStyles } from "@rr/ui";
import { EVENT_LABEL } from "./labels";

/** Chronological record of every configuration change made to the engine. */
export function BuildTimeline({
  events,
  facilityName,
}: {
  events: BuildEvent[];
  facilityName: (id: string) => string;
}) {
  if (events.length === 0) {
    return <p className="px-1 py-8 text-center text-xs text-rr-slate">No build history recorded for this engine.</p>;
  }

  return (
    <ol className="relative space-y-0 border-l border-rr-ink/10 pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative pb-6 last:pb-0">
          <span
            className={cn(
              "absolute -left-[1.9rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white",
              statusStyles[event.status].dot,
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="rr-numeric text-xs font-semibold text-rr-ink">{formatDate(event.at)}</span>
            <span className="text-sm font-semibold text-rr-ink">{EVENT_LABEL[event.kind]}</span>
            {event.moduleCode ? (
              <span className="rr-label text-rr-slate">{event.moduleCode}</span>
            ) : null}
            {event.status !== "green" ? (
              <StatusPill status={event.status}>
                {event.status === "red" ? "Airworthiness impact" : "Watchlist"}
              </StatusPill>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-rr-slate">{event.reason}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-rr-slate">
            <span>{facilityName(event.facilityId)}</span>
            {event.fromSerial && event.toSerial ? (
              <span className="rr-numeric">
                <span className="text-rr-slate/70 line-through">{event.fromSerial}</span>
                <span aria-label="replaced by" className="px-1.5 text-rr-slate/70">
                  →
                </span>
                <span className="font-semibold text-rr-ink">{event.toSerial}</span>
              </span>
            ) : null}
            <span className="rr-numeric">{event.reference}</span>
            <span>Certified {event.certifiedBy}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
