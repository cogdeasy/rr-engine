import Link from "next/link";
import { Badge, Panel, PanelHeader, StatTile, StatusPill, formatDate, statusStyles, cn } from "@rr/ui";
import { buildReportFacts, listScheduledReports, reportsOverview, resolveReportPeriod, REPORT_DEFINITIONS } from "@rr/data";
import { ReportWorkbench } from "@/components/reports/report-workbench";
import { ScheduleTable } from "@/components/reports/schedule-table";

export const metadata = { title: "Reports & exports" };

export default function Page() {
  const facts = buildReportFacts();
  const schedules = listScheduledReports(facts);
  const overview = reportsOverview(facts, schedules);
  const period = resolveReportPeriod("last-30-days", facts.generatedAt);
  const weekEndIso = new Date(new Date(facts.generatedAt).getTime() + 7 * 86_400_000).toISOString();

  const families = [...new Set(facts.engines.map((engine) => engine.family))].sort();
  const failing = schedules.filter((schedule) => schedule.status === "red");
  const lateRuns = schedules.filter((schedule) => schedule.status === "amber");
  const redOperators = facts.operators
    .map((operator) => ({
      operator,
      red: facts.engines.filter((engine) => engine.operatorId === operator.id && engine.status === "red").length,
      engines: facts.engines.filter((engine) => engine.operatorId === operator.id).length,
    }))
    .filter((entry) => entry.red > 0)
    .sort((a, b) => b.red - a.red)
    .slice(0, 4);

  const actions = [
    ...failing.slice(0, 2).map((schedule) => ({
      id: schedule.id,
      status: "red" as const,
      title: `${schedule.name} did not deliver`,
      why: schedule.note,
      action: "Re-run the pack from the builder and re-issue as CSV to the recipient list.",
    })),
    ...redOperators.slice(0, 2).map((entry) => ({
      id: entry.operator.id,
      status: "red" as const,
      title: `${entry.operator.name}: ${entry.red} red engine(s) in the monthly review`,
      why: `${entry.red} of ${entry.engines} engines are red, so the review pack opens on an exceptions page.`,
      action: "Build the operator monthly review and include the exceptions and agreed-actions sections.",
    })),
    ...lateRuns.slice(0, 1).map((schedule) => ({
      id: schedule.id,
      status: "amber" as const,
      title: `${schedule.name} ran late`,
      why: schedule.note,
      action: "Confirm the next run window with the account manager before the review meeting.",
    })),
  ].slice(0, 4);

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient rr-grid-lines relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · Reports &amp; exports</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {overview.dueThisWeek} customer packs due this week, {overview.failed} failed to deliver
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Assemble this month&apos;s review pack from live fleet data: choose the report, scope it to an operator,
              family and period, then export as CSV or print the pack. Every figure below is computed from the fleet
              record — nothing is transcribed by hand.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#builder"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Build this month&apos;s pack
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#schedules"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {overview.scheduled} scheduled reports
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Failed runs" value={overview.failed} tone="red" caption="re-issue required" />
            <HeroStat label="Late runs" value={overview.late} tone="amber" caption="missed window" />
            <HeroStat label="Due this week" value={overview.dueThisWeek} tone="green" caption="on schedule" />
            <HeroStat label="Operators" value={overview.operatorsCovered} tone="neutral" caption="covered by a pack" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Exceptions to explain"
          value={overview.exceptionsOpen}
          status={overview.exceptionsOpen > 0 ? "red" : "green"}
          caption="Red engines that must appear in a customer pack"
        />
        <StatTile
          label="Findings in last 30 days"
          value={facts.alerts.filter((alert) => alert.raisedAt >= period.fromIso).length}
          status="amber"
          caption="Alerts raised inside the default reporting window"
        />
        <StatTile
          label="Reports in catalogue"
          value={REPORT_DEFINITIONS.length}
          caption="Fleet health, monthly review, reliability, cost, compliance"
        />
        <StatTile
          label="Next scheduled run"
          value={formatDate(overview.nextRunAt)}
          caption={`Fleet data generated ${formatDate(facts.generatedAt)}`}
        />
      </section>

      <Panel>
        <PanelHeader
          title="Recommended actions before the review"
          subtitle="Derived from delivery failures and red engines that will surface in a customer pack"
          actions={<Badge variant="outline">{actions.length} open</Badge>}
        />
        <ul className="grid gap-3 lg:grid-cols-2">
          {actions.map((action) => (
            <li
              key={`${action.id}-${action.title}`}
              className={cn("rounded-sm border border-rr-ink/8 border-l-2 bg-surface px-4 py-3", statusStyles[action.status].border.replace("border-", "border-l-"))}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-semibold text-rr-ink">{action.title}</p>
                <StatusPill status={action.status}>{action.status === "red" ? "Act now" : "Watch"}</StatusPill>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-rr-slate">Why · {action.why}</p>
              <p className="mt-1 text-xs font-medium text-rr-blue">Do · {action.action}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <section id="builder" className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-slate">Report builder</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rr-ink">Scope the pack and preview exactly what the customer receives</h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-rr-slate">
            The preview is the deliverable: CSV export flattens the same sections, and printing produces the paper pack.
          </p>
        </div>
        <ReportWorkbench facts={facts} families={families} />
      </section>

      <section id="schedules" className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-slate">Distribution</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rr-ink">Scheduled reports, recipients and last-run status</h2>
          </div>
          <p className="text-xs text-rr-slate">
            {overview.failed} failed · {overview.late} late · {overview.scheduled} total
          </p>
        </div>
        <ScheduleTable schedules={schedules} weekEndIso={weekEndIso} />
      </section>
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
  value: number | string;
  tone: "red" | "amber" | "green" | "neutral";
  caption: string;
}) {
  return (
    <div>
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p
        className={cn(
          "rr-numeric mt-1 text-4xl font-semibold leading-none",
          tone === "red" && "text-status-red",
          tone === "amber" && "text-status-amber",
          tone === "green" && "text-status-green",
          tone === "neutral" && "text-white",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}
