"use client";

import * as React from "react";
import type { FlightDataGap } from "@rr/types";
import { Badge, DataTable, FilterBar, FilterChip, SearchInput, StatusPill, cn, formatDateTime, statusStyles } from "@rr/ui";

const FILTERS = [
  { id: "all", label: "All sectors" },
  { id: "red", label: "Major loss" },
  { id: "amber", label: "Partial" },
  { id: "grey", label: "Nothing received" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function FlightGapsTable({ gaps }: { gaps: FlightDataGap[] }) {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return gaps.filter((gap) => {
      if (filter !== "all" && gap.status !== filter) return false;
      if (!needle) return true;
      return [gap.flightNumber, gap.aircraftTail, gap.route, gap.operatorCode].join(" ").toLowerCase().includes(needle);
    });
  }, [gaps, filter, query]);

  const counts = React.useMemo(() => {
    const base: Record<string, number> = { all: gaps.length };
    for (const gap of gaps) base[gap.status] = (base[gap.status] ?? 0) + 1;
    return base;
  }, [gaps]);

  return (
    <div className="space-y-3">
      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              count={counts[f.id] ?? 0}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            />
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Flight, tail or route" />
      </FilterBar>

      <DataTable
        dense
        rows={rows.slice(0, 60)}
        rowKey={(row) => row.flightId}
        initialSortKey="departed"
        rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
        emptyMessage="No sectors lost a material share of their snapshot."
        columns={[
          {
            key: "flight",
            header: "Sector",
            sortValue: (row) => row.flightNumber,
            render: (row) => (
              <div>
                <p className="font-semibold text-rr-ink">{row.flightNumber}</p>
                <p className="text-[11px] text-rr-slate">
                  {row.operatorCode} · {row.aircraftTail}
                </p>
              </div>
            ),
          },
          {
            key: "route",
            header: "Route",
            sortValue: (row) => row.route,
            render: (row) => <span className="text-rr-slate">{row.route}</span>,
          },
          {
            key: "departed",
            header: "Departed",
            sortValue: (row) => row.departedAt,
            render: (row) => <span className="rr-numeric text-[12px] text-rr-slate">{formatDateTime(row.departedAt)}</span>,
          },
          {
            key: "block",
            header: "Block h",
            align: "right",
            sortValue: (row) => row.blockHours,
            render: (row) => <span className="rr-numeric text-rr-slate">{row.blockHours.toFixed(1)}</span>,
          },
          {
            key: "received",
            header: "Snapshot",
            align: "right",
            sortValue: (row) => row.receivedParameters / row.expectedParameters,
            render: (row) => (
              <span className="rr-numeric font-semibold text-rr-ink">
                {row.receivedParameters}
                <span className="text-rr-slate">/{row.expectedParameters}</span>
              </span>
            ),
          },
          {
            key: "missing",
            header: "Parameters affected",
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.missingParameters.slice(0, 4).map((parameter) => (
                  <Badge key={parameter} variant="outline">
                    {parameter}
                  </Badge>
                ))}
                {row.missingParameters.length > 4 ? (
                  <Badge variant="neutral">+{row.missingParameters.length - 4}</Badge>
                ) : null}
              </div>
            ),
          },
          {
            key: "status",
            header: "Loss",
            align: "right",
            sortValue: (row) => row.expectedParameters - row.receivedParameters,
            render: (row) => (
              <StatusPill status={row.status}>
                <span className={cn("rr-numeric")}>
                  {Math.round(((row.expectedParameters - row.receivedParameters) / row.expectedParameters) * 100)}%
                </span>
              </StatusPill>
            ),
          },
        ]}
      />
      {rows.length > 60 ? (
        <p className="text-[11px] text-rr-slate">Showing the 60 most recent of {rows.length} affected sectors.</p>
      ) : null}
    </div>
  );
}
