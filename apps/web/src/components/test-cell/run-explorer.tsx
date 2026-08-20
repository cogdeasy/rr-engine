"use client";

import * as React from "react";
import Link from "next/link";
import type { TestCellOutcome, TestCellRun } from "@rr/types";
import {
  Badge,
  Button,
  FilterBar,
  FilterChip,
  Metric,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDateTime,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { AcceptanceChecklist } from "./acceptance-checklist";
import { MarginRestoration } from "./margin-restoration";
import { RunProfileChart } from "./run-profile-chart";
import { OUTCOME_LABEL, OUTCOME_STATUS } from "./outcome";

type OutcomeFilter = TestCellOutcome | "all";

const FILTERS: { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fail", label: "Fail" },
  { id: "conditional", label: "Conditional" },
  { id: "running", label: "On bed" },
  { id: "pass", label: "Pass" },
];

export function RunExplorer({
  runs,
  queueIds,
  operatorNames,
  facilityNames,
}: {
  runs: TestCellRun[];
  queueIds: string[];
  operatorNames: Record<string, string>;
  facilityNames: Record<string, string>;
}) {
  const queue = queueIds.map((id) => runs.find((r) => r.id === id)).filter((r): r is TestCellRun => Boolean(r));
  const [selectedId, setSelectedId] = React.useState<string>(queue[0]?.id ?? runs[0]?.id ?? "");
  const [filter, setFilter] = React.useState<OutcomeFilter>("all");
  const [query, setQuery] = React.useState("");

  const visible = runs.filter((run) => {
    if (filter !== "all" && run.outcome !== filter) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [run.reference, run.esn, run.family, operatorNames[run.operatorId] ?? ""].some((field) =>
      field.toLowerCase().includes(needle),
    );
  });

  const selected = runs.find((run) => run.id === selectedId) ?? visible[0] ?? runs[0];
  if (!selected) return null;

  return (
    <div className="space-y-4">
      {queue.length > 0 ? (
        <Panel padded={false}>
          <div className="px-5 pt-5">
            <PanelHeader
              title="Release decision queue"
              subtitle="Latest pass-off per engine that has not been released. Highest consequence first."
              actions={<Badge variant="brand">{queue.length} awaiting a decision</Badge>}
            />
          </div>
          <div className="grid gap-px overflow-hidden border-t border-rr-ink/8 bg-rr-ink/8 sm:grid-cols-2 xl:grid-cols-3">
            {queue.slice(0, 6).map((run) => (
              <QueueCard
                key={run.id}
                run={run}
                selected={run.id === selected.id}
                onSelect={() => setSelectedId(run.id)}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel padded={false} className="flex max-h-[900px] flex-col">
          <div className="space-y-3 border-b border-rr-ink/8 p-4">
            <PanelHeader title="Pass-off runs" subtitle={`${visible.length} of ${runs.length} runs`} className="pb-0" />
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, reference, operator" className="w-full" />
            <FilterBar>
              {FILTERS.map((option) => (
                <FilterChip
                  key={option.id}
                  label={option.label}
                  active={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  count={option.id === "all" ? runs.length : runs.filter((r) => r.outcome === option.id).length}
                />
              ))}
            </FilterBar>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-rr-ink/8 overflow-y-auto">
            {visible.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  aria-current={run.id === selected.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
                    run.id === selected.id ? "bg-rr-blue-50" : "hover:bg-rr-mist",
                  )}
                >
                  <span
                    className={cn("h-8 w-0.5 shrink-0 rounded-full", statusStyles[OUTCOME_STATUS[run.outcome]].dot)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="rr-numeric truncate text-sm font-semibold text-rr-ink">{run.esn}</span>
                      <span className="rr-numeric text-[11px] text-rr-slate">{run.reference}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-rr-slate">
                      <span className="truncate">
                        {run.family} · {operatorNames[run.operatorId] ?? run.operatorId}
                      </span>
                      <span className={cn("font-semibold", statusStyles[OUTCOME_STATUS[run.outcome]].text)}>
                        {OUTCOME_LABEL[run.outcome]}
                        {run.attempt > 1 ? ` · A${run.attempt}` : ""}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-rr-slate">No runs match the current filters.</li>
            ) : null}
          </ul>
        </Panel>

        <RunDetail run={selected} operatorName={operatorNames[selected.operatorId] ?? selected.operatorId} facilityName={facilityNames[selected.facilityId] ?? selected.facilityId} />
      </div>
    </div>
  );
}

function QueueCard({ run, selected, onSelect }: { run: TestCellRun; selected: boolean; onSelect: () => void }) {
  const status = OUTCOME_STATUS[run.outcome];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        "flex flex-col gap-3 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
        selected ? "bg-rr-blue-50" : "bg-white hover:bg-rr-mist",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{run.esn}</p>
          <p className="rr-label mt-0.5 text-rr-slate">
            {run.family} · {run.reference}
          </p>
        </div>
        <StatusPill status={status}>{OUTCOME_LABEL[run.outcome]}</StatusPill>
      </div>
      <p className="text-xs leading-relaxed text-rr-ink">
        {run.outcome === "running"
          ? `On bed ${run.cellId} — schedule in progress, no verdict yet.`
          : (run.failureCause ?? "Within limits")}
      </p>
      <div className="flex items-start justify-between gap-3 border-t border-rr-ink/8 pt-2.5">
        <span className="min-w-0">
          <span className="rr-label block text-rr-slate">Recommended</span>
          <span className="mt-0.5 block text-xs font-semibold leading-snug text-rr-blue">{run.recommendedAction}</span>
        </span>
        {run.reworkHours > 0 ? (
          <span className="rr-numeric shrink-0 text-[11px] text-rr-slate">{run.reworkHours}h rework</span>
        ) : null}
      </div>
    </button>
  );
}

function RunDetail({ run, operatorName, facilityName }: { run: TestCellRun; operatorName: string; facilityName: string }) {
  const status = OUTCOME_STATUS[run.outcome];
  const offenders = run.criteria.filter((c) => c.status === "red" || c.status === "amber");
  const thrustPct = (run.thrustAchievedLbf / run.thrustRequiredLbf) * 100;
  const vibLimit = run.criteria.find((c) => c.id === "vibN1")?.limit ?? 4;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="rr-numeric text-xl font-semibold text-rr-ink">{run.esn}</h2>
              <StatusPill status={status} size="md">
                {OUTCOME_LABEL[run.outcome]}
              </StatusPill>
              {run.attempt > 1 ? <Badge variant="outline">Attempt {run.attempt}</Badge> : null}
              {run.retestOf ? <Badge variant="neutral">Retest of {run.retestOf}</Badge> : null}
              {run.releasedToService ? <Badge variant="brand">Released</Badge> : null}
            </div>
            <p className="mt-1.5 text-xs text-rr-slate">
              {run.reference} · {run.family} {run.buildStandard} · {operatorName} · {facilityName} bed {run.cellId} ·{" "}
              {formatDateTime(run.startedAt)} · {run.durationMinutes} min · witnessed by {run.witnessedBy}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/engines/${run.engineId}`}>
              <Button variant="secondary" size="sm">
                Engine record
              </Button>
            </Link>
            {run.workOrderId ? (
              <Link href="/execute/work-orders">
                <Button variant="secondary" size="sm">
                  Work order {run.workOrderId}
                </Button>
              </Link>
            ) : null}
            <Button size="sm" variant={run.outcome === "pass" ? "primary" : run.outcome === "fail" ? "danger" : "primary"}>
              {run.outcome === "pass"
                ? "Release to service"
                : run.outcome === "fail"
                  ? "Raise rework card"
                  : run.outcome === "conditional"
                    ? "Review concession"
                    : "Monitor run"}
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex flex-wrap items-start gap-x-6 gap-y-2 border-l-2 p-3.5",
            status === "red" && "border-status-red bg-status-red-soft",
            status === "amber" && "border-status-amber bg-status-amber-soft",
            status === "green" && "border-status-green bg-status-green-soft",
            status === "grey" && "border-status-grey bg-status-grey-soft",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-sm font-semibold text-rr-ink">{run.recommendedAction}</p>
            <p className="mt-1 text-xs leading-relaxed text-rr-slate">
              {run.outcome === "running"
                ? "Schedule still running — parameters are provisional until the deceleration is complete."
                : offenders.length === 0
                  ? "Every acceptance criterion is inside its limit with margin to spare."
                  : `Driven by ${offenders
                      .map((c) => `${c.label} ${formatNumber(c.measured, 1)} ${c.unit} against a ${formatNumber(c.limit, 1)} ${c.unit} limit`)
                      .join("; ")}.`}
            </p>
          </div>
          {run.reworkHours > 0 ? (
            <Metric label="Rework" value={run.reworkHours} unit="h" hint={run.failureModule ? `Module ${run.failureModule}` : undefined} />
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-rr-ink/8 pt-5 md:grid-cols-3 xl:grid-cols-6">
          <Metric
            label="Thrust achieved"
            value={formatNumber(run.thrustAchievedLbf / 1000, 1)}
            unit="k lbf"
            status={thrustPct >= 100 ? "green" : thrustPct >= 99 ? "amber" : "red"}
            hint={`${formatNumber(thrustPct, 1)}% of rating`}
          />
          <Metric
            label="EGT margin at test"
            value={formatNumber(run.egtMarginAtTestC, 1)}
            unit="°C"
            status={run.criteria.find((c) => c.id === "egtMargin")?.status}
            hint={`pre-removal ${formatNumber(run.preRemovalEgtMarginC, 1)}°C`}
          />
          <Metric
            label="Peak vibration"
            value={formatNumber(run.peakVibrationMm, 2)}
            unit="mm/s"
            status={run.criteria.find((c) => c.id === "vibN1")?.status}
            hint={`limit ${formatNumber(vibLimit, 1)} mm/s`}
          />
          <Metric
            label="Fuel flow"
            value={formatNumber(run.fuelFlowKgH, 0)}
            unit="kg/h"
            status={run.criteria.find((c) => c.id === "fuelFlow")?.status}
            hint="at max climb"
          />
          <Metric
            label="Oil consumption"
            value={formatNumber(run.oilConsumptionLPerH, 2)}
            unit="l/h"
            status={run.criteria.find((c) => c.id === "oilConsumption")?.status}
            hint="over the run"
          />
          <Metric
            label="Criteria clear"
            value={`${run.criteria.filter((c) => c.status === "green").length}/${run.criteria.length}`}
            status={offenders.length === 0 ? "green" : offenders.some((c) => c.status === "red") ? "red" : "amber"}
            hint={offenders.length === 0 ? "no exceedances" : `${offenders.length} outside nominal`}
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Acceleration / deceleration profile"
            subtitle="Slam schedule with the certified EGT redline and the accel and decel measurement windows."
          />
          <RunProfileChart profile={run.profile} peakVibrationMm={run.peakVibrationMm} vibrationLimitMm={vibLimit} />
        </Panel>
        <Panel>
          <PanelHeader title="Margin restoration" subtitle="Test-cell margin against the margin lost on wing." />
          <MarginRestoration
            preRemovalC={run.preRemovalEgtMarginC}
            atTestC={run.egtMarginAtTestC}
            newEngineC={run.newEngineEgtMarginC}
            restorationPct={run.restorationPct}
          />
          {run.observations.length > 0 ? (
            <div className="mt-5 border-t border-rr-ink/8 pt-4">
              <p className="rr-label text-rr-slate">Cell observations</p>
              <ul className="mt-2 space-y-1.5">
                {run.observations.map((observation) => (
                  <li key={observation} className="flex gap-2 text-xs leading-relaxed text-rr-slate">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rr-slate/60" aria-hidden />
                    {observation}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Acceptance checklist"
          subtitle={`${run.criteria.filter((c) => c.status === "green").length} of ${run.criteria.length} criteria inside limits for build standard ${run.buildStandard}.`}
          actions={<StatusPill status={status}>{OUTCOME_LABEL[run.outcome]}</StatusPill>}
        />
        <AcceptanceChecklist criteria={run.criteria} />
      </Panel>
    </div>
  );
}
