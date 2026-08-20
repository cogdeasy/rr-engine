"use client";

import * as React from "react";
import type { ShortageLine } from "@rr/types";
import {
  Badge,
  Button,
  CoverageBar,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  cn,
  formatNumber,
  formatUsd,
  type Column,
} from "@rr/ui";

const COLLAPSED_ROWS = 12;

const ACTION_LABELS: Record<ShortageLine["action"], string> = {
  expedite: "Expedite",
  transfer: "Transfer",
  "raise-po": "Raise PO",
  monitor: "Monitor",
};

/**
 * The shortage board: parts short against planned demand inside the horizon,
 * red where a work order is already held. Blocking lines come first because
 * they are the only ones costing turn-around time today.
 */
export function ShortageBoard({
  shortages,
  facilities,
  horizonDays,
}: {
  shortages: ShortageLine[];
  facilities: { id: string; icao: string }[];
  horizonDays: number;
}) {
  const [facilityId, setFacilityId] = React.useState<string | "all">("all");
  const [blockingOnly, setBlockingOnly] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return shortages.filter((line) => {
      if (facilityId !== "all" && line.position.facilityId !== facilityId) return false;
      if (blockingOnly && line.position.blockingDemand === 0) return false;
      if (needle.length === 0) return true;
      return (
        line.position.partNumber.toLowerCase().includes(needle) ||
        line.position.description.toLowerCase().includes(needle) ||
        line.workOrderRefs.some((ref) => ref.toLowerCase().includes(needle))
      );
    });
  }, [shortages, facilityId, blockingOnly, query]);

  const columns: Column<ShortageLine>[] = [
    {
      key: "part",
      header: "Part",
      width: "24%",
      sortValue: (row) => row.position.partNumber,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.position.partNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {row.position.description}
            {row.position.lifeLimited ? " · life-limited" : ""}
          </p>
        </div>
      ),
    },
    {
      key: "facility",
      header: "Facility",
      sortValue: (row) => row.position.facilityIcao,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.position.facilityIcao}</p>
          <p className="text-[11px] text-rr-slate">{row.position.supplier}</p>
        </div>
      ),
    },
    {
      key: "cover",
      header: "Cover",
      width: "16%",
      sortValue: (row) => row.position.projectedBalance,
      render: (row) => (
        <div className="space-y-1.5">
          <CoverageBar
            available={row.position.available}
            demand={row.position.demand90}
            inbound={row.position.onOrder}
            status={row.position.status}
          />
          <p className="rr-numeric text-[11px] text-rr-slate">
            {row.position.available} avail · {row.position.demand90} req
            {row.position.onOrder > 0 ? ` · ${row.position.onOrder} inbound` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "short",
      header: "Short",
      align: "right",
      sortValue: (row) => row.position.shortfall,
      render: (row) => (
        <span className={cn("rr-numeric text-lg font-semibold", row.position.blockingDemand > 0 ? "text-status-red" : "text-status-amber")}>
          {row.position.shortfall}
        </span>
      ),
    },
    {
      key: "need",
      header: "Need in",
      align: "right",
      sortValue: (row) => row.position.daysToFirstNeed ?? 999,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">
            {row.position.daysToFirstNeed === null
              ? "—"
              : row.position.daysToFirstNeed === 0
                ? "now"
                : `${row.position.daysToFirstNeed}d`}
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">lead {row.position.leadTimeDays}d</p>
        </div>
      ),
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      sortValue: (row) => row.exposureUsd,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-ink">{formatUsd(row.exposureUsd)}</span>,
    },
    {
      key: "held",
      header: "Work held",
      sortValue: (row) => row.workOrderRefs.length,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.workOrderRefs.slice(0, 2).map((ref) => (
            <Badge key={ref} variant={row.position.blockingDemand > 0 ? "brand" : "outline"}>
              {ref}
            </Badge>
          ))}
          {row.workOrderRefs.length > 2 ? (
            <span className="rr-numeric text-[11px] text-rr-slate">+{row.workOrderRefs.length - 2}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      width: "22%",
      render: (row) => (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-rr-ink">{row.actionLabel}</p>
            <p className="text-[11px] text-rr-slate">{row.position.reason}</p>
          </div>
          <Button size="sm" variant={row.position.blockingDemand > 0 ? "primary" : "secondary"}>
            {ACTION_LABELS[row.action]}
          </Button>
        </div>
      ),
    },
  ];

  const blockingCount = shortages.filter((line) => line.position.blockingDemand > 0).length;

  return (
    <Panel padded={false} className="border-0 bg-transparent shadow-none">
      <PanelHeader
        title={`Shortage board — next ${horizonDays} days`}
        subtitle="Parts short against planned work. Red lines are already holding a work order."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Part, description or WO" />
            <Button size="sm" variant="secondary">
              Export
            </Button>
          </div>
        }
      />
      <FilterBar className="pb-3">
        <FilterChip label="All facilities" active={facilityId === "all"} onClick={() => setFacilityId("all")} count={shortages.length} />
        {facilities.map((facility) => {
          const count = shortages.filter((line) => line.position.facilityId === facility.id).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={facility.id}
              label={facility.icao}
              active={facilityId === facility.id}
              onClick={() => setFacilityId(facility.id)}
              count={count}
            />
          );
        })}
        <span className="mx-1 h-4 w-px bg-rr-ink/10" aria-hidden />
        <FilterChip
          label="Blocking work orders"
          active={blockingOnly}
          onClick={() => setBlockingOnly((value) => !value)}
          count={blockingCount}
        />
      </FilterBar>
      <div className={cn("overflow-auto", expanded ? "max-h-none" : "max-h-[640px]")}>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.position.id}
        rowAccent={(row) =>
          row.position.status === "red" ? "border-status-red" : row.position.status === "amber" ? "border-status-amber" : "border-status-green"
        }
        emptyMessage="No shortages match the current filters — planned work is fully covered."
        initialSortKey="short"
        dense
      />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="rr-numeric text-[11px] text-rr-slate">
          {formatNumber(rows.length)} matching lines · {formatNumber(shortages.length)} short in total
        </p>
        {rows.length > COLLAPSED_ROWS ? (
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Collapse board" : "Expand full board"}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
