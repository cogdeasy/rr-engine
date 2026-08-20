import Link from "next/link";
import { COUNTERSIGN_SLA_HOURS, auditEntityIndex, auditEntityTimeline, auditTrail, NOW } from "@rr/data";
import { Badge, Panel, PanelHeader, Sparkline, StatTile, StatusPill, cn, formatNumber } from "@rr/ui";
import { AuditExplorer } from "@/components/audit/audit-explorer";
import { EntityDrilldown, EntityPicker } from "@/components/audit/entity-drilldown";
import { CATEGORY_LABELS, actionLabel, formatAge, formatShortUtc } from "@/components/audit/format";

export const metadata = { title: "Audit trail" };

/** Records shipped to the browser for interactive filtering. */
const LEDGER_WINDOW = 420;

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const { entity } = await searchParams;
  const trail = auditTrail();
  const now = NOW.toISOString();
  const ledgerWindow = trail.records.slice(-LEDGER_WINDOW).reverse();
  const verifiedAgeHours = (NOW.getTime() - new Date(trail.integrity.lastVerifiedAt).getTime()) / 3600000;
  const entities = auditEntityIndex(10);
  const selectedId = entity ?? entities[0]?.id;
  const timeline = selectedId ? auditEntityTimeline(selectedId) : undefined;
  const attention = trail.attention.slice(0, 5);
  const overdue = trail.attention.length;

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Assure · Audit trail</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {overdue > 0
                ? `${overdue} decisions cannot yet be substantiated`
                : "Every decision in the ledger is substantiated"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Who decided what, when, and on what evidence. Every alert disposition, work order state change, sign-off
              and configuration change is written once to an append-only, hash-chained ledger — the red items below are
              overrides or quality-gated actions still missing a countersignature or evidence.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#attention"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Close {overdue} evidential gaps
                <span aria-hidden>›</span>
              </a>
              <a
                href="#ledger"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Search the ledger
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Ledger entries" value={formatNumber(trail.integrity.totalRecords)} caption={`since ${formatShortUtc(trail.integrity.firstAt)}`} />
            <HeroStat label="Last 7 days" value={formatNumber(trail.recordsLast7Days)} caption="recorded actions" />
            <HeroStat label="Overrides 30d" value={formatNumber(trail.overridesLast30Days)} caption="recommendation departures" tone="amber" />
            <HeroStat label="Evidential gaps" value={formatNumber(overdue)} caption={`countersign SLA ${COUNTERSIGN_SLA_HOURS}h`} tone={overdue > 0 ? "red" : "green"} />
          </div>
        </div>
      </section>

      {/* Integrity banner */}
      <Panel
        className={cn(
          "flex flex-wrap items-center justify-between gap-6 border-l-2",
          trail.integrity.chainVerified ? "border-l-status-green" : "border-l-status-red",
        )}
      >
        <div className="flex items-start gap-4">
          <StatusPill status={trail.integrity.chainVerified ? "green" : "red"} size="md">
            {trail.integrity.chainVerified ? "Chain verified" : "Chain broken"}
          </StatusPill>
          <div>
            <p className="text-sm font-semibold text-rr-ink">Tamper-evident, append-only, retained {trail.integrity.retentionYears} years</p>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-rr-slate">
              Entries are never edited or deleted; corrections are appended as new entries. Each entry is hashed together
              with its predecessor, so altering any historic record invalidates every hash after it. Full chain
              re-verified {formatAge(verifiedAgeHours)} ago across {formatNumber(trail.integrity.totalRecords)} entries
              {trail.integrity.brokenAt.length > 0 ? ` — ${trail.integrity.brokenAt.length} mismatches found` : " with no mismatches"}.
              Records are retained until {formatShortUtc(trail.integrity.retentionUntil)} under the fleet services records policy.
            </p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-8">
          <div>
            <dt className="rr-label text-rr-slate">Head hash</dt>
            <dd className="rr-numeric mt-1 text-sm font-semibold text-rr-ink">{trail.integrity.headHash}</dd>
          </div>
          <div>
            <dt className="rr-label text-rr-slate">Write mode</dt>
            <dd className="rr-numeric mt-1 text-sm font-semibold text-rr-ink">{trail.integrity.writeMode}</dd>
          </div>
          <div>
            <dt className="rr-label text-rr-slate">Oldest entry</dt>
            <dd className="rr-numeric mt-1 text-sm font-semibold text-rr-ink">{formatShortUtc(trail.integrity.firstAt)}</dd>
          </div>
        </dl>
      </Panel>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Countersignature compliance"
          value={trail.countersignatureCompliancePct}
          unit="%"
          status={trail.countersignatureCompliancePct < 85 ? "red" : trail.countersignatureCompliancePct < 95 ? "amber" : "green"}
          caption="Quality-gated actions with a second signature"
        />
        <StatTile
          label="Evidence coverage"
          value={trail.evidenceCoveragePct}
          unit="%"
          status={trail.evidenceCoveragePct < 95 ? "amber" : "green"}
          caption="Human decisions with attached evidence"
        />
        <StatTile
          label="Overrides, 30 days"
          value={trail.overridesLast30Days}
          status={trail.overridesLast30Days > 20 ? "amber" : "green"}
          caption="Departures from the recommended action"
        />
        <Panel className="p-4">
          <p className="rr-label text-rr-slate">Ledger volume</p>
          <p className="rr-numeric mt-2 text-3xl font-semibold text-rr-ink">{formatNumber(trail.recordsLast7Days)}</p>
          <p className="text-[11px] text-rr-slate">entries in the last 7 days</p>
          <Sparkline points={trail.dailyVolume} status="green" height={34} className="mt-2" />
          <p className="mt-1 text-[11px] text-rr-slate">Daily entries, 30 days</p>
        </Panel>
      </section>

      {/* Recommended actions */}
      <section id="attention" className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Recommended action — close these evidential gaps first"
            subtitle={`Quality-gated actions past the ${COUNTERSIGN_SLA_HOURS}h countersignature SLA, or overrides recorded with no evidence attached`}
            actions={<Badge variant="brand">{overdue} open</Badge>}
          />
          {attention.length === 0 ? (
            <p className="py-10 text-center text-xs text-rr-slate">
              No outstanding gaps. Every quality-gated action in the ledger carries a second signature.
            </p>
          ) : (
            <ul className="divide-y divide-rr-ink/8">
              {attention.map(({ record, reason, ageHours }) => (
                <li key={record.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1 basis-[24rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-rr-ink">{actionLabel(record.action)}</span>
                      <Badge variant="outline">{CATEGORY_LABELS[record.category]}</Badge>
                      <span className="rr-numeric text-[11px] text-rr-slate">{record.entityLabel}</span>
                    </div>
                    <p className="mt-1 text-xs text-rr-slate">{record.detail}</p>
                    <p className="mt-1 text-[11px] font-medium text-status-red">{reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="rr-numeric text-lg font-semibold text-status-red">{formatAge(ageHours)}</p>
                      <p className="rr-label text-rr-slate">open</p>
                    </div>
                    <Link
                      href={`/assure/audit?entity=${record.engineId ?? record.entityId}#entity`}
                      className="rounded-full border border-rr-blue/25 bg-white px-3 py-1.5 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
                    >
                      Review history
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Who is writing to the ledger" subtitle="Most active actors across the full retention window" />
          <ul className="space-y-3">
            {trail.actors.slice(0, 8).map((summary) => (
              <li key={summary.actor.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-rr-ink">{summary.actor.name}</p>
                  <p className="truncate text-[11px] text-rr-slate">{summary.actor.role}</p>
                </div>
                <div className="w-24 text-right">
                  <p className="rr-numeric text-sm font-semibold text-rr-ink">{formatNumber(summary.records)}</p>
                  <p className="rr-numeric text-[11px] text-rr-slate">
                    {summary.overrides > 0 ? <span className="text-status-amber">{summary.overrides} ovr</span> : "no overrides"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-rr-ink/8 pt-3">
            <p className="rr-label text-rr-slate">Entries by category</p>
            <ul className="mt-2 space-y-1.5">
              {Object.entries(trail.countsByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <li key={category} className="flex items-center gap-3 text-[12px]">
                    <span className="w-32 shrink-0 text-rr-slate">{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                      <span
                        className="block h-full rounded-full bg-rr-blue"
                        style={{ width: `${(count / trail.integrity.totalRecords) * 100}%` }}
                      />
                    </span>
                    <span className="rr-numeric w-10 text-right text-rr-ink">{count}</span>
                  </li>
                ))}
            </ul>
          </div>
        </Panel>
      </section>

      {/* Ledger */}
      <section id="ledger">
        <AuditExplorer records={ledgerWindow} now={now} slaHours={COUNTERSIGN_SLA_HOURS} totalRecords={trail.integrity.totalRecords} />
      </section>

      {/* Entity drill-down */}
      <section id="entity" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-rr-ink">Entity history</h2>
          <p className="mt-0.5 text-xs text-rr-slate">
            The complete recorded history of one engine or work order — the view an investigator or auditor asks for.
          </p>
        </div>
        <EntityPicker entities={entities} activeId={timeline?.entityId ?? selectedId} />
        {timeline ? (
          <EntityDrilldown timeline={timeline} now={now} slaHours={COUNTERSIGN_SLA_HOURS} />
        ) : (
          <Panel>
            <p className="py-10 text-center text-xs text-rr-slate">No ledger entries recorded against this entity.</p>
          </Panel>
        )}
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "red" | "amber" | "green";
}) {
  const colour = {
    neutral: "text-white",
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
  }[tone];
  return (
    <div>
      <p className="rr-label text-rr-cloud/70">{label}</p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
