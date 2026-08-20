import type * as React from "react";
import Link from "next/link";
import { StatTile, cn, formatNumber } from "@rr/ui";
import {
  workOrderBlockerSummary,
  workOrderKpis,
  workOrderPriorityQueue,
  workOrderStageSummary,
  workOrderViews,
} from "@rr/data";
import { WorkOrdersConsole } from "@/components/work-orders/console";

export const metadata = { title: "Work orders" };

const HERO_SURFACE: React.CSSProperties = {
  backgroundImage: [
    "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
    "radial-gradient(120% 100% at 80% 0%, rgba(59,50,194,0.55) 0%, rgba(11,13,51,0) 60%)",
    "linear-gradient(160deg, #0b0d33 0%, #05061f 60%, #10069f 240%)",
  ].join(", "),
  backgroundSize: "48px 48px, 48px 48px, auto, auto",
};

export default function WorkOrdersPage() {
  const views = workOrderViews();
  const kpis = workOrderKpis();
  const stages = workOrderStageSummary();
  const blockers = workOrderBlockerSummary();
  const priorityQueue = workOrderPriorityQueue(5);

  const cycleDelta = kpis.avgCycleTimeDays - kpis.priorCycleTimeDays;
  const blockedShare = kpis.open === 0 ? 0 : Math.round((kpis.blocked / kpis.open) * 100);

  return (
    <div className="min-w-0 space-y-6">
      <section className="relative overflow-hidden rounded-sm px-8 py-9 text-white" style={HERO_SURFACE}>
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Execute · Work orders</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {kpis.blocked} of {kpis.open} open work orders are blocked today
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every order below carries the constraint stopping it, the accountable owner and a single recommended action.
              Red means the order cannot progress today; amber means it will stall inside the promise window.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#execution-board"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the blocked queue
                <span aria-hidden>›</span>
              </a>
              <Link
                href="/execute/task-cards"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Task card execution
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-5">
            <HeroStat label="AOG-linked" value={kpis.aogLinked} tone="red" caption="aircraft grounded" />
            <HeroStat label="Overdue" value={kpis.overdue} tone="red" caption="past promise date" />
            <HeroStat label="Awaiting parts" value={kpis.awaitingParts} tone="amber" caption="material short" />
            <HeroStat label="Critical" value={kpis.criticalOpen} tone="amber" caption="priority orders" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
        <StatTile
          label="Open orders"
          value={formatNumber(kpis.open)}
          caption={`${blockedShare}% currently blocked`}
          status={blockedShare > 50 ? "amber" : "grey"}
        />
        <StatTile
          label="Overdue"
          value={formatNumber(kpis.overdue)}
          status={kpis.overdue > 0 ? "red" : "green"}
          caption="Past the promised completion date"
        />
        <StatTile
          label="Awaiting parts"
          value={formatNumber(kpis.awaitingParts)}
          status={kpis.awaitingParts > 0 ? "amber" : "green"}
          caption="Held for material at the induction base"
        />
        <StatTile
          label="Average cycle time"
          value={formatNumber(kpis.avgCycleTimeDays, 1)}
          unit="days"
          status={cycleDelta > 0 ? "amber" : "green"}
          caption={`${cycleDelta >= 0 ? "+" : ""}${formatNumber(cycleDelta, 1)} days vs prior orders closed`}
        />
        <StatTile
          label="Labour booked"
          value={formatNumber(kpis.labourHoursBooked)}
          unit="h"
          caption="Against open orders across the network"
        />
      </section>

      <div id="execution-board" className="min-w-0 space-y-5 scroll-mt-24">
        <WorkOrdersConsole views={views} stages={stages} blockers={blockers} priorityQueue={priorityQueue} />
      </div>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber"; caption: string }) {
  const colour = tone === "red" ? "text-status-red-soft" : "text-status-amber";
  const dot = tone === "red" ? "bg-status-red" : "bg-status-amber";
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
