import Link from "next/link";
import type { OilActionKind, OilCondition } from "@rr/types";
import {
  Badge,
  Gauge,
  OilCorrelationChart,
  Panel,
  PanelHeader,
  SectionHeading,
  StatTile,
  StatusPill,
  ThresholdBar,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import {
  bearingChamberLabel,
  debrisByChamber,
  getDataset,
  getDebrisEvents,
  getOilCondition,
  getOilCorrelationTimeline,
  oilConditions,
  oilFleetSummary,
} from "@rr/data";
import { DebrisLogTable } from "@/components/oil-debris/debris-log-table";
import { OilWatchlistTable, type OilWatchlistRow } from "@/components/oil-debris/oil-watchlist-table";
import { RecommendedActionPanel } from "@/components/oil-debris/recommended-action";

export const metadata = { title: "Oil & debris monitoring" };

const ACTION_QUEUE: { kind: OilActionKind; title: string; caption: string }[] = [
  { kind: "remove-engine", title: "Remove from wing", caption: "Load-path metal with consumption above limit" },
  { kind: "borescope", title: "Borescope before next flight", caption: "Bearing metal confirmed, extent unknown" },
  { kind: "oil-sample-lab", title: "Lab oil sample", caption: "Trend established, material unconfirmed" },
  { kind: "increase-sampling", title: "Increase sampling", caption: "Early indications, watch the trend" },
];

const CHAMBER_LABELS: Record<string, string> = {
  front: bearingChamberLabel("front"),
  intershaft: bearingChamberLabel("intershaft"),
  rear: bearingChamberLabel("rear"),
  gearbox: bearingChamberLabel("gearbox"),
};

export default async function OilDebrisPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string }>;
}) {
  const { engine: requested } = await searchParams;
  const data = getDataset();
  const summary = oilFleetSummary();
  const conditions = oilConditions();
  const operatorName = (operatorId: string) => data.operators.find((o) => o.id === operatorId)?.name ?? "—";

  const selected = (requested ? getOilCondition(requested) : undefined) ?? conditions[0]!;
  const timeline = getOilCorrelationTimeline(selected.engineId)!;
  const events = getDebrisEvents(selected.engineId);
  const chambers = debrisByChamber();

  const watchlist: OilWatchlistRow[] = conditions
    .filter((c) => c.action.kind !== "nominal")
    .map((c) => ({ ...c, operatorName: operatorName(c.operatorId) }));

  const queue = ACTION_QUEUE.map((entry) => ({
    ...entry,
    engines: conditions.filter((c) => c.action.kind === entry.kind),
  })).filter((entry) => entry.engines.length > 0);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        {/* The grid overlay sits on its own layer so it does not replace the hero gradient. */}
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Oil &amp; debris monitoring</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.removalsRecommended} engines meet the bearing-distress removal criteria
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Oil consumption, chip-detection and vibration evidence for {formatNumber(summary.enginesMonitored)} monitored
              engines. A step change in oil consumption that coincides with load-path metal in the scavenge line is the
              signature that takes an engine off wing — every red row below shows both.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#watchlist"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the {watchlist.length} open recommendations
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/health/vibration"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Cross-check vibration
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Remove" value={summary.removalsRecommended} tone="red" caption="off-wing decision" />
            <HeroStat label="Borescope" value={summary.borescopesRecommended} tone="red" caption="before next flight" />
            <HeroStat label="Watchlist" value={summary.amber} tone="amber" caption="sampling increased" />
            <HeroStat label="Nominal" value={summary.green} tone="green" caption="routine monitoring" />
          </div>
        </div>
      </section>

      {/* Action queue — what to do, in priority order */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {queue.map((entry) => {
          const status = entry.engines[0]!.action.status;
          return (
            <Panel key={entry.kind} className={cn("flex flex-col", status === "red" && "border-status-red/30")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="rr-label text-rr-slate">{entry.title}</p>
                  <p className={cn("rr-numeric mt-2 text-3xl font-semibold", statusStyles[status].text)}>{entry.engines.length}</p>
                </div>
                <StatusPill status={status}>{entry.engines[0]!.action.dueWithinHours}h</StatusPill>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-rr-slate">{entry.caption}</p>
              <ul className="mt-3 space-y-1.5 border-t border-rr-ink/8 pt-3">
                {entry.engines.slice(0, 3).map((c) => (
                  <li key={c.engineId}>
                    <Link
                      href={`/health/oil?engine=${c.engineId}`}
                      className="flex items-baseline justify-between gap-2 text-xs text-rr-slate hover:text-rr-blue"
                    >
                      <span className="font-semibold text-rr-ink">{c.esn}</span>
                      <span className="rr-numeric">{c.consumptionQtPerHr.toFixed(2)} qt/h</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </section>

      {/* Fleet oil state */}
      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Median oil consumption"
          value={summary.medianConsumption.toFixed(2)}
          unit="qt/h"
          caption={`Watch limit ${conditions[0]!.consumptionAmberLimit} · removal limit ${conditions[0]!.consumptionRedLimit}`}
        />
        <StatTile
          label="Above watch limit"
          value={summary.overConsumptionLimit}
          unit="engines"
          status={summary.overConsumptionLimit > 0 ? "amber" : "green"}
          caption="Consumption at or above 0.35 qt/h"
        />
        <StatTile
          label="Step changes detected"
          value={summary.stepChanges}
          unit="engines"
          status={summary.stepChanges > 0 ? "amber" : "green"}
          caption="Discontinuity in the 180-day consumption trend"
        />
        <StatTile
          label="Load-path detections"
          value={summary.loadPathDetections30d}
          unit="30 days"
          status={summary.loadPathDetections30d > 0 ? "red" : "green"}
          caption="M50 bearing steel, carburised steel or silver plating"
        />
      </section>

      {/* Selected engine: correlation evidence and the decision */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Bearing distress diagnosis"
          title={`${selected.esn} · ${selected.family}`}
          description={`${operatorName(selected.operatorId)} · ${selected.aircraftTail ?? "off wing"} · ${selected.location}. Oil consumption, shaft vibration and EGT margin on one timeline; debris indications shown as columns beneath.`}
          actions={<StatusPill status={selected.status} size="md">{`Distress index ${selected.bearingDistressIndex}`}</StatusPill>}
        />

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Correlation view"
              subtitle="180 days · consumption step change highlighted against vibration and EGT margin"
              actions={
                selected.stepChangeAt ? (
                  <Badge className="bg-status-red-soft text-status-red">
                    Step +{selected.stepChangeQtPerHr.toFixed(2)} qt/h
                  </Badge>
                ) : (
                  <Badge variant="outline">No step change</Badge>
                )
              }
            />
            <OilCorrelationChart
              consumption={timeline.consumption}
              vibration={timeline.vibration}
              egtMargin={timeline.egtMargin}
              debris={timeline.debris}
              stepChangeAt={timeline.stepChangeAt}
            />

            <div className="mt-6 grid gap-6 border-t border-rr-ink/8 pt-5 md:grid-cols-3">
              <div>
                <p className="rr-label text-rr-slate">Oil consumption</p>
                <p className={cn("rr-numeric mt-1 text-2xl font-semibold", consumptionStatus(selected) === "green" ? "text-rr-ink" : statusStyles[consumptionStatus(selected)].text)}>
                  {selected.consumptionQtPerHr.toFixed(2)}
                  <span className="ml-1 text-sm font-medium text-rr-slate">qt/h</span>
                </p>
                <div className="mt-2">
                  <ThresholdBar
                    value={selected.consumptionQtPerHr}
                    min={0}
                    max={0.9}
                    amber={selected.consumptionAmberLimit}
                    red={selected.consumptionRedLimit}
                    unit=" qt/h"
                  />
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">
                  {selected.consumptionTrendPct >= 0 ? "+" : ""}
                  {selected.consumptionTrendPct}% over 30 days
                </p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">Oil pressure</p>
                <p className={cn("rr-numeric mt-1 text-2xl font-semibold", selected.oilPressureStatus === "green" ? "text-rr-ink" : statusStyles[selected.oilPressureStatus].text)}>
                  {selected.oilPressurePsi.toFixed(1)}
                  <span className="ml-1 text-sm font-medium text-rr-slate">psi</span>
                </p>
                <div className="mt-2">
                  <ThresholdBar value={selected.oilPressurePsi} min={30} max={100} amber={60} red={45} unit=" psi" direction="lower-is-worse" />
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">Minimum in-flight limit 45 psi</p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">Oil temperature</p>
                <p className={cn("rr-numeric mt-1 text-2xl font-semibold", selected.oilTempStatus === "green" ? "text-rr-ink" : statusStyles[selected.oilTempStatus].text)}>
                  {selected.oilTempC.toFixed(1)}
                  <span className="ml-1 text-sm font-medium text-rr-slate">°C</span>
                </p>
                <div className="mt-2">
                  <ThresholdBar value={selected.oilTempC} min={40} max={160} amber={115} red={135} unit="°C" />
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">Scavenge temperature, cruise average</p>
              </div>
            </div>
          </Panel>

          <RecommendedActionPanel condition={selected} />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Debris & chip-detection log"
              subtitle={`${events.length} indications recorded · load-path metal escalates the disposition`}
              actions={
                selected.lastDebrisAt ? <Badge variant="outline">Last indication {relativeTime(selected.lastDebrisAt)}</Badge> : null
              }
            />
            <DebrisLogTable events={events} chamberLabels={CHAMBER_LABELS} />
          </Panel>

          <div className="space-y-5">
            <Panel className="flex flex-col items-center">
              <PanelHeader title="Bearing distress index" subtitle="Consumption, debris and vibration combined" className="w-full" />
              <Gauge
                value={selected.bearingDistressIndex}
                status={selected.status}
                label="index"
                size={150}
              />
              <dl className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                <Contribution label="Debris 90d" value={formatNumber(selected.debrisCount90d)} />
                <Contribution label="Load path" value={String(selected.loadPathEvents90d)} status={selected.loadPathEvents90d > 0 ? "red" : "green"} />
                <Contribution label="Vib Δ IPS" value={`${selected.vibrationDeltaIps >= 0 ? "+" : ""}${selected.vibrationDeltaIps.toFixed(2)}`} status={selected.vibrationDeltaIps >= 0.25 ? "amber" : "green"} />
              </dl>
            </Panel>

            <Panel>
              <PanelHeader title="Fleet debris by chamber" subtitle="Where the metal is coming from, last 90 days" />
              <ul className="space-y-3">
                {chambers.map((chamber) => {
                  const share = chamber.particles / Math.max(1, chambers.reduce((s, c) => s + c.particles, 0));
                  return (
                    <li key={chamber.chamber}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13px] font-medium capitalize text-rr-ink">{chamber.chamber}</p>
                        <p className="rr-numeric text-[11px] text-rr-slate">
                          <span className={cn("font-semibold", chamber.loadPath > 0 ? "text-status-red" : "text-rr-ink")}>{chamber.loadPath}</span> load-path ·{" "}
                          {formatNumber(chamber.particles)} particles
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                        <div className={cn("h-full rounded-full", chamber.loadPath > 0 ? "bg-status-red" : "bg-rr-blue")} style={{ width: `${Math.round(share * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-rr-slate">{chamber.label}</p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </div>
      </section>

      {/* Ranked fleet watchlist */}
      <section id="watchlist" className="space-y-4 scroll-mt-6">
        <SectionHeading
          eyebrow="Fleet ranking"
          title="Engines with an open oil or debris recommendation"
          description={`${watchlist.length} of ${formatNumber(summary.enginesMonitored)} monitored engines, ranked by bearing distress index. Select a row to load its correlation view.`}
          actions={
            <div className="flex items-center gap-2">
              <StatusPill status="red">{summary.red} act now</StatusPill>
              <StatusPill status="amber">{summary.amber} watchlist</StatusPill>
            </div>
          }
        />
        <OilWatchlistTable rows={watchlist} selectedEngineId={selected.engineId} />
      </section>
    </div>
  );
}

function consumptionStatus(condition: OilCondition) {
  if (condition.consumptionQtPerHr >= condition.consumptionRedLimit) return "red" as const;
  if (condition.consumptionQtPerHr >= condition.consumptionAmberLimit) return "amber" as const;
  return "green" as const;
}

function Contribution({ label, value, status }: { label: string; value: string; status?: "red" | "amber" | "green" }) {
  return (
    <div className="rounded-sm bg-rr-mist px-2 py-2">
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric text-base font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>{value}</dd>
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
