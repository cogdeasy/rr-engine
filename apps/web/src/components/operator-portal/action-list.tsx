"use client";

import * as React from "react";
import type { OperatorAction, OperatorActionCategory } from "@rr/types";
import { Badge, Button, FilterChip, StatusPill, cn, formatDate, statusStyles } from "@rr/ui";

const CATEGORY_LABEL: Record<OperatorActionCategory, string> = {
  "slot-confirmation": "Slot confirmation",
  approval: "Approval",
  compliance: "Compliance",
  "parts-decision": "Parts decision",
  information: "For information",
};

function dueLabel(action: OperatorAction): string {
  if (action.dueInDays < 0) return `Overdue by ${Math.abs(action.dueInDays)}d`;
  if (action.dueInDays === 0) return "Due today";
  return `Due in ${action.dueInDays}d`;
}

/**
 * "What we need from you" — the decision list the portal leads with. Responses
 * are held locally so the customer can work through the list in one sitting.
 */
export function ActionList({ actions }: { actions: OperatorAction[] }) {
  const [filter, setFilter] = React.useState<"all" | OperatorActionCategory>("all");
  const [responses, setResponses] = React.useState<Record<string, "accepted" | "queried">>({});

  const categories = React.useMemo(() => {
    const counts = new Map<OperatorActionCategory, number>();
    for (const action of actions) counts.set(action.category, (counts.get(action.category) ?? 0) + 1);
    return [...counts.entries()];
  }, [actions]);

  const visible = filter === "all" ? actions : actions.filter((a) => a.category === filter);
  const outstanding = actions.filter((a) => !responses[a.id]).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} count={actions.length} />
          {categories.map(([category, count]) => (
            <FilterChip
              key={category}
              label={CATEGORY_LABEL[category]}
              active={filter === category}
              onClick={() => setFilter(category)}
              count={count}
            />
          ))}
        </div>
        <p className="rr-numeric text-xs text-rr-slate">
          {outstanding} of {actions.length} outstanding
        </p>
      </div>

      <ul className="space-y-3">
        {visible.map((action) => {
          const response = responses[action.id];
          return (
            <li
              key={action.id}
              className={cn(
                "rr-panel border-l-2 p-4",
                response ? "border-l-status-green bg-status-green-soft/25" : statusStyles[action.status].border.replace("border-", "border-l-"),
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={action.status}>{dueLabel(action)}</StatusPill>
                    <Badge variant="outline">{CATEGORY_LABEL[action.category]}</Badge>
                    <span className="rr-numeric text-[11px] text-rr-slate">{action.reference}</span>
                    {action.tail ? <span className="rr-numeric text-[11px] text-rr-slate">{action.tail}</span> : null}
                    {action.engineEsn ? <span className="rr-numeric text-[11px] text-rr-slate">{action.engineEsn}</span> : null}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-rr-ink">{action.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-rr-slate">{action.detail}</p>
                  <p className="mt-2 text-xs leading-relaxed text-rr-slate">
                    <span className="rr-label mr-1.5 text-rr-slate">Why</span>
                    {action.reason}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-rr-blue">
                    <span className="rr-label mr-1.5 text-rr-slate">Recommended</span>
                    {action.recommendedAction}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rr-numeric text-[11px] text-rr-slate">{formatDate(action.dueAt)}</span>
                  {response ? (
                    <Badge variant="brand">{response === "accepted" ? "Accepted" : "Query raised"}</Badge>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => setResponses((r) => ({ ...r, [action.id]: "accepted" }))}
                        aria-label={`Accept recommendation for ${action.title}`}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setResponses((r) => ({ ...r, [action.id]: "queried" }))}
                        aria-label={`Raise a query about ${action.title}`}
                      >
                        Query
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="rr-panel px-4 py-10 text-center text-xs text-rr-slate">Nothing outstanding in this category.</li>
        ) : null}
      </ul>
    </div>
  );
}
