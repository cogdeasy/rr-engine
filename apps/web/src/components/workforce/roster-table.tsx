"use client";

import * as React from "react";
import type { ShiftId, TechnicianProfile } from "@rr/types";
import {
  Badge,
  Column,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  ShiftLoadBar,
  StatusPill,
  cn,
  statusStyles,
} from "@rr/ui";

const SHIFTS: ShiftId[] = ["early", "late", "night"];

/** Technician roster with currency, capacity and current assignments. */
export function RosterTable({
  roster,
  facilities,
}: {
  roster: TechnicianProfile[];
  facilities: { id: string; icao: string }[];
}) {
  const [query, setQuery] = React.useState("");
  const [shift, setShift] = React.useState<ShiftId | "all">("all");
  const [facilityId, setFacilityId] = React.useState("all");
  const [currencyOnly, setCurrencyOnly] = React.useState(false);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster.filter((profile) => {
      if (shift !== "all" && profile.shift !== shift) return false;
      if (facilityId !== "all" && profile.facilityId !== facilityId) return false;
      if (currencyOnly && profile.status === "green") return false;
      if (!needle) return true;
      return (
        profile.technician.name.toLowerCase().includes(needle) ||
        profile.facilityIcao.toLowerCase().includes(needle) ||
        profile.technician.skills.some((s) => s.toLowerCase().includes(needle)) ||
        profile.technician.certifiedFamilies.some((f) => f.toLowerCase().includes(needle))
      );
    });
  }, [roster, query, shift, facilityId, currencyOnly]);

  const columns: Column<TechnicianProfile>[] = [
    {
      key: "name",
      header: "Technician",
      sortValue: (row) => row.technician.name,
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-rr-ink">{row.technician.name}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {row.facilityIcao} · {row.shift} shift · {row.technician.licences.join(", ") || "no licence"}
          </p>
        </div>
      ),
    },
    {
      key: "skills",
      header: "Skills & authorisations",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.technician.skills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
          {row.technician.skills.length > 3 ? <Badge variant="neutral">+{row.technician.skills.length - 3}</Badge> : null}
          {row.technician.certifiedFamilies.slice(0, 2).map((family) => (
            <Badge key={family} variant="brand">
              {family}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "load",
      header: "Load",
      align: "left",
      width: "150px",
      sortValue: (row) => row.technician.utilisationPct,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.technician.utilisationPct}%</p>
          <ShiftLoadBar
            className="mt-1"
            demandHours={row.committedHoursPerWeek}
            capacityHours={row.contractedHoursPerWeek}
            status={row.technician.utilisationPct > 90 ? "red" : row.technician.utilisationPct > 80 ? "amber" : "green"}
          />
        </div>
      ),
    },
    {
      key: "spare",
      header: "Bookable / week",
      align: "right",
      sortValue: (row) => row.availableHoursPerWeek,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.availableHoursPerWeek}h</p>
          <p className="text-[11px] text-rr-slate">
            {row.absenceWeeks > 0 && row.absenceReason ? `${row.absenceWeeks}w ${row.absenceReason}` : "no absence booked"}
          </p>
        </div>
      ),
    },
    {
      key: "assigned",
      header: "Assigned",
      align: "right",
      sortValue: (row) => row.assignedHours,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.assignedTaskCards} cards</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{row.assignedHours}h</p>
        </div>
      ),
    },
    {
      key: "currency",
      header: "Currency",
      /** Negated so the table's default descending sort surfaces lapsed first. */
      sortValue: (row) => -(row.nextExpiry?.daysToExpiry ?? 9999),
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusPill status={row.status}>{currencyLabel(row)}</StatusPill>
          {row.nextExpiry ? (
            <span className={cn("rr-numeric text-[11px]", statusStyles[row.nextExpiry.status].text)}>
              {row.nextExpiry.label}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Technician roster"
        subtitle="Skills, engine-family authorisations, bookable hours and live assignments"
        actions={<span className="rr-numeric text-xs text-rr-slate">{rows.length} of {roster.length}</span>}
      />

      <FilterBar className="pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Name, skill, family or station" />
        <FilterChip label="All shifts" active={shift === "all"} onClick={() => setShift("all")} />
        {SHIFTS.map((id) => (
          <FilterChip key={id} label={id} active={shift === id} onClick={() => setShift(id)} />
        ))}
        <span className="mx-1 h-4 w-px bg-rr-ink/10" aria-hidden />
        <FilterChip label="All stations" active={facilityId === "all"} onClick={() => setFacilityId("all")} />
        {facilities.map((facility) => (
          <FilterChip
            key={facility.id}
            label={facility.icao}
            active={facilityId === facility.id}
            onClick={() => setFacilityId(facility.id)}
          />
        ))}
        <FilterChip
          label="Currency risk only"
          active={currencyOnly}
          onClick={() => setCurrencyOnly((prev) => !prev)}
        />
      </FilterBar>

      <div className="max-h-[560px] overflow-y-auto">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.technician.id}
          initialSortKey="currency"
          dense
          emptyMessage="No technicians match these filters."
          rowAccent={(row) => (row.status === "red" ? "border-l-status-red" : undefined)}
        />
      </div>
    </Panel>
  );
}

function currencyLabel(profile: TechnicianProfile): string {
  const next = profile.nextExpiry;
  if (!next) return "current";
  if (next.daysToExpiry <= 0) return `lapsed ${Math.abs(next.daysToExpiry)}d`;
  if (next.daysToExpiry <= 90) return `${next.daysToExpiry}d left`;
  return "current";
}
