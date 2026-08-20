"use client";

import type { WorkOrderView } from "@rr/types";
import { Badge, StatusPill, cn, statusStyles } from "@rr/ui";

/** One order on the execution board. Colour is only ever operational state. */
export function BoardCard({ view, onOpen }: { view: WorkOrderView; onOpen: (view: WorkOrderView) => void }) {
  const topBlocker = view.blockers[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(view)}
      aria-label={`Open work order ${view.reference}`}
      className={cn(
        "w-full rounded-sm border border-rr-ink/8 border-l-2 bg-white p-3 text-left transition-colors hover:border-rr-blue/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
        view.status === "red" ? "border-l-status-red" : view.status === "amber" ? "border-l-status-amber" : "border-l-status-green",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{view.reference}</p>
          <p className="truncate text-[11px] text-rr-slate">
            {view.engineEsn} · {view.workOrder.type.replace(/-/g, " ")}
          </p>
        </div>
        {view.aogLinked ? (
          <span className="rr-label shrink-0 rounded-full bg-status-red px-1.5 py-0.5 text-white">AOG</span>
        ) : view.overdue ? (
          <span className="rr-label shrink-0 rounded-full bg-status-red-soft px-1.5 py-0.5 text-status-red">
            {Math.abs(view.daysToPromise)}d late
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-rr-mist">
          <div className={cn("h-full rounded-full", statusStyles[view.status].dot)} style={{ width: `${Math.max(3, view.progressPct)}%` }} />
        </div>
        <span className="rr-numeric text-[10px] text-rr-slate">{view.progressPct}%</span>
      </div>

      {topBlocker ? (
        <p className={cn("mt-2 line-clamp-2 text-[11px] leading-snug", statusStyles[topBlocker.status].text)}>{topBlocker.title}</p>
      ) : (
        <p className="mt-2 text-[11px] text-rr-slate">No blockers — {view.owner}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <StatusPill status={view.status}>{view.priority}</StatusPill>
        <Badge variant="outline">{view.facilityIcao}</Badge>
        <Badge>{view.operatorCode}</Badge>
      </div>
    </button>
  );
}
