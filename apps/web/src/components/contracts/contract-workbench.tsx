"use client";

import * as React from "react";
import type { ContractPosition } from "@rr/types";
import {
  Badge,
  Button,
  CommitmentBar,
  GuaranteeRow,
  DataTable,
  FilterBar,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  Tabs,
  TrendChart,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
  type Column,
} from "@rr/ui";

const KIND_TABS = ["all", "TotalCare", "TotalCare Flex", "SelectCare", "Time & Materials"] as const;
type KindTab = (typeof KIND_TABS)[number];

/**
 * The contract register and the dossier for the selected contract. Interaction
 * (filtering, sorting, selection) is the only reason this is a client
 * component; every number is computed on the server from `@rr/data`.
 */
export function ContractWorkbench({ positions }: { positions: ContractPosition[] }) {
  const [kind, setKind] = React.useState<KindTab>("all");
  const [riskOnly, setRiskOnly] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(positions[0]?.contract.id ?? "");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return positions.filter((p) => {
      if (kind !== "all" && p.contract.kind !== kind) return false;
      if (riskOnly && p.status === "green") return false;
      if (!needle) return true;
      return (
        p.operator.name.toLowerCase().includes(needle) ||
        p.operator.code.toLowerCase().includes(needle) ||
        p.contract.id.toLowerCase().includes(needle) ||
        p.contract.kind.toLowerCase().includes(needle)
      );
    });
  }, [positions, kind, riskOnly, query]);

  const selected = positions.find((p) => p.contract.id === selectedId) ?? rows[0] ?? positions[0];

  const columns: Column<ContractPosition>[] = [
    {
      key: "operator",
      header: "Operator / contract",
      width: "22%",
      sortValue: (p) => p.operator.name,
      render: (p) => (
        <div>
          <p className="text-[13px] font-semibold text-rr-ink">{p.operator.name}</p>
          <p className="text-[11px] text-rr-slate">
            {p.contract.id} · {p.contract.kind} · {p.operator.region}
          </p>
        </div>
      ),
    },
    {
      key: "coverage",
      header: "Coverage",
      align: "right",
      sortValue: (p) => p.coveredEngines,
      render: (p) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{p.coveredEngines} engines</p>
          <p className="text-[11px] text-rr-slate">{p.coveredAircraft} aircraft</p>
        </div>
      ),
    },
    {
      key: "rate",
      header: "Rate / EFH",
      align: "right",
      sortValue: (p) => p.contract.ratePerEfhUsd,
      render: (p) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">${p.contract.ratePerEfhUsd.toFixed(2)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(Math.round(p.financials.annualEfh / 1000))}k EFH/yr</p>
        </div>
      ),
    },
    {
      key: "availability",
      header: "Availability vs commitment",
      width: "18%",
      sortValue: (p) => p.performance.projectedGapPts,
      render: (p) => (
        <CommitmentBar
          actual={p.performance.quarterToDate}
          target={p.contract.availabilityTarget}
          status={p.status}
        />
      ),
    },
    {
      key: "gap",
      header: "Projected gap",
      align: "right",
      sortValue: (p) => p.performance.projectedGapPts,
      render: (p) => (
        <span
          className={cn(
            "rr-numeric text-[13px] font-semibold",
            p.performance.projectedGapPts < 0 ? statusStyles[p.status].text : "text-rr-ink",
          )}
        >
          {p.performance.projectedGapPts > 0 ? "+" : ""}
          {p.performance.projectedGapPts.toFixed(2)} pts
        </span>
      ),
    },
    {
      key: "ld",
      header: "LD exposure",
      align: "right",
      sortValue: (p) => p.financials.projectedPenaltiesUsd,
      render: (p) => (
        <div>
          <p
            className={cn(
              "rr-numeric text-[13px] font-semibold",
              p.financials.projectedPenaltiesUsd > 0 ? "text-status-red" : "text-rr-ink",
            )}
          >
            {formatUsd(p.financials.projectedPenaltiesUsd)}
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatUsd(p.financials.penaltiesAccruedUsd)} accrued</p>
        </div>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      sortValue: (p) => p.financials.marginPct,
      render: (p) => (
        <div>
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{p.financials.marginPct.toFixed(1)}%</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatUsd(p.financials.marginUsd)}</p>
        </div>
      ),
    },
    {
      key: "term",
      header: "Term",
      align: "right",
      sortValue: (p) => p.termRemainingDays,
      render: (p) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{formatNumber(Math.round(p.termRemainingDays / 30))} mo left</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{p.termElapsedPct.toFixed(0)}% elapsed</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Risk",
      align: "right",
      sortValue: (p) => p.breachRisk.score,
      render: (p) => <StatusPill status={p.status}>{p.breachRisk.score}</StatusPill>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          tabs={KIND_TABS.map((id) => ({
            id,
            label: id === "all" ? "All contracts" : id,
            count: id === "all" ? positions.length : positions.filter((p) => p.contract.kind === id).length,
          }))}
          active={kind}
          onChange={(id) => setKind(id as KindTab)}
        />
        <FilterBar>
          <Button
            variant={riskOnly ? "primary" : "secondary"}
            size="sm"
            onClick={() => setRiskOnly((v) => !v)}
            aria-pressed={riskOnly}
          >
            At risk only
          </Button>
          <SearchInput value={query} onChange={setQuery} placeholder="Operator, contract id" />
        </FilterBar>
      </div>

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.contract.id}
          onRowClick={(p) => setSelectedId(p.contract.id)}
          rowAccent={(p) =>
            p.status === "red" ? "border-status-red" : p.status === "amber" ? "border-status-amber" : "border-status-green"
          }
          initialSortKey="ld"
          emptyMessage="No contracts match the current filters."
          dense
        />
        {selected ? <ContractDossier position={selected} /> : null}
      </div>
    </div>
  );
}

