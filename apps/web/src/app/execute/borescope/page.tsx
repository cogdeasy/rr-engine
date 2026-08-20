import Link from "next/link";
import {
  borescopeModuleLabel,
  borescopeSummary,
  getBorescopeModuleTrends,
  getDataset,
  getFindingProgression,
  getLatestInspections,
  getOpenBorescopeFindings,
  getReinspectionQueue,
} from "@rr/data";
import { Badge, Panel, PanelHeader, StatTile, StatusPill, cn, formatDate, formatNumber, statusStyles } from "@rr/ui";
import { BorescopeWorkspace } from "@/components/borescope/borescope-workspace";
import { ModuleTrendPanel } from "@/components/borescope/module-trend";
import { ReinspectionTable } from "@/components/borescope/reinspection-table";
import type { FindingView } from "@/components/borescope/types";

export const metadata = { title: "Borescope inspections" };

/** Size of the triage queue handed to the client; findings are worst-first. */
const QUEUE_SIZE = 120;

export default function BorescopePage() {
  const data = getDataset();
  const summary = borescopeSummary();
  const trends = getBorescopeModuleTrends();
  const reinspections = getReinspectionQueue();
  const latestInspections = getLatestInspections();
  const inspectionById = new Map(latestInspections.map((i) => [i.id, i]));

  const queue: FindingView[] = getOpenBorescopeFindings()
    .slice(0, QUEUE_SIZE)
    .map((finding) => {
      const engine = data.engines.find((e) => e.id === finding.engineId)!;
      const operator = data.operators.find((o) => o.id === engine.operatorId);
      const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
      const inspection = inspectionById.get(finding.inspectionId)!;
      const facility = data.facilities.find((f) => f.id === inspection.facilityId);
      return {
        finding,
        engineId: engine.id,
        esn: engine.esn,
        family: engine.family,
        operatorCode: operator?.code ?? "—",
        operatorName: operator?.name ?? "Unknown operator",
        tail: aircraft?.tail ?? null,
        moduleLabel: borescopeModuleLabel(finding.moduleCode),
        inspection: {
          id: inspection.id,
          reference: inspection.reference,
          performedAt: inspection.performedAt,
          trigger: inspection.trigger,
          inspector: inspection.inspector,
          probe: inspection.probe,
          cyclesAtInspection: inspection.cyclesAtInspection,
          intervalCycles: inspection.intervalCycles,
          cyclesToNextDue: inspection.cyclesToNextDue,
          overdue: inspection.overdue,
          facilityId: inspection.facilityId,
        },
        facility: facility ? `${facility.name} (${facility.icao})` : "—",
        progression: getFindingProgression(finding.id).map((f) => ({
          findingId: f.id,
          inspectionReference: `BSI ${f.inspectionId.replace("BI-", "")}`,
          observedAt: f.observedAt,
          measured: f.measured,
          limitRatio: f.limitRatio,
          imageSeed: f.imageSeed,
        })),
      };
    });

  const moduleFilters = trends.map((t) => ({ code: t.moduleCode as string, label: t.label }));
  const recentInspections = latestInspections.slice(0, 6);
  const worst = queue[0];

  return (
    <div className="space-y-7">
      {/* Decision header */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Execute · Borescope inspections</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.openExceedances} findings exceed serviceable limits on {summary.enginesWithExceedance} engines
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Every measurement below is compared against the engine-manual serviceable and repairable limits for that
              damage type and location. Red means the aerofoil is beyond limits and the engine cannot continue as found.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#triage"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Triage {summary.removalCandidates + summary.repairCandidates} out-of-limit findings
                <span aria-hidden>›</span>
              </a>
              <a
                href="#reinspection"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {summary.overdueEngines} engines overdue for re-inspection
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Remove" value={summary.removalCandidates} tone="red" caption="beyond repairable limit" />
            <HeroStat label="Repair" value={summary.repairCandidates} tone="red" caption="repair before further flight" />
            <HeroStat label="Monitor" value={summary.monitorCount} tone="amber" caption="inside limit, growing" />
            <HeroStat label="Overdue" value={summary.overdueEngines} tone="red" caption="repeat BSI past due" />
          </div>
        </div>
      </section>

      {/* Fleet position */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Inspections on record"
          value={formatNumber(summary.inspections)}
          caption={`${summary.inspectionsLast30Days} performed in the last 30 days`}
        />
        <StatTile label="Findings recorded" value={formatNumber(summary.findings)} caption="All inspections, all modules" />
        <StatTile
          label="Open exceedances"
          value={summary.openExceedances}
          status={summary.openExceedances > 0 ? "red" : "green"}
          caption="Latest inspection per engine"
        />
        <StatTile
          label="Due soon"
          value={summary.dueSoonEngines}
          status={summary.dueSoonEngines > 0 ? "amber" : "green"}
          caption="Repeat BSI inside 150 cycles"
        />
        <StatTile
          label="Median repeat interval"
          value={formatNumber(summary.medianIntervalCycles)}
          unit="cyc"
          caption="Agreed at the last inspection"
        />
      </section>

      {worst ? (
        <Panel className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-status-red bg-status-red-soft/40">
          <div>
            <p className="rr-label text-status-red">Worst finding in the fleet</p>
            <p className="mt-1 text-sm font-semibold text-rr-ink">
              {worst.esn} · {worst.finding.damageType} at {worst.finding.stage}
              {worst.finding.bladeNumber ? `, aerofoil ${worst.finding.bladeNumber}` : ""} —{" "}
              <span className="rr-numeric">{worst.finding.measured}</span> {worst.finding.unit} against a{" "}
              <span className="rr-numeric">{worst.finding.serviceableLimit}</span> {worst.finding.unit} serviceable limit
            </p>
            <p className="mt-1 text-xs text-rr-slate">{worst.finding.recommendedAction}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-status-red-soft text-status-red">
              {Math.round(worst.finding.limitRatio * 100)}% of limit
            </Badge>
            <StatusPill status={worst.finding.status} size="md">
              {worst.finding.disposition}
            </StatusPill>
          </div>
        </Panel>
      ) : null}

      {/* Triage workspace */}
      <section id="triage" className="scroll-mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Does the observed damage exceed serviceable limits?</p>
            <h2 className="mt-1 text-xl font-semibold text-rr-ink">Finding review</h2>
          </div>
          <p className="text-xs text-rr-slate">
            Showing the {queue.length} findings closest to their limit from the latest inspection of each engine
          </p>
        </div>
        <BorescopeWorkspace findings={queue} modules={moduleFilters} />
      </section>

      {/* Fleet trend + recent inspections */}
      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ModuleTrendPanel trends={trends} />
        </div>
        <Panel>
          <PanelHeader
            title="Latest inspections"
            subtitle="Most recent borescope on each engine"
            actions={
              <Link href="/execute/work-orders" className="text-xs font-semibold text-rr-blue hover:underline">
                Work orders ›
              </Link>
            }
          />
          <ul className="space-y-3">
            {recentInspections.map((inspection) => {
              const engine = data.engines.find((e) => e.id === inspection.engineId);
              return (
                <li
                  key={inspection.id}
                  className={cn("border-l-2 pl-3", statusStyles[inspection.status].border.replace("border-", "border-l-"))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium leading-snug text-rr-ink">
                      {engine?.esn} · {inspection.reference}
                    </p>
                    <StatusPill status={inspection.status}>{inspection.worstDisposition}</StatusPill>
                  </div>
                  <p className="mt-1 text-[11px] text-rr-slate">
                    {formatDate(inspection.performedAt)} · {inspection.trigger} · {inspection.modulesInspected.join(", ")}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{inspection.summary}</p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* Re-inspection queue */}
      <section id="reinspection" className="scroll-mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rr-label text-rr-blue">Repeat inspection control</p>
            <h2 className="mt-1 text-xl font-semibold text-rr-ink">Engines overdue or due for re-inspection</h2>
            <p className="mt-1 max-w-2xl text-sm text-rr-slate">
              Repeat intervals tighten automatically as findings approach their limits: a repair-band finding is
              re-scoped inside 250 cycles, a monitored finding inside 600.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-status-red-soft text-status-red">{summary.overdueEngines} overdue</Badge>
            <Badge className="bg-status-amber-soft text-status-amber">{summary.dueSoonEngines} due soon</Badge>
          </div>
        </div>
        <ReinspectionTable rows={reinspections.slice(0, 25)} />
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
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
