import Link from "next/link";
import {
  getSimulationBaseline,
  listSimulationCandidates,
  recommendScenario,
  simulate,
  simulationFleetSummary,
} from "@rr/data";
import { Panel, PanelHeader, SectionHeading, StatusPill, cn, formatNumber, formatUsd } from "@rr/ui";
import { EnginePicker } from "@/components/simulation/engine-picker";
import { SimulationWorkbench } from "@/components/simulation/simulation-workbench";

export const metadata = { title: "What-if simulation" };

const CANDIDATE_LIMIT = 12;

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string }>;
}) {
  const { engine } = await searchParams;
  const candidates = listSimulationCandidates(CANDIDATE_LIMIT);
  const summary = simulationFleetSummary(CANDIDATE_LIMIT);
  const selectedId = candidates.find((c) => c.engineId === engine)?.engineId ?? candidates[0]!.engineId;
  const baseline = getSimulationBaseline(selectedId)!;
  const baselineOutcome = simulate(baseline, baseline.levers);
  const recommendation = recommendScenario(baseline);

  return (
    <div className="space-y-7">
      {/* Hero: the decision this page supports */}
      <section
        className="relative overflow-hidden rounded-sm px-8 py-9 text-white"
        // Ink gradient with the console's grid overlay, composited in one
        // declaration so the two background layers cannot override each other.
        style={{
          backgroundColor: "#0b0d33",
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            "radial-gradient(120% 100% at 80% 0%, rgba(59,50,194,0.55) 0%, rgba(11,13,51,0) 60%)",
            "linear-gradient(160deg, #0b0d33 0%, #05061f 60%, #10069f 240%)",
          ].join(", "),
          backgroundSize: "48px 48px, 48px 48px, auto, auto",
        }}
      >
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Predict · Digital twin scenarios</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {formatUsd(summary.opportunityUsd)} of margin is on the table across {summary.engines} simulated engines
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Change the operating profile — removal date, take-off derate, route severity, wash interval and workscope —
              and see what it buys in EGT margin, remaining life, cost and disruption risk before you commit the plan.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/engines/${baseline.engineId}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Open {baseline.esn} twin
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
            <HeroStat
              label="Act now"
              value={summary.atRisk}
              tone="red"
              caption="removal risk over 35%"
            />
            <HeroStat label="Watchlist" value={summary.watchlist} tone="amber" caption="risk 18–35%" />
            <HeroStat
              label="Mean risk"
              value={`${(summary.meanRisk * 100).toFixed(0)}%`}
              tone="grey"
              caption="unscheduled removal"
            />
          </div>
        </div>
      </section>

      {/* Engine under simulation */}
      <section className="space-y-3">
        <SectionHeading
          eyebrow="Step 1 · Choose the engine"
          title="Engines with the largest modelled opportunity"
          description="Ranked by condition, then by the saving the cheapest compliant profile would deliver over the interval."
        />
        <EnginePicker candidates={candidates} selectedEngineId={selectedId} />
      </section>

      <section className="space-y-3">
        <SectionHeading
          eyebrow="Step 2 · Model the profile"
          title={`${baseline.esn} — ${baseline.family}, ${baseline.operatorName}`}
          description={`${baseline.aircraftTail} · ${baseline.buildStandard} · ${baseline.contractKind} at $${baseline.ratePerEfhUsd}/EFH · ${formatNumber(baseline.cyclesPerYear)} cycles per year · health ${baseline.healthScore}`}
          actions={<StatusPill status={baseline.status}>{baseline.egtMargin} °C margin today</StatusPill>}
        />
        <SimulationWorkbench baseline={baseline} recommendation={recommendation} />
      </section>

      {/* Model transparency */}
      <Panel>
        <PanelHeader
          title="How the twin is modelled"
          subtitle="Deterministic pure functions over the generated fleet — the same levers always produce the same answer"
        />
        <dl className="grid gap-x-8 gap-y-4 text-[12px] leading-relaxed text-rr-slate md:grid-cols-2 xl:grid-cols-3">
          <Assumption term="Margin decay">
            {baseline.newEgtMargin} °C of new-engine margin over {formatNumber(baseline.overhaulIntervalCycles)} certified
            cycles, scaled by route severity and take-off derate, less the recovery earned by the wash programme.
          </Assumption>
          <Assumption term="As-flown profile">
            Derate, block hours, fuel burn and environmental exposure are averaged from the sectors {baseline.aircraftTail}{" "}
            actually flew; severity blends that exposure with the engine&apos;s assigned environment.
          </Assumption>
          <Assumption term="Fuel penalty">
            Cruise burn deteriorates with margin consumed, integrated over the interval at $0.92/kg on{" "}
            {formatNumber(baseline.fuelBurnKgPerCycle)} kg per cycle.
          </Assumption>
          <Assumption term="Disruption">
            Unscheduled removal probability rises as the interval outruns modelled RUL, weighted by the engine&apos;s live
            prognostics, and is priced against AOG recovery and contract liquidated damages.
          </Assumption>
          <Assumption term="Wasted life">
            Removing early leaves certified life unused; it is valued pro-rata against the{" "}
            {formatUsd(baseline.shopVisitBaseCostUsd)} shop-visit reference price for this family.
          </Assumption>
          <Assumption term="Recommendation">
            A deterministic sweep of the derate, wash, removal-offset, severity and workscope grid, returning the lowest
            cost per cycle that stays above the {baseline.minimumEgtMargin} °C limit, under 35% removal risk and within{" "}
            {baseline.availabilityTarget}% availability.
          </Assumption>
        </dl>
        <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
          As-flown baseline: {formatNumber(baselineOutcome.onWingCycles)} cycles on wing,{" "}
          {baselineOutcome.egtMarginAtRemoval} °C at removal, {formatUsd(baselineOutcome.totalCostUsd)} total cost,{" "}
          {(baselineOutcome.unscheduledRemovalRisk * 100).toFixed(1)}% unscheduled removal risk.
        </p>
      </Panel>
    </div>
  );
}

function Assumption({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="rr-label text-rr-ink">{term}</dt>
      <dd className="mt-1">{children}</dd>
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
  const colour = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
    grey: "text-white",
  }[tone];
  const dot = {
    red: "bg-status-red",
    amber: "bg-status-amber",
    green: "bg-status-green",
    grey: "bg-rr-cloud",
  }[tone];
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
