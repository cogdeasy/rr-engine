"use client";

import * as React from "react";
import type { FacilityLabourForecast } from "@rr/types";
import { LabourBalanceChart, Panel, PanelHeader, StatusDot, StatusPill, cn, formatNumber, statusStyles } from "@rr/ui";

/** Demand against bookable labour hours per facility for the next eight weeks. */
export function LabourForecast({ forecasts }: { forecasts: FacilityLabourForecast[] }) {
  const ordered = React.useMemo(
    () => [...forecasts].sort((a, b) => b.peakUtilisationPct - a.peakUtilisationPct),
    [forecasts],
  );
  const [facilityId, setFacilityId] = React.useState(ordered[0]?.facilityId ?? "");
  const active = ordered.find((f) => f.facilityId === facilityId) ?? ordered[0];

  if (!active) return null;

  return (
    <Panel>
      <PanelHeader
        title="Demand vs available labour"
        subtitle="Bookable hours after committed load and planned absence, next 8 weeks"
        actions={<StatusPill status={active.status}>{active.peakUtilisationPct}% peak</StatusPill>}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ul className="max-h-[320px] space-y-1 overflow-y-auto pr-1" aria-label="Facilities">
          {ordered.map((forecast) => {
            const selected = forecast.facilityId === active.facilityId;
            return (
              <li key={forecast.facilityId}>
                <button
                  type="button"
                  onClick={() => setFacilityId(forecast.facilityId)}
                  aria-current={selected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors",
                    selected ? "border-rr-blue/30 bg-rr-blue-50" : "border-transparent hover:bg-rr-mist",
                  )}
                >
                  <StatusDot status={forecast.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-rr-ink">{forecast.facilityName}</span>
                    <span className="rr-numeric block text-[11px] text-rr-slate">
                      {forecast.icao} · {forecast.headcount} heads
                    </span>
                  </span>
                  <span className={cn("rr-numeric text-xs font-semibold", statusStyles[forecast.status].text)}>
                    {forecast.peakUtilisationPct}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div>
          <div className="grid grid-cols-3 gap-4 pb-4">
            <Figure label="Demand" value={`${formatNumber(active.demandHours)}h`} />
            <Figure label="Bookable" value={`${formatNumber(active.availableHours)}h`} />
            <Figure
              label="Balance"
              value={`${active.balanceHours >= 0 ? "+" : ""}${formatNumber(active.balanceHours)}h`}
              status={active.balanceHours < 0 ? "red" : undefined}
            />
          </div>
          <LabourBalanceChart weeks={active.weeks} />
          <p className="mt-3 text-xs text-rr-slate">
            {active.firstDeficitWeek
              ? `Demand exceeds bookable hours from ${active.firstDeficitWeek} — move work, add overtime or borrow certified heads.`
              : `Peak load ${active.peakUtilisationPct}% of bookable hours; no week runs into deficit.`}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Figure({ label, value, status }: { label: string; value: string; status?: "red" }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", status === "red" ? "text-status-red" : "text-rr-ink")}>{value}</p>
    </div>
  );
}
