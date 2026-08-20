import Link from "next/link";
import {
  DeteriorationLegend,
  DeteriorationSplitBar,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import {
  PERFORMANCE_THRESHOLDS,
  getFleetPerformance,
  getFleetPerformanceSummary,
  getOperatorFuelPenalty,
  getWashCandidates,
} from "@rr/data";
import { WashWorkbench } from "@/components/performance/wash-workbench";

export const metadata = { title: "Performance & fuel burn" };

/** Engines shown in the ranked workbench — the fleet's material fuel exposure. */
const RANKED_LIMIT = 40;

export default function PerformancePage() {
  const summary = getFleetPerformanceSummary();
  const ranked = getFleetPerformance().slice(0, RANKED_LIMIT);
  const candidates = getWashCandidates(4);
  const operators = getOperatorFuelPenalty().slice(0, 7);
  const rankedPenalty = ranked.reduce((sum, row) => sum + row.annualFuelPenaltyUsd, 0);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div aria-hidden className="rr-grid-lines pointer-events-none absolute inset-0" />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Performance &amp; fuel burn</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              Is a water wash worth the downtime?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {summary.washNow} {summary.washNow === 1 ? "engine pays" : "engines pay"} a wash back inside 45 days and{" "}
              {summary.schedule} more are worth folding into the next ground event. Together they return {formatUsd(summary.programmeNetBenefitUsd)} a year net of{" "}
              {formatNumber(summary.programmeDowntimeHours)} hours off line.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/plan/schedule"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Build the wash programme
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/commercial/costs"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Fuel cost exposure
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat
              label="Wash now"
              value={formatNumber(summary.washNow)}
              tone="red"
              caption="payback under 45 days"
            />
            <HeroStat
              label="Schedule"
              value={formatNumber(summary.schedule)}
              tone="amber"
              caption="next ground event"
            />
            <HeroStat
              label="Recoverable"
              value={formatUsd(summary.recoverableUsd)}
              tone="green"
              caption={`${formatNumber(summary.recoverableCo2Tonnes)} t CO₂ a year`}
            />
          </div>
        </div>
      </section>

      {/* Fleet exposure */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Mean SFC deviation"
          value={`+${summary.meanSfcDeviationPct.toFixed(2)}`}
          unit="%"
          status={
            summary.meanSfcDeviationPct >= PERFORMANCE_THRESHOLDS.redSfcDeviationPct
              ? "red"
              : summary.meanSfcDeviationPct >= PERFORMANCE_THRESHOLDS.amberSfcDeviationPct
                ? "amber"
                : "green"
          }
          caption={`Watch limit ${PERFORMANCE_THRESHOLDS.amberSfcDeviationPct}% · action ${PERFORMANCE_THRESHOLDS.redSfcDeviationPct}%`}
        />
        <StatTile
          label="Annual fuel penalty"
          value={formatUsd(summary.annualFuelPenaltyUsd)}
          status="amber"
          caption={`${formatNumber(summary.engines)} engines at $${PERFORMANCE_THRESHOLDS.jetFuelUsdPerKg.toFixed(2)}/kg`}
        />
        <StatTile
          label="Recoverable by washing"
          value={formatUsd(summary.recoverableUsd)}
          status="green"
          caption={`${Math.round((summary.recoverableUsd / Math.max(1, summary.annualFuelPenaltyUsd)) * 100)}% of the penalty`}
        />
        <StatTile
          label="CO₂ penalty"
          value={formatNumber(summary.annualCo2PenaltyTonnes)}
          unit="t/yr"
          caption={`${formatNumber(summary.recoverableCo2Tonnes)} t avoidable`}
        />
        <StatTile
          label="No cruise data"
          value={formatNumber(summary.noData)}
          unit="engines"
          status="grey"
          caption="Off wing — excluded from means"
        />
      </section>

      {/* Recommended actions + attribution */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Recommended wash queue"
            subtitle="Highest net return per engine, priced against the operator's contract rate"
            actions={
              <Link href="/plan/schedule" className="text-xs font-semibold text-rr-blue hover:underline">
                Plan slots ›
              </Link>
            }
          />
          <div className="grid gap-3 md:grid-cols-2">
            {candidates.map((engine) => (
              <div
                key={engine.engineId}
                className={cn(
                  "rounded-sm border border-rr-ink/8 border-l-2 p-4",
                  statusStyles[engine.washCase.status].border.replace("border-", "border-l-"),
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/engines/${engine.engineId}`} className="text-sm font-semibold text-rr-ink hover:text-rr-blue">
                      {engine.esn}
                    </Link>
                    <p className="text-[11px] text-rr-slate">
                      {engine.operatorName} · {engine.family} · {engine.aircraftTail ?? "off wing"}
                    </p>
                  </div>
                  <StatusPill status={engine.washCase.status}>
                    {engine.washCase.recommendation === "wash-now" ? "Wash now" : "Schedule"}
                  </StatusPill>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="rr-label text-rr-slate">Net benefit</dt>
                    <dd className="rr-numeric mt-0.5 text-lg font-semibold text-status-green">
                      {formatUsd(engine.washCase.netBenefitUsdPerYear)}
                    </dd>
                  </div>
                  <div>
                    <dt className="rr-label text-rr-slate">Payback</dt>
                    <dd className="rr-numeric mt-0.5 text-lg font-semibold text-rr-ink">
                      {engine.washCase.paybackDays}
                      <span className="ml-1 text-xs font-medium text-rr-slate">days</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="rr-label text-rr-slate">Off line</dt>
                    <dd className="rr-numeric mt-0.5 text-lg font-semibold text-rr-ink">
                      {engine.washCase.downtimeHours}
                      <span className="ml-1 text-xs font-medium text-rr-slate">h</span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] leading-relaxed text-rr-slate">{engine.washCase.rationale}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Fleet deterioration attribution"
            subtitle="Mean SFC deviation split by mechanism"
          />
          <DeteriorationSplitBar slices={summary.attribution} height={12} ariaLabel="Fleet deterioration attribution" />
          <DeteriorationLegend slices={summary.attribution} className="mt-4" />
          <p className="mt-4 border-t border-rr-ink/8 pt-4 text-xs leading-relaxed text-rr-slate">
            Washing addresses deposits on the fan and compressor only. Hot-section and clearance losses are hardware
            deterioration and are recovered at shop visit, which is why{" "}
            <span className="font-semibold text-rr-ink">
              {Math.round((summary.recoverableUsd / Math.max(1, summary.annualFuelPenaltyUsd)) * 100)}%
            </span>{" "}
            of the fleet fuel penalty is the realistic wash target.
          </p>
        </Panel>
      </div>

      {/* Ranked fleet + engine business case */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Fleet ranking</p>
            <h2 className="mt-1 text-xl font-semibold text-rr-ink">Fuel-burn penalty, worst {RANKED_LIMIT} engines</h2>
            <p className="mt-1 text-sm text-rr-slate">
              {formatUsd(rankedPenalty)} a year, {Math.round((rankedPenalty / Math.max(1, summary.annualFuelPenaltyUsd)) * 100)}% of
              the fleet total. Select an engine to see its wash business case.
            </p>
          </div>
          <p className="text-[11px] text-rr-slate">
            Colour follows SFC deviation: red past {PERFORMANCE_THRESHOLDS.redSfcDeviationPct}%, amber past{" "}
            {PERFORMANCE_THRESHOLDS.amberSfcDeviationPct}%.
          </p>
        </div>
        <WashWorkbench
          rows={ranked}
          amberLimit={PERFORMANCE_THRESHOLDS.amberSfcDeviationPct}
          redLimit={PERFORMANCE_THRESHOLDS.redSfcDeviationPct}
        />
      </section>

      {/* Operator roll-up */}
      <Panel>
        <PanelHeader
          title="Fuel-burn penalty by operator"
          subtitle="Where the fleet's fuel cost and CO₂ exposure sits, and how much of it a wash programme returns"
          actions={
            <Link href="/commercial/operator-portal" className="text-xs font-semibold text-rr-blue hover:underline">
              Operator portal ›
            </Link>
          }
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rr-ink/8">
              <th className="rr-label py-2 text-left text-rr-slate">Operator</th>
              <th className="rr-label py-2 text-right text-rr-slate">Engines</th>
              <th className="rr-label py-2 text-right text-rr-slate">Mean SFC dev</th>
              <th className="rr-label py-2 text-left text-rr-slate">Exposure</th>
              <th className="rr-label py-2 text-right text-rr-slate">Fuel penalty / yr</th>
              <th className="rr-label py-2 text-right text-rr-slate">Recoverable</th>
              <th className="rr-label py-2 text-right text-rr-slate">Wash now</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((operator) => {
              const worst = operators[0]?.annualFuelPenaltyUsd || 1;
              const status =
                operator.meanSfcDeviationPct >= PERFORMANCE_THRESHOLDS.redSfcDeviationPct
                  ? "red"
                  : operator.meanSfcDeviationPct >= PERFORMANCE_THRESHOLDS.amberSfcDeviationPct
                    ? "amber"
                    : "green";
              return (
                <tr key={operator.operatorId} className="border-b border-rr-ink/5 last:border-0">
                  <td className="py-3">
                    <p className="font-medium text-rr-ink">{operator.name}</p>
                    <p className="text-[11px] text-rr-slate">
                      {operator.code} · {operator.region}
                    </p>
                  </td>
                  <td className="rr-numeric py-3 text-right text-rr-slate">{operator.engines}</td>
                  <td className={cn("rr-numeric py-3 text-right font-semibold", statusStyles[status].text)}>
                    +{operator.meanSfcDeviationPct.toFixed(2)}%
                  </td>
                  <td className="py-3 pr-6">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-rr-mist">
                      <div
                        className={cn("h-full rounded-full", statusStyles[status].dot)}
                        style={{ width: `${Math.max(4, (operator.annualFuelPenaltyUsd / worst) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="rr-numeric py-3 text-right font-semibold text-rr-ink">
                    {formatUsd(operator.annualFuelPenaltyUsd)}
                    <p className="rr-numeric text-[11px] font-normal text-rr-slate">
                      {formatNumber(operator.annualCo2PenaltyTonnes)} t CO₂
                    </p>
                  </td>
                  <td className="rr-numeric py-3 text-right text-status-green">{formatUsd(operator.recoverableUsd)}</td>
                  <td className="rr-numeric py-3 text-right">
                    {operator.washNow > 0 ? (
                      <span className="font-semibold text-status-red">{operator.washNow}</span>
                    ) : (
                      <span className="text-rr-slate">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <p className="text-[11px] leading-relaxed text-rr-slate">
        Method: SFC deviation is modelled from EGT margin lost against the family new-engine margin and route
        environmental severity, annualised over the sectors each aircraft actually flew. Fuel is priced at $
        {PERFORMANCE_THRESHOLDS.jetFuelUsdPerKg.toFixed(2)}/kg and CO₂ at {PERFORMANCE_THRESHOLDS.co2KgPerFuelKg} kg per kg
        of fuel; wash downtime is priced at the operator&rsquo;s contracted rate per engine flight hour.
      </p>
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
  value: string;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
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
