"use client";

import * as React from "react";
import type { AssignmentSuggestion, SuggestedTechnician } from "@rr/types";
import { Badge, Button, Panel, PanelHeader, StatusPill, cn, formatDate, statusStyles } from "@rr/ui";

/**
 * Unstaffed critical/high task cards with the best certified technician at the
 * owning facility. Selecting a card shows why the suggestion was made and the
 * alternates a planner can fall back on.
 */
export function AssignmentBoard({ suggestions }: { suggestions: AssignmentSuggestion[] }) {
  const [selectedId, setSelectedId] = React.useState(suggestions[0]?.taskCardId ?? "");
  const [assigned, setAssigned] = React.useState<Record<string, string>>({});

  const selected = suggestions.find((s) => s.taskCardId === selectedId) ?? suggestions[0];
  const outstanding = suggestions.filter((s) => !assigned[s.taskCardId]).length;

  if (!selected) {
    return (
      <Panel>
        <PanelHeader title="Assignment queue" subtitle="Unstaffed critical and high priority task cards" />
        <p className="py-10 text-center text-sm text-rr-slate">Every priority card in the horizon has a named owner.</p>
      </Panel>
    );
  }

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Assignment queue"
        subtitle="Unstaffed critical and high priority task cards, ranked by risk to the release date"
        actions={<StatusPill status={outstanding > 0 ? "red" : "green"}>{outstanding} to staff</StatusPill>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="max-h-[460px] space-y-1 overflow-y-auto pr-1" aria-label="Unstaffed priority task cards">
          {suggestions.map((suggestion) => {
            const isSelected = suggestion.taskCardId === selected.taskCardId;
            const staged = assigned[suggestion.taskCardId];
            return (
              <li key={suggestion.taskCardId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(suggestion.taskCardId)}
                  aria-current={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors",
                    isSelected ? "border-rr-blue/30 bg-rr-blue-50" : "border-transparent hover:bg-rr-mist",
                  )}
                >
                  <span
                    className={cn("h-8 w-1 shrink-0 rounded-full", statusStyles[staged ? "green" : suggestion.status].dot)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="rr-numeric text-[13px] font-semibold text-rr-ink">{suggestion.taskReference}</span>
                      <Badge variant={suggestion.priority === "critical" ? "brand" : "neutral"}>{suggestion.priority}</Badge>
                      <span className="truncate text-[13px] text-rr-slate">{suggestion.taskTitle}</span>
                    </span>
                    <span className="rr-numeric mt-0.5 block text-[11px] text-rr-slate">
                      {suggestion.facilityIcao} · {suggestion.skillRequired} · {suggestion.estimatedHours}h ·{" "}
                      {suggestion.engineEsn}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "rr-numeric block text-[13px] font-semibold",
                        suggestion.daysToStart <= 2 ? "text-status-red" : "text-rr-ink",
                      )}
                    >
                      {Math.abs(suggestion.daysToStart)}d
                    </span>
                    <span className="block text-[10px] text-rr-slate">
                      {suggestion.daysToStart < 0 ? "overdue" : "to start"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="rounded-sm bg-rr-mist p-4">
          <p className="rr-label text-rr-slate">Recommended action</p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-rr-ink">{selected.action}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rr-ink/8 pt-3 text-xs">
            <Field label="Work order" value={selected.workOrderReference} />
            <Field label="Engine" value={`${selected.engineEsn} · ${selected.family}`} />
            <Field label="Skill" value={selected.skillRequired} />
            <Field
              label={selected.daysToStart < 0 ? "Started" : "Starts"}
              value={formatDate(selected.startsAt)}
            />
          </dl>

          {selected.candidate ? (
            <div className="mt-4">
              <p className="rr-label text-rr-slate">Best match</p>
              <CandidateCard candidate={selected.candidate} />
              <Button
                className="mt-3 w-full"
                size="sm"
                variant={assigned[selected.taskCardId] ? "secondary" : "primary"}
                onClick={() =>
                  setAssigned((prev) => ({
                    ...prev,
                    [selected.taskCardId]: prev[selected.taskCardId] ? "" : selected.candidate!.name,
                  }))
                }
              >
                {assigned[selected.taskCardId]
                  ? `Staged for ${assigned[selected.taskCardId]} — undo`
                  : `Assign ${selected.candidate.name}`}
              </Button>
              {selected.alternates.length > 0 ? (
                <div className="mt-4">
                  <p className="rr-label text-rr-slate">Alternates</p>
                  {selected.alternates.map((alternate) => (
                    <CandidateCard key={alternate.technicianId} candidate={alternate} compact />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-sm border border-status-red/30 bg-status-red-soft p-3 text-xs leading-relaxed text-status-red">
              No technician at {selected.facilityIcao} holds a current {selected.skillRequired} approval together with{" "}
              {selected.family} authorisation. Escalate to resource planning.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className="rr-numeric mt-0.5 text-[13px] text-rr-ink">{value}</dd>
    </div>
  );
}

function CandidateCard({ candidate, compact }: { candidate: SuggestedTechnician; compact?: boolean }) {
  return (
    <div className={cn("mt-1.5 rounded-sm border border-rr-ink/8 bg-white p-3", compact && "py-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-rr-ink">{candidate.name}</p>
        <p className="rr-numeric text-xs font-semibold text-rr-blue">{candidate.matchScore}</p>
      </div>
      <p className="rr-numeric text-[11px] text-rr-slate">
        {candidate.shift} shift · {candidate.utilisationPct}% loaded · {candidate.spareHoursPerWeek}h spare
      </p>
      {compact ? null : (
        <ul className="mt-2 space-y-0.5">
          {candidate.reasons.map((reason) => (
            <li key={reason} className="text-[11px] leading-relaxed text-rr-slate">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
