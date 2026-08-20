import Link from "next/link";
import {
  complianceBulletins,
  complianceByOperator,
  complianceMatrix,
  complianceOverdueRegister,
  complianceSummary,
  complianceTasks,
  COMPLIANCE_HORIZON_DAYS,
} from "@rr/data";
import type { ComplianceTask } from "@rr/types";
import { Gauge, Panel, PanelHeader, StatTile, StatusPill, cn, formatNumber, formatUsd, statusStyles } from "@rr/ui";
import { BulletinExplorer } from "@/components/compliance/bulletin-explorer";
import { ComplianceMatrix } from "@/components/compliance/compliance-matrix";
import { OverdueRegister } from "@/components/compliance/overdue-register";
import { ComplianceBar, MicroLabel } from "@/components/compliance/shared";

export const metadata = { title: "SB & AD compliance" };

const MATRIX_ENGINES = 18;

/** Keeps the client payload small: only the rows each panel can actually show. */
function bulletinDetailTasks(tasks: ComplianceTask[]): ComplianceTask[] {
  const byBulletin = new Map<string, ComplianceTask[]>();
  for (const task of tasks) {
    const list = byBulletin.get(task.bulletinId);
    if (list) list.push(task);
    else byBulletin.set(task.bulletinId, [task]);
  }
  const out: ComplianceTask[] = [];
  for (const list of byBulletin.values()) {
    const outstanding = list.filter((t) => !t.embodied).sort((a, b) => a.daysRemaining - b.daysRemaining);
    const selected = new Set<ComplianceTask>([
      ...outstanding.slice(0, 10),
      ...outstanding.filter((t) => t.bundle !== null).slice(0, 10),
      ...list.filter((t) => t.embodied).slice(0, 10),
    ]);
    out.push(...selected);
  }
  return out;
}

