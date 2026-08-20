"use client";

import type { FacilityLoadRow, ScheduleConflict, ScheduleMonth } from "@rr/types";
import { StatusPill, cn, formatUsd, statusStyles } from "@rr/ui";

/**
 * Load below the watch threshold is shown as a neutral blue ramp so that colour
 * stays reserved for operational state: amber from 85% (slot pressure), red
 * above capacity.
 */
function cellClass(utilisationPct: number, demand: number): string {
  if (utilisationPct > 100) return "bg-status-red text-white";
  if (utilisationPct >= 85) return "bg-status-amber/80 text-rr-ink";
  if (demand === 0) return "bg-rr-mist";
  if (utilisationPct >= 60) return "bg-rr-blue/30";
  return "bg-rr-blue/12";
}

export function FacilityCapacityGrid({
  rows,
  months,
  onSelectFacility,
  selectedFacilityId,
}: {
  rows: FacilityLoadRow[];
  months: ScheduleMonth[];
  onSelectFacility: (facilityId: string | null) => void;
  selectedFacilityId: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="rr-label sticky left-0 z-10 bg-white py-2 pr-3 text-left text-rr-slate">Facility</th>
            {months.map((month) => (
              <th key={month.index} className="rr-label px-0 pb-2 text-center text-[9px] text-rr-slate">
                {month.index % 3 === 0 ? month.label : ""}
              </th>
            ))}
            <th className="rr-label py-2 pl-3 text-right text-rr-slate">Peak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.facilityId}>
              <td className="sticky left-0 z-10 bg-white py-1 pr-3">
                <button
                  type="button"
                  onClick={() => onSelectFacility(selectedFacilityId === row.facilityId ? null : row.facilityId)}
                  className={cn(
                    "text-left transition-colors hover:text-rr-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                    selectedFacilityId === row.facilityId ? "text-rr-blue" : "text-rr-ink",
                  )}
                  aria-pressed={selectedFacilityId === row.facilityId}
                >
                  <span className="text-[13px] font-semibold">{row.facilityIcao}</span>
                  <span className="block text-[11px] text-rr-slate">
                    {row.facilityName} · {row.capacity} slots
                  </span>
                </button>
              </td>
              {row.months.map((month) => (
                <td key={month.monthIndex} className="p-[1px]">
                  <div
                    className={cn("h-7 rounded-[2px] text-center text-[10px] font-semibold leading-7", cellClass(month.utilisationPct, month.demand))}
                    title={`${row.facilityIcao} ${months[month.monthIndex]?.label}: ${month.demand} of ${month.capacity} slots (${month.utilisationPct}%), of which ${month.baselineDemand} held by the wider network`}
                  >
                    {month.utilisationPct > 100 ? month.demand - month.capacity : ""}
                  </div>
                </td>
              ))}
              <td className={cn("rr-numeric py-1 pl-3 text-right font-semibold", statusStyles[row.status].text)}>{row.peakUtilisationPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-rr-slate">
        Cells show demand against shop capacity. Red cells are over-committed and carry the number of
        engines that cannot be accommodated; the wider Rolls-Royce network already holds part of every
        shop&apos;s capacity, which is included in the demand shown.
      </p>
    </div>
  );
}

export function ConflictList({
  conflicts,
  months,
  onSelectEngine,
}: {
  conflicts: ScheduleConflict[];
  months: ScheduleMonth[];
  onSelectEngine: (engineId: string) => void;
}) {
  if (conflicts.length === 0) {
    return <p className="py-10 text-center text-xs text-rr-slate">No conflicts in the current selection.</p>;
  }
  return (
    <ul className="space-y-3">
      {conflicts.map((conflict) => (
        <li key={conflict.id} className={cn("border-l-2 pl-3", statusStyles[conflict.status].border.replace("border-", "border-l-"))}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold leading-snug text-rr-ink">{conflict.title}</p>
            <StatusPill status={conflict.status}>
              {conflict.kind === "capacity-overrun" ? "Capacity" : conflict.kind === "no-slot-before-rul" ? "No slot" : "Late slot"}
            </StatusPill>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{conflict.detail}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="text-rr-ink">
              <span className="rr-label mr-1 text-rr-slate">Action</span>
              {conflict.recommendedAction}
            </span>
            <span className="rr-numeric text-rr-slate">
              {formatUsd(conflict.exposureUsd)} exposure
              {conflict.monthIndex !== null ? ` · ${months[conflict.monthIndex]?.label}` : ""}
            </span>
            {conflict.engineIds.length === 1 && conflict.engineIds[0] ? (
              <button
                type="button"
                onClick={() => onSelectEngine(conflict.engineIds[0] as string)}
                className="font-semibold text-rr-blue hover:underline"
              >
                Show on timeline ›
              </button>
            ) : (
              <span className="text-rr-slate">{conflict.engineIds.length} engines affected</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
