import Link from "next/link";
import { getDataset, getTriageEvidence, getTriageQueue, getTriageSummary } from "@rr/data";
import { Panel, PanelHeader, StatTile, cn, formatNumber } from "@rr/ui";
import { TriageConsole } from "@/components/alerts/triage-console";
import { formatHours } from "@/components/alerts/triage-shared";

export const metadata = { title: "Alert triage" };

export default function AlertTriagePage() {
  const queue = getTriageQueue();
  const summary = getTriageSummary(queue);
  const evidence = getTriageEvidence(queue);
  const now = getDataset().generatedAt;

  const actionNow = queue.filter(
    (item) => item.needsActionBeforeNextSector || (item.alert.timeToActionHours !== null && item.ageHours > item.alert.timeToActionHours),
  );
  const nextDeparture = actionNow
    .filter((item) => item.hoursToNextSector !== null)
    .sort((a, b) => (a.hoursToNextSector ?? 0) - (b.hoursToNextSector ?? 0))[0];

  const sources = Object.entries(summary.bySource).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sources.map(([, count]) => count));

  return (
    <div className="space-y-6">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-8 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Operate · Alert triage</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {actionNow.length} of {summary.total} open alerts need a decision before the next sector
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              EHM, ACARS and prognostic alerts queued for disposition across {summary.enginesAffected} engines. Work top-down:
              the queue is ranked by severity, then by how little time is left before the recommended action becomes late.
              {nextDeparture
                ? ` Earliest departure at risk: ${nextDeparture.aircraftTail} in ${formatHours(nextDeparture.hoursToNextSector)}.`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Critical" value={summary.bySeverity.critical} tone="red" caption="act now" />
            <HeroStat label="Overdue" value={summary.overdue} tone="red" caption="past action deadline" />
            <HeroStat label="Before sector" value={summary.beforeNextSector} tone="amber" caption="due before departure" />
            <HeroStat label="New" value={summary.byState.new} tone="green" caption="untouched in queue" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Awaiting disposition"
          value={formatNumber(summary.total)}
          status={summary.total > 0 ? "amber" : "green"}
          caption={`${summary.byState.new} new · ${summary.byState.investigating} investigating`}
        />
        <StatTile
          label="Critical unactioned"
          value={summary.criticalUnactioned}
          status={summary.criticalUnactioned > 0 ? "red" : "green"}
          caption="Critical severity without a committed action"
        />
        <StatTile
          label="Median queue age"
          value={formatHours(summary.medianAgeHours)}
          status={summary.medianAgeHours > 168 ? "amber" : "green"}
          caption="Time since the alert was raised"
        />
        <StatTile
          label="Engines affected"
          value={summary.enginesAffected}
          caption={`${summary.bySeverity.high} high-severity alerts across the fleet`}
        />
      </section>

      <Panel>
        <PanelHeader
          title="Where the queue comes from"
          subtitle="Open alerts by detection source — the mix tells you which surveillance channel is driving workload"
          actions={
            <Link href="/health/ehm" className="text-xs font-semibold text-rr-blue hover:underline">
              EHM monitoring ›
            </Link>
          }
        />
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sources.map(([source, count]) => (
            <li key={source} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-[13px] text-rr-ink">{source}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-rr-mist">
                <span className="block h-full rounded-full bg-rr-blue" style={{ width: `${(count / maxSource) * 100}%` }} />
              </span>
              <span className="rr-numeric w-8 shrink-0 text-right text-[11px] font-semibold text-rr-slate">{count}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <TriageConsole queue={queue} evidence={evidence} now={now} />
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
