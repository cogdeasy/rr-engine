import Link from "next/link";
import {
  Badge,
  Panel,
  PanelHeader,
  ProgressBar,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import { telemetryQualityReport, untrustedEngineFeeds } from "@rr/data";
import { FlightGapsTable } from "@/components/telemetry-quality/flight-gaps";
import { TelemetryHeatmap, type HeatRow } from "@/components/telemetry-quality/heatmap";
import { IngestTimeline } from "@/components/telemetry-quality/ingest-timeline";

export const metadata = { title: "Telemetry quality" };

/** Column header abbreviation for a parameter id, e.g. `egtMargin` -> `EGTMAR`. */
function shortCode(parameter: string): string {
  return parameter.toUpperCase().slice(0, 6);
}

export default function Page() {
  const report = telemetryQualityReport();
  const { summary } = report;

  // The heatmap is a client island, so only the engines an operator would act on
  // cross the boundary: everything not nominal, plus a nominal sample for contrast.
  const untrusted = untrustedEngineFeeds(report);
  const heatEngines = [
    ...[...report.engines]
      .filter((e) => e.status !== "green")
      .sort((a, b) => a.trustIndex - b.trustIndex),
    ...[...report.engines].filter((e) => e.status === "green").sort((a, b) => a.trustIndex - b.trustIndex).slice(0, 40),
  ];

  const rows: HeatRow[] = heatEngines.map((engine) => ({
    engineId: engine.engineId,
    esn: engine.esn,
    family: engine.family,
    operatorCode: engine.operatorCode,
    operatorName: engine.operatorName,
    aircraftTail: engine.aircraftTail,
    position: engine.position,
    status: engine.status,
    trustIndex: engine.trustIndex,
    coveragePct: engine.coveragePct,
    sectorsFlown: engine.sectorsFlown,
    sectorsMissing: engine.sectorsMissing,
    lastSampleAt: engine.lastSampleAt,
    hoursSinceLastSample: engine.hoursSinceLastSample,
    deadParameters: engine.deadParameters,
    frozenSignals: engine.frozenSignals,
    outOfRangeSamples: engine.outOfRangeSamples,
    openAlerts: engine.impactedAlertIds.length,
    recommendedAction: engine.recommendedAction,
    cells: engine.parameters.map((p) => ({
      parameter: p.parameter,
      label: p.label,
      status: p.status,
      coveragePct: p.coveragePct,
      fitted: p.fitted,
      missing: p.missingSnapshots,
      frozen: p.frozenSamples,
      outOfRange: p.outOfRangeSamples,
    })),
  }));

  const parameterColumns = report.parameters.map((p) => ({
    parameter: p.parameter,
    label: `${p.label} (ATA ${p.ataChapter})`,
    short: shortCode(p.parameter),
  }));

  const degraded = report.impacts.filter((impact) => impact.status !== "green");
  const actNow = untrusted.filter((e) => e.status === "red" || e.status === "grey");
  const worstDay = [...report.ingest].sort((a, b) => a.coveragePct - b.coveragePct)[0];

  return (
    <div className="space-y-7">
      {/* Hero — the decision this page supports */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Telemetry quality</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.unverifiableRedAlerts} open alerts sit on feeds we cannot currently verify
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Fleet coverage over the last {summary.windowDays} days is {summary.fleetCoveragePct}% of expected
              snapshots. Treat findings on the {actNow.length} act-now engines below as unconfirmed until their feed is
              restored — every red cell here has a named cause and a recommended action.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Triage affected alerts
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/engines"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Engine explorer
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Trust index" value={summary.fleetTrustIndex} tone="green" caption="fleet mean, 0-100" />
            <HeroStat label="Act now" value={summary.enginesRed + summary.enginesNoData} tone="red" caption="feeds unusable" />
            <HeroStat label="Watchlist" value={summary.enginesAmber} tone="amber" caption="gaps or integrity flags" />
            <HeroStat label="Nominal" value={summary.enginesGreen} tone="green" caption="feed fully trusted" />
          </div>
        </div>
      </section>

      {/* Confidence caveat */}
      <Panel className="border-status-amber/30 bg-status-amber-soft/40">
        <PanelHeader
          title="Confidence caveat — analytics degraded by the current gaps"
          subtitle="Downstream models still run, but these outputs are computed on an incomplete sample."
          actions={<StatusPill status={degraded.some((d) => d.status === "red") ? "red" : "amber"}>{degraded.length} affected</StatusPill>}
        />
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {report.impacts.map((impact) => (
            <li
              key={impact.id}
              className={cn("rounded-sm border bg-white p-4", statusStyles[impact.status].border)}
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={impact.href} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                  {impact.analytic}
                </Link>
                <StatusPill status={impact.status}>{impact.coveragePct}%</StatusPill>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-rr-slate">{impact.consequence}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-rr-slate">
                <Badge variant="outline">{formatNumber(impact.enginesAffected)} engines degraded</Badge>
                {impact.enginesBlind > 0 ? (
                  <Badge variant="neutral">
                    <span className="text-status-red">{impact.enginesBlind} blind</span>
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Volume and integrity */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Snapshots received"
          value={formatNumber(summary.snapshotsReceived)}
          status={summary.fleetCoveragePct >= 93 ? "green" : "amber"}
          caption={`of ${formatNumber(summary.snapshotsExpected)} expected · ${summary.fleetCoveragePct}%`}
        />
        <StatTile
          label="Stale feeds"
          value={summary.staleFeeds}
          status={summary.staleFeeds > 0 ? "amber" : "green"}
          caption="No snapshot in over 7 days"
        />
        <StatTile
          label="Frozen signals"
          value={summary.frozenSignals}
          status={summary.frozenSignals > 0 ? "amber" : "green"}
          caption="Identical values repeated across sectors"
        />
        <StatTile
          label="Out-of-range samples"
          value={formatNumber(summary.outOfRangeSamples)}
          status={summary.outOfRangeSamples > 0 ? "amber" : "green"}
          caption="Outside the plausible envelope"
        />
        <StatTile
          label="Sectors with data loss"
          value={formatNumber(summary.flightsPartialData + summary.flightsMissingData)}
          status={
            summary.flightsMissingData > 0
              ? "red"
              : summary.flightsPartialData > 0
                ? "amber"
                : "green"
          }
          caption={`${summary.flightsMissingData} with no snapshot at all`}
        />
      </section>

      {/* Heatmap */}
      <TelemetryHeatmap rows={rows} parameters={parameterColumns} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Ingest timeline"
            subtitle={`Snapshots received per day across the fleet, last ${summary.windowDays} days`}
            actions={
              worstDay ? (
                <span className="text-[11px] text-rr-slate">
                  Worst day {new Date(worstDay.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ·{" "}
                  <span className={statusStyles[worstDay.status].text}>{worstDay.coveragePct}%</span>
                </span>
              ) : null
            }
          />
          <IngestTimeline days={report.ingest} />
        </Panel>

        <Panel>
          <PanelHeader title="Coverage by parameter" subtitle="Fleet-wide share of expected snapshots received" />
          <ul className="space-y-2.5">
            {[...report.parameters]
              .sort((a, b) => a.coveragePct - b.coveragePct)
              .map((parameter) => (
                <li key={parameter.parameter}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-rr-ink">{parameter.label}</span>
                    <span className={cn("rr-numeric text-[12px] font-semibold", statusStyles[parameter.status].text)}>
                      {parameter.coveragePct}%
                    </span>
                  </div>
                  <ProgressBar value={parameter.coveragePct} status={parameter.status} className="mt-1" />
                  <p className="mt-1 text-[10px] text-rr-slate">
                    ATA {parameter.ataChapter} · {parameter.enginesNoData} engines blind
                    {parameter.enginesNotFitted > 0 ? ` · ${parameter.enginesNotFitted} not fitted` : ""}
                  </p>
                </li>
              ))}
          </ul>
        </Panel>
      </div>

      {/* Worst feeds — the queue */}
      <Panel padded={false}>
        <div className="p-5">
          <PanelHeader
            title="Feed restoration queue"
            subtitle="Engines whose telemetry cannot currently support a maintenance decision, worst first"
            className="pb-0"
          />
        </div>
        <ul className="divide-y divide-rr-ink/5 border-t border-rr-ink/8">
          {untrusted.slice(0, 8).map((engine) => (
            <li key={engine.engineId} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className={cn("h-8 w-0.5 shrink-0 rounded-full", statusStyles[engine.status].dot)} aria-hidden />
              <div className="w-48 shrink-0">
                <Link href={`/engines/${engine.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                  {engine.esn}
                </Link>
                <p className="text-[11px] text-rr-slate">
                  {engine.family} · {engine.operatorCode} · {engine.aircraftTail ?? "off wing"}
                </p>
              </div>
              <div className="min-w-[220px] flex-1">
                <p className="text-[12px] leading-relaxed text-rr-ink">{engine.recommendedAction}</p>
                <p className="mt-0.5 text-[11px] text-rr-slate">
                  {engine.coveragePct}% coverage · {engine.sectorsMissing}/{engine.sectorsFlown} sectors missing ·{" "}
                  {engine.lastSampleAt ? `last snapshot ${relativeTime(engine.lastSampleAt)}` : "no snapshot in window"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {engine.impactedAlertIds.length > 0 ? (
                  <Badge variant="outline">{engine.impactedAlertIds.length} alerts at risk</Badge>
                ) : null}
                <StatusPill status={engine.status}>trust {engine.trustIndex}</StatusPill>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Flights */}
      <Panel padded={false}>
        <div className="space-y-4 p-5">
          <PanelHeader
            title="Sectors with missing or partial data"
            subtitle="Flights where at least a tenth of the expected snapshot never arrived"
            className="pb-0"
          />
          <FlightGapsTable gaps={report.flightGaps.slice(0, 200)} />
        </div>
      </Panel>
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
  value: number;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-blue-200">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </p>
      <p className="rr-numeric mt-1 text-4xl font-semibold tracking-tight">{formatNumber(value)}</p>
      <p className="text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}
