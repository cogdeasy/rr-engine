import Link from "next/link";
import { Badge, Panel, PanelHeader, StatTile, StatusPill, cn, formatDate } from "@rr/ui";
import { trendingWorkbenchData } from "@rr/data";
import { TrendingWorkbench } from "@/components/health-trending/workbench";

export const metadata = { title: "Health trending" };

/**
 * Hero surface: RR navy gradient with the 48px grid overlay. Applied inline because the
 * `.rr-hero-gradient` and `.rr-grid-lines` utilities both write `background-image`, so the
 * grid utility wins the cascade and the gradient is lost.
 */
const HERO_SURFACE: React.CSSProperties = {
  backgroundImage: [
    "linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px)",
    "radial-gradient(120% 100% at 80% 0%, rgba(59, 50, 194, 0.55) 0%, rgba(11, 13, 51, 0) 60%)",
    "linear-gradient(160deg, #0b0d33 0%, #05061f 60%, #10069f 240%)",
  ].join(", "),
  backgroundSize: "48px 48px, 48px 48px, auto, auto",
};

export default function Page() {
  const data = trendingWorkbenchData();

  const red = data.bundles.filter((b) => b.statistics.status === "red");
  const amber = data.bundles.filter((b) => b.statistics.status === "amber");
  const redEngines = new Set(red.map((b) => b.engineId));
  const amberEngines = new Set(amber.map((b) => b.engineId));

  const soonest = [...data.bundles]
    .filter((b) => b.statistics.daysToRed !== null && b.statistics.daysToRed > 0)
    .sort((a, b) => (a.statistics.daysToRed ?? 0) - (b.statistics.daysToRed ?? 0))[0];

  const fastestDecay = [...data.engines].sort((a, b) => b.decayPercentile - a.decayPercentile)[0]!;

  const steps = data.bundles
    .filter((b) => b.statistics.stepChange?.significant)
    .sort(
      (a, b) => Math.abs(b.statistics.stepChange!.magnitude) - Math.abs(a.statistics.stepChange!.magnitude),
    )
    .slice(0, 4);

  const parameterLabel = (id: string) => data.parameters.find((p) => p.id === id)?.shortLabel ?? id;

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-sm bg-rr-ink px-8 py-9 text-white" style={HERO_SURFACE}>
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Health trending</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {redEngines.size} engine{redEngines.size === 1 ? "" : "s"} deteriorating outside the expected band
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Trend {data.parameters.length} performance parameters over {data.windowDays} days against build-standard
              limits and the same-family fleet. Red means a limit is breached or projected inside the next 60 days;
              amber is a watchlist trend. Every flag states its evidence.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#trend-workbench"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Open the trending workbench
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Related alerts
              </Link>
            </div>
          </div>

          <dl className="flex flex-wrap gap-8">
            <HeroStat label="Red series" value={red.length} tone="red" caption={`${redEngines.size} engines`} />
            <HeroStat label="Amber series" value={amber.length} tone="amber" caption={`${amberEngines.size} engines`} />
            <HeroStat
              label="Soonest projected red"
              value={soonest ? `${soonest.statistics.daysToRed}d` : "—"}
              tone="amber"
              caption={soonest ? `${soonest.esn} · ${parameterLabel(soonest.parameter)}` : "none projected"}
            />
            <HeroStat
              label="Fastest decay"
              value={fastestDecay.decayPercentile}
              tone="grey"
              caption={`${fastestDecay.esn} · percentile in ${fastestDecay.family}`}
            />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Series trended"
          value={data.bundles.length}
          caption={`${data.engines.length} engines × ${data.parameters.length} parameters`}
        />
        <StatTile
          label="Significant step changes"
          value={data.bundles.filter((b) => b.statistics.stepChange?.significant).length}
          status={steps.length > 0 ? "amber" : "green"}
          caption="Mean shift ≥ 2.5σ over the window"
        />
        <StatTile
          label="Limit exceedances"
          value={data.bundles.reduce((sum, b) => sum + b.statistics.exceedances.length, 0)}
          status={red.length > 0 ? "red" : "green"}
          caption="Contiguous regions beyond amber or red"
        />
        <StatTile
          label="Recommended actions"
          value={data.recommendations.length}
          status={data.recommendations.some((r) => r.status === "red") ? "red" : "amber"}
          caption="Derived from slope, limits and events"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Act first"
            subtitle="Series projected to breach a red limit soonest, or already beyond it"
            actions={<Badge variant="brand">{red.length + amber.length} flagged</Badge>}
          />
          <ul className="space-y-3">
            {[...red, ...amber]
              .sort((a, b) => (a.statistics.daysToRed ?? 9999) - (b.statistics.daysToRed ?? 9999))
              .slice(0, 6)
              .map((bundle) => {
                const s = bundle.statistics;
                return (
                  <li
                    key={`${bundle.engineId}:${bundle.parameter}`}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 border-l-2 pl-3",
                      s.status === "red" ? "border-l-status-red" : "border-l-status-amber",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-rr-ink">
                        {bundle.esn} · {parameterLabel(bundle.parameter)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-rr-slate">{s.statusReason}</p>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="rr-label text-rr-slate">Slope / 100 cyc</p>
                        <p className="rr-numeric text-sm font-semibold text-rr-ink">
                          {s.slopePer100Cycles > 0 ? "+" : ""}
                          {s.slopePer100Cycles}
                          {s.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="rr-label text-rr-slate">Red at</p>
                        <p className="rr-numeric text-sm font-semibold text-rr-ink">
                          {s.daysToRed === 0
                            ? "Breached"
                            : s.projectedRedAt
                              ? formatDate(s.projectedRedAt)
                              : "—"}
                        </p>
                      </div>
                      <StatusPill status={s.status} />
                    </div>
                  </li>
                );
              })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Largest step changes" subtitle="Discontinuities and the events that explain them" />
          {steps.length === 0 ? (
            <p className="py-8 text-center text-xs text-rr-slate">No significant step changes in the window.</p>
          ) : (
            <ul className="space-y-4">
              {steps.map((bundle) => {
                const step = bundle.statistics.stepChange!;
                return (
                  <li key={`${bundle.engineId}:${bundle.parameter}`} className="border-b border-rr-ink/5 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-semibold text-rr-ink">
                        {bundle.esn} · {parameterLabel(bundle.parameter)}
                      </p>
                      <p className="rr-numeric text-sm font-semibold text-rr-ink">
                        {step.magnitude > 0 ? "+" : ""}
                        {step.magnitude}
                        {bundle.statistics.unit}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-rr-slate">
                      {formatDate(step.at)} · {step.sigmaRatio}σ ·{" "}
                      {step.attributedTo ? step.attributedTo.label : "unexplained by maintenance history"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <section id="trend-workbench" className="scroll-mt-6">
        <div className="mb-3">
          <p className="rr-label text-rr-blue">Workbench</p>
          <h2 className="mt-1 text-lg font-semibold text-rr-ink">Multi-parameter trending</h2>
          <p className="mt-1 max-w-3xl text-xs text-rr-slate">
            Overlay engines and parameters, brush the date range, and compare an engine against the median and
            p10–p90 band of its own family. Amber and red bands are the operator limits for each parameter; shaded
            regions are periods spent beyond them.
          </p>
        </div>
        <TrendingWorkbench data={data} />
      </section>
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
  value: React.ReactNode;
  tone: "red" | "amber" | "green" | "grey";
  caption: string;
}) {
  const colour =
    tone === "red"
      ? "text-status-red"
      : tone === "amber"
        ? "text-status-amber"
        : tone === "green"
          ? "text-status-green"
          : "text-white";
  return (
    <div>
      <dt className="rr-label text-rr-blue-200">{label}</dt>
      <dd className={cn("rr-numeric mt-1 text-3xl font-semibold", colour)}>{value}</dd>
      <p className="mt-1 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}
