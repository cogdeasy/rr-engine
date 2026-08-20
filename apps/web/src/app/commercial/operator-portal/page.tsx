import Link from "next/link";
import type { KpiSnapshot, Series } from "@rr/types";
import { buildOperatorPortalView, getDefaultOperatorId, listOperatorPortalOptions } from "@rr/data";
import {
  Badge,
  Gauge,
  KpiTile,
  Panel,
  PanelHeader,
  SectionHeading,
  StatTile,
  StatusPill,
  ThresholdBar,
  TrendChart,
  cn,
  formatDate,
  formatNumber,
  relativeTime,
} from "@rr/ui";
import { ActionList } from "@/components/operator-portal/action-list";
import { FleetTabs } from "@/components/operator-portal/fleet-tabs";
import { MonthlySummary } from "@/components/operator-portal/monthly-summary";
import { OperatorSwitcher } from "@/components/operator-portal/operator-switcher";

export const metadata = { title: "Operator portal" };

export default async function OperatorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ operator?: string }>;
}) {
  const { operator: requested } = await searchParams;
  const options = listOperatorPortalOptions();
  const activeId = options.find((o) => o.id === requested)?.id ?? getDefaultOperatorId();
  const view = buildOperatorPortalView(activeId)!;
  const { availability, contract, fleet, monthly } = view;

  const redActions = view.actions.filter((a) => a.status === "red");
  const dueThisWeek = view.actions.filter((a) => a.dueInDays <= 7);

  const availabilityKpi: KpiSnapshot = {
    id: "op-availability",
    label: "Contract availability",
    value: availability.actual,
    unit: "%",
    target: availability.target,
    trend: availability.trend,
    deltaPct: availability.deltaPct,
    status: availability.status,
    history: availability.history,
  };

  const dispatchKpi: KpiSnapshot = {
    id: "op-dispatch",
    label: "Dispatch reliability",
    value: availability.dispatchReliability,
    unit: "%",
    target: availability.dispatchTarget,
    trend: availability.dispatchTrend,
    deltaPct: 0,
    status: availability.dispatchReliability >= availability.dispatchTarget ? "green" : "amber",
    history: availability.dispatchHistory,
  };

  const availabilitySeries: Series = {
    id: `availability-${activeId}`,
    label: "Contract availability",
    unit: "%",
    points: availability.history,
    amberThreshold: availability.target,
    redThreshold: availability.target - 0.8,
  };

  return (
    <div className="space-y-7">
      <OperatorSwitcher options={options} activeId={activeId} />

      {/* Hero — leads with the decisions the airline owes us this week */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">
              {view.operator.name} · {view.operator.code} · {view.operator.region}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {view.actions.length} decision{view.actions.length === 1 ? "" : "s"} need your response
              {redActions.length > 0 ? `, ${redActions.length} flagged act now` : ""}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Your {fleet.engines} covered engines on {fleet.aircraft} aircraft under {contract.kind}. Everything below is your
              own fleet data: what is flying, what is planned, and what Rolls-Royce needs you to agree to this week.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#actions"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {dueThisWeek.length} item{dueThisWeek.length === 1 ? "" : "s"} due this week
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#summary"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Monthly service summary
              </Link>
            </div>
          </div>

          <dl className="flex flex-wrap gap-8">
            <HeroStat label="Availability" value={`${availability.actual}%`} caption={`Target ${availability.target}%`} tone={availability.status} />
            <HeroStat label="Dispatch" value={`${availability.dispatchReliability}%`} caption="Last 30 days" tone={dispatchKpi.status} />
            <HeroStat label="AOG" value={fleet.aog} caption="aircraft grounded" tone={fleet.aog > 0 ? "red" : "green"} />
            <HeroStat
              label="Engines to watch"
              value={fleet.byStatus.red + fleet.byStatus.amber}
              caption={`${fleet.byStatus.red} red · ${fleet.byStatus.amber} amber`}
              tone={fleet.byStatus.red > 0 ? "red" : fleet.byStatus.amber > 0 ? "amber" : "green"}
            />
          </dl>
        </div>
      </section>

      {/* AOG — the only thing that outranks the action list */}
      {view.aogEvents.length > 0 ? (
        <section aria-label="Aircraft on ground" className="space-y-3">
          {view.aogEvents.map((event) => (
            <div key={event.id} className="rr-panel border-l-2 border-l-status-red bg-status-red-soft/30 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status="red">AOG</StatusPill>
                    <span className="rr-numeric text-sm font-semibold text-rr-ink">{event.tail}</span>
                    <Badge variant="outline">{event.aircraftType}</Badge>
                    <span className="rr-numeric text-[11px] text-rr-slate">
                      {event.esn} · {event.location}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-rr-ink">{event.cause}</p>
                  <p className="mt-1 text-xs leading-relaxed text-rr-slate">
                    Recovery plan: {event.recoveryPlan}
                    {event.expectedReturnAt ? ` · expected back in service ${formatDate(event.expectedReturnAt)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="rr-label text-rr-slate">Grounded</p>
                  <p className="rr-numeric text-3xl font-semibold text-status-red">{formatNumber(event.hoursGrounded)}h</p>
                  <p className="text-[11px] text-rr-slate">since {relativeTime(event.raisedAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Performance strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile kpi={availabilityKpi} />
        <KpiTile kpi={dispatchKpi} />
        <StatTile
          label="Aircraft in service"
          value={fleet.inService}
          caption={`${fleet.inMaintenance} in maintenance · ${fleet.aog} AOG`}
          status={fleet.aog > 0 ? "red" : "green"}
        />
        <StatTile
          label="Aircraft-days in work"
          value={availability.aircraftDaysLost}
          caption="Committed downtime across open events"
          status={availability.aircraftDaysLost > 90 ? "amber" : "green"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <section id="actions" className="space-y-4 xl:col-span-2">
          <SectionHeading
            eyebrow="What we need from you"
            title="Open decisions"
            description="Ranked by operational urgency. Each item states why it is flagged and what Rolls-Royce recommends, so it can be cleared in one pass."
          />
          <ActionList actions={view.actions} />
        </section>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Contract performance" subtitle={`${contract.kind} · ${contract.monthsRemaining} months remaining`} />
            <div className="flex items-center gap-5">
              <Gauge value={availability.actual} max={100} status={availability.status} label="Availability" size={128} />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="rr-label text-rr-slate">Against target</p>
                  <p className={cn("rr-numeric mt-1 text-2xl font-semibold", availability.actual >= availability.target ? "text-status-green" : "text-status-amber")}>
                    {availability.actual >= availability.target ? "+" : ""}
                    {(availability.actual - availability.target).toFixed(2)} pts
                  </p>
                </div>
                <ThresholdBar
                  value={availability.actual}
                  min={95}
                  max={100}
                  amber={availability.target}
                  red={Number((availability.target - 0.8).toFixed(2))}
                  unit="%"
                  direction="lower-is-worse"
                />
              </div>
            </div>
            <div className="mt-5 border-t border-rr-ink/8 pt-4">
              <p className="rr-label text-rr-slate">12-month availability trend</p>
              <TrendChart series={availabilitySeries} height={140} className="mt-2" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-rr-slate">
              Contract runs to {formatDate(contract.endsAt)} covering {contract.coveredEngines} engines.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Fleet health" subtitle="Engine condition across your covered fleet" />
            <div className="space-y-3">
              {(
                [
                  { key: "red", label: "Act now", caption: "Removal or inspection required" },
                  { key: "amber", label: "Watchlist", caption: "Trending toward a limit" },
                  { key: "green", label: "Nominal", caption: "Within all limits" },
                  { key: "grey", label: "No data", caption: "Awaiting health downloads" },
                ] as const
              ).map((row) => {
                const count = fleet.byStatus[row.key];
                const pct = Math.round((count / Math.max(1, fleet.engines)) * 100);
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <StatusPill status={row.key}>{row.label}</StatusPill>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          row.key === "red" && "bg-status-red",
                          row.key === "amber" && "bg-status-amber",
                          row.key === "green" && "bg-status-green",
                          row.key === "grey" && "bg-status-grey",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="rr-numeric w-8 text-right text-sm font-semibold text-rr-ink">{count}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
              Average health score {fleet.averageHealthScore}/100. Red engines are listed with their reason in the engine status
              table below.
            </p>
          </Panel>
        </div>
      </div>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="Your fleet"
          title="Engine status, planned events and advisories"
          description="The detail behind the decisions above. Every colour is explained in the row it appears on."
        />
        <FleetTabs engines={view.engines} events={view.plannedEvents} advisories={view.advisories} />
      </section>

      <section id="summary">
        <MonthlySummary summary={monthly} operator={view.operator} />
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  tone: "red" | "amber" | "green" | "grey";
}) {
  const toneClass = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-white",
    grey: "text-rr-cloud",
  }[tone];
  return (
    <div>
      <dt className="rr-label text-rr-blue-200">{label}</dt>
      <dd className={cn("rr-numeric mt-1 text-4xl font-semibold leading-none", toneClass)}>{value}</dd>
      <p className="mt-1 text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
