import Link from "next/link";
import { analytics, DISRUPTION_COST_USD, ehmFactorySummary } from "@rr/data";
import { Panel, PanelHeader, ProgressBar, StatTile, formatNumber, formatUsd } from "@rr/ui";
import { AnalyticTable } from "@/components/ehm-factory/analytic-table";

export const metadata = { title: "EHM analytics factory" };

export default function EhmFactoryPage() {
  const summary = ehmFactorySummary();
  const rows = analytics();
  const worstPhase = [...summary.phases].sort((a, b) => b.days - a.days)[0]!;
  const noisiest = rows.filter((row) => row.live && row.precisionPct < 80).sort((a, b) => a.precisionPct - b.precisionPct);
  const maxPhaseDays = Math.max(...summary.phases.map((phase) => phase.days));

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · EHM analytics factory</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              Median DN takes {summary.medianCycleDays} days to reach production
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every day an analytic sits in development is a failure mode the fleet is still flying blind to. Across{" "}
              {summary.analytics} analytics, {formatNumber(summary.daysAboveTarget)} development days sit above target and{" "}
              {worstPhase.label.toLowerCase()} alone consumes {worstPhase.sharePct}% of the cycle.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#population"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the backlog
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/assure/change-packs"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                DN change packs
                <span aria-hidden>›</span>
              </Link>
            </div>
          </div>
          <div className="rr-numeric text-right">
            <p className="text-[3.25rem] font-semibold leading-none">{summary.backlog}</p>
            <p className="rr-label mt-2 text-rr-blue-200">Analytics still in build</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Median cycle time"
          value={summary.medianCycleDays}
          unit="days"
          status="red"
          caption="Requirement capture through to production deployment"
        />
        <StatTile
          label="Operator notifications"
          value={formatNumber(summary.notifications)}
          unit="/ yr"
          caption={`Distilled from ${formatNumber(summary.observations)} internal observations`}
        />
        <StatTile
          label="False positives"
          value={formatNumber(summary.falsePositives)}
          status={summary.medianPrecisionPct < 85 ? "amber" : "green"}
          caption={`Median precision ${summary.medianPrecisionPct}% — every noisy DN erodes operator trust`}
        />
        <StatTile
          label="Disruption avoided"
          value={formatUsd(summary.costAvoidedUsd)}
          status="green"
          caption={`${summary.avoidableEvents} avoidable events caught, at ${formatUsd(DISRUPTION_COST_USD)} per disruption`}
        />
      </section>

      {/* The two data strands behave nothing alike, so never average them together. */}
      <section className="grid gap-4 lg:grid-cols-2">
        {summary.strands.map((strand) => (
          <Panel key={strand.strand}>
            <PanelHeader
              title={strand.label}
              subtitle={`${strand.analytics} analytics · ${formatNumber(strand.parameters)} parameters modelled`}
            />
            <div className="flex items-end gap-8">
              <div>
                <p className="rr-label text-rr-slate">Median cycle</p>
                <p className="rr-numeric mt-2 text-[2.5rem] font-semibold leading-none text-rr-ink">
                  {strand.medianCycleDays}
                  <span className="ml-1.5 text-sm font-medium text-rr-slate">days</span>
                </p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">Target</p>
                <p className="rr-numeric mt-2 text-[2.5rem] font-semibold leading-none text-status-green">
                  {strand.targetDays}
                  <span className="ml-1.5 text-sm font-medium text-rr-slate">days</span>
                </p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">Gap</p>
                <p className="rr-numeric mt-2 text-[2.5rem] font-semibold leading-none text-status-red">
                  {strand.targetMultiple}×
                </p>
              </div>
            </div>
            <div className="mt-5">
              <ProgressBar value={strand.targetDays} max={strand.medianCycleDays} status="red" />
              <p className="mt-2 text-[11px] text-rr-slate">
                Median live precision {strand.medianPrecisionPct}% on this strand
              </p>
            </div>
          </Panel>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Where the development time goes"
            subtitle={`${formatNumber(summary.phases.reduce((sum, phase) => sum + phase.days, 0))} days across the factory`}
          />
          <ul className="space-y-4">
            {summary.phases.map((phase) => (
              <li key={phase.phase}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-rr-ink">{phase.label}</span>
                  <span className="rr-numeric text-sm text-rr-slate">
                    {formatNumber(phase.days)}d · {phase.sharePct}%
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  value={phase.days}
                  max={maxPhaseDays}
                  status={phase.phase === worstPhase.phase ? "red" : "green"}
                />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Too noisy to trust" subtitle="Live analytics below 80% precision" />
          {noisiest.length === 0 ? (
            <p className="text-sm text-rr-slate">Every live analytic is holding above 80% precision.</p>
          ) : (
            <ul className="divide-y divide-rr-ink/8">
              {noisiest.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-rr-ink">{row.name}</p>
                    <p className="mt-0.5 text-[11px] text-rr-slate">
                      {row.id} · {formatNumber(row.falsePositives)} false positives sent to operators
                    </p>
                  </div>
                  <span className="rr-numeric text-lg font-semibold text-status-red">{row.precisionPct}%</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section id="population" className="scroll-mt-24">
        <AnalyticTable rows={rows} />
      </section>
    </div>
  );
}
