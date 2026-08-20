"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { OilCondition } from "@rr/types";
import { Badge, DataTable, FilterBar, FilterChip, Panel, SearchInput, StatusPill, cn, formatNumber, statusStyles, type Column } from "@rr/ui";

const PAGE_SIZE = 25;

const ACTION_FILTERS = [
  { key: "all", label: "All recommendations" },
  { key: "remove-engine", label: "Remove" },
  { key: "borescope", label: "Borescope" },
  { key: "oil-sample-lab", label: "Lab sample" },
  { key: "increase-sampling", label: "Increase sampling" },
] as const;

export interface OilWatchlistRow extends OilCondition {
  operatorName: string;
}

/** Ranked oil-condition table; selecting a row loads that engine's dossier. */
export function OilWatchlistTable({
  rows,
  selectedEngineId,
}: {
  rows: OilWatchlistRow[];
  selectedEngineId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [action, setAction] = React.useState<string>("all");
  const [expanded, setExpanded] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (action !== "all" && row.action.kind !== action) return false;
      if (!needle) return true;
      return [row.esn, row.family, row.operatorName, row.aircraftTail ?? "", row.location].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [rows, query, action]);

  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);

  const columns: Column<OilWatchlistRow>[] = [
    {
      key: "engine",
      header: "Engine",
      width: "20%",
      render: (row) => (
        <div>
          <p className={cn("font-semibold", row.engineId === selectedEngineId ? "text-rr-blue" : "text-rr-ink")}>{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.aircraftTail ?? "off wing"} · {row.operatorName}
          </p>
        </div>
      ),
      sortValue: (row) => row.esn,
    },
    {
      key: "consumption",
      header: "Oil consumption",
      align: "right",
      render: (row) => {
        const status = row.consumptionQtPerHr >= row.consumptionRedLimit ? "red" : row.consumptionQtPerHr >= row.consumptionAmberLimit ? "amber" : "green";
        return (
          <div>
            <span className={cn("rr-numeric font-semibold", statusStyles[status].text)}>{row.consumptionQtPerHr.toFixed(2)}</span>
            <span className="ml-1 text-[11px] text-rr-slate">qt/h</span>
            <p className="text-[11px] text-rr-slate">limit {row.consumptionRedLimit}</p>
          </div>
        );
      },
      sortValue: (row) => row.consumptionQtPerHr,
    },
    {
      key: "step",
      header: "Step change",
      align: "right",
      render: (row) =>
        row.stepChangeAt ? (
          <div>
            <span className="rr-numeric font-semibold text-status-red">+{row.stepChangeQtPerHr.toFixed(2)}</span>
            <p className="text-[11px] text-rr-slate">
              {new Date(row.stepChangeAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </p>
          </div>
        ) : (
          <span className="text-[11px] text-rr-slate">None</span>
        ),
      sortValue: (row) => row.stepChangeQtPerHr,
    },
    {
      key: "debris",
      header: "Debris 30d",
      align: "right",
      render: (row) => (
        <div>
          <span className="rr-numeric font-semibold text-rr-ink">{formatNumber(row.debrisCount30d)}</span>
          <p className="text-[11px] text-rr-slate">particles</p>
        </div>
      ),
      sortValue: (row) => row.debrisCount30d,
    },
    {
      key: "loadPath",
      header: "Load-path 90d",
      align: "right",
      render: (row) =>
        row.loadPathEvents90d > 0 ? (
          <div>
            <span className="rr-numeric font-semibold text-status-red">{row.loadPathEvents90d}</span>
            <p className="text-[11px] text-rr-slate">{row.dominantMaterial}</p>
          </div>
        ) : (
          <span className="text-[11px] text-rr-slate">None</span>
        ),
      sortValue: (row) => row.loadPathEvents90d,
    },
    {
      key: "vibration",
      header: "Vib Δ",
      align: "right",
      render: (row) => (
        <span className={cn("rr-numeric", row.vibrationDeltaIps >= 0.25 ? "font-semibold text-status-amber" : "text-rr-slate")}>
          {row.vibrationDeltaIps >= 0 ? "+" : ""}
          {row.vibrationDeltaIps.toFixed(2)}
        </span>
      ),
      sortValue: (row) => row.vibrationDeltaIps,
    },
    {
      key: "egt",
      header: "EGT margin",
      align: "right",
      render: (row) => (
        <span className={cn("rr-numeric", row.egtMargin < 12 ? "font-semibold text-status-red" : row.egtMargin < 25 ? "text-status-amber" : "text-rr-slate")}>
          {row.egtMargin.toFixed(0)}°C
        </span>
      ),
      sortValue: (row) => row.egtMargin,
    },
    {
      key: "index",
      header: "Distress index",
      align: "right",
      width: "13%",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-rr-mist">
            <div className={cn("h-full rounded-full", statusStyles[row.status].dot)} style={{ width: `${row.bearingDistressIndex}%` }} />
          </div>
          <span className={cn("rr-numeric w-6 text-right font-semibold", statusStyles[row.status].text)}>{row.bearingDistressIndex}</span>
        </div>
      ),
      sortValue: (row) => row.bearingDistressIndex,
    },
    {
      key: "action",
      header: "Recommended action",
      width: "22%",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={row.action.status}>{row.action.label}</StatusPill>
          {row.action.dueWithinHours !== null ? (
            <Badge variant="outline">within {row.action.dueWithinHours}h</Badge>
          ) : null}
        </div>
      ),
      sortValue: (row) => row.action.kind,
    },
  ];

  return (
    <Panel>
      <FilterBar className="mb-4">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setExpanded(false);
          }}
          placeholder="Search ESN, operator, tail or base"
        />
        {ACTION_FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            count={filter.key === "all" ? rows.length : rows.filter((row) => row.action.kind === filter.key).length}
            active={action === filter.key}
            onClick={() => {
              setAction(filter.key);
              setExpanded(false);
            }}
          />
        ))}
      </FilterBar>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.engineId}
        initialSortKey="index"
        dense
        onRowClick={(row) => router.push(`/health/oil?engine=${row.engineId}`, { scroll: false })}
        rowAccent={(row) => (row.engineId === selectedEngineId ? "border-rr-blue" : statusStyles[row.status].dot.replace("bg-", "border-"))}
        emptyMessage="No engines match the current filters."
      />

      {filtered.length > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-rr-ink/8 pt-4">
          <p className="text-xs text-rr-slate">
            Showing <span className="rr-numeric font-semibold text-rr-ink">{visible.length}</span> of{" "}
            <span className="rr-numeric font-semibold text-rr-ink">{filtered.length}</span> engines, worst first
          </p>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-full border border-rr-blue/25 px-3 py-1.5 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
          >
            {expanded ? "Show top 25" : `Show all ${filtered.length}`}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
