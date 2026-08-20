import * as React from "react";
import type { CoverageSkillRow, LabourWeek, ShiftId, StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/* ------------------------------------------------------------------ */
/* Coverage matrix                                                     */
/* ------------------------------------------------------------------ */

const SHIFT_LABEL: Record<ShiftId, string> = { early: "Early", late: "Late", night: "Night" };

function ratioLabel(ratio: number, demandHours: number): string {
  if (demandHours === 0) return "—";
  if (ratio >= 3) return "3.0x+";
  return `${ratio.toFixed(1)}x`;
}

/**
 * Skill x shift coverage grid. A cell is red when the certified, current heads
 * on that shift cannot cover the hours booked against the skill.
 */
export function CoverageMatrix({
  rows,
  shifts = ["early", "late", "night"],
  className,
}: {
  rows: CoverageSkillRow[];
  shifts?: ShiftId[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Skill coverage by shift, with demand and shortfall in hours</caption>
        <thead>
          <tr className="border-b border-rr-ink/8">
            <th scope="col" className="rr-label py-2 text-left text-rr-slate">
              Skill
            </th>
            {shifts.map((shift) => (
              <th key={shift} scope="col" className="rr-label py-2 text-center text-rr-slate">
                {SHIFT_LABEL[shift]} shift
              </th>
            ))}
            <th scope="col" className="rr-label py-2 text-right text-rr-slate">
              Demand
            </th>
            <th scope="col" className="rr-label py-2 text-right text-rr-slate">
              Shortfall
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.skill} className="border-b border-rr-ink/5 last:border-0">
              <th scope="row" className="py-2 pr-3 text-left text-[13px] font-medium text-rr-ink">
                {row.skill}
              </th>
              {shifts.map((shift) => {
                const cell = row.cells.find((c) => c.shift === shift);
                if (!cell) return <td key={shift} />;
                const s = statusStyles[cell.status];
                return (
                  <td key={shift} className="px-1 py-1.5">
                    <div
                      className={cn("rounded-sm border px-2 py-1.5 text-center", s.bg, s.border)}
                      title={`${cell.currentHeads} current head(s), ${cell.lapsedHeads} lapsed · ${cell.demandHours}h demand vs ${cell.capacityHours}h capacity`}
                    >
                      <p className={cn("rr-numeric text-[15px] font-semibold leading-none", s.text)}>{cell.currentHeads}</p>
                      <p className="rr-numeric mt-1 text-[10px] leading-none text-rr-slate">
                        {ratioLabel(cell.coverageRatio, cell.demandHours)}
                        {cell.lapsedHeads > 0 ? ` · ${cell.lapsedHeads} lapsed` : ""}
                      </p>
                    </div>
                  </td>
                );
              })}
              <td className="rr-numeric py-2 pl-3 text-right text-rr-slate">{row.demandHours}h</td>
              <td
                className={cn(
                  "rr-numeric py-2 pl-3 text-right font-semibold",
                  row.shortfallHours > 0 ? "text-status-red" : "text-rr-slate",
                )}
              >
                {row.shortfallHours > 0 ? `${row.shortfallHours}h` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legend explaining why a coverage cell is coloured the way it is. */
export function CoverageLegend({ className }: { className?: string }) {
  const items: { status: StatusLevel; label: string }[] = [
    { status: "red", label: "Demand exceeds certified capacity" },
    { status: "amber", label: "Under 1.25x cover — no slack" },
    { status: "green", label: "Covered" },
    { status: "grey", label: "No demand booked" },
  ];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.status} className="flex items-center gap-1.5 text-[11px] text-rr-slate">
          <span className={cn("h-2 w-2 rounded-full", statusStyles[item.status].dot)} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Labour balance                                                      */
/* ------------------------------------------------------------------ */

/**
 * Weekly demand plotted inside the available-hours envelope. The bar turns
 * amber above 88% utilisation and red once demand exceeds available hours.
 */
export function LabourBalanceChart({
  weeks,
  height = 168,
  className,
}: {
  weeks: LabourWeek[];
  height?: number;
  className?: string;
}) {
  const ceiling = Math.max(...weeks.map((w) => Math.max(w.availableHours, w.demandHours)), 1);
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end gap-2" style={{ height }} role="img" aria-label="Weekly labour demand against available hours">
        {weeks.map((week) => {
          const availablePct = (week.availableHours / ceiling) * 100;
          const demandPct = (week.demandHours / ceiling) * 100;
          return (
            <div key={week.weekStart} className="flex h-full flex-1 flex-col justify-end gap-1">
              <span className={cn("rr-numeric text-center text-[10px] font-semibold", statusStyles[week.status].text)}>
                {week.utilisationPct}%
              </span>
              <div className="relative w-full" style={{ height: `${availablePct}%`, minHeight: 4 }}>
                <div className="absolute inset-0 rounded-sm bg-rr-mist ring-1 ring-inset ring-rr-ink/8" />
                <div
                  className={cn("absolute inset-x-0 bottom-0 rounded-sm", statusStyles[week.status].dot)}
                  style={{ height: `${Math.min(100, (demandPct / Math.max(availablePct, 0.01)) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {weeks.map((week) => (
          <span key={week.weekStart} className="flex-1 text-center text-[10px] text-rr-slate">
            {week.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact demand vs capacity bar used in the shift summary tiles. */
export function ShiftLoadBar({
  demandHours,
  capacityHours,
  status,
  className,
}: {
  demandHours: number;
  capacityHours: number;
  status: StatusLevel;
  className?: string;
}) {
  const pct = capacityHours > 0 ? Math.min(100, (demandHours / capacityHours) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-rr-mist", className)}>
      <div className={cn("h-full rounded-full", statusStyles[status].dot)} style={{ width: `${pct}%` }} />
    </div>
  );
}
