"use client";

import * as React from "react";
import type { WarrantyClaim, WarrantyClaimState } from "@rr/types";
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
  Tabs,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

const STATE_TABS: { id: WarrantyClaimState | "all"; label: string }[] = [
  { id: "all", label: "All claims" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "under-review", label: "Under review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const ACCENT: Record<string, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

const COVER_FILTERS = [
  { id: "new-engine-warranty", label: "New engine" },
  { id: "parts-warranty", label: "Parts" },
  { id: "campaign", label: "Campaign" },
  { id: "service-bulletin", label: "Bulletin" },
  { id: "totalcare", label: "TotalCare" },
  { id: "goodwill", label: "Goodwill" },
];

export interface ClaimRegisterProps {
  claims: WarrantyClaim[];
  coverLabels: Record<string, string>;
  stateLabels: Record<string, string>;
  eventLabels: Record<string, string>;
  rejectionLabels: Record<string, string>;
}

export function ClaimRegister({ claims, coverLabels, stateLabels, eventLabels, rejectionLabels }: ClaimRegisterProps) {
  const [tab, setTab] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [covers, setCovers] = React.useState<string[]>([]);
  const [breachesOnly, setBreachesOnly] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string>(claims[0]?.id ?? "");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return claims.filter((claim) => {
      if (tab !== "all" && claim.state !== tab) return false;
      if (covers.length > 0 && !covers.includes(claim.coverKind)) return false;
      if (breachesOnly && !(claim.slaBreachDays > 0 || !claim.evidenceComplete)) return false;
      if (!needle) return true;
      return (
        claim.reference.toLowerCase().includes(needle) ||
        claim.esn.toLowerCase().includes(needle) ||
        claim.operatorName.toLowerCase().includes(needle) ||
        claim.partNumber.toLowerCase().includes(needle) ||
        claim.summary.toLowerCase().includes(needle) ||
        claim.workOrderReference.toLowerCase().includes(needle)
      );
    });
  }, [claims, tab, covers, breachesOnly, query]);

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0];

  const columns: Column<WarrantyClaim>[] = [
    {
      key: "reference",
      header: "Claim",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.reference}</p>
          <p className="text-[11px] text-rr-slate">
            {row.esn} · {row.workOrderReference}
          </p>
        </div>
      ),
    },
    {
      key: "operator",
      header: "Operator",
      sortValue: (row) => row.operatorName,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.operatorName}</p>
          <p className="text-[11px] text-rr-slate">{eventLabels[row.eventType]}</p>
        </div>
      ),
    },
    {
      key: "cover",
      header: "Cover",
      sortValue: (row) => row.coverKind,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{coverLabels[row.coverKind]}</p>
          <p className="text-[11px] text-rr-slate">
            {row.moduleCode} · {row.partNumber}
          </p>
        </div>
      ),
    },
    {
      key: "claimed",
      header: "Claimed",
      align: "right",
      sortValue: (row) => row.claimedUsd,
      render: (row) => <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatUsd(row.claimedUsd)}</span>,
    },
    {
      key: "recovered",
      header: "Recovered",
      align: "right",
      sortValue: (row) => row.approvedUsd,
      render: (row) =>
        row.recoveryRatePct === null ? (
          <span className="rr-numeric text-[13px] text-rr-slate">—</span>
        ) : (
          <div>
            <p
              className={cn(
                "rr-numeric text-[13px] font-semibold",
                row.approvedUsd === 0 ? "text-status-red" : "text-status-green",
              )}
            >
              {formatUsd(row.approvedUsd)}
            </p>
            <p className="rr-numeric text-[11px] text-rr-slate">{row.recoveryRatePct}%</p>
          </div>
        ),
    },
    {
      key: "age",
      header: "Age / SLA",
      align: "right",
      sortValue: (row) => row.ageDays,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.ageDays}d</p>
          <p
            className={cn(
              "rr-numeric text-[11px]",
              row.slaBreachDays > 0 ? "font-semibold text-status-red" : "text-rr-slate",
            )}
          >
            {row.state === "approved" || row.state === "rejected"
              ? "closed"
              : row.slaBreachDays > 0
                ? `+${row.slaBreachDays}d over`
                : `${Math.abs(row.slaBreachDays)}d left`}
          </p>
        </div>
      ),
    },
    {
      key: "state",
      header: "Status",
      align: "right",
      sortValue: (row) => row.state,
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={row.status}>{stateLabels[row.state]}</StatusPill>
          {!row.evidenceComplete && row.state !== "rejected" ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-status-amber">Evidence gap</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={STATE_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              count: t.id === "all" ? claims.length : claims.filter((c) => c.state === t.id).length,
            }))}
            active={tab}
            onChange={setTab}
            className="min-w-0 flex-1"
          />
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, claim, operator, part" className="w-64" />
        </div>

        <FilterBar>
          <span className="rr-label mr-1 text-rr-slate">Cover</span>
          {COVER_FILTERS.map((cover) => (
            <FilterChip
              key={cover.id}
              label={cover.label}
              active={covers.includes(cover.id)}
              count={claims.filter((c) => c.coverKind === cover.id).length}
              onClick={() =>
                setCovers((current) =>
                  current.includes(cover.id) ? current.filter((c) => c !== cover.id) : [...current, cover.id],
                )
              }
            />
          ))}
          <span className="mx-1 h-4 w-px bg-rr-ink/10" aria-hidden />
          <FilterChip
            label="Needs intervention"
            active={breachesOnly}
            count={claims.filter((c) => c.slaBreachDays > 0 || !c.evidenceComplete).length}
            onClick={() => setBreachesOnly((v) => !v)}
          />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          rowAccent={(row) => ACCENT[row.status]}
          initialSortKey="claimed"
          dense
          emptyMessage="No claims match the current filters."
        />
        <p className="text-[11px] text-rr-slate">
          Showing {formatNumber(filtered.length)} of {formatNumber(claims.length)} claims ·{" "}
          {formatUsd(filtered.reduce((s, c) => s + c.claimedUsd, 0))} claimed value in view
        </p>
      </div>

      {selected ? (
        <Panel className="h-fit 2xl:sticky 2xl:top-24">
          <PanelHeader
            title={selected.reference}
            subtitle={`${selected.esn} · ${selected.operatorName}`}
            actions={<StatusPill status={selected.status}>{stateLabels[selected.state]}</StatusPill>}
          />
          <div className={cn("rounded-sm border-l-2 px-3 py-2.5", statusStyles[selected.status].bg, ACCENT[selected.status])}>
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-rr-ink">{selected.recommendedAction}</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Claimed" value={formatUsd(selected.claimedUsd)} large />
            <Field
              label="Recovered"
              value={
                selected.state === "approved"
                  ? formatUsd(selected.approvedUsd)
                  : selected.state === "rejected"
                    ? "Nil — rejected"
                    : "Pending"
              }
              large
              tone={selected.state === "approved" ? "green" : selected.state === "rejected" ? "red" : undefined}
            />
            <Field label="Cover" value={coverLabels[selected.coverKind] ?? selected.coverKind} />
            <Field label="Event" value={eventLabels[selected.eventType] ?? selected.eventType} />
            <Field label="Module" value={`${selected.moduleCode} · ${selected.partNumber}`} />
            <Field label="Work order" value={selected.workOrderReference} />
            <Field label="Raised" value={formatDate(selected.raisedAt)} />
            <Field label="Submitted" value={selected.submittedAt ? formatDate(selected.submittedAt) : "Not submitted"} />
            <Field label="Assessment SLA" value={`${selected.slaDays} days`} />
            <Field
              label="Age"
              value={`${selected.ageDays} days`}
              tone={selected.slaBreachDays > 0 ? "red" : undefined}
            />
          </dl>

          <div className="mt-4 border-t border-rr-ink/8 pt-4">
            <p className="rr-label text-rr-slate">Finding</p>
            <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">{selected.summary}</p>
          </div>

          {selected.rejectionReason ? (
            <div className="mt-4 border-t border-rr-ink/8 pt-4">
              <p className="rr-label text-rr-slate">Rejection reason</p>
              <p className="mt-1 text-[13px] font-medium text-status-red">{rejectionLabels[selected.rejectionReason]}</p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rr-ink/8 pt-4">
            <Badge variant={selected.evidenceComplete ? "brand" : "outline"}>
              {selected.evidenceComplete ? "Evidence pack complete" : "Evidence incomplete"}
            </Badge>
            <Badge variant="neutral">{selected.handler}</Badge>
          </div>

          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="primary">
              {selected.state === "draft" ? "Submit claim" : selected.state === "rejected" ? "Open appeal" : "Chase assessor"}
            </Button>
            <Button size="sm" variant="secondary">
              Open work order
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  large,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  large?: boolean;
  tone?: "red" | "green";
}) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-rr-ink",
          large ? "rr-numeric text-xl font-semibold" : "text-[13px]",
          tone === "red" && "text-status-red",
          tone === "green" && "text-status-green",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
