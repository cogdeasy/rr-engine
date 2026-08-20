"use client";

import * as React from "react";
import {
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  TrendArrow,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
  type Column,
} from "@rr/ui";
import type { RecurringDefect } from "@rr/types";

const VISIBLE_ROWS = 12;

/** Top recurring defects, filterable by family and by disposition. */
export function DefectTable({ defects }: { defects: RecurringDefect[] }) {
  const [query, setQuery] = React.useState("");
  const [family, setFamily] = React.useState<string>("all");

  const families = React.useMemo(() => [...new Set(defects.map((d) => d.family))].sort(), [defects]);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return defects.filter((defect) => {
      if (family !== "all" && defect.family !== family) return false;
      if (!needle) return true;
      return `${defect.title} ${defect.family} ${defect.moduleCode} ${defect.ataChapter}`.toLowerCase().includes(needle);
    });
  }, [defects, family, query]);

  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);

  const columns: Column<RecurringDefect>[] = [
    {
      key: "defect",
      header: "Defect",
      sortValue: (row) => row.title,
      render: (row) => (
        <div className={cn("border-l-2 -ml-4 pl-4", statusStyles[row.status].border.replace("border-", "border-l-"))}>
          <p className="font-medium text-rr-ink">{row.title}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.moduleCode} · ATA {row.ataChapter}
          </p>
        </div>
      ),
    },
    {
      key: "occurrences",
      header: "Events",
      align: "right",
      sortValue: (row) => row.occurrences,
      render: (row) => <span className="rr-numeric font-semibold text-rr-ink">{row.occurrences}</span>,
    },
    {
      key: "engines",
      header: "Engines",
      align: "right",
      sortValue: (row) => row.engines,
      render: (row) => (
        <span className="rr-numeric text-rr-slate">
          {row.engines} <span className="text-[11px]">/ {row.operators} ops</span>
        </span>
      ),
    },
    {
      key: "mtbf",
      header: "MTBF (EFH)",
      align: "right",
      sortValue: (row) => row.mtbfHours,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatNumber(row.mtbfHours)}</span>,
    },
    {
      key: "trend",
      header: "Trend",
      align: "center",
      sortValue: (row) => row.trend,
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-rr-slate">
          <TrendArrow trend={row.trend} good={row.trend === "flat" ? undefined : row.trend === "down"} />
          {row.trend}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last event",
      align: "right",
      sortValue: (row) => row.lastOccurredAt,
      render: (row) => <span className="text-[12px] text-rr-slate">{relativeTime(row.lastOccurredAt)}</span>,
    },
    {
      key: "action",
      header: "Recommended action",
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusPill status={row.status} />
          <span className="text-[12px] text-rr-slate">{row.recommendedAction}</span>
        </div>
      ),
    },
  ];

  return (
    <Panel padded={false}>
      <PanelHeader
        className="p-5 pb-3"
        title="Top recurring defects"
        subtitle="Repeat in-service events of high or critical severity, grouped by mode and engine family"
        actions={
          <FilterBar>
            <FilterChip label="All families" active={family === "all"} onClick={() => setFamily("all")} count={defects.length} />
            {families.map((name) => (
              <FilterChip
                key={name}
                label={name}
                active={family === name}
                onClick={() => setFamily(name)}
                count={defects.filter((d) => d.family === name).length}
              />
            ))}
            <SearchInput value={query} onChange={setQuery} placeholder="Search defects" />
          </FilterBar>
        }
      />
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        initialSortKey="occurrences"
        dense
        className="rounded-none border-0"
        emptyMessage="No recurring defects match the current filters."
      />
      {rows.length > VISIBLE_ROWS ? (
        <div className="flex items-center justify-between border-t border-rr-ink/8 px-5 py-3 text-[12px] text-rr-slate">
          <span>
            Showing {visible.length} of {rows.length} recurring defect groups, worst first.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show top 12" : `Show all ${rows.length}`}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
