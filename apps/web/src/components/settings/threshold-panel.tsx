"use client";

import * as React from "react";
import { Badge, Button, Panel, PanelHeader, StatusPill, cn, formatDate, formatNumber } from "@rr/ui";
import type { ThresholdPolicy } from "@rr/types";

interface Limits {
  amber: number;
  red: number;
}

interface Impact {
  red: number;
  amber: number;
  green: number;
  total: number;
}

/** Local copy of the impact count so the client bundle never pulls in the generator. */
function impactOf(values: number[], { amber, red }: Limits, direction: ThresholdPolicy["direction"]): Impact {
  let redCount = 0;
  let amberCount = 0;
  for (const value of values) {
    const isRed = direction === "higher-is-worse" ? value >= red : value <= red;
    const isAmber = direction === "higher-is-worse" ? value >= amber : value <= amber;
    if (isRed) redCount += 1;
    else if (isAmber) amberCount += 1;
  }
  return { red: redCount, amber: amberCount, green: values.length - redCount - amberCount, total: values.length };
}

function clampLimits(policy: ThresholdPolicy, next: Limits, edited: keyof Limits): Limits {
  const { min, max, direction } = policy;
  const bound = (value: number) => Math.min(max, Math.max(min, value));
  const amber = bound(next.amber);
  const red = bound(next.red);
  // Red is always the more severe limit: below amber when low readings are bad,
  // above amber when high readings are bad.
  if (direction === "lower-is-worse" && red > amber) {
    return edited === "red" ? { amber: red, red } : { amber, red: amber };
  }
  if (direction === "higher-is-worse" && red < amber) {
    return edited === "red" ? { amber: red, red } : { amber, red: amber };
  }
  return { amber, red };
}

function share(count: number, total: number): string {
  return total > 0 ? `${(count / total) * 100}%` : "0%";
}

function formatLimit(policy: ThresholdPolicy, value: number): string {
  return `${formatNumber(value, policy.step < 1 ? 1 : 0)}${policy.unit}`;
}

