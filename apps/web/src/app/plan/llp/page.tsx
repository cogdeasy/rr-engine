import Link from "next/link";
import {
  Badge,
  LlpExpiryTimeline,
  LegendSwatch,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { NEXT_INTERVAL_CYCLES, llpFleetRows, llpFleetStacks, llpFleetSummary } from "@rr/data";
import { LlpEngineExplorer } from "@/components/llp/llp-engine-explorer";
import { LlpFleetTable } from "@/components/llp/llp-fleet-table";

export const metadata = { title: "LLP life management" };

export default function LlpPage() {
  const summary = llpFleetSummary();
  const stacks = llpFleetStacks();

  const removeNow = stacks.filter((s) => s.lines.some((l) => l.expiresBeforeRemoval) || s.daysToRemoval <= 30);
  const opportunities = [...stacks]
    .sort((a, b) => b.recommendation.netBenefitUsd - a.recommendation.netBenefitUsd)
    .slice(0, 6);
  const llpDrivenAll = stacks.filter((s) => s.driver === "llp-limited");
  const atLimitCount = llpDrivenAll.filter((s) => s.minCyclesRemaining === 0).length;
  const llpDriven = llpDrivenAll
    .filter((s) => s.minCyclesRemaining > 0)
    .sort((a, b) => a.minCyclesRemaining - b.minCyclesRemaining)
    .slice(0, 6);
  const procurementAtRisk = stacks
    .flatMap((s) => s.lines.filter((l) => l.leadTimeAtRisk).map((line) => ({ line, stack: s })))
    .sort((a, b) => b.line.unitCostUsd - a.line.unitCostUsd)
    .slice(0, 6);

  const next12Months = summary.timeline.slice(0, 12).reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        {/* Grid lines sit in their own layer: both utilities set `background`. */}
        <span className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Plan · LLP life management</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {formatNumber(summary.mustReplaceParts)} life-limited parts must be replaced at the next shop visit
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Across {formatNumber(summary.enginesTracked)} managed engines, {formatUsd(summary.stubValueAtRiskUsd)} of
              certified life is scrapped as stub if every engine comes off on its planned date.{" "}
              {formatUsd(summary.recoverableUsd)} of that is recoverable by re-timing removals against condition risk.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#stack-workbench"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Optimise {opportunities.length} highest-value removals
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#fleet-exposure"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Fleet exposure
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Expired or expiring" value={formatNumber(summary.redParts)} tone="red" caption="parts past or at limit" />
            <HeroStat label="Watchlist" value={formatNumber(summary.amberParts)} tone="amber" caption="cannot cover next interval" />
            <HeroStat label="Order overdue" value={formatNumber(summary.leadTimeAtRiskParts)} tone="red" caption="lead time will not fit" />
            <HeroStat label="Remove inside 30d" value={formatNumber(removeNow.length)} tone="amber" caption="engines" />
          </div>
        </div>
      </section>

      {/* Value at stake */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Stub life at risk"
          value={formatUsd(summary.stubValueAtRiskUsd)}
          status="amber"
          caption="Unused certified cycles scrapped on the current plan"
        />
        <StatTile
          label="Recoverable"
          value={formatUsd(summary.recoverableUsd)}
          status="green"
          caption="By adopting the recommended removal dates"
        />
        <StatTile
          label="LLP-driven engines"
          value={formatNumber(summary.llpDrivenEngines)}
          status="amber"
          caption={`${summary.conditionDrivenEngines} driven by condition instead`}
        />
        <StatTile
          label="Replacement spend"
          value={formatUsd(summary.mustReplaceCostUsd)}
          caption={`${formatNumber(summary.mustReplaceParts)} parts across the fleet`}
        />
        <StatTile
          label="Expiring in 90 days"
          value={formatNumber(summary.expiringIn90Days)}
          status={summary.expiringIn90Days > 0 ? "red" : "green"}
          caption={`${formatNumber(next12Months)} within 12 months`}
        />
      </section>

      {/* Timeline + LLP-driven removals */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Fleet LLP expiry timeline"
            subtitle="Parts reaching their cyclic limit by month at current utilisation"
            actions={
              <div className="flex items-center gap-4 text-[11px] text-rr-slate">
                <LegendSwatch className="bg-status-red" label="Past or at limit before removal" />
                <LegendSwatch className="bg-rr-blue/70" label="Within life" />
              </div>
            }
          />
          <LlpExpiryTimeline buckets={summary.timeline} height={272} />
          <p className="mt-3 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
            Expiry is projected from each engine&apos;s observed cycles per day. The first column carries the backlog of
            parts already at or past limit and is drawn clipped so later months stay legible.
          </p>
        </Panel>

        <Panel>
          <PanelHeader
            title="LLP limit forces the removal"
            subtitle="Engines coming off for life, not condition"
            actions={<Badge variant="brand">{formatNumber(summary.llpDrivenEngines)} engines</Badge>}
          />
          {atLimitCount > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-status-red/30 bg-status-red/5 px-3 py-2">
              <p className="text-xs text-rr-ink">
                <span className="rr-numeric font-semibold text-status-red">{formatNumber(atLimitCount)}</span> engines are
                already at a life limit and cannot fly further cycles on that part.
              </p>
              <Link href="#fleet-exposure" className="shrink-0 text-xs font-semibold text-rr-blue hover:underline">
                Review ›
              </Link>
            </div>
          )}
          <ul className="space-y-3">
            {llpDriven.map((stack) => (
              <li key={stack.engineId} className={cn("border-l-2 pl-3", statusStyles[stack.status].border.replace("border-", "border-l-"))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/engines/${stack.engineId}`} className="rr-numeric text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                      {stack.esn}
                    </Link>
                    <p className="text-[11px] text-rr-slate">
                      {stack.operatorCode} · {stack.limitingLine.moduleCode} {stack.limitingLine.partNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("rr-numeric text-sm font-semibold", statusStyles[stack.status].text)}>
                      {formatNumber(stack.minCyclesRemaining)}
                    </p>
                    <p className="rr-label text-rr-slate">cycles left</p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">
                  Limit reached {formatDate(stack.llpExpiryDate)} · condition RUL {formatNumber(stack.rulCycles)} cycles
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Stack workbench */}
      <section id="stack-workbench" className="space-y-3 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Decision</p>
            <h2 className="mt-1 text-xl font-semibold text-rr-ink">Which LLPs come off, and when should the engine?</h2>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-rr-slate">
            Ranked by the value recoverable against the planned removal date. Stub life is the certified cycles left on a
            part when the engine is inducted; parts that cannot cover the next {formatNumber(NEXT_INTERVAL_CYCLES)}-cycle interval are
            scrapped at that visit.
          </p>
        </div>
        <LlpEngineExplorer stacks={opportunities} />
      </section>

      {/* Procurement risk */}
      <Panel>
        <PanelHeader
          title="Replacement parts at lead-time risk"
          subtitle="Order-by date has already passed for the planned removal — expedite or re-time the visit"
          actions={
            <Link href="/supply/inventory" className="text-xs font-semibold text-rr-blue hover:underline">
              Supply chain ›
            </Link>
          }
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {procurementAtRisk.map(({ line, stack }) => (
            <div key={line.id} className="rounded-sm border border-rr-ink/8 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{line.partNumber}</p>
                  <p className="text-[11px] text-rr-slate">
                    {stack.esn} · {line.moduleCode} · {line.supplier}
                  </p>
                </div>
                <StatusPill status="red">{line.leadTimeDays}d lead</StatusPill>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="rr-label text-rr-slate">Order by</dt>
                  <dd className="rr-numeric text-status-red">{formatDate(line.orderByDate)}</dd>
                </div>
                <div>
                  <dt className="rr-label text-rr-slate">Removal</dt>
                  <dd className="rr-numeric text-rr-ink">{formatDate(stack.proposedRemovalDate)}</dd>
                </div>
                <div>
                  <dt className="rr-label text-rr-slate">Unit cost</dt>
                  <dd className="rr-numeric text-rr-ink">{formatUsd(line.unitCostUsd)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </Panel>

      {/* Fleet table */}
      <section id="fleet-exposure" className="scroll-mt-24">
        <LlpFleetTable rows={llpFleetRows()} />
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: string; tone: "red" | "amber" | "green"; caption: string }) {
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
