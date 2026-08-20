"use client";

import * as React from "react";
import Link from "next/link";
import type { StatusLevel } from "@rr/types";
import {
  Badge,
  Button,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  ProgressBar,
  SearchInput,
  StatusPill,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";

/** Compact projection of a parameter feed, kept small because it crosses to the client. */
export interface HeatCell {
  parameter: string;
  label: string;
  status: StatusLevel;
  coveragePct: number;
  fitted: boolean;
  missing: number;
  frozen: number;
  outOfRange: number;
}

export interface HeatRow {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  operatorName: string;
  aircraftTail: string | null;
  position: number | null;
  status: StatusLevel;
  trustIndex: number;
  coveragePct: number;
  sectorsFlown: number;
  sectorsMissing: number;
  lastSampleAt: string | null;
  hoursSinceLastSample: number | null;
  deadParameters: number;
  frozenSignals: number;
  outOfRangeSamples: number;
  openAlerts: number;
  recommendedAction: string;
  cells: HeatCell[];
}

const CELL_TONE: Record<StatusLevel, string> = {
  red: "bg-status-red",
  amber: "bg-status-amber",
  green: "bg-status-green/70",
  grey: "bg-rr-cloud",
};

const STATUS_FILTERS: { id: "all" | StatusLevel; label: string }[] = [
  { id: "all", label: "All feeds" },
  { id: "red", label: "Act now" },
  { id: "amber", label: "Watchlist" },
  { id: "grey", label: "No data" },
  { id: "green", label: "Nominal" },
];

function cellTitle(row: HeatRow, cell: HeatCell): string {
  if (!cell.fitted) return `${row.esn} · ${cell.label}: sensor not fitted to this build standard`;
  if (cell.status === "grey") return `${row.esn} · ${cell.label}: no data received in the window`;
  const parts = [`${cell.coveragePct}% coverage`, `${cell.missing} snapshot${cell.missing === 1 ? "" : "s"} missing`];
  if (cell.frozen > 0) parts.push(`${cell.frozen} frozen samples`);
  if (cell.outOfRange > 0) parts.push(`${cell.outOfRange} out-of-range samples`);
  return `${row.esn} · ${cell.label}: ${parts.join(", ")}`;
}

function reasonFor(row: HeatRow): string {
  if (row.deadParameters > 0)
    return `${row.deadParameters} fitted parameter${row.deadParameters === 1 ? "" : "s"} returned nothing across ${row.sectorsFlown} sectors`;
  if (row.hoursSinceLastSample !== null && row.hoursSinceLastSample > 168)
    return `last snapshot ${Math.round(row.hoursSinceLastSample / 24)} days ago`;
  if (row.frozenSignals > 0) return `${row.frozenSignals} signal${row.frozenSignals === 1 ? "" : "s"} frozen on repeated identical values`;
  if (row.coveragePct < 88) return `only ${row.coveragePct}% of expected snapshots arrived`;
  if (row.outOfRangeSamples > 0) return `${row.outOfRangeSamples} samples outside the plausible envelope`;
  return "coverage, freshness and signal integrity all within tolerance";
}

export function TelemetryHeatmap({
  rows,
  parameters,
}: {
  rows: HeatRow[];
  parameters: { parameter: string; label: string; short: string }[];
}) {
  const [status, setStatus] = React.useState<"all" | StatusLevel>("red");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(rows[0]?.engineId ?? "");

  const counts = React.useMemo(() => {
    const base: Record<string, number> = { all: rows.length, red: 0, amber: 0, green: 0, grey: 0 };
    for (const row of rows) base[row.status] = (base[row.status] ?? 0) + 1;
    return base;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.esn, row.family, row.operatorCode, row.operatorName, row.aircraftTail ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, status, query]);

  const selected = filtered.find((r) => r.engineId === selectedId) ?? filtered[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel padded={false}>
        <div className="p-5">
          <PanelHeader
            title="Data quality by engine and parameter"
            subtitle="Every engine needing attention, plus the lowest-trust nominal feeds. One cell per feed over the last 30 days; grey means no data was received at all."
            className="pb-3"
          />
          <FilterBar className="justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  count={counts[filter.id] ?? 0}
                  active={status === filter.id}
                  onClick={() => setStatus(filter.id)}
                />
              ))}
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail or operator" />
          </FilterBar>
        </div>

        <div className="max-h-[560px] overflow-auto border-t border-rr-ink/8">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Telemetry coverage status for each engine and parameter. Red: act now. Amber: watchlist. Green: nominal.
              Grey: no data.
            </caption>
            <thead className="sticky top-0 z-10 bg-rr-mist/95 backdrop-blur">
              <tr>
                <th scope="col" className="rr-label sticky left-0 z-20 bg-rr-mist/95 px-4 py-2.5 text-left text-rr-slate">
                  Engine
                </th>
                {parameters.map((parameter) => (
                  <th
                    key={parameter.parameter}
                    scope="col"
                    title={parameter.label}
                    className="rr-label px-0 py-2.5 text-center text-[9px] font-semibold text-rr-slate"
                  >
                    {parameter.short}
                  </th>
                ))}
                <th scope="col" className="rr-label px-4 py-2.5 text-right text-rr-slate">
                  Trust
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={parameters.length + 2} className="px-4 py-12 text-center text-xs text-rr-slate">
                    No engine feeds match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.engineId}
                    className={cn(
                      "border-b border-rr-ink/5 last:border-0",
                      selected?.engineId === row.engineId && "bg-rr-blue-50/60",
                    )}
                  >
                    <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.engineId)}
                        className="block text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
                        aria-pressed={selected?.engineId === row.engineId}
                      >
                        <span className="flex items-center gap-2 text-[13px] font-semibold text-rr-ink">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", statusStyles[row.status].dot)} aria-hidden />
                          {row.esn}
                        </span>
                        <span className="block text-[11px] text-rr-slate">
                          {row.operatorCode} · {row.aircraftTail ?? "off wing"}
                          {row.position !== null ? ` #${row.position}` : ""}
                        </span>
                      </button>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.parameter} className="px-[1px] py-1.5">
                        <span
                          title={cellTitle(row, cell)}
                          className={cn(
                            "block h-6 w-full rounded-[2px]",
                            CELL_TONE[cell.status],
                            !cell.fitted && "bg-[repeating-linear-gradient(45deg,#c9cbe0,#c9cbe0_2px,#eceefb_2px,#eceefb_4px)]",
                          )}
                        >
                          <span className="sr-only">{cellTitle(row, cell)}</span>
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-1.5 text-right">
                      <span className={cn("rr-numeric text-[13px] font-semibold", statusStyles[row.status].text)}>
                        {row.trustIndex}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-rr-ink/8 px-5 py-3 text-[11px] text-rr-slate">
          <span className="rr-label">Legend</span>
          <LegendSwatch tone="bg-status-red" label="Act now — feed cannot support a decision" />
          <LegendSwatch tone="bg-status-amber" label="Watchlist — gaps or integrity flags" />
          <LegendSwatch tone="bg-status-green/70" label="Nominal" />
          <LegendSwatch tone="bg-rr-cloud" label="No data" />
          <LegendSwatch
            tone="bg-[repeating-linear-gradient(45deg,#c9cbe0,#c9cbe0_2px,#eceefb_2px,#eceefb_4px)]"
            label="Sensor not fitted"
          />
        </div>
      </Panel>

      {selected ? <EngineDetail row={selected} /> : null}
    </div>
  );
}

