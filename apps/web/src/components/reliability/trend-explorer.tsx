"use client";

import * as React from "react";
import {
  Badge,
  FilterBar,
  FilterChip,
  MetricReading,
  Panel,
  PanelHeader,
  StatusPill,
  Tabs,
  TrendArrow,
  TrendChart,
  cn,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import type { ReliabilityMetricDefinition, ReliabilityMetricId, ReliabilitySegment } from "@rr/types";

/**
 * Rolling 12-month trend against target, with the same metric broken out by
 * engine family and by operator so the fleet number can be attributed.
 */
export function TrendExplorer({
  definitions,
  fleet,
  families,
  operators,
  windowMonths,
}: {
  definitions: ReliabilityMetricDefinition[];
  fleet: ReliabilitySegment;
  families: ReliabilitySegment[];
  operators: ReliabilitySegment[];
  windowMonths: number;
}) {
  const [metricId, setMetricId] = React.useState<ReliabilityMetricId>(
    definitions.find((d) => fleet.measures[d.id].status === "red")?.id ?? definitions[0].id,
  );
  const [breakdown, setBreakdown] = React.useState<"family" | "operator">("family");

  const definition = definitions.find((d) => d.id === metricId)!;
  const measure = fleet.measures[metricId];
  const better = definition.direction === "higher-is-better";
  const amberLimit = better ? definition.target * (1 - definition.amberTolerance) : definition.target;
  const redLimit = better ? definition.target : definition.target * (1 + definition.amberTolerance);

  const segments = [...(breakdown === "family" ? families : operators)]
    .sort((a, b) => a.measures[metricId].attainmentPct - b.measures[metricId].attainmentPct)
    .slice(0, breakdown === "family" ? 8 : 10);
  const peak = Math.max(...segments.map((s) => s.measures[metricId].value), definition.target) || 1;

  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <Panel className="xl:col-span-3">
        <PanelHeader
          title={`${definition.label} — rolling ${windowMonths} months`}
          subtitle={definition.description}
          actions={<StatusPill status={measure.status} />}
        />
        <Tabs
          className="mb-4"
          tabs={definitions.map((d) => ({ id: d.id, label: d.shortLabel }))}
          active={metricId}
          onChange={(id) => setMetricId(id as ReliabilityMetricId)}
        />
        <div className="mb-4 flex flex-wrap items-end gap-8">
          <div>
            <p className="rr-label text-rr-slate">Current</p>
            <MetricReading value={measure.value} unit={definition.unit} decimals={definition.decimals} status={measure.status} />
          </div>
          <div>
            <p className="rr-label text-rr-slate">Target</p>
            <MetricReading value={definition.target} unit={definition.unit} decimals={definition.decimals} />
          </div>
          <div>
            <p className="rr-label text-rr-slate">Vs prior window</p>
            <p className="rr-numeric mt-1 text-lg font-semibold text-rr-ink">
              <TrendArrow trend={measure.trend} good={measure.trend === "flat" ? undefined : (measure.trend === "up") === better} />{" "}
              {measure.deltaPct > 0 ? "+" : ""}
              {measure.deltaPct}%
            </p>
          </div>
        </div>
        <TrendChart
          series={{
            id: `reliability-${metricId}`,
            label: definition.label,
            unit: definition.unit,
            points: measure.history,
            amberThreshold: amberLimit,
            redThreshold: redLimit,
          }}
          height={190}
        />
        <p className="mt-3 text-[11px] text-rr-slate">
          Dashed lines mark the amber tolerance and the {better ? "minimum" : "maximum"} acceptable reading. Exposure over the
          window: {formatNumber(fleet.efh)} EFH across {formatNumber(fleet.departures)} engine departures.
        </p>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelHeader
          title="Where the number comes from"
          subtitle={`${definition.shortLabel} ranked worst-first, ${breakdown === "family" ? "by engine family" : "by operator"}`}
          actions={
            <FilterBar>
              <FilterChip label="Family" active={breakdown === "family"} onClick={() => setBreakdown("family")} />
              <FilterChip label="Operator" active={breakdown === "operator"} onClick={() => setBreakdown("operator")} />
            </FilterBar>
          }
        />
        <ul className="space-y-2.5">
          {segments.map((segment) => {
            const segmentMeasure = segment.measures[metricId];
            return (
              <li key={segment.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <p className="truncate text-[13px] font-medium text-rr-ink">{segment.label}</p>
                  <p className="truncate text-[11px] text-rr-slate">
                    {segment.sublabel} · {formatNumber(segment.efh)} EFH
                  </p>
                </div>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-rr-mist">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full", statusStyles[segmentMeasure.status].dot)}
                    style={{ width: `${Math.max(2, (segmentMeasure.value / peak) * 100)}%` }}
                  />
                  <div className="absolute inset-y-0 w-px bg-rr-ink/40" style={{ left: `${(definition.target / peak) * 100}%` }} />
                </div>
                <span className={cn("rr-numeric w-20 shrink-0 text-right text-[13px] font-semibold", statusStyles[segmentMeasure.status].text)}>
                  {segmentMeasure.value.toLocaleString("en-GB", {
                    minimumFractionDigits: definition.decimals,
                    maximumFractionDigits: definition.decimals,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-[11px] text-rr-slate">
          <Badge variant="outline">Target {definition.target}{definition.unit}</Badge>
          marked by the vertical rule on each bar.
        </p>
      </Panel>
    </div>
  );
}
