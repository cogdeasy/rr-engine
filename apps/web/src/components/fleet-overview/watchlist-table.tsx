"use client";

import Link from "next/link";
import { DataTable, StatusPill, cn, formatNumber, type Column } from "@rr/ui";
import type { StatusLevel } from "@rr/types";

export interface WatchlistRow {
  engineId: string;
  esn: string;
  family: string;
  tail: string;
  operator: string;
  egtMargin: number;
  rulCycles: number;
  alerts: number;
  healthScore: number;
  status: StatusLevel;
}

const columns: Column<WatchlistRow>[] = [
  {
    key: "engine",
    header: "Engine",
    sortValue: (row) => row.esn,
    render: (row) => (
      <>
        <Link href={`/engines/${row.engineId}`} className="font-semibold text-rr-ink hover:text-rr-blue">
          {row.esn}
        </Link>
        <p className="text-[11px] text-rr-slate">
          {row.family} · {row.tail}
        </p>
      </>
    ),
  },
  { key: "operator", header: "Operator", sortValue: (row) => row.operator, render: (row) => <span className="text-rr-slate">{row.operator}</span> },
  {
    key: "egtMargin",
    header: "EGT margin",
    align: "right",
    sortValue: (row) => row.egtMargin,
    render: (row) => (
      <span
        className={cn(
          "rr-numeric font-semibold",
          row.egtMargin < 12 ? "text-status-red" : row.egtMargin < 25 ? "text-status-amber" : "text-rr-ink",
        )}
      >
        {row.egtMargin}°C
      </span>
    ),
  },
  {
    key: "rulCycles",
    header: "Cycles left",
    align: "right",
    sortValue: (row) => row.rulCycles,
    render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.rulCycles)}</span>,
  },
  {
    key: "alerts",
    header: "Alerts",
    align: "right",
    sortValue: (row) => row.alerts,
    render: (row) => <span className="rr-numeric text-rr-slate">{row.alerts}</span>,
  },
  {
    key: "health",
    header: "Health",
    align: "right",
    sortValue: (row) => row.healthScore,
    render: (row) => <StatusPill status={row.status}>{row.healthScore}</StatusPill>,
  },
];

const accent: Record<StatusLevel, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

export function WatchlistTable({ rows }: { rows: WatchlistRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.engineId}
      rowAccent={(row) => accent[row.status]}
      emptyMessage="No engines on the watchlist."
    />
  );
}
