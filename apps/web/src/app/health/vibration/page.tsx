import Link from "next/link";
import {
  Badge,
  Panel,
  PanelHeader,
  SectionHeading,
  StatTile,
  StatusPill,
  TrendChart,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import type { ShaftId } from "@rr/types";
import {
  VIBRATION_SHAFTS,
  fleetVibrationProfiles,
  getEngine,
  getVibrationProfile,
  signatureBreakdown,
  vibrationAlerts,
  vibrationExceedances,
  vibrationFleetSummary,
  vibrationSpectrum,
} from "@rr/data";
import { BalancePolar } from "@/components/vibration/balance-polar";
import { EnginePicker } from "@/components/vibration/engine-picker";
import { FleetExceedanceTable, type FleetVibrationRow } from "@/components/vibration/fleet-exceedance-table";
import { ShaftCard } from "@/components/vibration/shaft-card";
import { SpectrumPanel } from "@/components/vibration/spectrum-panel";
import { VerdictPanel } from "@/components/vibration/verdict-panel";

export const metadata = { title: "Vibration analysis" };

export default async function VibrationPage({ searchParams }: { searchParams: Promise<{ engine?: string }> }) {
  const params = await searchParams;
  const profiles = fleetVibrationProfiles();
  const exceedances = vibrationExceedances();
  const summary = vibrationFleetSummary();
  const signatures = signatureBreakdown();

  const selected = (params.engine ? getVibrationProfile(params.engine) : undefined) ?? profiles[0]!;
  const engine = getEngine(selected.engineId)!;
  const spectra = VIBRATION_SHAFTS.map((spec) => vibrationSpectrum(engine, spec.shaft));
  const advisoryLimits = Object.fromEntries(selected.shafts.map((s) => [s.shaft, s.amberLimit])) as Record<ShaftId, number>;
  const alerts = vibrationAlerts(selected.engineId).slice(0, 4);

  const topRanked = profiles.slice(0, 40);
  const pickerProfiles = topRanked.some((profile) => profile.engineId === selected.engineId)
    ? topRanked
    : [selected, ...topRanked];
  const pickerOptions = pickerProfiles.map((profile) => ({
    engineId: profile.engineId,
    esn: profile.esn,
    operatorCode: profile.operatorCode,
    tail: profile.tail,
    status: profile.status,
    worstRatio: profile.worstRatio,
  }));

  const rows: FleetVibrationRow[] = exceedances.map((profile) => {
    const worst = profile.shafts.find((s) => s.shaft === profile.worstShaft)!;
    return {
      engineId: profile.engineId,
      esn: profile.esn,
      family: profile.family,
      operatorName: profile.operatorName,
      operatorCode: profile.operatorCode,
      tail: profile.tail,
      location: profile.location,
      status: profile.status,
      worstShaft: profile.worstShaft,
      worstIps: worst.latest,
      limitIps: worst.amberLimit,
      ratio: profile.worstRatio,
      broadbandIps: profile.broadbandIps,
      hoursAtExceedance: profile.hoursAtExceedance,
      signature: profile.diagnosis.label,
      confidence: profile.diagnosis.confidence,
      onWingRecoverable: profile.diagnosis.onWingRecoverable,
      actionWindowHours: profile.diagnosis.actionWindowHours,
      severityScore: profile.severityScore,
    };
  });

  const totalExceeding = summary.redCount + summary.amberCount;
  const balance = selected.balance;

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Diagnose · Vibration analysis</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              Is this a balance issue we can trim, or rotor damage?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {formatNumber(totalExceeding)} of {formatNumber(summary.enginesMonitored)} monitored engines are running above a
              vibration advisory limit. {formatNumber(summary.trimmableCount)} carry a stable 1x signature that an on-wing trim
              balance recovers; {formatNumber(summary.damageCount)} show damage signatures that trimming would only mask.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/health/vibration?engine=${profiles[0]!.engineId}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Open worst engine — {profiles[0]!.esn}
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Vibration alert queue
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Alert limit" value={summary.redCount} tone="red" caption="1x above red limit" />
            <HeroStat label="Advisory" value={summary.amberCount} tone="amber" caption="above amber limit" />
            <HeroStat label="Trim on wing" value={summary.trimmableCount} tone="green" caption="balance recoverable" />
            <HeroStat label="Inspect" value={summary.damageCount} tone="red" caption="damage signature" />
          </div>
        </div>
      </section>

      {/* Fleet exposure */}
      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Engines monitored"
          value={formatNumber(summary.enginesMonitored)}
          caption="Tracked-order data on all three shafts"
        />
        <StatTile
          label="Fleet hours above limit"
          value={formatNumber(summary.hoursAtExceedance)}
          unit="h"
          status={summary.hoursAtExceedance > 2000 ? "amber" : "green"}
          caption="Accumulated across engines in exceedance"
        />
        <StatTile
          label="Balance recoverable"
          value={formatNumber(summary.trimmableCount)}
          status="green"
          caption="Stable vector inside the trim envelope"
        />
        <StatTile
          label="Off-wing candidates"
          value={formatNumber(summary.damageCount)}
          status={summary.damageCount > 0 ? "red" : "green"}
          caption="Bearing, rub or unstable-vector signatures"
        />
      </section>

      <Panel>
        <PanelHeader
          title="Signature mix across engines in exceedance"
          subtitle="What the elevated engines are actually telling us — the split that drives the maintenance plan"
        />
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {signatures.map((signature) => (
            <li key={signature.kind} className="rounded-sm border border-rr-ink/8 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-rr-ink">{signature.label}</p>
                <p className="rr-numeric text-2xl font-semibold text-rr-ink">{signature.count}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rr-mist">
                <div
                  className={cn(
                    "h-full rounded-full",
                    signature.onWingRecoverable ? "bg-status-green" : signature.recoverableCount > 0 ? "bg-status-amber" : "bg-status-red",
                  )}
                  style={{ width: `${(signature.count / Math.max(1, totalExceeding)) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-rr-slate">
                {signature.recoverableCount === 0
                  ? "Requires inspection before further flight"
                  : signature.onWingRecoverable
                    ? "Recoverable on wing"
                    : `${signature.recoverableCount} recoverable on wing, ${signature.count - signature.recoverableCount} for inspection`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Focus engine */}
      <SectionHeading
        eyebrow="Engine analysis"
        title={`${selected.esn} · ${selected.family}`}
        description={`${selected.operatorName} · ${selected.tail ?? "off wing"}${
          selected.position ? ` position ${selected.position}` : ""
        } · ${formatNumber(selected.cyclesSinceOverhaul)} cycles since overhaul · ${selected.location}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <EnginePicker options={pickerOptions} selectedId={selected.engineId} shaft="N1" />
            <StatusPill status={selected.status} size="md">
              {selected.status === "red" ? "Above alert limit" : selected.status === "amber" ? "Above advisory" : "Within limits"}
            </StatusPill>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        {selected.shafts.map((shaft) => (
          <ShaftCard
            key={shaft.shaft}
            shaft={shaft}
            description={VIBRATION_SHAFTS.find((s) => s.shaft === shaft.shaft)?.description ?? ""}
          />
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Broadband overall level"
            subtitle="Unfiltered 10-1000 Hz RMS across the last 180 days, against advisory and alert limits"
            actions={<StatusPill status={selected.broadbandStatus}>{selected.broadbandIps.toFixed(2)} IPS</StatusPill>}
          />
          <TrendChart series={selected.broadbandSeries} height={190} />
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-rr-ink/8 pt-4 sm:grid-cols-4">
            <Fact label="Worst order" value={`1x ${selected.worstShaft}`} hint={`${Math.round(selected.worstRatio * 100)}% of advisory`} />
            <Fact label="Hours above limit" value={formatNumber(selected.hoursAtExceedance)} hint="This engine, 180-day window" />
            <Fact label="Severity rank" value={`#${profiles.findIndex((p) => p.engineId === selected.engineId) + 1}`} hint={`of ${profiles.length} engines`} />
            <Fact label="Sectors flagged" value={formatNumber(selected.shafts.reduce((s, x) => s + x.sectorsAtExceedance, 0))} hint="Sectors with a peak above advisory" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Open vibration alerts"
            subtitle="Raised against this engine by EHM and vibration analysis"
            actions={
              <Link href="/alerts" className="text-xs font-semibold text-rr-blue hover:underline">
                Queue ›
              </Link>
            }
          />
          {alerts.length === 0 ? (
            <p className="rounded-sm border border-rr-ink/8 px-4 py-8 text-center text-xs text-rr-slate">
              No open vibration alerts for {selected.esn}. The exceedance is being tracked by trend monitoring only.
            </p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((alert) => (
                <li key={alert.id} className={cn("border-l-2 pl-3", statusStyles[alert.status].border.replace("border-", "border-l-"))}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium leading-snug text-rr-ink">{alert.title}</p>
                    <StatusPill status={alert.status}>{alert.severity}</StatusPill>
                  </div>
                  <p className="mt-1 text-[11px] text-rr-slate">
                    {alert.source} · ATA {alert.ataChapter} · {relativeTime(alert.raisedAt)}
                    {alert.timeToActionHours !== null ? ` · action within ${alert.timeToActionHours}h` : ""}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{alert.recommendedAction}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SpectrumPanel spectra={spectra} advisoryLimits={advisoryLimits} />
        </div>
        <VerdictPanel diagnosis={selected.diagnosis} balance={balance} engineId={selected.engineId} esn={selected.esn} />
      </div>

      {/* Balance */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <PanelHeader
            title="Rotor balance vector"
            subtitle="1x N1 imbalance magnitude and phase, with the historic trim shots"
            actions={
              balance.trimmable ? <Badge variant="brand">Trimmable</Badge> : <StatusPill status="red">Not trimmable</StatusPill>
            }
          />
          <div className="flex justify-center">
            <BalancePolar balance={balance} status={selected.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-rr-ink/8 pt-4">
            <Fact label="Magnitude" value={`${balance.magnitudeIps.toFixed(2)} IPS`} hint={`Trim limit ${balance.trimLimitIps} IPS`} />
            <Fact label="Phase" value={`${balance.phaseDeg}°`} hint={`Scatter ±${balance.phaseScatterDeg}°`} />
            <Fact
              label="Recommended trim"
              value={balance.trimmable ? `${balance.recommendedWeightGrams} g` : "—"}
              hint={
                balance.trimmable
                  ? `Fit at ${balance.recommendedPositionDeg}°`
                  : balance.magnitudeIps > balance.trimLimitIps
                    ? "Beyond the on-wing trim envelope"
                    : "Vector unstable — do not trim"
              }
            />
            <Fact
              label="Predicted residual"
              value={`${balance.predictedResidualIps.toFixed(2)} IPS`}
              hint={balance.predictedResidualIps < balance.trimLimitIps ? "Inside limits after trim" : "Still above limit after trim"}
            />
          </dl>
          <ul className="mt-4 space-y-1.5 text-[11px] text-rr-slate">
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#6a63ff" }} aria-hidden />
              Current vector
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full border border-rr-blue-400 bg-surface" aria-hidden />
              Previous balance runs
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full border border-status-green" aria-hidden />
              Predicted residual after trim
            </li>
          </ul>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Balance history"
            subtitle="Every trim shot on this rotor — a vector that will not hold is evidence of damage, not imbalance"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rr-ink/8">
                  <th className="rr-label py-2 text-left text-rr-slate">Date</th>
                  <th className="rr-label py-2 text-right text-rr-slate">CSO</th>
                  <th className="rr-label py-2 text-right text-rr-slate">1x N1</th>
                  <th className="rr-label py-2 text-right text-rr-slate">Phase</th>
                  <th className="rr-label py-2 pr-4 text-right text-rr-slate">Weight</th>
                  <th className="rr-label py-2 text-left text-rr-slate">Outcome</th>
                  <th className="rr-label py-2 text-left text-rr-slate">Note</th>
                </tr>
              </thead>
              <tbody>
                {balance.history.map((shot) => {
                  const tone = shot.outcome === "improved" ? "green" : shot.outcome === "worse" ? "red" : shot.outcome === "survey" ? "grey" : "amber";
                  return (
                    <tr key={shot.id} className="border-b border-rr-ink/5 last:border-0">
                      <td className="rr-numeric py-2.5 text-rr-ink">
                        {new Date(shot.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="rr-numeric py-2.5 text-right text-rr-slate">{formatNumber(shot.cyclesSinceOverhaul)}</td>
                      <td className="rr-numeric py-2.5 text-right font-semibold text-rr-ink">{shot.magnitudeIps.toFixed(2)}</td>
                      <td className="rr-numeric py-2.5 text-right text-rr-slate">{shot.phaseDeg}°</td>
                      <td className="rr-numeric py-2.5 pr-4 text-right text-rr-slate">
                        {shot.weightGrams > 0 ? `${shot.weightGrams} g` : "—"}
                      </td>
                      <td className="py-2.5">
                        <StatusPill status={tone}>{shot.outcome}</StatusPill>
                      </td>
                      <td className="py-2.5 text-[12px] text-rr-slate">{shot.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 rounded-sm bg-rr-mist px-4 py-3 text-[12px] leading-relaxed text-rr-slate">
            Phase scatter across these runs is <span className="rr-numeric font-semibold text-rr-ink">±{balance.phaseScatterDeg}°</span>.
            {balance.phaseScatterDeg <= 22
              ? " A repeatable vector means the imbalance is fixed to the rotor and a trim weight will hold."
              : " A migrating vector means the source moves between runs — trim weights will not hold and the rotor needs inspection."}
          </p>
        </Panel>
      </div>

      {/* Fleet ranking */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Fleet"
          title="Vibration exceedances, ranked by severity"
          description="Every engine above an advisory limit, with how long it has been running there and the disposition the signature supports. Select a row to analyse that engine."
        />
        <FleetExceedanceTable rows={rows} selectedId={selected.engineId} />
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

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className="rr-numeric mt-1 text-lg font-semibold text-rr-ink">{value}</p>
      {hint ? <p className="text-[11px] text-rr-slate">{hint}</p> : null}
    </div>
  );
}
