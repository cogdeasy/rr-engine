"use client";

import * as React from "react";
import Link from "next/link";
import type { EngineExposure, StatusLevel } from "@rr/types";
import {
  Badge,
  DataTable,
  DriverBreakdownBar,
  DriverLegend,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  SeverityMeter,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";

type BandId = "all" | "red" | "amber" | "green";

const ROW_ACCENT: Record<StatusLevel, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

const BANDS: { id: BandId; label: string }[] = [
  { id: "all", label: "All engines" },
  { id: "red", label: "Act now" },
  { id: "amber", label: "Watchlist" },
  { id: "green", label: "Nominal" },
];

/**
 * Engine-level exposure ledger: which engines have accumulated the harshest
 * environment, what it is made of, and what it costs them in interval.
 */
export function ExposureExplorer({ engines }: { engines: EngineExposure[] }) {
  const [band, setBand] = React.useState<BandId>("red");
  const [operator, setOperator] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const operators = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const engine of engines) seen.set(engine.operatorCode, (seen.get(engine.operatorCode) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [engines]);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return engines
      .filter((engine) => (band === "all" ? true : engine.status === band))
      .filter((engine) => (operator ? engine.operatorCode === operator : true))
      .filter((engine) =>
        needle.length === 0
          ? true
          : [engine.esn, engine.family, engine.operatorName, engine.aircraftTail ?? "", engine.worstRouteLabel ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(needle),
      )
      .sort((a, b) => b.severityIndex - a.severityIndex);
  }, [engines, band, operator, query]);

  const counts = React.useMemo(
    () => ({
      all: engines.length,
      red: engines.filter((e) => e.status === "red").length,
      amber: engines.filter((e) => e.status === "amber").length,
      green: engines.filter((e) => e.status === "green").length,
    }),
    [engines],
  );

  const columns: Column<EngineExposure>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <Link href={`/engines/${row.engineId}`} className="font-semibold text-rr-ink hover:text-rr-blue">
            {row.esn}
          </Link>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.aircraftTail ?? "off wing"} · {row.operatorCode}
          </p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity index",
      align: "right",
      sortValue: (row) => row.severityIndex,
      width: "170px",
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rr-numeric text-base font-semibold", statusStyles[row.status].text)}>{row.severityIndex}</span>
          <SeverityMeter value={row.severityIndex} status={row.status} />
        </div>
      ),
    },
    {
      key: "breakdown",
      header: "Contribution",
      width: "150px",
      render: (row) => <DriverBreakdownBar contributions={row.contributions} total={100} />,
    },
    {
      key: "route",
      header: "Harshest routing",
      sortValue: (row) => row.worstRouteLabel ?? "",
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.worstRouteLabel ?? "—"}</p>
          <p className="text-[11px] text-rr-slate">
            {row.sectors} sectors · {row.harshSectorPct}% harsh
          </p>
        </div>
      ),
    },
    {
      key: "deterioration",
      header: "Margin loss",
      align: "right",
      sortValue: (row) => row.deteriorationRate,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.deteriorationRate}</p>
          <p className="text-[11px] text-rr-slate">°C / 1,000 cyc</p>
        </div>
      ),
    },
    {
      key: "interval",
      header: "Interval",
      align: "right",
      sortValue: (row) => row.intervalDeltaCycles,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">
            {formatNumber(row.baselineIntervalCycles)} → <span className="font-semibold">{formatNumber(row.adjustedIntervalCycles)}</span>
          </p>
          <p className="text-[11px] text-rr-slate">{formatNumber(row.intervalDeltaCycles)} cycles</p>
        </div>
      ),
    },
    {
      key: "remaining",
      header: "To adjusted removal",
      align: "right",
      sortValue: (row) => row.cyclesToAdjustedRemoval,
      render: (row) => (
        <span
          className={cn(
            "rr-numeric text-[13px] font-semibold",
            row.cyclesToAdjustedRemoval <= 0 ? "text-status-red" : row.cyclesToAdjustedRemoval < 500 ? "text-status-amber" : "text-rr-ink",
          )}
        >
          {row.cyclesToAdjustedRemoval <= 0 ? `${formatNumber(Math.abs(row.cyclesToAdjustedRemoval))} over` : formatNumber(row.cyclesToAdjustedRemoval)}
        </span>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      width: "230px",
      render: (row) => (
        <div className="flex items-start gap-2">
          <StatusPill status={row.status} />
          <span className="text-[12px] leading-snug text-rr-slate">{row.recommendedAction}</span>
        </div>
      ),
    },
  ];

  return (
    <Panel padded={false}>
      <div className="p-5 pb-3">
        <PanelHeader
          title="Engine exposure ledger"
          subtitle="Every managed engine scored on the environment it has actually flown through, with the interval that severity supports"
          actions={<Badge variant="outline">{rows.length} shown</Badge>}
          className="pb-3"
        />
        <Tabs
          tabs={BANDS.map((b) => ({ id: b.id, label: b.label, count: counts[b.id] }))}
          active={band}
          onChange={(id) => setBand(id as BandId)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <FilterBar>
            <FilterChip label="All operators" active={operator === null} onClick={() => setOperator(null)} />
            {operators.map(([code, count]) => (
              <FilterChip key={code} label={code} count={count} active={operator === code} onClick={() => setOperator(code)} />
            ))}
          </FilterBar>
          <div className="flex items-center gap-3">
            <DriverLegend />
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail, route" />
          </div>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.engineId}
        rowAccent={(row) => ROW_ACCENT[row.status]}
        initialSortKey="severity"
        emptyMessage="No engines match this filter."
        dense
        className="rounded-none border-0 shadow-none"
      />
    </Panel>
  );
}
