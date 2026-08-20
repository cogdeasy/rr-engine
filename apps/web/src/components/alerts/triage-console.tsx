"use client";

import * as React from "react";
import type { Alert, AlertEvidence, DispositionEntry, DispositionKind, TriageAlert } from "@rr/types";
import {
  Badge,
  Button,
  FilterBar,
  FilterChip,
  Panel,
  PanelHeader,
  SearchInput,
  StatusPill,
  cn,
  formatDateTime,
  relativeTime,
  statusStyles,
} from "@rr/ui";
import {
  DISPOSITION_LABELS,
  SEVERITY_ORDER,
  STATE_LABELS,
  colourRationale,
  formatHours,
  hoursRemaining,
  severityLabel,
} from "./triage-shared";
import { AlertDetail } from "./alert-detail";

const ACTOR = "duty.controller@rolls-royce.com";

const RESULTING_STATE: Record<DispositionKind, Alert["state"]> = {
  acknowledge: "triaged",
  escalate: "investigating",
  "raise-work-order": "actioned",
  "false-positive": "false-positive",
};

const DETAIL_TEXT: Record<DispositionKind, string> = {
  acknowledge: "Acknowledged by duty controller; alert retained on the watchlist.",
  escalate: "Escalated to the fleet engineering desk for investigation.",
  "raise-work-order": "Work order requested against the recommended action.",
  "false-positive": "Dispositioned as a false positive; signature not corroborated.",
};

const QUEUE_PAGE = 40;

