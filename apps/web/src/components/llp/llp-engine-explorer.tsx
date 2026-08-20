"use client";

import * as React from "react";
import Link from "next/link";
import type { EngineLlpStack } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  LlpLifeBar,
  LlpDriverBar,
  LlpTradeCurve,
  Panel,
  PanelHeader,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

const DRIVER_LABEL: Record<EngineLlpStack["driver"], string> = {
  "llp-limited": "LLP-limited",
  "condition-limited": "Condition-limited",
  balanced: "Balanced",
};

const BASIS_LABEL: Record<EngineLlpStack["proposedRemovalBasis"], string> = {
  "scheduled-shop-visit": "Scheduled shop visit",
  "llp-expiry": "LLP expiry forecast",
  "condition-forecast": "Condition forecast",
};

/**
 * Stack-level workbench: pick an engine, see which LLPs are scrapped at the
 * planned removal, what that costs, and the removal date the optimiser prefers.
 */
export function LlpEngineExplorer({ stacks }: { stacks: EngineLlpStack[] }) {
  const [activeId, setActiveId] = React.useState(stacks[0]?.engineId ?? "");
  const stack = stacks.find((s) => s.engineId === activeId) ?? stacks[0];
  if (!stack) return null;

  const recommendation = stack.recommendation;

  const columns: Column<EngineLlpStack["lines"][number]>[] = [
    {
      key: "part",
      header: "Part",
      sortValue: (line) => line.partNumber,
      render: (line) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{line.partNumber}</p>
          <p className="text-[11px] text-rr-slate">
            {line.description} · S/N {line.serialNumber}
          </p>
        </div>
      ),
    },
    {
      key: "module",
      header: "Module",
      sortValue: (line) => line.moduleCode,
      render: (line) => <Badge variant="outline">{line.moduleCode}</Badge>,
    },
    {
      key: "life",
      header: "Life consumed",
      width: "22%",
      render: (line) => (
        <div className="space-y-1.5">
          <LlpLifeBar line={line} cyclesToRemoval={stack.cyclesToRemoval} />
          <p className="rr-numeric text-[11px] text-rr-slate">
            {formatNumber(line.cyclesUsed)} / {formatNumber(line.cyclicLimit)} cycles · {line.lifeUsedPct}%
          </p>
        </div>
      ),
    },
    {
      key: "remaining",
      header: "Cycles left",
      align: "right",
      sortValue: (line) => line.cyclesRemaining,
      render: (line) => (
        <span className={cn("rr-numeric font-semibold", statusStyles[line.status].text)}>
          {formatNumber(line.cyclesRemaining)}
        </span>
      ),
    },
    {
      key: "stub",
      header: "Stub at removal",
      align: "right",
      sortValue: (line) => line.stubValueUsd,
      render: (line) => (
        <div>
          <p className={cn("rr-numeric font-semibold", line.stubValueUsd > 0 ? "text-status-amber" : "text-rr-ink")}>
            {line.stubValueUsd > 0 ? formatUsd(line.stubValueUsd) : "—"}
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(line.stubCycles)} cycles</p>
        </div>
      ),
    },
    {
      key: "order",
      header: "Order by",
      align: "right",
      sortValue: (line) => line.orderByDate,
      render: (line) => (
        <div>
          <p className={cn("rr-numeric text-[13px]", line.leadTimeAtRisk ? "font-semibold text-status-red" : "text-rr-ink")}>
            {line.mustReplace ? formatDate(line.orderByDate) : "—"}
          </p>
          <p className="text-[11px] text-rr-slate">{line.mustReplace ? `${line.leadTimeDays}d lead · ${line.supplier}` : "retained"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Disposition",
      align: "right",
      sortValue: (line) => line.status,
      render: (line) => (
        <StatusPill status={line.status}>
          {line.expiresBeforeRemoval ? "Expired" : line.mustReplace ? "Replace" : "Retain"}
        </StatusPill>
      ),
    },
  ];

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="border-b border-rr-ink/8 px-5 pt-5">
        <PanelHeader
          title="Stack workbench"
          subtitle="Part-by-part disposition and the removal date that costs the operator least"
          actions={
            <Link href={`/engines/${stack.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
              Engine record ›
            </Link>
          }
        />
        <Tabs
          tabs={stacks.map((s) => ({ id: s.engineId, label: s.esn }))}
          active={stack.engineId}
          onChange={setActiveId}
        />
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <div className="rounded-sm border border-rr-ink/8 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="rr-label text-rr-slate">Engine</p>
                <p className="rr-numeric text-xl font-semibold text-rr-ink">{stack.esn}</p>
                <p className="text-[11px] text-rr-slate">
                  {stack.family} · {stack.operatorName} · {stack.aircraftTail ?? "off wing"} · {stack.location}
                </p>
              </div>
              <StatusPill status={stack.status}>{DRIVER_LABEL[stack.driver]}</StatusPill>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Planned removal" value={formatDate(stack.proposedRemovalDate)} hint={BASIS_LABEL[stack.proposedRemovalBasis]} />
              <Field
                label="Days to removal"
                value={formatNumber(stack.daysToRemoval)}
                hint={`${stack.cyclesPerDay} cycles/day`}
              />
              <Field label="Stub at risk" value={formatUsd(stack.stubValueUsd)} hint={`${stack.mustReplaceCount} parts scrapped`} />
              <Field label="EGT margin" value={`${stack.egtMargin}°C`} hint={`Health ${stack.healthScore}`} />
            </dl>

            <div className="mt-4 border-t border-rr-ink/8 pt-4">
              <p className="rr-label mb-2 text-rr-slate">What sets the removal date</p>
              <LlpDriverBar stack={stack} />
              <p className="mt-2 text-[11px] leading-relaxed text-rr-slate">
                {stack.driver === "llp-limited"
                  ? `LLP life runs out ${formatNumber(Math.abs(stack.driverMarginCycles))} cycles before the condition forecast — the stack, not deterioration, forces the removal.`
                  : stack.driver === "condition-limited"
                    ? `Condition bites ${formatNumber(Math.abs(stack.driverMarginCycles))} cycles before the LLP limit — life left in the stack will be scrapped.`
                    : "LLP life and condition expire within 600 cycles of each other — the stack is well matched to the engine."}
              </p>
            </div>
          </div>

          <div className={cn("rounded-sm border p-4", statusStyles[recommendation.status].border, statusStyles[recommendation.status].bg)}>
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-base font-semibold text-rr-ink">{recommendation.action}</p>
            <p className="mt-1 text-xs leading-relaxed text-rr-slate">{recommendation.rationale}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Optimal date" value={formatDate(recommendation.recommendedRemovalDate)} />
              <Field
                label="Net benefit"
                value={formatUsd(recommendation.netBenefitUsd)}
                hint={recommendation.netBenefitUsd > 0 ? "versus the planned date" : "planned date already optimal"}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm">Adopt {formatDate(recommendation.recommendedRemovalDate)}</Button>
              <Button size="sm" variant="secondary">
                Raise LLP workscope
              </Button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2">
          <div className="h-full rounded-sm border border-rr-ink/8 p-4">
            <PanelHeader
              title="Removal date trade-off"
              subtitle="Total cost of removing on each candidate date, relative to the plan"
              actions={<Badge variant="brand">{recommendation.action}</Badge>}
            />
            <LlpTradeCurve
              options={recommendation.options}
              recommendedDate={recommendation.recommendedRemovalDate}
              proposedDate={stack.proposedRemovalDate}
              height={352}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-rr-ink/8 px-5 pb-5 pt-5">
        <PanelHeader
          title="LLP stack disposition"
          subtitle={`Every part on ${stack.esn}, and what happens to it at the planned removal`}
        />
        <DataTable
          columns={columns}
          rows={stack.lines}
          rowKey={(line) => line.id}
          rowAccent={(line) => statusStyles[line.status].dot.replace("bg-", "border-")}
          dense
        />
      </div>
    </Panel>
  );
}

function Field({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className="rr-numeric mt-0.5 text-sm font-semibold text-rr-ink">{value}</dd>
      {hint ? <p className="text-[11px] text-rr-slate">{hint}</p> : null}
    </div>
  );
}
