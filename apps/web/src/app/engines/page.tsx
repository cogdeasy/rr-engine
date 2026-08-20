import type { CSSProperties } from "react";
import Link from "next/link";
import {
  EGT_MARGIN_THRESHOLDS,
  HEALTH_SCORE_THRESHOLDS,
  RUL_THRESHOLDS,
  SHOP_VISIT_THRESHOLDS,
  engineExplorerData,
} from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusDot, cn, formatNumber } from "@rr/ui";
import { EngineRegister } from "@/components/engine-explorer/engine-register";
import { PriorityQueue } from "@/components/engine-explorer/priority-queue";

export const metadata = { title: "Engine explorer" };

/** Navy hero surface: fine grid lines over the Rolls-Royce blue gradient. */
const HERO_SURFACE: CSSProperties = {
  backgroundImage: [
    "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
    "radial-gradient(120% 100% at 80% 0%, rgba(59,50,194,0.55) 0%, rgba(11,13,51,0) 60%)",
    "linear-gradient(155deg, #131a4d 0%, #0a0d2e 45%, #05061a 100%)",
  ].join(", "),
  backgroundSize: "48px 48px, 48px 48px, auto, auto",
};

export default function EngineExplorerPage() {
  const { rows, facets, summary, savedViews } = engineExplorerData();
  const queue = rows.slice(0, 3);

  const byFamily = facets.families.map((family) => {
    const engines = rows.filter((r) => r.family === family.value);
    return {
      family: family.value,
      total: engines.length,
      red: engines.filter((e) => e.status === "red").length,
      amber: engines.filter((e) => e.status === "amber").length,
      green: engines.filter((e) => e.status === "green").length,
      grey: engines.filter((e) => e.status === "grey").length,
      medianEgt: median(engines.map((e) => e.egtMargin)),
    };
  });

  return (
    <div className="space-y-7">
      {/* Decision band: what to do, and to which engines, right now. */}
      {/* The shared `.rr-grid-lines` utility overrides `.rr-hero-gradient`'s
          background shorthand, so both layers are composed here instead. */}
      <section className="relative overflow-hidden rounded-sm px-8 py-8 text-white" style={HERO_SURFACE}>
        <div className="relative space-y-7">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="max-w-2xl">
              <p className="rr-label text-rr-blue-200">Operate · Engine explorer</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
                {summary.red} engines breach thresholds — work them in this order
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-rr-cloud">
                Every one of the {formatNumber(summary.engines)} managed engines is ranked by a composite priority score
                built from EGT margin, open alerts, remaining useful life and projected shop-visit date. Colour is
                operational: red means act now, amber means watchlist, green means within limits.
              </p>
            </div>
            <div className="flex flex-wrap gap-8">
              <HeroStat label="Below EGT red line" value={summary.belowEgtRedLine} tone="red" caption={`≤ ${EGT_MARGIN_THRESHOLDS.red}°C margin`} />
              <HeroStat label="Shop visit ≤ 90 days" value={summary.shopVisitWithin90Days} tone="amber" caption="projected removal" />
              <HeroStat label="Red, no work order" value={summary.unassignedRedEngines} tone="red" caption="nobody owns these yet" />
            </div>
          </div>

          <div>
            <p className="rr-label mb-3 text-rr-cloud/60">Next three engines to work</p>
            <PriorityQueue rows={queue} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Engines managed" value={formatNumber(summary.engines)} caption={`${facets.operators.length} operators · ${facets.families.length} families`} />
        <StatTile label="Red" value={summary.red} status="red" caption="action required now" />
        <StatTile label="Amber" value={summary.amber} status="amber" caption="on the watchlist" />
        <StatTile label="Critical alerts" value={summary.criticalAlerts} status={summary.criticalAlerts > 0 ? "red" : "green"} caption="open across the register" />
        <StatTile label="Median EGT margin" value={summary.medianEgtMargin} unit="°C" status={summary.medianEgtMargin < EGT_MARGIN_THRESHOLDS.amber ? "amber" : "green"} caption="all build standards" />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Register composition by engine family"
            subtitle="Where the threshold breaches are concentrated across the managed build standards"
          />
          <ul className="space-y-3">
            {byFamily.map((row) => (
              <li key={row.family} className="flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <p className="text-[13px] font-medium text-rr-ink">{row.family}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">median {row.medianEgt.toFixed(1)}°C margin</p>
                </div>
                <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-rr-mist">
                  {row.red > 0 ? <div className="bg-status-red" style={{ width: `${(row.red / row.total) * 100}%` }} /> : null}
                  {row.amber > 0 ? <div className="bg-status-amber" style={{ width: `${(row.amber / row.total) * 100}%` }} /> : null}
                  {row.green > 0 ? <div className="bg-status-green" style={{ width: `${(row.green / row.total) * 100}%` }} /> : null}
                  {row.grey > 0 ? <div className="bg-status-grey" style={{ width: `${(row.grey / row.total) * 100}%` }} /> : null}
                </div>
                <div className="rr-numeric w-24 shrink-0 text-right text-[11px] text-rr-slate">
                  <span className="font-semibold text-status-red">{row.red}</span> /{" "}
                  <span className="font-semibold text-status-amber">{row.amber}</span> / {row.total}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Why is a row red?" subtitle="The thresholds this register applies, in order of severity" />
          <ul className="space-y-3 text-xs">
            <ThresholdRule
              label="EGT margin"
              red={`≤ ${EGT_MARGIN_THRESHOLDS.red}°C`}
              amber={`≤ ${EGT_MARGIN_THRESHOLDS.amber}°C`}
              note="Headline deterioration parameter; a red margin drives removal planning."
            />
            <ThresholdRule
              label="Health score"
              red={`≤ ${HEALTH_SCORE_THRESHOLDS.red}`}
              amber={`≤ ${HEALTH_SCORE_THRESHOLDS.amber}`}
              note="Fleet-relative composite of performance, vibration and oil system condition."
            />
            <ThresholdRule
              label="Remaining useful life"
              red={`≤ ${formatNumber(RUL_THRESHOLDS.red)} cycles`}
              amber={`≤ ${formatNumber(RUL_THRESHOLDS.amber)} cycles`}
              note="Prognostic estimate of cycles before removal is required."
            />
            <ThresholdRule
              label="Projected shop visit"
              red={`≤ ${SHOP_VISIT_THRESHOLDS.red} days`}
              amber={`≤ ${SHOP_VISIT_THRESHOLDS.amber} days`}
              note="Remaining life divided by the aircraft's observed sectors per day."
            />
          </ul>
          <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
            Hover a rank chip in the register to read the drivers behind an engine&apos;s score, or open the{" "}
            <Link href="/alerts" className="font-semibold text-rr-blue hover:underline">
              alert queue
            </Link>{" "}
            for the underlying evidence.
          </p>
        </Panel>
      </div>

      <EngineRegister rows={rows} facets={facets} savedViews={savedViews} />
    </div>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : sorted[mid]!;
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <StatusDot status={tone} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function ThresholdRule({ label, red, amber, note }: { label: string; red: string; amber: string; note: string }) {
  return (
    <li className="border-l-2 border-rr-ink/10 pl-3">
      <p className="text-[13px] font-medium text-rr-ink">{label}</p>
      <p className="rr-numeric mt-1 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-status-red">
          <StatusDot status="red" />
          {red}
        </span>
        <span className="inline-flex items-center gap-1.5 text-status-amber">
          <StatusDot status="amber" />
          {amber}
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-snug text-rr-slate">{note}</p>
    </li>
  );
}
