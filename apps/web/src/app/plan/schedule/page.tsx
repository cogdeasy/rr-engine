import { maintenanceSchedule } from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusPill, cn, formatNumber, formatUsd, statusStyles } from "@rr/ui";
import { ScheduleWorkspace } from "@/components/schedule/schedule-workspace";

export const metadata = { title: "Maintenance schedule" };

export default function Page() {
  const schedule = maintenanceSchedule();
  const { kpis, conflicts, months } = schedule;

  const topConflicts = [...conflicts].sort((a, b) => b.exposureUsd - a.exposureUsd).slice(0, 4);
  const utilisationStatus = kpis.slotUtilisationPct > 95 ? "red" : kpis.slotUtilisationPct > 85 ? "amber" : "green";
  const peakMonth = schedule.facilityLoad
    .flatMap((row) => row.months)
    .reduce((worst, month) => (month.utilisationPct > worst.utilisationPct ? month : worst));

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Plan · Maintenance schedule</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {kpis.unscheduledRed > 0
                ? `${kpis.unscheduledRed} engines have no shop slot before they run out of life`
                : "Every engine has a slot before its predicted life expiry"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Rolling {schedule.horizonMonths}-month plan of removals, shop visits and on-wing tasks across the network.
              Does the plan fit within contractual availability commitments? Anything red below breaches either an
              engine&apos;s remaining life or a shop&apos;s capacity, and each one carries a recommended action.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Unscheduled" value={kpis.unscheduledRed} tone="red" caption="no slot before RUL" />
            <HeroStat label="Capacity breaches" value={kpis.capacityConflicts} tone={kpis.capacityConflicts > 0 ? "red" : "green"} caption="shop months over capacity" />
            <HeroStat label="Availability at risk" value={`${kpis.availabilityAtRiskPct}%`} tone="amber" caption="of managed engines" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Unscheduled reds"
          value={kpis.unscheduledRed}
          status={kpis.unscheduledRed > 0 ? "red" : "green"}
          caption="Engines with demand and no slot before predicted life expiry"
        />
        <StatTile
          label="Slot utilisation"
          value={kpis.slotUtilisationPct}
          unit="%"
          status={utilisationStatus}
          caption={`Network shop capacity consumed over ${schedule.horizonMonths} months`}
        />
        <StatTile
          label="Average lead time"
          value={kpis.averageLeadTimeDays}
          unit="days"
          status={kpis.averageLeadTimeDays < 60 ? "amber" : "green"}
          caption="From today to the start of each planned event"
        />
        <StatTile
          label="Events in horizon"
          value={formatNumber(kpis.eventsInHorizon)}
          caption="Shop visits, module changes, on-wing tasks and forecasts"
        />
        <StatTile
          label="Committed shop cost"
          value={formatUsd(kpis.committedCostUsd)}
          caption="Estimated value of shop-slot work in the plan"
        />
      </section>

      {topConflicts.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Act now"
            subtitle={`${conflicts.length} plan conflicts, ranked by availability exposure`}
            actions={
              <span className="rr-numeric text-xs text-rr-slate">
                Peak shop load {peakMonth.utilisationPct}% at {peakMonth.facilityIcao} in {months[peakMonth.monthIndex]?.label}
              </span>
            }
          />
          <ul className="grid gap-3 lg:grid-cols-2">
            {topConflicts.map((conflict) => (
              <li
                key={conflict.id}
                className={cn("border-l-2 bg-rr-mist/60 px-4 py-3", statusStyles[conflict.status].border.replace("border-", "border-l-"))}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-semibold leading-snug text-rr-ink">{conflict.title}</p>
                  <StatusPill status={conflict.status}>{formatUsd(conflict.exposureUsd)}</StatusPill>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{conflict.detail}</p>
                <p className="mt-2 text-[11px] font-medium text-rr-ink">
                  <span className="rr-label mr-1 text-rr-slate">Action</span>
                  {conflict.recommendedAction}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ScheduleWorkspace schedule={schedule} />
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number | string;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
  const dot = tone === "red" ? "bg-status-red" : tone === "amber" ? "bg-status-amber" : "bg-status-green";
  return (
    <div>
      <p className="rr-label inline-flex items-center gap-2 text-rr-cloud">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </p>
      <p className="rr-numeric mt-1 text-4xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-rr-cloud/80">{caption}</p>
    </div>
  );
}
