"use client";

import * as React from "react";
import Link from "next/link";
import type { EngineRulAssessment, EngineSurvivalCurve, RulUrgency } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";
import { SurvivalCurve } from "./survival-curve";

type FilterId = RulUrgency | "all" | "unslotted";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All engines" },
  { id: "act-now", label: "Act now" },
  { id: "watchlist", label: "Watchlist" },
  { id: "unslotted", label: "No slot in plan" },
  { id: "nominal", label: "Nominal" },
];

function matchesFilter(assessment: EngineRulAssessment, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "unslotted") return !assessment.plannedSlot?.insideWindow;
  return assessment.urgency === filter;
}

/**
 * The working surface of the module: the removal queue ranked by shortest
 * remaining life, with the survival evidence for the selected engine beside it.
 */
export function RulExplorer({
  assessments,
  curves,
}: {
  assessments: EngineRulAssessment[];
  curves: Record<string, EngineSurvivalCurve>;
}) {
  const [filter, setFilter] = React.useState<FilterId>("act-now");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(assessments[0]?.engineId ?? "");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assessments.filter((a) => {
      if (!matchesFilter(a, filter)) return false;
      if (!needle) return true;
      return (
        a.esn.toLowerCase().includes(needle) ||
        a.operatorName.toLowerCase().includes(needle) ||
        a.family.toLowerCase().includes(needle) ||
        a.failureMode.toLowerCase().includes(needle) ||
        (a.aircraftTail?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [assessments, filter, query]);

  const selected = assessments.find((a) => a.engineId === selectedId) ?? rows[0] ?? assessments[0];
  const curve = selected ? curves[selected.engineId] : undefined;

  const counts = React.useMemo(
    () =>
      Object.fromEntries(FILTERS.map((f) => [f.id, assessments.filter((a) => matchesFilter(a, f.id)).length])) as Record<
        FilterId,
        number
      >,
    [assessments],
  );

  const columns: Column<EngineRulAssessment>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <span className="font-semibold text-rr-ink">{row.esn}</span>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.aircraftTail ?? "off wing"} · {row.operatorCode}
          </p>
        </div>
      ),
    },
    {
      key: "mode",
      header: "Limiting mode",
      sortValue: (row) => row.failureMode,
      render: (row) => (
        <div>
          <span className="text-[13px] text-rr-ink">{row.failureMode}</span>
          <p className="text-[11px] text-rr-slate">{row.limitingModuleLabel}</p>
        </div>
      ),
    },
    {
      key: "rul",
      header: "RUL cycles",
      align: "right",
      sortValue: (row) => row.rulCycles,
      render: (row) => (
        <div>
          <span className={cn("rr-numeric text-[15px] font-semibold", statusStyles[row.status].text)}>{formatNumber(row.rulCycles)}</span>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {formatNumber(row.confidenceInterval.min)}–{formatNumber(row.confidenceInterval.max)}
          </p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days",
      align: "right",
      sortValue: (row) => row.rulDays,
      render: (row) => (
        <div>
          <span className="rr-numeric text-rr-ink">{formatNumber(row.rulDays)}</span>
          <p className="rr-numeric text-[11px] text-rr-slate">{row.cyclesPerDay}/day</p>
        </div>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      sortValue: (row) => row.confidence,
      render: (row) => (
        <div className="inline-flex w-24 flex-col items-end gap-1">
          <span className="rr-numeric text-[13px] text-rr-ink">{Math.round(row.confidence * 100)}%</span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-rr-mist">
            <span className="block h-full rounded-full bg-rr-blue" style={{ width: `${row.confidence * 100}%` }} />
          </span>
        </div>
      ),
    },
    {
      key: "slot",
      header: "Slot",
      sortValue: (row) => (row.plannedSlot?.insideWindow ? 2 : row.plannedSlot ? 1 : 0),
      render: (row) =>
        row.plannedSlot?.insideWindow ? (
          <StatusPill status="green">{row.plannedSlot.facilityIcao}</StatusPill>
        ) : row.plannedSlot ? (
          <StatusPill status="amber">Out of window</StatusPill>
        ) : (
          <StatusPill status="red">None</StatusPill>
        ),
    },
    {
      key: "action",
      header: "Recommended action",
      render: (row) => <span className="text-[12px] leading-snug text-rr-slate">{row.recommendedAction}</span>,
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-3 xl:col-span-2">
        <FilterBar className="justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <FilterChip key={f.id} label={f.label} count={counts[f.id]} active={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator, failure mode" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.engineId}
          onRowClick={(row) => setSelectedId(row.engineId)}
          rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
          initialSortKey="rul"
          dense
          emptyMessage="No engines match this filter."
        />
      </div>

      {selected ? (
        <Panel className="h-fit space-y-4 xl:sticky xl:top-6">
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                {selected.esn}
                <StatusPill status={selected.status}>
                  {selected.urgency === "act-now" ? "Act now" : selected.urgency === "watchlist" ? "Watchlist" : "Nominal"}
                </StatusPill>
              </span>
            }
            subtitle={`${selected.family} · ${selected.operatorName} · ${selected.location}`}
            actions={
              <Link href={`/engines/${selected.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
                Engine ›
              </Link>
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm bg-rr-mist/70 p-3">
              <p className="rr-label text-rr-slate">Remaining life</p>
              <p className={cn("rr-numeric mt-1 text-3xl font-semibold", statusStyles[selected.status].text)}>
                {formatNumber(selected.rulCycles)}
                <span className="ml-1 text-xs font-medium text-rr-slate">cycles</span>
              </p>
              <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
                80% CI {formatNumber(selected.confidenceInterval.min)}–{formatNumber(selected.confidenceInterval.max)}
              </p>
            </div>
            <div className="rounded-sm bg-rr-mist/70 p-3">
              <p className="rr-label text-rr-slate">Calendar</p>
              <p className="rr-numeric mt-1 text-3xl font-semibold text-rr-ink">
                {formatNumber(selected.rulDays)}
                <span className="ml-1 text-xs font-medium text-rr-slate">days</span>
              </p>
              <p className="rr-numeric mt-1 text-[11px] text-rr-slate">at {selected.cyclesPerDay} cycles/day observed</p>
            </div>
          </div>

          <div>
            <p className="rr-label text-rr-slate">Recommended removal window</p>
            <p className="mt-1 text-sm font-semibold text-rr-ink">
              {formatDate(selected.removalWindow.opensAt)} → {formatDate(selected.removalWindow.closesAt)}
            </p>
            <p className="text-[11px] text-rr-slate">
              {selected.removalWindow.days} days of planning latitude · limiting mode {selected.failureMode} (
              {selected.limitingModuleLabel})
            </p>
          </div>

          {curve ? <SurvivalCurve curve={curve} /> : null}

          <div>
            <p className="rr-label text-rr-slate">Prediction drivers</p>
            <ul className="mt-2 space-y-1.5">
              {selected.drivers.map((driver) => (
                <li key={driver.label} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-[12px] text-rr-ink">{driver.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                    <span className="block h-full rounded-full bg-rr-blue-400" style={{ width: `${Math.min(100, driver.contribution * 200)}%` }} />
                  </span>
                  <span className="rr-numeric w-10 text-right text-[11px] text-rr-slate">{driver.contribution.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={cn("rounded-sm border p-3", statusStyles[selected.status].border, statusStyles[selected.status].bg)}>
            <p className="rr-label text-rr-slate">Why this colour</p>
            <p className="mt-1 text-[12px] leading-relaxed text-rr-ink">{selected.rationale}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rr-ink/8 pt-3">
            <div>
              <p className="rr-label text-rr-slate">Recommended action</p>
              <p className="mt-0.5 max-w-[16rem] text-[12px] leading-snug text-rr-ink">{selected.recommendedAction}</p>
            </div>
            <Button size="sm" variant={selected.urgency === "act-now" ? "primary" : "secondary"}>
              {selected.plannedSlot ? "Open work order" : "Request slot"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-rr-slate">
            <Badge variant="outline">{selected.modelVersion}</Badge>
            <span className="rr-numeric">scored {formatDate(selected.computedAt)}</span>
            {selected.plannedSlot ? (
              <span className="rr-numeric">
                {selected.plannedSlot.reference} · {formatDate(selected.plannedSlot.scheduledStart)} · {selected.plannedSlot.facilityIcao}
              </span>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
