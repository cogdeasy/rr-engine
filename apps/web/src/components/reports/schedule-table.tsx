"use client";

import * as React from "react";
import type { ScheduledReport } from "@rr/types";
import { DataTable, FilterBar, FilterChip, SearchInput, StatusPill, formatDate, statusStyles, cn, type Column } from "@rr/ui";

type Filter = "all" | "attention" | "week";

/**
 * The distribution list. Default filter is "needs attention" because the only
 * reason to open this table is to find the runs that did not land.
 */
export function ScheduleTable({ schedules, weekEndIso }: { schedules: ScheduledReport[]; weekEndIso: string }) {
  const [filter, setFilter] = React.useState<Filter>("attention");
  const [query, setQuery] = React.useState("");

  const attention = schedules.filter((s) => s.status === "red" || s.status === "amber");
  const thisWeek = schedules.filter((s) => s.nextRunAt <= weekEndIso);

  const rows = React.useMemo(() => {
    const base =
      filter === "attention"
        ? schedules.filter((s) => s.status === "red" || s.status === "amber")
        : filter === "week"
          ? schedules.filter((s) => s.nextRunAt <= weekEndIso)
          : schedules;
    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((s) => `${s.name} ${s.operatorName} ${s.recipients.join(" ")}`.toLowerCase().includes(needle));
  }, [filter, query, schedules, weekEndIso]);

  const columns: Column<ScheduledReport>[] = [
    {
      key: "name",
      header: "Schedule",
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <p className="text-[13px] font-semibold text-rr-ink">{row.name}</p>
          <p className="text-[11px] text-rr-slate">
            {row.id} · {row.operatorName}
          </p>
        </div>
      ),
    },
    {
      key: "cadence",
      header: "Cadence",
      sortValue: (row) => row.cadence,
      render: (row) => (
        <span className="text-xs capitalize text-rr-slate">
          {row.cadence} · {row.format}
        </span>
      ),
    },
    {
      key: "recipients",
      header: "Recipients",
      render: (row) => (
        <div className="text-[11px] leading-snug text-rr-slate">
          {row.recipients.map((recipient) => (
            <p key={recipient}>{recipient}</p>
          ))}
        </div>
      ),
    },
    {
      key: "lastRun",
      header: "Last run",
      align: "right",
      sortValue: (row) => row.lastRunAt,
      render: (row) => <span className="rr-numeric text-xs text-rr-slate">{formatDate(row.lastRunAt)}</span>,
    },
    {
      key: "nextRun",
      header: "Next run",
      align: "right",
      sortValue: (row) => row.nextRunAt,
      render: (row) => <span className="rr-numeric text-xs text-rr-ink">{formatDate(row.nextRunAt)}</span>,
    },
    {
      key: "status",
      header: "Last outcome",
      sortValue: (row) => row.lastRunStatus,
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={row.status}>{row.lastRunStatus}</StatusPill>
          <span className="text-[11px] text-rr-slate">{row.note}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Needs attention" active={filter === "attention"} onClick={() => setFilter("attention")} count={attention.length} />
          <FilterChip label="Due this week" active={filter === "week"} onClick={() => setFilter("week")} count={thisWeek.length} />
          <FilterChip label="All schedules" active={filter === "all"} onClick={() => setFilter("all")} count={schedules.length} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Operator or recipient" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSortKey="nextRun"
        rowAccent={(row) => (row.status === "grey" ? undefined : cn(statusStyles[row.status].border.replace("border-", "border-l-")))}
        emptyMessage="No schedules match this filter — every pack in scope delivered on time."
      />
    </div>
  );
}