export function ThresholdPanel({ policies }: { policies: ThresholdPolicy[] }) {
  const baseline = React.useMemo(
    () => Object.fromEntries(policies.map((p) => [p.id, { amber: p.amber, red: p.red }])) as Record<string, Limits>,
    [policies],
  );
  const [limits, setLimits] = React.useState<Record<string, Limits>>(baseline);

  const changedIds = policies.filter((p) => limits[p.id]!.amber !== p.amber || limits[p.id]!.red !== p.red).map((p) => p.id);

  const totals = policies.reduce(
    (acc, policy) => {
      const next = impactOf(policy.values, limits[policy.id]!, policy.direction);
      const now = impactOf(policy.values, baseline[policy.id]!, policy.direction);
      acc.nextRed += next.red;
      acc.nowRed += now.red;
      acc.nextAmber += next.amber;
      acc.nowAmber += now.amber;
      return acc;
    },
    { nextRed: 0, nowRed: 0, nextAmber: 0, nowAmber: 0 },
  );

  const redDelta = totals.nextRed - totals.nowRed;
  const amberDelta = totals.nextAmber - totals.nowAmber;

  return (
    <div className="space-y-5">
      <Panel className={cn("flex flex-wrap items-center justify-between gap-4", changedIds.length > 0 && "border-rr-blue/40 bg-rr-blue-50/50")}>
        <div>
          <p className="rr-label text-rr-slate">Pending limit changes</p>
          <p className="mt-1 text-sm text-rr-ink">
            {changedIds.length === 0 ? (
              "Published limits are in force across every module. Drag a limit to preview its fleet impact before publishing."
            ) : (
              <>
                <span className="font-semibold">{changedIds.length} limit set{changedIds.length > 1 ? "s" : ""} modified</span> — the
                fleet would move to{" "}
                <span className="rr-numeric font-semibold text-status-red">{totals.nextRed} red</span> (
                {redDelta >= 0 ? "+" : ""}
                {redDelta}) and{" "}
                <span className="rr-numeric font-semibold text-status-amber">{totals.nextAmber} amber</span> (
                {amberDelta >= 0 ? "+" : ""}
                {amberDelta}) assessments.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLimits(baseline)} disabled={changedIds.length === 0}>
            Reset to published
          </Button>
          <Button variant="primary" size="sm" disabled={changedIds.length === 0}>
            Submit for engineering approval
          </Button>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        {policies.map((policy) => {
          const current = limits[policy.id]!;
          const next = impactOf(policy.values, current, policy.direction);
          const now = impactOf(policy.values, baseline[policy.id]!, policy.direction);
          const dirty = current.amber !== policy.amber || current.red !== policy.red;
          const deltaRed = next.red - now.red;
          const deltaAmber = next.amber - now.amber;

          const set = (key: keyof Limits) => (event: React.ChangeEvent<HTMLInputElement>) => {
            const value = Number(event.target.value);
            setLimits((state) => ({ ...state, [policy.id]: clampLimits(policy, { ...state[policy.id]!, [key]: value }, key) }));
          };

          return (
            <Panel key={policy.id} className="flex flex-col gap-4">
              <PanelHeader
                title={policy.label}
                subtitle={policy.description}
                actions={
                  <div className="flex items-center gap-2">
                    {policy.ataChapter ? <Badge variant="outline">ATA {policy.ataChapter}</Badge> : null}
                    {dirty ? <Badge variant="brand">Modified</Badge> : null}
                  </div>
                }
              />

              <div className="grid grid-cols-3 gap-3">
                <ImpactCell label="Red" tone="red" value={next.red} delta={deltaRed} />
                <ImpactCell label="Amber" tone="amber" value={next.amber} delta={deltaAmber} />
                <ImpactCell label="Nominal" tone="green" value={next.green} delta={-(deltaRed + deltaAmber)} />
              </div>

              <div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rr-mist" role="img" aria-label={`${next.red} red, ${next.amber} amber, ${next.green} nominal of ${next.total}`}>
                  {next.red > 0 ? <div className="bg-status-red" style={{ width: share(next.red, next.total) }} /> : null}
                  {next.amber > 0 ? <div className="bg-status-amber" style={{ width: share(next.amber, next.total) }} /> : null}
                  {next.green > 0 ? <div className="bg-status-green" style={{ width: share(next.green, next.total) }} /> : null}
                </div>
                <p className="mt-1.5 text-[11px] text-rr-slate">
                  Evaluated against {formatNumber(next.total)} {policy.population} ·{" "}
                  {policy.direction === "lower-is-worse" ? "lower readings are worse" : "higher readings are worse"}
                </p>
              </div>

              <div className="space-y-3">
                <LimitControl
                  policy={policy}
                  tone="amber"
                  label="Amber — watchlist"
                  value={current.amber}
                  published={policy.amber}
                  onChange={set("amber")}
                />
                <LimitControl
                  policy={policy}
                  tone="red"
                  label="Red — act now"
                  value={current.red}
                  published={policy.red}
                  onChange={set("red")}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
                <span>
                  Published {formatDate(policy.lastChangedAt)} by {policy.lastChangedBy}
                </span>
                <span className="rr-label">Owner · {policy.owner.replace("-", " ")}</span>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function ImpactCell({ label, tone, value, delta }: { label: string; tone: "red" | "amber" | "green"; value: number; delta: number }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  return (
    <div className="rounded-sm border border-rr-ink/8 px-3 py-2">
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", colour)}>{value}</p>
      <p className={cn("text-[11px]", delta === 0 ? "text-rr-slate" : "font-semibold text-rr-ink")}>
        {delta === 0 ? "unchanged" : `${delta > 0 ? "+" : ""}${delta} vs published`}
      </p>
    </div>
  );
}

function LimitControl({
  policy,
  tone,
  label,
  value,
  published,
  onChange,
}: {
  policy: ThresholdPolicy;
  tone: "amber" | "red";
  label: string;
  value: number;
  published: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const accent = tone === "red" ? "accent-[#ff5f6d]" : "accent-[#ffb43d]";
  const colour = tone === "red" ? "text-status-red" : "text-status-amber";
  const inputId = `${policy.id}-${tone}`;
  return (
    <div className="flex items-center gap-4">
      <label htmlFor={inputId} className="rr-label w-32 shrink-0 text-rr-slate">
        {label}
      </label>
      <input
        id={inputId}
        type="range"
        min={policy.min}
        max={policy.max}
        step={policy.step}
        value={value}
        onChange={onChange}
        aria-label={`${policy.label} ${tone} limit`}
        aria-valuetext={formatLimit(policy, value)}
        className={cn("h-1.5 flex-1 cursor-pointer rounded-full bg-rr-mist", accent)}
      />
      <span className={cn("rr-numeric w-24 shrink-0 text-right text-lg font-semibold", colour)}>{formatLimit(policy, value)}</span>
      <span className="rr-numeric w-20 shrink-0 text-right text-[11px] text-rr-slate">
        was {formatLimit(policy, published)}
      </span>
    </div>
  );
}

export function ThresholdSummary({ policies }: { policies: ThresholdPolicy[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {policies.map((policy) => {
        const impact = impactOf(policy.values, { amber: policy.amber, red: policy.red }, policy.direction);
        return (
          <div key={policy.id} className="flex items-center gap-2">
            <StatusPill status={impact.red > 0 ? "red" : impact.amber > 0 ? "amber" : "green"}>{impact.red}</StatusPill>
            <span className="text-xs text-rr-slate">{policy.label}</span>
          </div>
        );
      })}
    </div>
  );
}
