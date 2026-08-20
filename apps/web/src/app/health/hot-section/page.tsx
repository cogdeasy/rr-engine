import Link from "next/link";
import type { HotSectionAssessment, HotSectionMarginCurve } from "@rr/types";
import { hotSectionAssessments, hotSectionFleetSummary, hotSectionMarginCurve, hotSectionWashEffectiveness } from "@rr/data";
import { Panel, PanelHeader, SectionHeading, StatTile, StatusPill, cn, formatDate, formatNumber, statusStyles } from "@rr/ui";
import { ConditionMatrix } from "@/components/hot-section/condition-matrix";
import { MarginExplorer } from "@/components/hot-section/margin-explorer";
import { UrgencyTable } from "@/components/hot-section/urgency-table";
import { WashEffectiveness } from "@/components/hot-section/wash-effectiveness";
import { formatHorizon } from "@/components/hot-section/format";

/** Engines carried into the interactive explorer and the condition matrix. */
const WATCHLIST_SIZE = 14;

export default function HotSectionPage() {
  const assessments = hotSectionAssessments();
  const summary = hotSectionFleetSummary();
  const effectiveness = hotSectionWashEffectiveness();

  const watchlist = assessments.slice(0, WATCHLIST_SIZE);
  const curves: Record<string, HotSectionMarginCurve> = {};
  for (const assessment of watchlist) {
    const curve = hotSectionMarginCurve(assessment.engineId);
    if (curve) curves[assessment.engineId] = curve;
  }

  const queue = {
    workscope: assessments.filter((a) => a.action.kind === "workscope"),
    borescope: assessments.filter((a) => a.action.kind === "borescope"),
    wash: assessments.filter((a) => a.action.kind === "wash"),
  };
  const earliest = summary.earliestExhaustion;

  return (
    <div className="space-y-7">
      {/* Decision first: how much hot section life is left, and what to do about it. */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Hot section condition</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.red} engines need a hot section decision now
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Hot section life is spent as EGT margin. These engines sit inside the red margin band or run out of margin
              before a shop slot can realistically be found — {summary.exhaustingWithin180Days} of them within 180 days.
              A further {summary.washesOverdue} engines can buy time on wing with a water wash today, worth{" "}
              {summary.recoverableMarginC} °C of recoverable margin across the fleet.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/plan/workscope"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Workscope {queue.workscope.length} restorations
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/plan/schedule"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Schedule {summary.washesOverdue} overdue washes
              </Link>
            </div>
          </div>

          <dl className="flex flex-wrap gap-8">
            <HeroStat label="Act now" value={String(summary.red)} tone="red" caption="margin gone inside 90 days" />
            <HeroStat label="Watchlist" value={String(summary.amber)} tone="amber" caption="inside 270 days" />
            <HeroStat label="Nominal" value={String(summary.green)} tone="green" caption="within the family band" />
            <HeroStat
              label="Earliest exhaustion"
              value={earliest ? formatHorizon(earliest.days) : "—"}
              tone="red"
              caption={earliest ? `${earliest.esn} · ${formatDate(earliest.at)}` : "no engines assessed"}
              compact
            />
          </dl>
        </div>
      </section>

      {/* The action queue: every red thing below resolves to one of these three. */}
      <section className="grid gap-4 lg:grid-cols-3">
        <ActionCard
          status="red"
          title="Hot section restoration"
          count={queue.workscope.length}
          lead={queue.workscope[0]}
          description="Margin exhausts before the next planning window — book a shop slot and open HPT and combustor together."
          href="/plan/workscope"
          cta="Build workscope"
        />
        <ActionCard
          status="amber"
          title="Borescope confirmation"
          count={queue.borescope.length}
          lead={queue.borescope[0]}
          description="Hardware distress index is at the serviceable limit but the evidence is modelled — confirm before spending margin."
          href="/execute/borescope"
          cta="Raise inspection"
        />
        <ActionCard
          status="amber"
          title="Water wash"
          count={queue.wash.length}
          lead={queue.wash[0]}
          description={`Recovers ${effectiveness.meanRecoveredC.toFixed(1)} °C on average for ${effectiveness.meanDowntimeHours.toFixed(1)} hours of downtime.`}
          href="/plan/schedule"
          cta="Schedule wash"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Median deterioration rate"
          value={summary.medianRatePer100Cycles.toFixed(2)}
          unit="°C/100 cyc"
          caption={`Across ${formatNumber(summary.enginesAssessed)} assessed engines`}
        />
        <StatTile
          label="Recoverable by wash now"
          value={summary.recoverableMarginC}
          unit="°C"
          status="green"
          caption={`${summary.washesOverdue} engines past their wash interval`}
        />
        <StatTile
          label="Engines exhausting ≤ 180 d"
          value={summary.exhaustingWithin180Days}
          status={summary.exhaustingWithin180Days > 0 ? "red" : "green"}
          caption="At the current rate, no wash credit"
        />
        <StatTile
          label="Awaiting hardware evidence"
          value={summary.awaitingEvidence}
          status="grey"
          caption="No borescope inside 300 days and no prognostic"
        />
      </section>

      <MarginExplorer assessments={watchlist} curves={curves} />

      <Panel>
        <PanelHeader
          title="Turbine & combustor condition matrix"
          subtitle="Distress index per module, 0 (as new) to 100 (serviceable limit). Grey means no trustworthy evidence, not a good result."
          actions={
            <div className="flex items-center gap-3 text-[11px] text-rr-slate">
              <LegendSwatch status="green">&lt; 50 nominal</LegendSwatch>
              <LegendSwatch status="amber">50-74 watch</LegendSwatch>
              <LegendSwatch status="red">≥ 75 act</LegendSwatch>
              <LegendSwatch status="grey">no data</LegendSwatch>
            </div>
          }
        />
        <ConditionMatrix assessments={watchlist} />
      </Panel>

      <section className="space-y-3">
        <SectionHeading
          eyebrow="Restoration queue"
          title="Engines ranked by hot section restoration urgency"
          description="Urgency is driven by how soon margin runs out, how much has already been consumed, the hardware condition behind it and how the deterioration rate compares with the rest of the family."
        />
        <UrgencyTable assessments={assessments} />
      </section>

      <section className="space-y-3">
        <SectionHeading
          eyebrow="Deferral"
          title="Water wash effectiveness"
          description="Washing removes compressor and turbine fouling and returns EGT margin. It defers a removal; it never replaces a restoration."
        />
        <WashEffectiveness effectiveness={effectiveness} assessments={assessments} />
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
  caption,
  compact,
}: {
  label: string;
  value: string;
  tone: "red" | "amber" | "green";
  caption: string;
  compact?: boolean;
}) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <dt className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </dt>
      <dd>
        <span className={cn("rr-numeric mt-1 block font-semibold", compact ? "text-2xl" : "text-4xl", colour)}>{value}</span>
        <span className="block text-[11px] text-rr-cloud/70">{caption}</span>
      </dd>
    </div>
  );
}

