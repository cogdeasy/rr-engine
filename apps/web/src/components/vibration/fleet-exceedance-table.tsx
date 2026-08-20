"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { StatusLevel } from "@rr/types";
import { Badge, DataTable, FilterBar, FilterChip, SearchInput, StatusPill, cn, statusStyles, type Column } from "@rr/ui";

export interface FleetVibrationRow {
  engineId: string;
  esn: string;
  family: string;
  operatorName: string;
  operatorCode: string;
  tail: string | null;
  location: string;
  status: StatusLevel;
  worstShaft: string;
  worstIps: number;
  limitIps: number;
  ratio: number;
  broadbandIps: number;
  hoursAtExceedance: number;
  signature: string;
  confidence: number;
  onWingRecoverable: boolean;
  actionWindowHours: number | null;
  severityScore: number;
}

type FilterId = "all" | "red" | "amber" | "trim" | "damage";

/**
 * Fleet-wide exceedance ranking. Ordered by severity so the top row is the
 * engine the analyst should open next.
 */
export function FleetExceedanceTable({ rows, selectedId }: { rows: FleetVibrationRow[]; selectedId: string }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [query, setQuery] = React.useState("");

  const counts = {
    all: rows.length,
    red: rows.filter((r) => r.status === "red").length,
    amber: rows.filter((r) => r.status === "amber").length,
    trim: rows.filter((r) => r.onWingRecoverable).length,
    damage: rows.filter((r) => !r.onWingRecoverable).length,
  };

  const filtered = rows.filter((row) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "trim"
          ? row.onWingRecoverable
          : filter === "damage"
            ? !row.onWingRecoverable
            : row.status === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      q.length === 0 ||
      [row.esn, row.family, row.operatorName, row.operatorCode, row.tail ?? "", row.location, row.signature]
        .join(" ")
        .toLowerCase()
        .includes(q);
    return matchesFilter && matchesQuery;
  });

  const columns: Column<FleetVibrationRow>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className={cn("text-[13px] font-semibold", row.engineId === selectedId ? "text-rr-blue" : "text-rr-ink")}>{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.tail ?? "off wing"}
          </p>
        </div>
      ),
    },
    {
      key: "operator",
      header: "Operator",
      sortValue: (row) => row.operatorName,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.operatorCode}</p>
          <p className="text-[11px] text-rr-slate">{row.location}</p>
        </div>
      ),
    },
    {
      key: "worst",
      header: "Worst tracked order",
      align: "right",
      sortValue: (row) => row.ratio,
      render: (row) => (
        <div>
          <p className={cn("rr-numeric text-sm font-semibold", statusStyles[row.status].text)}>
            {row.worstIps.toFixed(2)} <span className="text-[11px] font-medium text-rr-slate">IPS</span>
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            1x {row.worstShaft} · {Math.round(row.ratio * 100)}% of {row.limitIps}
          </p>
        </div>
      ),
    },
    {
      key: "broadband",
      header: "Broadband",
      align: "right",
      sortValue: (row) => row.broadbandIps,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-ink">{row.broadbandIps.toFixed(2)}</span>,
    },
    {
      key: "hours",
      header: "Hrs at exceedance",
      align: "right",
      sortValue: (row) => row.hoursAtExceedance,
      render: (row) => (
        <span className={cn("rr-numeric text-[13px] text-rr-ink", row.hoursAtExceedance > 500 && "font-semibold")}>
          {row.hoursAtExceedance.toLocaleString("en-GB")}
        </span>
      ),
    },
    {
      key: "signature",
      header: "Interpreted signature",
      sortValue: (row) => row.signature,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.signature}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{Math.round(row.confidence * 100)}% confidence</p>
        </div>
      ),
    },
    {
      key: "disposition",
      header: "Disposition",
      sortValue: (row) => (row.onWingRecoverable ? 0 : 1),
      render: (row) =>
        row.onWingRecoverable ? (
          <Badge variant="brand">Trim on wing</Badge>
        ) : (
          <StatusPill status={row.status === "green" ? "amber" : row.status}>Inspect</StatusPill>
        ),
    },
    {
      key: "window",
      header: "Action within",
      align: "right",
      sortValue: (row) => row.actionWindowHours ?? 100000,
      render: (row) => (
        <span className={cn("rr-numeric text-[13px]", (row.actionWindowHours ?? 9999) <= 48 ? "text-status-red font-semibold" : "text-rr-slate")}>
          {row.actionWindowHours === null ? "—" : `${row.actionWindowHours}h`}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="All exceedances" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label="Alert limit" count={counts.red} active={filter === "red"} onClick={() => setFilter("red")} />
          <FilterChip label="Advisory" count={counts.amber} active={filter === "amber"} onClick={() => setFilter("amber")} />
          <FilterChip label="Trimmable on wing" count={counts.trim} active={filter === "trim"} onClick={() => setFilter("trim")} />
          <FilterChip label="Damage suspected" count={counts.damage} active={filter === "damage"} onClick={() => setFilter("damage")} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator, signature" />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.engineId}
        initialSortKey="worst"
        dense
        rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : "border-status-green")}
        onRowClick={(row) => router.push(`/health/vibration?engine=${row.engineId}`, { scroll: true })}
        emptyMessage="No engines match this filter — the monitored fleet is inside vibration limits."
      />
    </div>
  );
}
