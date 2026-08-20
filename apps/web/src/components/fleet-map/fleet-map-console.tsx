"use client";

import * as React from "react";
import Link from "next/link";
import type { EngineFamily, FleetMapAircraftNode, FleetMapSnapshot, Region, StatusLevel } from "@rr/types";
import {
  Badge,
  Button,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import { FleetMapCanvas, MAP_STATUS_COLOUR } from "./fleet-map-canvas";

type ReachFilter = "all" | "near" | "out";

const STATUS_ORDER: StatusLevel[] = ["red", "amber", "green"];

export function FleetMapConsole({ snapshot }: { snapshot: FleetMapSnapshot }) {
  const [query, setQuery] = React.useState("");
  const [statuses, setStatuses] = React.useState<StatusLevel[]>([]);
  const [operators, setOperators] = React.useState<string[]>([]);
  const [families, setFamilies] = React.useState<EngineFamily[]>([]);
  const [reach, setReach] = React.useState<ReachFilter>("all");
  const [region, setRegion] = React.useState<Region | null>(null);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.aircraft.filter((node) => {
      if (statuses.length > 0 && !statuses.includes(node.status)) return false;
      if (operators.length > 0 && !operators.includes(node.operatorId)) return false;
      if (families.length > 0 && !node.families.some((family) => families.includes(family))) return false;
      if (region && node.region !== region) return false;
      if (reach === "near" && (node.status === "green" || !node.nearestCapable)) return false;
      if (reach === "out" && !node.outOfReach) return false;
      if (needle) {
        const haystack = [
          node.tail,
          node.operatorName,
          node.operatorCode,
          node.type,
          node.destination?.iata ?? "",
          node.origin?.iata ?? "",
          ...node.engines.map((engine) => engine.esn),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [snapshot.aircraft, statuses, operators, families, region, reach, query]);

  const queue = React.useMemo(
    () =>
      filtered
        .filter((node) => node.status === "red" || node.status === "amber")
        .sort(
          (a, b) =>
            severityWeight(b) - severityWeight(a) ||
            (a.actionWindowHours ?? 1e9) - (b.actionWindowHours ?? 1e9) ||
            (a.nearestCapable?.ferryHours ?? 1e9) - (b.nearestCapable?.ferryHours ?? 1e9),
        ),
    [filtered],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected =
    filtered.find((node) => node.id === selectedId) ?? queue[0] ?? filtered[0] ?? null;

  const statusCounts = React.useMemo(() => {
    const counts: Record<StatusLevel, number> = { red: 0, amber: 0, green: 0, grey: 0 };
    for (const node of snapshot.aircraft) counts[node.status] += 1;
    return counts;
  }, [snapshot.aircraft]);

  const filtersActive =
    statuses.length > 0 || operators.length > 0 || families.length > 0 || reach !== "all" || region !== null || query !== "";

  function clearFilters() {
    setStatuses([]);
    setOperators([]);
    setFamilies([]);
    setReach("all");
    setRegion(null);
    setQuery("");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)_336px]">
        {/* Left rail — filters and the action queue */}
        <div className="space-y-4">
          <Panel className="space-y-4">
            <PanelHeader
              title="Filters"
              subtitle={`${formatNumber(filtered.length)} of ${formatNumber(snapshot.aircraft.length)} airframes`}
              className="pb-0"
              actions={
                filtersActive ? (
                  <button type="button" onClick={clearFilters} className="text-[11px] font-semibold text-rr-blue hover:underline">
                    Reset
                  </button>
                ) : null
              }
            />
            <SearchInput value={query} onChange={setQuery} placeholder="Tail, ESN, station" className="w-full" />

            <FilterGroup label="Engine status">
              <FilterBar>
                {STATUS_ORDER.map((status) => (
                  <FilterChip
                    key={status}
                    label={statusStyles[status].label}
                    count={statusCounts[status]}
                    active={statuses.includes(status)}
                    onClick={() => setStatuses(toggle(statuses, status))}
                  />
                ))}
              </FilterBar>
            </FilterGroup>

            <FilterGroup label="Proximity to capability">
              <FilterBar>
                <FilterChip label="All" active={reach === "all"} onClick={() => setReach("all")} />
                <FilterChip
                  label="Near a capable base"
                  active={reach === "near"}
                  onClick={() => setReach(reach === "near" ? "all" : "near")}
                />
                <FilterChip
                  label="Out of reach"
                  count={snapshot.totals.unreachable}
                  active={reach === "out"}
                  onClick={() => setReach(reach === "out" ? "all" : "out")}
                />
              </FilterBar>
            </FilterGroup>

            <FilterGroup label="Engine family">
              <FilterBar>
                {snapshot.families.map((family) => (
                  <FilterChip
                    key={family}
                    label={family.replace("Trent ", "T")}
                    active={families.includes(family)}
                    onClick={() => setFamilies(toggle(families, family))}
                  />
                ))}
              </FilterBar>
            </FilterGroup>

            <FilterGroup label="Operator">
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {snapshot.operators.map((operator) => {
                  const active = operators.includes(operator.id);
                  return (
                    <button
                      key={operator.id}
                      type="button"
                      onClick={() => setOperators(toggle(operators, operator.id))}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-[12px] transition-colors",
                        active ? "border-rr-blue bg-rr-blue-50 text-rr-blue" : "border-transparent text-rr-slate hover:bg-rr-mist",
                      )}
                    >
                      <span className="truncate">{operator.name}</span>
                      <span className="rr-numeric shrink-0 text-[10px] opacity-70">{operator.code}</span>
                    </button>
                  );
                })}
              </div>
            </FilterGroup>
          </Panel>

          <Panel padded={false}>
            <div className="border-b border-rr-ink/8 px-4 py-3">
              <p className="text-sm font-semibold text-rr-ink">Action queue</p>
              <p className="mt-0.5 text-[11px] text-rr-slate">Flagged airframes, worst first</p>
            </div>
            <ul className="max-h-[360px] divide-y divide-rr-ink/5 overflow-y-auto">
              {queue.length === 0 ? (
                <li className="px-4 py-6 text-center text-[11px] text-rr-slate">Nothing flagged in this selection.</li>
              ) : (
                queue.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(node.id)}
                      aria-current={selected?.id === node.id}
                      className={cn(
                        "flex w-full items-start gap-2 border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-rr-blue-50/60",
                        node.status === "red" ? "border-status-red" : "border-status-amber",
                        selected?.id === node.id && "bg-rr-blue-50",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-rr-ink">{node.tail}</p>
                        <p className="truncate text-[11px] text-rr-slate">
                          {node.operatorCode} · {node.phase === "in-flight" ? `→ ${node.destination?.iata}` : node.destination?.iata}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("rr-numeric text-[13px] font-semibold", statusStyles[node.status].text)}>
                          {node.actionWindowHours !== null ? `${node.actionWindowHours}h` : "—"}
                        </p>
                        <p className="rr-numeric text-[10px] text-rr-slate">
                          {node.nearestCapable ? `${node.nearestCapable.ferryHours}h ferry` : "no base"}
                        </p>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </div>

        {/* Centre — the map */}
        <Panel tone="dark" padded={false} className="rr-hero-gradient flex h-full flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div>
              <p className="rr-label text-rr-blue-200">Live fleet map</p>
              <p className="text-sm font-semibold text-white">
                {formatNumber(filtered.filter((node) => node.phase === "in-flight").length)} airborne ·{" "}
                {formatNumber(filtered.filter((node) => node.phase !== "in-flight").length)} on ground
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {STATUS_ORDER.map((status) => (
                <Legend key={status} colour={MAP_STATUS_COLOUR[status]} label={legendLabel(status)} />
              ))}
              <Legend glyph="diamond" colour="#ffffff" label="Maintenance base" />
            </div>
          </div>
          <div className="relative min-h-[380px] flex-1">
            <FleetMapCanvas
              aircraft={filtered}
              stations={snapshot.stations}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <p className="border-t border-white/8 px-4 py-2 text-[11px] text-rr-cloud/60">
            Solid track = sector flown so far. Dashed violet line = ferry leg to the nearest station with a free slot and
            crew certified on the flagged family.
          </p>
        </Panel>

        {/* Right rail — dossier for the selected airframe */}
        <div className="space-y-4">{selected ? <Dossier node={selected} /> : <EmptyDossier />}</div>
      </div>

      {/* Bottom strip — flagged engines by region */}
      <Panel>
        <PanelHeader
          title="Flagged engines by region"
          subtitle="Where the exposure sits, and whether the network can absorb it"
          actions={
            region ? (
              <button type="button" onClick={() => setRegion(null)} className="text-[11px] font-semibold text-rr-blue hover:underline">
                Clear region
              </button>
            ) : null
          }
        />
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
          {snapshot.regions.map((summary) => {
            const active = region === summary.region;
            return (
              <button
                key={summary.region}
                type="button"
                onClick={() => setRegion(active ? null : summary.region)}
                aria-pressed={active}
                className={cn(
                  "rounded-sm border border-l-2 px-3 py-3 text-left transition-colors hover:border-rr-blue/40",
                  active ? "border-rr-blue bg-rr-blue-50" : "border-rr-ink/8 bg-white",
                  summary.status === "red" && "border-l-status-red",
                  summary.status === "amber" && "border-l-status-amber",
                  summary.status === "green" && "border-l-status-green",
                  summary.status === "grey" && "border-l-status-grey",
                )}
              >
                <p className="rr-label truncate text-rr-slate">{summary.region}</p>
                <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">{summary.flaggedEngines}</p>
                <p className="text-[11px] text-rr-slate">
                  <span className="font-semibold text-status-red">{summary.redEngines} red</span> ·{" "}
                  <span className="font-semibold text-status-amber">{summary.amberEngines} amber</span>
                </p>
                <p className="mt-1.5 text-[11px] text-rr-slate">
                  {summary.aircraft} aircraft · {summary.stations} station{summary.stations === 1 ? "" : "s"} ·{" "}
                  {summary.freeSlots} slots
                </p>
                {summary.unreachable > 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-status-red">{summary.unreachable} out of reach</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Dossier({ node }: { node: FleetMapAircraftNode }) {
  const worst = node.worstAlert;
  return (
    <>
      <Panel className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Selected airframe</p>
            <h3 className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">{node.tail}</h3>
            <p className="text-xs text-rr-slate">
              {node.operatorName} · {node.type}
            </p>
          </div>
          <StatusPill status={node.status} size="md">
            {node.status === "red" ? "Act now" : node.status === "amber" ? "Watchlist" : "Nominal"}
          </StatusPill>
        </div>

        <div className="rounded-sm bg-rr-mist px-3 py-3">
          {node.phase === "in-flight" ? (
            <>
              <div className="flex items-center justify-between text-[11px] text-rr-slate">
                <span className="rr-numeric font-semibold text-rr-ink">{node.origin?.iata ?? "—"}</span>
                <span className="rr-label">In flight</span>
                <span className="rr-numeric font-semibold text-rr-ink">{node.destination?.iata ?? "—"}</span>
              </div>
              <div className="mt-2 h-1 w-full rounded-full bg-rr-ink/10">
                <div
                  className={cn(
                    "h-1 rounded-full",
                    node.status === "red" ? "bg-status-red" : node.status === "amber" ? "bg-status-amber" : "bg-status-green",
                  )}
                  style={{ width: `${Math.round(node.progress * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-rr-slate">
              <span className="rr-label">{node.phase === "in-shop" ? "In maintenance at" : "On stand at"}</span>
              <span className="rr-numeric font-semibold text-rr-ink">
                {node.destination?.iata ?? "—"} · {node.destination?.city ?? "unknown"}
              </span>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <Field label="ETA" value={node.etaMinutes !== null ? formatDuration(node.etaMinutes) : "On ground"} />
            <Field label="Altitude" value={node.altitudeFt ? `${formatNumber(node.altitudeFt)} ft` : "—"} />
            <Field label="Position" value={`${node.lat.toFixed(1)}°, ${node.lon.toFixed(1)}°`} />
          </dl>
        </div>

        <div>
          <p className="rr-label mb-2 text-rr-slate">Engines</p>
          <ul className="space-y-1.5">
            {node.engines.map((engine) => (
              <li
                key={engine.id}
                className={cn("flex items-center gap-2 border-l-2 py-1 pl-2", statusStyles[engine.status].border.replace("border-", "border-l-"))}
              >
                <span className="rr-numeric w-6 shrink-0 text-[11px] text-rr-slate">#{engine.position ?? "-"}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/engines/${engine.id}`} className="block truncate text-[12px] font-semibold text-rr-ink hover:text-rr-blue">
                    {engine.esn}
                  </Link>
                  <p className="truncate text-[10px] text-rr-slate">{engine.family}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("rr-numeric text-[12px] font-semibold", statusStyles[engine.status].text)}>{engine.egtMargin}°C</p>
                  <p className="rr-numeric text-[10px] text-rr-slate">{formatNumber(engine.rulCycles)} cyc</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {worst ? (
          <div className={cn("rounded-sm border px-3 py-3", statusStyles[worst.status].border, statusStyles[worst.status].bg)}>
            <div className="flex items-start justify-between gap-2">
              <p className="rr-label text-rr-slate">Worst open alert</p>
              <Badge variant="outline">{worst.severity}</Badge>
            </div>
            <p className="mt-1 text-[12px] font-semibold leading-snug text-rr-ink">{worst.title}</p>
            <p className="mt-1 text-[11px] text-rr-slate">
              {worst.source} · ATA {worst.ataChapter} · {relativeTime(worst.raisedAt)}
              {worst.timeToActionHours !== null ? ` · act within ${worst.timeToActionHours}h` : ""}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-rr-slate">No open alerts on this airframe.</p>
        )}
      </Panel>

      <Panel className="space-y-3">
        <PanelHeader title="Nearest capability" subtitle="Free slot and crew certified on the flagged family" className="pb-0" />
        {node.nearestCapable ? (
          <div className="rounded-sm border border-status-green/30 bg-status-green-soft px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="rr-numeric text-sm font-semibold text-rr-ink">{node.nearestCapable.icao}</p>
                <p className="text-[11px] text-rr-slate">{node.nearestCapable.name}</p>
              </div>
              <Badge variant="brand">{node.nearestCapable.kind.replace("-", " ")}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Field label="Distance" value={`${formatNumber(node.nearestCapable.distanceKm)} km`} />
              <Field label="Ferry" value={`${node.nearestCapable.ferryHours} h`} />
              <Field label="Slots" value={`${node.nearestCapable.freeSlots} free`} />
            </dl>
            <p className="mt-2 text-[11px] text-rr-slate">
              {node.nearestCapable.certifiedTechnicians} certified technicians · station at {node.nearestCapable.utilisationPct}%
              utilisation
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-status-red/30 bg-status-red-soft px-3 py-3">
            <p className="text-[12px] font-semibold text-status-red">No capable station in range</p>
            <p className="mt-1 text-[11px] text-rr-slate">
              Every station within {formatNumber(4200)} km is either full or has no crew certified on this engine family.
            </p>
          </div>
        )}

        <div>
          <p className="rr-label mb-1.5 text-rr-slate">Alternates</p>
          <ul className="space-y-1">
            {node.nearbyStations.map((station) => (
              <li key={station.stationId} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="rr-numeric font-semibold text-rr-ink">{station.icao}</span>
                <span className="truncate text-rr-slate">{station.name}</span>
                <span className="rr-numeric shrink-0 text-rr-slate">
                  {formatNumber(station.distanceKm)} km · {station.freeSlots} slot{station.freeSlots === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel className={cn("space-y-3", node.outOfReach ? "border-status-red/40" : undefined)}>
        <p className="rr-label text-rr-blue">Recommended action</p>
        <p className="text-[13px] leading-relaxed text-rr-ink">{node.recommendedAction}</p>
        {node.outOfReach ? (
          <p className="text-[11px] font-semibold text-status-red">
            Ferry time exceeds the action window — the deadline cannot be met from the current position.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={node.status === "red" ? "danger" : "primary"}>
            Raise work order
          </Button>
          <Link
            href="/alerts"
            className="inline-flex items-center rounded-full border border-rr-blue/25 px-3 py-1.5 text-xs font-semibold text-rr-blue hover:bg-rr-blue-50"
          >
            Triage alerts
          </Link>
        </div>
      </Panel>
    </>
  );
}

function EmptyDossier() {
  return (
    <Panel className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-semibold text-rr-ink">No airframe selected</p>
      <p className="max-w-[220px] text-xs text-rr-slate">
        Select a marker on the map or an entry in the action queue to see its engines, worst alert and nearest capable
        station.
      </p>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className="rr-numeric text-[12px] font-semibold text-rr-ink">{value}</dd>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="rr-label mb-2 text-rr-slate">{label}</p>
      {children}
    </div>
  );
}

function Legend({ colour, label, glyph = "dot" }: { colour: string; label: string; glyph?: "dot" | "diamond" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-rr-cloud/80">
      <span
        aria-hidden
        className={cn("inline-block h-2 w-2", glyph === "diamond" ? "rotate-45 border border-white bg-transparent" : "rounded-full")}
        style={glyph === "dot" ? { backgroundColor: colour } : undefined}
      />
      {label}
    </span>
  );
}

function legendLabel(status: StatusLevel): string {
  return status === "red" ? "Act now" : status === "amber" ? "Watchlist" : "Nominal";
}

function severityWeight(node: FleetMapAircraftNode): number {
  const base = node.status === "red" ? 100 : node.status === "amber" ? 50 : 0;
  return base + (node.outOfReach ? 25 : 0) + node.redEngines * 5 + node.openAlerts;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