function ActionCard({
  status,
  title,
  count,
  lead,
  description,
  href,
  cta,
}: {
  status: "red" | "amber";
  title: string;
  count: number;
  lead: HotSectionAssessment | undefined;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Panel className={cn("flex flex-col justify-between border-l-2", statusStyles[status].dot.replace("bg-", "border-l-"))}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rr-label text-rr-slate">{title}</p>
            <p className={cn("rr-numeric mt-1 text-3xl font-semibold", statusStyles[status].text)}>{count}</p>
          </div>
          <StatusPill status={status}>{status === "red" ? "Act now" : "Watchlist"}</StatusPill>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-rr-slate">{description}</p>
      </div>
      <div className="mt-4 border-t border-rr-ink/8 pt-3">
        {lead ? (
          <p className="text-[11px] text-rr-slate">
            Next up{" "}
            <Link href={`/engines/${lead.engineId}`} className="font-semibold text-rr-ink hover:text-rr-blue">
              {lead.esn}
            </Link>{" "}
            · {lead.operatorCode} · margin {lead.egtMargin.toFixed(1)} °C · {formatHorizon(lead.daysToExhaustion)}
          </p>
        ) : (
          <p className="text-[11px] text-rr-slate">Queue clear.</p>
        )}
        <Link href={href} className="mt-2 inline-block text-xs font-semibold text-rr-blue hover:underline">
          {cta} ›
        </Link>
      </div>
    </Panel>
  );
}

function LegendSwatch({ status, children }: { status: "red" | "amber" | "green" | "grey"; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", statusStyles[status].dot)} aria-hidden />
      {children}
    </span>
  );
}

export const metadata = { title: "Hot section condition" };
