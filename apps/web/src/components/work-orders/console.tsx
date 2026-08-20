"use client";

import * as React from "react";
import type { WorkOrderBlockerKind, WorkOrderBlockerSummary, WorkOrderStageSummary, WorkOrderView } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { BoardCard } from "./board-card";
import { WorkOrderDrawer } from "./detail-drawer";

export interface WorkOrdersConsoleProps {
  views: WorkOrderView[];
  stages: WorkOrderStageSummary[];
  blockers: WorkOrderBlockerSummary[];
  priorityQueue: WorkOrderView[];
}

type Lens = "blocked" | "aog" | "overdue" | "all";

const LENSES: { id: Lens; label: string }[] = [
  { id: "blocked", label: "Blocked" },
  { id: "aog", label: "AOG-linked" },
  { id: "overdue", label: "Overdue" },
  { id: "all", label: "All orders" },
];

export function WorkOrdersConsole({ views, stages, blockers, priorityQueue }: WorkOrdersConsoleProps) {
  const [lens, setLens] = React.useState<Lens>("blocked");
  const [blockerKind, setBlockerKind] = React.useState<WorkOrderBlockerKind | null>(null);
  const [facility, setFacility] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState("board");
  const [selected, setSelected] = React.useState<WorkOrderView | null>(null);

  const facilities = React.useMemo(
    () => [...new Set(views.map((v) => v.facilityIcao))].sort(),
    [views],
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return views.filter((view) => {
      if (lens === "blocked" && view.blockers.length === 0) return false;
      if (lens === "aog" && !view.aogLinked) return false;
      if (lens === "overdue" && !view.overdue) return false;
      if (blockerKind && !view.blockers.some((b) => b.kind === blockerKind)) return false;
      if (facility !== "all" && view.facilityIcao !== facility) return false;
      if (needle.length > 0) {
        const haystack = `${view.reference} ${view.engineEsn} ${view.aircraftTail ?? ""} ${view.operatorName} ${view.facilityIcao} ${view.owner} ${view.workOrder.type}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [views, lens, blockerKind, facility, query]);

  const counts = React.useMemo(
    () => ({
      blocked: views.filter((v) => v.blockers.length > 0).length,
      aog: views.filter((v) => v.aogLinked).length,
      overdue: views.filter((v) => v.overdue).length,
      all: views.length,
    }),
    [views],
  );

  const columns: Column<WorkOrderView>[] = React.useMemo(
    () => [
      {
        key: "reference",
        header: "Order",
        sortValue: (row) => row.reference,
        render: (row) => (
          <div>
            <p className="rr-numeric font-semibold text-rr-ink">{row.reference}</p>
            <p className="text-[11px] capitalize text-rr-slate">{row.workOrder.type.replace(/-/g, " ")}</p>
          </div>
        ),
      },
      {
        key: "engine",
        header: "Engine",
        sortValue: (row) => row.engineEsn,
        render: (row) => (
          <div>
            <p className="text-rr-ink">{row.engineEsn}</p>
            <p className="text-[11px] text-rr-slate">
              {row.engineFamily} · {row.aircraftTail ?? "off wing"}
            </p>
          </div>
        ),
      },
      {
        key: "operator",
        header: "Operator",
        sortValue: (row) => row.operatorCode,
        render: (row) => (
          <div>
            <p className="text-rr-ink">{row.operatorCode}</p>
            <p className="text-[11px] text-rr-slate">{row.facilityIcao}</p>
          </div>
        ),
      },
      {
        key: "stage",
        header: "Stage",
        sortValue: (row) => row.stage,
        render: (row) => <span className="capitalize text-rr-ink">{row.stage.replace(/-/g, " ")}</span>,
      },
      {
        key: "owner",
        header: "Owner",
        sortValue: (row) => row.owner,
        render: (row) => <span className="text-rr-slate">{row.owner}</span>,
      },
      {
        key: "ageing",
        header: "Ageing",
        align: "right",
        sortValue: (row) => row.ageingDays,
        render: (row) => <span className="rr-numeric text-rr-slate">{row.ageingDays}d</span>,
      },
      {
        key: "promise",
        header: "Promise",
        align: "right",
        sortValue: (row) => row.daysToPromise,
        render: (row) => (
          <span className={cn("rr-numeric font-semibold", row.overdue ? "text-status-red" : "text-rr-ink")}>
            {row.overdue ? `${Math.abs(row.daysToPromise)}d late` : `${row.daysToPromise}d`}
          </span>
        ),
      },
      {
        key: "progress",
        header: "Cards",
        align: "right",
        sortValue: (row) => row.progressPct,
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1 w-14 overflow-hidden rounded-full bg-rr-mist">
              <div className={cn("h-full rounded-full", statusStyles[row.status].dot)} style={{ width: `${Math.max(3, row.progressPct)}%` }} />
            </div>
            <span className="rr-numeric text-[11px] text-rr-slate">{row.progressPct}%</span>
          </div>
        ),
      },
      {
        key: "blocker",
        header: "Top blocker",
        sortValue: (row) => row.blockers[0]?.title ?? "",
        render: (row) =>
          row.blockers[0] ? (
            <span className={cn("text-[12px]", statusStyles[row.blockers[0].status].text)}>{row.blockers[0].title}</span>
          ) : (
            <span className="text-[12px] text-rr-slate">—</span>
          ),
      },
      {
        key: "status",
        header: "State",
        align: "right",
        sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
        render: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            {row.aogLinked ? <span className="rr-label rounded-full bg-status-red px-1.5 py-0.5 text-white">AOG</span> : null}
            <StatusPill status={row.status}>{row.priority}</StatusPill>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="What is holding work today" subtitle="Open orders grouped by the constraint stopping them" />
          <ul className="space-y-2.5">
            {blockers.map((blocker) => {
              const active = blockerKind === blocker.kind;
              return (
                <li key={blocker.kind}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBlockerKind(active ? null : blocker.kind)}
                    className={cn(
                      "w-full rounded-sm border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                      active ? "border-rr-blue bg-rr-blue-50" : "border-rr-ink/8 hover:border-rr-blue/40",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-rr-ink">{blocker.label}</span>
                      <span className={cn("rr-numeric text-lg font-semibold", statusStyles[blocker.status].text)}>{blocker.orders}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-rr-mist">
                      <div
                        className={cn("h-full rounded-full", statusStyles[blocker.status].dot)}
                        style={{ width: `${Math.round((blocker.orders / Math.max(1, blockers[0]?.orders ?? 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-rr-slate">{blocker.topDetail}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Act first"
            subtitle="Red orders ranked by grounded aircraft, priority, lateness and blocker count"
            actions={<Badge variant="brand">{priorityQueue.length} needing intervention now</Badge>}
          />
          <ul className="space-y-2.5">
            {priorityQueue.map((view) => (
              <li key={view.workOrder.id} className="rounded-sm border border-rr-ink/8 border-l-2 border-l-status-red p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{view.reference}</span>
                      {view.aogLinked ? <span className="rr-label rounded-full bg-status-red px-1.5 py-0.5 text-white">AOG</span> : null}
                      {view.overdue ? (
                        <span className="rr-label rounded-full bg-status-red-soft px-1.5 py-0.5 text-status-red">
                          {Math.abs(view.daysToPromise)}d late
                        </span>
                      ) : null}
                      <span className="text-[11px] text-rr-slate">
                        {view.engineEsn} · {view.operatorCode} · {view.facilityIcao}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-status-red">{view.recommendation.action}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-rr-slate">{view.recommendation.rationale}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setSelected(view)}>
                    Open order
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar>
            {LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={lens === item.id}
                onClick={() => setLens(item.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                  lens === item.id ? "border-rr-blue bg-rr-blue text-white" : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                )}
              >
                {item.label}
                <span className="rr-numeric opacity-70">{counts[item.id]}</span>
              </button>
            ))}
            {blockerKind ? (
              <button
                type="button"
                onClick={() => setBlockerKind(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rr-blue/30 bg-rr-blue-50 px-3 py-1 text-xs font-medium text-rr-blue"
              >
                {blockers.find((b) => b.kind === blockerKind)?.label}
                <span aria-hidden>×</span>
                <span className="sr-only">Clear blocker filter</span>
              </button>
            ) : null}
          </FilterBar>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="wo-facility">
              Facility
            </label>
            <select
              id="wo-facility"
              value={facility}
              onChange={(event) => setFacility(event.target.value)}
              className="h-8 rounded-full border border-rr-ink/12 bg-surface px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
            >
              <option value="all">All facilities</option>
              {facilities.map((icao) => (
                <option key={icao} value={icao}>
                  {icao}
                </option>
              ))}
            </select>
            <SearchInput value={query} onChange={setQuery} placeholder="Order, engine, tail, owner" />
          </div>
        </div>

        <Tabs
          className="mt-4"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "board", label: "Execution board", count: filtered.length },
            { id: "table", label: "Order register", count: filtered.length },
          ]}
        />

        <p className="mt-3 text-[11px] text-rr-slate">
          Showing {formatNumber(filtered.length)} of {formatNumber(views.length)} work orders. Select any order for task cards, parts,
          labour and blocker detail.
        </p>
      </Panel>

      {tab === "board" ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {stages.map((stage) => {
              const inStage = filtered.filter((v) => v.stage === stage.stage);
              return (
                <section key={stage.stage} className="min-w-0 rounded-sm bg-rr-mist/70 p-2">
                  <header className="flex items-baseline justify-between px-1 pb-2">
                    <div>
                      <p className="rr-label text-rr-ink">{stage.label}</p>
                      <p className="text-[10px] text-rr-slate">
                        {inStage.filter((v) => v.overdue).length} overdue
                      </p>
                    </div>
                    <span className="rr-numeric text-sm font-semibold text-rr-slate">{inStage.length}</span>
                  </header>
                  <div className="space-y-2">
                    {inStage.slice(0, 12).map((view) => (
                      <BoardCard key={view.workOrder.id} view={view} onOpen={setSelected} />
                    ))}
                    {inStage.length === 0 ? <p className="px-1 py-6 text-center text-[11px] text-rr-slate">Nothing here</p> : null}
                    {inStage.length > 12 ? (
                      <p className="px-1 pt-1 text-[11px] text-rr-slate">+{inStage.length - 12} more in this stage</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.workOrder.id}
            onRowClick={setSelected}
            rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : "border-status-green")}
            initialSortKey="status"
            dense
            emptyMessage="No work orders match the current filters."
          />
        )}

      <WorkOrderDrawer view={selected} onClose={() => setSelected(null)} />
    </>
  );
}
