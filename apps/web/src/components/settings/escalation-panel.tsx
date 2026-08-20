"use client";

import * as React from "react";
import { Badge, Button, Panel, PanelHeader, StatusPill, cn, formatNumber, relativeTime } from "@rr/ui";
import type { EscalationPolicy, PlatformRoleId, PlatformUser, RoleDefinition } from "@rr/types";

const CHANNELS = ["Page", "Voice", "Teams", "Email", "Digest"] as const;

const ACK_OPTIONS = [5, 15, 30, 60, 120, 240, 480, 1440];

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "No ack";
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0 && minutes < 1440) return `${minutes / 60}h`;
  if (minutes === 1440) return "24h";
  return `${Math.round(minutes / 60)}h`;
}

interface PolicyState {
  ackSlaMinutes: number;
  primaryRoleId: PlatformRoleId;
  escalateToRoleId: PlatformRoleId;
  channels: string[];
}

export function EscalationPanel({
  policies,
  roles,
  users,
}: {
  policies: EscalationPolicy[];
  roles: RoleDefinition[];
  users: PlatformUser[];
}) {
  const baseline = React.useMemo(
    () =>
      Object.fromEntries(
        policies.map((p) => [
          p.severity,
          {
            ackSlaMinutes: p.ackSlaMinutes,
            primaryRoleId: p.primaryRoleId,
            escalateToRoleId: p.escalateToRoleId,
            channels: CHANNELS.filter((c) => p.channels.includes(c)),
          },
        ]),
      ) as Record<string, PolicyState>,
    [policies],
  );
  const [state, setState] = React.useState<Record<string, PolicyState>>(baseline);

  const dirty = policies.filter((p) => JSON.stringify(state[p.severity]) !== JSON.stringify(baseline[p.severity]));
  const totalBreached = policies.reduce((sum, p) => sum + p.breachedCount, 0);

  const update = (severity: string, patch: Partial<PolicyState>) =>
    setState((prev) => ({ ...prev, [severity]: { ...prev[severity]!, ...patch } }));

  const toggleChannel = (severity: string, channel: string) => {
    const current = state[severity]!.channels;
    const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
    // Keep channel order canonical so toggling off and back on is not seen as a change.
    update(severity, { channels: CHANNELS.filter((c) => next.includes(c)) });
  };

  return (
    <div className="space-y-5">
      <Panel className={cn("flex flex-wrap items-center justify-between gap-4", totalBreached > 0 && "border-status-red/30 bg-status-red-soft/50")}>
        <div>
          <p className="rr-label text-rr-slate">Policy in force</p>
          <p className="mt-1 text-sm text-rr-ink">
            {totalBreached > 0 ? (
              <>
                <span className="rr-numeric font-semibold text-status-red">{totalBreached} alerts</span> are past their
                acknowledgement SLA under the published policy — page the escalation role or widen the responding tier.
              </>
            ) : (
              "Every open alert is inside its acknowledgement SLA under the published policy."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setState(baseline)} disabled={dirty.length === 0}>
            Reset
          </Button>
          <Button variant={totalBreached > 0 ? "danger" : "primary"} size="sm">
            {totalBreached > 0 ? "Page tier owners" : "Publish policy"}
          </Button>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="p-5 pb-0">
          <PanelHeader
            title="Notification & escalation policy"
            subtitle="Who is paged for which severity, how quickly they must acknowledge, and who inherits the alert if they do not."
            actions={dirty.length > 0 ? <Badge variant="brand">{dirty.length} unsaved</Badge> : null}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-rr-ink/8 bg-rr-mist/60">
                <th scope="col" className="rr-label px-5 py-2.5 text-left text-rr-slate">Severity</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">First responder</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">Escalates to</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-left text-rr-slate">Channels</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-right text-rr-slate">Ack SLA</th>
                <th scope="col" className="rr-label px-4 py-2.5 text-right text-rr-slate">Resolve SLA</th>
                <th scope="col" className="rr-label px-5 py-2.5 text-right text-rr-slate">Live compliance</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => {
                const current = state[policy.severity]!;
                return (
                  <tr key={policy.severity} className="border-b border-rr-ink/5 last:border-0 align-top">
                    <td className={cn("px-5 py-4 border-l-2", policy.status === "red" ? "border-l-status-red" : policy.status === "amber" ? "border-l-status-amber" : policy.status === "green" ? "border-l-status-green" : "border-l-status-grey")}>
                      <p className="text-[13px] font-semibold capitalize text-rr-ink">{policy.severity}</p>
                      <p className="text-[11px] leading-snug text-rr-slate">{policy.label}</p>
                    </td>
                    <td className="px-4 py-4">
                      <RoleSelect
                        id={`${policy.severity}-primary`}
                        label={`First responder for ${policy.severity} alerts`}
                        roles={roles}
                        value={current.primaryRoleId}
                        onChange={(value) => update(policy.severity, { primaryRoleId: value })}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <RoleSelect
                        id={`${policy.severity}-escalate`}
                        label={`Escalation role for ${policy.severity} alerts`}
                        roles={roles}
                        value={current.escalateToRoleId}
                        onChange={(value) => update(policy.severity, { escalateToRoleId: value })}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {CHANNELS.map((channel) => {
                          const active = current.channels.includes(channel);
                          return (
                            <button
                              key={channel}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleChannel(policy.severity, channel)}
                              className={cn(
                                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                                active
                                  ? "border-rr-blue bg-rr-blue text-white"
                                  : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
                              )}
                            >
                              {channel}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <label className="sr-only" htmlFor={`${policy.severity}-ack`}>
                        Acknowledgement SLA for {policy.severity} alerts
                      </label>
                      <select
                        id={`${policy.severity}-ack`}
                        value={current.ackSlaMinutes}
                        onChange={(event) => update(policy.severity, { ackSlaMinutes: Number(event.target.value) })}
                        disabled={policy.ackSlaMinutes === 0}
                        className="rr-numeric h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs font-semibold text-rr-ink focus:border-rr-blue focus:outline-none disabled:opacity-50"
                      >
                        {policy.ackSlaMinutes === 0 ? <option value={0}>No ack</option> : null}
                        {ACK_OPTIONS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {formatMinutes(minutes)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="rr-numeric px-4 py-4 text-right text-rr-slate">
                      {policy.resolveSlaHours === 0 ? "—" : `${policy.resolveSlaHours}h`}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <StatusPill status={policy.status}>
                          {policy.status === "grey" ? "no SLA" : policy.breachedCount > 0 ? `${policy.breachedCount} breached` : "in SLA"}
                        </StatusPill>
                      </div>
                      <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
                        {formatNumber(policy.openCount)} open · median ack {formatMinutes(policy.medianAckMinutes)}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        {roles
          .filter((role) => role.escalationTier <= 2)
          .map((role) => {
            const roster = users
              .filter((u) => u.roleId === role.id)
              .sort((a, b) => {
                if (a.mfaEnrolled !== b.mfaEnrolled) return a.mfaEnrolled ? -1 : 1;
                return a.lastActiveAt < b.lastActiveAt ? 1 : -1;
              })
              .slice(0, 4);
            const reachable = users.filter((u) => u.roleId === role.id && u.mfaEnrolled).length;
            return (
              <Panel key={role.id}>
                <PanelHeader
                  title={`Tier ${role.escalationTier} · ${role.label}`}
                  subtitle="Reachable members are paged first, most recently active leading."
                  actions={
                    reachable === 0 ? <StatusPill status="red">No reachable owner</StatusPill> : <Badge variant="outline">{reachable} reachable</Badge>
                  }
                />
                <ul className="space-y-2.5">
                  {roster.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-rr-ink">{user.name}</p>
                        <p className="text-[11px] text-rr-slate">{user.scopeLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="rr-numeric text-[11px] text-rr-slate">{relativeTime(user.lastActiveAt)}</p>
                        {!user.mfaEnrolled ? (
                          <StatusPill status="red">no MFA</StatusPill>
                        ) : user.accessReviewDueDays < 0 ? (
                          <StatusPill status="amber">review overdue</StatusPill>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
      </div>
    </div>
  );
}

function RoleSelect({
  id,
  label,
  roles,
  value,
  onChange,
}: {
  id: string;
  label: string;
  roles: RoleDefinition[];
  value: PlatformRoleId;
  onChange: (value: PlatformRoleId) => void;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as PlatformRoleId)}
        className="h-8 w-44 rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </select>
    </>
  );
}
