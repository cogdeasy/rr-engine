"use client";

import * as React from "react";
import type { AirportExposure, RouteExposure, StatusLevel } from "@rr/types";
import {
  Badge,
  DataTable,
  EXPOSURE_DRIVER_LABELS,
  ExposureGeography,
  Panel,
  PanelHeader,
  SeverityMeter,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";

type View = "map" | "table";

const ROW_ACCENT: Record<StatusLevel, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

/**
 * Where the fleet is flying and how harsh it is: the network plot doubles as a
 * legend for the route table beneath it.
 */
export function HarshRoutes({ airports, routes }: { airports: AirportExposure[]; routes: RouteExposure[] }) {
  const [view, setView] = React.useState<View>("map");
  const ranked = React.useMemo(() => [...routes].sort((a, b) => b.severityIndex - a.severityIndex), [routes]);
  const plotted = React.useMemo(() => ranked.slice(0, 24), [ranked]);

  const columns: Column<RouteExposure>[] = [
    {
      key: "route",
      header: "Pairing",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.label}</p>
          <p className="text-[11px] text-rr-slate">{row.operatorCodes.join(" · ")}</p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      align: "right",
      sortValue: (row) => row.severityIndex,
      width: "160px",
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rr-numeric text-base font-semibold", statusStyles[row.status].text)}>{row.severityIndex}</span>
          <SeverityMeter value={row.severityIndex} status={row.status} />
        </div>
      ),
    },
    {
      key: "driver",
      header: "Dominant driver",
      sortValue: (row) => row.worstDriver,
      render: (row) => <Badge variant="brand">{EXPOSURE_DRIVER_LABELS[row.worstDriver]}</Badge>,
    },
    {
      key: "sectors",
      header: "Sectors",
      align: "right",
      sortValue: (row) => row.sectors,
      render: (row) => <span className="rr-numeric text-[13px]">{formatNumber(row.sectors)}</span>,
    },
    {
      key: "engines",
      header: "Engines",
      align: "right",
      sortValue: (row) => row.engineCount,
      render: (row) => <span className="rr-numeric text-[13px]">{formatNumber(row.engineCount)}</span>,
    },
    {
      key: "hours",
      header: "Block hours",
      align: "right",
      sortValue: (row) => row.blockHours,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-slate">{formatNumber(row.blockHours)}</span>,
    },
    {
      key: "status",
      header: "State",
      align: "right",
      width: "120px",
      render: (row) => <StatusPill status={row.status} />,
    },
  ];

  return (
    <Panel padded={false}>
      <div className="p-5 pb-3">
        <PanelHeader
          title="Harshest routings flown"
          subtitle="Origin/destination pairings weighted by the airport environment at both ends over the last 45 days"
          actions={<Badge variant="outline">{routes.length} pairings</Badge>}
          className="pb-3"
        />
        <Tabs
          tabs={[
            { id: "map", label: "Network" },
            { id: "table", label: "Ranked pairings", count: ranked.length },
          ]}
          active={view}
          onChange={(id) => setView(id as View)}
        />
      </div>
      {view === "map" ? (
        <div className="px-5 pb-5">
          <ExposureGeography airports={airports} routes={plotted} />
          <p className="mt-3 text-[11px] text-rr-slate">
            Marker size is sectors flown through the airport; colour is the airport severity band. Arcs show the 24 harshest
            pairings currently flown by the managed fleet.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={ranked.slice(0, 40)}
          rowKey={(row) => row.id}
          rowAccent={(row) => ROW_ACCENT[row.status]}
          initialSortKey="severity"
          dense
          className="rounded-none border-0 shadow-none"
        />
      )}
    </Panel>
  );
}
