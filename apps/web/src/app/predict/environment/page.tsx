import Link from "next/link";
import { environmentExposureReport, exposureStatus } from "@rr/data";
import {
  Badge,
  ExposureScatter,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { AirportRanking } from "@/components/environment/airport-ranking";
import { ExposureExplorer } from "@/components/environment/exposure-explorer";
import { HarshRoutes } from "@/components/environment/harsh-routes";
import { IntervalRecommendations } from "@/components/environment/interval-recommendations";

export const metadata = { title: "Environmental exposure" };

export default function Page() {
  const report = environmentExposureReport();
  const { summary, drivers, airports, routes, engines, correlation, recommendations } = report;

  const rotations = recommendations.filter((r) => r.action === "rotate");
  const shortenings = recommendations.filter((r) => r.action === "shorten-interval");
  const rotationEngines = rotations.reduce((sum, r) => sum + r.engineCount, 0);
  const shortenEngines = shortenings.reduce((sum, r) => sum + r.engineCount, 0);
  const actionEngines = rotationEngines + shortenEngines;
  const overdue = engines.filter((e) => e.sectors > 0 && e.cyclesToAdjustedRemoval <= 0);

  const fleetDrivers = drivers.map((driver) => {
    const share = engines.reduce((sum, engine) => sum + engine.contributions[driver.id], 0) / Math.max(1, engines.length);
    return { driver, share };
  });
  const maxShare = Math.max(...fleetDrivers.map((d) => d.share));

  return (
    <div className="space-y-7">
      {/* Decision-first hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <span className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Predict · Environmental exposure</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {actionEngines > 0
                ? `${formatNumber(actionEngines)} engines need a routing or interval change`
                : "No rotations required — hold published intervals"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {formatNumber(summary.enginesAssessed)} engines scored on the {formatNumber(summary.sectorsAnalysed)} sectors
              they actually flew in the last {summary.windowDays} days. Engines in the harshest quartile lose{" "}
              <span className="rr-numeric font-semibold text-white">{summary.marginPenalty}°C</span> more EGT margin per
              1,000 cycles than the mildest — the basis for every interval concession below.{" "}
              {rotations.length > 0
                ? `${formatNumber(rotationEngines)} of them sit on ${rotations.length} route group${rotations.length === 1 ? "" : "s"} harsh enough to rotate away from.`
                : "No route group is harsh enough to justify a rotation this window."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#recommendations"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {recommendations.length} interval decisions
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#engines"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {formatNumber(summary.redEngines)} engines in the red band
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Red" value={formatNumber(summary.redEngines)} tone="red" caption="severity ≥ 62" />
            <HeroStat label="Amber" value={formatNumber(summary.amberEngines)} tone="amber" caption="severity 45–61" />
            <HeroStat label="Harsh sectors" value={`${summary.harshSectorPct}%`} tone="amber" caption="touch a red station" />
            <HeroStat label="Exposure" value={formatUsd(summary.annualCostImpactUsd)} tone="red" caption="unplanned removals / yr" />
          </div>
        </div>
      </section>

      {/* Fleet posture */}
      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Mean severity index"
          value={summary.meanSeverityIndex}
          status={summary.meanSeverityIndex >= 62 ? "red" : summary.meanSeverityIndex >= 45 ? "amber" : "green"}
          caption={`0–100 composite · window ${summary.windowDays} days`}
        />
        <StatTile
          label="Harshest station"
          value={summary.worstAirport?.iata ?? "—"}
          status={summary.worstAirport ? exposureStatus(summary.worstAirport.severityIndex) : "grey"}
          caption={
            summary.worstAirport
              ? `${summary.worstAirport.city} · index ${summary.worstAirport.severityIndex}`
              : "No stations scored"
          }
        />
        <StatTile
          label="Cycles beyond adjusted limit"
          value={formatNumber(summary.cyclesAtRisk)}
          status={summary.cyclesAtRisk > 0 ? "red" : "green"}
          caption={`${overdue.length} engines past the severity-adjusted removal point`}
        />
        <StatTile
          label="Severity ↔ deterioration"
          value={`r ${correlation.r}`}
          status={correlation.r >= 0.4 ? "amber" : "grey"}
          caption={`+${correlation.ratePer10Points}°C/1,000 cyc per 10 index points · n=${correlation.sampleSize}`}
        />
      </section>

      {/* Recommendations lead the page: the decision, before the evidence. */}
      <section id="recommendations" className="scroll-mt-6 space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <ActionSummary
            tone="red"
            title={`${rotations.length} route group${rotations.length === 1 ? "" : "s"} to rotate`}
            value={formatNumber(rotationEngines)}
            unit="engines"
            body="Severity is high enough that the shop-visit cost being bought exceeds the cost of re-cutting the routing."
          />
          <ActionSummary
            tone="amber"
            title={`${shortenings.length} population${shortenings.length === 1 ? " needs" : "s need"} a shorter interval`}
            value={formatNumber(shortenEngines)}
            unit="engines"
            body="Routing is structural for these operators; bring the overhaul forward rather than re-planning the network."
          />
          <ActionSummary
            tone="green"
            title="Remaining populations hold"
            value={formatNumber(
              recommendations.filter((r) => r.action === "monitor" || r.action === "hold").reduce((s, r) => s + r.engineCount, 0),
            )}
            unit="engines"
            body="Exposure is within the band the published interval already assumes. Re-scored every 45-day window."
          />
        </div>
        <IntervalRecommendations recommendations={recommendations} />
      </section>

      {/* Evidence */}
      <div className="grid gap-5 xl:grid-cols-2">
        <AirportRanking airports={airports} drivers={drivers} />

        <Panel>
          <PanelHeader
            title="Exposure drives deterioration"
            subtitle="EGT margin lost per 1,000 cycles since last overhaul, against the environmental severity index"
            actions={<Badge variant="brand">r² {correlation.rSquared}</Badge>}
          />
          <ExposureScatter correlation={correlation} />
          <div className="mt-4 grid gap-4 border-t border-rr-ink/6 pt-4 sm:grid-cols-2">
            <div>
              <p className="rr-label text-rr-slate">Fit</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
                +{correlation.ratePer10Points}
                <span className="ml-1 text-xs font-medium text-rr-slate">°C / 1,000 cyc per 10 points</span>
              </p>
              <p className="mt-1 text-[11px] text-rr-slate">
                Least-squares fit over {correlation.sampleSize} engines with a completed post-overhaul sample.
              </p>
            </div>
            <div>
              <p className="rr-label text-rr-slate">Interval policy</p>
              <p className="mt-1 text-[12px] leading-relaxed text-rr-slate">
                The adjusted interval shortens by up to 38% as severity rises from 35 to 100, floored at 62% of the
                published life. Below index 35 the published interval stands.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="What the fleet is breathing"
          subtitle="Mean points of the severity index contributed by each damage mechanism across all managed engines"
        />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {fleetDrivers.map(({ driver, share }) => (
            <li key={driver.id} className="border-l-2 border-rr-blue/30 pl-3">
              <p className="rr-label text-rr-slate">{driver.label}</p>
              <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
                {share.toFixed(1)}
                <span className="ml-1 text-xs font-medium text-rr-slate">pts</span>
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-rr-mist">
                <span className="block h-full rounded-full bg-rr-blue" style={{ width: `${(share / maxShare) * 100}%` }} />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-rr-slate">{driver.mechanism}</p>
              <p className="rr-numeric mt-1 text-[11px] text-rr-slate">weight {(driver.weight * 100).toFixed(0)}%</p>
            </li>
          ))}
        </ul>
      </Panel>

      <HarshRoutes airports={airports} routes={routes} />

      <section id="engines" className="scroll-mt-6">
        <ExposureExplorer engines={engines} />
      </section>

      <p className="pb-2 text-[11px] leading-relaxed text-rr-slate">
        Assumptions: airport severity is modelled from published climate characteristics (arid dust load, coastal
        salinity, urban particulates, ISA deviation) for each station in the network catalogue; sector exposure is the
        mean of both ends, accumulated per engine over the {summary.windowDays}-day sample and blended 60/40 with the
        engine&apos;s recorded environment severity band. Cost exposure prices a severity-driven unplanned removal at
        $4.2m.
      </p>
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
  value: string;
  caption: string;
  tone: "red" | "amber" | "green";
}) {
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-2 text-rr-cloud">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </p>
      <p className="rr-numeric mt-1 text-4xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}

function ActionSummary({
  tone,
  title,
  value,
  unit,
  body,
}: {
  tone: "red" | "amber" | "green";
  title: string;
  value: string;
  unit: string;
  body: string;
}) {
  return (
    <Panel className={cn("border-l-2", statusStyles[tone].border, tone === "red" && "border-l-status-red", tone === "amber" && "border-l-status-amber", tone === "green" && "border-l-status-green")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-rr-ink">{title}</p>
        <StatusPill status={tone} />
      </div>
      <p className={cn("rr-numeric mt-3 text-3xl font-semibold", statusStyles[tone].text)}>
        {value}
        <span className="ml-1.5 text-xs font-medium text-rr-slate">{unit}</span>
      </p>
      <p className="mt-2 text-[12px] leading-snug text-rr-slate">{body}</p>
    </Panel>
  );
}
