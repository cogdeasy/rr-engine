"use client";

import * as React from "react";
import Link from "next/link";
import { RISK_CONSEQUENCE_LABEL, RISK_LIKELIHOOD_LABEL } from "@rr/data";
import type { EngineRiskItem, RiskConsequenceClass, RiskMitigation, StatusLevel } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  ProgressBar,
  SearchInput,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  relativeTime,
  statusStyles,
  type Column,
} from "@rr/ui";

const CONSEQUENCE_FILTERS: RiskConsequenceClass[] = ["ifsd", "aog", "delay-cancellation", "performance"];

const MITIGATION_LABEL: Record<RiskMitigation["kind"], string> = {
  monitor: "Monitor",
  inspect: "Inspect",
  derate: "Derate",
  remove: "Remove",
};

/**
 * Ranked risk register. Selecting a row opens the evidence behind the score —
 * model drivers, confidence and the mitigation options with their residual risk.
 */
export function RiskRegister({ items }: { items: EngineRiskItem[] }) {
  const [status, setStatus] = React.useState<StatusLevel | "all">("all");
  const [consequence, setConsequence] = React.useState<RiskConsequenceClass | "all">("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(items[0]?.id ?? "");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (consequence !== "all" && item.consequenceClass !== consequence) return false;
      if (!needle) return true;
      return [item.esn, item.failureMode, item.operatorCode, item.operatorName, item.aircraftTail ?? "", item.moduleCode]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, status, consequence, query]);

  const selected = items.find((item) => item.id === selectedId) ?? rows[0] ?? items[0];

  const columns: Column<EngineRiskItem>[] = [
    {
      key: "engine",
      header: "Engine",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{row.esn}</p>
          <p className="text-[11px] text-rr-slate">
            {row.operatorCode} · {row.aircraftTail ?? "Spare"} · {row.family}
          </p>
        </div>
      ),
    },
    {
      key: "mode",
      header: "Failure mode",
      sortValue: (row) => row.failureMode,
      render: (row) => (
        <div className="max-w-[16rem]">
          <p className="text-sm text-rr-ink">{row.failureMode}</p>
          <p className="text-[11px] text-rr-slate">
            {row.moduleCode} · ATA {row.ataChapter}
          </p>
        </div>
      ),
    },
    {
      key: "probability",
      header: "P(fail)",
      align: "right",
      sortValue: (row) => row.probability,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{(row.probability * 100).toFixed(1)}%</p>
          <p className="text-[11px] text-rr-slate">{RISK_LIKELIHOOD_LABEL[row.likelihoodBand]}</p>
        </div>
      ),
    },
    {
      key: "opportunity",
      header: "To opportunity",
      align: "right",
      sortValue: (row) => row.cyclesToOpportunity,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm text-rr-ink">{formatNumber(row.cyclesToOpportunity)} cyc</p>
          <p className="max-w-[10rem] truncate text-[11px] text-rr-slate">{row.opportunityLabel}</p>
        </div>
      ),
    },
    {
      key: "consequence",
      header: "Consequence",
      sortValue: (row) => row.consequenceBand,
      render: (row) => (
        <div>
          <Badge variant={row.consequenceBand >= 3 ? "brand" : "neutral"}>{RISK_CONSEQUENCE_LABEL[row.consequenceClass]}</Badge>
          <p className="rr-numeric mt-1 text-[11px] text-rr-slate">{formatUsd(row.consequenceCostUsd)} if realised</p>
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      align: "center",
      sortValue: (row) => row.riskScore,
      render: (row) => (
        <span
          className={cn(
            "rr-numeric inline-flex h-7 w-9 items-center justify-center rounded-sm border text-sm font-semibold",
            statusStyles[row.status].bg,
            statusStyles[row.status].text,
            statusStyles[row.status].border,
          )}
        >
          {row.riskScore}
        </span>
      ),
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      sortValue: (row) => row.exposureUsd,
      render: (row) => (
        <div>
          <p className="rr-numeric text-sm font-semibold text-rr-ink">{formatUsd(row.exposureUsd)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatUsd(row.residualExposureUsd)} residual</p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Recommended",
      sortValue: (row) => row.recommendedMitigation.kind,
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-rr-blue">{MITIGATION_LABEL[row.recommendedMitigation.kind]}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {formatUsd(row.recommendedMitigation.netBenefitUsd)} net benefit
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-3">
        <FilterBar className="justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip label="All" active={status === "all"} onClick={() => setStatus("all")} count={items.length} />
            <FilterChip
              label="Intolerable"
              active={status === "red"}
              onClick={() => setStatus("red")}
              count={items.filter((i) => i.status === "red").length}
            />
            <FilterChip
              label="Watchlist"
              active={status === "amber"}
              onClick={() => setStatus("amber")}
              count={items.filter((i) => i.status === "amber").length}
            />
            <span className="mx-1 h-4 w-px bg-rr-ink/10" aria-hidden />
            <FilterChip label="Any consequence" active={consequence === "all"} onClick={() => setConsequence("all")} />
            {CONSEQUENCE_FILTERS.map((kind) => (
              <FilterChip
                key={kind}
                label={RISK_CONSEQUENCE_LABEL[kind]}
                active={consequence === kind}
                onClick={() => setConsequence(kind)}
                count={items.filter((i) => i.consequenceClass === kind).length}
              />
            ))}
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, mode, operator" />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          rowAccent={(row) =>
            row.id === selected?.id
              ? "border-l-rr-blue"
              : row.status === "red"
                ? "border-l-status-red"
                : row.status === "amber"
                  ? "border-l-status-amber"
                  : "border-l-transparent"
          }
          initialSortKey="exposure"
          dense
          emptyMessage="No scored failure modes match these filters."
        />
      </div>

      {selected ? <RiskDetail item={selected} /> : null}
    </div>
  );
}

