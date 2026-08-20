"use client";

import * as React from "react";
import { Badge, Panel, PanelHeader, StatusPill, cn, formatNumber, statusStyles } from "@rr/ui";
import type { WeibullFit } from "@rr/types";

const REGIME_COPY: Record<WeibullFit["regime"], string> = {
  "infant-mortality": "β<1 — failures cluster early, suspect build or repair quality",
  random: "β≈1 — constant hazard, condition monitoring is the right control",
  "wear-out": "β>1 — hazard rises with life, inspection intervals bite",
};

/** Survival curve and characteristic life for each major failure mode. */
export function WeibullExplorer({ fits }: { fits: WeibullFit[] }) {
  const [activeId, setActiveId] = React.useState(fits[0]?.id ?? "");
  const fit = fits.find((f) => f.id === activeId) ?? fits[0];
  if (!fit) return null;

  const width = 620;
  const height = 220;
  const maxCycles = fit.curve[fit.curve.length - 1]?.cycles || 1;
  const x = (cycles: number) => (cycles / maxCycles) * width;
  const y = (reliability: number) => height - reliability * (height - 12);
  const line = fit.curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cycles).toFixed(1)},${y(p.reliability).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <Panel className="xl:col-span-2" padded={false}>
        <PanelHeader
          className="p-5 pb-3"
          title="Failure modes by predicted survival"
          subtitle="Weibull fitted by median-rank regression on observed lives"
        />
        <ul className="max-h-[420px] overflow-y-auto">
          {fits.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => setActiveId(candidate.id)}
                aria-pressed={candidate.id === fit.id}
                className={cn(
                  "flex w-full items-center gap-3 border-l-2 px-5 py-2.5 text-left transition-colors hover:bg-rr-blue-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
                  statusStyles[candidate.status].border.replace("border-", "border-l-"),
                  candidate.id === fit.id ? "bg-rr-blue-50/70" : "bg-transparent",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-rr-ink">{candidate.failureMode}</span>
                  <span className="block text-[11px] text-rr-slate">
                    β {candidate.beta} · η {formatNumber(candidate.etaCycles)} cyc · {candidate.samples} events
                  </span>
                </span>
                <span className={cn("rr-numeric text-[13px] font-semibold", statusStyles[candidate.status].text)}>
                  {candidate.fleetSurvivalPct}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="xl:col-span-3">
        <PanelHeader
          title={fit.failureMode}
          subtitle={REGIME_COPY[fit.regime]}
          actions={<StatusPill status={fit.status}>{fit.regime.replace("-", " ")}</StatusPill>}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Characteristic life η" value={`${formatNumber(fit.etaCycles)}`} caption="cycles, 63.2% failed" />
          <Stat label="B10 life" value={`${formatNumber(fit.b10Cycles)}`} caption="cycles, 10% failed" />
          <Stat label="Median life" value={`${formatNumber(fit.medianLifeCycles)}`} caption="cycles, 50% failed" />
          <Stat label="Fleet survival" value={`${fit.fleetSurvivalPct}%`} caption="at current cycles" status={fit.status} />
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="mt-5 w-full"
          style={{ height: 210 }}
          role="img"
          aria-label={`Survival curve for ${fit.failureMode}`}
        >
          <defs>
            <linearGradient id={`weibull-${fit.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10069f" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10069f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="#05061f" strokeOpacity={0.06} />
          ))}
          <line x1={x(fit.b10Cycles)} x2={x(fit.b10Cycles)} y1={0} y2={height} stroke="#f08c00" strokeDasharray="5 4" strokeWidth={1.2} />
          <line x1={x(fit.etaCycles)} x2={x(fit.etaCycles)} y1={0} y2={height} stroke="#d81e2b" strokeDasharray="5 4" strokeWidth={1.2} />
          <path d={area} fill={`url(#weibull-${fit.id})`} />
          <path d={line} fill="none" stroke="#10069f" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[11px] text-rr-slate">
          <span>0 cycles since overhaul</span>
          <span className="text-status-amber">B10 {formatNumber(fit.b10Cycles)}</span>
          <span className="text-status-red">η {formatNumber(fit.etaCycles)}</span>
          <span>{formatNumber(maxCycles)} cycles</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-rr-slate">
          <Badge variant="brand">R² {fit.rSquared}</Badge>
          <Badge variant="outline">{fit.samples} observed events</Badge>
          <span>
            {formatNumber(fit.enginesPastB10)} engines are already past B10 for this mode — the population an inspection
            campaign would cover.
          </span>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, caption, status }: { label: string; value: string; caption: string; status?: WeibullFit["status"] }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>{value}</p>
      <p className="text-[11px] text-rr-slate">{caption}</p>
    </div>
  );
}
