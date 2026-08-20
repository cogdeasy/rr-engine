"use client";

import * as React from "react";
import type { MaintenanceSchedule, StatusLevel } from "@rr/types";
import { FilterBar, FilterChip, Panel, PanelHeader, SearchInput, Tabs, cn } from "@rr/ui";
import { ConflictList, FacilityCapacityGrid } from "./capacity";
import { EventDetail } from "./event-detail";
import { ScheduleTimeline, TimelineLegend, buildRows } from "./timeline";

type View = "timeline" | "capacity" | "conflicts";

export function ScheduleWorkspace({ schedule }: { schedule: MaintenanceSchedule }) {
  const [view, setView] = React.useState<View>("timeline");
  const [operatorId, setOperatorId] = React.useState<string>("");
  const [family, setFamily] = React.useState<string>("");
  const [facilityId, setFacilityId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusLevel | null>(null);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Everything except the status facet, so the status chips can show how much
  // work sits in each category rather than collapsing to zero once one is set.
  const scoped = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return schedule.events.filter(
      (event) =>
        (!operatorId || event.operatorId === operatorId) &&
        (!family || event.family === family) &&
        (!facilityId || event.facilityId === facilityId) &&
        (!needle ||
          event.esn.toLowerCase().includes(needle) ||
          event.reference.toLowerCase().includes(needle) ||
          (event.aircraftTail ?? "").toLowerCase().includes(needle)),
    );
  }, [schedule.events, operatorId, family, facilityId, query]);

  const events = React.useMemo(
    () => (status ? scoped.filter((event) => event.status === status) : scoped),
    [scoped, status],
  );

  const rows = React.useMemo(() => buildRows(events), [events]);
  const selected = React.useMemo(
    () => schedule.events.find((event) => event.id === selectedId) ?? null,
    [schedule.events, selectedId],
  );

  const visibleConflicts = React.useMemo(() => {
    const engineIds = new Set(events.map((event) => event.engineId));
    return schedule.conflicts.filter(
      (conflict) =>
        (!facilityId || conflict.facilityId === facilityId) &&
        conflict.engineIds.some((id) => engineIds.has(id)),
    );
  }, [schedule.conflicts, events, facilityId]);

  const facilityRows = React.useMemo(
    () => (facilityId ? schedule.facilityLoad.filter((row) => row.facilityId === facilityId) : schedule.facilityLoad),
    [schedule.facilityLoad, facilityId],
  );

  const counts = React.useMemo(
    () => ({
      red: scoped.filter((e) => e.status === "red").length,
      amber: scoped.filter((e) => e.status === "amber").length,
      green: scoped.filter((e) => e.status === "green").length,
    }),
    [scoped],
  );

  const selectEngine = (engineId: string) => {
    const event = events.find((e) => e.engineId === engineId) ?? schedule.events.find((e) => e.engineId === engineId);
    if (!event) return;
    setSelectedId(event.id);
    setView("timeline");
  };

  const filtersActive = Boolean(operatorId || family || facilityId || status || query);

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <FilterBar>
          <label className="sr-only" htmlFor="schedule-operator">
            Operator
          </label>
          <select
            id="schedule-operator"
            value={operatorId}
            onChange={(event) => setOperatorId(event.target.value)}
            className="h-8 rounded-full border border-rr-ink/12 bg-surface px-3 text-xs font-medium text-rr-ink focus:border-rr-blue focus:outline-none"
          >
            <option value="">All operators</option>
            {schedule.filters.operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="schedule-family">
            Engine family
          </label>
          <select
            id="schedule-family"
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            className="h-8 rounded-full border border-rr-ink/12 bg-surface px-3 text-xs font-medium text-rr-ink focus:border-rr-blue focus:outline-none"
          >
            <option value="">All families</option>
            {schedule.filters.families.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <span className="mx-1 h-5 w-px bg-rr-ink/10" aria-hidden />

          {schedule.filters.facilities.map((facility) => (
            <FilterChip
              key={facility.id}
              label={facility.icao}
              active={facilityId === facility.id}
              onClick={() => setFacilityId(facilityId === facility.id ? null : facility.id)}
            />
          ))}

          <span className="mx-1 h-5 w-px bg-rr-ink/10" aria-hidden />

          {(["red", "amber", "green"] as const).map((level) => (
            <FilterChip
              key={level}
              label={level === "red" ? "Act now" : level === "amber" ? "Watchlist" : "Nominal"}
              count={counts[level]}
              active={status === level}
              onClick={() => setStatus(status === level ? null : level)}
            />
          ))}

          <div className="ml-auto flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail or work order" />
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setOperatorId("");
                  setFamily("");
                  setFacilityId(null);
                  setStatus(null);
                  setQuery("");
                }}
                className="text-xs font-semibold text-rr-blue hover:underline"
              >
                Reset
              </button>
            ) : null}
          </div>
        </FilterBar>
        <p className="text-[11px] text-rr-slate">
          <span className="rr-numeric font-semibold text-rr-ink">{events.length}</span> events across{" "}
          <span className="rr-numeric font-semibold text-rr-ink">{rows.length}</span> engines in the{" "}
          {schedule.horizonMonths}-month horizon
          {facilityId ? ` at ${schedule.filters.facilities.find((f) => f.id === facilityId)?.icao}` : ""}.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <Tabs
            tabs={[
              { id: "timeline", label: "Timeline", count: events.length },
              { id: "capacity", label: "Facility capacity", count: facilityRows.length },
              { id: "conflicts", label: "Conflicts", count: visibleConflicts.length },
            ]}
            active={view}
            onChange={(id) => setView(id as View)}
            className="mb-4"
          />
          {view === "timeline" ? (
            <div className="space-y-4">
              <ScheduleTimeline
                rows={rows}
                months={schedule.months}
                windowStart={schedule.windowStart}
                windowEnd={schedule.windowEnd}
                selectedId={selectedId}
                onSelect={(event) => setSelectedId(event.id)}
              />
              <TimelineLegend />
            </div>
          ) : null}
          {view === "capacity" ? (
            <FacilityCapacityGrid
              rows={facilityRows}
              months={schedule.months}
              selectedFacilityId={facilityId}
              onSelectFacility={setFacilityId}
            />
          ) : null}
          {view === "conflicts" ? (
            <ConflictList conflicts={visibleConflicts} months={schedule.months} onSelectEngine={selectEngine} />
          ) : null}
        </Panel>

        <Panel className={cn("h-fit", selected ? "" : "xl:sticky xl:top-4")}>
          <PanelHeader title="Event detail" subtitle="Workscope, drivers and dependencies" />
          <EventDetail event={selected} conflicts={schedule.conflicts} />
        </Panel>
      </div>
    </div>
  );
}
