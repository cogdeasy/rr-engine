"use client";

import * as React from "react";
import type { LoadLevellingMove } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";

/**
 * Recommended reroutes. Each row is one engine that misses its removal date at
 * the shop it would naturally go to, and the shop that can take it sooner.
 */
export function LoadLevellingPanel({ moves }: { moves: LoadLevellingMove[] }) {
  const [onlyClearing, setOnlyClearing] = React.useState(false);
  const [accepted, setAccepted] = React.useState<string[]>([]);

  const rows = onlyClearing ? moves.filter((m) => m.residualDelayDays === 0) : moves;
  const clearing = moves.filter((m) => m.residualDelayDays === 0).length;
  const recovered = moves.reduce((sum, m) => sum + m.daysRecovered, 0);

  const columns: Column<LoadLevellingMove>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.operatorName}
          </p>
        </div>
      ),
    },
    {
      key: "route",
      header: "Reroute",
      render: (row) => (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-rr-slate line-through">{row.fromFacilityName}</span>
          <span aria-hidden className="text-rr-slate">
            →
          </span>
          <span className="font-semibold text-rr-ink">{row.toFacilityName}</span>
        </div>
      ),
    },
    {
      key: "removalDue",
      header: "Removal due",
      align: "right",
      sortValue: (row) => row.removalDue,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-ink">{formatDate(row.removalDue)}</span>,
    },
    {
      key: "slot",
      header: "Slot moves",
      align: "right",
      sortValue: (row) => row.proposedStart,
      render: (row) => (
        <div className="rr-numeric text-[13px]">
          <p className="text-rr-slate line-through">{formatDate(row.currentStart)}</p>
          <p className="font-semibold text-rr-ink">{formatDate(row.proposedStart)}</p>
        </div>
      ),
    },
    {
      key: "daysRecovered",
      header: "Days recovered",
      align: "right",
      sortValue: (row) => row.daysRecovered,
      render: (row) => (
        <span className="rr-numeric text-[15px] font-semibold text-status-green">−{row.daysRecovered}d</span>
      ),
    },
    {
      key: "cost",
      header: "Trade-off",
      align: "right",
      sortValue: (row) => row.extraFerryKm,
      render: (row) => (
        <div className="rr-numeric text-[11px] text-rr-slate">
          <p>{formatNumber(Math.max(0, row.extraFerryKm))} km ferry</p>
          <p>
            {row.tatDeltaDays > 0 ? "+" : ""}
            {row.tatDeltaDays} d TAT
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Outcome",
      align: "right",
      sortValue: (row) => row.residualDelayDays,
      render: (row) => (
        <StatusPill status={row.status}>
          {row.residualDelayDays === 0 ? "meets date" : `+${row.residualDelayDays}d`}
        </StatusPill>
      ),
    },
    {
      key: "action",
      header: "",
      render: (row) => (
        <Button
          size="sm"
          variant={accepted.includes(row.id) ? "ghost" : "secondary"}
          onClick={() => setAccepted((list) => (list.includes(row.id) ? list.filter((id) => id !== row.id) : [...list, row.id]))}
          aria-label={`${accepted.includes(row.id) ? "Undo" : "Accept"} reroute of ${row.esn} to ${row.toFacilityName}`}
        >
          {accepted.includes(row.id) ? "Accepted" : "Accept"}
        </Button>
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Load-levelling plan"
        subtitle="Engines that miss their removal date at their nearest shop, and the certified shop that can take them sooner"
        actions={
          <div className="flex items-center gap-3">
            <span className="rr-numeric text-[11px] text-rr-slate">
              {accepted.length} of {moves.length} accepted
            </span>
            <Button size="sm" onClick={() => setAccepted((list) => [...new Set([...list, ...rows.map((m) => m.id)])])}>
              Accept all {rows.length}
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Moves proposed" value={moves.length} caption="Certified, capacity-checked reroutes" />
        <SummaryCard
          label="Delay days recovered"
          value={formatNumber(recovered)}
          caption="Across the whole plan"
          tone="green"
        />
        <SummaryCard
          label="Removal dates met"
          value={`${clearing} of ${moves.length}`}
          caption="Remainder still slip, but by less"
          tone={clearing === moves.length ? "green" : "amber"}
        />
      </div>

      <FilterBar className="mb-3">
        <FilterChip
          label="Only moves that meet the removal date"
          active={onlyClearing}
          onClick={() => setOnlyClearing((v) => !v)}
          count={clearing}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
        initialSortKey="daysRecovered"
        dense
        emptyMessage="Every induction already lands on its removal date."
      />
      <p className="mt-3 text-[11px] text-rr-slate">
        Rationale for the first move: {moves[0]?.rationale ?? "no reroute required"}.
      </p>
    </Panel>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  tone?: "green" | "amber";
}) {
  return (
    <div className="rounded-sm border border-rr-ink/8 bg-rr-mist/50 p-4">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", tone ? statusStyles[tone].text : "text-rr-ink")}>{value}</p>
      <p className="mt-1 text-[11px] text-rr-slate">{caption}</p>
    </div>
  );
}
