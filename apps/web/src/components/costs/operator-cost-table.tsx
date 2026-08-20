"use client";

import * as React from "react";
import type { OperatorCostRow } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  SearchInput,
  Sparkline,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  formatUsd,
} from "@rr/ui";

const CATEGORY_LABEL: Record<string, string> = {
  labour: "Labour",
  materials: "Materials",
  llp: "LLP",
  transport: "Transport",
  penalties: "Penalties",
};

/**
 * Operator league table. Sorted worst-variance first because the decision the
 * page supports is which operator contract to open next.
 */
export function OperatorCostTable({ rows, tolerancePct }: { rows: OperatorCostRow[]; tolerancePct: number }) {
  const [tab, setTab] = React.useState("over");
  const [query, setQuery] = React.useState("");
  const [region, setRegion] = React.useState<string | null>(null);

  const regions = React.useMemo(() => [...new Set(rows.map((row) => row.region))].sort(), [rows]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "over" && row.variancePct < tolerancePct) return false;
      if (tab === "within" && row.variancePct >= tolerancePct) return false;
      if (region && row.region !== region) return false;
      if (term && !`${row.name} ${row.code} ${row.contractKind}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, tab, region, query, tolerancePct]);

  const columns: Column<OperatorCostRow>[] = [
    {
      key: "operator",
      header: "Operator",
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">
            {row.name} <span className="rr-numeric text-rr-slate">{row.code}</span>
          </p>
          <p className="text-[11px] text-rr-slate">
            {row.region} · {row.contractKind} · {row.engines} engines
          </p>
        </div>
      ),
    },
    {
      key: "costPerEfh",
      header: "$/EFH",
      align: "right",
      sortValue: (row) => row.costPerEfh,
      render: (row) => <span className="rr-numeric text-base font-semibold text-rr-ink">{formatNumber(row.costPerEfh, 0)}</span>,
    },
    {
      key: "budget",
      header: "Plan",
      align: "right",
      sortValue: (row) => row.budgetPerEfh,
      render: (row) => <span className="rr-numeric text-rr-slate">{formatNumber(row.budgetPerEfh, 0)}</span>,
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      sortValue: (row) => row.variancePct,
      render: (row) => (
        <StatusPill status={row.status}>
          {row.variancePct >= 0 ? "+" : ""}
          {row.variancePct.toFixed(1)}%
        </StatusPill>
      ),
    },
    {
      key: "delta",
      header: "vs prior qtr",
      align: "right",
      sortValue: (row) => row.deltaPctVsPrior,
      render: (row) => (
        <span className={cn("rr-numeric", row.deltaPctVsPrior > 0 ? "text-status-amber" : "text-status-green")}>
          {row.deltaPctVsPrior >= 0 ? "+" : ""}
          {row.deltaPctVsPrior.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "top",
      header: "Largest block",
      render: (row) => <Badge variant="outline">{CATEGORY_LABEL[row.topCategory] ?? row.topCategory}</Badge>,
    },
    {
      key: "penalties",
      header: "Penalties",
      align: "right",
      sortValue: (row) => row.penaltiesUsd,
      render: (row) => (
        <span className={cn("rr-numeric", row.penaltiesUsd > 0 ? "text-rr-ink" : "text-rr-slate")}>{formatUsd(row.penaltiesUsd)}</span>
      ),
    },
    {
      key: "spend",
      header: "Quarter spend",
      align: "right",
      sortValue: (row) => row.totalCostUsd,
      render: (row) => (
        <div>
          <p className="rr-numeric font-semibold text-rr-ink">{formatUsd(row.totalCostUsd)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(row.efh)} EFH</p>
        </div>
      ),
    },
    {
      key: "history",
      header: "12 months",
      width: "104px",
      render: (row) => <Sparkline points={row.history} status={row.status} height={26} />,
    },
  ];

  const over = rows.filter((row) => row.variancePct >= tolerancePct).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: "over", label: "Over plan", count: over },
            { id: "within", label: "Within plan", count: rows.length - over },
            { id: "all", label: "All operators", count: rows.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <FilterBar>
          <FilterChip label="All regions" active={region === null} onClick={() => setRegion(null)} />
          {regions.map((value) => (
            <FilterChip key={value} label={value} active={region === value} onClick={() => setRegion(value)} />
          ))}
          <SearchInput value={query} onChange={setQuery} placeholder="Operator or contract" />
        </FilterBar>
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.operatorId}
        initialSortKey="variance"
        rowAccent={(row) =>
          row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : "border-status-green"
        }
        emptyMessage="No operators match the current filters."
        dense
      />
    </div>
  );
}
