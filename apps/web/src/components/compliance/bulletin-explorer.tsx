"use client";

import * as React from "react";
import Link from "next/link";
import type { ComplianceBulletin, ComplianceTask } from "@rr/types";
import { Button, Panel, PanelHeader, StatusPill, Tabs, cn, formatDate, formatNumber, formatUsd } from "@rr/ui";
import { ComplianceBar, DaysRemaining, KindBadge, MicroLabel } from "./shared";

type TabId = "outstanding" | "evidence" | "plan";

/**
 * Directory of open bulletins with the per-bulletin detail an airworthiness
 * engineer needs: applicability, effort, bundling and cost of the campaign.
 */
export function BulletinExplorer({ bulletins, tasks }: { bulletins: ComplianceBulletin[]; tasks: ComplianceTask[] }) {
  const [selectedId, setSelectedId] = React.useState<string>(bulletins[0]?.id ?? "");
  const [tab, setTab] = React.useState<TabId>("outstanding");
  const selected = bulletins.find((b) => b.id === selectedId) ?? bulletins[0];
  const bulletinTasks = React.useMemo(
    () => tasks.filter((task) => task.bulletinId === selected?.id),
    [tasks, selected?.id],
  );

  if (!selected) return null;

  const outstanding = bulletinTasks
    .filter((task) => !task.embodied)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  const embodied = bulletinTasks.filter((task) => task.embodied);
  const bundleable = outstanding.filter((task) => task.bundle !== null);

  return (
    <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel padded={false} className="overflow-hidden">
        <div className="border-b border-rr-ink/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-rr-ink">Bulletin directory</h2>
          <p className="mt-0.5 text-[11px] text-rr-slate">{bulletins.length} campaigns, worst exposure first</p>
        </div>
        <ul className="max-h-[560px] overflow-y-auto">
          {bulletins.map((bulletin) => (
            <li key={bulletin.id}>
              <button
                type="button"
                onClick={() => setSelectedId(bulletin.id)}
                aria-pressed={bulletin.id === selected.id}
                className={cn(
                  "w-full border-b border-rr-ink/5 border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
                  bulletin.status === "red" ? "border-l-status-red" : bulletin.status === "amber" ? "border-l-status-amber" : "border-l-status-green",
                  bulletin.id === selected.id ? "bg-rr-blue-50/70" : "hover:bg-rr-mist/70",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <KindBadge kind={bulletin.kind} mandatory={bulletin.mandatory} />
                    <span className="rr-numeric text-[12px] font-semibold text-rr-ink">{bulletin.reference}</span>
                  </span>
                  {bulletin.overdue > 0 ? (
                    <span className="rr-numeric text-[11px] font-semibold text-status-red">{bulletin.overdue} overdue</span>
                  ) : bulletin.dueSoon > 0 ? (
                    <span className="rr-numeric text-[11px] font-semibold text-status-amber">{bulletin.dueSoon} due</span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-[11px] text-rr-slate">{bulletin.title}</span>
                <span className="mt-2 flex items-center gap-2">
                  <ComplianceBar pct={bulletin.compliancePct} status={bulletin.status} />
                  <span className="rr-numeric w-10 shrink-0 text-right text-[10px] text-rr-slate">{bulletin.compliancePct}%</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="min-w-0 space-y-5">
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <KindBadge kind={selected.kind} mandatory={selected.mandatory} />
              <span className="rr-numeric">{selected.reference}</span>
              <span className="font-normal text-rr-slate">·</span>
              <span>{selected.title}</span>
            </span>
          }
          subtitle={`${selected.family} · issued ${formatDate(selected.issuedAt)} · compliance by ${formatDate(selected.dueAt)}`}
          actions={<StatusPill status={selected.status} size="md" />}
        />

        <div className="grid gap-4 sm:grid-cols-4">
          <Figure label="Embodied" value={`${selected.compliancePct}%`} caption={`${selected.embodied} of ${selected.applicable} engines`} />
          <Figure
            label="Outstanding"
            value={formatNumber(selected.outstanding)}
            caption={`${selected.overdue} overdue · ${selected.dueSoon} due soon`}
            status={selected.overdue > 0 ? "red" : selected.dueSoon > 0 ? "amber" : "green"}
          />
          <Figure
            label="Remaining effort"
            value={`${formatNumber(selected.outstandingLabourHours)} h`}
            caption={`${selected.labourHoursPerEngine} h per engine`}
          />
          <Figure label="Cost to close" value={formatUsd(selected.outstandingCostUsd)} caption="labour and kit, undiscounted" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border border-rr-ink/8 p-3">
            <MicroLabel>Applicability rule</MicroLabel>
            <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">{selected.applicabilityRule}</p>
          </div>
          <div className="rounded-sm border border-rr-blue/20 bg-rr-blue-50/60 p-3">
            <MicroLabel>Recommended action</MicroLabel>
            <p className="mt-1 text-[13px] leading-relaxed text-rr-ink">{selected.recommendedAction}</p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant={selected.overdue > 0 ? "danger" : "primary"}>
                {selected.overdue > 0 ? "Raise recovery campaign" : "Plan campaign"}
              </Button>
              <Button size="sm" variant="ghost">
                Export evidence pack
              </Button>
            </div>
          </div>
        </div>

        <Tabs
          tabs={[
            { id: "outstanding", label: "Outstanding engines", count: outstanding.length },
            { id: "plan", label: "Bundling plan", count: bundleable.length },
            { id: "evidence", label: "Evidence", count: embodied.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as TabId)}
        />

        {tab === "outstanding" ? <OutstandingTable tasks={outstanding.slice(0, 10)} /> : null}
        {tab === "plan" ? <BundlingTable tasks={bundleable.slice(0, 10)} /> : null}
        {tab === "evidence" ? <EvidenceTable tasks={embodied.slice(0, 10)} /> : null}
      </Panel>
    </section>
  );
}

function Figure({
  label,
  value,
  caption,
  status,
}: {
  label: string;
  value: string;
  caption: string;
  status?: "red" | "amber" | "green";
}) {
  const colour = status ? { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[status] : "text-rr-ink";
  return (
    <div>
      <MicroLabel>{label}</MicroLabel>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-slate">{caption}</p>
    </div>
  );
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rr-ink/8">
            {headers.map((header, index) => (
              <th key={header} className={cn("rr-label py-2 text-rr-slate", index === 0 ? "text-left" : "text-right")}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EngineCell({ task }: { task: ComplianceTask }) {
  return (
    <td className="py-2.5">
      <Link href={`/engines/${task.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
        {task.esn}
      </Link>
      <p className="text-[11px] text-rr-slate">
        {task.operatorCode} · {task.aircraftTail ?? "off wing"}
      </p>
    </td>
  );
}

function OutstandingTable({ tasks }: { tasks: ComplianceTask[] }) {
  if (tasks.length === 0) return <Empty message="Campaign complete — every applicable engine is embodied." />;
  return (
    <TableShell headers={["Engine", "Due", "Remaining", "Effort", "Cost", "Disposition"]}>
      {tasks.map((task) => (
        <tr key={task.id} className="border-b border-rr-ink/5 last:border-0">
          <EngineCell task={task} />
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-slate">{formatDate(task.dueAt)}</td>
          <td className="py-2.5 text-right">
            <DaysRemaining days={task.daysRemaining} />
          </td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-ink">{task.labourHours} h</td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-ink">{formatUsd(task.costUsd)}</td>
          <td className="py-2.5 text-right">
            <StatusPill status={task.status}>{task.disposition === "overdue" ? "Overdue" : task.bundle ? "Planned" : "Unplanned"}</StatusPill>
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

function BundlingTable({ tasks }: { tasks: ComplianceTask[] }) {
  if (tasks.length === 0) return <Empty message="No planned downtime available — these engines need dedicated slots." />;
  return (
    <TableShell headers={["Engine", "Shop visit", "Facility", "Input", "Margin", "Saving"]}>
      {tasks.map((task) => (
        <tr key={task.id} className="border-b border-rr-ink/5 last:border-0">
          <EngineCell task={task} />
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-ink">{task.bundle?.workOrderReference}</td>
          <td className="py-2.5 text-right text-[12px] text-rr-slate">{task.bundle?.facilityIcao}</td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-slate">
            {task.bundle ? formatDate(task.bundle.scheduledStart) : "—"}
          </td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-ink">{task.bundle?.marginDays} d</td>
          <td className="rr-numeric py-2.5 text-right text-[12px] font-semibold text-status-green">
            {task.bundle ? formatUsd(task.bundle.savingUsd) : "—"}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

function EvidenceTable({ tasks }: { tasks: ComplianceTask[] }) {
  if (tasks.length === 0) return <Empty message="No embodiment recorded against this bulletin yet." />;
  return (
    <TableShell headers={["Engine", "Certificate", "Embodied", "Facility", "Work order", "Signatory"]}>
      {tasks.map((task) => (
        <tr key={task.id} className="border-b border-rr-ink/5 last:border-0">
          <EngineCell task={task} />
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-ink">{task.evidence?.certificateRef}</td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-slate">
            {task.evidence ? formatDate(task.evidence.embodiedAt) : "—"}
          </td>
          <td className="py-2.5 text-right text-[12px] text-rr-slate">{task.evidence?.facilityIcao}</td>
          <td className="rr-numeric py-2.5 text-right text-[12px] text-rr-slate">{task.evidence?.workOrderReference ?? "—"}</td>
          <td className="py-2.5 text-right text-[12px] text-rr-slate">{task.evidence?.signatory}</td>
        </tr>
      ))}
    </TableShell>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="py-8 text-center text-xs text-rr-slate">{message}</p>;
}
