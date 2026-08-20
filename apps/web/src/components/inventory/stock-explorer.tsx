"use client";

import * as React from "react";
import type { RotablePoolEntry, SlowMoverLine, StockPosition } from "@rr/types";
import {
  Badge,
  Button,
  ConditionMixBar,
  CoverageBar,
  DataTable,
  FilterBar,
  FilterChip,
  PanelHeader,
  SearchInput,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  formatUsd,
  type Column,
} from "@rr/ui";

type TabId = "positions" | "rotables" | "slow";

const COLLAPSED_ROWS = 14;

/**
 * The detail layer beneath the shortage board: full stock positions, the
 * rotable pool and the slow-moving stock that is tying up capital.
 */
export function StockExplorer({
  positions,
  rotables,
  slowMoverLines,
  facilities,
}: {
  positions: StockPosition[];
  rotables: RotablePoolEntry[];
  slowMoverLines: SlowMoverLine[];
  facilities: { id: string; icao: string }[];
}) {
  const [tab, setTab] = React.useState<TabId>("positions");
  const [facilityId, setFacilityId] = React.useState<string | "all">("all");
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  const needle = query.trim().toLowerCase();
  const matches = (...values: string[]) => needle.length === 0 || values.some((v) => v.toLowerCase().includes(needle));
  const facilityIcao = facilities.find((f) => f.id === facilityId)?.icao;

  const positionRows = positions.filter(
    (row) => (facilityId === "all" || row.facilityId === facilityId) && matches(row.partNumber, row.description, row.supplier),
  );
  const rotableRows = rotables.filter(
    (row) => (facilityId === "all" || row.facilityId === facilityId) && matches(row.partNumber, row.description),
  );
  const slowRows = slowMoverLines.filter(
    (row) => (facilityIcao === undefined || row.facilityIcao === facilityIcao) && matches(row.partNumber, row.description),
  );

  const positionColumns: Column<StockPosition>[] = [
    {
      key: "part",
      header: "Part",
      width: "26%",
      sortValue: (row) => row.partNumber,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.partNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {row.description} · {row.moduleCode}
          </p>
        </div>
      ),
    },
    { key: "facility", header: "Facility", sortValue: (row) => row.facilityIcao, render: (row) => <span className="rr-numeric text-[13px]">{row.facilityIcao}</span> },
    { key: "onHand", header: "On hand", align: "right", sortValue: (row) => row.onHand, render: (row) => <span className="rr-numeric">{row.onHand}</span> },
    { key: "reserved", header: "Reserved", align: "right", sortValue: (row) => row.reserved, render: (row) => <span className="rr-numeric text-rr-slate">{row.reserved}</span> },
    {
      key: "available",
      header: "Available",
      align: "right",
      sortValue: (row) => row.available,
      render: (row) => <span className="rr-numeric font-semibold">{row.available}</span>,
    },
    {
      key: "cover",
      header: "90-day cover",
      width: "15%",
      sortValue: (row) => row.projectedBalance,
      render: (row) => (
        <div className="space-y-1.5">
          <CoverageBar available={row.available} demand={row.demand90} inbound={row.onOrder} status={row.status} />
          <p className="rr-numeric text-[11px] text-rr-slate">
            {row.demand90} required{row.coverDays !== null ? ` · ${row.coverDays}d cover` : " · no demand"}
          </p>
        </div>
      ),
    },
    {
      key: "reorder",
      header: "Reorder pt",
      align: "right",
      sortValue: (row) => row.reorderPoint,
      render: (row) => (
        <span className={cn("rr-numeric", row.onHand <= row.reorderPoint ? "font-semibold text-status-amber" : "text-rr-slate")}>
          {row.reorderPoint}
        </span>
      ),
    },
    { key: "lead", header: "Lead time", align: "right", sortValue: (row) => row.leadTimeDays, render: (row) => <span className="rr-numeric text-rr-slate">{row.leadTimeDays}d</span> },
    { key: "unit", header: "Unit cost", align: "right", sortValue: (row) => row.unitCostUsd, render: (row) => <span className="rr-numeric">{formatUsd(row.unitCostUsd)}</span> },
    { key: "value", header: "Value", align: "right", sortValue: (row) => row.valueUsd, render: (row) => <span className="rr-numeric font-semibold">{formatUsd(row.valueUsd)}</span> },
    {
      key: "status",
      header: "State",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) => (
        <span title={row.reason}>
          <StatusPill status={row.status}>
            {row.status === "red" ? "Short" : row.status === "amber" ? "At risk" : row.status === "green" ? "Covered" : "No demand"}
          </StatusPill>
        </span>
      ),
    },
  ];

  const rotableColumns: Column<RotablePoolEntry>[] = [
    {
      key: "part",
      header: "Rotable",
      width: "26%",
      sortValue: (row) => row.partNumber,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.partNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {row.description} · {row.facilityIcao}
          </p>
        </div>
      ),
    },
    {
      key: "mix",
      header: "Condition mix",
      width: "20%",
      sortValue: (row) => row.serviceable,
      render: (row) => (
        <div className="space-y-1.5">
          <ConditionMixBar serviceable={row.serviceable} unserviceable={row.unserviceable} inRepair={row.inRepair} inTransit={row.inTransit} />
          <p className="rr-numeric text-[11px] text-rr-slate">
            {row.serviceable} svc · {row.unserviceable} unsvc · {row.inRepair} repair · {row.inTransit} transit
          </p>
        </div>
      ),
    },
    { key: "pool", header: "Pool", align: "right", sortValue: (row) => row.poolSize, render: (row) => <span className="rr-numeric">{row.poolSize}</span> },
    {
      key: "required",
      header: "Required",
      align: "right",
      sortValue: (row) => row.requiredServiceable,
      render: (row) => <span className="rr-numeric text-rr-slate">{row.requiredServiceable}</span>,
    },
    {
      key: "turn",
      header: "Turn time",
      align: "right",
      sortValue: (row) => row.turnTimeDays,
      render: (row) => (
        <div>
          <p className={cn("rr-numeric text-[13px] font-semibold", row.turnTimeDays > row.targetTurnDays * 1.25 ? "text-status-amber" : "text-rr-ink")}>
            {row.turnTimeDays}d
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">target {row.targetTurnDays}d</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "State",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) => (
        <span title={row.reason}>
          <StatusPill status={row.status}>{row.status === "red" ? "Below cover" : row.status === "amber" ? "Turn risk" : "Healthy"}</StatusPill>
        </span>
      ),
    },
    { key: "reason", header: "Why", width: "24%", render: (row) => <span className="text-[11px] text-rr-slate">{row.reason}</span> },
  ];

  const slowColumns: Column<SlowMoverLine>[] = [
    {
      key: "part",
      header: "Part",
      width: "30%",
      sortValue: (row) => row.partNumber,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.partNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {row.description} · {row.facilityIcao}
          </p>
        </div>
      ),
    },
    { key: "onHand", header: "On hand", align: "right", sortValue: (row) => row.onHand, render: (row) => <span className="rr-numeric">{row.onHand}</span> },
    { key: "excess", header: "Excess units", align: "right", sortValue: (row) => row.excessUnits, render: (row) => <span className="rr-numeric">{row.excessUnits}</span> },
    {
      key: "idle",
      header: "Idle",
      align: "right",
      sortValue: (row) => row.daysSinceMovement,
      render: (row) => (
        <span className={cn("rr-numeric", row.daysSinceMovement > 540 ? "font-semibold text-status-amber" : "text-rr-slate")}>
          {row.daysSinceMovement}d
        </span>
      ),
    },
    { key: "value", header: "Holding value", align: "right", sortValue: (row) => row.valueUsd, render: (row) => <span className="rr-numeric">{formatUsd(row.valueUsd)}</span> },
    {
      key: "excessValue",
      header: "Excess value",
      align: "right",
      sortValue: (row) => row.excessValueUsd,
      render: (row) => <span className="rr-numeric font-semibold">{formatUsd(row.excessValueUsd)}</span>,
    },
    {
      key: "action",
      header: "Recommended action",
      render: (row) => (
        <Badge variant="outline">
          {row.daysSinceMovement > 540 ? "Review for redistribution or scrap" : "Hold — within review window"}
        </Badge>
      ),
    },
  ];

  const counts: Record<TabId, number> = {
    positions: positionRows.length,
    rotables: rotableRows.length,
    slow: slowRows.length,
  };

  return (
    <div className="rr-panel p-5">
      <PanelHeader
        title="Stock detail"
        subtitle="Every stocked line, the rotable pool behind it and the capital sitting still"
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Part number or description" />}
      />
      <Tabs
        className="mb-3"
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "positions", label: "Stock positions", count: counts.positions },
          { id: "rotables", label: "Rotable pool", count: counts.rotables },
          { id: "slow", label: "Slow movers", count: counts.slow },
        ]}
      />
      <FilterBar className="pb-3">
        <FilterChip label="All facilities" active={facilityId === "all"} onClick={() => setFacilityId("all")} />
        {facilities.map((facility) => (
          <FilterChip
            key={facility.id}
            label={facility.icao}
            active={facilityId === facility.id}
            onClick={() => setFacilityId(facility.id)}
          />
        ))}
      </FilterBar>

      <div className={cn("relative overflow-auto", expanded ? "max-h-none" : "max-h-[720px]")}>
      {tab === "positions" ? (
        <DataTable
          columns={positionColumns}
          rows={positionRows}
          rowKey={(row) => row.id}
          rowAccent={(row) =>
            row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : row.status === "green" ? "border-status-green" : "border-status-grey"
          }
          initialSortKey="value"
          dense
        />
      ) : null}
      {tab === "rotables" ? (
        <DataTable
          columns={rotableColumns}
          rows={rotableRows}
          rowKey={(row) => `${row.partNumber}-${row.facilityId}`}
          rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : "border-status-green")}
          initialSortKey="turn"
          dense
        />
      ) : null}
      {tab === "slow" ? (
        <DataTable
          columns={slowColumns}
          rows={slowRows}
          rowKey={(row) => `${row.partNumber}-${row.facilityIcao}`}
          initialSortKey="excessValue"
          dense
        />
      ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(counts[tab])} lines</p>
        {counts[tab] > COLLAPSED_ROWS ? (
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Collapse list" : "Expand full list"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
