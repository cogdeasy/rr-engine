"use client";

import Link from "next/link";
import type { AlertEvidence, DispositionEntry, DispositionKind, TriageAlert } from "@rr/types";
import {
  Badge,
  Button,
  Metric,
  Panel,
  PanelHeader,
  StatusPill,
  ThresholdBar,
  TrendChart,
  cn,
  formatDateTime,
  formatNumber,
  formatUsd,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import { DISPOSITION_LABELS, STATE_LABELS, colourRationale, formatHours, hoursRemaining, severityLabel } from "./triage-shared";

const ACTIONS: { kind: DispositionKind; label: string; variant: "primary" | "secondary" | "ghost" | "danger" }[] = [
  { kind: "acknowledge", label: "Acknowledge", variant: "secondary" },
  { kind: "escalate", label: "Escalate", variant: "primary" },
  { kind: "raise-work-order", label: "Raise work order", variant: "primary" },
  { kind: "false-positive", label: "False positive", variant: "ghost" },
];

export function AlertDetail({
  item,
  evidence,
  trail,
  onDisposition,
}: {
  item: TriageAlert;
  evidence?: AlertEvidence;
  trail: DispositionEntry[];
  onDisposition: (kind: DispositionKind) => void;
}) {
  const remaining = hoursRemaining(item);
  const overdue = remaining !== null && remaining <= 0;
  const series = evidence?.series ?? null;
  const values = series?.points.map((p) => p.v) ?? [];
  const thresholds = [evidence?.amberThreshold, evidence?.redThreshold].filter((v): v is number => typeof v === "number");
  const min = values.length > 0 ? Math.floor(Math.min(...values, ...thresholds)) : 0;
  const max = values.length > 0 ? Math.ceil(Math.max(...values, ...thresholds)) : 1;

  return (
    <div className="space-y-4">
      <Panel padded={false}>
        <div className="rr-hero-gradient rr-grid-lines px-6 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="rr-label text-rr-blue-200">
                {item.alert.id} · {item.alert.source} · ATA {item.alert.ataChapter}
              </p>
              <h2 className="mt-1.5 text-xl font-semibold leading-snug">{item.alert.title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-rr-cloud">{item.alert.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusPill status={item.alert.status} size="md">
                {severityLabel(item.alert.severity)}
              </StatusPill>
              <Badge variant="outline" className="border-white/30 text-white">
                {STATE_LABELS[item.alert.state]}
              </Badge>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <HeroFigure
              label="Time to action"
              value={remaining === null ? "—" : overdue ? `+${formatHours(-remaining)}` : formatHours(remaining)}
              caption={overdue ? "past deadline" : "until deadline"}
              tone={overdue ? "red" : remaining !== null && remaining < 48 ? "amber" : "cloud"}
            />
            <HeroFigure
              label="Next sector"
              value={item.hoursToNextSector === null ? "not flying" : formatHours(item.hoursToNextSector)}
              caption={item.needsActionBeforeNextSector ? "action due before departure" : "departure window"}
              tone={item.needsActionBeforeNextSector ? "red" : "cloud"}
            />
            <HeroFigure
              label="Engine health"
              value={formatNumber(item.engineHealthScore)}
              caption={`EGT margin ${item.egtMargin}°C`}
              tone={item.engineStatus === "red" ? "red" : item.engineStatus === "amber" ? "amber" : "green"}
            />
            <HeroFigure
              label="Confidence"
              value={item.alert.confidence === undefined ? "n/a" : `${Math.round(item.alert.confidence * 100)}%`}
              caption={item.alert.confidence === undefined ? "rule-based trigger" : "prognostic model"}
              tone="cloud"
            />
          </dl>
        </div>

        <div className="border-t border-rr-ink/8 bg-rr-blue-50/50 px-6 py-4">
          <p className="rr-label text-rr-blue">Recommended action</p>
          <p className="mt-1 text-sm font-medium leading-snug text-rr-ink">{item.alert.recommendedAction}</p>
          <p className="mt-1 text-[11px] text-rr-slate">Why this priority: {colourRationale(item)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ACTIONS.map((action) => (
              <Button key={action.kind} size="sm" variant={action.variant} onClick={() => onDisposition(action.kind)}>
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title={series ? `Trigger evidence — ${evidence?.parameterLabel}` : "Trigger evidence"}
            subtitle={series ? "180 days of the parameter that raised the alert, against operator limits" : "No parameter trend attached to this alert"}
            actions={
              evidence?.latestValue !== null && evidence?.latestValue !== undefined ? (
                <span className="rr-numeric text-sm font-semibold text-rr-ink">
                  {evidence.latestValue} {evidence.parameterUnit}
                </span>
              ) : null
            }
          />
          {series ? (
            <>
              <TrendChart series={series} height={190} />
              <div className="mt-4">
                <ThresholdBar
                  value={evidence?.latestValue ?? 0}
                  min={min}
                  max={max}
                  amber={evidence?.amberThreshold ?? max}
                  red={evidence?.redThreshold ?? max}
                  unit={evidence?.parameterUnit ?? undefined}
                  direction={evidence?.direction ?? "higher-is-worse"}
                />
                <p className="mt-2 text-[11px] text-rr-slate">
                  Amber limit {evidence?.amberThreshold ?? "—"} {evidence?.parameterUnit} · red limit{" "}
                  {evidence?.redThreshold ?? "—"} {evidence?.parameterUnit}.
                </p>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-xs text-rr-slate">
              This source reports discrete findings rather than a continuous parameter.
            </p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Asset"
              subtitle="Engine, airframe and operator carrying this alert"
              actions={
                <Link href={`/engines/${item.engineId}`} className="text-xs font-semibold text-rr-blue hover:underline">
                  Engine twin ›
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Engine" value={item.esn} hint={`${item.family} · ${item.positionLabel}`} />
              <Metric label="Aircraft" value={item.aircraftTail ?? "off wing"} hint={item.aircraftType ?? "unassigned"} />
              <Metric label="Operator" value={item.operatorCode} hint={item.operatorName} />
              <Metric
                label="Health"
                value={item.engineHealthScore}
                status={item.engineStatus}
                hint={`${item.relatedOpenAlerts} other open alerts`}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Related alerts on this engine" subtitle="Corroborating or duplicate signatures" />
            {evidence && evidence.relatedAlerts.length > 0 ? (
              <ul className="space-y-2.5">
                {evidence.relatedAlerts.map((related) => (
                  <li
                    key={related.id}
                    className={cn("border-l-2 pl-3", statusStyles[related.status].border.replace("border-", "border-l-"))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-medium leading-snug text-rr-ink">{related.title}</p>
                      <StatusPill status={related.status}>{severityLabel(related.severity)}</StatusPill>
                    </div>
                    <p className="mt-0.5 text-[11px] text-rr-slate">
                      {related.source} · ATA {related.ataChapter} · {relativeTime(related.raisedAt)} ·{" "}
                      {STATE_LABELS[related.state]}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-xs text-rr-slate">No other open alerts on {item.esn}.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Linked work order" subtitle="Maintenance already committed against this finding" />
            {evidence?.workOrder ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-rr-ink">{evidence.workOrder.reference}</p>
                    <p className="text-[11px] text-rr-slate">
                      {evidence.workOrder.type.replace(/-/g, " ")} · {evidence.workOrder.state.replace(/-/g, " ")}
                    </p>
                  </div>
                  <StatusPill status={evidence.workOrder.status}>{evidence.workOrder.priority}</StatusPill>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-[11px] text-rr-slate">
                  <div>
                    <dt className="rr-label">Start</dt>
                    <dd className="rr-numeric text-rr-ink">{formatDateTime(evidence.workOrder.scheduledStart)}</dd>
                  </div>
                  <div>
                    <dt className="rr-label">TAT</dt>
                    <dd className="rr-numeric text-rr-ink">{evidence.workOrder.tatDays} days</dd>
                  </div>
                  <div>
                    <dt className="rr-label">Estimate</dt>
                    <dd className="rr-numeric text-rr-ink">{formatUsd(evidence.workOrder.estimatedCostUsd)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="py-4 text-xs text-rr-slate">
                No work order raised yet. Use <span className="font-medium text-rr-ink">Raise work order</span> to commit
                maintenance against this alert.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Disposition trail"
          subtitle="Every triage decision recorded against this alert, newest last"
          actions={<Badge variant="neutral">{trail.length} entries</Badge>}
        />
        {trail.length === 0 ? (
          <p className="py-4 text-xs text-rr-slate">No disposition recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {trail.map((entry) => (
              <li key={entry.id} className="flex gap-3 border-l border-rr-ink/10 pl-4">
                <div>
                  <p className="text-[13px] font-medium text-rr-ink">{DISPOSITION_LABELS[entry.kind]}</p>
                  <p className="text-[11px] text-rr-slate">
                    {formatDateTime(entry.at)} · {entry.actor} · state → {STATE_LABELS[entry.resultingState]}
                  </p>
                  <p className="mt-0.5 text-[11px] text-rr-slate">{entry.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function HeroFigure({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "red" | "amber" | "green" | "cloud";
}) {
  const colour = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
    cloud: "text-white",
  }[tone];
  return (
    <div>
      <dt className="rr-label text-rr-cloud/70">{label}</dt>
      <dd className={cn("rr-numeric mt-1 text-2xl font-semibold", colour)}>{value}</dd>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
