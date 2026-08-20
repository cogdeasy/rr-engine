"use client";

import * as React from "react";
import Link from "next/link";
import type { LlpFleetRow } from "@rr/types";
import {
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  LlpStackChips,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

type DriverFilter = "all" | LlpFleetRow["driver"];

const DRIVER_FILTERS: { id: DriverFilter; label: string }[] = [
  { id: "all", label: "All engines" },
  { id: "llp-limited", label: "LLP-limited" },
  { id: "condition-limited", label: "Condition-limited" },
  { id: "balanced", label: "Balanced" },
];

const PAGE_SIZE = 40;

const DRIVER_LABEL: Record<LlpFleetRow["driver"], string> = {
  "llp-limited": "LLP limit",
  "condition-limited": "Condition",
  balanced: "Balanced",
};

/** Fleet-wide ranking of LLP exposure, filterable by what drives the removal. */
export function LlpFleetTable({ rows }: { rows: LlpFleetRow[] }) {
  const [driver, setDriver] = React.useState<DriverFilter>("all");
  const [query, setQuery] = React.useState("");
  const [redOnly, setRedOnly] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (driver !== "all" && row.driver !== driver) return false;
      if (redOnly && row.status !== "red") return false;
      if (!needle) return true;
      return (
        row.esn.toLowerCase().includes(needle) ||
        row.operatorName.toLowerCase().includes(needle) ||
        row.family.toLowerCase().includes(needle) ||
        row.limitingPartNumber.toLowerCase().includes(needle)
      );
    });
  }, [rows, driver, query, redOnly]);

  const columns: Column<LlpFleetRow>[] = [
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
            {row.family} · {row.operatorCode} · {row.aircraftTail ?? "off wing"}
          </p>
        </div>
      ),
    },
    {
      key: "stack",
      header: "Stack",
      render: (row) => <LlpStackChips statuses={row.stackStatuses} />,
    },
    {
      key: "limiting",
      header: "Limiting part",
      sortValue: (row) => row.limitingPartNumber,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.limitingPartNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {row.limitingModuleCode} · S/N {row.limitingSerialNumber}
          </p>
        </div>
      ),
    },
    {
      key: "remaining",
      header: "Cycles left",
      align: "right",
      sortValue: (row) => row.minCyclesRemaining,
      render: (row) => (
        <div>
          <p className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>{formatNumber(row.minCyclesRemaining)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatDate(row.llpExpiryDate)}</p>
        </div>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      sortValue: (row) => row.driver,
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-rr-ink">{DRIVER_LABEL[row.driver]}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            RUL {formatNumber(row.rulCycles)} · EGT {row.egtMargin}°C
          </p>
        </div>
      ),
    },
    {
      key: "removal",
      header: "Planned removal",
      align: "right",
      sortValue: (row) => row.proposedRemovalDate,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{formatDate(row.proposedRemovalDate)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {row.daysToRemoval < 0 ? `${Math.abs(row.daysToRemoval)}d overdue` : `in ${formatNumber(row.daysToRemoval)}d`}
          </p>
        </div>
      ),
    },
    {
      key: "stub",
      header: "Stub exposed",
      align: "right",
      sortValue: (row) => row.stubValueUsd,
      render: (row) => (
        <div>
          <p className={cn("rr-numeric font-semibold", row.stubValueUsd > 400_000 ? "text-status-amber" : "text-rr-ink")}>
            {row.stubValueUsd > 0 ? formatUsd(row.stubValueUsd) : "—"}
          </p>
          <p className="text-[11px] text-rr-slate">{row.mustReplaceCount} parts scrapped</p>
        </div>
      ),
    },
    {
      key: "recommendation",
      header: "Recommendation",
      align: "right",
      sortValue: (row) => row.netBenefitUsd,
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-rr-ink">{row.recommendedAction}</p>
          <p className={cn("rr-numeric text-[11px]", row.netBenefitUsd > 0 ? "text-status-green" : "text-rr-slate")}>
            {row.netBenefitUsd > 0 ? `saves ${formatUsd(row.netBenefitUsd)}` : "no change"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      sortValue: (row) => row.status,
      render: (row) => <StatusPill status={row.status} />,
    },
  ];

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 pb-4">
        <PanelHeader
          className="pb-0"
          title="Fleet LLP exposure"
          subtitle={`${formatNumber(visible.length)} of ${formatNumber(rows.length)} managed engines, ranked by how soon the stack forces a removal`}
        />
        <FilterBar>
          {DRIVER_FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              active={driver === filter.id}
              onClick={() => setDriver(filter.id)}
              count={filter.id === "all" ? rows.length : rows.filter((row) => row.driver === filter.id).length}
            />
          ))}
          <FilterChip
            label="Red only"
            active={redOnly}
            onClick={() => setRedOnly((value) => !value)}
            count={rows.filter((row) => row.status === "red").length}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator or part" />
        </FilterBar>
      </div>
      <DataTable
        className="border-0 shadow-none"
        columns={columns}
        rows={showAll ? visible : visible.slice(0, PAGE_SIZE)}
        rowKey={(row) => row.engineId}
        rowAccent={(row) => statusStyles[row.status].dot.replace("bg-", "border-")}
        emptyMessage="No engines match the current filters."
        dense
      />
      {visible.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-rr-ink/8 px-5 py-3">
          <p className="text-[11px] text-rr-slate">
            Showing {formatNumber(showAll ? visible.length : PAGE_SIZE)} of {formatNumber(visible.length)} engines
          </p>
          <Button size="sm" variant="secondary" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show top 40" : `Show all ${formatNumber(visible.length)}`}
          </Button>
        </div>
      )}
    </Panel>
  );
}
