"use client";

import * as React from "react";
import Link from "next/link";
import type { AuditRecord } from "@rr/types";
import { Badge, StatusPill, cn, statusStyles } from "@rr/ui";
import {
  actionLabel,
  CATEGORY_LABELS,
  ENTITY_LABELS,
  formatAge,
  formatChangeValue,
  formatShortUtc,
  formatTimeUtc,
  initials,
} from "./format";

const EVIDENCE_LABELS: Record<AuditRecord["evidence"][number]["kind"], string> = {
  telemetry: "Telemetry",
  prognostic: "Prognostic",
  borescope: "Borescope",
  document: "Document",
  policy: "Policy",
  inspection: "Inspection",
};

/** One ledger entry: what changed, who changed it, and what they relied on. */
export function AuditRecordCard({
  record,
  slaHours,
  now,
  showEntityLink = true,
}: {
  record: AuditRecord;
  slaHours: number;
  /** Ledger "now", supplied by the server so client and server agree. */
  now: string;
  showEntityLink?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const awaiting = record.requiresCountersignature && !record.countersignedBy;
  const age = Math.max(0, (new Date(now).getTime() - new Date(record.at).getTime()) / 3600000);
  const detailId = `${record.id}-detail`;

  return (
    <li className={cn("border-l-2 pl-4", statusStyles[record.status].border.replace("/30", ""))}>
      <div className="flex items-start gap-4 py-3">
        <div className="w-16 shrink-0 pt-0.5">
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatTimeUtc(record.at)}</p>
          <p className="rr-numeric text-[10px] text-rr-slate">#{record.sequence}</p>
        </div>

        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
            record.actor.kind === "system" ? "bg-rr-mist text-rr-slate" : "bg-rr-blue-50 text-rr-blue",
          )}
          aria-hidden
        >
          {initials(record.actor.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-rr-ink">{actionLabel(record.action)}</span>
            <Badge variant="outline">{ENTITY_LABELS[record.entityType]}</Badge>
            {showEntityLink && record.engineId ? (
              <Link
                href={`/assure/audit?entity=${record.engineId}#entity`}
                className="rr-numeric text-[11px] font-semibold text-rr-blue hover:underline"
              >
                {record.esn ?? record.engineId}
              </Link>
            ) : record.esn ? (
              <span className="rr-numeric text-[11px] text-rr-slate">{record.esn}</span>
            ) : null}
            {record.operatorCode ? <span className="rr-numeric text-[11px] text-rr-slate">{record.operatorCode}</span> : null}
            {record.override ? (
              <span className="rr-label rounded-full bg-status-amber-soft px-2 py-0.5 text-status-amber">Override</span>
            ) : null}
            {awaiting ? (
              <span
                className={cn(
                  "rr-label rounded-full px-2 py-0.5",
                  age > slaHours ? "bg-status-red-soft text-status-red" : "bg-status-amber-soft text-status-amber",
                )}
              >
                {age > slaHours ? `Countersignature overdue ${formatAge(age)}` : "Awaiting countersignature"}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-[13px] leading-relaxed text-rr-slate">{record.detail}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {record.changes.slice(0, open ? record.changes.length : 2).map((c) => (
              <span key={c.field} className="rr-numeric inline-flex items-center gap-1 rounded-sm bg-rr-mist px-2 py-0.5 text-[11px] text-rr-slate">
                <span className="text-rr-ink/70">{c.field}</span>
                <span className="line-through opacity-60">{formatChangeValue(c.before)}</span>
                <span aria-hidden>→</span>
                <span className="font-semibold text-rr-ink">{formatChangeValue(c.after)}</span>
              </span>
            ))}
            {!open && record.changes.length > 2 ? (
              <span className="text-[11px] text-rr-slate">+{record.changes.length - 2} more</span>
            ) : null}
          </div>

          {open ? (
            <div id={detailId} className="mt-3 grid gap-4 rounded-sm bg-rr-mist/70 p-4 md:grid-cols-2">
              <div>
                <p className="rr-label text-rr-slate">Actor</p>
                <p className="mt-1 text-[13px] font-medium text-rr-ink">{record.actor.name}</p>
                <p className="rr-numeric text-[11px] text-rr-slate">{record.actor.handle}</p>
                <p className="text-[11px] text-rr-slate">
                  {record.actor.role} · {record.actor.organisation}
                </p>

                <p className="rr-label mt-4 text-rr-slate">Evidence relied upon</p>
                {record.evidence.length === 0 ? (
                  <p className="mt-1 text-[12px] font-medium text-status-red">
                    None attached — this decision cannot currently be substantiated.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {record.evidence.map((item) => (
                      <li key={item.reference} className="flex items-baseline gap-2 text-[12px] text-rr-ink">
                        <span className="rr-label w-20 shrink-0 text-rr-slate">{EVIDENCE_LABELS[item.kind]}</span>
                        <span>{item.label}</span>
                        <span className="rr-numeric text-[11px] text-rr-slate">{item.reference}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {record.overrideReason ? (
                  <>
                    <p className="rr-label mt-4 text-rr-slate">Override justification</p>
                    <p className="mt-1 text-[12px] text-rr-ink">{record.overrideReason}</p>
                  </>
                ) : null}
              </div>

              <div>
                <p className="rr-label text-rr-slate">Recorded change set</p>
                <table className="mt-1 w-full text-[12px]">
                  <thead>
                    <tr className="text-left">
                      <th className="rr-label pb-1 font-normal text-rr-slate">Field</th>
                      <th className="rr-label pb-1 font-normal text-rr-slate">Before</th>
                      <th className="rr-label pb-1 font-normal text-rr-slate">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.changes.map((c) => (
                      <tr key={c.field} className="border-t border-rr-ink/8">
                        <td className="py-1 pr-2 text-rr-slate">{c.field}</td>
                        <td className="rr-numeric py-1 pr-2 text-rr-slate">{formatChangeValue(c.before)}</td>
                        <td className="rr-numeric py-1 font-semibold text-rr-ink">{formatChangeValue(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="rr-label mt-4 text-rr-slate">Countersignature</p>
                <p className="mt-1 text-[12px] text-rr-ink">
                  {record.requiresCountersignature
                    ? record.countersignedBy
                      ? `${record.countersignedBy} on ${formatShortUtc(record.countersignedAt ?? record.at)}`
                      : `Required within ${slaHours}h of the action — outstanding`
                    : "Not required for this action class"}
                </p>

                <p className="rr-label mt-4 text-rr-slate">Ledger position</p>
                <p className="rr-numeric mt-1 break-all text-[11px] text-rr-slate">
                  seq {record.sequence} · hash {record.hash}
                  <br />
                  prev {record.previousHash}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden lg:inline">
            <Badge>{CATEGORY_LABELS[record.category]}</Badge>
          </span>
          <StatusPill status={record.status}>
            {record.status === "red" ? "Gap" : record.status === "amber" ? "Watch" : record.status === "green" ? "Complete" : "System"}
          </StatusPill>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? `Hide evidence for ${record.id}` : `Show evidence for ${record.id}`}
            className="rounded-full border border-rr-ink/12 px-2.5 py-1 text-[11px] font-semibold text-rr-slate transition-colors hover:border-rr-blue/40 hover:text-rr-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
          >
            {open ? "Hide" : "Evidence"}
          </button>
        </div>
      </div>
    </li>
  );
}
