import type { ReactNode } from "react";
import { Badge, Panel, PanelHeader, SectionHeading, StatusPill, cn, formatNumber, formatDate, statusStyles } from "@rr/ui";
import { buildRecordSummaries, buildRecordsFleetSummary, engineBuildRecord, getDataset } from "@rr/data";
import { EnginePicker } from "@/components/build-records/engine-picker";
import { RecordTabs } from "@/components/build-records/record-tabs";

export const metadata = { title: "Build records" };

export default async function BuildRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string }>;
}) {
  const params = await searchParams;
  const summaries = buildRecordSummaries();
  const fleet = buildRecordsFleetSummary();
  const selectedId = params.engine ?? summaries[0]?.engineId ?? "";
  const record = engineBuildRecord(selectedId) ?? engineBuildRecord(summaries[0]?.engineId ?? "");
  const facilities = getDataset().facilities.map((f) => ({ id: f.id, name: f.name, icao: f.icao }));

  if (!record) {
    return (
      <SectionHeading
        eyebrow="Execute"
        title="Build records"
        description="No engine configuration records are available for the current fleet."
      />
    );
  }

  const buildFacility = facilities.find((f) => f.id === record.lastBuildFacilityId);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Execute"
        title="Build records"
        description="The as-built configuration of every managed engine: module serials, build standards, bulletin embodiment and back-to-birth part traceability."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="brand">{formatNumber(fleet.engines)} engines</Badge>
            <Badge variant="outline">Config baseline {formatDate(record.lastBuildAt)}</Badge>
          </div>
        }
      />

      {/* Decision-first hero for the selected engine */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-8 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">What is installed in this engine right now</p>
            <h2 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold leading-tight tracking-tight">
              {record.esn}
              <StatusPill status={record.configurationStatus} size="md">
                {record.configurationStatus === "red"
                  ? "Configuration action required"
                  : record.configurationStatus === "amber"
                    ? "Off fleet standard"
                    : "At fleet standard"}
              </StatusPill>
            </h2>
            <p className="mt-2 text-sm text-rr-cloud">
              {record.family} · {record.operatorName} · {record.aircraftTail ?? "off wing"} · build standard{" "}
              <span className="rr-numeric text-white">{record.buildStandard}</span>
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-rr-cloud/70">Recommended action</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-white">{record.recommendedAction}</p>
            <p className="mt-4 text-[11px] text-rr-cloud/70">
              Last full build {formatDate(record.lastBuildAt)} at {buildFacility?.name ?? "—"} ·{" "}
              {formatNumber(record.cyclesSinceOverhaul)} cycles since overhaul · {formatNumber(record.totalFlightCycles)} cycles
              since new
            </p>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat
              label="Conformance"
              value={`${record.conformancePct}%`}
              tone={record.conformancePct === 100 ? "green" : "amber"}
              caption={`${record.modules.length - record.supersededCount - record.nonStandardCount} of ${record.modules.length} modules at standard`}
            />
            <HeroStat
              label="Superseded"
              value={record.supersededCount}
              tone={record.supersededCount > 0 ? "amber" : "green"}
              caption="modules behind fleet standard"
            />
            <HeroStat
              label="Trace gaps"
              value={record.traceGapCount}
              tone={record.traceGapCount > 0 ? "red" : "green"}
              caption="parts without release certificate"
            />
            <HeroStat
              label="Overdue SB"
              value={record.overdueBulletinCount}
              tone={record.overdueBulletinCount > 0 ? "red" : "green"}
              caption="mandatory, compliance date passed"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecordTabs record={record} facilities={facilities} />

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Fleet configuration" subtitle="Where the managed fleet stands against published standards" />
            <dl className="space-y-2.5">
              <FleetRow label="Engines at standard" value={fleet.atStandard} total={fleet.engines} status="green" />
              <FleetRow label="Superseded hardware" value={fleet.superseded} total={fleet.engines} status="amber" />
              <FleetRow label="Non-standard fitment" value={fleet.nonStandard} total={fleet.engines} status="amber" />
              <FleetRow label="Incomplete build pack" value={fleet.traceGaps} total={fleet.engines} status="red" />
              <FleetRow label="Overdue mandatory SB" value={fleet.overdueBulletins} total={fleet.engines} status="red" />
            </dl>
            <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
              Red flags an airworthiness gap — a missing release certificate or a passed mandatory compliance date. Amber is a
              planning signal: hardware that works but is behind the published standard.
            </p>
          </Panel>

          <EnginePicker engines={summaries} selectedId={record.engineId} />
        </div>
      </div>
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
  value: ReactNode;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div className="min-w-[8.5rem]">
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="mt-0.5 max-w-[9rem] text-[11px] leading-snug text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function FleetRow({
  label,
  value,
  total,
  status,
}: {
  label: string;
  value: number;
  total: number;
  status: "red" | "amber" | "green";
}) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  const tone = value === 0 && status !== "green" ? "grey" : status;
  return (
    <div className="flex items-center gap-3">
      <dt className="w-40 shrink-0 text-[12px] text-rr-slate">{label}</dt>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("h-full rounded-full", statusStyles[tone].dot)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <dd className={cn("rr-numeric w-8 shrink-0 text-right text-sm font-semibold", statusStyles[tone].text)}>{value}</dd>
    </div>
  );
}
