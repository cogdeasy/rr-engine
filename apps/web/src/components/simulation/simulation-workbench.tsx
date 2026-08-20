"use client";

import * as React from "react";
import type {
  SavedScenario,
  ScenarioRecommendation,
  SimulationBaseline,
  SimulationDelta,
  SimulationLevers,
  SimulationOutcome,
} from "@rr/types";
import { NOW, WORKSCOPE_LEVELS, addDays, compareScenario, iso, normaliseLevers, sensitivity, simulate } from "@rr/data";
import {
  Badge,
  Button,
  CostStack,
  DataTable,
  Gauge,
  Panel,
  PanelHeader,
  ScenarioProjectionChart,
  SensitivityBars,
  StatTile,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { LeverControls } from "./lever-controls";

/**
 * Client-side what-if workbench. Every number on screen comes from the pure
 * model in `@rr/data`, re-run synchronously as the levers move, so the page is
 * reproducible: the same lever positions always give the same answer.
 */

function removalDate(baseline: SimulationBaseline, onWingCycles: number): string {
  const days = Math.round((onWingCycles / baseline.cyclesPerYear) * 365);
  return formatDate(iso(addDays(NOW, days)));
}

function signed(value: number, decimals: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value, decimals)}`;
}

function formatDeltaValue(delta: SimulationDelta): string {
  if (delta.unit === "USD" || delta.unit === "USD/cyc") {
    return `${delta.delta > 0 ? "+" : "−"}${formatUsd(Math.abs(delta.delta))}`;
  }
  return `${signed(delta.delta, delta.decimals)} ${delta.unit}`;
}

function formatValue(value: number, unit: string, decimals: number): string {
  if (unit === "USD" || unit === "USD/cyc") return formatUsd(value);
  if (unit === "%") return `${formatNumber(value, decimals)}%`;
  return `${formatNumber(value, decimals)} ${unit}`;
}

export function SimulationWorkbench({
  baseline,
  recommendation,
}: {
  baseline: SimulationBaseline;
  recommendation: ScenarioRecommendation;
}) {
  const [levers, setLevers] = React.useState<SimulationLevers>(baseline.levers);
  const [saved, setSaved] = React.useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = React.useState("");

  // A different engine means a different baseline: start from how it flies today.
  React.useEffect(() => {
    setLevers(baseline.levers);
    setSaved([]);
    setScenarioName("");
  }, [baseline]);

  const baselineOutcome = React.useMemo<SimulationOutcome>(() => simulate(baseline, baseline.levers), [baseline]);
  const outcome = React.useMemo<SimulationOutcome>(() => simulate(baseline, levers), [baseline, levers]);
  const deltas = React.useMemo(
    () => compareScenario(baseline, levers, baselineOutcome, outcome),
    [baseline, levers, baselineOutcome, outcome],
  );
  const levers_ = React.useMemo(() => normaliseLevers(baseline, levers), [baseline, levers]);
  const sensitivities = React.useMemo(() => sensitivity(baseline, levers_), [baseline, levers_]);

  const dirty = JSON.stringify(levers_) !== JSON.stringify(normaliseLevers(baseline, baseline.levers));
  const costDelta = outcome.totalCostUsd - baselineOutcome.totalCostUsd;
  const cyclesDelta = outcome.onWingCycles - baselineOutcome.onWingCycles;
  const deltaByKey = Object.fromEntries(deltas.map((d) => [d.key, d]));

  function saveScenario() {
    const name = scenarioName.trim() || `Scenario ${saved.length + 1}`;
    setSaved((current) => [
      ...current,
      { id: `${name}-${current.length}-${JSON.stringify(levers_)}`, name, levers: levers_ },
    ]);
    setScenarioName("");
  }

  const headlineTiles = [
    {
      key: "onWingCycles",
      label: "On-wing cycles",
      value: formatNumber(outcome.onWingCycles),
      unit: "cyc",
      status: deltaByKey.onWingCycles!.status,
      caption: `${formatNumber(outcome.onWingMonths, 1)} months to removal`,
    },
    {
      key: "egtMarginAtRemoval",
      label: "EGT margin at removal",
      value: formatNumber(outcome.egtMarginAtRemoval, 1),
      unit: "°C",
      status: outcome.marginStatus,
      caption: `Removal limit ${baseline.minimumEgtMargin} °C`,
    },
    {
      key: "costPerCycleUsd",
      label: "Cost per cycle",
      value: formatUsd(outcome.costPerCycleUsd),
      unit: undefined,
      status: deltaByKey.costPerCycleUsd!.status,
      caption: `${formatUsd(outcome.totalCostUsd)} across the interval`,
    },
    {
      key: "unscheduledRemovalRisk",
      label: "Unscheduled removal risk",
      value: (outcome.unscheduledRemovalRisk * 100).toFixed(1),
      unit: "%",
      status: outcome.riskStatus,
      caption: "Chance of coming off before plan",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Decision bar */}
      <Panel className={cn("border-l-2", dirty ? "border-l-rr-blue" : "border-l-status-grey")}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue">{dirty ? "Scenario versus as-flown profile" : "As-flown profile"}</p>
            <p className="mt-1.5 text-lg font-semibold leading-snug text-rr-ink">
              {dirty
                ? `${costDelta <= 0 ? "Saves" : "Costs"} ${formatUsd(Math.abs(costDelta))} over the interval and ${
                    cyclesDelta >= 0 ? "adds" : "gives up"
                  } ${formatNumber(Math.abs(cyclesDelta))} on-wing cycles.`
                : "Move a lever to model a change to this engine's operating profile."}
            </p>
            <p className="mt-1 text-xs text-rr-slate">
              Removal {removalDate(baseline, outcome.onWingCycles)} · {formatNumber(outcome.onWingMonths, 1)} months on
              wing · {WORKSCOPE_LEVELS.find((w) => w.id === levers_.workscope)?.label} workscope
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={outcome.marginStatus}>Margin {outcome.egtMarginAtRemoval} °C</StatusPill>
            <StatusPill status={outcome.riskStatus}>Risk {(outcome.unscheduledRemovalRisk * 100).toFixed(1)}%</StatusPill>
            <StatusPill status={outcome.availabilityStatus}>Availability {outcome.availabilityPct}%</StatusPill>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,340px)_1fr]">
        {/* Levers + recommendation + saved scenarios */}
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Operating profile levers" subtitle="Adjust and the twin re-runs immediately" />
            <LeverControls
              baseline={baseline}
              levers={levers}
              onChange={setLevers}
              onReset={() => setLevers(baseline.levers)}
              onApplyRecommendation={() => setLevers(recommendation.levers)}
              removalDateLabel={removalDate(baseline, outcome.onWingCycles)}
            />
          </Panel>

          <Panel className="border-l-2 border-l-rr-blue bg-rr-blue-50/50">
            <PanelHeader title="Recommended action" subtitle="Cheapest compliant profile found by sweeping the lever grid" />
            <p className="rr-numeric text-xl font-semibold text-rr-blue">{recommendation.headline}</p>
            <ul className="mt-3 space-y-2">
              {recommendation.rationale.map((line) => (
                <li key={line} className="flex gap-2 text-[12px] leading-snug text-rr-ink">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rr-blue" />
                  {line}
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-rr-ink/8 pt-3 text-center">
              <div>
                <dt className="rr-label text-rr-slate">Saving</dt>
                <dd className="rr-numeric text-sm font-semibold text-rr-ink">{formatUsd(recommendation.savingUsd)}</dd>
              </div>
              <div>
                <dt className="rr-label text-rr-slate">Cycles</dt>
                <dd className="rr-numeric text-sm font-semibold text-rr-ink">{signed(recommendation.cyclesGained, 0)}</dd>
              </div>
              <div>
                <dt className="rr-label text-rr-slate">Risk</dt>
                <dd
                  className={cn(
                    "rr-numeric text-sm font-semibold",
                    recommendation.riskDelta <= 0 ? "text-status-green" : "text-status-red",
                  )}
                >
                  {signed(recommendation.riskDelta * 100, 1)} pts
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <PanelHeader title="Saved scenarios" subtitle="Kept in this browser session for side-by-side comparison" />
            <div className="flex gap-2">
              <label htmlFor="scenario-name" className="sr-only">
                Scenario name
              </label>
              <input
                id="scenario-name"
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveScenario();
                }}
                placeholder="Name this scenario"
                className="w-full rounded-full border border-rr-ink/12 px-3 py-1.5 text-xs text-rr-ink outline-none placeholder:text-rr-slate/70 focus:border-rr-blue focus:ring-2 focus:ring-rr-blue/20"
              />
              <Button type="button" size="sm" variant="secondary" onClick={saveScenario}>
                Save
              </Button>
            </div>
            {saved.length === 0 ? (
              <p className="mt-3 text-[11px] text-rr-slate">
                No saved scenarios yet. Save the current lever set to compare options before committing a plan.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {saved.map((scenario) => {
                  const scenarioOutcome = simulate(baseline, scenario.levers);
                  const saving = baselineOutcome.totalCostUsd - scenarioOutcome.totalCostUsd;
                  return (
                    <li
                      key={scenario.id}
                      className="flex items-center justify-between gap-3 rounded-sm border border-rr-ink/8 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => setLevers(scenario.levers)}
                        className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-rr-blue"
                      >
                        <p className="truncate text-[13px] font-medium text-rr-ink hover:text-rr-blue">{scenario.name}</p>
                        <p className="rr-numeric text-[11px] text-rr-slate">
                          {scenario.levers.deratePct}% derate · sev {scenario.levers.routeSeverity.toFixed(1)} ·{" "}
                          {scenario.levers.washIntervalDays === 0 ? "no wash" : `${scenario.levers.washIntervalDays}d wash`} ·{" "}
                          {signed(scenario.levers.removalOffsetCycles, 0)} cyc
                        </p>
                      </button>
                      <span
                        className={cn(
                          "rr-numeric shrink-0 text-[12px] font-semibold",
                          saving >= 0 ? "text-status-green" : "text-status-red",
                        )}
                      >
                        {saving >= 0 ? "−" : "+"}
                        {formatUsd(Math.abs(saving))}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove scenario ${scenario.name}`}
                        onClick={() => setSaved((current) => current.filter((s) => s.id !== scenario.id))}
                        className="shrink-0 rounded-full px-1.5 text-rr-slate hover:text-status-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-rr-blue"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Outcome */}
        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {headlineTiles.map((tile) => {
              const delta = deltaByKey[tile.key]!;
              return (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  unit={tile.unit}
                  status={tile.status}
                  caption={
                    <span className="flex flex-col gap-0.5">
                      <span className={cn("rr-numeric font-semibold", statusStyles[delta.status].text)}>
                        {formatDeltaValue(delta)} vs as-flown
                      </span>
                      <span>{tile.caption}</span>
                    </span>
                  }
                />
              );
            })}
          </section>

          <Panel>
            <PanelHeader
              title="EGT margin to removal"
              subtitle="Scenario against the as-flown profile, with the 8 °C removal limit"
              actions={
                <Badge variant={outcome.marginStatus === "red" ? "outline" : "neutral"}>
                  {outcome.decayPerThousandCycles} °C per 1,000 cycles
                </Badge>
              }
            />
            <ScenarioProjectionChart
              baseline={baselineOutcome.marginProjection}
              scenario={outcome.marginProjection}
              limit={baseline.minimumEgtMargin}
            />
            {outcome.marginStatus === "red" ? (
              <p className="mt-3 rounded-sm bg-status-red-soft px-3 py-2 text-[12px] text-status-red">
                Red: this profile runs the engine past the {baseline.minimumEgtMargin} °C removal limit before the modelled
                removal. Pull the removal forward, raise derate or shorten the wash interval.
              </p>
            ) : null}
          </Panel>

          <div className="grid gap-5 2xl:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Lever sensitivity"
                subtitle="Cost swing across each lever's full range, other levers held at the current scenario"
              />
              <SensitivityBars
                items={sensitivities.map((entry) => ({
                  id: entry.lever,
                  label: entry.label,
                  value: entry.costSwingUsd,
                  share: entry.share,
                  lowSetting: entry.lowSetting,
                  highSetting: entry.highSetting,
                  caption:
                    entry.cycleSwing > 0
                      ? `${formatNumber(entry.cycleSwing)} cyc · ${entry.marginSwing} °C margin`
                      : `${entry.marginSwing} °C margin`,
                }))}
                formatValue={(value) => formatUsd(value)}
              />
            </Panel>

            <Panel>
              <PanelHeader
                title="Where the money goes"
                subtitle={`${formatUsd(outcome.totalCostUsd)} across ${formatNumber(outcome.onWingCycles)} cycles`}
              />
              <CostStack
                segments={[
                  { id: "shop", label: "Shop visit", value: outcome.shopVisitCostUsd },
                  { id: "fuel", label: "Fuel penalty", value: outcome.fuelPenaltyCostUsd },
                  { id: "disruption", label: "Risk-weighted disruption", value: outcome.disruptionCostUsd },
                  { id: "life", label: "Wasted certified life", value: outcome.lifeWasteCostUsd },
                  { id: "wash", label: "Wash programme", value: outcome.washProgrammeCostUsd },
                ]}
                formatValue={(value) => formatUsd(value)}
              />
              <div className="mt-5 flex items-center gap-5 border-t border-rr-ink/8 pt-4">
                <Gauge
                  value={Math.round(outcome.unscheduledRemovalRisk * 100)}
                  status={outcome.riskStatus}
                  label="removal risk"
                  size={116}
                />
                <p className="text-[12px] leading-relaxed text-rr-slate">
                  Disruption cost is the risk-weighted price of an unscheduled removal on this contract:{" "}
                  <span className="rr-numeric font-semibold text-rr-ink">
                    {(outcome.unscheduledRemovalRisk * 100).toFixed(1)}%
                  </span>{" "}
                  probability against AOG recovery, lease cover and liquidated damages at{" "}
                  <span className="rr-numeric font-semibold text-rr-ink">${baseline.ratePerEfhUsd}/EFH</span>.
                </p>
              </div>
            </Panel>
          </div>

          <div>
            <PanelHeader
              title="Baseline versus scenario"
              subtitle="Every modelled output, with the delta an operator is trading"
              className="mb-3"
            />
            <DataTable
              rows={deltas}
              rowKey={(row) => row.key}
              rowAccent={(row) => (row.status === "grey" ? undefined : statusStyles[row.status].dot.replace("bg-", "border-"))}
              columns={[
                {
                  key: "label",
                  header: "Measure",
                  render: (row) => (
                    <div>
                      <p className="text-[13px] font-medium text-rr-ink">{row.label}</p>
                      <p className="text-[11px] text-rr-slate">{row.note}</p>
                    </div>
                  ),
                },
                {
                  key: "baseline",
                  header: "As flown",
                  align: "right",
                  render: (row) => (
                    <span className="rr-numeric text-rr-slate">{formatValue(row.baseline, row.unit, row.decimals)}</span>
                  ),
                },
                {
                  key: "scenario",
                  header: "Scenario",
                  align: "right",
                  render: (row) => (
                    <span className="rr-numeric font-semibold text-rr-ink">
                      {formatValue(row.scenario, row.unit, row.decimals)}
                    </span>
                  ),
                },
                {
                  key: "delta",
                  header: "Delta",
                  align: "right",
                  sortValue: (row) => Math.abs(row.deltaPct),
                  render: (row) => (
                    <span className={cn("rr-numeric font-semibold", statusStyles[row.status].text)}>
                      {formatDeltaValue(row)}
                      <span className="ml-2 text-[11px] font-normal">
                        {row.deltaPct > 0 ? "+" : ""}
                        {row.deltaPct}%
                      </span>
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
