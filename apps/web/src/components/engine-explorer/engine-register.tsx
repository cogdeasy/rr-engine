"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EngineExplorerFacets, EngineRegisterRow, EngineSavedView } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  MiniMeter,
  Panel,
  PanelHeader,
  PriorityRank,
  SearchInput,
  Sparkline,
  StatusPill,
  ThresholdValue,
  cn,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { FacetSelect } from "./facet-select";

interface Filters {
  statuses: string[];
  families: string[];
  operators: string[];
  lifeStages: string[];
  regions: string[];
  search: string;
  maxEgtMargin: number | null;
  maxDaysToShopVisit: number | null;
  minOpenAlerts: number | null;
}

const EMPTY: Filters = {
  statuses: [],
  families: [],
  operators: [],
  lifeStages: [],
  regions: [],
  search: "",
  maxEgtMargin: null,
  maxDaysToShopVisit: null,
  minOpenAlerts: null,
};

const CSV_COLUMNS: { header: string; value: (row: EngineRegisterRow) => string | number }[] = [
  { header: "Priority rank", value: (r) => r.priorityRank },
  { header: "Priority score", value: (r) => r.priorityScore },
  { header: "ESN", value: (r) => r.esn },
  { header: "Family", value: (r) => r.family },
  { header: "Build standard", value: (r) => r.buildStandard },
  { header: "Operator", value: (r) => r.operatorName },
  { header: "Region", value: (r) => r.region },
  { header: "Aircraft", value: (r) => r.aircraftTail ?? "" },
  { header: "Aircraft type", value: (r) => r.aircraftType ?? "" },
  { header: "Position", value: (r) => r.position ?? "" },
  { header: "Life stage", value: (r) => r.lifeStage },
  { header: "TSN (h)", value: (r) => r.totalFlightHours },
  { header: "CSN", value: (r) => r.totalFlightCycles },
  { header: "TSO (h)", value: (r) => r.hoursSinceOverhaul },
  { header: "CSO", value: (r) => r.cyclesSinceOverhaul },
  { header: "EGT margin (C)", value: (r) => r.egtMargin },
  { header: "EGT margin % of new", value: (r) => r.egtMarginPctOfNew },
  { header: "Health score", value: (r) => r.healthScore },
  { header: "RUL cycles", value: (r) => r.rulCycles },
  { header: "Days to shop visit", value: (r) => r.daysToShopVisit ?? "" },
  { header: "Open alerts", value: (r) => r.openAlerts },
  { header: "Critical alerts", value: (r) => r.criticalAlerts },
  { header: "Work order", value: (r) => r.workOrderReference ?? "" },
  { header: "Status", value: (r) => r.status },
  { header: "Recommended action", value: (r) => r.recommendedAction },
];

function toCsv(rows: EngineRegisterRow[]): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [CSV_COLUMNS.map((c) => escape(c.header)).join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => escape(c.value(row))).join(","));
  return lines.join("\n");
}

