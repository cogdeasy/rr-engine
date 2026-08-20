"use client";

import * as React from "react";
import type { DebrisEvent } from "@rr/types";
import { Badge, DataTable, StatusPill, cn, formatDateTime, statusStyles, type Column } from "@rr/ui";

const SOURCE_LABELS: Record<DebrisEvent["source"], string> = {
  "electric-chip-detector": "Electric chip detector",
  "magnetic-chip-detector": "Magnetic chip detector",
  "oil-filter-inspection": "Oil filter inspection",
  "SOAP-sample": "SOAP lab sample",
};

/** Chip-detection and oil-sample log for one engine. */
export function DebrisLogTable({ events, chamberLabels }: { events: DebrisEvent[]; chamberLabels: Record<string, string> }) {
  const columns: Column<DebrisEvent>[] = [
    {
      key: "detectedAt",
      header: "Detected",
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{formatDateTime(row.detectedAt)}</p>
          <p className="text-[11px] text-rr-slate">{SOURCE_LABELS[row.source]}</p>
        </div>
      ),
      sortValue: (row) => row.detectedAt,
    },
    {
      key: "chamber",
      header: "Chamber",
      render: (row) => <span className="text-[13px] text-rr-ink">{chamberLabels[row.chamber] ?? row.chamber}</span>,
      sortValue: (row) => row.chamber,
    },
    {
      key: "material",
      header: "Material",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-rr-ink">{row.material}</span>
          {row.loadPathMetal ? <Badge className="bg-status-red-soft text-status-red">Load path</Badge> : null}
        </div>
      ),
      sortValue: (row) => row.material,
    },
    {
      key: "particleCount",
      header: "Particles",
      align: "right",
      render: (row) => <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>{row.particleCount}</span>,
      sortValue: (row) => row.particleCount,
    },
    {
      key: "size",
      header: "Max size",
      align: "right",
      render: (row) => (
        <span className={cn("rr-numeric", row.maxParticleMicrons >= 500 ? "font-semibold text-status-red" : "text-rr-slate")}>
          {row.maxParticleMicrons} µm
        </span>
      ),
      sortValue: (row) => row.maxParticleMicrons,
    },
    {
      key: "status",
      header: "Assessment",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={row.status}>
            {row.status === "red" ? "Bearing distress" : row.status === "amber" ? "Investigate" : "Benign wear"}
          </StatusPill>
          <span className="text-[11px] leading-snug text-rr-slate">{row.note}</span>
        </div>
      ),
      sortValue: (row) => row.status,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={events}
      rowKey={(row) => row.id}
      initialSortKey="detectedAt"
      dense
      rowAccent={(row) => statusStyles[row.status].dot.replace("bg-", "border-")}
      emptyMessage="No debris indications recorded in the monitoring window."
    />
  );
}
