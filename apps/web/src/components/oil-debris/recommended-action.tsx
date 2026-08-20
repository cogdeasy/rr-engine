import * as React from "react";
import Link from "next/link";
import type { OilActionKind, OilCondition } from "@rr/types";
import { Badge, Panel, PanelHeader, StatusPill, cn, statusStyles } from "@rr/ui";

const ACTION_DETAIL: Record<OilActionKind, string> = {
  nominal: "Oil consumption, debris population and vibration are all inside limits. Keep the engine on the routine EHM download cycle.",
  "increase-sampling": "Tighten the sampling interval so any developing trend is caught before the next check.",
  "oil-sample-lab": "Send a scheduled oil sample for spectrographic analysis to confirm whether the trend is bearing metal or seal wear.",
  borescope: "Physical inspection of the bearing chamber is required before the engine flies again.",
  "remove-engine": "The evidence meets the removal criteria. Plan an off-wing slot and a replacement engine now.",
};

/** The decision the page exists to support, with the thresholds that drove it. */
export function RecommendedActionPanel({ condition }: { condition: OilCondition }) {
  const { action } = condition;
  return (
    <Panel className={cn("flex h-full flex-col", action.status === "red" && "border-status-red/30")}>
      <PanelHeader
        title="Recommended action"
        subtitle={`${condition.esn} · ${condition.family}`}
        actions={<StatusPill status={action.status} size="md" />}
      />
      <p className={cn("text-lg font-semibold leading-snug", statusStyles[action.status].text)}>{action.label}</p>
      <p className="mt-2 text-xs leading-relaxed text-rr-slate">{ACTION_DETAIL[action.kind]}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-rr-ink/8 py-3">
        <div>
          <dt className="rr-label text-rr-slate">Start within</dt>
          <dd className={cn("rr-numeric text-2xl font-semibold", action.dueWithinHours === null ? "text-rr-ink" : statusStyles[action.status].text)}>
            {action.dueWithinHours === null ? "—" : `${action.dueWithinHours}h`}
          </dd>
        </div>
        <div>
          <dt className="rr-label text-rr-slate">Distress index</dt>
          <dd className={cn("rr-numeric text-2xl font-semibold", statusStyles[condition.status].text)}>
            {condition.bearingDistressIndex}
            <span className="ml-1 text-sm font-medium text-rr-slate">/ 100</span>
          </dd>
        </div>
      </dl>

      <p className="rr-label mt-4 text-rr-slate">Why</p>
      <ul className="mt-2 space-y-2">
        {action.rationale.map((reason) => (
          <li key={reason} className="flex gap-2 text-xs leading-relaxed text-rr-ink">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[action.status].dot)} aria-hidden />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-3 pt-5">
        <Badge variant="outline">{action.reference}</Badge>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/plan/workscope?engine=${condition.engineId}`}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
              action.status === "red" ? "bg-status-red hover:brightness-95" : "bg-rr-blue hover:bg-rr-blue-600",
            )}
          >
            Raise {action.kind === "remove-engine" ? "removal plan" : "task card"}
          </Link>
          <Link
            href={`/engines/${condition.engineId}`}
            className="inline-flex items-center rounded-full border border-rr-blue/25 bg-white px-3 py-1.5 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
          >
            Engine dossier
          </Link>
        </div>
      </div>
    </Panel>
  );
}
