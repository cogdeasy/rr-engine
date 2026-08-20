import * as React from "react";
import type { AogRecoveryStep, StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Recovery plan timeline for an AOG event: diagnose → parts → labour → test →
 * release. Exactly one step blocks the aircraft's return to service and is drawn
 * red; completed steps are green and steps not yet started are grey.
 */
export function RecoveryTimeline({ steps, className }: { steps: AogRecoveryStep[]; className?: string }) {
  return (
    <ol className={cn("grid gap-2 sm:grid-cols-5", className)}>
      {steps.map((step, index) => {
        const progress = Math.min(100, (step.elapsedHours / Math.max(step.plannedHours, 0.1)) * 100);
        const overrun = step.elapsedHours > step.plannedHours;
        return (
          <li
            key={step.id}
            className={cn(
              "relative rounded-sm border p-3",
              step.blocking ? "border-status-red/40 bg-status-red-soft" : "border-rr-ink/10 bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rr-label flex items-center gap-1.5 text-rr-slate">
                <span className={cn("inline-flex h-1.5 w-1.5 rounded-full", statusStyles[step.status].dot)} aria-hidden />
                {index + 1}. {step.label}
              </span>
              {step.blocking ? <span className="rr-label text-status-red">Blocking</span> : null}
            </div>
            <p className="rr-numeric mt-2 text-lg font-semibold text-rr-ink">
              {step.elapsedHours.toFixed(1)}
              <span className="text-[11px] font-medium text-rr-slate"> / {step.plannedHours.toFixed(1)} h</span>
            </p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-rr-mist">
              <div
                className={cn("h-full rounded-full", overrun ? "bg-status-red" : statusStyles[step.status].dot)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-rr-slate">{step.detail}</p>
            <p className="mt-1 text-[11px] font-medium capitalize text-rr-slate">{step.state.replace("-", " ")}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact label/value row used throughout the AOG rails. */
export function AogFactRow({
  label,
  value,
  status,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  status?: StatusLevel;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rr-ink/5 py-2 last:border-0">
      <span className="rr-label text-rr-slate">{label}</span>
      <span className="text-right">
        <span className={cn("rr-numeric text-sm font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>{value}</span>
        {hint ? <span className="block text-[11px] text-rr-slate">{hint}</span> : null}
      </span>
    </div>
  );
}
