"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BuildRecordSummary } from "@rr/types";
import { FilterBar, FilterChip, Panel, PanelHeader, SearchInput, StatusDot, cn, formatDate } from "@rr/ui";

type Filter = "all" | "overdue" | "trace" | "superseded";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue SB" },
  { id: "trace", label: "Trace gaps" },
  { id: "superseded", label: "Superseded" },
];

function matchesFilter(engine: BuildRecordSummary, filter: Filter): boolean {
  if (filter === "overdue") return engine.overdueBulletinCount > 0;
  if (filter === "trace") return engine.traceGapCount > 0;
  if (filter === "superseded") return engine.supersededCount > 0 || engine.nonStandardCount > 0;
  return true;
}

/** Fleet-wide configuration queue: pick the engine whose build record you need. */
export function EnginePicker({ engines, selectedId }: { engines: BuildRecordSummary[]; selectedId: string }) {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts = React.useMemo(
    () =>
      FILTERS.reduce<Record<Filter, number>>(
        (acc, f) => {
          acc[f.id] = engines.filter((e) => matchesFilter(e, f.id)).length;
          return acc;
        },
        { all: 0, overdue: 0, trace: 0, superseded: 0 },
      ),
    [engines],
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return engines
      .filter((e) => matchesFilter(e, filter))
      .filter(
        (e) =>
          q === "" ||
          e.esn.toLowerCase().includes(q) ||
          e.operatorName.toLowerCase().includes(q) ||
          e.family.toLowerCase().includes(q) ||
          (e.aircraftTail ?? "").toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [engines, filter, query]);

  return (
    <Panel>
      <PanelHeader
        title="Engine configuration queue"
        subtitle="Worst conformance first — select an engine to open its build record"
      />
      <div className="space-y-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search ESN, operator, tail"
          className="w-full"
        />
        <FilterBar>
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              count={counts[f.id]}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            />
          ))}
        </FilterBar>
      </div>

      <ul className="mt-3 max-h-[30rem] divide-y divide-rr-ink/5 overflow-y-auto" aria-label="Engine build records">
        {rows.length === 0 ? (
          <li className="px-1 py-8 text-center text-xs text-rr-slate">No engines match this filter.</li>
        ) : (
          rows.map((engine) => {
            const active = engine.engineId === selectedId;
            return (
              <li key={engine.engineId}>
                <Link
                  href={`${pathname}?engine=${engine.engineId}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-2 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rr-blue",
                    active ? "bg-rr-blue-50" : "hover:bg-rr-mist",
                  )}
                >
                  <StatusDot status={engine.configurationStatus} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("rr-numeric truncate text-xs font-semibold", active ? "text-rr-blue" : "text-rr-ink")}>
                      {engine.esn}
                    </p>
                    <p className="truncate text-[11px] text-rr-slate">
                      {engine.operatorName} · {engine.aircraftTail ?? "off wing"} · built {formatDate(engine.lastBuildAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="rr-numeric text-xs font-semibold text-rr-ink">{engine.conformancePct}%</p>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-rr-slate">conform</p>
                  </div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </Panel>
  );
}