function ContractDossier({ position }: { position: ContractPosition }) {
  const { contract, operator, performance, financials, guarantees, breachRisk } = position;
  const termEnd = new Date(contract.endsAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title={`${operator.name} — ${contract.kind}`}
          subtitle={`${contract.id} · ${position.coveredEngines} engines · term to ${termEnd}`}
          actions={<StatusPill status={position.status}>{breachRisk.score} risk</StatusPill>}
        />
        <p className={cn("text-[13px] font-medium", statusStyles[position.status].text)}>{breachRisk.headline}</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <DossierStat label="QTD availability" value={`${performance.quarterToDate.toFixed(2)}%`} status={position.status} />
          <DossierStat label="Commitment" value={`${contract.availabilityTarget.toFixed(1)}%`} />
          <DossierStat
            label="Dispatch"
            value={`${performance.dispatchReliability.toFixed(2)}%`}
            status={performance.dispatchReliability < performance.dispatchTarget ? "amber" : "green"}
          />
        </div>

        <div className="mt-5">
          <p className="rr-label text-rr-slate">Availability, rolling 12 months</p>
          <TrendChart
            className="mt-2"
            height={130}
            series={{
              id: `${contract.id}-availability`,
              label: "Availability",
              unit: "%",
              points: performance.availabilityHistory,
              amberThreshold: contract.availabilityTarget,
            }}
          />
        </div>

        <div className={cn("mt-4 rounded-sm border p-3", statusStyles[position.status].border, statusStyles[position.status].bg)}>
          <p className="rr-label text-rr-slate">Recommended action</p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-rr-ink">{breachRisk.recommendedAction}</p>
          <p className="mt-1 text-[11px] text-rr-slate">Owner: {breachRisk.actionOwner}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm">Raise mitigation case</Button>
            <Button size="sm" variant="secondary">
              Export customer pack
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Financial position" subtitle="Term to date, and projection at term end" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <DossierStat label="Revenue accrued" value={formatUsd(financials.revenueAccruedUsd)} />
          <DossierStat label="Maintenance cost" value={formatUsd(financials.maintenanceCostUsd)} />
          <DossierStat
            label="Margin"
            value={`${financials.marginPct.toFixed(1)}%`}
            caption={formatUsd(financials.marginUsd)}
            status={financials.marginPct < 0 ? "red" : financials.marginPct < 10 ? "amber" : "green"}
          />
          <DossierStat
            label="Cost per EFH"
            value={`$${financials.costPerEfhUsd.toFixed(0)}`}
            caption={`against $${contract.ratePerEfhUsd.toFixed(0)} charged`}
            status={financials.costPerEfhUsd > contract.ratePerEfhUsd ? "red" : "green"}
          />
        </div>

        <div className="mt-5 border-t border-rr-ink/8 pt-4">
          <p className="rr-label text-rr-slate">Projected at term end</p>
          <div className="mt-3 space-y-2">
            <ProjectionRow label="Revenue" value={financials.projectedRevenueUsd} max={financials.projectedRevenueUsd} tone="brand" />
            <ProjectionRow label="Maintenance cost" value={financials.projectedCostUsd} max={financials.projectedRevenueUsd} tone="ink" />
            <ProjectionRow
              label="Liquidated damages"
              value={financials.projectedPenaltiesUsd}
              max={financials.projectedRevenueUsd}
              tone="red"
            />
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="rr-label text-rr-slate">Projected margin</span>
            <span
              className={cn(
                "rr-numeric text-2xl font-semibold",
                financials.projectedMarginUsd < 0 ? "text-status-red" : "text-rr-ink",
              )}
            >
              {formatUsd(financials.projectedMarginUsd)}
              <span className="ml-2 text-xs font-medium text-rr-slate">{financials.projectedMarginPct.toFixed(1)}%</span>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-rr-slate">
            Includes {financials.forecastShopVisits} forecast shop visit{financials.forecastShopVisits === 1 ? "" : "s"} at{" "}
            {formatUsd(financials.forecastShopVisitCostUsd)} and LD at {formatUsd(financials.ldPerTenthPtUsd)} per 0.1 pt
            shortfall per quarter.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Guarantee tracker" subtitle="Contractual guarantees against fleet actuals" />
        <div>
          {guarantees.map((g) => (
            <GuaranteeRow
              key={g.id}
              label={g.label}
              unit={g.unit}
              guaranteed={g.guaranteed}
              actual={g.actual}
              headroomPct={g.headroomPct}
              status={g.status}
              basis={g.basis}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Why this rating" subtitle="Drivers behind the breach-risk score" />
        {breachRisk.drivers.length === 0 ? (
          <p className="text-[13px] text-rr-slate">No adverse drivers — contract is performing above commitment.</p>
        ) : (
          <ul className="space-y-3">
            {breachRisk.drivers.map((driver) => (
              <li key={driver.label} className="flex items-start gap-2.5">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[driver.status].dot)} aria-hidden />
                <div>
                  <p className="text-[13px] font-medium text-rr-ink">{driver.label}</p>
                  <p className="text-[11px] leading-snug text-rr-slate">{driver.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {position.families.map((family) => (
            <Badge key={family} variant="outline">
              {family}
            </Badge>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function DossierStat({
  label,
  value,
  caption,
  status,
}: {
  label: string;
  value: string;
  caption?: string;
  status?: ContractPosition["status"];
}) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>{value}</p>
      {caption ? <p className="text-[11px] text-rr-slate">{caption}</p> : null}
    </div>
  );
}

function ProjectionRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "brand" | "ink" | "red";
}) {
  const width = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const fill = { brand: "bg-rr-blue", ink: "bg-rr-ink/60", red: "bg-status-red" }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-rr-slate">{label}</span>
        <span className="rr-numeric font-semibold text-rr-ink">{formatUsd(value)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
