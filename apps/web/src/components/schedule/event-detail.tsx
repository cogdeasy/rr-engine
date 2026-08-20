"use client";

import Link from "next/link";
import type { ScheduleConflict, ScheduleEvent } from "@rr/types";
import { Badge, Button, StatusPill, cn, formatDate, formatNumber, formatUsd, statusStyles } from "@rr/ui";
import { KIND_LABEL, STATE_LABEL } from "./timeline";

export function EventDetail({
  event,
  conflicts,
}: {
  event: ScheduleEvent | null;
  conflicts: ScheduleConflict[];
}) {
  if (!event) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-2 py-16 text-center">
        <p className="text-sm font-semibold text-rr-ink">Select an event</p>
        <p className="text-xs leading-relaxed text-rr-slate">
          Click any bar on the timeline for its workscope, the condition drivers behind it and the
          dependencies that have to clear before the slot can be held.
        </p>
      </div>
    );
  }

  const linked = conflicts.filter((c) => event.conflictIds.includes(c.id));

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">{KIND_LABEL[event.kind]}</p>
            <h3 className="mt-1 text-lg font-semibold text-rr-ink">{event.esn}</h3>
            <p className="text-xs text-rr-slate">
              {event.operatorName} · {event.family} · {event.aircraftTail ?? "off wing"}
            </p>
          </div>
          <StatusPill status={event.status}>{STATE_LABEL[event.state]}</StatusPill>
        </div>
        <p className={cn("mt-3 border-l-2 pl-3 text-xs leading-relaxed", statusStyles[event.status].border.replace("border-", "border-l-"), statusStyles[event.status].text)}>
          {event.statusReason}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-rr-ink/8 py-4">
        <Field label="Slot" value={`${formatDate(event.start)} → ${formatDate(event.end)}`} />
        <Field label="Turnaround" value={`${formatNumber(event.durationDays)} days`} />
        <Field label="Facility" value={event.facilityIcao ? `${event.facilityIcao} · ${event.facilityName}` : "Unassigned"} />
        <Field label="Lead time" value={`${formatNumber(event.leadTimeDays)} days`} />
        <Field
          label="Life margin at slot"
          value={event.slackDays === null ? "n/a — on-wing" : `${formatNumber(event.slackDays)} days`}
          status={event.slackDays === null ? undefined : event.slackDays < 0 ? "red" : event.slackDays < 90 ? "amber" : "green"}
        />
        <Field label="Estimated cost" value={formatUsd(event.estimatedCostUsd)} />
      </div>

      <Section title="Workscope">
        <p className="text-xs leading-relaxed text-rr-slate">{event.workscope}</p>
        {event.workscopeModules.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {event.workscopeModules.map((module) => (
              <Badge key={module} variant="outline">
                {module}
              </Badge>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Drivers">
        <ul className="space-y-2">
          {event.drivers.map((driver) => (
            <li key={driver.label} className="text-xs">
              <span className="font-semibold text-rr-ink">{driver.label}</span>
              <span className="text-rr-slate"> — {driver.detail}</span>
            </li>
          ))}
          {event.drivers.length === 0 ? <li className="text-xs text-rr-slate">Routine interval task, no condition driver.</li> : null}
        </ul>
      </Section>

      <Section title="Dependencies">
        <ul className="space-y-2">
          {event.dependencies.map((dependency) => (
            <li key={dependency.label} className="flex items-start gap-2 text-xs">
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", statusStyles[dependency.status].dot)} aria-label={dependency.status} />
              <span>
                <span className="font-semibold text-rr-ink">{dependency.label}</span>
                <span className="text-rr-slate"> — {dependency.detail}</span>
              </span>
            </li>
          ))}
          {event.dependencies.length === 0 ? <li className="text-xs text-rr-slate">No open dependencies.</li> : null}
        </ul>
      </Section>

      {linked.length > 0 ? (
        <Section title="Conflicts">
          <ul className="space-y-2">
            {linked.map((conflict) => (
              <li key={conflict.id} className="rounded-sm bg-status-red-soft px-3 py-2 text-xs text-rr-ink">
                <p className="font-semibold">{conflict.title}</p>
                <p className="mt-0.5 text-rr-slate">{conflict.detail}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="rounded-sm bg-rr-mist px-4 py-3">
        <p className="rr-label text-rr-slate">Recommended action</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-rr-ink">{event.recommendedAction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm">{event.state === "unscheduled" ? "Escalate to network planning" : "Confirm slot"}</Button>
          <Link href={`/engines/${event.engineId}`}>
            <Button size="sm" variant="secondary">
              Engine record
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, status }: { label: string; value: string; status?: ScheduleEvent["status"] }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("mt-1 text-[13px] font-medium", status ? statusStyles[status].text : "text-rr-ink")}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="rr-label mb-2 text-rr-slate">{title}</p>
      {children}
    </div>
  );
}
