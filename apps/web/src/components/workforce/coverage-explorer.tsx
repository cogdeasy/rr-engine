"use client";

import * as React from "react";
import type { CoverageSkillRow, ShiftId, StatusLevel } from "@rr/types";
import { CoverageLegend, CoverageMatrix, FilterBar, FilterChip, Panel, PanelHeader, StatusPill, cn } from "@rr/ui";

export interface CoverageScope {
  facilityId: string;
  label: string;
  name: string;
  rows: CoverageSkillRow[];
}

const SHIFTS: ShiftId[] = ["early", "late", "night"];

function redCells(rows: CoverageSkillRow[]): number {
  return rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.status === "red").length, 0);
}

function worst(rows: CoverageSkillRow[]): StatusLevel {
  if (rows.some((r) => r.status === "red")) return "red";
  if (rows.some((r) => r.status === "amber")) return "amber";
  return rows.some((r) => r.status === "green") ? "green" : "grey";
}

/**
 * Skill x shift coverage with a facility scope. Gaps are only meaningful per
 * facility — network capacity cannot sign off a card in Johannesburg.
 */
export function CoverageExplorer({ scopes, initialScopeId }: { scopes: CoverageScope[]; initialScopeId: string }) {
  const [scopeId, setScopeId] = React.useState(initialScopeId);
  const [gapsOnly, setGapsOnly] = React.useState(true);

  const scope = scopes.find((s) => s.facilityId === scopeId) ?? scopes[0]!;
  const rows = gapsOnly ? scope.rows.filter((row) => row.status === "red" || row.status === "amber") : scope.rows;
  const shortfall = scope.rows.reduce((sum, row) => sum + row.shortfallHours, 0);

  return (
    <Panel>
      <PanelHeader
        title="Skill coverage by shift"
        subtitle={`${scope.name} · certified, current heads against booked hours over the next 8 weeks`}
        actions={<StatusPill status={worst(scope.rows)}>{redCells(scope.rows)} red cells</StatusPill>}
      />

      <FilterBar className="pb-4">
        {scopes.map((s) => (
          <FilterChip
            key={s.facilityId}
            label={s.label}
            active={s.facilityId === scope.facilityId}
            count={redCells(s.rows)}
            onClick={() => setScopeId(s.facilityId)}
          />
        ))}
        <span className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-rr-slate">
            <input
              type="checkbox"
              checked={gapsOnly}
              onChange={(event) => setGapsOnly(event.target.checked)}
              className="h-3.5 w-3.5 accent-rr-blue"
            />
            Gaps and watchlist only
          </label>
        </span>
      </FilterBar>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-rr-slate">
          No skill on any shift is short of certified capacity at {scope.name}.
        </p>
      ) : (
        <CoverageMatrix rows={rows} shifts={SHIFTS} />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rr-ink/8 pt-3">
        <CoverageLegend />
        <p className={cn("rr-numeric text-xs", shortfall > 0 ? "text-status-red" : "text-rr-slate")}>
          {shortfall > 0 ? `${shortfall}h short across the horizon` : "No shortfall across the horizon"}
        </p>
      </div>
    </Panel>
  );
}
