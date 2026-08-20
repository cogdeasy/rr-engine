"use client";

import * as React from "react";
import type { Column } from "@rr/ui";
import type { TestCellOutcome, TestCellRunSummary } from "@rr/types";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
} from "@rr/ui";
import { OUTCOME_LABEL, OUTCOME_STATUS } from "./outcome";

type OutcomeFilter = TestCellOutcome | "all";

/** Left rail colour on each row, matching the outcome. */
const ROW_ACCENT: Record<string, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

const FILTERS: { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "All outcomes" },
  { id: "fail", label: "Fail" },
  { id: "conditional", label: "Conditional" },
  { id: "running", label: "On bed" },
  { id: "pass", label: "Pass" },
];

/** Complete pass-off history, searchable and sortable. */
export function RunsTable({
  runs,
  operatorNames,
  facilityNames,
}: {
  runs: TestCellRunSummary[];
  operatorNames: Record<string, string>;
  facilityNames: Record<string, string>;
}) {
  const [filter, setFilter] = React.useState<OutcomeFilter>("all");
  const [family, setFamily] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");

  const families = React.useMemo(() => [...new Set(runs.map((r) => r.family))].sort(), [runs]);

  const rows = runs.filter((run) => {
    if (filter !== "all" && run.outcome !== filter) return false;
    if (family !== "all" && run.family !== family) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [run.reference, run.esn, run.family, operatorNames[run.operatorId] ?? "", facilityNames[run.facilityId] ?? ""].some(
      (field) => field.toLowerCase().includes(needle),
    );
  });

  const columns: Column<TestCellRunSummary>[] = [
    {
      key: "esn",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="rr-numeric font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {operatorNames[row.operatorId] ?? row.operatorId}
          </p>
        </div>
      ),
    },
    {
      key: "reference",
      header: "Run",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div>
          <p className="rr-numeric text-rr-ink">{row.reference}</p>
          <p className="text-[11px] text-rr-slate">
            {facilityNames[row.facilityId] ?? row.facilityId} · {row.cellId}
          </p>
        </div>
      ),
    },
    {
      key: "startedAt",
      header: "Run date",
      sortValue: (row) => row.startedAt,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatDate(row.startedAt)}</span>,
    },
    {
      key: "attempt",
      header: "Att.",
      align: "right",
      sortValue: (row) => row.attempt,
      render: (row) => (
        <span className={cn("rr-numeric", row.attempt > 1 ? "font-semibold text-status-amber" : "text-rr-slate")}>
          {row.attempt}
        </span>
      ),
    },
    {
      key: "thrust",
      header: "Thrust",
      align: "right",
      sortValue: (row) => row.thrustAchievedLbf / row.thrustRequiredLbf,
      render: (row) => (
        <div>
          <p className="rr-numeric text-rr-ink">{formatNumber(row.thrustAchievedLbf / 1000, 1)}k</p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {formatNumber((row.thrustAchievedLbf / row.thrustRequiredLbf) * 100, 1)}%
          </p>
        </div>
      ),
    },
    {
      key: "egt",
      header: "EGT margin",
      align: "right",
      sortValue: (row) => row.egtMarginAtTestC,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatNumber(row.egtMarginAtTestC, 1)}°C</span>,
    },
    {
      key: "restoration",
      header: "Restored",
      align: "right",
      sortValue: (row) => row.restorationPct,
      render: (row) => (
        <span
          className={cn(
            "rr-numeric font-medium",
            row.restorationPct >= 85 ? "text-status-green" : row.restorationPct >= 70 ? "text-status-amber" : "text-status-red",
          )}
        >
          {formatNumber(row.restorationPct, 1)}%
        </span>
      ),
    },
    {
      key: "vib",
      header: "Peak vib",
      align: "right",
      sortValue: (row) => row.peakVibrationMm,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.peakVibrationMm, 2)}</span>,
    },
    {
      key: "fuel",
      header: "Fuel flow",
      align: "right",
      sortValue: (row) => row.fuelFlowKgH,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.fuelFlowKgH, 0)}</span>,
    },
    {
      key: "oil",
      header: "Oil l/h",
      align: "right",
      sortValue: (row) => row.oilConsumptionLPerH,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.oilConsumptionLPerH, 2)}</span>,
    },
    {
      key: "cause",
      header: "Governing finding",
      render: (row) => (
        <span className="text-xs text-rr-slate">
          {row.outcome === "running" ? "Schedule in progress" : (row.failureCause ?? "All criteria in limit")}
        </span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      align: "right",
      sortValue: (row) => row.outcome,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {row.releasedToService ? <Badge variant="neutral">Released</Badge> : null}
          <StatusPill status={OUTCOME_STATUS[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</StatusPill>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PanelHeader
          title="Pass-off history"
          subtitle={`${rows.length} of ${runs.length} runs across the generated fleet.`}
          className="pb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, reference, facility" />
          <FilterBar>
            {FILTERS.map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                active={filter === option.id}
                onClick={() => setFilter(option.id)}
                count={option.id === "all" ? runs.length : runs.filter((r) => r.outcome === option.id).length}
              />
            ))}
            <FilterChip label="All families" active={family === "all"} onClick={() => setFamily("all")} />
            {families.map((f) => (
              <FilterChip key={f} label={f} active={family === f} onClick={() => setFamily(f)} />
            ))}
          </FilterBar>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSortKey="startedAt"
        rowAccent={(row) => ROW_ACCENT[OUTCOME_STATUS[row.outcome]]}
        dense
      />
    </div>
  );
}
