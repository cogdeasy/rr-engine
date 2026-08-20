"use client";

import * as React from "react";
import type { OperatorAdvisory, OperatorEngineRow, OperatorPlannedEvent } from "@rr/types";
import {
  Badge,
  DataTable,
  SearchInput,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";

const ACCENT: Record<string, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

/** Fleet, planned events and advisories — the operator's reference detail. */
export function FleetTabs({
  engines,
  events,
  advisories,
}: {
  engines: OperatorEngineRow[];
  events: OperatorPlannedEvent[];
  advisories: OperatorAdvisory[];
}) {
  const [tab, setTab] = React.useState("engines");
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const filteredEngines = engines.filter(
    (e) => q === "" || e.esn.toLowerCase().includes(q) || (e.tail ?? "").toLowerCase().includes(q) || e.family.toLowerCase().includes(q),
  );
  const filteredEvents = events.filter(
    (e) => q === "" || e.esn.toLowerCase().includes(q) || (e.tail ?? "").toLowerCase().includes(q) || e.reference.toLowerCase().includes(q),
  );
  const filteredAdvisories = advisories.filter((a) => q === "" || a.reference.toLowerCase().includes(q) || a.title.toLowerCase().includes(q));

  const engineColumns: Column<OperatorEngineRow>[] = [
    {
      key: "esn",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">{row.family}</p>
        </div>
      ),
    },
    {
      key: "tail",
      header: "Aircraft",
      sortValue: (row) => row.tail ?? "",
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm text-rr-ink">{row.tail ?? "Off wing"}</p>
          <p className="text-[11px] text-rr-slate">{row.position ? `Position ${row.position}` : "Spare pool"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "reason",
      header: "Why",
      width: "30%",
      render: (row) => <p className="text-xs leading-relaxed text-rr-slate">{row.reason}</p>,
    },
    {
      key: "health",
      header: "Health",
      align: "right",
      sortValue: (row) => row.healthScore,
      render: (row) => (
        <span className={cn("rr-numeric text-sm font-semibold", statusStyles[row.status].text)}>{row.healthScore}</span>
      ),
    },
    {
      key: "rul",
      header: "Cycles remaining",
      align: "right",
      sortValue: (row) => row.rulCycles,
      render: (row) => <span className="rr-numeric text-sm text-rr-ink">{formatNumber(row.rulCycles)}</span>,
    },
    {
      key: "next",
      header: "Next event",
      align: "right",
      sortValue: (row) => row.nextEventAt ?? "9999",
      render: (row) =>
        row.nextEvent ? (
          <div>
            <p className="text-xs font-medium text-rr-ink">{row.nextEvent}</p>
            <p className="rr-numeric text-[11px] text-rr-slate">{row.nextEventAt ? formatDate(row.nextEventAt) : ""}</p>
          </div>
        ) : (
          <span className="text-xs text-rr-slate">None planned</span>
        ),
    },
  ];

  const eventColumns: Column<OperatorPlannedEvent>[] = [
    {
      key: "event",
      header: "Event",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-rr-ink">{row.label}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{row.reference}</p>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Asset",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm text-rr-ink">{row.esn}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{row.tail ?? "Off wing"}</p>
        </div>
      ),
    },
    { key: "facility", header: "Location", sortValue: (row) => row.facility, render: (row) => <span className="text-xs text-rr-ink">{row.facility}</span> },
    {
      key: "window",
      header: "Window",
      sortValue: (row) => row.startsAt,
      render: (row) => (
        <div>
          <p className="rr-numeric text-xs text-rr-ink">
            {formatDate(row.startsAt)} → {formatDate(row.endsAt)}
          </p>
          <p className="text-[11px] text-rr-slate">
            {row.startsInDays < 0 ? `Started ${Math.abs(row.startsInDays)}d ago` : `Starts in ${row.startsInDays}d`} · {row.downtimeDays}d downtime
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) => (
        <div className="space-y-1">
          <StatusPill status={row.status}>{row.confirmed ? "Confirmed" : row.status === "red" ? "At risk" : "Awaiting release"}</StatusPill>
          <p className="text-[11px] leading-relaxed text-rr-slate">{row.reason}</p>
        </div>
      ),
    },
  ];

  const advisoryColumns: Column<OperatorAdvisory>[] = [
    {
      key: "reference",
      header: "Reference",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{row.reference}</p>
          <p className="text-[11px] text-rr-slate">{row.family}</p>
        </div>
      ),
    },
    { key: "title", header: "Subject", width: "34%", render: (row) => <p className="text-xs leading-relaxed text-rr-ink">{row.title}</p> },
    {
      key: "mandatory",
      header: "Type",
      render: (row) => <Badge variant={row.mandatory ? "brand" : "neutral"}>{row.mandatory ? `${row.kind} · mandatory` : row.kind}</Badge>,
    },
    {
      key: "embodiment",
      header: "Embodiment",
      align: "right",
      sortValue: (row) => row.embodiedEngines / Math.max(1, row.affectedEngines),
      render: (row) => (
        <span className="rr-numeric text-sm text-rr-ink">
          {row.embodiedEngines}/{row.affectedEngines}
        </span>
      ),
    },
    {
      key: "due",
      header: "Compliance due",
      align: "right",
      sortValue: (row) => row.dueAt,
      render: (row) => (
        <div>
          <p className="rr-numeric text-xs text-rr-ink">{formatDate(row.dueAt)}</p>
          <StatusPill status={row.status} className="mt-1">
            {row.status === "red"
              ? "Overdue"
              : row.status === "amber"
                ? "Plan now"
                : row.status === "grey"
                  ? "Optional"
                  : row.embodiedEngines >= row.affectedEngines
                    ? "Complete"
                    : "On plan"}
          </StatusPill>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: "engines", label: "Engine status", count: engines.length },
            { id: "events", label: "Planned events", count: events.length },
            { id: "advisories", label: "Advisories", count: advisories.length },
          ]}
          active={tab}
          onChange={setTab}
          className="flex-1"
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search ESN, tail or reference" />
      </div>

      {tab === "engines" ? (
        <DataTable
          columns={engineColumns}
          rows={filteredEngines}
          rowKey={(row) => row.engineId}
          rowAccent={(row) => ACCENT[row.status]}
        />
      ) : null}
      {tab === "events" ? (
        <DataTable columns={eventColumns} rows={filteredEvents} rowKey={(row) => row.id} rowAccent={(row) => ACCENT[row.status]} />
      ) : null}
      {tab === "advisories" ? (
        <DataTable columns={advisoryColumns} rows={filteredAdvisories} rowKey={(row) => row.id} rowAccent={(row) => ACCENT[row.status]} />
      ) : null}
    </div>
  );
}