export default function CompliancePage() {
  const summary = complianceSummary();
  const bulletins = complianceBulletins();
  const overdue = complianceOverdueRegister();
  const operators = complianceByOperator();
  const matrix = complianceMatrix(MATRIX_ENGINES);
  const allTasks = complianceTasks();

  const matrixEngineIds = new Set(matrix.rows.map((row) => row.engineId));
  const matrixTasks = allTasks.filter((task) => matrixEngineIds.has(task.engineId));
  const explorerTasks = bulletinDetailTasks(allTasks);

  const horizonPeak = Math.max(...summary.horizon.map((bucket) => bucket.tasks), 1);
  const complianceStatus = summary.compliancePct >= 95 ? "green" : summary.compliancePct >= 80 ? "amber" : "red";
  const mandatoryOverdue = overdue.filter((task) => task.mandatory).length;

  return (
    <div className="space-y-7">
      {/* Decision-first hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · airworthiness compliance</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.overdueTasks} obligations past their limit on {summary.enginesOverdue} engines
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Service bulletin and airworthiness directive embodiment across {formatNumber(summary.enginesAffected)} affected engines and{" "}
              {summary.bulletins} live campaigns. Deadlines run on whichever limit expires first — calendar date, flight hours or
              flight cycles — and anything inside {COMPLIANCE_HORIZON_DAYS} days is on the planning watchlist.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#overdue"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Work the overdue register
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#bundling"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Bundle {summary.bundleableTasks} into planned shop visits
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Overdue" value={summary.overdueTasks} tone="red" caption={`${mandatoryOverdue} mandatory in register`} />
            <HeroStat label={`Due ≤ ${COMPLIANCE_HORIZON_DAYS}d`} value={summary.dueSoonTasks} tone="amber" caption="no slot booked yet" />
            <HeroStat label="Bundleable" value={summary.bundleableTasks} tone="green" caption="absorbed by planned work" />
            <HeroStat label="Campaigns" value={summary.bulletins} tone="grey" caption={`${summary.mandatoryBulletins} mandatory`} />
          </div>
        </div>
      </section>

      {/* Fleet compliance KPIs */}
      <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel className="flex flex-col items-center justify-center gap-3">
          <PanelHeader title="Fleet compliance rate" subtitle="Embodied share of all applicable obligations" className="w-full" />
          <Gauge value={summary.compliancePct} status={complianceStatus} label="% embodied" size={150} />
          <div className="grid w-full grid-cols-2 gap-2 text-center">
            <div className="rounded-sm bg-rr-mist px-2 py-2">
              <p className="rr-numeric text-lg font-semibold text-rr-ink">{summary.mandatoryCompliancePct}%</p>
              <p className="rr-label text-rr-slate">Mandatory</p>
            </div>
            <div className="rounded-sm bg-rr-mist px-2 py-2">
              <p className="rr-numeric text-lg font-semibold text-rr-ink">{formatNumber(summary.applicableTasks)}</p>
              <p className="rr-label text-rr-slate">Obligations</p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Overdue obligations"
            value={summary.overdueTasks}
            status="red"
            caption={`Across ${summary.enginesOverdue} engines — outside an approved compliance position`}
          />
          <StatTile
            label={`Due within ${COMPLIANCE_HORIZON_DAYS} days`}
            value={summary.dueSoonTasks}
            status={summary.dueSoonTasks > 0 ? "amber" : "green"}
            caption="Unplanned: no shop visit currently absorbs them"
          />
          <StatTile
            label="Outstanding effort"
            value={formatNumber(summary.outstandingLabourHours)}
            unit="h"
            caption={`${formatUsd(summary.outstandingCostUsd)} labour and kit to close the fleet`}
          />
          <StatTile
            label="Bundling saving"
            value={formatUsd(summary.bundleSavingUsd)}
            status="green"
            caption={`${summary.bundleableTasks} obligations fit inside planned downtime`}
          />
        </div>
      </section>

      {/* Planning horizon */}
      <Panel>
        <PanelHeader
          title="Compliance horizon"
          subtitle="Outstanding obligations by time to the governing limit, with the labour hours behind each bucket"
        />
        <div className="grid gap-4 md:grid-cols-5">
          {summary.horizon.map((bucket) => (
            <div key={bucket.id} className="rounded-sm border border-rr-ink/8 p-3">
              <div className="flex items-baseline justify-between">
                <MicroLabel>{bucket.label}</MicroLabel>
                <span className={cn("rr-numeric text-2xl font-semibold", statusStyles[bucket.status].text)}>{bucket.tasks}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                <div
                  className={cn("h-full rounded-full", statusStyles[bucket.status].dot)}
                  style={{ width: `${Math.max(3, (bucket.tasks / horizonPeak) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-rr-slate">
                <span className="rr-numeric font-semibold text-rr-ink">{formatNumber(bucket.labourHours)} h</span> of embodiment labour
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <OverdueRegister tasks={overdue} />

      <div id="bundling">
        <ComplianceMatrix matrix={matrix} tasks={matrixTasks} />
      </div>

      <BulletinExplorer bulletins={bulletins} tasks={explorerTasks} />

      {/* Operator exposure */}
      <Panel>
        <PanelHeader
          title="Compliance by operator"
          subtitle="Embodiment rate and open cost exposure per customer, worst position first"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rr-ink/8">
                <th className="rr-label py-2 text-left text-rr-slate">Operator</th>
                <th className="rr-label py-2 text-right text-rr-slate">Engines</th>
                <th className="rr-label py-2 text-right text-rr-slate">Obligations</th>
                <th className="rr-label py-2 text-right text-rr-slate">Overdue</th>
                <th className="rr-label py-2 text-right text-rr-slate">Due soon</th>
                <th className="rr-label w-56 py-2 text-left text-rr-slate">Embodied</th>
                <th className="rr-label py-2 text-right text-rr-slate">Open exposure</th>
                <th className="rr-label py-2 text-right text-rr-slate">Position</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((row) => (
                <tr key={row.operatorId} className="border-b border-rr-ink/5 last:border-0">
                  <td className={cn("border-l-2 py-2.5 pl-3", statusStyles[row.status].border.replace("border-", "border-l-"))}>
                    <p className="text-[13px] font-semibold text-rr-ink">{row.operatorName}</p>
                    <p className="text-[11px] text-rr-slate">{row.operatorCode}</p>
                  </td>
                  <td className="rr-numeric py-2.5 text-right text-rr-slate">{row.engines}</td>
                  <td className="rr-numeric py-2.5 text-right text-rr-slate">{row.applicable}</td>
                  <td className={cn("rr-numeric py-2.5 text-right font-semibold", row.overdue > 0 ? "text-status-red" : "text-rr-slate")}>
                    {row.overdue}
                  </td>
                  <td className={cn("rr-numeric py-2.5 text-right", row.dueSoon > 0 ? "font-semibold text-status-amber" : "text-rr-slate")}>
                    {row.dueSoon}
                  </td>
                  <td className="py-2.5 pr-6">
                    <div className="flex items-center gap-2">
                      <ComplianceBar pct={row.compliancePct} status={row.status} />
                      <span className="rr-numeric w-12 shrink-0 text-right text-[11px] text-rr-slate">{row.compliancePct}%</span>
                    </div>
                  </td>
                  <td className="rr-numeric py-2.5 text-right text-rr-ink">{formatUsd(row.exposureUsd)}</td>
                  <td className="py-2.5 text-right">
                    <StatusPill status={row.status}>
                      {row.overdue > 0 ? "Non-compliant" : row.dueSoon > 0 ? "Watchlist" : "Compliant"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "grey";
  caption: string;
}) {
  const colour = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
    grey: "text-white",
  }[tone];
  const dot = {
    red: "bg-status-red",
    amber: "bg-status-amber",
    green: "bg-status-green",
    grey: "bg-rr-cloud/60",
  }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
