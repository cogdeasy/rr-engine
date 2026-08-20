"use client";

import * as React from "react";
import Link from "next/link";
import type { WorkscopeCandidate } from "@rr/types";
import { Badge, FilterBar, FilterChip, SearchInput, StatusDot, cn, formatNumber, formatUsd } from "@rr/ui";

const URGENCY_FILTERS = [
  { id: "all", label: "All" },
  { id: "red", label: "Act now" },
  { id: "amber", label: "Watchlist" },
] as const;

type UrgencyFilter = (typeof URGENCY_FILTERS)[number]["id"];

export function WorkscopeQueue({
  candidates,
  selectedEngineId,
}: {
  candidates: WorkscopeCandidate[];
  selectedEngineId: string;
}) {
  const [query, setQuery] = React.useState("");
  const [urgency, setUrgency] = React.useState<UrgencyFilter>("all");

  const rows = candidates.filter((candidate) => {
    if (urgency !== "all" && candidate.urgency !== urgency) return false;
    if (!query) return true;
    const needle = query.toLowerCase();
    return (
      candidate.esn.toLowerCase().includes(needle) ||
      candidate.family.toLowerCase().includes(needle) ||
      candidate.operatorName.toLowerCase().includes(needle) ||
      candidate.operatorCode.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="rr-panel flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-4 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-rr-ink">Workscope queue</h3>
          <p className="mt-0.5 text-xs text-rr-slate">Engines awaiting a workscope decision, soonest removal first</p>
        </div>
        <Badge variant="brand">{rows.length}</Badge>
      </div>

      <FilterBar className="pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator, family" className="w-full" />
        {URGENCY_FILTERS.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            active={urgency === filter.id}
            onClick={() => setUrgency(filter.id)}
            count={filter.id === "all" ? candidates.length : candidates.filter((c) => c.urgency === filter.id).length}
          />
        ))}
      </FilterBar>

      <ul className="-mx-2 max-h-[640px] flex-1 space-y-1 overflow-y-auto px-2">
        {rows.map((candidate) => {
          const selected = candidate.engineId === selectedEngineId;
          return (
            <li key={candidate.engineId}>
              <Link
                href={`/plan/workscope?engine=${candidate.engineId}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "block rounded-sm border-l-2 px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                  candidate.urgency === "red"
                    ? "border-l-status-red"
                    : candidate.urgency === "amber"
                      ? "border-l-status-amber"
                      : "border-l-status-green",
                  selected ? "bg-rr-blue-50" : "hover:bg-rr-mist",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-[13px] font-semibold", selected ? "text-rr-blue" : "text-rr-ink")}>
                    {candidate.esn}
                  </span>
                  <span className="rr-numeric text-[11px] text-rr-slate">{formatUsd(candidate.recommendedCostUsd)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-rr-slate">
                  {candidate.operatorCode} · {candidate.family}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-rr-slate">
                  <span className="inline-flex items-center gap-1">
                    <StatusDot status={candidate.urgency} />
                    <span className="rr-numeric">{formatNumber(candidate.removalWithinCycles)}</span> cycles left
                  </span>
                  <span className="rr-numeric">{candidate.recommendedTatDays}d TAT</span>
                  {candidate.llpsDue > 0 ? <span className="rr-numeric">{candidate.llpsDue} LLP</span> : null}
                </div>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-3 py-10 text-center text-xs text-rr-slate">No engines match the current filters.</li>
        ) : null}
      </ul>
    </div>
  );
}
