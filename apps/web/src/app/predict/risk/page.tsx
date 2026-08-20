import Link from "next/link";
import { getRiskBoard, RISK_CONSEQUENCE_LABEL } from "@rr/data";
import type { EngineRiskItem } from "@rr/types";
import {
  Badge,
  Panel,
  PanelHeader,
  ProgressBar,
  SectionHeading,
  Sparkline,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { ExposureTrend } from "@/components/risk/exposure-trend";
import { RiskMatrix } from "@/components/risk/risk-matrix";
import { RiskRegister } from "@/components/risk/risk-register";

export const metadata = { title: "Failure risk" };

/** The register is a working set, not an archive: the deepest exposure the fleet carries today. */
const REGISTER_SIZE = 60;

export default function FailureRiskPage() {
  const board = getRiskBoard();
  const { summary, items, failureModes, operators, trend } = board;

  const register = items.slice(0, REGISTER_SIZE);
  const actNow = items.filter((item) => item.status === "red").slice(0, 4);
  const coverageStatus = summary.unscoredEngines > 0 ? "grey" : "green";

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Predict · Failure risk</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.dominantFailureMode} drives {summary.dominantFailureModeSharePct}% of a{" "}
              {formatUsd(summary.exposureUsd)} fleet risk exposure
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every scored failure mode is ranked by probability of occurring before the engine&apos;s next maintenance
              opportunity, multiplied by what the disruption would cost the operator. Committing the recommended
              mitigations buys down {formatUsd(summary.buydownUsd)} for {formatUsd(summary.mitigationCostUsd)} of work.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#risk-register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work {summary.intolerable} intolerable risks
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/predict/rul"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Remaining useful life
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Intolerable" value={formatNumber(summary.intolerable)} tone="red" caption="score 12 or above" />
            <HeroStat label="Watchlist" value={formatNumber(summary.watchlist)} tone="amber" caption="score 6 to 11" />
            <HeroStat label="Expected IFSD" value={summary.expectedIfsdEvents.toFixed(1)} tone="red" caption="events before opportunity" />
            <HeroStat label="Expected AOG" value={summary.expectedAogEvents.toFixed(1)} tone="amber" caption="events before opportunity" />
          </div>
        </div>
      </section>

      {/* Exposure ledger */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Gross exposure"
          value={formatUsd(summary.exposureUsd)}
          status="red"
          caption={`${trend.deltaPct > 0 ? "+" : ""}${trend.deltaPct}% over 90 days`}
        />
        <StatTile
          label="Residual after mitigation"
          value={formatUsd(summary.residualExposureUsd)}
          status="amber"
          caption="If every recommendation is committed"
        />
        <StatTile
          label="Risk bought down"
          value={formatUsd(summary.buydownUsd)}
          status="green"
          caption={`${formatUsd(summary.mitigationCostUsd)} of mitigation work`}
        />
        <StatTile
          label="Engines scored"
          value={formatNumber(summary.engines)}
          status={coverageStatus}
          caption={
            summary.unscoredEngines > 0
              ? `${formatNumber(summary.unscoredEngines)} without prognostic coverage`
              : `${formatNumber(summary.scoredItems)} scored failure modes`
          }
        />
        <StatTile
          label="Mean model confidence"
          value={`${Math.round(summary.meanConfidence * 100)}%`}
          status={summary.meanConfidence < 0.6 ? "amber" : "green"}
          caption={`${formatNumber(summary.lowConfidenceItems)} risks below 60%`}
        />
      </section>

      {/* Matrix and immediate actions */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Risk matrix"
            subtitle="Likelihood of failure before the next opportunity against operational consequence"
            actions={
              <div className="flex items-center gap-2">
                <StatusPill status="red">Intolerable</StatusPill>
                <StatusPill status="amber">Watchlist</StatusPill>
                <StatusPill status="green">Tolerable</StatusPill>
              </div>
            }
          />
          <RiskMatrix cells={board.matrix} />
        </Panel>

        <Panel>
          <PanelHeader title="Act now" subtitle="Highest-exposure intolerable risks and their recommended mitigation" />
          {actNow.length === 0 ? (
            <p className="text-xs text-rr-slate">No intolerable risks in the current scoring run.</p>
          ) : (
            <ul className="space-y-3">
              {actNow.map((item) => (
                <ActNowRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Trend and operator exposure */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Fleet risk exposure, last 90 days"
            subtitle="Expected disruption cost across every scored failure mode"
            actions={
              <div className="text-right">
                <p className="rr-numeric text-lg font-semibold text-status-red">{formatUsd(trend.currentUsd)}</p>
                <p className="rr-label text-rr-slate">peak {formatUsd(trend.peakUsd)}</p>
              </div>
            }
          />
          <ExposureTrend trend={trend} />
        </Panel>

        <Panel>
          <PanelHeader title="Exposure by operator" subtitle="Where the disruption cost lands" />
          <ul className="space-y-3">
            {operators.slice(0, 7).map((operator) => (
              <li key={operator.operatorId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-rr-ink">
                    <span className="rr-numeric font-semibold">{operator.operatorCode}</span>{" "}
                    <span className="text-rr-slate">{operator.operatorName}</span>
                  </span>
                  <span className="rr-numeric text-sm font-semibold text-rr-ink">{formatUsd(operator.exposureUsd)}</span>
                </div>
                <ProgressBar
                  value={operator.exposureUsd}
                  max={operators[0]?.exposureUsd ?? 1}
                  status={operator.status}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-rr-slate">
                  {operator.engines} engines · {operator.intolerable} intolerable · {formatUsd(operator.residualExposureUsd)} residual
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Failure mode contribution */}
      <Panel>
        <PanelHeader
          title="Top failure modes by contribution"
          subtitle="Share of fleet exposure, mean probability and residual risk after the recommended mitigations"
          actions={<Badge variant="outline">{failureModes.length} modes scored</Badge>}
        />
        <ul className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {failureModes.slice(0, 8).map((mode) => (
            <li key={mode.failureMode} className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-rr-ink">{mode.failureMode}</p>
                  <p className="rr-numeric shrink-0 text-sm font-semibold text-rr-ink">{formatUsd(mode.exposureUsd)}</p>
                </div>
                <ProgressBar value={mode.sharePct} max={failureModes[0]?.sharePct ?? 1} status={mode.status} className="mt-1.5" />
                <p className="mt-1 text-[11px] text-rr-slate">
                  {mode.sharePct}% of exposure · {mode.engines} engines · {mode.intolerable} intolerable · ATA{" "}
                  {mode.ataChapter} · {RISK_CONSEQUENCE_LABEL[mode.dominantConsequence]} ·{" "}
                  {(mode.meanProbability * 100).toFixed(1)}% mean P(fail)
                </p>
              </div>
              <div className="w-20 shrink-0">
                <Sparkline points={mode.history} status={mode.status} height={30} />
                <p className="rr-label mt-0.5 text-center text-rr-slate">90d</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Register */}
      <section id="risk-register" className="space-y-4 scroll-mt-6">
        <SectionHeading
          eyebrow="Risk register"
          title="Ranked engine risks and mitigations"
          description={`Top ${register.length} of ${formatNumber(summary.scoredItems)} scored failure modes, ranked by expected disruption cost. Select a row for the model evidence, the mitigation options and the residual risk each one leaves behind.`}
        />
        <RiskRegister items={register} />
      </section>

      <p className="text-[11px] text-rr-slate">
        Scored {new Date(board.generatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.
        Probabilities are converted to the next maintenance opportunity using each aircraft&apos;s recent cyclic
        utilisation; consequence cost blends the failure mode, the airframe and the operator&apos;s service contract.
      </p>
    </div>
  );
}

function ActNowRow({ item }: { item: EngineRiskItem }) {
  return (
    <li className="rounded-sm border border-status-red/25 bg-status-red-soft/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="rr-numeric text-sm font-semibold text-rr-ink">{item.esn}</p>
        <span className={cn("rr-numeric text-sm font-semibold", statusStyles.red.text)}>{formatUsd(item.exposureUsd)}</span>
      </div>
      <p className="mt-0.5 truncate text-xs text-rr-ink">{item.failureMode}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">
        {(item.probability * 100).toFixed(1)}% before {item.opportunityLabel} · {RISK_CONSEQUENCE_LABEL[item.consequenceClass]}
      </p>
      <p className="mt-2 text-[11px] font-semibold text-rr-blue">
        {item.recommendedMitigation.label} · {formatUsd(item.recommendedMitigation.netBenefitUsd)} net benefit
      </p>
    </li>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: string; tone: "red" | "amber"; caption: string }) {
  return (
    <div>
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", tone === "red" ? "text-status-red" : "text-status-amber")}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}
