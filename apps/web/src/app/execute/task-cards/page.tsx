import Link from "next/link";
import {
  activeTaskCardExecutions,
  getDataset,
  NOW,
  taskCardSummary,
  taskCardVarianceDrivers,
  workOrderCardProgress,
} from "@rr/data";
import {
  Badge,
  Panel,
  PanelHeader,
  ProgressBar,
  StatusPill,
  StatTile,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { TaskCardConsole } from "@/components/task-cards/task-card-console";

export const metadata = { title: "Task cards" };

export default function TaskCardsPage() {
  const dataset = getDataset();
  const cards = activeTaskCardExecutions();
  const summary = taskCardSummary(cards);
  const progress = workOrderCardProgress(cards);
  const drivers = taskCardVarianceDrivers(cards).slice(0, 6);

  const facilities = dataset.facilities
    .filter((facility) => cards.some((card) => card.facilityId === facility.id))
    .map((facility) => ({ id: facility.id, name: facility.name, icao: facility.icao }))
    .sort((a, b) => a.icao.localeCompare(b.icao));

  const skills = [...new Set(cards.map((card) => card.skillRequired))].sort();

  const actNow = [...cards]
    .filter((card) => card.status === "red")
    .sort((a, b) => b.varianceHours - a.varianceHours)
    .slice(0, 3);

  const maxDriver = Math.max(1, ...drivers.map((driver) => driver.varianceHours));

  return (
    <div className="space-y-7">
      <section
        className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-8 text-white"
        style={{ backgroundColor: "#05061f" }}
      >
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Execute · Task cards</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.behindEstimate + summary.blocked} of {summary.totalCards} live cards need a decision this shift
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {summary.blocked} card{summary.blocked === 1 ? " is" : "s are"} blocked and {summary.awaitingInspection} sit
              idle awaiting an inspector stamp. Together the open cards are forecast to burn{" "}
              <span className="rr-numeric font-semibold text-white">{formatNumber(summary.manHoursAtRisk)}</span> man-hours
              beyond estimate — every card below carries the reason and the recommended action.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Blocked" value={summary.blocked} tone="red" caption="no hours bookable" />
            <HeroStat label="Behind estimate" value={summary.behindEstimate} tone="amber" caption="10%+ over plan" />
            <HeroStat label="Awaiting inspection" value={summary.awaitingInspection} tone="amber" caption="mechanic complete" />
            <HeroStat label="Signed off" value={summary.signedOff} tone="green" caption="closed on live orders" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Man-hours at risk"
          value={formatNumber(summary.manHoursAtRisk)}
          unit="h"
          status={summary.manHoursAtRisk > 0 ? "red" : "green"}
          caption="Forecast overrun on cards still open"
        />
        <StatTile
          label="Estimated vs projected"
          value={`${formatNumber(summary.estimatedHours)} / ${formatNumber(summary.projectedHours)}`}
          unit="h"
          status={summary.variancePct >= 10 ? "amber" : "green"}
          caption={`${summary.variancePct > 0 ? "+" : ""}${summary.variancePct}% against the planned estimate`}
        />
        <StatTile
          label="Booked to date"
          value={formatNumber(summary.hoursToDate)}
          unit="h"
          caption={`${summary.activeCards} cards in work right now`}
        />
        <StatTile
          label="First-time quality"
          value={summary.firstTimeQualityPct}
          unit="%"
          status={summary.firstTimeQualityPct >= 60 ? "green" : summary.firstTimeQualityPct >= 40 ? "amber" : "red"}
          caption="Signed-off cards closed at or under estimate"
        />
        <StatTile
          label="Work orders touched"
          value={progress.length}
          caption={`${progress.filter((row) => row.status === "red").length} carrying a red card`}
        />
      </section>

      {actNow.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Act now"
            subtitle="The three cards costing the most man-hours today, with the intervention that recovers them"
            actions={<Badge variant="brand">Recommended actions</Badge>}
          />
          <div className="grid gap-3 lg:grid-cols-3">
            {actNow.map((card) => (
              <article key={card.card.id} className="rounded-sm border border-status-red/30 bg-status-red-soft/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{card.reference}</p>
                    <p className="text-[11px] text-rr-slate">
                      {card.engineEsn} · {card.workOrderReference} · {card.facilityIcao}
                    </p>
                  </div>
                  <StatusPill status="red">
                    {card.varianceHours > 0 ? "+" : ""}
                    {formatNumber(card.varianceHours, 1)}h
                  </StatusPill>
                </div>
                <p className="mt-3 text-[13px] font-medium leading-snug text-rr-ink">{card.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{card.reason}</p>
                <p className="mt-3 border-t border-status-red/20 pt-2 text-[11px] leading-relaxed text-rr-ink">
                  <span className="rr-label text-status-red">Do this</span> {card.recommendedAction}
                </p>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Work order roll-up"
            subtitle="Completion against booked man-hours, worst-affected orders first"
            actions={
              <Link href="/execute/work-orders" className="text-xs font-semibold text-rr-blue hover:underline">
                Work orders ›
              </Link>
            }
          />
          <ul className="space-y-3">
            {progress.slice(0, 7).map((row) => (
              <li key={row.workOrderId} className="flex items-center gap-4">
                <div className="w-48 shrink-0">
                  <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.reference}</p>
                  <p className="text-[11px] text-rr-slate">
                    {row.engineEsn} · {row.facilityIcao} · due {formatDate(row.dueAt)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <ProgressBar value={row.completionPct} status={row.status} />
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-rr-slate">
                    <span className="rr-numeric">{row.completionPct}% complete</span>
                    <span className="rr-numeric">
                      {formatNumber(row.hoursToDate, 0)}h booked of {formatNumber(row.estimatedHours, 0)}h estimate
                    </span>
                    {row.blocked > 0 ? <span className="font-semibold text-status-red">{row.blocked} blocked</span> : null}
                    {row.awaitingInspection > 0 ? (
                      <span className="font-semibold text-status-amber">{row.awaitingInspection} awaiting inspection</span>
                    ) : null}
                    {row.worstCardReason ? <span className="truncate">· {row.worstCardReason}</span> : null}
                  </p>
                </div>
                <div className="w-28 shrink-0 text-right">
                  <p className={cn("rr-numeric text-sm font-semibold", statusStyles[row.status].text)}>
                    {row.varianceHours > 0 ? "+" : ""}
                    {formatNumber(row.varianceHours, 0)}h
                  </p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {row.signedOff}/{row.totalCards} signed
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Where the overrun sits" subtitle="Forecast man-hour overrun by skill discipline" />
          <ul className="space-y-3">
            {drivers.map((driver) => (
              <li key={driver.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[12px] text-rr-ink">{driver.label}</p>
                  <p className="rr-numeric text-[12px] font-semibold text-status-amber">+{formatNumber(driver.varianceHours)}h</p>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                  <div className="h-full rounded-full bg-status-amber" style={{ width: `${(driver.varianceHours / maxDriver) * 100}%` }} />
                </div>
                <p className="rr-numeric mt-1 text-[11px] text-rr-slate">{driver.cards} cards over estimate</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <TaskCardConsole cards={cards} facilities={facilities} skills={skills} initialCardId={actNow[0]?.card.id} datasetNow={NOW.toISOString()} />
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