function LegendSwatch({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-4 rounded-[2px]", tone)} aria-hidden />
      {label}
    </span>
  );
}

function EngineDetail({ row }: { row: HeatRow }) {
  const worstCells = [...row.cells]
    .filter((c) => c.status !== "green")
    .sort((a, b) => (a.status === "grey" ? -1 : 0) - (b.status === "grey" ? -1 : 0) || a.coveragePct - b.coveragePct)
    .slice(0, 6);

  return (
    <Panel className="h-fit xl:sticky xl:top-4">
      <PanelHeader
        title={row.esn}
        subtitle={`${row.family} · ${row.operatorName}`}
        actions={<StatusPill status={row.status}>{statusStyles[row.status].label}</StatusPill>}
      />

      <p className="rr-label text-rr-slate">Why this status</p>
      <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">{reasonFor(row)}.</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Trust index" value={row.trustIndex} status={row.status} />
        <Stat label="Coverage" value={`${row.coveragePct}%`} status={row.status} />
        <Stat
          label="Sectors missing"
          value={`${row.sectorsMissing}/${row.sectorsFlown}`}
          status={row.sectorsMissing > 0 ? "amber" : "green"}
        />
        <Stat
          label="Last snapshot"
          value={row.lastSampleAt ? relativeTime(row.lastSampleAt) : "—"}
          status={row.hoursSinceLastSample !== null && row.hoursSinceLastSample > 168 ? "red" : "green"}
        />
      </dl>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="rr-label text-rr-slate">Feed integrity</p>
          <span className="rr-numeric text-[11px] text-rr-slate">{row.coveragePct}% of expected snapshots</span>
        </div>
        <ProgressBar value={row.coveragePct} status={row.status} className="mt-2" />
      </div>

      {worstCells.length > 0 ? (
        <div className="mt-5">
          <p className="rr-label text-rr-slate">Degraded parameters</p>
          <ul className="mt-2 space-y-1.5">
            {worstCells.map((cell) => (
              <li key={cell.parameter} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-2 text-rr-ink">
                  <span className={cn("h-2 w-2 rounded-full", statusStyles[cell.status].dot)} aria-hidden />
                  {cell.label}
                </span>
                <span className="rr-numeric text-rr-slate">
                  {!cell.fitted ? "not fitted" : cell.status === "grey" ? "no data" : `${cell.coveragePct}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-sm border border-rr-blue/20 bg-rr-blue-50/70 p-3">
        <p className="rr-label text-rr-blue">Recommended action</p>
        <p className="mt-1 text-[12px] leading-relaxed text-rr-ink">{row.recommendedAction}</p>
        {row.openAlerts > 0 ? (
          <p className="mt-2 text-[11px] text-rr-slate">
            {row.openAlerts} open alert{row.openAlerts === 1 ? "" : "s"} on this engine rest on this feed.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/engines/${row.engineId}`}>
          <Button size="sm">Open engine record</Button>
        </Link>
        <Link href="/alerts">
          <Button size="sm" variant="secondary">
            Review alerts
          </Button>
        </Link>
        <Badge variant="outline">{formatNumber(row.sectorsFlown)} sectors flown</Badge>
      </div>
    </Panel>
  );
}

function Stat({ label, value, status }: { label: string; value: React.ReactNode; status: StatusLevel }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric mt-0.5 text-xl font-semibold", statusStyles[status].text)}>{value}</dd>
    </div>
  );
}
