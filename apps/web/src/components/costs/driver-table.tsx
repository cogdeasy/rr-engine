"use client";

import * as React from "react";
import type { CostDriver } from "@rr/types";
import type { Column } from "@rr/ui";
import { Badge, DataTable, FilterBar, FilterChip, StatusPill, cn, formatNumber, formatUsd } from "@rr/ui";

const CATEGORY_LABEL: Record<string, string> = {
  labour: "Labour",
  materials: "Materials",
  llp: "LLP",
  transport: "Transport",
  penalties: "Penalties",
};

/** Top cost drivers with the unit economics behind each one. */
export function DriverTable({ drivers }: { drivers: CostDriver[] }) {
  const [category, setCategory] = React.useState<string | null>(null);
  const categories = React.useMemo(() => [...new Set(drivers.map((driver) => driver.category))], [drivers]);
  const rows = category ? drivers.filter((driver) => driver.category === category) : drivers;

  const columns: Column<CostDriver>[] = [
    {
      key: "label",
      header: "Driver",
      sortValue: (row) => row.label,
      render: (row) => (
        <div className="w-[210px]">
          <p className="font-semibold text-rr-ink">{row.label}</p>
          {row.recommendedAction ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-rr-slate">{row.recommendedAction}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (row) => <Badge variant="outline">{CATEGORY_LABEL[row.category] ?? row.category}</Badge>,
    },
    {
      key: "events",
      header: "Events/yr",
      align: "right",
      sortValue: (row) => row.events,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatNumber(row.events)}</span>,
    },
    {
      key: "unit",
      header: "Unit cost",
      align: "right",
      sortValue: (row) => row.unitCostUsd,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatUsd(row.unitCostUsd)}</span>,
    },
    {
      key: "annual",
      header: "Annual",
      align: "right",
      sortValue: (row) => row.annualCostUsd,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatUsd(row.annualCostUsd)}</span>,
    },
    {
      key: "perEfh",
      header: "$/EFH",
      align: "right",
      sortValue: (row) => row.costPerEfh,
      render: (row) => <span className="rr-numeric text-base font-semibold text-rr-ink">{formatNumber(row.costPerEfh, 1)}</span>,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      sortValue: (row) => row.sharePct,
      render: (row) => (
        <span className="rr-numeric text-rr-slate">{row.sharePct.toFixed(1)}%</span>
      ),
    },
    {
      key: "delta",
      header: "vs prior",
      align: "right",
      sortValue: (row) => row.deltaPctVsPrior,
      render: (row) => (
        <span className={cn("rr-numeric font-semibold", row.status === "red" ? "text-status-red" : row.status === "amber" ? "text-status-amber" : "text-status-green")}>
          {row.deltaPctVsPrior >= 0 ? "+" : ""}
          {row.deltaPctVsPrior.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "status",
      header: "State",
      align: "right",
      render: (row) => (
        <StatusPill status={row.status}>{row.status === "red" ? "Act now" : row.status === "amber" ? "Watch" : "Nominal"}</StatusPill>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterChip label="All categories" active={category === null} onClick={() => setCategory(null)} />
        {categories.map((value) => (
          <FilterChip
            key={value}
            label={CATEGORY_LABEL[value] ?? value}
            active={category === value}
            onClick={() => setCategory(value)}
          />
        ))}
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSortKey="perEfh"
        rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : undefined)}
        dense
      />
    </div>
  );
}
