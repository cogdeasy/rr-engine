import type { ReactNode } from "react";
import {
  getDataset,
  getTestCellActionQueue,
  getTestCellRuns,
  testCellFailureCauses,
  testCellFamilyStats,
  testCellFleetSummary,
  testCellUtilisation,
  toTestCellRunSummary,
  TEST_CELL_RUN_COST_USD,
} from "@rr/data";
import type { TestCellRun } from "@rr/types";
import { Badge, SectionHeading, Sparkline, StatTile, formatNumber, formatUsd } from "@rr/ui";
import { BedUtilisation, FailureCauses, FamilyComparison } from "@/components/test-cell/fleet-panels";
import { RunExplorer } from "@/components/test-cell/run-explorer";
import { RunsTable } from "@/components/test-cell/runs-table";

export const metadata = {
  title: "Test cell results",
  description: "Post-overhaul pass-off runs and restored margin verification.",
};

/** How many runs are handed to the client explorer with their full sample data. */
const EXPLORER_RUNS = 24;

export default function Page() {
  const data = getDataset();
  const runs = getTestCellRuns();
  const summary = testCellFleetSummary(runs);
  const queue = getTestCellActionQueue();
  const causes = testCellFailureCauses(runs);
  const families = testCellFamilyStats(runs);
  const beds = testCellUtilisation(runs);

  const operatorNames = Object.fromEntries(data.operators.map((o) => [o.id, o.name]));
  const facilityNames = Object.fromEntries(data.facilities.map((f) => [f.id, f.name]));

  // The explorer holds the decision queue plus the most recent runs, with their
  // profile samples; the history table only needs the summary rows.
  const explorerRuns: TestCellRun[] = [
    ...queue,
    ...runs.filter((run) => !queue.some((q) => q.id === run.id)).slice(0, Math.max(0, EXPLORER_RUNS - queue.length)),
  ];
  const queueIds = queue.map((run) => run.id);
  const historyRows = runs.map(toTestCellRunSummary);

  const decided = summary.passed + summary.conditional + summary.failed;
  const releaseBlocked = summary.failed;
  const yieldStatus = summary.firstPassYieldPct >= 80 ? "green" : summary.firstPassYieldPct >= 65 ? "amber" : "red";

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Execute"
        title="Test cell results"
        description="Post-overhaul pass-off runs and restored margin verification. Every engine leaving a shop visit is judged against the acceptance limits for its build standard before it can be released to service."
        actions={
          <>
            <Badge variant="outline">{summary.runs} runs · 24 months</Badge>
            <Badge variant="brand">{summary.engines} engines</Badge>
          </>
        }
      />

      <section className="rr-hero-gradient relative overflow-hidden rounded-sm text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid gap-8 p-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div>
            <p className="rr-label text-rr-blue-200">Decision supported</p>
            <p className="mt-2 max-w-xl text-xl font-medium leading-snug">
              Has this engine met its acceptance criteria for return to service?
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {releaseBlocked > 0
                ? `${releaseBlocked} ${releaseBlocked === 1 ? "engine has" : "engines have"} failed pass-off and cannot be released until the rework is closed and a retest is flown.`
                : "No engine is currently blocked by a failed pass-off."}{" "}
              {summary.awaitingRelease} completed {summary.awaitingRelease === 1 ? "run is" : "runs are"} still waiting on a
              release decision, and {summary.running} {summary.running === 1 ? "engine is" : "engines are"} on the bed now.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-5">
              <HeroMetric label="Awaiting release" value={summary.awaitingRelease} tone={summary.awaitingRelease > 0 ? "amber" : "green"} caption={`${decided} runs decided`} />
              <HeroMetric label="Failed pass-off" value={summary.failed} tone={summary.failed > 0 ? "red" : "green"} caption="rework then retest" />
              <HeroMetric label="On bed now" value={summary.running} tone="grey" caption="schedule running" />
              <HeroMetric
                label="Mean margin restored"
                value={`${formatNumber(summary.meanRestorationPct, 1)}%`}
                tone={summary.meanRestorationPct >= 85 ? "green" : "amber"}
                caption="of new-engine EGT margin"
              />
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-sm bg-white/10 sm:grid-cols-2">
            <HeroPanelStat
              label="First-pass yield"
              value={`${formatNumber(summary.firstPassYieldPct, 1)}%`}
              caption="engines cleared on attempt 1"
            >
              <Sparkline points={summary.firstPassYieldHistory} status={yieldStatus} height={32} />
            </HeroPanelStat>
            <HeroPanelStat
              label="Retest rate"
              value={`${formatNumber(summary.retestRatePct, 1)}%`}
              caption={`${formatUsd(summary.retestCostUsd)} of bed time at ${formatUsd(TEST_CELL_RUN_COST_USD)} a run`}
            />
            <HeroPanelStat
              label="Mean EGT margin at test"
              value={`${formatNumber(summary.meanEgtMarginAtTestC, 1)}°C`}
              caption="across completed pass-offs"
            />
            <HeroPanelStat
              label="Mean run duration"
              value={`${summary.meanDurationMinutes} min`}
              caption={`${beds.length} facilities, ${beds.reduce((s, b) => s + b.cells, 0)} beds`}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile
          label="Passed"
          value={summary.passed}
          status="green"
          caption={`${formatNumber((summary.passed / Math.max(1, decided)) * 100, 1)}% of decided runs`}
        />
        <StatTile
          label="Conditional"
          value={summary.conditional}
          status="amber"
          caption="released only on concession"
        />
        <StatTile label="Failed" value={summary.failed} status={summary.failed > 0 ? "red" : "green"} caption="rework and retest required" />
        <StatTile label="Retests flown" value={Math.round((summary.retestRatePct / 100) * summary.runs)} status="amber" caption="attempt 2 or later" />
        <StatTile
          label="Engines tested"
          value={summary.engines}
          caption={`${formatNumber(summary.runs / Math.max(1, summary.engines), 2)} runs per engine`}
        />
        <StatTile
          label="Top failure cause"
          value={causes[0] ? `${formatNumber(causes[0].sharePct, 0)}%` : "—"}
          status={causes[0] ? "red" : "grey"}
          caption={causes[0]?.cause ?? "No findings"}
        />
      </div>

      <RunExplorer runs={explorerRuns} queueIds={queueIds} operatorNames={operatorNames} facilityNames={facilityNames} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <FailureCauses causes={causes} />
        <div className="space-y-4">
          <FamilyComparison families={families} />
          <BedUtilisation beds={beds} />
        </div>
      </div>

      <RunsTable runs={historyRows} operatorNames={operatorNames} facilityNames={facilityNames} />
    </div>
  );
}

function HeroMetric({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: ReactNode;
  caption: string;
  tone: "red" | "amber" | "green" | "grey";
}) {
  // Status hues are lightened for legibility on the near-black hero surface.
  const toneClass = {
    red: "text-[#ff8f98]",
    amber: "text-[#ffc978]",
    green: "text-white",
    grey: "text-rr-cloud",
  }[tone];
  return (
    <div>
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p className={`rr-numeric mt-1 text-4xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}

function HeroPanelStat({
  label,
  value,
  caption,
  children,
}: {
  label: string;
  value: string;
  caption: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-white/[0.06] p-4">
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p className="rr-numeric mt-1.5 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-rr-cloud">{caption}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
