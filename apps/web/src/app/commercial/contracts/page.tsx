import Link from "next/link";
import { contractPortfolioSummary, contractPositions } from "@rr/data";
import {
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { ContractWorkbench } from "@/components/contracts/contract-workbench";

export const metadata = { title: "Contracts & TotalCare" };

export default function ContractsPage() {
  const positions = contractPositions();
  const summary = contractPortfolioSummary();
  const watchlist = positions.filter((p) => p.status !== "green").slice(0, 3);
  const weightedGap = Number((summary.weightedAvailability - summary.weightedCommitment).toFixed(2));
  const exposedRevenue = positions
    .filter((p) => p.status !== "green")
    .reduce((s, p) => s + p.financials.revenueAccruedUsd, 0);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Commercial · Contracts &amp; TotalCare</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.breaching} of {summary.contracts} contracts are projected to breach availability this quarter
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Availability is projected to quarter end from the last three months of outturn on the covered fleet. Every
              contract flagged red carries a liquidated damages exposure and a named mitigation owner.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the {summary.breaching + summary.atRisk} exposed contracts
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/commercial/costs"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Cost per engine hour
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Breaching" value={String(summary.breaching)} tone="red" caption="LD payable" />
            <HeroStat label="At risk" value={String(summary.atRisk)} tone="amber" caption="inside 0.15 pts" />
            <HeroStat
              label="On track"
              value={String(summary.contracts - summary.breaching - summary.atRisk)}
              tone="green"
              caption="headroom held"
            />
            <HeroStat
              label="LD exposure"
              value={formatUsd(summary.projectedPenaltiesUsd)}
              tone={summary.projectedPenaltiesUsd > 0 ? "red" : "green"}
              caption="projected to term end"
            />
          </div>
        </div>
      </section>

      {/* Portfolio position */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Fleet-weighted availability"
          value={summary.weightedAvailability.toFixed(2)}
          unit="%"
          status={weightedGap < 0 ? "red" : weightedGap < 0.15 ? "amber" : "green"}
          caption={`Commitment ${summary.weightedCommitment.toFixed(2)}% · ${weightedGap > 0 ? "+" : ""}${weightedGap.toFixed(2)} pts`}
        />
        <StatTile
          label="LD accrued this period"
          value={formatUsd(summary.penaltiesAccruedUsd)}
          status={summary.penaltiesAccruedUsd > 0 ? "red" : "green"}
          caption={`${summary.guaranteesBreached} guarantees breached portfolio-wide`}
        />
        <StatTile
          label="Revenue accrued"
          value={formatUsd(summary.revenueAccruedUsd)}
          caption={`${formatNumber(Math.round(summary.annualEfh / 1000))}k EFH per year under contract`}
        />
        <StatTile
          label="Portfolio margin"
          value={summary.marginPct.toFixed(1)}
          unit="%"
          status={summary.marginPct < 0 ? "red" : summary.marginPct < 10 ? "amber" : "green"}
          caption="Revenue accrued less maintenance cost incurred"
        />
        <StatTile
          label="Engines under contract"
          value={formatNumber(summary.coveredEngines)}
          caption={`${summary.contracts} operators · ${formatUsd(exposedRevenue)} revenue on exposed contracts`}
        />
      </section>

      {/* Act now */}
      <Panel>
        <PanelHeader
          title="Act this quarter"
          subtitle="Contracts ranked by breach-risk score, with the mitigation that recovers the commitment"
          actions={<span className="rr-label text-rr-slate">Red = LD payable if unmitigated</span>}
        />
        {watchlist.length === 0 ? (
          <p className="text-sm text-rr-slate">Every contract is holding headroom against its availability commitment.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {watchlist.map((position) => (
              <article
                key={position.contract.id}
                className={cn("rounded-sm border-l-2 bg-surface p-4 ring-1 ring-rr-ink/8", statusStyles[position.status].dot.replace("bg-", "border-l-"))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-rr-ink">{position.operator.name}</p>
                    <p className="text-[11px] text-rr-slate">
                      {position.contract.kind} · {position.coveredEngines} engines · {position.operator.region}
                    </p>
                  </div>
                  <StatusPill status={position.status}>{position.breachRisk.score}</StatusPill>
                </div>

                <div className="mt-4 flex items-end gap-6">
                  <div>
                    <p className="rr-label text-rr-slate">Projected gap</p>
                    <p className={cn("rr-numeric text-3xl font-semibold leading-none", statusStyles[position.status].text)}>
                      {position.performance.projectedGapPts > 0 ? "+" : ""}
                      {position.performance.projectedGapPts.toFixed(2)}
                      <span className="ml-1 text-xs font-medium text-rr-slate">pts</span>
                    </p>
                  </div>
                  <div>
                    <p className="rr-label text-rr-slate">LD exposure</p>
                    <p className="rr-numeric text-3xl font-semibold leading-none text-rr-ink">
                      {formatUsd(position.financials.projectedPenaltiesUsd)}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 space-y-1.5">
                  {position.breachRisk.drivers.slice(0, 3).map((driver) => (
                    <li key={driver.label} className="flex items-start gap-2 text-[11px] leading-snug text-rr-slate">
                      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[driver.status].dot)} aria-hidden />
                      <span>
                        <span className="font-medium text-rr-ink">{driver.label}</span> — {driver.detail}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 border-t border-rr-ink/8 pt-3">
                  <p className="rr-label text-rr-blue">Recommended action</p>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-rr-ink">{position.breachRisk.recommendedAction}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {/* Register + dossier */}
      <section id="register" className="space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Contract register</p>
            <h2 className="mt-1 text-xl font-semibold text-rr-ink">Portfolio, performance and financial position</h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-rr-slate">
            Select a contract to open its dossier: availability trend against the commitment, revenue accrued versus
            maintenance cost incurred, and the guarantee tracker.
          </p>
        </div>
        <ContractWorkbench positions={positions} />
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
