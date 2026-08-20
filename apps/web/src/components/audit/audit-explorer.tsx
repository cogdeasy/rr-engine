"use client";

import * as React from "react";
import type { AuditCategory, AuditEntityType, AuditRecord } from "@rr/types";
import { Button, FilterBar, FilterChip, Panel, PanelHeader, SearchInput, cn, formatNumber } from "@rr/ui";
import { AuditRecordCard } from "./audit-record-card";
import { CATEGORY_LABELS, ENTITY_LABELS, formatDay } from "./format";

const RANGES = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
  { id: "30d", label: "30 days", hours: 24 * 30 },
  { id: "all", label: "Full window", hours: Number.POSITIVE_INFINITY },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const PAGE_SIZE = 60;

export function AuditExplorer({
  records,
  now,
  slaHours,
  totalRecords,
}: {
  records: AuditRecord[];
  now: string;
  slaHours: number;
  /** Size of the full ledger, of which `records` is the loaded window. */
  totalRecords: number;
}) {
  const [query, setQuery] = React.useState("");
  const [range, setRange] = React.useState<RangeId>("7d");
  const [categories, setCategories] = React.useState<AuditCategory[]>([]);
  const [entityType, setEntityType] = React.useState<AuditEntityType | "all">("all");
  const [actorHandle, setActorHandle] = React.useState("all");
  const [overridesOnly, setOverridesOnly] = React.useState(false);
  const [gapsOnly, setGapsOnly] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const nowMs = new Date(now).getTime();

  const actorOptions = React.useMemo(() => {
    const counts = new Map<string, { handle: string; name: string; count: number }>();
    for (const record of records) {
      const existing = counts.get(record.actor.handle);
      if (existing) existing.count += 1;
      else counts.set(record.actor.handle, { handle: record.actor.handle, name: record.actor.name, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [records]);

  const categoryCounts = React.useMemo(() => {
    const counts = {} as Record<AuditCategory, number>;
    for (const record of records) counts[record.category] = (counts[record.category] ?? 0) + 1;
    return counts;
  }, [records]);

  const filtered = React.useMemo(() => {
    const rangeHours = RANGES.find((r) => r.id === range)!.hours;
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if ((nowMs - new Date(record.at).getTime()) / 3600000 > rangeHours) return false;
      if (categories.length > 0 && !categories.includes(record.category)) return false;
      if (entityType !== "all" && record.entityType !== entityType) return false;
      if (actorHandle !== "all" && record.actor.handle !== actorHandle) return false;
      if (overridesOnly && !record.override) return false;
      if (gapsOnly && record.status !== "red") return false;
      if (needle.length > 0) {
        const haystack = [
          record.action,
          record.detail,
          record.entityId,
          record.entityLabel,
          record.actor.name,
          record.actor.handle,
          record.esn ?? "",
          record.operatorCode ?? "",
          record.changes.map((c) => `${c.field} ${c.before ?? ""} ${c.after ?? ""}`).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [records, range, query, categories, entityType, actorHandle, overridesOnly, gapsOnly, nowMs]);

  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, range, categories, entityType, actorHandle, overridesOnly, gapsOnly]);

  const visible = filtered.slice(0, limit);

  const days = React.useMemo(() => {
    const byDay = new Map<string, AuditRecord[]>();
    for (const record of visible) {
      const day = record.at.slice(0, 10);
      const bucket = byDay.get(day);
      if (bucket) bucket.push(record);
      else byDay.set(day, [record]);
    }
    return [...byDay.entries()];
  }, [visible]);

  const filtersActive =
    query.length > 0 || range !== "7d" || categories.length > 0 || entityType !== "all" || actorHandle !== "all" || overridesOnly || gapsOnly;

  function toggleCategory(category: AuditCategory) {
    setCategories((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
  }

  function reset() {
    setQuery("");
    setRange("7d");
    setCategories([]);
    setEntityType("all");
    setActorHandle("all");
    setOverridesOnly(false);
    setGapsOnly(false);
  }

  return (
    <Panel>
      <PanelHeader
        title="Ledger"
        subtitle={`Append-only, newest first. ${formatNumber(filtered.length)} of ${formatNumber(records.length)} loaded records match — ledger holds ${formatNumber(totalRecords)}.`}
        actions={
          filtersActive ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          ) : null
        }
      />

      <div className="space-y-3 border-y border-rr-ink/8 py-3">
        <FilterBar>
          <SearchInput value={query} onChange={setQuery} placeholder="Search actor, entity, ESN, field…" className="w-72" />
          <span className="ml-1 h-5 w-px bg-rr-ink/10" aria-hidden />
          {RANGES.map((option) => (
            <FilterChip key={option.id} label={option.label} active={range === option.id} onClick={() => setRange(option.id)} />
          ))}
          <span className="ml-1 h-5 w-px bg-rr-ink/10" aria-hidden />
          <FilterChip label="Overrides" active={overridesOnly} onClick={() => setOverridesOnly((v) => !v)} />
          <FilterChip label="Evidential gaps" active={gapsOnly} onClick={() => setGapsOnly((v) => !v)} />
        </FilterBar>

        <FilterBar>
          {(Object.keys(CATEGORY_LABELS) as AuditCategory[]).map((category) => (
            <FilterChip
              key={category}
              label={CATEGORY_LABELS[category]}
              count={categoryCounts[category] ?? 0}
              active={categories.includes(category)}
              onClick={() => toggleCategory(category)}
            />
          ))}
          <span className="ml-auto flex items-center gap-2">
            <label className="rr-label text-rr-slate" htmlFor="audit-entity-type">
              Entity
            </label>
            <select
              id="audit-entity-type"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value as AuditEntityType | "all")}
              className="h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
            >
              <option value="all">All types</option>
              {(Object.keys(ENTITY_LABELS) as AuditEntityType[]).map((type) => (
                <option key={type} value={type}>
                  {ENTITY_LABELS[type]}
                </option>
              ))}
            </select>
            <label className="rr-label text-rr-slate" htmlFor="audit-actor">
              Actor
            </label>
            <select
              id="audit-actor"
              value={actorHandle}
              onChange={(event) => setActorHandle(event.target.value)}
              className="h-8 max-w-56 rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
            >
              <option value="all">All actors</option>
              {actorOptions.map((actor) => (
                <option key={actor.handle} value={actor.handle}>
                  {actor.name} ({actor.count})
                </option>
              ))}
            </select>
          </span>
        </FilterBar>
      </div>

      {days.length === 0 ? (
        <p className="px-2 py-14 text-center text-xs text-rr-slate">
          No ledger entries match these filters. Widen the date range or clear the search.
        </p>
      ) : (
        <div className="divide-y divide-rr-ink/8">
          {days.map(([day, dayRecords]) => {
            const overrides = dayRecords.filter((r) => r.override).length;
            const gaps = dayRecords.filter((r) => r.status === "red").length;
            return (
              <section key={day} className="py-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h4 className="text-[13px] font-semibold text-rr-ink">{formatDay(day)}</h4>
                  <span className="rr-numeric text-[11px] text-rr-slate">{dayRecords.length} entries</span>
                  {overrides > 0 ? <span className="rr-numeric text-[11px] text-status-amber">{overrides} overrides</span> : null}
                  {gaps > 0 ? <span className="rr-numeric text-[11px] text-status-red">{gaps} evidential gaps</span> : null}
                </div>
                <ul className="mt-1 divide-y divide-rr-ink/5">
                  {dayRecords.map((record) => (
                    <AuditRecordCard key={record.id} record={record} slaHours={slaHours} now={now} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {filtered.length > visible.length ? (
        <div className={cn("flex justify-center pt-4")}>
          <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more of {filtered.length - visible.length}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
