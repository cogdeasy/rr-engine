import Link from "next/link";
import { getReliabilityOverview } from "@rr/data";
import { Badge, Panel, PanelHeader, SectionHeading, StatusPill, cn, formatNumber, statusStyles } from "@rr/ui";
import type { ReliabilityAction } from "@rr/types";
import { DefectTable } from "@/components/reliability/defect-table";
import { RemovalPareto } from "@/components/reliability/removal-pareto";
import { ScorecardGrid } from "@/components/reliability/scorecard-grid";
import { TrendExplorer } from "@/components/reliability/trend-explorer";
import { WeibullExplorer } from "@/components/reliability/weibull-explorer";

export const metadata = { title: "Reliability KPIs" };

export default function ReliabilityPage() {
  const overview = getReliabilityOverview();
  const { fleet, scorecard, definitions, evidence } = overview;

  const offTarget = scorecard.filter((row) => row.status !== "green");
  const worst = [...scorecard].sort((a, b) => a.attainmentPct - b.attainmentPct)[0];
  const worstDefinition = definitions.find((d) => d.id === worst.metricId)!;
  const improving = scorecard.filter((row) => {
    const direction = definitions.find((d) => d.id === row.metricId)!.direction;
    return row.trend !== "flat" && (row.trend === "up") === (direction === "higher-is-better");
  }).length;

  return (
    <div className="space-y-7">
      {/* Decision-first hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · Reliability KPIs</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {offTarget.length === 0 ? (
                <>All five contractual measures are on target</>
              ) : (
                <>
                  {worstDefinition.label} is{" "}
                  <span className={cn(statusStyles[worst.status].text, "rr-numeric")}>
                    {worst.value.toLocaleString("en-GB", { minimumFractionDigits: worst.decimals, maximumFractionDigits: worst.decimals })}
                    {worstDefinition.unit}
                  </span>{" "}
                  against a {worstDefinition.target}
                  {worstDefinition.unit} commitment
                </>
              )}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {offTarget.length} of {scorecard.length} measures sit outside their commitment over the rolling{" "}
              {overview.windowMonths} months, {improving} of them trending the right way. Every red reading below resolves to a
              family, an operator or a failure mode with an owner and a next step.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#recommended-actions"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {overview.actions.length} recommended actions
                <span aria-hidden>›</span>
              </a>
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Open event triage
              </Link>
            </div>
          </div>

          <dl className="flex flex-wrap gap-8">
            <HeroStat label="IFSD events" value={formatNumber(evidence.ifsdEvents)} caption="in the reporting window" tone="red" />
            <HeroStat label="Unscheduled removals" value={formatNumber(evidence.unscheduledRemovals)} caption="off-wing, outside the plan" tone="amber" />
            <HeroStat label="Engine flight hours" value={formatNumber(evidence.efh)} caption={`${formatNumber(evidence.engines)} engines`} tone="neutral" />
            <HeroStat label="Departures" value={formatNumber(evidence.departures)} caption="engine sectors flown" tone="neutral" />
          </dl>
        </div>
      </section>

      {/* Recommended actions */}
      <section id="recommended-actions" className="scroll-mt-6 space-y-4">
        <SectionHeading
          eyebrow="Act now"
          title="Recommended actions"
          description="Generated from the measures that are off target, the removal Pareto and the fitted failure modes."
        />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {overview.actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      </section>

      {/* Scorecard */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Target vs actual"
          title="Contractual reliability scorecard"
          description={`Rolling ${overview.windowMonths}-month attainment for the managed fleet. The rule on each bar is the commitment; the bar is attainment against it.`}
          actions={
            <div className="flex items-center gap-2">
              {(["red", "amber", "green"] as const).map((status) => (
                <StatusPill key={status} status={status}>
                  {scorecard.filter((row) => row.status === status).length}
                </StatusPill>
              ))}
            </div>
          }
        />
        <ScorecardGrid rows={scorecard} definitions={definitions} />
      </section>

      {/* Trends and breakdown */}
      <TrendExplorer
        definitions={definitions}
        fleet={fleet}
        families={overview.families}
        operators={overview.operators}
        windowMonths={overview.windowMonths}
      />

      {/* Pareto + method */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Removal-cause Pareto"
            subtitle={`${evidence.unscheduledRemovals} unscheduled removals attributed to the triggering failure mode`}
            actions={<Badge variant="outline">80% rule</Badge>}
          />
          <RemovalPareto causes={overview.causes} />
        </Panel>

        <Panel>
          <PanelHeader title="How these numbers are derived" subtitle="Assumptions behind the scorecard" />
          <dl className="space-y-3 text-[12px] leading-relaxed text-rr-slate">
            {definitions.map((definition) => (
              <div key={definition.id} className="border-l-2 border-rr-blue/30 pl-3">
                <dt className="rr-label text-rr-ink">
                  {definition.label} · target {definition.target}
                  {definition.unit}
                </dt>
                <dd>{definition.description}</dd>
              </div>
            ))}
            <div className="border-l-2 border-rr-ink/15 pl-3">
              <dt className="rr-label text-rr-ink">Exposure</dt>
              <dd>
                Engine flight hours and departures come from the sector log, normalised to programme utilisation for installed
                engines. Stored aircraft contribute no exposure.
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      {/* Recurring defects */}
      <DefectTable defects={overview.defects} />

      {/* Weibull */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Life analysis"
          title="Weibull reliability by failure mode"
          description="Two-parameter fit over observed lives at failure, giving characteristic life, B10 and the population already beyond it."
        />
        <WeibullExplorer fits={overview.weibull} />
      </section>
    </div>
  );
}

function HeroStat({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: "red" | "amber" | "neutral" }) {
  const colour = tone === "red" ? "text-status-red" : tone === "amber" ? "text-status-amber" : "text-white";
  return (
    <div>
      <dt className="rr-label text-rr-cloud/70">{label}</dt>
      <dd className={cn("rr-numeric mt-1 text-3xl font-semibold", colour)}>{value}</dd>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function ActionCard({ action }: { action: ReliabilityAction }) {
  return (
    <Panel className={cn("flex flex-col gap-3 border-l-2", statusStyles[action.status].border.replace("border-", "border-l-"))}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold leading-snug text-rr-ink">{action.title}</p>
        <span className="shrink-0 whitespace-nowrap">
          <StatusPill status={action.status}>
            {action.status === "red" ? "Act now" : action.status === "amber" ? "Watchlist" : "Nominal"}
          </StatusPill>
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-rr-slate">{action.rationale}</p>
      <dl className="grid grid-cols-2 gap-2 text-[11px] text-rr-slate">
        <div>
          <dt className="rr-label">Owner</dt>
          <dd className="text-rr-ink">{action.owner}</dd>
        </div>
        <div>
          <dt className="rr-label">Impact</dt>
          <dd className="text-rr-ink">{action.impact}</dd>
        </div>
      </dl>
      <Link href={action.href} className="mt-auto text-xs font-semibold text-rr-blue hover:underline">
        Take action ›
      </Link>
    </Panel>
  );
}
