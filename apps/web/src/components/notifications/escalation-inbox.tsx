"use client";

import * as React from "react";
import type { Escalation, EscalationEvent, EscalationOwner, EscalationTier, Severity } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDateTime,
  statusStyles,
  type Column,
} from "@rr/ui";
import { CHANNEL_LABEL, EVENT_LABEL, EVENT_STATUS, ackLabel, ackStatus, formatCountdown, formatDuration } from "./utils";

const TIER_ORDER: EscalationTier[] = ["T1", "T2", "T3", "T4"];

export interface TierMeta {
  tier: EscalationTier;
  label: string;
  description: string;
  slaMinutes: number;
}

/** Severity-adjusted acknowledgement window per tier, resolved on the server. */
export type SlaTable = Record<Severity, Record<EscalationTier, number>>;

type FilterId = "unacknowledged" | "breached" | "all";

function minutesSinceRaised(escalation: Escalation, nowIso: string): number {
  return Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(escalation.raisedAt).getTime()) / 60000));
}

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "unacknowledged", label: "Unacknowledged" },
  { id: "breached", label: "SLA breached" },
  { id: "all", label: "All open" },
];

export function EscalationInbox({
  escalations,
  tiers,
  standbyOwners,
  slaTable,
  nowIso,
}: {
  escalations: Escalation[];
  tiers: TierMeta[];
  standbyOwners: EscalationOwner[];
  slaTable: SlaTable;
  nowIso: string;
}) {
  const [overrides, setOverrides] = React.useState<Record<string, Escalation>>({});
  const [filter, setFilter] = React.useState<FilterId>("unacknowledged");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(escalations[0]?.id ?? null);

  const rows = React.useMemo(
    () => escalations.map((escalation) => overrides[escalation.id] ?? escalation),
    [escalations, overrides],
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "unacknowledged" && row.acknowledgementState !== "unacknowledged") return false;
      if (filter === "breached" && !(row.breached && row.acknowledgementState !== "resolved")) return false;
      if (!needle) return true;
      return [row.esn, row.title, row.operatorName, row.owner.name, row.aircraftTail ?? "", row.id]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, filter, query]);

  const selected = rows.find((row) => row.id === selectedId) ?? filtered[0] ?? rows[0] ?? null;

  const counts = React.useMemo(
    () => ({
      unacknowledged: rows.filter((r) => r.acknowledgementState === "unacknowledged").length,
      breached: rows.filter((r) => r.breached && r.acknowledgementState !== "resolved").length,
      all: rows.length,
    }),
    [rows],
  );

  function applyEvent(escalation: Escalation, event: Omit<EscalationEvent, "id">, patch: Partial<Escalation>): void {
    const next: Escalation = {
      ...escalation,
      ...patch,
      trail: [...escalation.trail, { id: `${escalation.id}-LOCAL${escalation.trail.length + 1}`, ...event }],
    };
    setOverrides((current) => ({ ...current, [escalation.id]: next }));
  }

  function acknowledge(escalation: Escalation): void {
    if (escalation.acknowledgementState !== "unacknowledged") return;
    // The clock stops at acknowledgement, so freeze elapsed and the countdown here.
    const elapsedMinutes = minutesSinceRaised(escalation, nowIso);
    const slaRemainingMinutes = escalation.slaMinutes - elapsedMinutes;
    applyEvent(
      escalation,
      {
        at: nowIso,
        kind: "acknowledged",
        actor: escalation.owner.name,
        channel: "console",
        tier: escalation.tier,
        detail: `Acknowledged by ${escalation.owner.name}, ${escalation.owner.role.toLowerCase()} — owner accepted accountability from the escalation inbox.`,
      },
      {
        acknowledgementState: "acknowledged",
        acknowledgedAt: nowIso,
        acknowledgedBy: escalation.owner.name,
        elapsedMinutes,
        slaRemainingMinutes,
        breached: slaRemainingMinutes < 0,
        status: slaRemainingMinutes < 0 ? "red" : "amber",
      },
    );
  }

  function escalateTier(escalation: Escalation): void {
    const index = TIER_ORDER.indexOf(escalation.tier);
    if (index >= TIER_ORDER.length - 1 || escalation.acknowledgementState === "resolved") return;
    const nextTier = TIER_ORDER[index + 1]!;
    const meta = tiers.find((t) => t.tier === nextTier);
    const nextOwner = standbyOwners.find((o) => o.tier === nextTier) ?? escalation.owner;
    // The tighter window applies from the original raise, so the countdown and
    // breach flag have to be recomputed against it.
    const slaMinutes = slaTable[escalation.severity][nextTier];
    const elapsedMinutes = minutesSinceRaised(escalation, nowIso);
    const slaRemainingMinutes = slaMinutes - elapsedMinutes;
    applyEvent(
      escalation,
      {
        at: nowIso,
        kind: "escalated",
        actor: escalation.owner.name,
        channel: nextTier === "T4" ? "phone" : "sms",
        tier: nextTier,
        detail: `Escalated to ${meta?.label ?? nextTier} — ${nextOwner.name} notified at ${nextOwner.base}.`,
      },
      {
        tier: nextTier,
        owner: { ...nextOwner, tier: nextTier },
        acknowledgementState: "unacknowledged",
        acknowledgedAt: null,
        acknowledgedBy: null,
        status: "red",
        notifiedCount: escalation.notifiedCount + 1,
        slaMinutes,
        slaDueAt: new Date(new Date(escalation.raisedAt).getTime() + slaMinutes * 60000).toISOString(),
        elapsedMinutes,
        slaRemainingMinutes,
        breached: slaRemainingMinutes < 0,
      },
    );
  }

  function reassign(escalation: Escalation, ownerId: string): void {
    const owner = standbyOwners.find((o) => o.id === ownerId);
    if (!owner || owner.id === escalation.owner.id) return;
    applyEvent(
      escalation,
      {
        at: nowIso,
        kind: "reassigned",
        actor: escalation.owner.name,
        channel: "console",
        tier: escalation.tier,
        detail: `Ownership transferred from ${escalation.owner.name} (${escalation.owner.base}) to ${owner.name} (${owner.base}).`,
      },
      {
        owner: { ...owner, tier: escalation.tier },
        reassignments: escalation.reassignments + 1,
        notifiedCount: escalation.notifiedCount + 1,
      },
    );
  }

  const columns: Column<Escalation>[] = [
    {
      key: "condition",
      header: "Red condition",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.esn}</span>
            <Badge variant="outline">{row.engineFamily}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-rr-slate">{row.title.split(" — ")[0]}</p>
          <p className="mt-0.5 truncate text-[11px] text-rr-slate/80">
            {row.operatorName} · {row.aircraftTail ?? "off wing"} · ATA {row.ataChapter}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Accountable owner",
      sortValue: (row) => row.owner.name,
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-rr-ink">{row.owner.name}</p>
          <p className="text-[11px] text-rr-slate">
            {row.owner.role} · {row.owner.base}
          </p>
        </div>
      ),
    },
    {
      key: "ack",
      header: "Acknowledgement",
      sortValue: (row) => (row.acknowledgementState === "unacknowledged" ? 2 : row.acknowledgementState === "acknowledged" ? 1 : 0),
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={ackStatus(row.acknowledgementState, row.breached)}>
            {ackLabel(row.acknowledgementState)}
          </StatusPill>
          <span className="text-[11px] text-rr-slate">
            {row.acknowledgedAt ? `in ${formatDuration(row.elapsedMinutes)}` : `${row.notifiedCount} notified`}
          </span>
        </div>
      ),
    },
    {
      key: "elapsed",
      header: "Elapsed",
      align: "right",
      sortValue: (row) => row.elapsedMinutes,
      render: (row) => (
        <span
          className={cn(
            "rr-numeric text-base font-semibold",
            row.acknowledgementState === "unacknowledged" ? "text-status-red" : "text-rr-ink",
          )}
        >
          {formatDuration(row.elapsedMinutes)}
        </span>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      align: "right",
      sortValue: (row) => row.slaRemainingMinutes,
      render: (row) => (
        <div className="flex w-28 flex-col items-end gap-1">
          <span
            className={cn(
              "rr-numeric text-[12px] font-semibold",
              row.breached ? "text-status-red" : row.slaRemainingMinutes < row.slaMinutes * 0.25 ? "text-status-amber" : "text-status-green",
            )}
          >
            {formatCountdown(row.slaRemainingMinutes)}
          </span>
          <SlaBar remaining={row.slaRemainingMinutes} total={row.slaMinutes} />
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (row) =>
        row.acknowledgementState === "unacknowledged" ? (
          <Button
            size="sm"
            variant={row.breached ? "danger" : "primary"}
            onClick={(event) => {
              event.stopPropagation();
              acknowledge(row);
            }}
          >
            Acknowledge
          </Button>
        ) : (
          <span className="text-[11px] text-rr-slate">{row.acknowledgedBy}</span>
        ),
    },
  ];

  const urgent = rows
    .filter((row) => row.acknowledgementState === "unacknowledged")
    .sort((a, b) => a.slaRemainingMinutes - b.slaRemainingMinutes)
    .slice(0, 3);

  return (
    <div className="space-y-5">
      {urgent.length > 0 ? (
        <Panel className="border-status-red/25 bg-status-red-soft/40">
          <PanelHeader
            title="Recommended action now"
            subtitle="Longest-running red conditions with no accountable acknowledgement"
            actions={
              <Button
                size="sm"
                variant="danger"
                onClick={() => urgent.forEach(acknowledge)}
                aria-label="Acknowledge the three most urgent red conditions"
              >
                Acknowledge all {urgent.length}
              </Button>
            }
          />
          <ul className="grid gap-3 md:grid-cols-3">
            {urgent.map((row) => (
              <li key={row.id} className="rounded-sm border border-status-red/20 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.esn}</p>
                    <p className="truncate text-[11px] text-rr-slate">{row.operatorName}</p>
                  </div>
                  <Badge variant="outline">{row.tier}</Badge>
                </div>
                <p className="rr-numeric mt-3 text-3xl font-semibold text-status-red">{formatDuration(row.elapsedMinutes)}</p>
                <p className="rr-label text-rr-slate">unacknowledged · {formatCountdown(row.slaRemainingMinutes)}</p>
                <p className="mt-3 text-[12px] leading-snug text-rr-ink">{row.recommendedAction}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="danger" onClick={() => acknowledge(row)}>
                    Acknowledge
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>
                    Open trail
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <FilterBar className="justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((item) => (
                <FilterChip
                  key={item.id}
                  label={item.label}
                  count={counts[item.id]}
                  active={filter === item.id}
                  onClick={() => setFilter(item.id)}
                />
              ))}
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator or owner" />
          </FilterBar>

          {tiers.map((meta) => {
            const tierRows = filtered.filter((row) => row.tier === meta.tier);
            if (tierRows.length === 0) return null;
            const unacknowledged = tierRows.filter((row) => row.acknowledgementState === "unacknowledged").length;
            const breached = tierRows.filter((row) => row.breached && row.acknowledgementState !== "resolved").length;
            return (
              <section key={meta.tier} aria-label={meta.label}>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="rr-label text-rr-blue">{meta.label}</p>
                    <p className="text-[11px] text-rr-slate">{meta.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-rr-slate">
                    <Badge variant="neutral">{meta.slaMinutes}m ack SLA</Badge>
                    {unacknowledged > 0 ? (
                      <StatusPill status="red">{unacknowledged} unacknowledged</StatusPill>
                    ) : (
                      <StatusPill status="green">All acknowledged</StatusPill>
                    )}
                    {breached > 0 ? <StatusPill status="amber">{breached} breached</StatusPill> : null}
                  </div>
                </div>
                <DataTable
                  columns={columns}
                  rows={tierRows}
                  rowKey={(row) => row.id}
                  dense
                  initialSortKey="elapsed"
                  onRowClick={(row) => setSelectedId(row.id)}
                  rowAccent={(row) => statusStyles[ackStatus(row.acknowledgementState, row.breached)].border.replace("border-", "border-l-")}
                  emptyMessage="No escalations at this tier."
                />
              </section>
            );
          })}

          {filtered.length === 0 ? (
            <Panel className="py-12 text-center">
              <p className="text-sm font-semibold text-rr-ink">Nothing outstanding</p>
              <p className="mt-1 text-xs text-rr-slate">Every red condition in this view has an accountable acknowledgement.</p>
            </Panel>
          ) : null}
        </div>

        <div className="xl:col-span-1">
          {selected ? (
            <EscalationDetail
              escalation={selected}
              standbyOwners={standbyOwners}
              onAcknowledge={() => acknowledge(selected)}
              onEscalate={() => escalateTier(selected)}
              onReassign={(ownerId) => reassign(selected, ownerId)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SlaBar({ remaining, total }: { remaining: number; total: number }) {
  const consumed = Math.max(0, Math.min(100, ((total - remaining) / Math.max(1, total)) * 100));
  const tone = remaining < 0 ? "bg-status-red" : remaining < total * 0.25 ? "bg-status-amber" : "bg-status-green";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-rr-mist" aria-hidden>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${consumed}%` }} />
    </div>
  );
}

function EscalationDetail({
  escalation,
  standbyOwners,
  onAcknowledge,
  onEscalate,
  onReassign,
}: {
  escalation: Escalation;
  standbyOwners: EscalationOwner[];
  onAcknowledge: () => void;
  onEscalate: () => void;
  onReassign: (ownerId: string) => void;
}) {
  const status = ackStatus(escalation.acknowledgementState, escalation.breached);
  return (
    <Panel className="sticky top-24">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className="rr-numeric">{escalation.id}</span>
            <Badge variant="brand">{escalation.tier}</Badge>
          </span>
        }
        subtitle={`${escalation.esn} · ${escalation.operatorName}`}
        actions={<StatusPill status={status}>{ackLabel(escalation.acknowledgementState)}</StatusPill>}
      />

      <p className="text-[13px] font-medium leading-snug text-rr-ink">{escalation.title.split(" — ")[0]}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-rr-slate">{escalation.reason}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-rr-ink/8 py-4">
        <Field label="Elapsed" value={formatDuration(escalation.elapsedMinutes)} tone={escalation.acknowledgementState === "unacknowledged" ? "red" : undefined} />
        <Field label="Ack SLA" value={formatCountdown(escalation.slaRemainingMinutes)} tone={escalation.breached ? "red" : undefined} />
        <Field label="Raised" value={formatDateTime(escalation.raisedAt)} />
        <Field label="Notified" value={`${escalation.notifiedCount} recipients`} />
        <Field label="Source" value={escalation.source} />
        <Field label="Work order" value={escalation.relatedWorkOrderRef ?? "None raised"} />
      </dl>

      <div className="mt-4">
        <p className="rr-label text-rr-slate">Recommended action</p>
        <p className="mt-1 text-[13px] leading-snug text-rr-ink">{escalation.recommendedAction}</p>
      </div>

      <div className="mt-4 rounded-sm bg-rr-mist/70 p-3">
        <p className="rr-label text-rr-slate">Accountable owner</p>
        <p className="mt-1 text-[13px] font-semibold text-rr-ink">{escalation.owner.name}</p>
        <p className="text-[11px] text-rr-slate">
          {escalation.owner.role} · {escalation.owner.base} · {escalation.owner.email}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onAcknowledge} disabled={escalation.acknowledgementState !== "unacknowledged"}>
          Acknowledge
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onEscalate}
          disabled={escalation.tier === "T4" || escalation.acknowledgementState === "resolved"}
        >
          Escalate a tier
        </Button>
      </div>

      <label className="mt-3 block">
        <span className="rr-label text-rr-slate">Reassign owner</span>
        <select
          value=""
          onChange={(event) => onReassign(event.target.value)}
          className="mt-1 h-8 w-full rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
        >
          <option value="">Select an on-shift owner…</option>
          {standbyOwners
            .filter((owner) => owner.id !== escalation.owner.id)
            .map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name} — {owner.role}, {owner.base}
              </option>
            ))}
        </select>
      </label>

      <div className="mt-5">
        <p className="rr-label text-rr-slate">Acknowledgement trail</p>
        <ol className="mt-3 space-y-3">
          {escalation.trail.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span className="mt-1.5 flex flex-col items-center">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", statusStyles[EVENT_STATUS[event.kind]].dot)} aria-hidden />
                <span className="mt-1 w-px flex-1 bg-rr-ink/10" aria-hidden />
              </span>
              <div className="min-w-0 pb-1">
                <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-rr-ink">
                  {EVENT_LABEL[event.kind]}
                  <Badge variant="outline">{CHANNEL_LABEL[event.channel]}</Badge>
                  <span className="rr-numeric text-[11px] font-normal text-rr-slate">{formatDateTime(event.at)}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-rr-slate">{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric mt-0.5 text-[13px] font-semibold", tone === "red" ? "text-status-red" : "text-rr-ink")}>
        {value}
      </dd>
    </div>
  );
}
