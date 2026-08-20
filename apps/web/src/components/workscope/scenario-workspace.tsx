"use client";

import * as React from "react";
import type { EngineWorkscope, WorkscopeLevel, WorkscopeModuleLine, WorkscopeScenario } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  Panel,
  PanelHeader,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

const LEVEL_LABEL: Record<WorkscopeLevel, string> = {
  inspect: "Inspect",
  repair: "Repair",
  restore: "Restore",
  replace: "Replace",
};

/** Level is a workscope depth, not an alarm: only "replace" is an act-now cost. */
function levelClasses(level: WorkscopeLevel): string {
  return {
    inspect: "border-rr-ink/12 bg-surface text-rr-slate",
    repair: "border-rr-blue/20 bg-rr-blue-50 text-rr-blue",
    restore: "border-status-amber/30 bg-status-amber-soft text-status-amber",
    replace: "border-status-red/30 bg-status-red-soft text-status-red",
  }[level];
}

function LevelPill({ level, muted = false }: { level: WorkscopeLevel; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        muted ? "border-rr-ink/10 bg-transparent text-rr-slate" : levelClasses(level),
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

function severityStatus(index: number) {
  return index >= 78 ? "red" : index >= 58 ? "amber" : index >= 36 ? "green" : "grey";
}

function SeverityBar({ index }: { index: number }) {
  const status = severityStatus(index);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("h-full rounded-full", statusStyles[status].dot)} style={{ width: `${Math.max(2, index)}%` }} />
      </div>
      <span className={cn("rr-numeric text-[11px] font-semibold", statusStyles[status].text)}>{index}</span>
    </div>
  );
}

