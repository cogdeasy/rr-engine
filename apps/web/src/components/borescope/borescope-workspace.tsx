"use client";

import * as React from "react";
import Link from "next/link";
import type { BorescopeDisposition } from "@rr/types";
import {
  Badge,
  BorescopeFrame,
  BorescopeLimitBar,
  Button,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import type { FindingView } from "./types";

const DISPOSITIONS: { id: BorescopeDisposition; label: string }[] = [
  { id: "remove", label: "Remove" },
  { id: "repair", label: "Repair" },
  { id: "monitor", label: "Monitor" },
  { id: "serviceable", label: "Serviceable" },
];

const ACTION_LABEL: Record<BorescopeDisposition, string> = {
  remove: "Raise removal request",
  repair: "Raise on-wing repair task",
  monitor: "Set shortened repeat interval",
  serviceable: "Close finding as serviceable",
};

export function BorescopeWorkspace({ findings, modules }: { findings: FindingView[]; modules: { code: string; label: string }[] }) {
  const [disposition, setDisposition] = React.useState<BorescopeDisposition | "all">("all");
  const [moduleCode, setModuleCode] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  // Open on the worst finding that also has a prior measurement, so the progression is visible.
  const initialId = (findings.find((v) => v.finding.previousMeasured != null) ?? findings[0])?.finding.id ?? "";
  const [selectedId, setSelectedId] = React.useState<string>(initialId);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((view) => {
      if (disposition !== "all" && view.finding.disposition !== disposition) return false;
      if (moduleCode !== "all" && view.finding.moduleCode !== moduleCode) return false;
      if (!q) return true;
      return [view.esn, view.operatorCode, view.tail ?? "", view.finding.stage, view.finding.damageType, view.family]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [findings, disposition, moduleCode, query]);

  const selected = filtered.find((v) => v.finding.id === selectedId) ?? filtered[0];

  const counts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const view of findings) out[view.finding.disposition] = (out[view.finding.disposition] ?? 0) + 1;
    return out;
  }, [findings]);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <Panel className="self-start xl:col-span-5" padded={false}>
        <div className="border-b border-rr-ink/8 p-5 pb-4">
          <PanelHeader
            className="pb-3"
            title="Finding triage queue"
            subtitle="Latest inspection per engine, ranked by proximity to the serviceable limit"
            actions={<Badge variant="outline">{filtered.length} shown</Badge>}
          />
          <FilterBar>
            <FilterChip label="All" active={disposition === "all"} onClick={() => setDisposition("all")} count={findings.length} />
            {DISPOSITIONS.map((d) => (
              <FilterChip
                key={d.id}
                label={d.label}
                active={disposition === d.id}
                onClick={() => setDisposition(d.id)}
                count={counts[d.id] ?? 0}
              />
            ))}
            <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail, stage, damage" className="ml-auto" />
          </FilterBar>
          <FilterBar className="mt-2">
            <FilterChip label="All modules" active={moduleCode === "all"} onClick={() => setModuleCode("all")} />
            {modules.map((m) => (
              <FilterChip key={m.code} label={m.code} active={moduleCode === m.code} onClick={() => setModuleCode(m.code)} />
            ))}
          </FilterBar>
        </div>

        <ul className="max-h-[48rem] divide-y divide-rr-ink/6 overflow-y-auto" role="listbox" aria-label="Borescope findings">
          {filtered.length === 0 ? (
            <li className="px-5 py-12 text-center text-xs text-rr-slate">No findings match the current filters.</li>
          ) : (
            filtered.map((view) => {
              const f = view.finding;
              const active = selected?.finding.id === f.id;
              const delta = f.previousMeasured != null ? f.measured - f.previousMeasured : null;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(f.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
                      f.status === "red" ? "border-l-status-red" : f.status === "amber" ? "border-l-status-amber" : "border-l-status-green",
                      active ? "bg-rr-blue-50/70" : "hover:bg-rr-mist/70",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{view.esn}</span>
                        <span className="text-[11px] text-rr-slate">
                          {view.operatorCode} · {view.tail ?? "off wing"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-rr-ink">
                        {f.damageType} · {f.stage}
                        {f.bladeNumber ? ` · aerofoil ${f.bladeNumber}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-rr-slate">
                        {formatDate(f.observedAt)} · {view.inspection.reference}
                        {delta != null ? (
                          <span className={cn("ml-1.5 rr-numeric font-semibold", delta > 0 ? "text-status-amber" : "text-status-green")}>
                            {delta > 0 ? "▲" : "▼"} {Math.abs(Number(delta.toFixed(2)))} {f.unit} vs prior
                          </span>
                        ) : (
                          <span className="ml-1.5 text-rr-slate/70">new site</span>
                        )}
                      </p>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <p className={cn("rr-numeric text-lg font-semibold leading-none", statusStyles[f.status].text)}>
                        {Math.round(f.limitRatio * 100)}%
                      </p>
                      <p className="rr-label mt-1 text-rr-slate">of limit</p>
                      <span className="mt-1.5 inline-block">
                        <StatusPill status={f.status}>{f.disposition}</StatusPill>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </Panel>

      <div className="xl:col-span-7">{selected ? <FindingDetail view={selected} /> : null}</div>
    </div>
  );
}

function FindingDetail({ view }: { view: FindingView }) {
  const f = view.finding;
  const previous = view.progression.length > 1 ? view.progression[view.progression.length - 2] : null;
  const delta = previous ? Number((f.measured - previous.measured).toFixed(2)) : null;

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="rr-label text-rr-blue">
              {view.moduleLabel} · {f.stage}
              {f.bladeNumber ? ` · aerofoil ${f.bladeNumber}` : ""}
            </p>
            <h2 className="mt-1 text-xl font-semibold capitalize text-rr-ink">{f.damageType}</h2>
            <p className="mt-1 text-xs text-rr-slate">
              <Link href={`/engines/${view.engineId}`} className="font-semibold text-rr-blue hover:underline">
                {view.esn}
              </Link>{" "}
              · {view.family} · {view.operatorName} · {view.tail ?? "off wing"} · {f.limitReference}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {f.exceedsRepairable ? <Badge className="bg-status-red-soft text-status-red">Beyond repairable limit</Badge> : null}
            {f.exceedsServiceable && !f.exceedsRepairable ? (
              <Badge className="bg-status-red-soft text-status-red">Beyond serviceable limit</Badge>
            ) : null}
            <StatusPill status={f.status} size="md">
              {f.disposition}
            </StatusPill>
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border px-4 py-3",
            statusStyles[f.status].bg,
            statusStyles[f.status].border,
          )}
        >
          <div className="max-w-2xl">
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-rr-ink">{f.recommendedAction}</p>
          </div>
          <Button variant={f.status === "red" ? "danger" : "secondary"} size="sm">
            {ACTION_LABEL[f.disposition]}
          </Button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <BorescopeFrame
            seed={f.imageSeed}
            damageType={f.damageType}
            location={f.stage}
            clockPosition={f.clockPosition}
            measurement={`${f.measured} ${f.unit}`}
            status={f.status}
            timestamp={formatDate(f.observedAt)}
            probe={view.inspection.probe}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Metric label={`Measured ${f.dimension}`} value={`${f.measured}`} unit={f.unit} status={f.status} />
              <Metric label="Of serviceable limit" value={`${Math.round(f.limitRatio * 100)}`} unit="%" status={f.status} />
              <Metric
                label="Growth rate"
                value={f.growthPerKCycles != null ? `${f.growthPerKCycles > 0 ? "+" : ""}${f.growthPerKCycles}` : "—"}
                unit={f.growthPerKCycles != null ? `${f.unit}/1k cyc` : undefined}
                status={f.growthPerKCycles != null && f.growthPerKCycles > 0 ? "amber" : "grey"}
              />
              <Metric
                label="Cycles to limit"
                value={f.cyclesToServiceableLimit != null ? formatNumber(f.cyclesToServiceableLimit) : f.exceedsServiceable ? "exceeded" : "—"}
                status={
                  f.exceedsServiceable
                    ? "red"
                    : f.cyclesToServiceableLimit != null && f.cyclesToServiceableLimit < 900
                      ? "amber"
                      : "grey"
                }
              />
            </div>
            <div>
              <p className="rr-label mb-2 text-rr-slate">Measurement against engine-manual limits</p>
              <BorescopeLimitBar
                measured={f.measured}
                serviceableLimit={f.serviceableLimit}
                repairableLimit={f.repairableLimit}
                previous={f.previousMeasured}
                unit={f.unit}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rr-ink/8 pt-3 text-[11px]">
              <Meta label="Inspection" value={view.inspection.reference} />
              <Meta label="Performed" value={formatDate(view.inspection.performedAt)} />
              <Meta label="Trigger" value={view.inspection.trigger} />
              <Meta label="Inspector" value={view.inspection.inspector} />
              <Meta label="Facility" value={view.facility} />
              <Meta label="Cycles at inspection" value={formatNumber(view.inspection.cyclesAtInspection)} />
            </dl>
          </div>
        </div>
        <p className="mt-4 border-t border-rr-ink/8 pt-3 text-xs leading-relaxed text-rr-slate">{f.notes}</p>
      </Panel>

      <Panel>
        <PanelHeader
          title="Progression against previous inspection"
          subtitle={
            previous
              ? `Same damage site (${f.trackId}) compared with ${previous.inspectionReference} on ${formatDate(previous.observedAt)}`
              : "First time this site has been recorded — no prior measurement to compare"
          }
          actions={
            delta != null ? (
              <span className={cn("rr-numeric text-sm font-semibold", delta > 0 ? "text-status-amber" : "text-status-green")}>
                {delta > 0 ? "+" : ""}
                {delta} {f.unit}
              </span>
            ) : (
              <Badge variant="outline">New site</Badge>
            )
          }
        />
        {previous ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ComparisonFrame
              caption={`Previous — ${previous.inspectionReference}`}
              seed={previous.imageSeed}
              finding={f}
              measured={previous.measured}
              ratio={previous.limitRatio}
              observedAt={previous.observedAt}
              status="grey"
            />
            <ComparisonFrame
              caption="Current inspection"
              seed={f.imageSeed}
              finding={f}
              measured={f.measured}
              ratio={f.limitRatio}
              observedAt={f.observedAt}
              status={f.status}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <p className="rr-label mb-3 text-rr-slate">Measurement history for this site</p>
          <ProgressionChart view={view} />
        </div>
      </Panel>
    </div>
  );
}

function ComparisonFrame({
  caption,
  seed,
  finding,
  measured,
  ratio,
  observedAt,
  status,
}: {
  caption: string;
  seed: string;
  finding: FindingView["finding"];
  measured: number;
  ratio: number;
  observedAt: string;
  status: "red" | "amber" | "green" | "grey";
}) {
  return (
    <div>
      <BorescopeFrame
        seed={seed}
        instance="comparison"
        damageType={finding.damageType}
        location={finding.stage}
        clockPosition={finding.clockPosition}
        measurement={`${measured} ${finding.unit}`}
        status={status}
        timestamp={formatDate(observedAt)}
      />
      <div className="mt-2 flex items-baseline justify-between">
        <p className="rr-label text-rr-slate">{caption}</p>
        <p className={cn("rr-numeric text-sm font-semibold", status === "grey" ? "text-rr-ink" : statusStyles[status].text)}>
          {measured} {finding.unit}
          <span className="ml-1.5 text-[11px] font-medium text-rr-slate">{Math.round(ratio * 100)}% of limit</span>
        </p>
      </div>
    </div>
  );
}

function ProgressionChart({ view }: { view: FindingView }) {
  const f = view.finding;
  const points = view.progression;
  const max = Math.max(f.repairableLimit * 1.05, ...points.map((p) => p.measured));

  return (
    <div className="space-y-2">
      <div className="relative flex h-32 items-end gap-3 border-b border-rr-ink/10 pl-1">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-status-amber"
          style={{ bottom: `${(f.serviceableLimit / max) * 100}%` }}
        >
          <span className="rr-label absolute -top-4 right-0 text-status-amber">serviceable {f.serviceableLimit}</span>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-status-red"
          style={{ bottom: `${(f.repairableLimit / max) * 100}%` }}
        >
          <span className="rr-label absolute -top-4 right-0 text-status-red">repairable {f.repairableLimit}</span>
        </div>
        {points.map((p, i) => {
          const isCurrent = p.findingId === f.id;
          const status = p.measured > f.repairableLimit ? "red" : p.measured > f.serviceableLimit ? "red" : p.measured >= f.serviceableLimit * 0.8 ? "amber" : "green";
          return (
            <div key={p.findingId} className="flex h-full max-w-[96px] flex-1 flex-col items-center justify-end gap-1">
              <span className={cn("rr-numeric text-[11px] font-semibold", statusStyles[status].text)}>{p.measured}</span>
              <div
                className={cn("w-full max-w-[54px] rounded-t-sm", statusStyles[status].dot, isCurrent ? "opacity-100" : "opacity-45")}
                style={{ height: `${Math.max(2, (p.measured / max) * 100)}%` }}
                title={`${p.measured} ${f.unit} on ${formatDate(p.observedAt)}`}
              />
              <span className="rr-label whitespace-nowrap text-rr-slate">{formatDate(p.observedAt).slice(0, 6)}</span>
              <span className="sr-only">{`Inspection ${i + 1}: ${p.measured} ${f.unit}`}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-rr-slate">
        {points.length} inspection{points.length === 1 ? "" : "s"} of this site
        {f.growthPerKCycles != null
          ? ` · growing ${f.growthPerKCycles} ${f.unit} per 1,000 cycles`
          : " · no growth rate until a second measurement exists"}
        {f.cyclesToServiceableLimit != null ? ` · serviceable limit reached in ~${formatNumber(f.cyclesToServiceableLimit)} cycles` : ""}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  status,
}: {
  label: string;
  value: string;
  unit?: string;
  status: "red" | "amber" | "green" | "grey";
}) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", status === "grey" ? "text-rr-ink" : statusStyles[status].text)}>
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-rr-slate">{unit}</span> : null}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className="mt-0.5 text-rr-ink">{value}</dd>
    </div>
  );
}
