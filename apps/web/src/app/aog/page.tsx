import Link from "next/link";
import { aogFleetExposure, getAogEvents } from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusPill, cn, formatNumber, formatUsd, statusStyles } from "@rr/ui";
import { AogCommandCentre } from "@/components/aog/aog-command-centre";

export const metadata = { title: "AOG command centre" };

export default function AogPage() {
  const events = getAogEvents();
  const exposure = aogFleetExposure();
  const worst = events[0];

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">AOG command centre</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {exposure.aircraftGrounded} aircraft on ground, {exposure.targetsBreached} outside the recovery target
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every grounded aircraft carries a live recovery clock, one blocking step and a ranked path back to service.
              Work the list top down: the events are ordered by escalation state and cost exposure.
            </p>
            {worst ? (
              <p className="mt-5 text-sm text-rr-cloud">
                Longest running:{" "}
                <span className="font-semibold text-white">
                  {worst.tail} at {worst.stationIcao}
                </span>{" "}
                — {worst.hoursGrounded.toFixed(1)}h on ground, blocked on {worst.blockingStepId}, recommended path{" "}
                <span className="font-semibold text-white">{worst.options[0]!.label}</span>.
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#events"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the {exposure.events} open events
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/supply/inventory"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Parts position
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Burn rate" value={`${formatUsd(exposure.exposurePerHourUsd)}/h`} tone="red" caption="while the fleet is grounded" />
            <HeroStat label="Exposure" value={formatUsd(exposure.exposureUsd)} tone="red" caption="incurred plus projected" />
            <HeroStat label="Recoverable" value={`${exposure.recoverableHours.toFixed(0)}h`} tone="green" caption="by taking every recommendation" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <StatTile
          label="Aircraft on ground"
          value={exposure.aircraftGrounded}
          status={exposure.aircraftGrounded > 0 ? "red" : "green"}
          caption={`${formatNumber(exposure.passengersAffected)} passengers affected`}
        />
        <StatTile
          label="Targets breached"
          value={exposure.targetsBreached}
          status={exposure.targetsBreached > 0 ? "red" : "green"}
          caption="Projected RTS beyond the contractual window"
        />
        <StatTile
          label="Blocked on parts"
          value={exposure.partsBlocked}
          status={exposure.partsBlocked > 0 ? "amber" : "green"}
          caption="Recovery held by the supply chain"
        />
        <StatTile
          label="Average time on ground"
          value={exposure.averageHoursGrounded}
          unit="h"
          status={exposure.averageHoursGrounded > 24 ? "amber" : "green"}
          caption={`Longest ${exposure.longestHoursGrounded.toFixed(1)}h`}
        />
        <StatTile
          label="Cost exposure"
          value={formatUsd(exposure.exposureUsd)}
          status="red"
          caption={`${formatUsd(exposure.exposurePerHourUsd)} per hour across the fleet`}
        />
      </section>

      <section id="events" className="scroll-mt-6">
        <AogCommandCentre events={events} />
      </section>

      <Panel>
        <PanelHeader
          title="Operator exposure"
          subtitle="Where the grounded fleet is concentrated and what it is costing each customer"
          actions={
            <Link href="/commercial/costs" className="text-xs font-semibold text-rr-blue hover:underline">
              Cost analysis ›
            </Link>
          }
        />
        <ul className="space-y-3">
          {exposure.byOperator.map((operator) => {
            const share = (operator.exposureUsd / Math.max(1, exposure.exposureUsd)) * 100;
            return (
              <li key={operator.operatorId} className="flex items-center gap-4">
                <div className="w-52 shrink-0">
                  <p className="text-[13px] font-medium text-rr-ink">{operator.operatorName}</p>
                  <p className="text-[11px] text-rr-slate">
                    {operator.operatorCode} · {operator.events} event{operator.events === 1 ? "" : "s"} · worst{" "}
                    {operator.worstHoursGrounded.toFixed(1)}h
                  </p>
                </div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-rr-mist">
                  <div className={cn("h-full rounded-full", statusStyles[operator.status].dot)} style={{ width: `${share}%` }} />
                </div>
                <div className="w-32 shrink-0 text-right">
                  <span className="rr-numeric text-sm font-semibold text-rr-ink">{formatUsd(operator.exposureUsd)}</span>
                </div>
                <StatusPill status={operator.status} className="w-24 justify-center" />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: string; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-3xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
