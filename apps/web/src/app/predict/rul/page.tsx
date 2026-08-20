import Link from "next/link";
import type { EngineSurvivalCurve } from "@rr/types";
import { engineSurvivalCurve, fleetRulOutlook } from "@rr/data";
import { Badge, Panel, PanelHeader, StatTile, cn, formatDate, formatNumber, statusStyles } from "@rr/ui";
import { RulDistribution } from "@/components/prognostics/rul-distribution";
import { RulExplorer } from "@/components/prognostics/rul-explorer";

export const metadata = { title: "Prognostics & RUL" };

/** Engines held in the interactive queue; the rest sit far outside the horizon. */
const QUEUE_SIZE = 60;

export default function PrognosticsPage() {
  const outlook = fleetRulOutlook();
  // Every red engine must be reachable, even one flagged on probability alone
  // rather than on a short horizon, so act-now engines seed the queue.
  const actNow = outlook.assessments.filter((a) => a.urgency === "act-now");
  const queue = [...actNow, ...outlook.assessments.filter((a) => a.urgency !== "act-now")].slice(
    0,
    Math.max(QUEUE_SIZE, actNow.length),
  );

  const curves: Record<string, EngineSurvivalCurve> = {};
  for (const assessment of queue) {
    const curve = engineSurvivalCurve(assessment.engineId);
    if (curve) curves[assessment.engineId] = curve;
  }

  const byModule = [...outlook.assessments.reduce(groupByLimitingModule, new Map<string, ModuleRollup>()).values()]
    .sort((a, b) => b.actNow - a.actNow || a.medianRul - b.medianRul)
    .slice(0, 6);

  const models = outlook.provenance.slice(0, 3);
  const nextOut = outlook.assessments[0];
  const soonest = outlook.assessments.filter((a) => a.rulDays <= 90);
  const unslotted = soonest.filter((a) => !a.plannedSlot?.insideWindow);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Predict · Prognostics &amp; RUL</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {unslotted.length} of {soonest.length} engines due off wing inside 90 days have no slot in the plan
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Remaining useful life is modelled per engine from EGT margin decay, environmental severity, derate profile
              and cycles since overhaul. Each engine below carries a limiting failure mode, an 80% credible interval and
              a removal window that a planner can book against.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/plan/schedule"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Book {unslotted.length} removal slots
                <span aria-hidden>›</span>
              </Link>
              {nextOut ? (
                <Link
                  href={`/engines/${nextOut.engineId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Next out: {nextOut.esn}
                </Link>
              ) : null}
            </div>
          </div>

          <dl className="flex flex-wrap gap-8">
            <HeroStat label="Act now" value={outlook.summary.actNow} tone="red" caption="removal decision due" />
            <HeroStat label="Watchlist" value={outlook.summary.watchlist} tone="amber" caption="inside 180 days" />
            <HeroStat label="Nominal" value={outlook.summary.nominal} tone="green" caption="beyond the horizon" />
          </dl>
        </div>
      </section>

      {/* Headline numbers */}
      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Unslotted inside 90 days"
          value={outlook.summary.unslottedInside90Days}
          status={outlook.summary.unslottedInside90Days > 0 ? "red" : "green"}
          caption="Removal predicted before a booked slot exists"
        />
        <StatTile
          label="Soonest off wing"
          value={nextOut ? formatNumber(nextOut.rulDays) : "—"}
          unit="days"
          status={nextOut?.status ?? "grey"}
          caption={
            nextOut
              ? `${nextOut.esn} · ${formatNumber(nextOut.rulCycles)} cycles · ${nextOut.failureMode}`
              : "No prognostics scored"
          }
        />
        <StatTile
          label="Fleet median RUL"
          value={formatNumber(outlook.summary.medianRulCycles)}
          unit="cycles"
          caption={`${outlook.summary.engines} engines scored`}
        />
        <StatTile
          label="Cycles at risk"
          value={formatNumber(outlook.summary.cyclesAtRiskInside180Days)}
          unit="cycles"
          status="amber"
          caption="Life remaining on engines due off within 180 days"
        />
      </section>

      {/* Distribution + limiting modules */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Fleet remaining useful life distribution"
            subtitle="Engines by predicted cycles to removal, with the share already booked into a slot"
            actions={<Badge variant="brand">{outlook.summary.engines} engines</Badge>}
          />
          <RulDistribution buckets={outlook.distribution} medianCycles={outlook.summary.medianRulCycles} />
        </Panel>

        <Panel>
          <PanelHeader title="What is driving removals" subtitle="Limiting module across the scored fleet" />
          <ul className="space-y-3">
            {byModule.map((entry) => (
              <li key={entry.moduleCode}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-rr-ink">{entry.label}</span>
                  <span className="rr-numeric text-[11px] text-rr-slate">
                    median {formatNumber(entry.medianRul)} cyc
                  </span>
                </div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-rr-mist">
                  {entry.actNow > 0 ? <div className="bg-status-red" style={{ width: `${(entry.actNow / entry.total) * 100}%` }} /> : null}
                  {entry.watchlist > 0 ? <div className="bg-status-amber" style={{ width: `${(entry.watchlist / entry.total) * 100}%` }} /> : null}
                  <div className="bg-status-green" style={{ width: `${(entry.nominal / entry.total) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">
                  <span className="rr-numeric font-semibold text-status-red">{entry.actNow}</span> act now ·{" "}
                  <span className="rr-numeric font-semibold text-status-amber">{entry.watchlist}</span> watchlist ·{" "}
                  {entry.topMode}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Removal queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-rr-ink">Removal queue</h2>
            <p className="text-xs text-rr-slate">
              Shortest remaining life first — select an engine to see its survival curve and removal window.
            </p>
          </div>
          <p className="rr-label text-rr-slate">Top {queue.length} of {outlook.summary.engines} scored engines</p>
        </div>
        <RulExplorer assessments={queue} curves={curves} />
      </section>

      {/* Model provenance */}
      <Panel>
        <PanelHeader
          title="Model provenance"
          subtitle="Which model scored the fleet, what it learned from and how accurate it has been"
          actions={<Badge variant="outline">Trust evidence</Badge>}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => {
            const accuracyStatus = model.windowAccuracy >= 0.88 ? "green" : model.windowAccuracy >= 0.8 ? "amber" : "red";
            return (
              <div key={model.modelVersion} className="rounded-sm border border-rr-ink/8 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-rr-ink">{model.modelVersion}</p>
                    <p className="text-[11px] text-rr-slate">
                      Trained {formatDate(model.trainedAt)} · {formatNumber(model.trainingRemovals)} historical removals
                    </p>
                  </div>
                  <span className={cn("rr-numeric text-lg font-semibold", statusStyles[accuracyStatus].text)}>
                    {Math.round(model.windowAccuracy * 100)}%
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-rr-slate">
                  <div>
                    <dt className="rr-label">Engines</dt>
                    <dd className="rr-numeric text-rr-ink">{model.enginesScored}</dd>
                  </div>
                  <div>
                    <dt className="rr-label">MAE</dt>
                    <dd className="rr-numeric text-rr-ink">{model.maeCycles} cyc</dd>
                  </div>
                  <div>
                    <dt className="rr-label">Early calls</dt>
                    <dd className="rr-numeric text-rr-ink">{Math.round(model.earlyCallRate * 100)}%</dd>
                  </div>
                </dl>
                <p className="rr-label mt-3 text-rr-slate">Features</p>
                <ul className="mt-1.5 space-y-1">
                  {model.features.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-2">
                      <span className="flex-1 text-[11px] text-rr-ink">{feature.label}</span>
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-rr-mist">
                        <span className="block h-full rounded-full bg-rr-blue-400" style={{ width: `${feature.importance * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-rr-slate">Last scored {formatDate(model.lastScoredAt)}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-rr-slate">
          {outlook.provenance.length} model lines are in service across the scored fleet; point releases within a line share
          training data and are reported together.
        </p>
      </Panel>
    </div>
  );
}

interface ModuleRollup {
  moduleCode: string;
  label: string;
  total: number;
  actNow: number;
  watchlist: number;
  nominal: number;
  medianRul: number;
  topMode: string;
  ruls: number[];
  modes: Record<string, number>;
}

function groupByLimitingModule(
  acc: Map<string, ModuleRollup>,
  assessment: { limitingModule: string; limitingModuleLabel: string; urgency: string; rulCycles: number; failureMode: string },
): Map<string, ModuleRollup> {
  const entry: ModuleRollup = acc.get(assessment.limitingModule) ?? {
    moduleCode: assessment.limitingModule,
    label: assessment.limitingModuleLabel,
    total: 0,
    actNow: 0,
    watchlist: 0,
    nominal: 0,
    medianRul: 0,
    topMode: assessment.failureMode,
    ruls: [],
    modes: {},
  };
  entry.total += 1;
  if (assessment.urgency === "act-now") entry.actNow += 1;
  else if (assessment.urgency === "watchlist") entry.watchlist += 1;
  else entry.nominal += 1;
  entry.ruls.push(assessment.rulCycles);
  entry.modes[assessment.failureMode] = (entry.modes[assessment.failureMode] ?? 0) + 1;
  const sorted = [...entry.ruls].sort((a, b) => a - b);
  entry.medianRul = sorted[Math.floor(sorted.length / 2)] ?? 0;
  entry.topMode = Object.entries(entry.modes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? entry.topMode;
  acc.set(assessment.limitingModule, entry);
  return acc;
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <dt className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </dt>
      <dd className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</dd>
      <dd className="text-[11px] text-rr-cloud/70">{caption}</dd>
    </div>
  );
}
