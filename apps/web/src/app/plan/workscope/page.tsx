import { buildEngineWorkscope, workscopeQueue, workscopeQueueSummary } from "@rr/data";
import { Panel, StatTile, StatusPill, cn, formatDate, formatNumber, formatUsd } from "@rr/ui";
import { ScenarioWorkspace } from "@/components/workscope/scenario-workspace";
import { WorkscopeQueue } from "@/components/workscope/workscope-queue";

export const metadata = { title: "Shop visit workscoping" };

const QUEUE_SIZE = 14;

export default async function WorkscopePage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  const { engine } = await searchParams;
  const candidates = workscopeQueue(QUEUE_SIZE);
  const summary = workscopeQueueSummary(QUEUE_SIZE);
  const selectedId = candidates.some((c) => c.engineId === engine) ? engine! : candidates[0]!.engineId;
  const workscope = buildEngineWorkscope(selectedId)!;
  const recommended = workscope.scenarios.find((s) => s.id === workscope.recommendedScenarioId)!;

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Plan · Shop visit workscoping</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              Which modules do we open, and what does that cost in TAT?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {summary.candidates} engines are awaiting a workscope decision, {summary.urgent} of them inside 400 cycles of
              removal. The recommended workscopes commit {formatUsd(summary.committedCostUsd)} and {summary.averageTatDays}{" "}
              days of average turn-time, returning {summary.marginRestoredC}°C of EGT margin per engine.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <HeroStat label="Act now" value={String(summary.urgent)} caption="inside 400 cycles" tone="red" />
            <HeroStat label="Committed cost" value={formatUsd(summary.committedCostUsd)} caption="recommended workscopes" />
            <HeroStat label="Average TAT" value={`${summary.averageTatDays}d`} caption="induction to pass-off" />
            <HeroStat
              label="Deferred spend"
              value={formatUsd(summary.deferralSavingsUsd)}
              caption="vs full overhaul on every engine"
              tone="green"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Modules to open"
          value={summary.modulesToOpen}
          status="amber"
          caption={`Across ${summary.candidates} queued engines`}
        />
        <StatTile
          label="LLPs to replace"
          value={summary.llpsToReplace}
          status={summary.llpsToReplace > 0 ? "amber" : "green"}
          caption="Included in the recommended build-ups"
        />
        <StatTile
          label="Margin restored"
          value={summary.marginRestoredC}
          unit="°C"
          status="green"
          caption="Average EGT margin returned per engine"
        />
        <StatTile
          label="Selected engine"
          value={workscope.esn}
          status={workscope.urgency}
          caption={`${workscope.family} · ${workscope.operatorCode} · ${formatNumber(workscope.removalWithinCycles)} cycles to removal`}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-1">
          <WorkscopeQueue candidates={candidates} selectedEngineId={selectedId} />
        </div>

        <div className="space-y-5 xl:col-span-3">
          <Panel
            className={cn(
              "border-l-2",
              workscope.urgency === "red"
                ? "border-l-status-red"
                : workscope.urgency === "amber"
                  ? "border-l-status-amber"
                  : "border-l-status-green",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="rr-numeric text-2xl font-semibold text-rr-ink">{workscope.esn}</h2>
                  <StatusPill status={workscope.status}>Health {workscope.healthScore}</StatusPill>
                  <StatusPill status={workscope.urgency}>
                    {formatNumber(workscope.removalWithinCycles)} cycles to removal
                  </StatusPill>
                </div>
                <p className="mt-1.5 text-xs text-rr-slate">
                  {workscope.family} · {workscope.buildStandard} · {workscope.operatorName} ({workscope.operatorCode}) ·{" "}
                  {workscope.aircraftTail ?? "off wing"} · {workscope.location}
                </p>
                <p className="mt-2 text-[13px] text-rr-ink">
                  <span className="rr-label mr-2 text-rr-slate">Removal driver</span>
                  {workscope.removalReason} — due by {formatDate(workscope.removalBy)}.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                <EngineFact
                  label="EGT margin"
                  value={`${workscope.egtMarginC}°C`}
                  caption={`of ${workscope.newEgtMarginC}°C new`}
                  status={workscope.egtMarginC < 12 ? "red" : workscope.egtMarginC < 25 ? "amber" : "green"}
                />
                <EngineFact
                  label="Cycles since OH"
                  value={formatNumber(workscope.cyclesSinceOverhaul)}
                  caption={`of ${formatNumber(workscope.overhaulIntervalCycles)} interval`}
                />
                <EngineFact
                  label="Open alerts"
                  value={String(workscope.openAlerts)}
                  caption="feeding the severity index"
                  status={workscope.openAlerts > 2 ? "amber" : "green"}
                />
                <EngineFact
                  label="Environment"
                  value={`${workscope.environmentSeverity}/5`}
                  caption={`${workscope.cyclesPerDay} cycles/day`}
                  status={workscope.environmentSeverity >= 4 ? "amber" : "green"}
                />
              </dl>
            </div>
          </Panel>

          <ScenarioWorkspace workscope={workscope} />

          <p className="text-[11px] leading-relaxed text-rr-slate">
            Assumptions: labour is charged at ${formatNumber(118)}/hour, benches run in parallel with a queueing penalty,
            and induction adds 18 fixed days for strip, build and pass-off. The recommended scenario is the lowest cost per
            on-wing cycle that still buys at least 55% of the family overhaul interval — for {workscope.esn} that is{" "}
            {recommended.label.toLowerCase()}.
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "red" | "green";
}) {
  const colour = { neutral: "text-white", red: "text-status-red", green: "text-status-green" }[tone];
  return (
    <div>
      <p className="rr-label text-rr-cloud/70">{label}</p>
      <p className={cn("rr-numeric mt-1 text-3xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function EngineFact({
  label,
  value,
  caption,
  status,
}: {
  label: string;
  value: string;
  caption: string;
  status?: "red" | "amber" | "green";
}) {
  const colour = status ? { red: "text-status-red", amber: "text-status-amber", green: "text-rr-ink" }[status] : "text-rr-ink";
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric mt-1 text-xl font-semibold", colour)}>{value}</dd>
      <dd className="text-[11px] text-rr-slate">{caption}</dd>
    </div>
  );
}
