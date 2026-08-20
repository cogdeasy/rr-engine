"use client";

import * as React from "react";
import type { HotSectionAssessment, HotSectionMarginCurve } from "@rr/types";
import {
  Badge,
  Button,
  DriverAttributionBar,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  ThresholdBar,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { MarginCurveChart } from "./margin-curve-chart";
import { formatHorizon } from "./format";

/**
 * Engine-by-engine margin deterioration view: pick an engine from the ranked
 * list and see its curve against the family band, the drivers behind its rate
 * and the action the controller is being asked to take.
 */
export function MarginExplorer({
  assessments,
  curves,
}: {
  assessments: HotSectionAssessment[];
  curves: Record<string, HotSectionMarginCurve>;
}) {
  const [selectedId, setSelectedId] = React.useState(assessments[0]?.engineId ?? "");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assessments;
    return assessments.filter(
      (a) =>
        a.esn.toLowerCase().includes(q) ||
        a.operatorName.toLowerCase().includes(q) ||
        a.family.toLowerCase().includes(q) ||
        (a.tail ?? "").toLowerCase().includes(q),
    );
  }, [assessments, query]);

  const selected = assessments.find((a) => a.engineId === selectedId) ?? assessments[0];
  const curve = selected ? curves[selected.engineId] : undefined;
  if (!selected) return null;

  const rateRatio = selected.deteriorationRatePer100Cycles / Math.max(0.05, selected.familyMedianRatePer100Cycles);

  return (
    <Panel>
      <PanelHeader
        title="Margin exhaustion watch"
        subtitle="EGT margin against the family deterioration band, with the projected date margin runs out"
        actions={
          <>
            <Badge variant="outline">{assessments.length} engines on watch</Badge>
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, operator, tail" />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[248px_minmax(0,1fr)]">
        <div>
          <p className="rr-label mb-2 text-rr-slate">Ranked by urgency</p>
          <ul className="max-h-[430px] space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Engines on hot section watch">
            {filtered.map((assessment) => {
              const active = assessment.engineId === selected.engineId;
              return (
                <li key={assessment.engineId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(assessment.engineId)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm border-l-2 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rr-blue",
                      statusStyles[assessment.status].dot.replace("bg-", "border-l-"),
                      active ? "bg-rr-blue-50" : "hover:bg-rr-mist",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-rr-ink">{assessment.esn}</span>
                      <span className="block truncate text-[11px] text-rr-slate">
                        {assessment.operatorCode} · {assessment.family}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={cn("rr-numeric block text-[13px] font-semibold", statusStyles[assessment.status].text)}>
                        {assessment.egtMargin}°C
                      </span>
                      <span className="rr-numeric block text-[11px] text-rr-slate">{formatHorizon(assessment.daysToExhaustion)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? <li className="px-3 py-6 text-center text-xs text-rr-slate">No engines match “{query}”.</li> : null}
          </ul>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rr-ink/8 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg font-semibold text-rr-ink">{selected.esn}</h4>
                <StatusPill status={selected.status}>
                  {selected.status === "red" ? "Act now" : selected.status === "amber" ? "Watchlist" : "Nominal"}
                </StatusPill>
              </div>
              <p className="mt-0.5 text-xs text-rr-slate">
                {selected.family} · {selected.operatorName} · {selected.tail ?? "off wing"} · {selected.location} ·{" "}
                {formatNumber(selected.cyclesSinceOverhaul)} cycles since overhaul
              </p>
            </div>
            <div className="flex gap-7">
              <Figure label="Margin now" value={`${selected.egtMargin}`} unit="°C" status={selected.status} />
              <Figure
                label="Rate"
                value={selected.deteriorationRatePer100Cycles.toFixed(2)}
                unit="°C/100 cyc"
                status={rateRatio > 1.25 ? "red" : rateRatio > 1.05 ? "amber" : "green"}
              />
              <Figure label="Exhausts" value={formatDate(selected.exhaustionDate)} status={selected.status} small />
            </div>
          </div>

          {curve ? <div className="pt-3">{<MarginCurveChart curve={curve} />}</div> : null}

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div>
              <p className="rr-label mb-2 text-rr-slate">Margin against limits</p>
              <ThresholdBar
                value={selected.egtMargin}
                min={Math.min(0, selected.egtMargin)}
                max={selected.newEgtMargin}
                amber={25}
                red={12}
                unit="°C"
                direction="lower-is-worse"
              />
              <dl className="mt-3 space-y-1 text-[11px] text-rr-slate">
                <Row label="Cycles to exhaustion" value={formatNumber(selected.cyclesToExhaustion)} />
                <Row label="Utilisation" value={`${selected.cyclesPerDay.toFixed(2)} cyc/day`} />
                <Row label="Planned shop visit" value={selected.plannedShopVisitAt ? formatDate(selected.plannedShopVisitAt) : "None booked"} />
              </dl>
            </div>

            <div>
              <p className="rr-label mb-2 text-rr-slate">Rate attribution</p>
              <DriverAttributionBar drivers={selected.drivers} showLegend />
            </div>

            <div className={cn("rounded-sm border p-4", statusStyles[selected.action.status].border, statusStyles[selected.action.status].bg)}>
              <p className="rr-label text-rr-slate">Recommended action</p>
              <p className={cn("mt-1 text-sm font-semibold", statusStyles[selected.action.status].text)}>{selected.action.label}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-rr-slate">{selected.action.detail}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant={selected.action.status === "red" ? "danger" : "secondary"}>
                  {selected.action.kind === "wash"
                    ? "Schedule wash"
                    : selected.action.kind === "workscope"
                      ? "Raise workscope"
                      : selected.action.kind === "borescope"
                        ? "Raise inspection"
                        : "Acknowledge"}
                </Button>
                {selected.action.byDate ? (
                  <span className="rr-numeric text-[11px] text-rr-slate">by {formatDate(selected.action.byDate)}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Figure({
  label,
  value,
  unit,
  status,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  status: HotSectionAssessment["status"];
  small?: boolean;
}) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric font-semibold", small ? "text-base" : "text-2xl", statusStyles[status].text)}>
        {value}
        {unit ? <span className="ml-1 text-[11px] font-medium text-rr-slate">{unit}</span> : null}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="rr-numeric text-rr-ink">{value}</dd>
    </div>
  );
}