export function EngineRegister({
  rows,
  facets,
  savedViews,
}: {
  rows: EngineRegisterRow[];
  facets: EngineExplorerFacets;
  savedViews: EngineSavedView[];
}) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<Filters>(EMPTY);
  const [viewId, setViewId] = React.useState<string>(savedViews[0]?.id ?? "all");

  const activeView = savedViews.find((v) => v.id === viewId);

  function applyView(view: EngineSavedView) {
    setViewId(view.id);
    setFilters({
      ...EMPTY,
      statuses: view.filters.statuses ?? [],
      families: view.filters.families ?? [],
      operators: view.filters.operators ?? [],
      lifeStages: view.filters.lifeStages ?? [],
      regions: view.filters.regions ?? [],
      search: view.filters.search ?? "",
      maxEgtMargin: view.filters.maxEgtMargin ?? null,
      maxDaysToShopVisit: view.filters.maxDaysToShopVisit ?? null,
      minOpenAlerts: view.filters.minOpenAlerts ?? null,
    });
  }

  function update(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setViewId("custom");
  }

  const filtered = React.useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(row.status)) return false;
      if (filters.families.length > 0 && !filters.families.includes(row.family)) return false;
      if (filters.operators.length > 0 && !filters.operators.includes(row.operatorId)) return false;
      if (filters.lifeStages.length > 0 && !filters.lifeStages.includes(row.lifeStage)) return false;
      if (filters.regions.length > 0 && !filters.regions.includes(row.region)) return false;
      if (filters.maxEgtMargin !== null && row.egtMargin >= filters.maxEgtMargin) return false;
      if (
        filters.maxDaysToShopVisit !== null &&
        (row.daysToShopVisit === null || row.daysToShopVisit > filters.maxDaysToShopVisit)
      ) {
        return false;
      }
      if (filters.minOpenAlerts !== null && row.openAlerts < filters.minOpenAlerts) return false;
      if (query) {
        const haystack = `${row.esn} ${row.aircraftTail ?? ""} ${row.operatorName} ${row.family}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const chips = React.useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    const push = (key: string, label: string, clear: () => void) => out.push({ key, label, clear });
    for (const status of filters.statuses) {
      push(`status-${status}`, `Status ${status}`, () => update({ statuses: filters.statuses.filter((s) => s !== status) }));
    }
    for (const family of filters.families) {
      push(`family-${family}`, family, () => update({ families: filters.families.filter((f) => f !== family) }));
    }
    for (const operatorId of filters.operators) {
      const label = facets.operators.find((o) => o.value === operatorId)?.label ?? operatorId;
      push(`operator-${operatorId}`, label, () => update({ operators: filters.operators.filter((o) => o !== operatorId) }));
    }
    for (const stage of filters.lifeStages) {
      push(`stage-${stage}`, stage.replace(/-/g, " "), () =>
        update({ lifeStages: filters.lifeStages.filter((s) => s !== stage) }),
      );
    }
    for (const region of filters.regions) {
      push(`region-${region}`, region, () => update({ regions: filters.regions.filter((r) => r !== region) }));
    }
    if (filters.maxEgtMargin !== null) {
      push("egt", `EGT margin < ${filters.maxEgtMargin}°C`, () => update({ maxEgtMargin: null }));
    }
    if (filters.maxDaysToShopVisit !== null) {
      push("sv", `Shop visit < ${filters.maxDaysToShopVisit} days`, () => update({ maxDaysToShopVisit: null }));
    }
    if (filters.minOpenAlerts !== null) {
      push("alerts", `${filters.minOpenAlerts}+ open alerts`, () => update({ minOpenAlerts: null }));
    }
    if (filters.search.trim()) push("search", `"${filters.search.trim()}"`, () => update({ search: "" }));
    return out;
  }, [filters, facets]);

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `engine-register-${viewId}-${filtered.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<EngineRegisterRow>[] = [
    {
      key: "rank",
      header: "Rank",
      width: "72px",
      sortValue: (row) => -row.priorityRank,
      render: (row) => (
        <div className="flex items-center gap-2" title={row.drivers.map((d) => d.label).join(" · ")}>
          <PriorityRank rank={row.priorityRank} status={row.status} />
        </div>
      ),
    },
    {
      key: "esn",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div className="min-w-40">
          <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.esn}</span>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.buildStandard}
          </p>
        </div>
      ),
    },
    {
      key: "operator",
      header: "Operator",
      sortValue: (row) => row.operatorName,
      render: (row) => (
        <div className="min-w-32">
          <span className="text-[13px] text-rr-ink">{row.operatorName}</span>
          <p className="text-[11px] text-rr-slate">
            {row.operatorCode} · {row.region}
          </p>
        </div>
      ),
    },
    {
      key: "aircraft",
      header: "Aircraft",
      sortValue: (row) => row.aircraftTail ?? "zzz",
      render: (row) => (
        <div className="min-w-24">
          <span className="rr-numeric text-[13px] text-rr-ink">{row.aircraftTail ?? "Off wing"}</span>
          <p className="text-[11px] text-rr-slate">
            {row.aircraftType ?? row.location}
            {row.position ? ` · pos ${row.position}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "tsn",
      header: "TSN / CSN",
      align: "right",
      sortValue: (row) => row.totalFlightCycles,
      render: (row) => (
        <div className="rr-numeric text-right text-[13px] text-rr-ink">
          {formatNumber(row.totalFlightHours)}
          <p className="text-[11px] text-rr-slate">{formatNumber(row.totalFlightCycles)} cyc</p>
        </div>
      ),
    },
    {
      key: "tso",
      header: "TSO / CSO",
      align: "right",
      sortValue: (row) => row.cyclesSinceOverhaul,
      render: (row) => (
        <div className="rr-numeric text-right text-[13px] text-rr-ink">
          {formatNumber(row.hoursSinceOverhaul)}
          <p className="text-[11px] text-rr-slate">{formatNumber(row.cyclesSinceOverhaul)} cyc</p>
        </div>
      ),
    },
    {
      key: "egt",
      header: "EGT margin",
      align: "right",
      sortValue: (row) => row.egtMargin,
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <ThresholdValue
            value={row.egtMargin.toFixed(1)}
            unit="°C"
            status={row.egtMarginStatus}
            caption={`${row.egtMarginPctOfNew}% of new`}
          />
          <MiniMeter pct={row.egtMarginPctOfNew} status={row.egtMarginStatus} />
        </div>
      ),
    },
    {
      key: "trend",
      header: "Recent sectors",
      width: "108px",
      sortValue: (row) => row.egtMarginDecayPer100Cycles,
      render: (row) => (
        <div className="w-24">
          <Sparkline points={row.egtTrend} status={row.egtMarginStatus} height={22} />
          <p className="rr-numeric mt-0.5 text-[10px] text-rr-slate">
            −{row.egtMarginDecayPer100Cycles.toFixed(1)}°C / 100 sectors
          </p>
        </div>
      ),
    },
    {
      key: "health",
      header: "Health",
      align: "right",
      sortValue: (row) => row.healthScore,
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <ThresholdValue value={row.healthScore} status={row.healthStatus} caption="of 100" />
          <MiniMeter pct={row.healthScore} status={row.healthStatus} />
        </div>
      ),
    },
    {
      key: "rul",
      header: "RUL",
      align: "right",
      sortValue: (row) => row.rulCycles,
      render: (row) => (
        <ThresholdValue
          value={formatNumber(row.rulCycles)}
          unit="cyc"
          status={row.rulStatus}
          caption={row.daysToShopVisit === null ? "no utilisation" : `≈ ${formatNumber(row.daysToShopVisit)} days`}
        />
      ),
    },
    {
      key: "alerts",
      header: "Alerts",
      align: "right",
      sortValue: (row) => row.criticalAlerts * 100 + row.openAlerts,
      render: (row) => (
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "rr-numeric text-[15px] font-semibold leading-none",
              row.criticalAlerts > 0 ? "text-status-red" : row.openAlerts > 0 ? "text-status-amber" : "text-rr-slate",
            )}
          >
            {row.openAlerts}
          </span>
          <span className="mt-1 text-[10px] leading-none text-rr-slate">
            {row.criticalAlerts > 0 ? `${row.criticalAlerts} critical` : row.openAlerts > 0 ? "open" : "clear"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) => (
        <div className="min-w-44">
          <StatusPill status={row.status} />
          <p className="mt-1 text-[11px] leading-snug text-rr-slate">{row.recommendedAction}</p>
        </div>
      ),
    },
  ];

  return (
    <Panel padded={false} className="border-0 bg-transparent">
      <Panel className="mb-4">
        <PanelHeader
          title="Engine register"
          subtitle="Ranked by composite priority score — rank 1 is the engine to work first."
          actions={
            <div className="flex items-center gap-2">
              <span className="rr-numeric text-xs text-rr-slate">
                {formatNumber(filtered.length)} of {formatNumber(rows.length)} engines
              </span>
              <Button variant="secondary" size="sm" onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
          }
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rr-label mr-1 text-rr-slate">Saved views</span>
            {savedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                title={view.description}
                onClick={() => applyView(view)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  viewId === view.id
                    ? "border-rr-blue bg-rr-blue text-white"
                    : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                )}
              >
                {view.label}
              </button>
            ))}
            {viewId === "custom" ? <Badge variant="outline">Custom view</Badge> : null}
          </div>

          <FilterBar>
            <SearchInput
              value={filters.search}
              onChange={(value) => update({ search: value })}
              placeholder="Search ESN, tail or operator"
              className="w-64"
            />
            <FacetSelect
              label="Family"
              options={facets.families}
              selected={filters.families}
              onChange={(values) => update({ families: values })}
            />
            <FacetSelect
              label="Operator"
              options={facets.operators}
              selected={filters.operators}
              onChange={(values) => update({ operators: values })}
            />
            <FacetSelect
              label="Status"
              options={facets.statuses}
              selected={filters.statuses}
              onChange={(values) => update({ statuses: values })}
            />
            <FacetSelect
              label="Life stage"
              options={facets.lifeStages}
              selected={filters.lifeStages}
              onChange={(values) => update({ lifeStages: values })}
            />
            <FacetSelect
              label="Region"
              options={facets.regions}
              selected={filters.regions}
              onChange={(values) => update({ regions: values })}
            />
          </FilterBar>

          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-rr-ink/8 pt-3">
              <span className="rr-label text-rr-slate">Active</span>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rr-blue/25 bg-rr-blue-50 px-2.5 py-1 text-[11px] font-medium capitalize text-rr-blue hover:bg-rr-blue-50/70"
                >
                  {chip.label}
                  <span aria-hidden>×</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY);
                  setViewId(savedViews[0]?.id ?? "all");
                }}
                className="text-[11px] font-semibold text-rr-slate underline-offset-2 hover:text-rr-ink hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : (
            <p className="border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
              {activeView?.description ?? "No filters applied."}
            </p>
          )}
        </div>
      </Panel>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.engineId}
        dense
        initialSortKey="rank"
        onRowClick={(row) => router.push(`/engines/${row.engineId}`)}
        rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
        emptyMessage="No engines match the current filters. Clear a filter or pick another saved view."
      />
    </Panel>
  );
}
