"use client";

import * as React from "react";
import type { ParameterId, StatusLevel, TrendEvent, TrendSeriesBundle, TrendingWorkbenchData } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  Tabs,
  ThresholdBar,
  cn,
  formatDate,
  statusStyles,
  type Column,
} from "@rr/ui";
import { monthDate, seriesColour } from "./chart-theme";
import { FleetCompareChart, type CompareRow } from "./fleet-compare-chart";
import { TrendChart, type TrendChartEvent, type TrendChartRow } from "./trend-chart";
import { windowStatistics } from "./window-stats";

const MAX_ENGINES = 6;
const RANGE_OPTIONS = [60, 90, 180] as const;

const EVENT_LABELS: Record<TrendEvent["kind"], string> = {
  "water-wash": "Water wash",
  "shop-visit": "Shop visit",
  "module-change": "Module change",
  borescope: "Borescope",
  alert: "Alert",
};

export function TrendingWorkbench({ data }: { data: TrendingWorkbenchData }) {
  const [engineIds, setEngineIds] = React.useState<string[]>(() => data.engines.slice(0, 3).map((e) => e.id));
  const [parameters, setParameters] = React.useState<ParameterId[]>(() =>
    data.parameters.slice(0, 3).map((p) => p.id),
  );
  const [focus, setFocus] = React.useState<ParameterId>(() => data.parameters[0]!.id);
  const [rangeDays, setRangeDays] = React.useState<number>(data.windowDays);
  const [compare, setCompare] = React.useState(false);
  const [query, setQuery] = React.useState("");
  /** Brush selection inside the window; null means the whole window. */
  const [brush, setBrush] = React.useState<{ from: string; to: string } | null>(null);

  const bundleIndex = React.useMemo(() => {
    const map = new Map<string, TrendSeriesBundle>();
    for (const bundle of data.bundles) map.set(`${bundle.engineId}:${bundle.parameter}`, bundle);
    return map;
  }, [data.bundles]);

  const bundleFor = React.useCallback(
    (engineId: string, parameter: ParameterId) => bundleIndex.get(`${engineId}:${parameter}`),
    [bundleIndex],
  );

  const primaryEngineId = engineIds[0] ?? data.engines[0]!.id;
  const primaryEngine = data.engines.find((e) => e.id === primaryEngineId)!;
  const focusParameter = data.parameters.find((p) => p.id === focus) ?? data.parameters[0]!;
  const primaryBundle = bundleFor(primaryEngineId, focusParameter.id);


  const cutoff = React.useMemo(
    () => new Date(new Date(data.generatedAt).getTime() - rangeDays * 86400000).getTime(),
    [data.generatedAt, rangeDays],
  );
  const inRange = React.useCallback((t: string) => new Date(t).getTime() >= cutoff, [cutoff]);

  /** Chart rows follow the window buttons only; the brush then narrows everything derived from them. */
  const inView = React.useCallback(
    (t: string) => {
      if (!inRange(t)) return false;
      if (!brush) return true;
      const ms = new Date(t).getTime();
      return ms >= new Date(brush.from).getTime() && ms <= new Date(brush.to).getTime();
    },
    [inRange, brush],
  );

  React.useEffect(() => setBrush(null), [rangeDays, focus, primaryEngineId]);

  /** Refits statistics over whatever slice of the series is currently on screen. */
  const viewBundle = React.useCallback(
    (bundle: TrendSeriesBundle): TrendSeriesBundle => {
      const points = bundle.series.points.filter((p) => inView(p.t));
      if (points.length === bundle.series.points.length || points.length < 3) return bundle;
      const events = data.events.filter((e) => e.engineId === bundle.engineId && inView(e.at));
      return {
        ...bundle,
        series: { ...bundle.series, points },
        statistics: windowStatistics(bundle.statistics, points, events, data.generatedAt),
      };
    },
    [inView, data.events, data.generatedAt],
  );

  const chartSeries = React.useMemo(
    () =>
      engineIds.map((engineId, index) => ({
        key: engineId,
        label: data.engines.find((e) => e.id === engineId)?.esn ?? engineId,
        colour: seriesColour(index),
      })),
    [engineIds, data.engines],
  );

  const focusRows = React.useMemo<TrendChartRow[]>(() => {
    const byTime = new Map<string, TrendChartRow>();
    for (const engineId of engineIds) {
      const bundle = bundleFor(engineId, focusParameter.id);
      if (!bundle) continue;
      for (const point of bundle.series.points) {
        if (!inRange(point.t)) continue;
        const row = byTime.get(point.t) ?? { t: point.t };
        row[engineId] = point.v;
        byTime.set(point.t, row);
      }
    }
    return [...byTime.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
  }, [engineIds, focusParameter.id, bundleFor, inRange]);

  const sampleTimes = React.useMemo(() => focusRows.map((r) => r.t), [focusRows]);

  const snap = React.useCallback(
    (at: string): string | null => {
      if (sampleTimes.length === 0) return null;
      const target = new Date(at).getTime();
      let best = sampleTimes[0]!;
      let bestDelta = Math.abs(new Date(best).getTime() - target);
      for (const t of sampleTimes) {
        const delta = Math.abs(new Date(t).getTime() - target);
        if (delta < bestDelta) {
          best = t;
          bestDelta = delta;
        }
      }
      return bestDelta <= 4 * 86400000 ? best : null;
    },
    [sampleTimes],
  );

  /** Only the primary engine's events are drawn, otherwise the chart is unreadable. */
  const primaryEvents = React.useMemo(
    () =>
      data.events
        .filter((event) => event.engineId === primaryEngineId && inView(event.at))
        .filter((event) => event.kind !== "alert" || event.parameter === focusParameter.id),
    [data.events, primaryEngineId, inView, focusParameter.id],
  );

  const chartEvents = React.useMemo<TrendChartEvent[]>(
    () =>
      primaryEvents
        .map((event) => {
          const at = snap(event.at);
          return at ? { id: event.id, at, kind: event.kind, label: event.label, detail: event.detail } : null;
        })
        .filter((e): e is TrendChartEvent => e !== null),
    [primaryEvents, snap],
  );

  const compareRows = React.useMemo<CompareRow[]>(() => {
    const band = data.fleetBands.find((b) => b.family === primaryEngine.family && b.parameter === focusParameter.id);
    const bundle = primaryBundle;
    if (!band || !bundle) return [];
    const engineByTime = new Map(bundle.series.points.map((p) => [p.t, p.v]));
    return band.points
      .filter((p) => inRange(p.t))
      .map((p) => ({
        t: p.t,
        engine: engineByTime.get(p.t) ?? null,
        median: p.median,
        p10: p.p10,
        p90: p.p90,
        band: Math.round((p.p90 - p.p10) * 100) / 100,
      }));
  }, [data.fleetBands, primaryEngine.family, focusParameter.id, primaryBundle, inRange]);

  const statRows = React.useMemo(
    () =>
      engineIds.flatMap((engineId) =>
        parameters
          .map((parameter) => bundleFor(engineId, parameter))
          .filter((b): b is TrendSeriesBundle => b !== undefined)
          .map(viewBundle),
      ),
    [engineIds, parameters, bundleFor, viewBundle],
  );

  const primaryView = React.useMemo(
    () => (primaryBundle ? viewBundle(primaryBundle) : undefined),
    [primaryBundle, viewBundle],
  );

  const activeRecommendations = React.useMemo(
    () => data.recommendations.filter((r) => engineIds.includes(r.engineId) && parameters.includes(r.parameter)),
    [data.recommendations, engineIds, parameters],
  );

  const filteredEngines = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.engines;
    return data.engines.filter((engine) =>
      [engine.esn, engine.family, engine.operator, engine.operatorCode, engine.tail ?? ""].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [data.engines, query]);

  function toggleEngine(engineId: string) {
    setEngineIds((current) => {
      if (current.includes(engineId)) return current.length === 1 ? current : current.filter((id) => id !== engineId);
      if (current.length >= MAX_ENGINES) return [...current.slice(1), engineId];
      return [...current, engineId];
    });
  }

  function toggleParameter(parameter: ParameterId) {
    setParameters((current) => {
      if (current.includes(parameter)) {
        if (current.length === 1) return current;
        const next = current.filter((p) => p !== parameter);
        if (parameter === focus) setFocus(next[0]!);
        return next;
      }
      return [...current, parameter];
    });
  }

  const secondaryParameters = parameters.filter((p) => p !== focusParameter.id);

  return (
    <div className="space-y-5">
      {/* Selection */}
      <Panel>
        <PanelHeader
          title="Trending selection"
          subtitle={`Overlay up to ${MAX_ENGINES} engines and any combination of trended parameters`}
          actions={
            <FilterBar>
              <label className="contents">
                <span className="sr-only">Filter engines by serial number, family, operator or tail</span>
                <SearchInput value={query} onChange={setQuery} placeholder="Filter engines" />
              </label>
              <Button
                variant={compare ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCompare((c) => !c)}
                aria-pressed={compare}
              >
                Compare to fleet
              </Button>
            </FilterBar>
          }
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <p className="rr-label mb-2 text-rr-slate">Engines</p>
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredEngines.map((engine) => {
                const selected = engineIds.includes(engine.id);
                const index = engineIds.indexOf(engine.id);
                return (
                  <button
                    key={engine.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleEngine(engine.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                      selected ? "border-rr-blue/40 bg-rr-blue-50" : "border-rr-ink/10 bg-white hover:border-rr-blue/30",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-0.5 rounded-full"
                        style={{ backgroundColor: selected ? seriesColour(index) : "transparent" }}
                        aria-hidden
                      />
                      <span>
                        <span className="block text-[13px] font-semibold text-rr-ink">{engine.esn}</span>
                        <span className="block text-[11px] text-rr-slate">
                          {engine.family} · {engine.operatorCode} · {engine.tail ?? "off wing"}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rr-numeric text-[11px] text-rr-slate">{engine.egtMargin}°C</span>
                      <StatusPill status={engine.status}>{engine.healthScore}</StatusPill>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="rr-label mb-2 text-rr-slate">Parameters</p>
            <FilterBar>
              {data.parameters.map((parameter) => {
                const selected = parameters.includes(parameter.id);
                return (
                  <button
                    key={parameter.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleParameter(parameter.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                      selected
                        ? "border-rr-blue bg-rr-blue text-white"
                        : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                    )}
                  >
                    {parameter.shortLabel}
                  </button>
                );
              })}
            </FilterBar>

            <p className="rr-label mb-2 mt-5 text-rr-slate">Window</p>
            <FilterBar>
              {RANGE_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={rangeDays === days}
                  onClick={() => setRangeDays(days)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                    rangeDays === days
                      ? "border-rr-blue bg-rr-blue text-white"
                      : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                  )}
                >
                  {days} days
                </button>
              ))}
              <span className="text-[11px] text-rr-slate">Drag the chart brush to narrow further</span>
            </FilterBar>
          </div>
        </div>
      </Panel>

      {/* Focus chart + statistics */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title={`${focusParameter.label} — ${engineIds.length} engine${engineIds.length === 1 ? "" : "s"}`}
            subtitle={`ATA ${focusParameter.ataChapter} · ${focusParameter.direction === "higher-is-worse" ? "higher is worse" : "lower is worse"} · shaded regions are limit exceedances for ${primaryEngine.esn}`}
            actions={
              <Badge variant="brand">
                {brush
                  ? `${monthDate(brush.from)} – ${monthDate(brush.to)} (brushed)`
                  : `${rangeDays} day window`}
              </Badge>
            }
          />
          <Tabs
            className="mb-3"
            tabs={parameters.map((id) => ({
              id,
              label: data.parameters.find((p) => p.id === id)?.shortLabel ?? id,
            }))}
            active={focusParameter.id}
            onChange={(id) => setFocus(id as ParameterId)}
          />
          <TrendChart
            rows={focusRows}
            series={chartSeries}
            unit={focusParameter.unit}
            amber={focusParameter.amberThreshold}
            red={focusParameter.redThreshold}
            direction={focusParameter.direction}
            exceedances={primaryView?.statistics.exceedances.filter((e) => inRange(e.to)) ?? []}
            events={chartEvents}
            onRangeChange={(range) =>
              setBrush(
                focusRows.length > 0 && range.from === focusRows[0]!.t && range.to === focusRows[focusRows.length - 1]!.t
                  ? null
                  : range,
              )
            }
          />
          <EventLegend events={primaryEvents} esn={primaryEngine.esn} />
        </Panel>

        <div className="space-y-5">
          {primaryView ? <TrendStatsPanel bundle={primaryView} parameterLabel={focusParameter.shortLabel} /> : null}
        </div>
      </div>

      {/* Compare mode */}
      {compare ? (
        <Panel>
          <PanelHeader
            title={`${primaryEngine.esn} vs ${primaryEngine.family} fleet`}
            subtitle={`Same-family median with the p10–p90 band for ${focusParameter.label}`}
            actions={
              <Badge variant="outline">
                Decay percentile {primaryEngine.decayPercentile}
                {primaryEngine.decayPercentile >= 80 ? " — fastest decile" : ""}
              </Badge>
            }
          />
          {compareRows.length > 0 ? (
            <FleetCompareChart
              rows={compareRows}
              unit={focusParameter.unit}
              amber={focusParameter.amberThreshold}
              red={focusParameter.redThreshold}
              direction={focusParameter.direction}
              engineLabel={primaryEngine.esn}
              colour={seriesColour(0)}
            />
          ) : (
            <p className="py-10 text-center text-xs text-rr-slate">No fleet band available for this family.</p>
          )}
        </Panel>
      ) : null}

      {/* Small multiples */}
      {secondaryParameters.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {secondaryParameters.map((parameterId) => {
            const parameter = data.parameters.find((p) => p.id === parameterId)!;
            const rows: TrendChartRow[] = [];
            const byTime = new Map<string, TrendChartRow>();
            for (const engineId of engineIds) {
              const bundle = bundleFor(engineId, parameterId);
              if (!bundle) continue;
              for (const point of bundle.series.points) {
                if (!inRange(point.t)) continue;
                const row = byTime.get(point.t) ?? { t: point.t };
                row[engineId] = point.v;
                byTime.set(point.t, row);
              }
            }
            rows.push(...[...byTime.values()].sort((a, b) => (a.t < b.t ? -1 : 1)));
            const worst = engineIds
              .map((engineId) => bundleFor(engineId, parameterId))
              .filter((b): b is TrendSeriesBundle => b !== undefined)
              .sort((a, b) => rank(b.statistics.status) - rank(a.statistics.status))[0];
            return (
              <Panel key={parameterId}>
                <PanelHeader
                  title={parameter.label}
                  subtitle={`ATA ${parameter.ataChapter} · limits ${parameter.amberThreshold}${parameter.unit} amber / ${parameter.redThreshold}${parameter.unit} red`}
                  actions={
                    worst ? (
                      <button
                        type="button"
                        onClick={() => setFocus(parameterId)}
                        className="text-xs font-semibold text-rr-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
                      >
                        Focus ›
                      </button>
                    ) : null
                  }
                />
                <TrendChart
                  rows={rows}
                  series={chartSeries}
                  unit={parameter.unit}
                  amber={parameter.amberThreshold}
                  red={parameter.redThreshold}
                  direction={parameter.direction}
                  height={200}
                  showBrush={false}
                />
              </Panel>
            );
          })}
        </div>
      ) : null}

      {/* Statistics table */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="rr-label text-rr-blue">Trend statistics</p>
            <h2 className="mt-1 text-lg font-semibold text-rr-ink">Deterioration rates and projections</h2>
            <p className="mt-1 text-xs text-rr-slate">
              Slopes are least-squares fits over{" "}
              {brush ? `the brushed range ${monthDate(brush.from)} – ${monthDate(brush.to)}` : `the ${rangeDays}-day window`}{" "}
              and converted to the engine&apos;s own utilisation.
            </p>
          </div>
          <Badge variant="outline">{statRows.length} series</Badge>
        </div>
        <DataTable
          columns={statisticsColumns(data)}
          rows={statRows}
          rowKey={(row) => `${row.engineId}:${row.parameter}`}
          rowAccent={(row) => accentFor(row.statistics.status)}
          initialSortKey="status"
          dense
        />
      </div>

      {/* Recommended actions */}
      <Panel>
        <PanelHeader
          title="Recommended actions"
          subtitle="Generated from the selected series; every entry states why it is flagged"
          actions={<Badge variant="brand">{activeRecommendations.length} open</Badge>}
        />
        {activeRecommendations.length === 0 ? (
          <p className="py-8 text-center text-xs text-rr-slate">
            No amber or red trends in the current selection — all selected parameters are inside their limit bands.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {activeRecommendations.map((rec) => (
              <li
                key={`${rec.engineId}:${rec.parameter}`}
                className={cn("rounded-sm border-l-2 border-y border-r border-rr-ink/8 p-4", borderFor(rec.status))}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-semibold text-rr-ink">{rec.headline}</p>
                  <StatusPill status={rec.status} />
                </div>
                <p className="mt-1 text-[11px] text-rr-slate">{rec.reason}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-rr-ink">{rec.action}</p>
                  <span className="rr-numeric text-[11px] text-rr-slate">
                    {rec.cyclesAvailable === null ? "no projected crossing" : `${rec.cyclesAvailable} cycles available`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TrendStatsPanel({ bundle, parameterLabel }: { bundle: TrendSeriesBundle; parameterLabel: string }) {
  const s = bundle.statistics;
  const worse = s.direction === "higher-is-worse";
  const span = Math.abs(s.redThreshold - s.baseline) * 1.35 || 1;
  const barMin = worse ? Math.min(s.baseline, s.current) - span * 0.1 : Math.min(s.redThreshold, s.current) - span * 0.1;
  const barMax = worse ? Math.max(s.redThreshold, s.current) + span * 0.1 : Math.max(s.baseline, s.current) + span * 0.1;

  return (
    <Panel>
      <PanelHeader
        title={`${bundle.esn} — ${parameterLabel}`}
        subtitle={`${bundle.family} · fitted over ${bundle.series.points.length} samples (R² ${s.rSquared})`}
        actions={<StatusPill status={s.status} />}
      />
      <p className={cn("rounded-sm px-3 py-2 text-[11px]", statusStyles[s.status].bg, statusStyles[s.status].text)}>
        {s.statusReason}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Figure label="Current" value={`${s.current}`} unit={s.unit} status={s.status} />
        <Figure
          label="Slope / 100 cycles"
          value={`${s.slopePer100Cycles > 0 ? "+" : ""}${s.slopePer100Cycles}`}
          unit={s.unit}
          hint={`${s.cyclesPerDay} cycles/day utilisation`}
        />
        <Figure
          label="Days to amber"
          value={s.daysToAmber === null ? "—" : s.daysToAmber === 0 ? "Breached" : String(s.daysToAmber)}
          hint={
            s.daysToAmber === null
              ? "trend is not heading for the limit"
              : s.daysToAmber === 0
                ? "already beyond the amber limit"
                : `${s.cyclesToAmber} cycles`
          }
          status={s.daysToAmber !== null && s.daysToAmber <= 120 ? "amber" : undefined}
        />
        <Figure
          label="Days to red"
          value={s.daysToRed === null ? "—" : s.daysToRed === 0 ? "Breached" : String(s.daysToRed)}
          hint={
            s.daysToRed === null
              ? "trend is not heading for the limit"
              : s.daysToRed === 0
                ? "already beyond the red limit"
                : `${s.cyclesToRed} cycles`
          }
          status={s.daysToRed !== null && s.daysToRed <= 60 ? "red" : undefined}
        />
      </div>

      <div className="mt-5">
        <p className="rr-label mb-2 text-rr-slate">Position against limits</p>
        <ThresholdBar
          value={s.current}
          min={Math.round(barMin * 100) / 100}
          max={Math.round(barMax * 100) / 100}
          amber={s.amberThreshold}
          red={s.redThreshold}
          unit={s.unit}
          direction={s.direction}
        />
      </div>

      <div className="mt-5 border-t border-rr-ink/8 pt-4">
        <p className="rr-label text-rr-slate">Largest step change</p>
        {s.stepChange ? (
          <>
            <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-ink">
              {s.stepChange.magnitude > 0 ? "+" : ""}
              {s.stepChange.magnitude}
              <span className="ml-1 text-sm font-medium text-rr-slate">{s.unit}</span>
            </p>
            <p className="mt-1 text-xs text-rr-slate">
              {formatDate(s.stepChange.at)} · {s.stepChange.beforeMean}
              {s.unit} → {s.stepChange.afterMean}
              {s.unit} · {s.stepChange.sigmaRatio}σ{" "}
              {s.stepChange.significant ? "(significant)" : "(within noise)"}
            </p>
            {s.stepChange.attributedTo ? (
              <p className="mt-2 text-[11px] text-rr-slate">
                Coincides with <span className="font-semibold text-rr-ink">{s.stepChange.attributedTo.label}</span> —{" "}
                {s.stepChange.attributedTo.detail}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-rr-slate">No maintenance event within ±10 days explains this shift.</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-rr-slate">Insufficient samples for step-change detection.</p>
        )}
      </div>

      <div className="mt-5 border-t border-rr-ink/8 pt-4">
        <p className="rr-label text-rr-slate">Since window start</p>
        <p className="mt-1 text-xs text-rr-slate">
          Baseline <span className="rr-numeric text-rr-ink">{s.baseline}{s.unit}</span> →{" "}
          <span className="rr-numeric text-rr-ink">{s.current}{s.unit}</span> (
          <span className="rr-numeric">{s.deltaFromBaseline > 0 ? "+" : ""}{s.deltaFromBaseline}{s.unit}</span>,{" "}
          {s.deltaFromBaselinePct > 0 ? "+" : ""}
          {s.deltaFromBaselinePct}%)
        </p>
      </div>
    </Panel>
  );
}

function Figure({
  label,
  value,
  unit,
  hint,
  status,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  status?: StatusLevel;
}) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-rr-slate">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-rr-slate">{hint}</p> : null}
    </div>
  );
}

function EventLegend({ events, esn }: { events: TrendEvent[]; esn: string }) {
  if (events.length === 0) {
    return <p className="mt-3 text-[11px] text-rr-slate">No maintenance events recorded for {esn} in this window.</p>;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rr-ink/8 pt-3">
      <span className="rr-label text-rr-slate">{esn} events</span>
      {events.slice(-6).map((event) => (
        <span key={event.id} className="text-[11px] text-rr-slate" title={event.detail}>
          <span className="font-semibold text-rr-ink">{EVENT_LABELS[event.kind]}</span> {monthDate(event.at)}
        </span>
      ))}
    </div>
  );
}

function rank(status: string): number {
  return status === "red" ? 3 : status === "amber" ? 2 : status === "green" ? 1 : 0;
}

function accentFor(status: string): string {
  return status === "red" ? "border-status-red" : status === "amber" ? "border-status-amber" : "border-status-green";
}

function borderFor(status: string): string {
  return status === "red" ? "border-l-status-red" : "border-l-status-amber";
}

function statisticsColumns(data: TrendingWorkbenchData): Column<TrendSeriesBundle>[] {
  const label = (parameter: ParameterId) => data.parameters.find((p) => p.id === parameter)?.shortLabel ?? parameter;
  return [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">{row.family}</p>
        </div>
      ),
    },
    {
      key: "parameter",
      header: "Parameter",
      sortValue: (row) => row.parameter,
      render: (row) => <span className="text-rr-slate">{label(row.parameter)}</span>,
    },
    {
      key: "current",
      header: "Current",
      align: "right",
      sortValue: (row) => row.statistics.current,
      render: (row) => (
        <span className="rr-numeric font-semibold text-rr-ink">
          {row.statistics.current}
          {row.statistics.unit}
        </span>
      ),
    },
    {
      key: "delta",
      header: "Δ window",
      align: "right",
      sortValue: (row) => row.statistics.deltaFromBaseline,
      render: (row) => (
        <span className="rr-numeric text-rr-slate">
          {row.statistics.deltaFromBaseline > 0 ? "+" : ""}
          {row.statistics.deltaFromBaseline}
          {row.statistics.unit}
        </span>
      ),
    },
    {
      key: "slope",
      header: "Slope / 100 cyc",
      align: "right",
      sortValue: (row) => Math.abs(row.statistics.slopePer100Cycles),
      render: (row) => (
        <span className="rr-numeric text-rr-ink">
          {row.statistics.slopePer100Cycles > 0 ? "+" : ""}
          {row.statistics.slopePer100Cycles}
          {row.statistics.unit}
        </span>
      ),
    },
    {
      key: "amber",
      header: "To amber",
      align: "right",
      sortValue: (row) => row.statistics.daysToAmber ?? 99999,
      render: (row) =>
        row.statistics.daysToAmber === null ? (
          <span className="text-rr-slate">—</span>
        ) : row.statistics.daysToAmber === 0 ? (
          <span className="text-status-amber">breached</span>
        ) : (
          <span className="rr-numeric text-rr-ink">
            {row.statistics.daysToAmber}d
            <span className="ml-1 text-[11px] text-rr-slate">{row.statistics.cyclesToAmber} cyc</span>
          </span>
        ),
    },
    {
      key: "red",
      header: "To red",
      align: "right",
      sortValue: (row) => row.statistics.daysToRed ?? 99999,
      render: (row) =>
        row.statistics.daysToRed === null ? (
          <span className="text-rr-slate">—</span>
        ) : row.statistics.daysToRed === 0 ? (
          <span className="text-status-red">breached</span>
        ) : (
          <span className="rr-numeric text-rr-ink">
            {row.statistics.daysToRed}d
            <span className="ml-1 text-[11px] text-rr-slate">{row.statistics.cyclesToRed} cyc</span>
          </span>
        ),
    },
    {
      key: "step",
      header: "Largest step",
      align: "right",
      sortValue: (row) => Math.abs(row.statistics.stepChange?.magnitude ?? 0),
      render: (row) =>
        row.statistics.stepChange ? (
          <span className="rr-numeric text-rr-ink">
            {row.statistics.stepChange.magnitude > 0 ? "+" : ""}
            {row.statistics.stepChange.magnitude}
            {row.statistics.unit}
            <span className="ml-1 text-[11px] text-rr-slate">{monthDate(row.statistics.stepChange.at)}</span>
          </span>
        ) : (
          <span className="text-rr-slate">—</span>
        ),
    },
    {
      key: "status",
      header: "State",
      align: "right",
      sortValue: (row) => rank(row.statistics.status),
      render: (row) => (
        <span title={row.statistics.statusReason}>
          <StatusPill status={row.statistics.status} />
        </span>
      ),
    },
  ];
}
