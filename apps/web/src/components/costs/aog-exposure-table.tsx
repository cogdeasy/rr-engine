"use client";

import * as React from "react";
import type { AogExposureRow } from "@rr/types";
import type { Column } from "@rr/ui";
import { DataTable, StatusPill, formatUsd, relativeTime } from "@rr/ui";

/** Grounded aircraft priced as daily disruption exposure, worst first. */
export function AogExposureTable({ rows }: { rows: AogExposureRow[] }) {
  const columns: Column<AogExposureRow>[] = [
    {
      key: "tail",
      header: "Aircraft",
      sortValue: (row) => row.tail,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">{row.tail}</p>
          <p className="text-[11px] text-rr-slate">
            {row.aircraftType} · {row.operatorCode} · ESN {row.engineEsn}
          </p>
        </div>
      ),
    },
    {
      key: "cause",
      header: "Cause",
      render: (row) => (
        <div className="max-w-xs">
          <p className="text-rr-ink">{row.cause}</p>
          <p className="text-[11px] text-rr-slate">Down {relativeTime(row.downSinceAt)}</p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days to recover",
      align: "right",
      sortValue: (row) => row.expectedDaysRemaining,
      render: (row) => <span className="rr-numeric text-base font-semibold text-rr-ink">{row.expectedDaysRemaining}</span>,
    },
    {
      key: "daily",
      header: "Disruption / day",
      align: "right",
      sortValue: (row) => row.dailyDisruptionCostUsd,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatUsd(row.dailyDisruptionCostUsd)}</span>,
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      sortValue: (row) => row.exposureUsd,
      render: (row) => <span className="rr-numeric text-base font-semibold text-rr-ink">{formatUsd(row.exposureUsd)}</span>,
    },
    {
      key: "action",
      header: "Recommended action",
      render: (row) => <p className="max-w-xs text-[11px] leading-relaxed text-rr-slate">{row.recommendedAction}</p>,
    },
    {
      key: "status",
      header: "State",
      align: "right",
      render: (row) => (
        <StatusPill status={row.status}>{row.status === "red" ? "Act now" : row.status === "amber" ? "Watch" : "Recovering"}</StatusPill>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      initialSortKey="exposure"
      rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : undefined)}
      emptyMessage="No aircraft are grounded — no disruption exposure today."
      dense
    />
  );
}
