"use client";

import * as React from "react";
import type { ExpediteOption } from "@rr/types";
import { Badge, Button, StatusPill, cn, formatDate, formatUsd } from "@rr/ui";

const METHOD_LABEL: Record<ExpediteOption["method"], string> = {
  "air-freight": "Charter air freight",
  "supplier-overtime": "Supplier weekend working",
  "alternate-source": "Release to alternate source",
  "loan-from-pool": "Loan from lease pool",
};

const RECOMMENDATION_COPY: Record<ExpediteOption["recommendation"], string> = {
  expedite: "Expedite",
  replan: "Replan slot",
  monitor: "Monitor",
};

/**
 * The action rail: for each recovery worth buying, the cost of the expedite set
 * against the delay it removes, and a one-click commitment.
 */
export function ExpediteBoard({ options }: { options: ExpediteOption[] }) {
  const [approved, setApproved] = React.useState<Record<string, boolean>>({});
  const committed = options.filter((o) => approved[o.id]);
  const committedCost = committed.reduce((sum, o) => sum + o.expediteCostUsd, 0);
  const committedBenefit = committed.reduce((sum, o) => sum + o.netBenefitUsd, 0);
  const committedDays = committed.reduce((sum, o) => sum + o.delayAvoidedDays, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {options.map((option) => {
          const isApproved = Boolean(approved[option.id]);
          const scale = Math.max(option.expediteCostUsd, option.delayCostUsd, 1);
          return (
            <article
              key={option.id}
              className={cn(
                "rr-panel flex flex-col gap-4 p-5 transition-colors",
                isApproved ? "border-status-green/40 bg-status-green-soft/30" : "border-l-2 border-l-status-red",
              )}
            >
              <header className="flex items-start justify-between gap-3">
                <div>
                  <p className="rr-label text-rr-slate">{option.workOrderReference}</p>
                  <h3 className="mt-1 text-sm font-semibold leading-snug text-rr-ink">{option.description}</h3>
                  <p className="mt-1 text-xs text-rr-slate">
                    {option.partNumber} · {option.supplier} · {option.engineEsn}
                  </p>
                </div>
                <StatusPill status={option.status}>{RECOMMENDATION_COPY[option.recommendation]}</StatusPill>
              </header>

              <div className="flex items-end gap-6">
                <div>
                  <p className="rr-label text-rr-slate">Net benefit</p>
                  <p
                    className={cn(
                      "rr-numeric text-3xl font-semibold",
                      option.netBenefitUsd > 0 ? "text-status-green" : "text-status-red",
                    )}
                  >
                    {option.netBenefitUsd > 0 ? "+" : "−"}
                    {formatUsd(Math.abs(option.netBenefitUsd))}
                  </p>
                </div>
                <div>
                  <p className="rr-label text-rr-slate">Delay avoided</p>
                  <p className="rr-numeric text-3xl font-semibold text-rr-ink">
                    {option.delayAvoidedDays}
                    <span className="ml-1 text-sm font-medium text-rr-slate">days</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <CostBar label="Delay if nothing changes" value={option.delayCostUsd} scale={scale} tone="red" />
                <CostBar label={METHOD_LABEL[option.method]} value={option.expediteCostUsd} scale={scale} tone="blue" />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-rr-slate">
                <div className="flex justify-between">
                  <dt>Decide by</dt>
                  <dd className="rr-numeric font-medium text-rr-ink">{formatDate(option.decideBy)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Confidence</dt>
                  <dd className="rr-numeric font-medium text-rr-ink">{Math.round(option.confidence * 100)}%</dd>
                </div>
              </dl>

              <div className="mt-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isApproved ? "secondary" : "primary"}
                  onClick={() => setApproved((state) => ({ ...state, [option.id]: !state[option.id] }))}
                  aria-pressed={isApproved}
                >
                  {isApproved ? "Committed" : `Commit ${formatUsd(option.expediteCostUsd)}`}
                </Button>
                <Badge variant="outline">{option.daysRecovered}d pulled in</Badge>
              </div>
            </article>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-4 border border-rr-ink/8 bg-rr-mist px-5 py-3"
        aria-live="polite"
      >
        <p className="text-xs text-rr-slate">
          {committed.length === 0
            ? "No expedites committed yet — committing here raises the purchase order amendment and notifies the shop."
            : `${committed.length} expedite${committed.length === 1 ? "" : "s"} committed.`}
        </p>
        <div className="flex items-center gap-8">
          <Figure label="Spend" value={formatUsd(committedCost)} />
          <Figure label="Delay removed" value={`${committedDays} days`} />
          <Figure label="Net benefit" value={formatUsd(committedBenefit)} tone={committedBenefit > 0 ? "green" : undefined} />
        </div>
      </div>
    </div>
  );
}

function CostBar({ label, value, scale, tone }: { label: string; value: number; scale: number; tone: "red" | "blue" }) {
  const pct = Math.max(3, Math.round((value / scale) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-rr-slate">{label}</span>
        <span className="rr-numeric font-semibold text-rr-ink">{formatUsd(value)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("h-full rounded-full", tone === "red" ? "bg-status-red" : "bg-rr-blue")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="text-right">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric text-lg font-semibold", tone === "green" ? "text-status-green" : "text-rr-ink")}>{value}</p>
    </div>
  );
}
