import * as React from "react";
import type { ModuleCondition, ModuleParameterReading } from "@rr/types";
import { cn, formatDate, statusStyles } from "../../utils";
import { StatusPill } from "../primitives";
import { ThresholdBar } from "../charts";

/**
 * Shared presentation of one engine module's condition. Used by the 3D twin's
 * inspector panel and by the dossier overview so both explain a colour the
 * same way.
 */

export function ModuleReadingRow({ reading }: { reading: ModuleParameterReading }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="rr-label text-rr-slate">{reading.label}</span>
        <span className={cn("rr-numeric text-sm font-semibold", statusStyles[reading.status].text)}>
          {reading.value}
          <span className="ml-0.5 text-[11px] font-medium text-rr-slate">{reading.unit}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <ThresholdBar
          value={reading.value}
          min={reading.min}
          max={reading.max}
          amber={reading.amber}
          red={reading.red}
          direction={reading.direction}
        />
      </div>
    </div>
  );
}

export function ModuleConditionCard({
  condition,
  className,
  compact = false,
}: {
  condition: ModuleCondition;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rr-label text-rr-slate">
            {condition.code} · ATA {condition.ataChapter}
          </p>
          <p className="mt-1 text-sm font-semibold text-rr-ink">{condition.label}</p>
        </div>
        <StatusPill status={condition.status} />
      </div>

      <p className="text-xs leading-relaxed text-rr-slate">{condition.reason}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="rr-label text-rr-slate">Life consumed</p>
          <p className={cn("rr-numeric text-xl font-semibold", statusStyles[condition.status].text)}>
            {condition.lifeConsumedPct}
            <span className="ml-0.5 text-xs font-medium text-rr-slate">%</span>
          </p>
        </div>
        <div>
          <p className="rr-label text-rr-slate">Last inspected</p>
          <p className="rr-numeric text-xl font-semibold text-rr-ink">
            {condition.lastInspectedAt ? formatDate(condition.lastInspectedAt) : "—"}
          </p>
        </div>
      </div>

      {condition.readings.length > 0 ? (
        <div className="space-y-3 border-t border-rr-ink/8 pt-3">
          {condition.readings.slice(0, compact ? 2 : 3).map((reading) => (
            <ModuleReadingRow key={reading.id} reading={reading} />
          ))}
        </div>
      ) : null}

      {condition.prognostic ? (
        <div className="border-t border-rr-ink/8 pt-3">
          <p className="rr-label text-rr-slate">Predicted failure mode</p>
          <p className="mt-1 text-xs text-rr-ink">
            {condition.prognostic.failureMode} —{" "}
            <span className="rr-numeric font-semibold">{Math.round(condition.prognostic.probability * 100)}%</span> within{" "}
            <span className="rr-numeric">{condition.prognostic.horizonCycles}</span> cycles
          </p>
        </div>
      ) : null}

      {condition.recommendedAction ? (
        <div className={cn("rounded-sm border p-3", statusStyles[condition.status].bg, statusStyles[condition.status].border)}>
          <p className="rr-label text-rr-slate">Recommended action</p>
          <p className="mt-1 text-xs font-medium leading-snug text-rr-ink">{condition.recommendedAction}</p>
        </div>
      ) : null}
    </div>
  );
}