export function TriageConsole({
  queue,
  evidence,
  now,
}: {
  queue: TriageAlert[];
  evidence: Record<string, AlertEvidence>;
  now: string;
}) {
  const [severities, setSeverities] = React.useState<Set<Alert["severity"]>>(new Set());
  const [sources, setSources] = React.useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = React.useState<string>("all");
  const [operator, setOperator] = React.useState<string>("all");
  const [beforeSectorOnly, setBeforeSectorOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [visible, setVisible] = React.useState(QUEUE_PAGE);

  const [overrides, setOverrides] = React.useState<Record<string, Alert["state"]>>({});
  const [entries, setEntries] = React.useState<DispositionEntry[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>(queue[0]?.alert.id ?? "");
  const [checked, setChecked] = React.useState<Set<string>>(new Set());

  const operators = React.useMemo(
    () => Array.from(new Map(queue.map((q) => [q.operatorCode, q.operatorName])).entries()).sort(),
    [queue],
  );
  const allSources = React.useMemo(() => Array.from(new Set(queue.map((q) => q.alert.source))).sort(), [queue]);

  const effectiveState = React.useCallback(
    (item: TriageAlert): Alert["state"] => overrides[item.alert.id] ?? item.alert.state,
    [overrides],
  );

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return queue.filter((item) => {
      if (severities.size > 0 && !severities.has(item.alert.severity)) return false;
      if (sources.size > 0 && !sources.has(item.alert.source)) return false;
      if (stateFilter !== "all" && effectiveState(item) !== stateFilter) return false;
      if (operator !== "all" && item.operatorCode !== operator) return false;
      if (beforeSectorOnly && !item.needsActionBeforeNextSector) return false;
      if (term.length > 0) {
        const haystack = `${item.alert.title} ${item.esn} ${item.aircraftTail ?? ""} ${item.operatorName} ${item.alert.ataChapter} ${item.alert.source}`;
        if (!haystack.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [queue, severities, sources, stateFilter, operator, beforeSectorOnly, search, effectiveState]);

  React.useEffect(() => {
    setVisible(QUEUE_PAGE);
  }, [severities, sources, stateFilter, operator, beforeSectorOnly, search]);

  React.useEffect(() => {
    if (filtered.length > 0 && !filtered.some((item) => item.alert.id === selectedId)) {
      setSelectedId(filtered[0]!.alert.id);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((item) => item.alert.id === selectedId) ?? queue.find((item) => item.alert.id === selectedId);

  const disposition = React.useCallback(
    (alertIds: string[], kind: DispositionKind) => {
      if (alertIds.length === 0) return;
      const at = new Date().toISOString();
      setOverrides((prev) => {
        const next = { ...prev };
        for (const alertId of alertIds) next[alertId] = RESULTING_STATE[kind];
        return next;
      });
      setEntries((prev) => [
        ...alertIds.map((alertId, index) => ({
          id: `local-${alertId}-${prev.length + index}`,
          alertId,
          kind,
          at,
          actor: ACTOR,
          resultingState: RESULTING_STATE[kind],
          detail: DETAIL_TEXT[kind],
        })),
        ...prev,
      ]);
    },
    [],
  );

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const visibleRows = filtered.slice(0, visible);
  const checkedInView = visibleRows.filter((item) => checked.has(item.alert.id));
  const trailForSelected = selected
    ? [...(evidence[selected.alert.id]?.history ?? []), ...entries.filter((e) => e.alertId === selected.alert.id).reverse()]
    : [];

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <FilterBar>
          <span className="rr-label mr-1 text-rr-slate">Severity</span>
          {SEVERITY_ORDER.filter((severity) => queue.some((q) => q.alert.severity === severity)).map((severity) => (
            <FilterChip
              key={severity}
              label={severityLabel(severity)}
              active={severities.has(severity)}
              count={queue.filter((q) => q.alert.severity === severity).length}
              onClick={() => setSeverities((prev) => toggleSet(prev, severity))}
            />
          ))}
          <span className="ml-auto" />
          <SearchInput value={search} onChange={setSearch} placeholder="ESN, tail, ATA, title" className="w-64" />
        </FilterBar>

        <FilterBar>
          <span className="rr-label mr-1 text-rr-slate">Source</span>
          {allSources.map((source) => (
            <FilterChip
              key={source}
              label={source}
              active={sources.has(source)}
              count={queue.filter((q) => q.alert.source === source).length}
              onClick={() => setSources((prev) => toggleSet(prev, source))}
            />
          ))}
        </FilterBar>

        <FilterBar>
          <label className="rr-label flex items-center gap-2 text-rr-slate">
            State
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs font-medium normal-case tracking-normal text-rr-ink focus:border-rr-blue focus:outline-none"
            >
              <option value="all">All states</option>
              {(["new", "triaged", "investigating", "actioned", "false-positive"] as Alert["state"][]).map((state) => (
                <option key={state} value={state}>
                  {STATE_LABELS[state]}
                </option>
              ))}
            </select>
          </label>

          <label className="rr-label flex items-center gap-2 text-rr-slate">
            Operator
            <select
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
              className="h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs font-medium normal-case tracking-normal text-rr-ink focus:border-rr-blue focus:outline-none"
            >
              <option value="all">All operators</option>
              {operators.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
          </label>

          <FilterChip
            label="Needs action before next sector"
            active={beforeSectorOnly}
            count={queue.filter((q) => q.needsActionBeforeNextSector).length}
            onClick={() => setBeforeSectorOnly((prev) => !prev)}
          />

          {severities.size > 0 || sources.size > 0 || stateFilter !== "all" || operator !== "all" || beforeSectorOnly || search ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSeverities(new Set());
                setSources(new Set());
                setStateFilter("all");
                setOperator("all");
                setBeforeSectorOnly(false);
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </FilterBar>
      </Panel>

      <div className="grid gap-4 min-[1600px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Panel padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rr-ink/8 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-rr-ink">Triage queue</h3>
                <p className="mt-0.5 text-xs text-rr-slate">
                  {filtered.length} of {queue.length} open alerts · ranked by severity, then time to action
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-rr-slate">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#10069F]"
                    aria-label="Select all alerts in view"
                    checked={visibleRows.length > 0 && checkedInView.length === visibleRows.length}
                    onChange={(event) =>
                      setChecked(() => (event.target.checked ? new Set(visibleRows.map((item) => item.alert.id)) : new Set()))
                    }
                  />
                  Select all in view
                </label>
              </div>
            </div>

            {checked.size > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rr-ink/8 bg-rr-blue-50 px-5 py-3">
                <p className="rr-numeric text-xs font-semibold text-rr-blue">{checked.size} selected</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      disposition([...checked], "acknowledge");
                      setChecked(new Set());
                    }}
                  >
                    Acknowledge selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
                    Clear selection
                  </Button>
                </div>
              </div>
            ) : null}

            <ul className="divide-y divide-rr-ink/5">
              {visibleRows.map((item) => {
                const state = effectiveState(item);
                const remaining = hoursRemaining(item);
                const overdue = remaining !== null && remaining <= 0;
                const isSelected = item.alert.id === selectedId;
                return (
                  <li key={item.alert.id} className={cn("flex gap-3 px-4 py-3", isSelected && "bg-rr-blue-50/70")}>
                    <div className="flex items-start pt-1">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[#10069F]"
                        aria-label={`Select alert ${item.alert.id}`}
                        checked={checked.has(item.alert.id)}
                        onChange={() => setChecked((prev) => toggleSet(prev, item.alert.id))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.alert.id)}
                      aria-current={isSelected}
                      className={cn(
                        "flex-1 border-l-2 pl-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                        statusStyles[item.alert.status].border.replace("border-", "border-l-"),
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-semibold leading-snug text-rr-ink">{item.alert.title}</p>
                        <StatusPill status={item.alert.status}>{severityLabel(item.alert.severity)}</StatusPill>
                      </div>
                      <p className="mt-1 text-[11px] text-rr-slate">
                        {item.alert.source} · ATA {item.alert.ataChapter} · {item.operatorCode} ·{" "}
                        {item.aircraftTail ?? "off wing"} {item.positionLabel} · {relativeTime(item.alert.raisedAt, new Date(now))}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rr-numeric rounded-sm px-1.5 py-0.5 text-[11px] font-semibold",
                            overdue
                              ? "bg-status-red-soft text-status-red"
                              : remaining !== null && remaining < 48
                                ? "bg-status-amber-soft text-status-amber"
                                : "bg-rr-mist text-rr-slate",
                          )}
                        >
                          {remaining === null ? "no deadline" : overdue ? `overdue ${formatHours(-remaining)}` : `T-${formatHours(remaining)}`}
                        </span>
                        {item.needsActionBeforeNextSector ? (
                          <span className="rounded-sm bg-status-red-soft px-1.5 py-0.5 text-[11px] font-semibold text-status-red">
                            before next sector
                          </span>
                        ) : null}
                        <Badge variant="neutral">{STATE_LABELS[state]}</Badge>
                        {item.alert.confidence !== undefined ? (
                          <span className="rr-numeric text-[11px] text-rr-slate">
                            conf {Math.round(item.alert.confidence * 100)}%
                          </span>
                        ) : null}
                        <span className="rr-numeric text-[11px] text-rr-slate">{item.esn}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-1 text-[11px] text-rr-slate">→ {item.alert.recommendedAction}</p>
                    </button>
                  </li>
                );
              })}
              {visibleRows.length === 0 ? (
                <li className="px-5 py-12 text-center text-xs text-rr-slate">No alerts match the current filters.</li>
              ) : null}
            </ul>

            {visible < filtered.length ? (
              <div className="border-t border-rr-ink/8 px-5 py-3 text-center">
                <Button size="sm" variant="secondary" onClick={() => setVisible((v) => v + QUEUE_PAGE)}>
                  Show {Math.min(QUEUE_PAGE, filtered.length - visible)} more
                </Button>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader
              title="Disposition trail — this session"
              subtitle="Every action taken in the console, most recent first"
              actions={<Badge variant="brand">{entries.length}</Badge>}
            />
            {entries.length === 0 ? (
              <p className="py-4 text-xs text-rr-slate">
                No dispositions recorded yet. Acknowledge, escalate, raise a work order or mark a false positive to build the
                trail.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {entries.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 border-l border-rr-blue/30 pl-3">
                    <div>
                      <p className="text-[13px] font-medium text-rr-ink">
                        {DISPOSITION_LABELS[entry.kind]} · {entry.alertId}
                      </p>
                      <p className="text-[11px] text-rr-slate">
                        {formatDateTime(entry.at)} · {entry.actor}
                      </p>
                    </div>
                    <Badge variant="outline">{STATE_LABELS[entry.resultingState]}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div>
          {selected ? (
            <AlertDetail
              item={{ ...selected, alert: { ...selected.alert, state: effectiveState(selected) } }}
              evidence={evidence[selected.alert.id]}
              trail={trailForSelected}
              onDisposition={(kind) => disposition([selected.alert.id], kind)}
            />
          ) : (
            <Panel className="flex h-64 items-center justify-center">
              <p className="text-xs text-rr-slate">Select an alert from the queue to see its evidence.</p>
            </Panel>
          )}
        </div>
      </div>

      <p className="text-[11px] text-rr-slate">
        Colour discipline: red rows are critical severity, past their action deadline, or due before the aircraft&apos;s next
        departure. Hover rationale: {selected ? colourRationale(selected) : "—"}
      </p>
    </div>
  );
}
