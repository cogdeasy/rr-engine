import Link from "next/link";
import type { AuditEntityTimeline } from "@rr/types";
import { Badge, Metric, Panel, PanelHeader, cn } from "@rr/ui";
import { AuditRecordCard } from "./audit-record-card";
import { ENTITY_LABELS, formatShortUtc } from "./format";

const MAX_ROWS = 40;

export function EntityPicker({
  entities,
  activeId,
}: {
  entities: { id: string; label: string; kind: "Engine" | "WorkOrder"; records: number; overrides: number }[];
  activeId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {entities.map((entity) => (
        <Link
          key={entity.id}
          href={`/assure/audit?entity=${entity.id}#entity`}
          scroll={false}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            activeId === entity.id
              ? "border-rr-blue bg-rr-blue text-white"
              : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
          )}
        >
          <span className="rr-numeric">{entity.label}</span>
          <span className={cn("rr-numeric text-[10px]", activeId === entity.id ? "text-white/80" : "text-rr-slate/80")}>
            {entity.records}
          </span>
          {entity.overrides > 0 ? (
            <span className={cn("rr-numeric text-[10px] font-semibold", activeId === entity.id ? "text-white" : "text-status-amber")}>
              {entity.overrides} ovr
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function EntityDrilldown({
  timeline,
  now,
  slaHours,
}: {
  timeline: AuditEntityTimeline;
  now: string;
  slaHours: number;
}) {
  const rows = timeline.records.slice(0, MAX_ROWS);
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {timeline.entityLabel}
            <Badge variant="brand">{ENTITY_LABELS[timeline.entityType]}</Badge>
          </span>
        }
        subtitle={`Complete recorded history, newest first · ${formatShortUtc(timeline.firstAt)} to ${formatShortUtc(timeline.lastAt)}`}
        actions={
          timeline.engineId ? (
            <Link href={`/engines/${timeline.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
              Open engine twin ›
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-6 border-y border-rr-ink/8 py-4 md:grid-cols-4">
        <Metric label="Recorded actions" value={timeline.records.length} />
        <Metric label="Overrides" value={timeline.overrides} status={timeline.overrides > 0 ? "amber" : "green"} />
        <Metric label="Distinct actors" value={timeline.distinctActors} />
        <Metric label="Last activity" value={formatShortUtc(timeline.lastAt)} />
      </div>

      <ul className="divide-y divide-rr-ink/5">
        {rows.map((record) => (
          <AuditRecordCard key={record.id} record={record} slaHours={slaHours} now={now} showEntityLink={false} />
        ))}
      </ul>

      {timeline.records.length > rows.length ? (
        <p className="pt-3 text-center text-[11px] text-rr-slate">
          Showing the {MAX_ROWS} most recent of {timeline.records.length} recorded actions for this entity.
        </p>
      ) : null}
    </Panel>
  );
}