function RiskDetail({ item }: { item: EngineRiskItem }) {
  return (
    <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Panel>
        <PanelHeader
          title={item.failureMode}
          subtitle={`${item.esn} · ${item.operatorName}`}
          actions={<StatusPill status={item.status} />}
        />
        <p className="text-xs leading-relaxed text-rr-slate">{item.rationale}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Figure label="P(fail) to opportunity" value={`${(item.probability * 100).toFixed(1)}%`} status={item.status} />
          <Figure label="Exposure" value={formatUsd(item.exposureUsd)} status={item.status} />
          <Figure label="Residual after action" value={formatUsd(item.residualExposureUsd)} status="green" />
          <Figure label="Model confidence" value={`${Math.round(item.confidence * 100)}%`} status={item.confidence < 0.6 ? "amber" : "green"} />
        </dl>

        <div className="mt-4 rounded-sm border border-rr-blue/20 bg-rr-blue-50/60 p-3">
          <p className="rr-label text-rr-blue">Recommended action</p>
          <p className="mt-1 text-sm font-semibold text-rr-ink">{item.recommendedMitigation.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-rr-slate">{item.recommendedMitigation.detail}</p>
          <p className="rr-numeric mt-2 text-xs text-rr-slate">
            {formatUsd(item.recommendedMitigation.costUsd)} cost · {item.recommendedMitigation.leadTimeDays}d lead ·{" "}
            {formatUsd(item.recommendedMitigation.netBenefitUsd)} net benefit
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm">Commit mitigation</Button>
            <Link
              href={`/engines/${item.engineId}`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-rr-blue/25 bg-white px-3 py-1.5 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
            >
              Open engine
            </Link>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Mitigation options" subtitle="Residual risk and net benefit of each intervention" />
        <ul className="space-y-2">
          {item.mitigations.map((mitigation) => (
            <li
              key={mitigation.kind}
              className={cn(
                "rounded-sm border p-3",
                mitigation.recommended ? "border-rr-blue/30 bg-rr-blue-50/40" : "border-rr-ink/8",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-rr-ink">{MITIGATION_LABEL[mitigation.kind]}</p>
                <span className={cn("rr-numeric text-xs font-semibold", statusStyles[mitigation.residualStatus].text)}>
                  {formatUsd(mitigation.residualExposureUsd)} residual
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={mitigation.effectiveness * 100} status="green" className="flex-1" />
                <span className="rr-numeric text-[11px] text-rr-slate">{Math.round(mitigation.effectiveness * 100)}% buy-down</span>
              </div>
              <p className="rr-numeric mt-1.5 text-[11px] text-rr-slate">
                {formatUsd(mitigation.costUsd)} · {mitigation.leadTimeDays}d lead ·{" "}
                <span className={mitigation.netBenefitUsd > 0 ? "text-status-green" : "text-rr-slate"}>
                  {formatUsd(mitigation.netBenefitUsd)} net
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title="Model evidence"
          subtitle={`${item.modelVersion} · scored ${relativeTime(item.computedAt)}`}
        />
        <ul className="space-y-2.5">
          {item.drivers.map((driver) => (
            <li key={driver.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-rr-ink">{driver.label}</span>
                <span className="rr-numeric text-rr-slate">{Math.round(driver.contribution * 100)}%</span>
              </div>
              <ProgressBar value={driver.contribution * 100} status={item.status === "green" ? "green" : item.status} className="mt-1" />
            </li>
          ))}
        </ul>
        <p className="rr-numeric mt-3 text-[11px] text-rr-slate">
          RUL interval {formatNumber(item.confidenceInterval.min)}–{formatNumber(item.confidenceInterval.max)} cycles
        </p>
      </Panel>
    </div>
  );
}

function Figure({ label, value, status }: { label: string; value: string; status: StatusLevel }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric mt-0.5 text-xl font-semibold", statusStyles[status].text)}>{value}</dd>
    </div>
  );
}
