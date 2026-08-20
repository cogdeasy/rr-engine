"use client";

import * as React from "react";
import Link from "next/link";
import type { ComplianceTask } from "@rr/types";
import { Button, DataTable, FilterBar, SearchInput, StatusPill, cn, formatDate, formatUsd, type Column } from "@rr/ui";
import { DaysRemaining, KindBadge, LIMIT_LABEL } from "./shared";

type KindFilter = "all" | "mandatory" | "AD" | "ASB" | "SB";

const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All overdue" },
  { id: "mandatory", label: "Mandatory only" },
  { id: "AD", label: "Airworthiness directives" },
  { id: "ASB", label: "Alert bulletins" },
  { id: "SB", label: "Service bulletins" },
];

/**
 * The immediate-action register: every obligation whose governing limit has
 * already expired. Sorted mandatory-first, then by how long it has been late.
 */
export function OverdueRegister({ tasks }: { tasks: ComplianceTask[] }) {
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (kind === "mandatory" && !task.mandatory) return false;
      if (kind !== "all" && kind !== "mandatory" && task.kind !== kind) return false;
      if (!needle) return true;
      return (
        task.esn.toLowerCase().includes(needle) ||
        task.reference.toLowerCase().includes(needle) ||
        task.operatorName.toLowerCase().includes(needle) ||
        (task.aircraftTail?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [tasks, kind, query]);

  const columns: Column<ComplianceTask>[] = [
    {
      key: "engine",
      header: "Engine",
      width: "17%",
      sortValue: (row) => row.esn,
      render: (row) => (
        <div>
          <Link href={`/engines/${row.engineId}`} className="font-semibold text-rr-ink hover:text-rr-blue">
            {row.esn}
          </Link>
          <p className="text-[11px] text-rr-slate">
            {row.aircraftTail ?? "off wing"} · {row.family}
          </p>
        </div>
      ),
    },
    {
      key: "operator",
      header: "Operator",
      width: "12%",
      sortValue: (row) => row.operatorName,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.operatorCode}</p>
          <p className="text-[11px] text-rr-slate">{row.operatorName}</p>
        </div>
      ),
    },
    {
      key: "bulletin",
      header: "Bulletin",
      width: "24%",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div>
          <span className="flex items-center gap-2">
            <KindBadge kind={row.kind} mandatory={row.mandatory} />
            <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{row.reference}</span>
          </span>
          <p className="mt-0.5 truncate text-[11px] text-rr-slate">{row.title}</p>
        </div>
      ),
    },
    {
      key: "limit",
      header: "Governing limit",
      width: "13%",
      sortValue: (row) => row.drivingLimit,
      render: (row) => (
        <div>
          <p className="text-[12px] text-rr-ink">{LIMIT_LABEL[row.drivingLimit]}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">due {formatDate(row.dueAt)}</p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Exceedance",
      align: "right",
      width: "10%",
      sortValue: (row) => -row.daysRemaining,
      render: (row) => <DaysRemaining days={row.daysRemaining} className="text-base" />,
    },
    {
      key: "effort",
      header: "Effort / cost",
      align: "right",
      width: "10%",
      sortValue: (row) => row.costUsd,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{row.labourHours} h</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatUsd(row.costUsd)}</p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      width: "14%",
      render: (row) => (
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-[11px] leading-snug text-rr-slate">{row.recommendedAction}</p>
          <Button size="sm" variant={row.mandatory ? "danger" : "secondary"}>
            {row.bundle ? "Attach to shop visit" : "Raise work order"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section id="overdue" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-rr-ink">Overdue register</h2>
          <p className="mt-1 text-xs text-rr-slate">
            Red because the governing limit has already been exceeded — these engines are operating outside an approved
            compliance position and need a work order today.
          </p>
        </div>
        <FilterBar>
          <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail, bulletin" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter overdue register by bulletin class">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setKind(filter.id)}
                aria-pressed={kind === filter.id}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  kind === filter.id
                    ? "border-rr-blue bg-rr-blue text-white"
                    : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </FilterBar>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowAccent={() => "border-status-red"}
        initialSortKey="days"
        emptyMessage="No overdue obligations match this filter."
      />

      <div className="flex items-center gap-3 text-[11px] text-rr-slate">
        <StatusPill status="red">{rows.length} shown</StatusPill>
        <span>
          Mandatory items (AD / ASB) carry an airworthiness limitation: continued operation past the limit requires an
          approved alternative means of compliance.
        </span>
      </div>
    </section>
  );
}
