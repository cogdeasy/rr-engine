"use client";

import type { BudgetVarianceRow } from "@rr/types";
import { Column, DataTable, StatusPill, cn, formatUsd, statusStyles } from "@rr/ui";

const columns: Column<BudgetVarianceRow>[] = [
  {
    key: "label",
    header: "Line",
    render: (row) => <span className="font-medium text-rr-ink">{row.label}</span>,
    sortValue: (row) => row.label,
  },
  {
    key: "budget",
    header: "Budget",
    align: "right",
    render: (row) => <span className="rr-numeric text-rr-slate">{formatUsd(row.budgetUsd)}</span>,
    sortValue: (row) => row.budgetUsd,
  },
  {
    key: "actual",
    header: "Actual",
    align: "right",
    render: (row) => <span className="rr-numeric">{formatUsd(row.actualUsd)}</span>,
    sortValue: (row) => row.actualUsd,
  },
  {
    key: "variance",
    header: "Variance",
    align: "right",
    render: (row) => (
      <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>
        {row.varianceUsd >= 0 ? "+" : "−"}
        {formatUsd(Math.abs(row.varianceUsd))}
      </span>
    ),
    sortValue: (row) => row.varianceUsd,
  },
  {
    key: "variancePct",
    header: "%",
    align: "right",
    render: (row) => (
      <StatusPill status={row.status}>
        {row.variancePct >= 0 ? "+" : ""}
        {row.variancePct.toFixed(1)}%
      </StatusPill>
    ),
    sortValue: (row) => row.variancePct,
  },
];

export function BudgetTable({ rows }: { rows: BudgetVarianceRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      rowAccent={(row) => statusStyles[row.status].border}
      initialSortKey="variancePct"
      dense
    />
  );
}
