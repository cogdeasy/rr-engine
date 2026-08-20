"use client";

import * as React from "react";
import Link from "next/link";
import type { ComplianceMatrix as Matrix, ComplianceMatrixCell, ComplianceTask } from "@rr/types";
import { Badge, Button, Panel, PanelHeader, SearchInput, StatusPill, cn, formatDate, formatUsd } from "@rr/ui";
import { ComplianceBar, DISPOSITION_LABEL, DaysRemaining, KindBadge, LIMIT_LABEL, MicroLabel } from "./shared";

type RowFilter = "all" | "exposed" | "overdue";

const CELL_STYLE: Record<string, string> = {
  overdue: "bg-status-red text-white hover:brightness-110",
  "due-soon": "bg-status-amber text-white hover:brightness-110",
  planned: "bg-status-green-soft text-status-green hover:bg-status-green/25",
  embodied: "bg-status-green text-white hover:brightness-110",
  "not-applicable": "bg-rr-mist text-rr-slate/50",
};

/**
 * Engine x bulletin compliance grid. Every coloured cell is one engine-level
 * obligation; selecting a cell opens the obligation detail beside the grid.
 */
export function ComplianceMatrix({ matrix, tasks }: { matrix: Matrix; tasks: ComplianceTask[] }) {
  const taskById = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [filter, setFilter] = React.useState<RowFilter>("exposed");
  const [query, setQuery] = React.useState("");
  const firstExposed = matrix.rows.find((row) => row.overdue > 0) ?? matrix.rows[0];
  const initialCell = firstExposed?.cells.find((cell) => cell.disposition === "overdue") ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(initialCell?.taskId ?? null);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matrix.rows.filter((row) => {
      if (filter === "overdue" && row.overdue === 0) return false;
      if (filter === "exposed" && row.overdue === 0 && row.dueSoon === 0) return false;
      if (!needle) return true;
      return (
        row.esn.toLowerCase().includes(needle) ||
        row.operatorCode.toLowerCase().includes(needle) ||
        (row.aircraftTail?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [matrix.rows, filter, query]);

  const selected = selectedId ? (taskById.get(selectedId) ?? null) : null;

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel className="min-w-0">
        <PanelHeader
          title="Compliance matrix"
          subtitle="Engines ranked by exposure against every open bulletin. Select a cell for the obligation detail."
          actions={
            <div className="flex items-center gap-2">
              <SearchInput value={query} onChange={setQuery} placeholder="ESN, tail, operator" className="w-44" />
              <div className="flex gap-1" role="group" aria-label="Filter matrix rows">
                {(
                  [
                    { id: "overdue", label: "Overdue" },
                    { id: "exposed", label: "Exposed" },
                    { id: "all", label: "All" },
                  ] as { id: RowFilter; label: string }[]
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={filter === option.id}
                    onClick={() => setFilter(option.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      filter === option.id
                        ? "border-rr-blue bg-rr-blue text-white"
                        : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="rr-label sticky left-0 z-10 bg-white pb-2 pr-3 text-left align-bottom text-rr-slate">Engine</th>
                {matrix.bulletins.map((bulletin) => (
                  <th key={bulletin.id} className="px-0.5 pb-2 align-bottom">
                    <span
                      className="rr-numeric block h-24 whitespace-nowrap text-[10px] font-semibold text-rr-slate"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                      title={bulletin.reference}
                    >
                      {bulletin.reference}
                    </span>
                  </th>
                ))}
                <th className="rr-label pb-2 pl-3 text-right align-bottom text-rr-slate">Embodied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.engineId} className="group">
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-l-2 bg-white py-1 pl-2 pr-3 text-left font-normal group-hover:bg-rr-blue-50/50",
                      row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : "border-status-green",
                    )}
                  >
                    <Link href={`/engines/${row.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                      {row.esn}
                    </Link>
                    <span className="block text-[10px] text-rr-slate">
                      {row.operatorCode} · {row.aircraftTail ?? "off wing"}
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <MatrixCell
                      key={`${row.engineId}:${cell.bulletinId}`}
                      cell={cell}
                      esn={row.esn}
                      selected={cell.taskId !== null && cell.taskId === selectedId}
                      onSelect={() => cell.taskId && setSelectedId(cell.taskId)}
                    />
                  ))}
                  <td className="w-24 py-1 pl-3">
                    <div className="flex items-center justify-end gap-2">
                      <ComplianceBar pct={row.compliancePct} status={row.status} />
                      <span className="rr-numeric w-10 shrink-0 text-right text-[11px] text-rr-slate">{row.compliancePct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
          <MicroLabel>Legend</MicroLabel>
          <LegendSwatch className="bg-status-red" label="Overdue — act now" />
          <LegendSwatch className="bg-status-amber" label="Due inside 90 days" />
          <LegendSwatch className="bg-status-green-soft border border-status-green/40" label="Planned or absorbed by a shop visit" />
          <LegendSwatch className="bg-status-green" label="Embodied" />
          <LegendSwatch className="bg-rr-mist" label="Not applicable" />
        </div>
      </Panel>

      <TaskDetail task={selected} />
    </section>
  );
}

function MatrixCell({
  cell,
  esn,
  selected,
  onSelect,
}: {
  cell: ComplianceMatrixCell;
  esn: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = `${esn} · ${DISPOSITION_LABEL[cell.disposition]}${
    cell.daysRemaining === null ? "" : cell.daysRemaining < 0 ? `, ${Math.abs(cell.daysRemaining)} days late` : `, ${cell.daysRemaining} days remaining`
  }`;
  if (cell.taskId === null) {
    return (
      <td className="px-0.5 py-1">
        <span className={cn("block h-7 w-7 rounded-sm", CELL_STYLE["not-applicable"])} aria-hidden />
      </td>
    );
  }
  return (
    <td className="px-0.5 py-1">
      <button
        type="button"
        onClick={onSelect}
        title={label}
        aria-label={label}
        aria-pressed={selected}
        className={cn(
          "rr-numeric flex h-7 w-7 items-center justify-center rounded-sm text-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rr-blue",
          CELL_STYLE[cell.disposition],
          selected && "ring-2 ring-rr-blue ring-offset-1",
        )}
      >
        {cell.disposition === "overdue" || cell.disposition === "due-soon" ? Math.abs(cell.daysRemaining ?? 0) : ""}
      </button>
    </td>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

function TaskDetail({ task }: { task: ComplianceTask | null }) {
  if (!task) {
    return (
      <Panel className="flex items-center justify-center text-center">
        <p className="max-w-[220px] text-xs text-rr-slate">Select a cell in the matrix to inspect the obligation, its limits and its evidence.</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="flex items-center gap-2">
            <KindBadge kind={task.kind} mandatory={task.mandatory} />
            <span className="rr-numeric text-sm font-semibold text-rr-ink">{task.reference}</span>
          </span>
          <p className="mt-1 text-[13px] leading-snug text-rr-slate">{task.title}</p>
        </div>
        <StatusPill status={task.status}>{DISPOSITION_LABEL[task.disposition]}</StatusPill>
      </div>

      <div className="rounded-sm bg-rr-mist/70 p-3">
        <MicroLabel>Engine</MicroLabel>
        <Link href={`/engines/${task.engineId}`} className="text-sm font-semibold text-rr-ink hover:text-rr-blue">
          {task.esn}
        </Link>
        <p className="text-[11px] text-rr-slate">
          {task.operatorName} · {task.aircraftTail ?? "off wing"} · {task.family}
        </p>
      </div>

      <div>
        <MicroLabel>Governing limit</MicroLabel>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[13px] text-rr-ink">{LIMIT_LABEL[task.drivingLimit]}</span>
          <DaysRemaining days={task.daysRemaining} className="text-lg" />
        </div>
        <dl className="mt-2 space-y-1 text-[11px] text-rr-slate">
          <Row label="Calendar deadline" value={formatDate(task.dueAt)} />
          <Row
            label="Hours limit"
            value={task.hoursLimit === null ? "not imposed" : `${task.hoursRemaining} h remaining of ${task.hoursLimit} h`}
          />
          <Row
            label="Cycles limit"
            value={task.cyclesLimit === null ? "not imposed" : `${task.cyclesRemaining} cyc remaining of ${task.cyclesLimit} cyc`}
          />
        </dl>
      </div>

      <div>
        <MicroLabel>Embodiment</MicroLabel>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <p className="rr-numeric text-lg font-semibold text-rr-ink">{task.labourHours} h</p>
            <p className="text-[11px] text-rr-slate">estimated effort</p>
          </div>
          <div>
            <p className="rr-numeric text-lg font-semibold text-rr-ink">{formatUsd(task.costUsd)}</p>
            <p className="text-[11px] text-rr-slate">labour and kit</p>
          </div>
        </div>
      </div>

      {task.bundle ? (
        <div className="rounded-sm border border-rr-blue/20 bg-rr-blue-50/70 p-3">
          <MicroLabel>Bundling opportunity</MicroLabel>
          <p className="mt-1 text-[13px] font-semibold text-rr-ink">{task.bundle.workOrderReference}</p>
          <p className="text-[11px] text-rr-slate">
            {task.bundle.facilityIcao} · input {formatDate(task.bundle.scheduledStart)} · {task.bundle.marginDays} days before the limit
          </p>
          <p className="mt-2 text-[11px] text-rr-slate">
            Embodying inside this shop visit avoids <span className="rr-numeric font-semibold text-rr-ink">{formatUsd(task.bundle.savingUsd)}</span> of
            access and out-of-service cost.
          </p>
        </div>
      ) : null}

      {task.evidence ? (
        <div className="rounded-sm border border-status-green/25 bg-status-green-soft/60 p-3">
          <MicroLabel>Evidence of accomplishment</MicroLabel>
          <p className="rr-numeric mt-1 text-[13px] font-semibold text-rr-ink">{task.evidence.certificateRef}</p>
          <p className="text-[11px] text-rr-slate">
            {formatDate(task.evidence.embodiedAt)} · {task.evidence.facilityIcao}
            {task.evidence.workOrderReference ? ` · ${task.evidence.workOrderReference}` : ""}
          </p>
          <p className="text-[11px] text-rr-slate">Signed {task.evidence.signatory}</p>
        </div>
      ) : null}

      <div className="border-t border-rr-ink/8 pt-3">
        <MicroLabel>Recommended action</MicroLabel>
        <p className="mt-1 text-[12px] leading-relaxed text-rr-ink">{task.recommendedAction}</p>
        {task.embodied ? (
          <Badge variant="brand" className="mt-3">
            Compliance position closed
          </Badge>
        ) : (
          <Button size="sm" variant={task.disposition === "overdue" ? "danger" : "primary"} className="mt-3">
            {task.bundle ? "Attach to shop visit" : "Raise work order"}
          </Button>
        )}
      </div>
    </Panel>
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
