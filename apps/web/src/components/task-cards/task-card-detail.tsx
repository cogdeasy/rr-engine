"use client";

import * as React from "react";
import type { TaskCardExecution, TaskCardSignOffRole, TaskCardTrailEntry } from "@rr/types";
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  ProgressBar,
  StatusPill,
  cn,
  formatDateTime,
  formatNumber,
  relativeTime,
  statusStyles,
} from "@rr/ui";

const STEP_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  done: { dot: "bg-status-green", label: "Complete", text: "text-rr-slate" },
  active: { dot: "bg-rr-blue", label: "In work", text: "text-rr-ink" },
  blocked: { dot: "bg-status-red", label: "Blocked", text: "text-status-red" },
  pending: { dot: "bg-rr-slate/40", label: "Pending", text: "text-rr-slate" },
};

export function TaskCardDetail({
  execution,
  datasetNow,
}: {
  execution: TaskCardExecution;
  datasetNow: string;
}) {
  const [recorded, setRecorded] = React.useState<Partial<Record<TaskCardSignOffRole, string>>>({});
  const [trail, setTrail] = React.useState<TaskCardTrailEntry[]>(execution.trail);

  const signOffState = execution.signOffs.map((signOff) => ({
    ...signOff,
    at: signOff.at ?? recorded[signOff.role] ?? null,
  }));
  const mechanicSigned = signOffState.some((s) => s.role === "mechanic" && s.at !== null);

  function record(role: TaskCardSignOffRole) {
    const signOff = execution.signOffs.find((s) => s.role === role);
    if (!signOff || recorded[role]) return;
    // The dataset runs on its own "data as at" clock, which can be ahead of the
    // browser clock; stamping behind it would render a negative relative age.
    const at = new Date(
      Math.max(Date.now(), new Date(datasetNow).getTime()),
    ).toISOString();
    setRecorded((prev) => ({ ...prev, [role]: at }));
    setTrail((prev) => [
      {
        id: `${execution.card.id}-live-${role}`,
        at,
        actor: signOff.name,
        action: role === "mechanic" ? "Mechanic sign-off" : "Inspector stamp",
        detail: `Recorded from the execution console under stamp ${signOff.stamp}.`,
      },
      ...prev,
    ]);
  }

  return (
    <Panel className="space-y-5 self-start">
      <PanelHeader
        className="pb-0"
        title={
          <span className="flex items-center gap-2">
            <span className="rr-numeric">{execution.reference}</span>
            <StatusPill status={execution.status}>{execution.state.replace("-", " ")}</StatusPill>
          </span>
        }
        subtitle={`${execution.title} · ATA ${execution.ataChapter} · ${execution.skillRequired}`}
        actions={<Badge variant="brand">{execution.engineEsn}</Badge>}
      />

      <div className={cn("rounded-sm border px-4 py-3", statusStyles[execution.status].bg, statusStyles[execution.status].border)}>
        <p className="rr-label text-rr-slate">Why this card is {execution.status === "grey" ? "not started" : execution.status}</p>
        <p className="mt-1 text-[13px] font-medium leading-snug text-rr-ink">{execution.reason}</p>
        <p className="mt-2 text-xs leading-relaxed text-rr-slate">
          <span className="rr-label text-rr-blue">Recommended action</span> — {execution.recommendedAction}
        </p>
        {execution.blockedReason ? (
          <p className="mt-2 text-xs font-medium text-status-red">Blocker: {execution.blockedReason}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Figure label="Estimate" value={formatNumber(execution.estimatedHours, 1)} unit="h" />
        <Figure label="Booked" value={formatNumber(execution.hoursToDate, 1)} unit="h" />
        <Figure label="Projected" value={formatNumber(execution.projectedHours, 1)} unit="h" />
        <Figure
          label="Variance"
          value={`${execution.varianceHours > 0 ? "+" : ""}${formatNumber(execution.varianceHours, 1)}`}
          unit="h"
          tone={execution.varianceHours <= 0 ? "text-status-green" : execution.variancePct >= 25 ? "text-status-red" : "text-status-amber"}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="rr-label text-rr-slate">Card progress</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{execution.progressPct}% of steps complete</p>
        </div>
        <ProgressBar className="mt-2" value={execution.progressPct} status={execution.status === "grey" ? "grey" : execution.status} />
      </div>

      <section>
        <p className="rr-label mb-2 text-rr-slate">Step list</p>
        <ol className="space-y-2">
          {execution.steps.map((step) => {
            const style = STEP_STYLES[step.state]!;
            return (
              <li key={step.id} className="flex gap-3 rounded-sm border border-rr-ink/8 px-3 py-2">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12px] leading-snug", style.text)}>
                    <span className="rr-numeric mr-1.5 text-rr-slate">{String(step.index).padStart(2, "0")}</span>
                    {step.instruction}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-rr-slate">
                    <span className="rr-numeric">
                      {formatNumber(step.actualHours ?? step.estimatedHours, 1)}h {step.actualHours !== undefined ? "actual" : "est"}
                    </span>
                    <span>· {style.label}</span>
                    {step.requiresInspection ? <span className="text-rr-blue">· inspection required</span> : null}
                    {step.note ? <span>· {step.note}</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <p className="rr-label mb-2 text-rr-slate">Tooling</p>
          <ul className="space-y-1 text-[12px] text-rr-slate">
            {execution.tooling.map((tool) => (
              <li key={tool}>· {tool}</li>
            ))}
          </ul>
        </section>
        <section>
          <p className="rr-label mb-2 text-rr-slate">Safety notes</p>
          <ul className="space-y-1 text-[12px] text-rr-slate">
            {execution.safetyNotes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <p className="rr-label mb-2 text-rr-slate">Required parts</p>
        {execution.parts.length === 0 ? (
          <p className="text-[12px] text-rr-slate">No parts consumed by this card — labour only.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-rr-ink/8">
                <th className="rr-label py-1.5 text-left text-rr-slate">Part</th>
                <th className="rr-label py-1.5 text-right text-rr-slate">Req</th>
                <th className="rr-label py-1.5 text-right text-rr-slate">On hand</th>
                <th className="rr-label py-1.5 text-right text-rr-slate">Lead time</th>
              </tr>
            </thead>
            <tbody>
              {execution.parts.map((part) => (
                <tr key={part.partNumber} className="border-b border-rr-ink/5 last:border-0">
                  <td className="py-1.5">
                    <span className="rr-numeric text-rr-ink">{part.partNumber}</span>
                    <span className="block text-[11px] text-rr-slate">{part.description}</span>
                  </td>
                  <td className="rr-numeric py-1.5 text-right text-rr-ink">{part.qty}</td>
                  <td className={cn("rr-numeric py-1.5 text-right font-semibold", statusStyles[part.status].text)}>{part.onHand}</td>
                  <td className="rr-numeric py-1.5 text-right text-rr-slate">{part.leadTimeDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-sm border border-rr-ink/8 bg-rr-mist/50 px-4 py-3">
        <p className="rr-label text-rr-slate">Sign-off</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {signOffState.map((signOff) => (
            <div key={signOff.role} className="rounded-sm border border-rr-ink/8 bg-surface px-3 py-3">
              <p className="rr-label text-rr-slate">{signOff.role}</p>
              <p className="mt-1 text-[13px] font-semibold text-rr-ink">{signOff.name}</p>
              <p className="rr-numeric text-[11px] text-rr-slate">stamp {signOff.stamp}</p>
              {signOff.at ? (
                <p className="mt-2 text-[11px] font-medium text-status-green">Signed {formatDateTime(signOff.at)}</p>
              ) : (
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  variant={signOff.role === "inspector" ? "primary" : "secondary"}
                  disabled={signOff.role === "inspector" && !mechanicSigned}
                  onClick={() => record(signOff.role)}
                >
                  {signOff.role === "mechanic" ? "Record mechanic sign-off" : "Record inspector stamp"}
                </Button>
              )}
            </div>
          ))}
        </div>
        {!mechanicSigned ? (
          <p className="mt-2 text-[11px] text-rr-slate">The inspector stamp unlocks once the mechanic has signed the card.</p>
        ) : null}
      </section>

      <section>
        <p className="rr-label mb-2 text-rr-slate">Audit trail</p>
        <ul className="space-y-2">
          {trail.slice(0, 8).map((entry) => (
            <li key={entry.id} className="border-l-2 border-rr-blue/25 pl-3">
              <p className="text-[12px] font-medium text-rr-ink">{entry.action}</p>
              <p className="text-[11px] leading-snug text-rr-slate">{entry.detail}</p>
              <p className="rr-numeric text-[11px] text-rr-slate/80">
                {entry.actor} · {formatDateTime(entry.at)} · {relativeTime(entry.at)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Panel>
  );
}

function Figure({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-sm border border-rr-ink/8 px-3 py-2">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", tone ?? "text-rr-ink")}>
        {value}
        {unit ? <span className="ml-0.5 text-[11px] font-medium text-rr-slate">{unit}</span> : null}
      </p>
    </div>
  );
}
