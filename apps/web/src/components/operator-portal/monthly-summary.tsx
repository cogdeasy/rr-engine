import type { OperatorMonthlySummary, OperatorPortalOption } from "@rr/types";
import { Badge, Button, Panel, PanelHeader, cn, formatDate, formatNumber } from "@rr/ui";

function Figure({ label, value, unit, caption }: { label: string; value: string; unit?: string; caption?: string }) {
  return (
    <div className="border-l border-rr-ink/8 pl-4 first:border-l-0 first:pl-0">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className="rr-numeric mt-1.5 text-2xl font-semibold text-rr-ink">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-rr-slate">{unit}</span> : null}
      </p>
      {caption ? <p className="mt-1 text-[11px] text-rr-slate">{caption}</p> : null}
    </div>
  );
}

/** Monthly contract summary — presented as the pack the operator can take away. */
export function MonthlySummary({ summary, operator }: { summary: OperatorMonthlySummary; operator: OperatorPortalOption }) {
  const availabilityMet = summary.availability >= summary.availabilityTarget;
  return (
    <Panel>
      <PanelHeader
        title={`Monthly service summary — ${summary.periodLabel}`}
        subtitle={`${operator.name} · issued ${formatDate(summary.issuedAt)} · reference ${summary.reference}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">PDF · 6 pages</Badge>
            <Button variant="secondary" size="sm">
              Download summary
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 border-y border-rr-ink/8 py-5 sm:grid-cols-3 xl:grid-cols-6">
        <Figure label="Sectors flown" value={formatNumber(summary.sectors)} caption="Last 30 days" />
        <Figure label="Block hours" value={formatNumber(summary.blockHours)} unit="h" caption={`${formatNumber(summary.engineFlightHours)} EFH`} />
        <Figure label="Average derate" value={`${summary.averageDerate}`} unit="%" caption="Take-off thrust reduction" />
        <Figure label="Events completed" value={formatNumber(summary.eventsCompleted)} caption={`${summary.onTimeEventCompletionPct}% on time`} />
        <Figure label="Alerts raised" value={formatNumber(summary.alertsRaised)} caption={`${formatNumber(summary.alertsClosed)} closed to date`} />
        <Figure label="Removals planned" value={formatNumber(summary.removalsPlanned)} caption="Next 12 months" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="max-w-2xl text-xs leading-relaxed text-rr-slate">
          Contractual availability of{" "}
          <span className={cn("rr-numeric font-semibold", availabilityMet ? "text-status-green" : "text-status-amber")}>
            {summary.availability}%
          </span>{" "}
          against a target of {summary.availabilityTarget}%, with dispatch reliability at{" "}
          <span className="rr-numeric font-semibold text-rr-ink">{summary.dispatchReliability}%</span>. Full engine-by-engine
          appendices and evidence are included in the downloadable pack.
        </p>
        <Button variant="ghost" size="sm">
          Share with your team
        </Button>
      </div>
    </Panel>
  );
}
