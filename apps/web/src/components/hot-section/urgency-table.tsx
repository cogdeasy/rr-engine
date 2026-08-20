"use client";

import * as React from "react";
import Link from "next/link";
import type { HotSectionAssessment } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  DriverAttributionBar,
  FilterBar,
  FilterChip,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";
import { formatHorizon } from "./format";

type FilterId = "all" | "act" | "watch" | "wash" | "evidence";

const PAGE_SIZE = 20;

/** Ranked restoration queue: who comes off wing first, and why. */
export function UrgencyTable({ assessments }: { assessments: HotSectionAssessment[] }) {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const select = (next: FilterId) => {
    setFilter(next);
    setVisible(PAGE_SIZE);
  };

  const counts = React.useMemo(
    () => ({
      all: assessments.length,
      act: assessments.filter((a) => a.status === "red").length,
      watch: assessments.filter((a) => a.status === "amber").length,
      wash: assessments.filter((a) => a.wash.overdueDays > 0).length,
      evidence: assessments.filter((a) => a.indicators.some((i) => i.status === "grey")).length,
    }),
    [assessments],
  );

  const rows = React.useMemo(() => {
    switch (filter) {
      case "act":
        return assessments.filter((a) => a.status === "red");
      case "watch":
        return assessments.filter((a) => a.status === "amber");
      case "wash":
        return assessments.filter((a) => a.wash.overdueDays > 0);
      case "evidence":
        return assessments.filter((a) => a.indicators.some((i) => i.status === "grey"));
      default:
        return assessments;
    }
  }, [assessments, filter]);

  const columns: Column<HotSectionAssessment>[] = [
    {
      key: "engine",
      header: "Engine",
      width: "17%",
      render: (row) => (
        <div>
          <Link href={`/engines/${row.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
            {row.esn}
          </Link>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.tail ?? "off wing"}
          </p>
        </div>
      ),
      sortValue: (row) => row.esn,
    },
    {
      key: "operator",
      header: "Operator",
      width: "12%",
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.operatorName}</p>
          <p className="text-[11px] text-rr-slate">
            {row.operatorCode} · {row.location}
          </p>
        </div>
      ),
      sortValue: (row) => row.operatorName,
    },
    {
      key: "margin",
      header: "EGT margin",
      align: "right",
      width: "8%",
      render: (row) => (
        <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>{row.egtMargin.toFixed(1)}°C</span>
      ),
      sortValue: (row) => row.egtMargin,
    },
    {
      key: "rate",
      header: "Rate °C/100 cyc",
      align: "right",
      width: "11%",
      render: (row) => {
        const ratio = row.deteriorationRatePer100Cycles / Math.max(0.05, row.familyMedianRatePer100Cycles);
        return (
          <div>
            <span className={cn("rr-numeric font-semibold", ratio > 1.25 ? "text-status-red" : ratio > 1.05 ? "text-status-amber" : "text-rr-ink")}>
              {row.deteriorationRatePer100Cycles.toFixed(2)}
            </span>
            <p className="rr-numeric text-[11px] text-rr-slate">{ratio.toFixed(2)}× family median</p>
          </div>
        );
      },
      sortValue: (row) => row.deteriorationRatePer100Cycles,
    },
    {
      key: "horizon",
      header: "Margin exhausted",
      align: "right",
      width: "11%",
      render: (row) => (
        <div>
          <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>{formatHorizon(row.daysToExhaustion)}</span>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatDate(row.exhaustionDate)}</p>
        </div>
      ),
      sortValue: (row) => -row.daysToExhaustion,
    },
    {
      key: "hardware",
      header: "Worst indicator",
      width: "13%",
      render: (row) => {
        const worst = [...row.indicators].sort((a, b) => b.index - a.index)[0]!;
        return (
          <div>
            <p className="text-[13px] text-rr-ink">{worst.label}</p>
            <p className={cn("rr-numeric text-[11px]", statusStyles[worst.status].text)}>
              {worst.status === "grey" ? "no evidence" : `${worst.index}/100`}
            </p>
          </div>
        );
      },
      sortValue: (row) => row.worstIndicatorIndex,
    },
    {
      key: "drivers",
      header: "Rate drivers",
      width: "12%",
      render: (row) => (
        <div>
          <DriverAttributionBar drivers={row.drivers} />
          <p className="mt-1.5 text-[11px] text-rr-slate">
            {row.drivers[0]!.label} {Math.round(row.drivers[0]!.share * 100)}% · sev {row.environmentSeverity}/5 · derate{" "}
            {row.meanDeratePct.toFixed(0)}%
          </p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      width: "16%",
      render: (row) => (
        <div className="flex items-start gap-2">
          <StatusPill status={row.action.status}>{row.urgency}</StatusPill>
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-snug text-rr-ink">{row.action.label}</p>
            {row.action.byDate ? <p className="rr-numeric text-[11px] text-rr-slate">by {formatDate(row.action.byDate)}</p> : null}
          </div>
        </div>
      ),
      sortValue: (row) => row.urgency,
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterChip label="All assessed" count={counts.all} active={filter === "all"} onClick={() => select("all")} />
        <FilterChip label="Act now" count={counts.act} active={filter === "act"} onClick={() => select("act")} />
        <FilterChip label="Watchlist" count={counts.watch} active={filter === "watch"} onClick={() => select("watch")} />
        <FilterChip label="Wash overdue" count={counts.wash} active={filter === "wash"} onClick={() => select("wash")} />
        <FilterChip label="Awaiting evidence" count={counts.evidence} active={filter === "evidence"} onClick={() => select("evidence")} />
        <span className="ml-auto text-[11px] text-rr-slate">
          Urgency blends time to exhaustion, margin consumed, hardware condition and rate against the family median.
        </span>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows.slice(0, visible)}
        rowKey={(row) => row.engineId}
        initialSortKey="action"
        rowAccent={(row) => statusStyles[row.status].dot.replace("bg-", "border-")}
        dense
        emptyMessage="No engines match this filter."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-rr-slate">
          Showing {formatNumber(Math.min(visible, rows.length))} of {formatNumber(rows.length)} engines in this filter ·{" "}
          {formatNumber(assessments.length)} assessed.{" "}
          <Badge variant="outline">Deterministic dataset · generated fleet</Badge>
        </p>
        {visible < rows.length ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, rows.length - visible)} more
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVisible(rows.length)}>
              Show all {formatNumber(rows.length)}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
