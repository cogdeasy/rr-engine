"use client";

import * as React from "react";
import Link from "next/link";
import type { EnginePerformance } from "@rr/types";
import {
  Badge,
  DataTable,
  DeteriorationLegend,
  DeteriorationSplitBar,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  RecoveryBar,
  SearchInput,
  StatusPill,
  TrendChart,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

const RECOMMENDATION_LABEL: Record<EnginePerformance["washCase"]["recommendation"], string> = {
  "wash-now": "Wash now",
  schedule: "Schedule",
  monitor: "Monitor",
  "not-worthwhile": "Hardware-driven",
};

type FilterId = "all" | "wash-now" | "schedule" | "monitor";

/**
 * Ranked fuel-burn penalty table paired with the wash business case for the
 * selected engine. Selecting a row is the only interaction, so the surrounding
 * page stays a server component.
 */
export function WashWorkbench({
  rows,
  amberLimit,
  redLimit,
}: {
  rows: EnginePerformance[];
  amberLimit: number;
  redLimit: number;
}) {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(rows[0]?.engineId ?? "");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter = filter === "all" || row.washCase.recommendation === filter;
      const matchesQuery =
        q.length === 0 ||
        row.esn.toLowerCase().includes(q) ||
        row.operatorName.toLowerCase().includes(q) ||
        row.family.toLowerCase().includes(q) ||
        (row.aircraftTail?.toLowerCase().includes(q) ?? false);
      return matchesFilter && matchesQuery;
    });
  }, [rows, filter, query]);

  const selected = rows.find((row) => row.engineId === selectedId) ?? filtered[0] ?? rows[0];

  const counts = React.useMemo(
    () => ({
      all: rows.length,
      "wash-now": rows.filter((r) => r.washCase.recommendation === "wash-now").length,
      schedule: rows.filter((r) => r.washCase.recommendation === "schedule").length,
      monitor: rows.filter((r) => r.washCase.recommendation === "monitor").length,
    }),
    [rows],
  );

  const columns: Column<EnginePerformance>[] = [
    {
      key: "engine",
      header: "Engine",
      width: "22%",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <span className="font-semibold text-rr-ink">{row.esn}</span>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.aircraftTail ?? "off wing"} · {row.operatorCode}
          </p>
        </div>
      ),
    },
    {
      key: "sfc",
      header: "SFC dev",
      align: "right",
      sortValue: (row) => row.sfcDeviationPct,
      render: (row) => (
        <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)} title={row.statusReason}>
          +{row.sfcDeviationPct.toFixed(2)}%
        </span>
      ),
    },
    {
      key: "retention",
      header: "Cruise retention",
      align: "right",
      sortValue: (row) => row.cruiseRetentionPct,
      render: (row) => <span className="rr-numeric text-rr-slate">{row.cruiseRetentionPct.toFixed(1)}%</span>,
    },
    {
      key: "split",
      header: "Attribution",
      width: "14%",
      render: (row) => <DeteriorationSplitBar slices={row.attribution} height={6} ariaLabel={`${row.esn} attribution`} />,
    },
    {
      key: "cost",
      header: "Fuel penalty / yr",
      align: "right",
      sortValue: (row) => row.annualFuelPenaltyUsd,
      render: (row) => (
        <div>
          <span className="rr-numeric font-semibold text-rr-ink">{formatUsd(row.annualFuelPenaltyUsd)}</span>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(row.annualCo2PenaltyTonnes)} t CO₂</p>
        </div>
      ),
    },
    {
      key: "payback",
      header: "Wash payback",
      align: "right",
      sortValue: (row) => row.washCase.paybackDays ?? 9999,
      render: (row) => (
        <span className="rr-numeric text-rr-slate">{row.washCase.paybackDays === null ? "—" : `${row.washCase.paybackDays} d`}</span>
      ),
    },
    {
      key: "recommendation",
      header: "Action",
      align: "right",
      sortValue: (row) => row.washCase.netBenefitUsdPerYear,
      render: (row) => (
        <StatusPill status={row.washCase.status}>{RECOMMENDATION_LABEL[row.washCase.recommendation]}</StatusPill>
      ),
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <div className="space-y-3 xl:col-span-3">
        <FilterBar className="justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "wash-now", "schedule", "monitor"] as FilterId[]).map((id) => (
              <FilterChip
                key={id}
                label={id === "all" ? "All ranked" : RECOMMENDATION_LABEL[id]}
                active={filter === id}
                onClick={() => setFilter(id)}
                count={counts[id]}
              />
            ))}
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator, tail" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.engineId}
          onRowClick={(row) => setSelectedId(row.engineId)}
          rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
          initialSortKey="cost"
          dense
          emptyMessage="No engines match these filters."
        />
      </div>

      {selected ? (
        <EngineWashCase engine={selected} amberLimit={amberLimit} redLimit={redLimit} className="xl:col-span-2" />
      ) : null}
    </div>
  );
}