export function ScenarioWorkspace({ workscope }: { workscope: EngineWorkscope }) {
  const [scenarioId, setScenarioId] = React.useState(workscope.recommendedScenarioId);
  const [moduleCode, setModuleCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    setScenarioId(workscope.recommendedScenarioId);
    setModuleCode(null);
  }, [workscope.engineId, workscope.recommendedScenarioId]);

  const scenario = workscope.scenarios.find((s) => s.id === scenarioId) ?? workscope.scenarios[0]!;
  const recommended = workscope.scenarios.find((s) => s.id === workscope.recommendedScenarioId)!;
  const worstModule = scenario.modules.reduce<WorkscopeModuleLine | null>(
    (worst, m) => (worst === null || m.severityIndex > worst.severityIndex ? m : worst),
    null,
  );
  const selectedModule = scenario.modules.find((m) => m.code === moduleCode) ?? worstModule;

  return (
    <div className="space-y-5">
      <ScenarioCompare
        scenarios={workscope.scenarios}
        activeId={scenario.id}
        recommendedId={workscope.recommendedScenarioId}
        onSelect={setScenarioId}
        currentMarginC={workscope.egtMarginC}
        newMarginC={workscope.newEgtMarginC}
      />

      <RecommendedAction workscope={workscope} scenario={scenario} recommended={recommended} />

      <ModuleBuildUp scenario={scenario} onSelect={(m) => setModuleCode(m.code)} selectedCode={selectedModule?.code ?? null} />

      <div className="grid gap-5 xl:grid-cols-5">
        <ModuleEvidence module={selectedModule} className="xl:col-span-2" />
        <LlpPlan scenario={scenario} className="xl:col-span-3" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ScenarioCompare({
  scenarios,
  activeId,
  recommendedId,
  onSelect,
  currentMarginC,
  newMarginC,
}: {
  scenarios: WorkscopeScenario[];
  activeId: string;
  recommendedId: string;
  onSelect: (id: WorkscopeScenario["id"]) => void;
  currentMarginC: number;
  newMarginC: number;
}) {
  const maxCost = Math.max(...scenarios.map((s) => s.costUsd));
  return (
    <section aria-label="Scenario comparison" className="grid gap-4 xl:grid-cols-3">
      {scenarios.map((scenario) => {
        const active = scenario.id === activeId;
        const isRecommended = scenario.id === recommendedId;
        const marginPct = Math.max(0, Math.min(100, (scenario.projectedEgtMarginC / Math.max(1, newMarginC)) * 100));
        const currentPct = Math.max(0, Math.min(100, (currentMarginC / Math.max(1, newMarginC)) * 100));
        return (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(scenario.id)}
            className={cn(
              "rr-panel flex flex-col gap-4 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
              active ? "border-rr-blue ring-1 ring-rr-blue" : "hover:border-rr-blue/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="rr-label text-rr-slate">Scenario</p>
                <p className="mt-1 text-sm font-semibold text-rr-ink">{scenario.label}</p>
              </div>
              {isRecommended ? <Badge variant="brand">Recommended</Badge> : null}
            </div>

            <p className="text-[11px] leading-relaxed text-rr-slate">{scenario.intent}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="rr-label text-rr-slate">Cost</p>
                <p className="rr-numeric text-2xl font-semibold text-rr-ink">{formatUsd(scenario.costUsd)}</p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">TAT</p>
                <p className="rr-numeric text-2xl font-semibold text-rr-ink">
                  {scenario.tatDays}
                  <span className="ml-1 text-sm font-medium text-rr-slate">days</span>
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="rr-label text-rr-slate">EGT margin restored</p>
                <p className="rr-numeric text-[11px] text-rr-slate">
                  {currentMarginC}°C → <span className="font-semibold text-rr-ink">{scenario.projectedEgtMarginC}°C</span>
                </p>
              </div>
              <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rr-mist">
                <div className="absolute inset-y-0 left-0 bg-rr-blue/25" style={{ width: `${marginPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-rr-blue" style={{ width: `${currentPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-rr-slate">
                +{scenario.egtMarginRestoredC}°C of {newMarginC}°C new-engine margin
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-rr-ink/8 pt-3 text-[11px]">
              <div>
                <dt className="rr-label text-rr-slate">Next removal</dt>
                <dd className="rr-numeric text-rr-ink">{formatNumber(scenario.nextRemovalCycles)} cycles</dd>
                <dd className="text-rr-slate">{formatDate(scenario.nextRemovalAt)}</dd>
              </div>
              <div>
                <dt className="rr-label text-rr-slate">Cost / on-wing cycle</dt>
                <dd className="rr-numeric text-rr-ink">${formatNumber(scenario.costPerOnWingCycleUsd)}</dd>
                <dd className="text-rr-slate">
                  {scenario.modulesOpened} modules · {scenario.llps.length} LLPs
                </dd>
              </div>
            </dl>

            <div className="h-1 w-full overflow-hidden rounded-full bg-rr-mist" aria-hidden>
              <div className="h-full bg-rr-ink/25" style={{ width: `${(scenario.costUsd / maxCost) * 100}%` }} />
            </div>
          </button>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function RecommendedAction({
  workscope,
  scenario,
  recommended,
}: {
  workscope: EngineWorkscope;
  scenario: WorkscopeScenario;
  recommended: WorkscopeScenario;
}) {
  const isRecommended = scenario.id === recommended.id;
  const costDelta = scenario.costUsd - recommended.costUsd;
  const cycleDelta = scenario.nextRemovalCycles - recommended.nextRemovalCycles;

  return (
    <Panel className="border-l-2 border-l-rr-blue">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="rr-label text-rr-blue">Recommended action</p>
          <p className="mt-1.5 text-sm font-semibold text-rr-ink">
            {isRecommended
              ? `Release ${recommended.label.toLowerCase()} workscope for ${workscope.esn} — ${formatUsd(recommended.costUsd)}, ${recommended.tatDays} days, back on wing to ${formatDate(recommended.nextRemovalAt)}.`
              : `Reviewing ${scenario.label.toLowerCase()}: ${costDelta >= 0 ? "+" : "−"}${formatUsd(Math.abs(costDelta))} and ${cycleDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(cycleDelta))} on-wing cycles against the recommended ${recommended.label.toLowerCase()}.`}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-rr-slate">{workscope.recommendationRationale}</p>
          <ul className="mt-3 space-y-1">
            {scenario.risks.map((risk) => (
              <li key={risk} className="flex gap-2 text-[11px] text-rr-slate">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-amber" aria-hidden />
                {risk}
              </li>
            ))}
            <li className="flex gap-2 text-[11px] text-rr-slate">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rr-slate/50" aria-hidden />
              Next removal is {scenario.nextRemovalLimiter === "llp" ? "LLP-limited" : "performance-limited"} at{" "}
              {formatNumber(scenario.nextRemovalCycles)} cycles.
            </li>
          </ul>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <Button>Release workscope to shop</Button>
          <Button variant="secondary">Send to customer for approval</Button>
          <Button variant="ghost" size="sm">
            Export build-up (CSV)
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function ModuleBuildUp({
  scenario,
  selectedCode,
  onSelect,
}: {
  scenario: WorkscopeScenario;
  selectedCode: string | null;
  onSelect: (module: WorkscopeModuleLine) => void;
}) {
  const columns: Column<WorkscopeModuleLine>[] = [
    {
      key: "module",
      header: "Module",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <p className={cn("text-[13px] font-semibold", selectedCode === row.code ? "text-rr-blue" : "text-rr-ink")}>{row.label}</p>
          <p className="text-[11px] text-rr-slate">
            {row.code} · ATA {row.ataChapter}
          </p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Condition severity",
      sortValue: (row) => row.severityIndex,
      render: (row) => <SeverityBar index={row.severityIndex} />,
    },
    {
      key: "life",
      header: "Life used",
      align: "right",
      sortValue: (row) => row.lifeConsumedPct,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-slate">{row.lifeConsumedPct}%</span>,
    },
    {
      key: "level",
      header: "Workscope level",
      sortValue: (row) => row.severityIndex,
      render: (row) => (
        <div className="flex items-center gap-2">
          <LevelPill level={row.level} />
          {row.level !== row.recommendedLevel ? (
            <span className="text-[11px] text-rr-slate">
              evidence: <LevelPill level={row.recommendedLevel} muted />
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "hours",
      header: "Labour",
      align: "right",
      sortValue: (row) => row.labourHours,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-slate">{formatNumber(row.labourHours)} h</span>,
    },
    {
      key: "material",
      header: "Material",
      align: "right",
      sortValue: (row) => row.materialUsd,
      render: (row) => <span className="rr-numeric text-[13px] text-rr-slate">{formatUsd(row.materialUsd)}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      sortValue: (row) => row.costUsd,
      render: (row) => <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{formatUsd(row.costUsd)}</span>,
    },
    {
      key: "tat",
      header: "Bench days",
      align: "right",
      sortValue: (row) => row.shopDays,
      render: (row) => (
        <span className="rr-numeric text-[13px] text-rr-slate">{row.level === "inspect" ? "—" : `${row.shopDays}d`}</span>
      ),
    },
    {
      key: "margin",
      header: "Margin back",
      align: "right",
      sortValue: (row) => row.egtMarginRestoredC,
      render: (row) => (
        <span className={cn("rr-numeric text-[13px] font-semibold", row.egtMarginRestoredC >= 5 ? "text-rr-ink" : "text-rr-slate")}>
          +{row.egtMarginRestoredC}°C
        </span>
      ),
    },
    {
      key: "llp",
      header: "LLPs",
      align: "right",
      sortValue: (row) => row.llps.length,
      render: (row) =>
        row.llps.length > 0 ? (
          <StatusPill status={row.llps.some((l) => l.mandatory) ? "red" : "amber"}>{row.llps.length}</StatusPill>
        ) : (
          <span className="text-[11px] text-rr-slate">—</span>
        ),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-rr-ink">Workscope build-up — {scenario.label}</h2>
          <p className="mt-0.5 text-xs text-rr-slate">
            Select a module to see the evidence behind its level. Severity combines module life, prognostics, open alerts
            and LLP expiry.
          </p>
        </div>
        <dl className="flex flex-wrap items-end gap-6">
          <Total label="Labour" value={formatUsd(scenario.labourUsd)} caption={`${formatNumber(scenario.labourHours)} hours`} />
          <Total label="Material" value={formatUsd(scenario.materialUsd)} caption={`${scenario.llps.length} LLPs included`} />
          <Total label="Total" value={formatUsd(scenario.costUsd)} caption={`${scenario.tatDays} days TAT`} emphasis />
        </dl>
      </div>
      <DataTable
        columns={columns}
        rows={scenario.modules}
        rowKey={(row) => row.code}
        onRowClick={onSelect}
        initialSortKey="cost"
        rowAccent={(row) =>
          row.level === "replace"
            ? "border-status-red"
            : row.level === "restore"
              ? "border-status-amber"
              : row.level === "repair"
                ? "border-rr-blue/40"
                : "border-transparent"
        }
        dense
      />
    </section>
  );
}

function Total({ label, value, caption, emphasis }: { label: string; value: string; caption: string; emphasis?: boolean }) {
  return (
    <div className="text-right">
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric font-semibold text-rr-ink", emphasis ? "text-2xl" : "text-lg")}>{value}</dd>
      <dd className="text-[11px] text-rr-slate">{caption}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ModuleEvidence({ module, className }: { module: WorkscopeModuleLine | null; className?: string }) {
  if (!module) {
    return (
      <Panel className={cn("flex flex-col justify-center", className)}>
        <PanelHeader title="Module evidence" subtitle="Select a module in the build-up to see why it scores as it does" />
        <p className="text-xs leading-relaxed text-rr-slate">
          Every level in the build-up is traceable: module life consumed, the prognostic model output, open alerts on the
          module&apos;s ATA chapter and the life-limited parts inside it.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className={className}>
      <PanelHeader
        title={`${module.label} — why ${LEVEL_LABEL[module.recommendedLevel].toLowerCase()}`}
        subtitle={module.rationale}
        actions={<LevelPill level={module.level} />}
      />
      <ul className="space-y-3">
        {module.drivers.map((driver) => (
          <li key={driver.label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-rr-ink">{driver.label}</p>
              <span className={cn("rr-numeric text-[11px] font-semibold", statusStyles[driver.status].text)}>
                +{driver.contribution}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-rr-slate">{driver.detail}</p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-rr-mist">
              <div className={cn("h-full rounded-full", statusStyles[driver.status].dot)} style={{ width: `${driver.contribution}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rr-ink/8 pt-3 text-[11px]">
        <div>
          <dt className="rr-label text-rr-slate">Severity index</dt>
          <dd className="rr-numeric text-rr-ink">{module.severityIndex} / 100</dd>
        </div>
        <div>
          <dt className="rr-label text-rr-slate">Last inspected</dt>
          <dd className="rr-numeric text-rr-ink">{module.lastInspectedAt ? formatDate(module.lastInspectedAt) : "No record"}</dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function LlpPlan({ scenario, className }: { scenario: WorkscopeScenario; className?: string }) {
  const llps = [...scenario.llps].sort((a, b) => a.cyclesRemaining - b.cyclesRemaining);
  const total = llps.reduce((sum, l) => sum + l.unitCostUsd, 0);
  const scrapped = llps.reduce((sum, l) => sum + l.stubCyclesScrapped, 0);
  const longestLead = llps.reduce((max, l) => Math.max(max, l.leadTimeDays), 0);

  return (
    <Panel className={className}>
      <PanelHeader
        title="Life-limited part replacements"
        subtitle="Included in the build-up above; long-lead parts drive the induction date"
        actions={
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="rr-label text-rr-slate">LLP spend</p>
              <p className="rr-numeric text-sm font-semibold text-rr-ink">{formatUsd(total)}</p>
            </div>
            <div>
              <p className="rr-label text-rr-slate">Longest lead</p>
              <p className={cn("rr-numeric text-sm font-semibold", longestLead > 120 ? "text-status-amber" : "text-rr-ink")}>
                {longestLead || 0}d
              </p>
            </div>
          </div>
        }
      />
      {llps.length === 0 ? (
        <p className="py-6 text-center text-xs text-rr-slate">
          No life-limited parts fall due inside this scenario&apos;s planned interval.
        </p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rr-ink/8">
                <th className="rr-label py-2 text-left text-rr-slate">Part</th>
                <th className="rr-label py-2 text-left text-rr-slate">Module</th>
                <th className="rr-label px-4 py-2 text-right text-rr-slate">Cycles left</th>
                <th className="rr-label px-4 py-2 text-right text-rr-slate">Lead time</th>
                <th className="rr-label px-4 py-2 text-right text-rr-slate">Unit cost</th>
                <th className="rr-label py-2 text-right text-rr-slate">Driver</th>
              </tr>
            </thead>
            <tbody>
              {llps.map((llp) => (
                <tr key={llp.id} className="border-b border-rr-ink/5 last:border-0">
                  <td className={cn("py-2.5 pl-3 border-l-2", llp.mandatory ? "border-status-red" : "border-status-amber")}>
                    <p className="rr-numeric text-[13px] font-medium text-rr-ink">{llp.partNumber}</p>
                    <p className="text-[11px] text-rr-slate">
                      {llp.description} · {llp.serialNumber}
                    </p>
                  </td>
                  <td className="py-2.5 text-[11px] text-rr-slate">{llp.moduleCode}</td>
                  <td className="rr-numeric whitespace-nowrap px-4 py-2.5 text-right text-[13px]">
                    <span className={cn("font-semibold", statusStyles[llp.status].text)}>{formatNumber(llp.cyclesRemaining)}</span>
                    <span className="text-[11px] text-rr-slate"> / {formatNumber(llp.cyclicLimit)}</span>
                  </td>
                  <td
                    className={cn(
                      "rr-numeric whitespace-nowrap px-4 py-2.5 text-right text-[13px]",
                      llp.leadTimeDays > 120 ? "text-status-amber" : "text-rr-slate",
                    )}
                  >
                    {llp.leadTimeDays}d
                  </td>
                  <td className="rr-numeric whitespace-nowrap px-4 py-2.5 text-right text-[13px] text-rr-ink">{formatUsd(llp.unitCostUsd)}</td>
                  <td className="py-2.5 text-right">
                    <StatusPill status={llp.mandatory ? "red" : "amber"}>{llp.mandatory ? "Mandatory" : "Opportunity"}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-rr-slate">
            {formatNumber(scrapped)} cycles of unused stub life scrapped across {llps.length} parts. Parts flagged red are
            below the 400-cycle dispatch reserve and cannot be deferred.
          </p>
        </>
      )}
    </Panel>
  );
}
