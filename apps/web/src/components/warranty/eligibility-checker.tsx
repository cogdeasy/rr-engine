"use client";

import * as React from "react";
import type { WarrantyCoverageItem, WarrantyEligibility } from "@rr/types";
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  ProgressBar,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";

const ACCENT: Record<string, string> = {
  red: "border-status-red",
  amber: "border-status-amber",
  green: "border-status-green",
  grey: "border-status-grey",
};

/**
 * "Is this repair recoverable?" — pick a removal candidate and see, item by
 * item, what remains in warranty by hours, cycles and calendar.
 */
export function EligibilityChecker({
  candidates,
  coverLabels,
}: {
  candidates: WarrantyEligibility[];
  coverLabels: Record<string, string>;
}) {
  const [selectedId, setSelectedId] = React.useState(candidates[0]?.engineId ?? "");
  const selected = candidates.find((c) => c.engineId === selectedId) ?? candidates[0];
  if (!selected) return null;

  return (
    <Panel padded={false}>
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-b border-rr-ink/8 p-5 lg:border-b-0 lg:border-r">
          <p className="rr-label text-rr-slate">Removal candidates</p>
          <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">
            Engines with an open maintenance event or a red condition, ranked by recoverable value.
          </p>
          <ul className="mt-4 space-y-1.5" role="listbox" aria-label="Removal candidates">
            {candidates.map((candidate) => {
              const active = candidate.engineId === selected.engineId;
              return (
                <li key={candidate.engineId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(candidate.engineId)}
                    className={cn(
                      "w-full rounded-sm border-l-2 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                      ACCENT[candidate.status],
                      active ? "bg-rr-blue-50" : "hover:bg-rr-mist",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("rr-numeric text-[13px] font-semibold", active ? "text-rr-blue" : "text-rr-ink")}>
                        {candidate.esn}
                      </span>
                      <span className="rr-numeric text-[12px] font-semibold text-rr-ink">
                        {formatUsd(candidate.recoverableUsd)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-rr-slate">
                      {candidate.operatorName} · {candidate.coveredCount}/{candidate.totalCount} covered
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0 p-5">
          <PanelHeader
            title={`${selected.esn} — ${selected.family}`}
            subtitle={`${selected.operatorName} · ${selected.contractKind} · ${selected.eventSummary}${
              selected.workOrderReference ? ` · ${selected.workOrderReference}` : ""
            }`}
            actions={<StatusPill status={selected.status}>{selected.coveredCount} of {selected.totalCount} in warranty</StatusPill>}
          />

          <div className={cn("rounded-sm border-l-2 px-4 py-3", statusStyles[selected.status].bg, ACCENT[selected.status])}>
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-sm font-medium leading-snug text-rr-ink">{selected.recommendation}</p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Summary label="Recoverable today" value={formatUsd(selected.recoverableUsd)} tone="green" />
            <Summary label="Operator exposure" value={formatUsd(selected.exposureUsd)} tone={selected.exposureUsd > 0 ? "red" : undefined} />
            <Summary label="Recovery potential" value={`${selected.recoveryPotentialPct}%`} />
            <Summary
              label="Since new"
              value={`${formatNumber(selected.hoursSinceNew)} h`}
              caption={`${formatNumber(selected.cyclesSinceNew)} cycles · cover from ${formatDate(selected.coverStartsAt)}`}
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Component warranty entitlement for {selected.esn}</caption>
              <thead>
                <tr className="border-b border-rr-ink/8">
                  <th className="rr-label py-2 pr-4 text-left text-rr-slate">Component</th>
                  <th className="rr-label py-2 pr-4 text-left text-rr-slate">Cover</th>
                  <th className="rr-label py-2 pr-4 text-right text-rr-slate">Hours left</th>
                  <th className="rr-label py-2 pr-4 text-right text-rr-slate">Cycles left</th>
                  <th className="rr-label py-2 pr-6 text-right text-rr-slate">Expires</th>
                  <th className="rr-label w-44 py-2 pr-6 text-left text-rr-slate">Entitlement used</th>
                  <th className="rr-label py-2 text-right text-rr-slate">Recoverable</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((item) => (
                  <CoverageRow key={item.id} item={item} coverLabel={coverLabels[item.coverKind] ?? item.coverKind} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rr-ink/8 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand">Assessed {formatDate(selected.assessedAt)}</Badge>
              <Badge variant="outline">Limits: hours · cycles · calendar</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary">
                Raise claim for covered items
              </Button>
              <Button size="sm" variant="secondary">
                Export entitlement pack
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Every limit an item has already exhausted, not just the binding one. */
function lapsedLimits(item: WarrantyCoverageItem): string {
  const lapsed = [
    item.hoursRemaining <= 0 ? "hours" : null,
    item.cyclesRemaining <= 0 ? "cycles" : null,
    item.daysRemaining <= 0 ? "calendar" : null,
  ].filter((l): l is string => l !== null);
  return lapsed.length > 0 ? lapsed.join(" & ") : item.limitingFactor;
}

function CoverageRow({ item, coverLabel }: { item: WarrantyCoverageItem; coverLabel: string }) {
  return (
    <tr className="border-b border-rr-ink/5 last:border-0">
      <td className={cn("border-l-2 py-2.5 pl-3", ACCENT[item.status])}>
        <p className="text-[13px] font-medium text-rr-ink">{item.description}</p>
        <p className="text-[11px] text-rr-slate">
          {item.moduleCode} · {item.partNumber}
        </p>
      </td>
      <td className="py-2.5 pr-4 text-[12px] text-rr-slate">{coverLabel}</td>
      <td
        className={cn(
          "rr-numeric py-2.5 pr-4 text-right text-[13px]",
          item.hoursRemaining <= 0 ? "text-status-grey" : item.limitingFactor === "hours" ? "font-semibold text-rr-ink" : "text-rr-slate",
        )}
      >
        {item.hoursRemaining > 0 ? formatNumber(item.hoursRemaining) : "lapsed"}
      </td>
      <td
        className={cn(
          "rr-numeric py-2.5 pr-4 text-right text-[13px]",
          item.cyclesRemaining <= 0 ? "text-status-grey" : item.limitingFactor === "cycles" ? "font-semibold text-rr-ink" : "text-rr-slate",
        )}
      >
        {item.cyclesRemaining > 0 ? formatNumber(item.cyclesRemaining) : "lapsed"}
      </td>
      <td
        className={cn(
          "rr-numeric py-2.5 pr-6 text-right text-[13px]",
          item.daysRemaining <= 0 ? "text-status-grey" : item.daysRemaining < 120 ? "font-semibold text-status-amber" : "text-rr-slate",
        )}
      >
        {item.daysRemaining > 0 ? formatDate(item.expiresAt) : "lapsed"}
      </td>
      <td className="py-2.5 pr-6">
        <ProgressBar value={Math.min(100, item.consumedPct)} status={item.status === "grey" ? "grey" : item.status} />
        <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
          {item.covered ? `${Math.min(100, item.consumedPct)}% used · ${item.limitingFactor} limits` : `Lapsed on ${lapsedLimits(item)}`}
        </p>
      </td>
      <td className="py-2.5 text-right">
        {item.covered ? (
          <span className="rr-numeric text-[13px] font-semibold text-status-green">{formatUsd(item.recoverableUsd)}</span>
        ) : (
          <div>
            <span className="rr-numeric text-[13px] font-semibold text-rr-slate">—</span>
            <p className="rr-numeric text-[11px] text-status-red">{formatUsd(item.exposureUsd)} exposure</p>
          </div>
        )}
      </td>
    </tr>
  );
}

function Summary({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: "red" | "green" }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p
        className={cn(
          "rr-numeric mt-1 text-2xl font-semibold",
          tone === "green" ? "text-status-green" : tone === "red" ? "text-status-red" : "text-rr-ink",
        )}
      >
        {value}
      </p>
      {caption ? <p className="mt-0.5 text-[11px] text-rr-slate">{caption}</p> : null}
    </div>
  );
}
