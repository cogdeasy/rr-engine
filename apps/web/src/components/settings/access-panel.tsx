"use client";

import * as React from "react";
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatNumber,
  relativeTime,
  statusStyles,
  type Column,
} from "@rr/ui";
import type { PermissionLevel, PlatformUser, RoleDefinition } from "@rr/types";

const LEVEL_LABEL: Record<PermissionLevel, string> = {
  none: "—",
  view: "View",
  action: "Action",
  approve: "Approve",
};

/** Privilege is shown in brand tones; operational red/amber stays reserved for fleet state. */
const LEVEL_STYLE: Record<PermissionLevel, string> = {
  none: "border border-dashed border-rr-ink/15 text-rr-slate/60",
  view: "bg-rr-mist text-rr-slate",
  action: "bg-rr-blue-50 text-rr-blue",
  approve: "bg-rr-blue text-white",
};

export function AccessPanel({
  roles,
  users,
  moduleGroups,
}: {
  roles: RoleDefinition[];
  users: PlatformUser[];
  moduleGroups: { id: string; label: string }[];
}) {
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string | null>(null);
  const [exceptionsOnly, setExceptionsOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter && user.roleId !== roleFilter) return false;
      if (exceptionsOnly && user.status === "green") return false;
      if (!needle) return true;
      return (
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.organisation.toLowerCase().includes(needle) ||
        user.scopeLabel.toLowerCase().includes(needle)
      );
    });
  }, [users, query, roleFilter, exceptionsOnly]);

  const columns: Column<PlatformUser>[] = [
    {
      key: "name",
      header: "User",
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <p className="font-semibold text-rr-ink">{row.name}</p>
          <p className="text-[11px] text-rr-slate">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (row) => row.roleId,
      render: (row) => <span className="text-rr-slate">{roles.find((r) => r.id === row.roleId)?.label}</span>,
    },
    {
      key: "scope",
      header: "Access scope",
      sortValue: (row) => row.scopeLabel,
      render: (row) => (
        <div>
          <p className="text-[13px] text-rr-ink">{row.scopeLabel}</p>
          <p className="text-[11px] text-rr-slate">
            {row.organisation} · {row.region}
          </p>
        </div>
      ),
    },
    {
      key: "mfa",
      header: "MFA",
      align: "center",
      sortValue: (row) => (row.mfaEnrolled ? 1 : 0),
      render: (row) =>
        row.mfaEnrolled ? (
          <Badge variant="outline">Enrolled</Badge>
        ) : (
          <StatusPill status="red">Missing</StatusPill>
        ),
    },
    {
      key: "review",
      header: "Access review",
      align: "right",
      sortValue: (row) => row.accessReviewDueDays,
      render: (row) => (
        <span
          className={cn(
            "rr-numeric",
            row.accessReviewDueDays < 0 ? "font-semibold text-status-red" : row.accessReviewDueDays <= 14 ? "font-semibold text-status-amber" : "text-rr-slate",
          )}
        >
          {row.accessReviewDueDays < 0 ? `${Math.abs(row.accessReviewDueDays)}d overdue` : `in ${row.accessReviewDueDays}d`}
        </span>
      ),
    },
    {
      key: "activity",
      header: "Last active",
      align: "right",
      sortValue: (row) => row.lastActiveAt,
      render: (row) => (
        <div>
          <p className="rr-numeric text-[13px] text-rr-ink">{relativeTime(row.lastActiveAt)}</p>
          <p className="rr-numeric text-[11px] text-rr-slate">{formatNumber(row.actionsLast30d)} actions / 30d</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Exception",
      sortValue: (row) => ({ red: 3, amber: 2, green: 1, grey: 0 })[row.status],
      render: (row) =>
        row.exception ? (
          <div className="flex items-center gap-2">
            <StatusPill status={row.status} />
            <span className="text-[11px] leading-snug text-rr-slate">{row.exception}</span>
          </div>
        ) : (
          <StatusPill status="green">Nominal</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 sm:grid-cols-2">
        {roles.map((role) => (
          <Panel key={role.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="rr-label text-rr-blue">Tier {role.escalationTier}</p>
                <p className="mt-1 text-sm font-semibold text-rr-ink">{role.label}</p>
              </div>
              <span className="rr-numeric text-2xl font-semibold text-rr-ink">{role.memberCount}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rr-slate">{role.mandate}</p>
            <div className="mt-auto flex items-center justify-between border-t border-rr-ink/8 pt-3">
              <span className="rr-label text-rr-slate">Needs attention</span>
              {role.flaggedCount > 0 ? (
                <StatusPill status="amber">{role.flaggedCount}</StatusPill>
              ) : (
                <StatusPill status="green">0</StatusPill>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Permission matrix"
          subtitle="What each role may do inside every module group. Approve implies action, action implies view."
          actions={
            <div className="flex items-center gap-2">
              {(["view", "action", "approve"] as PermissionLevel[]).map((level) => (
                <span key={level} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", LEVEL_STYLE[level])}>
                  {LEVEL_LABEL[level]}
                </span>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Permission level granted to each role for each module group</caption>
            <thead>
              <tr className="border-b border-rr-ink/8">
                <th scope="col" className="rr-label py-2 text-left text-rr-slate">
                  Role
                </th>
                {moduleGroups.map((group) => (
                  <th key={group.id} scope="col" className="rr-label px-2 py-2 text-center text-rr-slate">
                    {group.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b border-rr-ink/5 last:border-0">
                  <th scope="row" className="py-2.5 pr-4 text-left text-[13px] font-semibold text-rr-ink">
                    {role.label}
                  </th>
                  {moduleGroups.map((group) => {
                    const level = (role.permissions[group.id] ?? "none") as PermissionLevel;
                    return (
                      <td key={group.id} className="px-2 py-2.5 text-center">
                        <span
                          className={cn("inline-flex min-w-[68px] justify-center rounded-full px-2 py-1 text-[11px] font-semibold", LEVEL_STYLE[level])}
                          title={`${role.label} · ${group.label} · ${LEVEL_LABEL[level]}`}
                        >
                          {LEVEL_LABEL[level]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar>
            <FilterChip label="All roles" active={roleFilter === null} onClick={() => setRoleFilter(null)} count={users.length} />
            {roles.map((role) => (
              <FilterChip
                key={role.id}
                label={role.label}
                active={roleFilter === role.id}
                onClick={() => setRoleFilter(role.id)}
                count={role.memberCount}
              />
            ))}
          </FilterBar>
          <div className="flex items-center gap-2">
            <Button
              variant={exceptionsOnly ? "primary" : "secondary"}
              size="sm"
              aria-pressed={exceptionsOnly}
              onClick={() => setExceptionsOnly((value) => !value)}
            >
              Exceptions only
            </Button>
            <SearchInput value={query} onChange={setQuery} placeholder="Search people, operators, bases" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          initialSortKey="status"
          rowAccent={(row) => (row.status === "green" ? undefined : statusStyles[row.status].border.replace("border-", "border-l-"))}
          emptyMessage="No accounts match the current filters."
        />
      </div>
    </div>
  );
}
