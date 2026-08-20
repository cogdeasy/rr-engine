"use client";

import * as React from "react";
import Link from "next/link";
import type { AogEvent } from "@rr/types";
import {
  AogFactRow,
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  RecoveryTimeline,
  SearchInput,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { RecoveryClock, TargetCountdown } from "./recovery-clock";

type FilterId = "all" | "breached" | "parts" | "labour";

const FILTERS: { id: FilterId; label: string; match: (event: AogEvent) => boolean }[] = [
  { id: "all", label: "All events", match: () => true },
  { id: "breached", label: "Target breached", match: (e) => e.hoursToTarget < 0 || e.slipHours > 0 },
  { id: "parts", label: "Blocked on parts", match: (e) => e.blockingStepId === "parts" },
  { id: "labour", label: "Blocked on labour", match: (e) => e.blockingStepId === "labour" },
];

export function AogCommandCentre({ events }: { events: AogEvent[] }) {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(events[0]?.id ?? "");
  const [committed, setCommitted] = React.useState<Record<string, string>>({});

  const visible = React.useMemo(() => {
    const matcher = FILTERS.find((f) => f.id === filter)!.match;
    const needle = query.trim().toLowerCase();
    return events.filter(
      (event) =>
        matcher(event) &&
        (needle === "" ||
          [event.tail, event.operatorName, event.operatorCode, event.stationIcao, event.stationCity, event.esn, event.cause]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  }, [events, filter, query]);

  const selected = visible.find((event) => event.id === selectedId) ?? visible[0];

  return (
    <div className="space-y-5">
      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={filter === option.id}
              count={events.filter(option.match).length}
              onClick={() => setFilter(option.id)}
            />
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Tail, operator, station" className="w-64" />
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-3">
        {visible.map((event) => {
          const blocking = event.steps.find((step) => step.blocking)!;
          const active = selected?.id === event.id;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedId(event.id)}
              aria-pressed={active}
              className={cn(
                "rr-panel border-l-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                statusStyles[event.status].border.replace("border-", "border-l-"),
                active ? "ring-1 ring-rr-blue" : "hover:bg-rr-blue-50/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-rr-ink">{event.tail}</p>
                  <p className="text-[11px] text-rr-slate">
                    {event.operatorCode} · {event.aircraftType} · {event.stationIcao}
                  </p>
                </div>
                <StatusPill status={event.status}>{event.escalation.replace("-", " ")}</StatusPill>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <RecoveryClock sinceIso={event.groundedAt} initialHours={event.hoursGrounded} status={event.status} size="md" />
                <TargetCountdown targetIso={event.targetRtsAt} initialHours={event.hoursToTarget} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-rr-slate">
                  Blocking: <span className="font-semibold text-status-red">{blocking.label}</span>
                </span>
                <span className="rr-numeric font-semibold text-rr-ink">{formatUsd(event.exposureUsd)} exposure</span>
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <EventDetail
          event={selected}
          committedOptionId={committed[selected.id]}
          onCommit={(optionId) => setCommitted((prior) => ({ ...prior, [selected.id]: optionId }))}
        />
      ) : (
        <Panel className="py-12 text-center text-sm text-rr-slate">No AOG event matches the current filters.</Panel>
      )}
    </div>
  );
}

function EventDetail({
  event,
  committedOptionId,
  onCommit,
}: {
  event: AogEvent;
  committedOptionId?: string;
  onCommit: (optionId: string) => void;
}) {
  const recommended = event.options[0]!;
  const blocking = event.steps.find((step) => step.blocking)!;
  const nearest = event.facilities.find((facility) => facility.capableTechnicians > 0) ?? event.facilities[0]!;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                {event.tail}
                <Badge variant="brand">{event.id}</Badge>
                <StatusPill status={event.status}>{event.escalation.replace("-", " ")}</StatusPill>
              </span>
            }
            subtitle={`${event.operatorName} · ${event.aircraftType} · ${event.esn} position ${event.enginePosition} · ${event.stationCity} (${event.stationIcao})`}
            actions={
              <Link href={`/engines/${event.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
                Engine record ›
              </Link>
            }
          />

          <div className="grid gap-4 border-y border-rr-ink/8 py-4 sm:grid-cols-4">
            <div>
              <p className="rr-label text-rr-slate">On ground</p>
              <RecoveryClock sinceIso={event.groundedAt} initialHours={event.hoursGrounded} status={event.status} size="lg" />
              <p className="mt-1 text-[11px] text-rr-slate">
                Since {new Date(event.groundedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} UTC
              </p>
            </div>
            <div>
              <p className="rr-label text-rr-slate">Target RTS</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
                {new Date(event.targetRtsAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              <TargetCountdown targetIso={event.targetRtsAt} initialHours={event.hoursToTarget} className="mt-1 block" />
            </div>
            <div>
              <p className="rr-label text-rr-slate">Projected RTS</p>
              <p className={cn("rr-numeric mt-1 text-2xl font-semibold", event.slipHours > 0 ? "text-status-red" : "text-status-green")}>
                {new Date(event.projectedRtsAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="mt-1 text-[11px] text-rr-slate">
                {event.slipHours > 0 ? `${event.slipHours.toFixed(1)}h slip against target` : "Inside the contractual window"}
              </p>
            </div>
            <div>
              <p className="rr-label text-rr-slate">Exposure</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">{formatUsd(event.exposureUsd)}</p>
              <p className="mt-1 text-[11px] text-rr-slate">
                {formatUsd(event.costPerHourUsd)}/h · {formatNumber(event.passengersAffected)} pax · {event.cancelledSectors} sectors
              </p>
            </div>
          </div>

          <div className="grid gap-4 py-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <p className="rr-label text-rr-slate">Cause</p>
              <p className="mt-1 text-sm font-semibold text-rr-ink">{event.cause}</p>
              <p className="mt-1 text-xs leading-relaxed text-rr-slate">{event.causeDetail}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-rr-slate">
                <Badge variant="outline">ATA {event.ataChapter}</Badge>
                <Badge variant="outline">{event.engineFamily}</Badge>
                <Badge variant="outline">{event.moduleCode}</Badge>
                {event.workOrderReference ? <Badge variant="outline">{event.workOrderReference}</Badge> : null}
                {event.alertId ? (
                  <Link href="/alerts" className="font-semibold text-rr-blue hover:underline">
                    Alert {event.alertId} ›
                  </Link>
                ) : null}
              </p>
            </div>
            <div>
              <p className="rr-label text-rr-slate">Accountable owner</p>
              <p className="mt-1 text-sm font-semibold text-rr-ink">{event.owner}</p>
              <p className="text-xs text-rr-slate">{event.ownerRole}</p>
              <p className="mt-2 text-[11px] text-rr-slate">
                Contract {event.contractKind} · escalated to {event.escalation.replace("-", " ")}
              </p>
            </div>
          </div>

          <div className="rounded-sm border border-rr-blue/25 bg-rr-blue-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="rr-label text-rr-blue">Recommended action — fastest path to RTS</p>
                <p className="mt-1 text-sm font-semibold text-rr-ink">
                  {recommended.label} · {recommended.hoursToRts.toFixed(1)}h to service · {formatUsd(recommended.costUsd)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-rr-slate">{recommended.detail}</p>
                <p className="mt-2 text-[11px] text-rr-slate">
                  Clears the blocking step: <span className="font-semibold text-status-red">{blocking.label}</span> ·{" "}
                  {Math.round(recommended.confidence * 100)}% planner confidence
                </p>
              </div>
              <Button
                onClick={() => onCommit(recommended.id)}
                aria-label={`Commit ${recommended.label} for ${event.tail}`}
                disabled={committedOptionId === recommended.id}
              >
                {committedOptionId === recommended.id ? "Plan committed" : "Commit recovery plan"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recovery plan"
            subtitle={`Elapsed against plan for each step — ${blocking.label.toLowerCase()} is holding the aircraft on the ground`}
          />
          <RecoveryTimeline steps={event.steps} />
        </Panel>

        <Panel padded={false}>
          <div className="p-5 pb-0">
            <PanelHeader title="Paths back to service" subtitle="Ranked by hours to return to service, with the cost of each path" />
          </div>
          <DataTable
            columns={[
              {
                key: "option",
                header: "Path",
                render: (option) => (
                  <div>
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-rr-ink">
                      {option.label}
                      {option.recommended ? <Badge variant="brand">Recommended</Badge> : null}
                      {committedOptionId === option.id ? <Badge variant="outline">Committed</Badge> : null}
                    </p>
                    <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-rr-slate">{option.detail}</p>
                  </div>
                ),
                sortValue: (option) => option.label,
              },
              {
                key: "hours",
                header: "Hours to RTS",
                align: "right",
                render: (option) => (
                  <span className={cn("rr-numeric font-semibold", option.recommended ? "text-status-green" : "text-rr-ink")}>
                    {option.hoursToRts.toFixed(1)}
                  </span>
                ),
                sortValue: (option) => option.hoursToRts,
              },
              {
                key: "cost",
                header: "Cost",
                align: "right",
                render: (option) => <span className="rr-numeric text-rr-ink">{formatUsd(option.costUsd)}</span>,
                sortValue: (option) => option.costUsd,
              },
              {
                key: "confidence",
                header: "Confidence",
                align: "right",
                render: (option) => <span className="rr-numeric text-rr-slate">{Math.round(option.confidence * 100)}%</span>,
                sortValue: (option) => option.confidence,
              },
              {
                key: "constraints",
                header: "Constraints",
                render: (option) => (
                  <ul className="space-y-0.5 text-[11px] text-rr-slate">
                    {option.constraints.map((constraint) => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                ),
              },
            ]}
            rows={event.options}
            rowKey={(option) => option.id}
            rowAccent={(option) => (option.recommended ? "border-status-green" : undefined)}
            className="border-0 shadow-none"
            dense
          />
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Parts for the blocking step"
            subtitle={`${blocking.label} kit for ${event.moduleCode} on ${event.esn}`}
          />
          <div className="space-y-4">
            {event.parts.map((part) => (
              <div key={part.partNumber} className={cn("rounded-sm border p-3", part.status === "red" ? "border-status-red/40 bg-status-red-soft" : "border-rr-ink/10")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{part.partNumber}</p>
                    <p className="text-[11px] leading-snug text-rr-slate">{part.description}</p>
                  </div>
                  <StatusPill status={part.status}>
                    {part.status === "green" ? "In stock" : part.status === "amber" ? "Off station" : "No stock"}
                  </StatusPill>
                </div>
                <AogFactRow label="Required" value={`${part.requiredQty} ea`} />
                <AogFactRow
                  label={`At ${event.stationIcao}`}
                  value={part.onHandAtStation}
                  status={part.onHandAtStation >= part.requiredQty ? "green" : "red"}
                />
                <AogFactRow label="Unit cost" value={formatUsd(part.unitCostUsd)} hint={`${part.supplier} · ${part.leadTimeDays}d lead time`} />
                {part.sources.length > 0 ? (
                  <div className="mt-2">
                    <p className="rr-label text-rr-slate">Nearest stock</p>
                    <ul className="mt-1 space-y-1">
                      {part.sources.map((source) => (
                        <li key={source.facilityId} className="flex items-baseline justify-between gap-2 text-[11px]">
                          <span className="text-rr-ink">
                            {source.icao} · {source.available} ea
                          </span>
                          <span className="rr-numeric text-rr-slate">
                            {formatNumber(source.distanceKm)} km · {source.transitHours.toFixed(1)}h
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] font-medium text-status-red">
                    No unreserved stock in the network — supplier expedite is the only parts path.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Nearest capable facility" subtitle="Ranked by distance from the grounded aircraft" />
          <div className="space-y-3">
            {event.facilities.map((facility) => (
              <div key={facility.facilityId} className={cn("rounded-sm border p-3", facility.facilityId === nearest.facilityId ? "border-rr-blue/30 bg-rr-blue-50/50" : "border-rr-ink/10")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-rr-ink">{facility.icao}</p>
                    <p className="text-[11px] leading-snug text-rr-slate">
                      {facility.name} · {facility.kind.replace("-", " ")}
                    </p>
                  </div>
                  <StatusPill status={facility.status}>{facility.slotsFree} slots</StatusPill>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-rr-slate">
                  <span className="rr-numeric">{formatNumber(facility.distanceKm)} km</span>
                  <span className="rr-numeric">{facility.transitHours.toFixed(1)}h transit</span>
                  <span className="rr-numeric">{facility.capableTechnicians} certified</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Technician availability" subtitle={`${event.engineFamily} certified, ${nearest.icao}`} />
          <ul className="space-y-2">
            {event.technicians.map((technician) => (
              <li key={technician.technicianId} className="flex items-center justify-between gap-3 border-b border-rr-ink/5 pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="text-[13px] font-medium text-rr-ink">{technician.name}</p>
                  <p className="text-[11px] text-rr-slate">
                    {technician.shift} shift · {technician.skills.join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("rr-numeric text-sm font-semibold", statusStyles[technician.status].text)}>
                    {technician.availableInHours.toFixed(1)}h
                  </p>
                  <p className="text-[11px] text-rr-slate">{technician.utilisationPct}% utilised</p>
                </div>
              </li>
            ))}
            {event.technicians.length === 0 ? (
              <li className="text-[11px] text-status-red">No certified technicians at the nearest facility — recovery team must be positioned.</li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