function EngineWashCase({
  engine,
  amberLimit,
  redLimit,
  className,
}: {
  engine: EnginePerformance;
  amberLimit: number;
  redLimit: number;
  className?: string;
}) {
  const wash = engine.washCase;
  const afterSfc = Math.max(0, engine.sfcDeviationPct - wash.fuelRecoveredPct);
  const trendMax = Math.max(...engine.sfcTrend.map((p) => p.v), redLimit);

  return (
    <div className={cn("space-y-4", className)}>
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              {engine.esn}
              <StatusPill status={engine.status} />
            </span>
          }
          subtitle={`${engine.family} · ${engine.operatorName} · ${engine.aircraftTail ?? "off wing"} · ${engine.location}`}
          actions={
            <Link href={`/engines/${engine.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
              Engine dossier ›
            </Link>
          }
        />
        <p className="text-xs leading-relaxed text-rr-slate">{engine.statusReason}</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Figure label="SFC deviation" value={`+${engine.sfcDeviationPct.toFixed(2)}%`} status={engine.status} />
          <Figure label="Cruise retention" value={`${engine.cruiseRetentionPct.toFixed(1)}%`} />
          <Figure label="EGT margin" value={`${engine.egtMargin}°C`} status={engine.egtMargin < 12 ? "red" : engine.egtMargin < 25 ? "amber" : "green"} />
        </div>

        <div className="mt-5">
          <p className="rr-label text-rr-slate">SFC deviation, 24 months</p>
          <TrendChart
            series={{
              id: `${engine.engineId}:sfc`,
              label: "SFC deviation",
              unit: "%",
              points: engine.sfcTrend,
              amberThreshold: amberLimit,
              redThreshold: redLimit,
            }}
            height={150}
          />
          <p className="mt-1 text-[11px] text-rr-slate">
            {engine.lastWash
              ? `Last ${engine.lastWash.kind} ${engine.daysSinceWash} days ago recovered ${engine.lastWash.fuelRecoveredPct.toFixed(2)}pp and ${engine.lastWash.egtRecoveredC}°C.`
              : "No wash recorded on this engine — the whole fouling share is still on the table."}
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Deterioration attribution" subtitle="Only fouling responds to washing" />
        <DeteriorationSplitBar slices={engine.attribution} height={10} ariaLabel={`${engine.esn} attribution`} />
        <DeteriorationLegend slices={engine.attribution} className="mt-3" />
      </Panel>

      <Panel className={cn("border-l-2", statusStyles[wash.status].border.replace("border-", "border-l-"))}>
        <PanelHeader
          title="What a wash buys"
          subtitle={`Modelled on-wing water wash, ${wash.downtimeHours}h off line`}
          actions={<StatusPill status={wash.status}>{RECOMMENDATION_LABEL[wash.recommendation]}</StatusPill>}
        />
        <div className="space-y-3">
          <RecoveryBar label="SFC deviation" before={engine.sfcDeviationPct} after={afterSfc} unit="%" max={trendMax} />
          <RecoveryBar
            label="EGT margin"
            before={engine.egtMargin}
            after={engine.egtMargin + wash.egtMarginRecoveredC}
            unit="°C"
            max={Math.max(60, engine.egtMargin + wash.egtMarginRecoveredC)}
            betterIs="higher"
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Ledger label="Fuel saved" value={`${formatNumber(Math.round(wash.fuelSavedKgPerYear / 1000))} t/yr`} />
          <Ledger label="Value of fuel saved" value={`${formatUsd(wash.fuelSavedUsdPerYear)}/yr`} tone="positive" />
          <Ledger label="CO₂ avoided" value={`${formatNumber(wash.co2SavedTonnesPerYear, 1)} t/yr`} />
          <Ledger label="Wash + downtime cost" value={formatUsd(wash.totalCostUsd)} />
          <Ledger
            label="Net benefit"
            value={`${wash.netBenefitUsdPerYear >= 0 ? "" : "−"}${formatUsd(Math.abs(wash.netBenefitUsdPerYear))}/yr`}
            tone={wash.netBenefitUsdPerYear >= 0 ? "positive" : "negative"}
          />
          <Ledger label="Payback" value={wash.paybackDays === null ? "No payback" : `${wash.paybackDays} days`} />
        </dl>

        <div className="mt-4 rounded-sm bg-rr-blue-50/70 px-3 py-3">
          <p className="rr-label text-rr-blue">Recommended action</p>
          <p className="mt-1 text-xs leading-relaxed text-rr-ink">{wash.rationale}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/plan/schedule?engine=${engine.engineId}`}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                wash.status === "red"
                  ? "bg-rr-blue text-white hover:bg-rr-blue-600"
                  : "border border-rr-blue/25 bg-white text-rr-blue hover:bg-rr-blue-50",
              )}
            >
              {wash.recommendation === "wash-now" ? "Book wash slot" : "Add to next ground event"}
            </Link>
            <Link
              href={`/health/trending?engine=${engine.engineId}`}
              className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold text-rr-slate transition-colors hover:bg-surface hover:text-rr-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
            >
              Open trend detail
            </Link>
            <Badge variant="outline">Env severity {engine.environmentSeverity}/5</Badge>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Figure({ label, value, status }: { label: string; value: string; status?: EnginePerformance["status"] }) {
  return (
    <div className="rounded-sm bg-rr-mist/70 px-3 py-2.5">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>{value}</p>
    </div>
  );
}

function Ledger({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd
        className={cn(
          "rr-numeric mt-0.5 text-sm font-semibold",
          tone === "positive" ? "text-status-green" : tone === "negative" ? "text-status-red" : "text-rr-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
