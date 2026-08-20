"use client";

import * as React from "react";
import type { Analytic, AnalyticStrand } from "@rr/types";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  StatusPill,
  formatNumber,
  formatUsd,
  type Column,
} from "@rr/ui";

const STRAND_LABELS: Record<AnalyticStrand, string> = {
  snapshot: "Snapshot (ACARS)",
  continuous: "Continuous (1 Hz)",
};

const accent: Record<Analytic["status"], string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-rr-ink/20",
};

/**
 * The analytic population, sortable on the two numbers that matter: how long a
 * DN took to build, and how noisy it is once live.
 */
export function AnalyticTable({ rows }: { rows: Analytic[] }) {
  const [strand, setStrand] = React.useState<AnalyticStrand | "all">("all");
  const [liveOnly, setLiveOnly] = React.useState(false);

  const visible = React.useMemo(
    () => rows.filter((row) => (strand === "all" || row.strand === strand) && (!liveOnly || row.live)),
    [rows, strand, liveOnly],
  );

  const columns: Column<Analytic>[] = [
    {
      key: "name",
      header: "Analytic",
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-rr-ink">{row.name}</p>
          <p className="mt-0.5 text-[11px] text-rr-slate">
            {row.id} · {STRAND_LABELS[row.strand]} · {row.engineFamily}
          </p>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "parameters",
      header: "Params",
      align: "right",
      render: (row) => <span className="rr-numeric text-sm text-rr-ink">{formatNumber(row.parameters)}</span>,
      sortValue: (row) => row.parameters,
    },
    {
      key: "cycle",
      header: "Cycle time",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="rr-numeric text-sm font-semibold text-rr-ink">{row.cycleDays}d</span>
          <p className="text-[11px] text-rr-slate">{Math.round(row.cycleDays / row.targetDays)}× target</p>
        </div>
      ),
      sortValue: (row) => row.cycleDays,
    },
    {
      key: "precision",
      header: "Precision",
      align: "right",
      render: (row) =>
        row.live ? (
          <div className="text-right">
            <span className="rr-numeric text-sm text-rr-ink">{row.precisionPct}%</span>
            <p className="text-[11px] text-rr-slate">{formatNumber(row.falsePositives)} false positives</p>
          </div>
        ) : (
          <Badge variant="outline">Backlog</Badge>
        ),
      sortValue: (row) => row.precisionPct,
    },
    {
      key: "notifications",
      header: "DNs / yr",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="rr-numeric text-sm text-rr-ink">{formatNumber(row.notifications)}</span>
          <p className="text-[11px] text-rr-slate">from {formatNumber(row.observations)} obs</p>
        </div>
      ),
      sortValue: (row) => row.notifications,
    },
    {
      key: "value",
      header: "Disruption avoided",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="rr-numeric text-sm text-rr-ink">{formatUsd(row.costAvoidedUsd)}</span>
          <p className="text-[11px] text-rr-slate">{row.avoidableEvents} events / 6 mo</p>
        </div>
      ),
      sortValue: (row) => row.costAvoidedUsd,
    },
    {
      key: "status",
      header: "State",
      render: (row) => <StatusPill status={row.status}>{row.live ? "Live" : "In build"}</StatusPill>,
      sortValue: (row) => row.status,
    },
  ];

  return (
    <Panel padded={false}>
      <div className="p-6 pb-0">
        <PanelHeader
          title="Analytic population"
          subtitle={`${visible.length} of ${rows.length} analytics · sorted worst cycle time first`}
        />
        <FilterBar className="pb-4">
          <FilterChip label="All strands" active={strand === "all"} onClick={() => setStrand("all")} count={rows.length} />
          {(["snapshot", "continuous"] as AnalyticStrand[]).map((s) => (
            <FilterChip
              key={s}
              label={STRAND_LABELS[s]}
              active={strand === s}
              onClick={() => setStrand(s)}
              count={rows.filter((row) => row.strand === s).length}
            />
          ))}
          <FilterChip
            label="Live only"
            active={liveOnly}
            onClick={() => setLiveOnly((v) => !v)}
            count={rows.filter((row) => row.live).length}
          />
        </FilterBar>
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        rowAccent={(row) => accent[row.status]}
        initialSortKey="cycle"
        emptyMessage="No analytics match these filters."
      />
    </Panel>
  );
}
