import Link from "next/link";
import type { RotorBalance, VibrationDiagnosis } from "@rr/types";
import { Panel, PanelHeader, StatusPill, cn, statusStyles } from "@rr/ui";

/**
 * The interpretation: signature to likely cause, with the evidence that drove
 * it and the single action the analyst should take next.
 */
export function VerdictPanel({
  diagnosis,
  balance,
  engineId,
  esn,
}: {
  diagnosis: VibrationDiagnosis;
  balance: RotorBalance;
  engineId: string;
  esn: string;
}) {
  const s = statusStyles[diagnosis.status];
  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader
        title="Interpretation"
        subtitle={`Signature classified from tracked orders, spectrum shape and phase stability · ATA ${diagnosis.ataChapter}`}
        actions={<StatusPill status={diagnosis.status}>{diagnosis.status === "green" ? "No action" : diagnosis.status === "amber" ? "Watchlist" : "Act now"}</StatusPill>}
      />

      <div className={cn("rounded-sm border p-4", s.bg, s.border)}>
        <p className="rr-label text-rr-slate">Most likely cause</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", s.text)}>{diagnosis.label}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/70">
            <div className={cn("h-full rounded-full", s.dot)} style={{ width: `${diagnosis.confidence * 100}%` }} />
          </div>
          <span className="rr-numeric text-xs font-semibold text-rr-ink">{Math.round(diagnosis.confidence * 100)}%</span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-rr-ink/80">{diagnosis.summary}</p>
        <p className="mt-2 text-[11px] text-rr-slate">
          Differential: {diagnosis.differential.label} at {Math.round(diagnosis.differential.confidence * 100)}% · module{" "}
          {diagnosis.likelyModule}
        </p>
      </div>

      <div className="mt-5">
        <p className="rr-label text-rr-slate">Evidence</p>
        <ul className="mt-2 space-y-2.5">
          {diagnosis.evidence.map((item) => (
            <li key={item.label} className="grid grid-cols-[9rem_1fr] items-start gap-3">
              <div>
                <p className="text-[12px] font-semibold text-rr-ink">{item.label}</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-rr-mist">
                  <div
                    className={cn("h-full rounded-full", item.supports ? "bg-rr-blue" : "bg-rr-slate/35")}
                    style={{ width: `${Math.round(item.weight * 100)}%` }}
                  />
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-rr-slate">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-5">
        <div className="rounded-sm border border-rr-blue/20 bg-rr-blue-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <p className="rr-label text-rr-blue">Recommended action</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-rr-ink">{diagnosis.recommendedAction}</p>
              <p className="rr-numeric mt-1.5 text-[11px] text-rr-slate">
                {diagnosis.actionWindowHours === null
                  ? "No deadline — routine monitoring"
                  : `Action window ${diagnosis.actionWindowHours}h`}
                {diagnosis.onWingRecoverable
                  ? ` · predicted residual ${balance.predictedResidualIps} IPS after trim`
                  : " · engine must come off wing if confirmed"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/engines/${engineId}`}
                className="inline-flex items-center gap-2 rounded-full bg-rr-blue px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rr-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
              >
                {diagnosis.onWingRecoverable ? "Raise trim balance task" : "Raise inspection work order"}
                <span aria-hidden>›</span>
              </Link>
              <Link
                href={`/alerts?engine=${engineId}`}
                className="inline-flex items-center gap-2 rounded-full border border-rr-blue/25 bg-white px-4 py-2 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Alerts for {esn}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
