import Link from "next/link";
import {
  ESCALATION_TIERS,
  getAckTimeTrend,
  getChannelBreakdown,
  getEscalationOwnerLoad,
  getEscalationSummary,
  getEscalations,
  getStandbyOwners,
} from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusPill, TrendChart, cn, formatNumber } from "@rr/ui";
import { EscalationInbox } from "@/components/notifications/escalation-inbox";
import { CHANNEL_LABEL, formatDuration } from "@/components/notifications/utils";

export const metadata = { title: "Escalations" };

/** Fixed operational "now" — the dataset is generated against this instant. */
const NOW_ISO = "2026-08-20T06:00:00.000Z";

export default function EscalationsPage() {
  const escalations = getEscalations();
  const summary = getEscalationSummary();
  const ackTrend = getAckTimeTrend();
  const channels = getChannelBreakdown();
  const ownerLoad = getEscalationOwnerLoad();
  const standbyOwners = getStandbyOwners();

  const tiers = [...ESCALATION_TIERS]
    .reverse()
    .map(({ tier, label, description, slaMinutes }) => ({ tier, label, description, slaMinutes }));

  const channelTotal = channels.reduce((sum, c) => sum + c.count, 0);
  const ackDelta = summary.meanAckMinutes - summary.priorMeanAckMinutes;

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Operate · Escalations</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.unacknowledged === 0
                ? `All ${summary.total} red conditions are acknowledged`
                : `${summary.unacknowledged} of ${summary.total} red conditions have no acknowledgement`}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every critical and high severity open condition, the accountable owner it sits with, the tier it has
              escalated to and the time remaining before the acknowledgement commitment is breached.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-rr-cloud/70">
              <span className="rounded-full border border-white/25 px-3 py-1">
                Oldest unacknowledged {formatDuration(summary.oldestUnacknowledgedMinutes)}
              </span>
              <span className="rounded-full border border-white/25 px-3 py-1">
                {formatNumber(summary.ackCoveragePct, 1)}% ownership coverage
              </span>
              <Link href="/alerts" className="rounded-full bg-white px-4 py-1.5 font-semibold text-rr-blue hover:bg-rr-blue-50">
                Alert triage ›
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Unacknowledged" value={summary.unacknowledged} tone="red" caption="no accountable owner yet" />
            <HeroStat label="SLA breached" value={summary.breached} tone="amber" caption="past acknowledgement window" />
            <HeroStat label="Acknowledged" value={summary.total - summary.unacknowledged} tone="green" caption="owner accepted" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Unacknowledged reds"
          value={summary.unacknowledged}
          status={summary.unacknowledged > 0 ? "red" : "green"}
          caption={`Across ${summary.total} open red conditions`}
        />
        <StatTile
          label="SLA breaches"
          value={summary.breached}
          status={summary.breached > 0 ? "red" : "green"}
          caption={`${summary.acknowledgedWithinSla} acknowledged inside the window`}
        />
        <StatTile
          label="Mean acknowledgement"
          value={formatDuration(summary.meanAckMinutes)}
          status={summary.meanAckMinutes > 90 ? "amber" : "green"}
          caption={`${ackDelta >= 0 ? "+" : ""}${Math.round(ackDelta)}m vs conditions older than 24h`}
        />
        <StatTile
          label="Tier 3 / 4 exposure"
          value={summary.byTier.T3.total + summary.byTier.T4.total}
          status={summary.byTier.T4.total > 0 ? "amber" : "green"}
          caption="Conditions now owned above the duty desk"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Acknowledgement time"
            subtitle="Daily mean minutes from red condition raised to owner acknowledgement"
          />
          <TrendChart
            series={{
              id: "ack-time",
              label: "Mean acknowledgement",
              unit: "min",
              points: ackTrend,
              amberThreshold: 60,
              redThreshold: 120,
            }}
            height={160}
          />
        </Panel>

        <Panel>
          <PanelHeader title="Escalation load by tier" subtitle="Where accountability currently sits" />
          <ul className="space-y-3">
            {tiers.map((meta) => {
              const stats = summary.byTier[meta.tier];
              const width = summary.total > 0 ? (stats.total / summary.total) * 100 : 0;
              return (
                <li key={meta.tier} className="flex items-center gap-3">
                  <span className="rr-numeric w-8 shrink-0 text-[12px] font-semibold text-rr-ink">{meta.tier}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                    <div
                      className={cn("h-full rounded-full", stats.unacknowledged > 0 ? "bg-status-red" : "bg-rr-blue")}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="rr-numeric w-20 shrink-0 text-right text-[11px] text-rr-slate">
                    <span className={cn("font-semibold", stats.unacknowledged > 0 ? "text-status-red" : "text-rr-ink")}>
                      {stats.unacknowledged}
                    </span>
                    {" / "}
                    {stats.total}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-rr-slate">
            Red bars mean at least one condition at that tier is still waiting on an accountable owner.
          </p>
        </Panel>
      </div>

      <EscalationInbox escalations={escalations} tiers={tiers} standbyOwners={standbyOwners} nowIso={NOW_ISO} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Owner exposure" subtitle="People currently carrying open red conditions" />
          <ul className="divide-y divide-rr-ink/6">
            {ownerLoad.map((entry) => (
              <li key={entry.owner.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-rr-ink">{entry.owner.name}</p>
                  <p className="text-[11px] text-rr-slate">
                    {entry.owner.role} · {entry.owner.base}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.unacknowledged > 0 ? (
                    <StatusPill status="red">{entry.unacknowledged} unacknowledged</StatusPill>
                  ) : (
                    <StatusPill status="green">Up to date</StatusPill>
                  )}
                  <span className="rr-numeric w-16 text-right text-[12px] text-rr-slate">{entry.open} open</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Notification channels" subtitle="How owners were reached across the trail" />
          <ul className="space-y-3">
            {channels.map((channel) => (
              <li key={channel.channel}>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="text-rr-ink">{CHANNEL_LABEL[channel.channel]}</span>
                  <span className="rr-numeric text-rr-slate">{formatNumber(channel.count)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                  <div
                    className="h-full rounded-full bg-rr-blue"
                    style={{ width: `${channelTotal > 0 ? (channel.count / channelTotal) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
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
