"use client";

import * as React from "react";
import Link from "next/link";
import type { BorescopeReinspection } from "@rr/types";
import { Button, DataTable, StatusPill, cn, formatDate, formatNumber, type Column } from "@rr/ui";

/** Engines whose repeat borescope is overdue (red) or due inside 150 cycles (amber). */
export function ReinspectionTable({ rows }: { rows: BorescopeReinspection[] }) {
  const columns: Column<BorescopeReinspection>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <Link href={`/engines/${row.engineId}`} className="rr-numeric text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
            {row.esn}
          </Link>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.tail ?? "off wing"}
          </p>
        </div>
      ),
    },
    { key: "operator", header: "Operator", sortValue: (row) => row.operatorCode, render: (row) => <span className="text-rr-slate">{row.operatorCode}</span> },
    {
      key: "last",
      header: "Last inspected",
      sortValue: (row) => row.lastInspectedAt,
      render: (row) => <span className="text-rr-slate">{formatDate(row.lastInspectedAt)}</span>,
    },
    {
      key: "interval",
      header: "Interval",
      align: "right",
      sortValue: (row) => row.intervalCycles,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.intervalCycles)} cyc</span>,
    },
    {
      key: "since",
      header: "Cycles since",
      align: "right",
      sortValue: (row) => row.cyclesSince,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatNumber(row.cyclesSince)}</span>,
    },
    {
      key: "due",
      header: "Cycles to due",
      align: "right",
      // Negated so the default descending sort puts the most overdue first.
      sortValue: (row) => -row.cyclesToNextDue,
      render: (row) => (
        <span className={cn("rr-numeric font-semibold", row.status === "red" ? "text-status-red" : "text-status-amber")}>
          {row.cyclesToNextDue < 0 ? `${formatNumber(row.cyclesToNextDue)} overdue` : formatNumber(row.cyclesToNextDue)}
        </span>
      ),
    },
    { key: "driver", header: "Why", render: (row) => <span className="text-[12px] text-rr-slate">{row.driver}</span> },
    {
      key: "status",
      header: "State",
      align: "right",
      sortValue: (row) => (row.status === "red" ? 2 : 1),
      render: (row) => <StatusPill status={row.status}>{row.status === "red" ? "Overdue" : "Due soon"}</StatusPill>,
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (row) => (
        <Button variant={row.status === "red" ? "danger" : "secondary"} size="sm">
          {row.status === "red" ? "Schedule now" : "Book slot"}
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.engineId}
      rowAccent={(row) => (row.status === "red" ? "border-status-red" : "border-status-amber")}
      initialSortKey="due"
      dense
      emptyMessage="Every engine is inside its agreed repeat inspection interval."
    />
  );
}
