"use client";

import * as React from "react";
import type { CapacityCell, CapacityOverview, FacilityCapacityProfile, InductionDemand, StatusLevel } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  Metric,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";

const CELL_TONE: Record<StatusLevel, string> = {
  red: "bg-status-red text-white",
  amber: "bg-status-amber text-white",
  green: "bg-status-green-soft text-status-green",
  grey: "bg-rr-mist text-rr-slate",
};

function cellTone(cell: CapacityCell): string {
  if (cell.status === "green" && cell.utilisationPct < 40) return "bg-rr-mist text-rr-slate";
  return CELL_TONE[cell.status];
}

function workscopeLabel(value: InductionDemand["workscope"]): string {
  return value.replace(/-/g, " ");
}

/**
 * Month x facility heat grid wired to a facility detail view. Selecting a cell
 * scopes the detail panel to that shop and highlights the month that drove it.
 */
export function CapacityWorkspace({ overview }: { overview: CapacityOverview }) {
  const worst = [...overview.facilities].sort(
    (a, b) => b.overloadedMonths - a.overloadedMonths || b.peakUtilisationPct - a.peakUtilisationPct,
  )[0];
  const [facilityId, setFacilityId] = React.useState(worst?.facilityId ?? overview.facilities[0]?.facilityId ?? "");
  const [month, setMonth] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("queue");
  const [query, setQuery] = React.useState("");
  const [onlyLate, setOnlyLate] = React.useState(false);

  const facility = overview.facilities.find((f) => f.facilityId === facilityId) ?? overview.facilities[0];
  const queue = React.useMemo(() => {
    if (!facility) return [];
    const term = query.trim().toLowerCase();
    return overview.demand
      .filter((d) => d.plannedFacilityId === facility.facilityId)
      .filter((d) => (onlyLate ? d.delayDays > 0 : true))
      .filter((d) =>
        term.length === 0
          ? true
          : [d.esn, d.family, d.operatorName, d.operatorCode].some((v) => v.toLowerCase().includes(term)),
      )
      .sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
  }, [facility, onlyLate, overview.demand, query]);

  const lateInQueue = facility
    ? overview.demand.filter((d) => d.plannedFacilityId === facility.facilityId && d.delayDays > 0).length
    : 0;

  const columns: Column<InductionDemand>[] = [
    {
      key: "esn",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.family} · {row.operatorCode}
          </p>
        </div>
      ),
    },
    {
      key: "driver",
      header: "Removal driver",
      sortValue: (row) => row.driver,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.driver.replace(/-/g, " ")}</p>
          <p className="text-[11px] text-rr-slate">{row.driverDetail}</p>
        </div>
      ),
    },
    {
      key: "workscope",
      header: "Workscope",
      sortValue: (row) => row.workscope,
      render: (row) => <span className="text-[13px] capitalize text-rr-slate">{workscopeLabel(row.workscope)}</span>,
    },
    {
      key: "removalDue",
      header: "Removal due",
      align: "right",
      sortValue: (row) => row.removalDue,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-ink">{formatDate(row.removalDue)}</span>,
    },
    {
      key: "plannedStart",
      header: "Slot",
      align: "right",
      sortValue: (row) => row.plannedStart,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{formatDate(row.plannedStart)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{row.tatDays} day TAT</p>
        </div>
      ),
    },
    {
      key: "delayDays",
      header: "Slip",
      align: "right",
      sortValue: (row) => row.delayDays,
      render: (row) => (
        <StatusPill status={row.status}>{row.delayDays === 0 ? "on date" : `+${row.delayDays}d`}</StatusPill>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Utilisation heat grid"
          subtitle="Bay-months demanded against contracted bays, by shop and month. Select a cell to scope the shop detail."
          actions={
            <div className="flex items-center gap-3 text-[11px] text-rr-slate">
              <LegendSwatch className="bg-rr-mist" label="< 40%" />
              <LegendSwatch className="bg-status-green-soft" label="40–85%" />
              <LegendSwatch className="bg-status-amber" label="85–100%" />
              <LegendSwatch className="bg-status-red" label="> 100% overloaded" />
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th className="rr-label sticky left-0 z-10 bg-white pr-3 text-left text-rr-slate">Shop</th>
                {overview.months.map((m) => (
                  <th key={m.key} className="rr-label px-1 text-center text-rr-slate">
                    {m.label.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.facilities.map((f) => (
                <tr key={f.facilityId}>
                  <th scope="row" className="sticky left-0 z-10 bg-white pr-3 text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setFacilityId(f.facilityId);
                        setMonth(null);
                      }}
                      className={cn(
                        "flex w-44 flex-col rounded-sm border-l-2 px-2 py-1 text-left transition-colors hover:bg-rr-blue-50/70",
                        statusStyles[f.status].border.replace("border-", "border-l-"),
                        facility?.facilityId === f.facilityId && "bg-rr-blue-50",
                      )}
                    >
                      <span className="text-[13px] font-semibold text-rr-ink">{f.icao}</span>
                      <span className="truncate text-[11px] text-rr-slate">{f.name}</span>
                    </button>
                  </th>
                  {overview.months.map((m) => {
                    const cell = overview.cells.find((c) => c.facilityId === f.facilityId && c.month === m.key);
                    if (!cell) return <td key={m.key} />;
                    const selected = facility?.facilityId === f.facilityId && month === m.key;
                    return (
                      <td key={m.key} className="p-0">
                        <button
                          type="button"
                          onClick={() => {
                            setFacilityId(f.facilityId);
                            setMonth(m.key);
                          }}
                          aria-label={`${f.icao} ${m.label}: ${cell.utilisationPct}% utilisation, ${cell.inductions} inductions`}
                          className={cn(
                            "rr-numeric h-11 w-full rounded-[3px] text-center text-[12px] font-semibold transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                            cellTone(cell),
                            selected && "ring-2 ring-rr-blue ring-offset-1",
                          )}
                        >
                          {cell.utilisationPct}
                          <span className="block text-[9px] font-medium opacity-70">{cell.inductions} in</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-rr-slate">
          Red cells are months where engines due for removal need more bay-days than the shop has contracted to this
          portfolio — the overflow is what the load-levelling plan below moves.
        </p>
      </Panel>

      {facility ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="min-w-0">
            <PanelHeader
              title={`${facility.name} — induction queue`}
              subtitle={
                month
                  ? `Filtered context: ${overview.months.find((m) => m.key === month)?.label ?? month}`
                  : "Slots in date order, worst slip first when sorted"
              }
              actions={<StatusPill status={facility.status}>{facility.icao}</StatusPill>}
            />
            <Tabs
              tabs={[
                { id: "queue", label: "Induction queue", count: queue.length },
                { id: "capabilities", label: "Capabilities", count: facility.capabilities.filter((c) => c.certified).length },
              ]}
              active={tab}
              onChange={setTab}
              className="mb-4"
            />

            {tab === "queue" ? (
              <div className="space-y-3">
                <FilterBar>
                  <SearchInput value={query} onChange={setQuery} placeholder="ESN, family or operator" />
                  <FilterChip label="Slipping past removal date" active={onlyLate} onClick={() => setOnlyLate((v) => !v)} count={lateInQueue} />
                </FilterBar>
                <DataTable
                  columns={columns}
                  rows={queue.slice(0, 12)}
                  rowKey={(row) => row.engineId}
                  rowAccent={(row) => statusStyles[row.status].border.replace("border-", "border-l-")}
                  dense
                  emptyMessage="No inductions planned at this shop inside the horizon."
                />
                {queue.length > 12 ? (
                  <p className="text-[11px] text-rr-slate">
                    Showing the first 12 of {queue.length} planned inductions.
                  </p>
                ) : null}
              </div>
            ) : (
              <CapabilityTable facility={facility} />
            )}
          </Panel>

          <FacilityDetail facility={facility} cells={overview.cells.filter((c) => c.facilityId === facility.facilityId)} month={month} />
        </div>
      ) : null}
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-[2px]", className)} />
      {label}
    </span>
  );
}

function CapabilityTable({ facility }: { facility: FacilityCapacityProfile }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-rr-ink/8">
          <th className="rr-label py-2 text-left text-rr-slate">Engine family</th>
          <th className="rr-label py-2 text-left text-rr-slate">Certification</th>
          <th className="rr-label py-2 text-right text-rr-slate">Mean TAT</th>
          <th className="rr-label py-2 text-right text-rr-slate">In work</th>
        </tr>
      </thead>
      <tbody>
        {facility.capabilities.map((capability) => (
          <tr key={capability.family} className="border-b border-rr-ink/5 last:border-0">
            <td className="py-2.5 text-[13px] font-medium text-rr-ink">{capability.family}</td>
            <td className="py-2.5">
              {capability.certified ? (
                <Badge variant="brand">Certified</Badge>
              ) : (
                <span className="text-[12px] text-rr-slate">Not tooled</span>
              )}
            </td>
            <td className="rr-numeric py-2.5 text-right text-[13px] text-rr-ink">
              {capability.certified ? `${capability.averageTatDays} d` : "—"}
            </td>
            <td className="rr-numeric py-2.5 text-right text-[13px] text-rr-slate">{capability.inductions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FacilityDetail({
  facility,
  cells,
  month,
}: {
  facility: FacilityCapacityProfile;
  cells: CapacityCell[];
  month: string | null;
}) {
  const selectedCell = month ? cells.find((c) => c.month === month) : undefined;
  return (
    <Panel className="space-y-5">
      <PanelHeader title="Shop detail" subtitle={`${facility.kind.replace(/-/g, " ")} · ${facility.region}`} />

      <div className="grid grid-cols-2 gap-4">
        <Metric label="Contracted bays" value={facility.bays} hint={`${facility.technicians} technicians`} />
        <Metric
          label="Mean utilisation"
          value={`${facility.utilisationPct}%`}
          status={facility.utilisationPct > 100 ? "red" : facility.utilisationPct >= 85 ? "amber" : "green"}
          hint={`Peak ${facility.peakUtilisationPct}% in ${facility.peakMonth}`}
        />
        <Metric label="Engines in work" value={facility.wipEngines} hint="Live and awaiting parts" />
        <Metric label="Average TAT" value={facility.averageTatDays} unit="days" hint={`${facility.throughputPerYear} engines/yr throughput`} />
      </div>

      <div className="rounded-sm border border-rr-ink/8 p-4">
        <p className="rr-label text-rr-slate">Next free slot</p>
        <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
          {facility.nextFreeSlot ? formatDate(facility.nextFreeSlot) : "No slot in horizon"}
        </p>
        <p className="mt-1 text-[11px] text-rr-slate">
          First date a bay is clear for a 60-day nominal slot, after work already in the shop.
        </p>
      </div>

      {facility.overloadedMonths > 0 ? (
        <div className={cn("rounded-sm border p-4", statusStyles.red.border, statusStyles.red.bg)}>
          <p className="rr-label text-status-red">Why is this red?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">
            {facility.overloadedMonths} of the next 12 months demand more bay-days than {facility.icao} has contracted
            ({facility.bays} bays), peaking at {facility.peakUtilisationPct}% in {facility.peakMonth}.
          </p>
        </div>
      ) : (
        <div className={cn("rounded-sm border p-4", statusStyles.green.border, statusStyles.green.bg)}>
          <p className="rr-label text-status-green">Within capacity</p>
          <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">
            Every month in the horizon fits inside {facility.bays} contracted bays — {facility.icao} can absorb reroutes.
          </p>
        </div>
      )}

      {selectedCell ? (
        <div className="rounded-sm border border-rr-ink/8 p-4">
          <p className="rr-label text-rr-slate">Selected month</p>
          <p className="mt-1 text-[13px] text-rr-ink">
            {selectedCell.inductions} inductions, {formatNumber(selectedCell.demandBayMonths, 1)} of{" "}
            {selectedCell.capacityBayMonths} bay-months used
            {selectedCell.overloadBayMonths > 0
              ? ` — ${formatNumber(selectedCell.overloadBayMonths, 1)} bay-months short`
              : ""}
            .
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
