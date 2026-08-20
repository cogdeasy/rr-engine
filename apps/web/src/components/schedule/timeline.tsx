"use client";

import * as React from "react";
import type { ScheduleEvent, ScheduleMonth } from "@rr/types";
import { cn, statusStyles } from "@rr/ui";

export const KIND_LABEL: Record<ScheduleEvent["kind"], string> = {
  "shop-visit": "Shop visit",
  "module-swap": "Module change",
  "on-wing-task": "On-wing task",
  borescope: "Borescope",
  "line-check": "Line check",
  "forecast-removal": "Forecast removal",
};

export const STATE_LABEL: Record<ScheduleEvent["state"], string> = {
  committed: "Committed",
  planned: "Planned",
  forecast: "Forecast",
  unscheduled: "Unscheduled",
};

const BAR_FILL: Record<ScheduleEvent["status"], string> = {
  red: "bg-status-red",
  amber: "bg-status-amber",
  green: "bg-status-green",
  grey: "bg-status-grey",
};

export interface TimelineRow {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  aircraftTail: string | null;
  status: ScheduleEvent["status"];
  events: ScheduleEvent[];
}

/** Groups events into one timeline lane per engine, worst status first. */
export function buildRows(events: ScheduleEvent[]): TimelineRow[] {
  const byEngine = new Map<string, TimelineRow>();
  const rank: Record<ScheduleEvent["status"], number> = { red: 0, amber: 1, green: 2, grey: 3 };
  for (const event of events) {
    const row = byEngine.get(event.engineId);
    if (row) {
      row.events.push(event);
      if (rank[event.status] < rank[row.status]) row.status = event.status;
    } else {
      byEngine.set(event.engineId, {
        engineId: event.engineId,
        esn: event.esn,
        family: event.family,
        operatorCode: event.operatorCode,
        aircraftTail: event.aircraftTail,
        status: event.status,
        events: [event],
      });
    }
  }
  return [...byEngine.values()].sort(
    (a, b) => rank[a.status] - rank[b.status] || a.esn.localeCompare(b.esn),
  );
}

function offsets(event: ScheduleEvent, windowStart: number, windowMs: number) {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const left = ((start - windowStart) / windowMs) * 100;
  const width = ((end - start) / windowMs) * 100;
  return {
    left: Math.max(0, Math.min(99, left)),
    width: Math.max(0.8, Math.min(100 - Math.max(0, left), width)),
  };
}

export function ScheduleTimeline({
  rows,
  months,
  windowStart,
  windowEnd,
  selectedId,
  onSelect,
}: {
  rows: TimelineRow[];
  months: ScheduleMonth[];
  windowStart: string;
  windowEnd: string;
  selectedId: string | null;
  onSelect: (event: ScheduleEvent) => void;
}) {
  const startMs = new Date(windowStart).getTime();
  const windowMs = new Date(windowEnd).getTime() - startMs;
  const quarters = months.filter((m) => m.index % 3 === 0);

  return (
    <div className="overflow-hidden">
      {/* Month scale */}
      <div className="flex border-b border-rr-ink/10 pb-2">
        <div className="w-48 shrink-0" />
        <div className="relative flex-1">
          <div className="flex">
            {quarters.map((month) => (
              <div key={month.index} className="flex-1 border-l border-rr-ink/10 pl-1.5">
                <span className="rr-label text-[9px] text-rr-slate">{month.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-y-auto">
        {rows.map((row) => (
          <div key={row.engineId} className="flex items-center border-b border-rr-ink/5 last:border-0">
            <div className={cn("w-48 shrink-0 border-l-2 py-2 pl-3", statusStyles[row.status].border.replace("border-", "border-l-"))}>
              <p className="truncate text-[13px] font-semibold text-rr-ink">{row.esn}</p>
              <p className="truncate text-[11px] text-rr-slate">
                {row.operatorCode} · {row.family.replace("Trent ", "T")} · {row.aircraftTail ?? "off wing"}
              </p>
            </div>
            <div className="relative h-11 flex-1">
              {/* quarter gridlines */}
              <div className="absolute inset-0 flex" aria-hidden>
                {quarters.map((month) => (
                  <div key={month.index} className="flex-1 border-l border-rr-ink/5" />
                ))}
              </div>
              {row.events.map((event) => {
                const { left, width } = offsets(event, startMs, windowMs);
                const selected = event.id === selectedId;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelect(event)}
                    aria-label={`${KIND_LABEL[event.kind]} for ${event.esn}, ${STATE_LABEL[event.state]}, ${event.statusReason}`}
                    title={`${event.esn} · ${KIND_LABEL[event.kind]} · ${event.statusReason}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={cn(
                      "absolute top-1/2 h-5 -translate-y-1/2 rounded-[3px] text-left transition-[box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rr-blue",
                      BAR_FILL[event.status],
                      event.state === "forecast" && "opacity-55",
                      event.state === "unscheduled" && "ring-1 ring-inset ring-white/70",
                      selected ? "ring-2 ring-rr-blue ring-offset-1" : "hover:brightness-110",
                    )}
                  >
                    <span className="sr-only">{event.reference}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-12 text-center text-xs text-rr-slate">No events match the current filters.</p>
        ) : null}
      </div>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-rr-slate">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-[2px] bg-status-red" aria-hidden /> No slot before life expiry or a blocked dependency
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-[2px] bg-status-amber" aria-hidden /> Slot at risk — watch
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-[2px] bg-status-green" aria-hidden /> Slot holds
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-[2px] bg-status-green opacity-55" aria-hidden /> Faded = forecast, not yet a work order
      </span>
    </div>
  );
}
