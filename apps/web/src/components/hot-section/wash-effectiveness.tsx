import Link from "next/link";
import type { HotSectionAssessment } from "@rr/types";
import type { HotSectionWashEffectiveness } from "@rr/data";
import { Button, Panel, PanelHeader, ReasonLine, StatusPill, cn, formatDate, formatNumber, statusStyles } from "@rr/ui";

/**
 * What water washing actually returns: margin recovered per wash, the interval
 * that keeps recovery worthwhile, and the engines that are past due.
 */
export function WashEffectiveness({
  effectiveness,
  assessments,
}: {
  effectiveness: HotSectionWashEffectiveness;
  assessments: HotSectionAssessment[];
}) {
  const maxRecovery = Math.max(...effectiveness.byInterval.map((b) => b.meanRecoveredC), 1);
  const best = [...effectiveness.byInterval].sort((a, b) => b.meanRecoveredC - a.meanRecoveredC)[0];
  const byId = new Map(assessments.map((a) => [a.engineId, a]));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel>
        <PanelHeader
          title="Water wash effectiveness"
          subtitle="Margin recovered per wash across the recorded on-wing washes, by wash interval"
          actions={<span className="rr-numeric text-[11px] text-rr-slate">{formatNumber(effectiveness.washesRecorded)} washes</span>}
        />
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <dl className="space-y-4">
            <Figure label="Mean margin recovered" value={effectiveness.meanRecoveredC.toFixed(1)} unit="°C" />
            <Figure label="Margin per downtime hour" value={effectiveness.marginPerDowntimeHour.toFixed(2)} unit="°C/h" />
            <Figure label="Mean downtime" value={effectiveness.meanDowntimeHours.toFixed(1)} unit="hours" />
            {best ? (
              <div className="rounded-sm bg-rr-blue-50 p-3">
                <p className="rr-label text-rr-blue">Recommended interval</p>
                <p className="rr-numeric mt-1 text-2xl font-semibold text-rr-blue">{best.intervalDays} days</p>
                <p className="mt-1 text-[11px] leading-snug text-rr-slate">
                  Best observed recovery ({best.meanRecoveredC.toFixed(1)} °C) across {best.engines} engines. Harsher
                  environments are scheduled tighter; the per-engine interval is set from severity and life consumed.
                </p>
              </div>
            ) : null}
          </dl>

          <div>
            <p className="rr-label mb-3 text-rr-slate">Mean recovery by interval</p>
            <ul className="space-y-2.5">
              {effectiveness.byInterval.map((bucket) => (
                <li key={bucket.intervalDays} className="flex items-center gap-3">
                  <span className="rr-numeric w-16 shrink-0 text-right text-[11px] text-rr-slate">{bucket.intervalDays} d</span>
                  <span className="h-5 flex-1 overflow-hidden rounded-sm bg-rr-mist">
                    <span
                      className="block h-full rounded-sm bg-rr-blue/85"
                      style={{ width: `${(bucket.meanRecoveredC / maxRecovery) * 100}%` }}
                    />
                  </span>
                  <span className="rr-numeric w-14 shrink-0 text-right text-[12px] font-semibold text-rr-ink">
                    {bucket.meanRecoveredC.toFixed(1)}°C
                  </span>
                  <span className="rr-numeric w-20 shrink-0 text-right text-[11px] text-rr-slate">{bucket.engines} engines</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-rr-slate">
              Recovery decays with life consumed: a mature core returns roughly half the margin of a freshly overhauled one,
              which is why washing is a deferral tool and never a substitute for a hot section restoration.
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Washes overdue"
          subtitle="Margin sitting on the table right now"
          actions={
            <Button size="sm" variant="secondary">
              Schedule all
            </Button>
          }
        />
        <ul className="space-y-2.5">
          {effectiveness.overdue.map((entry) => {
            const assessment = byId.get(entry.engineId);
            return (
              <li
                key={entry.engineId}
                className={cn("rounded-sm border-l-2 bg-rr-mist/50 px-3 py-2.5", statusStyles[entry.status].dot.replace("bg-", "border-l-"))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/engines/${entry.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                      {entry.esn}
                    </Link>
                    <p className="text-[11px] text-rr-slate">
                      {entry.operatorCode}
                      {assessment ? ` · ${assessment.family} · wash due ${formatDate(assessment.wash.nextWashDueAt)}` : ""}
                    </p>
                  </div>
                  <StatusPill status={entry.status}>{entry.overdueDays} d late</StatusPill>
                </div>
                <div className="mt-2 flex items-center gap-5">
                  <span className="rr-numeric text-[12px] font-semibold text-status-green">+{entry.expectedRecoveryC.toFixed(1)}°C</span>
                  <span className="rr-numeric text-[12px] text-rr-ink">+{entry.deferralDays} days on wing</span>
                </div>
                {entry.status === "red" ? (
                  <ReasonLine status="red">
                    Already inside the amber margin band — every sector flown unwashed is margin that cannot be recovered later.
                  </ReasonLine>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className="rr-numeric mt-0.5 text-2xl font-semibold text-rr-ink">
        {value}
        <span className="ml-1 text-xs font-medium text-rr-slate">{unit}</span>
      </dd>
    </div>
  );
}
