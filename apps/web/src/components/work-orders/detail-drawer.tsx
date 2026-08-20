"use client";

import * as React from "react";
import Link from "next/link";
import type { WorkOrderView } from "@rr/types";
import { Badge, Button, ProgressBar, StatusPill, cn, formatDate, formatNumber, formatUsd, relativeTime, statusStyles } from "@rr/ui";

/** Right-hand detail drawer: linked alerts, task cards, parts, labour and blockers. */
export function WorkOrderDrawer({ view, onClose }: { view: WorkOrderView | null; onClose: () => void }) {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!view) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  if (!view) return null;
  const wo = view.workOrder;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-rr-ink/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Work order ${view.reference}`}
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-rr-mist shadow-panel"
      >
        <header className="rr-hero-gradient sticky top-0 z-10 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="rr-label text-rr-blue-200">{wo.type.replace(/-/g, " ")} · {view.facilityIcao}</p>
              <h2 className="rr-numeric mt-1 text-2xl font-semibold">{view.reference}</h2>
              <p className="mt-1 text-sm text-rr-cloud">
                {view.engineEsn} · {view.engineFamily} · {view.aircraftTail ?? "off wing"} · {view.operatorName}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close work order detail"
              className="rounded-full border border-white/50 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Close
            </button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-4">
            <HeroFact label="Stage" value={view.stage.replace(/-/g, " ")} />
            <HeroFact label="Ageing" value={`${view.ageingDays}d`} tone={view.ageingDays > 60 ? "amber" : undefined} />
            <HeroFact
              label="Promise"
              value={view.overdue ? `${Math.abs(view.daysToPromise)}d late` : `${view.daysToPromise}d`}
              tone={view.overdue ? "red" : undefined}
            />
            <HeroFact label="Progress" value={`${view.progressPct}%`} />
          </div>
        </header>

        <div className="space-y-4 p-6">
          <section className={cn("rounded-sm border p-4", statusStyles[view.recommendation.status].bg, statusStyles[view.recommendation.status].border)}>
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className={cn("mt-1 text-sm font-semibold", statusStyles[view.recommendation.status].text)}>{view.recommendation.action}</p>
            <p className="mt-1 text-xs leading-relaxed text-rr-slate">{view.recommendation.rationale}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm">Take action</Button>
              <Button size="sm" variant="secondary">
                Reassign owner
              </Button>
            </div>
          </section>

          <section className="rr-panel p-4">
            <p className="rr-label text-rr-slate">Blockers</p>
            {view.blockers.length === 0 ? (
              <p className="mt-2 text-xs text-rr-slate">No blockers recorded — the order is progressing to plan.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {view.blockers.map((blocker) => (
                  <li key={blocker.id} className={cn("border-l-2 pl-3", blocker.status === "red" ? "border-status-red" : "border-status-amber")}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-medium text-rr-ink">{blocker.title}</p>
                      <StatusPill status={blocker.status}>{blocker.kind}</StatusPill>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{blocker.detail}</p>
                    <p className="rr-label mt-1 text-rr-slate">
                      held {blocker.heldDays}d · owner {blocker.owner}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="rr-panel p-4">
              <p className="rr-label text-rr-slate">Labour booked</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
                {formatNumber(view.bookedHours, 0)}
                <span className="ml-1 text-xs font-medium text-rr-slate">of {formatNumber(view.estimatedHours, 0)} h</span>
              </p>
              <ProgressBar
                className="mt-2"
                value={Math.min(100, (view.bookedHours / Math.max(1, view.estimatedHours)) * 100)}
                status={view.bookedHours > view.estimatedHours ? "amber" : "green"}
              />
            </div>
            <div className="rr-panel p-4">
              <p className="rr-label text-rr-slate">Cost</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">{formatUsd(wo.actualCostUsd ?? wo.estimatedCostUsd)}</p>
              <p className="mt-1 text-[11px] text-rr-slate">
                {wo.actualCostUsd ? "actual" : "estimate"} · TAT {wo.tatDays}d · raised {formatDate(wo.raisedAt)}
              </p>
            </div>
          </section>

          <section className="rr-panel p-4">
            <p className="rr-label text-rr-slate">Linked alerts</p>
            {view.alerts.length === 0 ? (
              <p className="mt-2 text-xs text-rr-slate">Raised from the maintenance plan — no triggering alert.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {view.alerts.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 border-b border-rr-ink/5 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="text-[13px] font-medium text-rr-ink">{alert.title}</p>
                      <p className="text-[11px] text-rr-slate">
                        {alert.source} · ATA {alert.ataChapter} · {relativeTime(alert.raisedAt)} · {alert.recommendedAction}
                      </p>
                    </div>
                    <StatusPill status={alert.status}>{alert.severity}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rr-panel p-4">
            <div className="flex items-baseline justify-between">
              <p className="rr-label text-rr-slate">Task cards</p>
              <p className="rr-numeric text-[11px] text-rr-slate">
                {view.taskLines.filter((t) => t.state === "signed-off").length}/{view.taskLines.length} signed off
              </p>
            </div>
            <ul className="mt-2 space-y-2">
              {view.taskLines.map((task) => {
                const status = task.state === "blocked" ? "red" : task.state === "signed-off" ? "green" : task.state === "in-progress" ? "amber" : "grey";
                return (
                  <li key={task.id} className="flex items-start justify-between gap-3 border-b border-rr-ink/5 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-rr-ink">{task.title}</p>
                      <p className="text-[11px] text-rr-slate">
                        {task.reference} · ATA {task.ataChapter} · {task.technicianName ?? "unassigned"}
                        {task.skillGap ? " · no certified technician" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill status={status}>{task.state.replace(/-/g, " ")}</StatusPill>
                      <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
                        {task.bookedHours}/{task.estimatedHours} h
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rr-panel p-4">
            <p className="rr-label text-rr-slate">Parts</p>
            {view.partLines.length === 0 ? (
              <p className="mt-2 text-xs text-rr-slate">No outstanding material demand against this order.</p>
            ) : (
              <table className="mt-2 w-full text-[12px]">
                <thead>
                  <tr className="border-b border-rr-ink/8">
                    <th className="rr-label py-1.5 text-left text-rr-slate">Part</th>
                    <th className="rr-label py-1.5 text-right text-rr-slate">Req</th>
                    <th className="rr-label py-1.5 text-right text-rr-slate">On hand</th>
                    <th className="rr-label py-1.5 text-right text-rr-slate">Lead</th>
                    <th className="rr-label py-1.5 text-right text-rr-slate">State</th>
                  </tr>
                </thead>
                <tbody>
                  {view.partLines.map((part) => (
                    <tr key={part.partNumber} className="border-b border-rr-ink/5 last:border-0">
                      <td className="py-1.5">
                        <p className="rr-numeric text-rr-ink">{part.partNumber}</p>
                        <p className="text-[11px] text-rr-slate">{part.description}</p>
                      </td>
                      <td className="rr-numeric py-1.5 text-right text-rr-ink">{part.qtyRequired}</td>
                      <td className={cn("rr-numeric py-1.5 text-right", part.onHand < part.qtyRequired ? "text-status-red" : "text-rr-ink")}>{part.onHand}</td>
                      <td className="rr-numeric py-1.5 text-right text-rr-slate">{part.leadTimeDays}d</td>
                      <td className="py-1.5 text-right">
                        <StatusPill status={part.status}>{part.status === "green" ? "kitted" : part.status === "amber" ? "inbound" : "short"}</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Badge variant="brand">{view.owner}</Badge>
              <Badge variant="outline">{view.facilityName}</Badge>
            </div>
            <Link href={`/engines/${view.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
              Open engine dossier ›
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function HeroFact({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" }) {
  return (
    <div>
      <p className="rr-label text-rr-cloud/70">{label}</p>
      <p
        className={cn(
          "rr-numeric mt-0.5 text-lg font-semibold capitalize",
          tone === "red" ? "text-status-red-soft" : tone === "amber" ? "text-status-amber" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}
