"use client";

import * as React from "react";
import type { TaskCardExecution } from "@rr/types";
import {
  Badge,
  DataTable,
  FilterBar,
  Panel,
  PanelHeader,
  ProgressBar,
  SearchInput,
  StatusPill,
  Tabs,
  cn,
  formatNumber,
  statusStyles,
  type Column,
} from "@rr/ui";
import { TaskCardDetail } from "./task-card-detail";

type ViewId =
  | "all"
  | "behind"
  | "blocked"
  | "inspection"
  | "open"
  | "signed-off";

const VIEWS: {
  id: ViewId;
  label: string;
  match: (card: TaskCardExecution) => boolean;
}[] = [
  { id: "all", label: "All cards", match: () => true },
  {
    id: "behind",
    label: "Behind estimate",
    match: (c) => c.state !== "signed-off" && c.variancePct >= 10,
  },
  { id: "blocked", label: "Blocked", match: (c) => c.state === "blocked" },
  {
    id: "inspection",
    label: "Awaiting inspection",
    match: (c) => c.awaitingInspection,
  },
  { id: "open", label: "Not started", match: (c) => c.state === "open" },
  {
    id: "signed-off",
    label: "Signed off",
    match: (c) => c.state === "signed-off",
  },
];

const STATE_LABELS: Record<TaskCardExecution["state"], string> = {
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  "signed-off": "Signed off",
};

export function TaskCardConsole({
  cards,
  facilities,
  skills,
  initialCardId,
}: {
  cards: TaskCardExecution[];
  facilities: { id: string; name: string; icao: string }[];
  skills: string[];
  initialCardId?: string;
}) {
  const [view, setView] = React.useState<ViewId>("all");
  const [facilityId, setFacilityId] = React.useState("all");
  const [skill, setSkill] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialCardId ?? cards[0]?.card.id ?? null,
  );

  const scoped = React.useMemo(
    () =>
      cards.filter(
        (card) =>
          (facilityId === "all" || card.facilityId === facilityId) &&
          (skill === "all" || card.skillRequired === skill) &&
          (query.trim() === "" ||
            `${card.reference} ${card.title} ${card.engineEsn} ${card.workOrderReference} ${card.technicianName ?? ""}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ),
    [cards, facilityId, skill, query],
  );

  const rows = React.useMemo(
    () => scoped.filter(VIEWS.find((v) => v.id === view)!.match),
    [scoped, view],
  );
  const selected = React.useMemo(
    () => rows.find((c) => c.card.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  const columns: Column<TaskCardExecution>[] = [
    {
      key: "card",
      header: "Card",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div className="min-w-[170px]">
          <button
            type="button"
            onClick={() => setSelectedId(row.card.id)}
            aria-pressed={row.card.id === selectedId}
            className="rr-numeric rounded-sm text-[13px] font-semibold text-rr-ink hover:text-rr-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue"
          >
            {row.reference}
          </button>
          <p className="truncate text-[11px] text-rr-slate">{row.title}</p>
        </div>
      ),
    },
    {
      key: "context",
      header: "Engine / skill",
      sortValue: (row) => row.engineEsn,
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="rr-numeric text-[12px] text-rr-ink">
            {row.engineEsn}{" "}
            <span className="text-rr-slate">· {row.workOrderReference}</span>
          </p>
          <p className="text-[11px] text-rr-slate">
            {row.facilityIcao} · {row.skillRequired}
          </p>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      width: "120px",
      sortValue: (row) => row.progressPct,
      render: (row) => (
        <div className="w-24">
          <ProgressBar
            value={row.progressPct}
            status={row.status === "grey" ? "grey" : row.status}
          />
          <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
            {row.progressPct}%
          </p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Est / proj",
      align: "right",
      sortValue: (row) => row.varianceHours,
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="rr-numeric text-[13px] font-semibold text-rr-ink">
            {formatNumber(row.estimatedHours, 1)}{" "}
            <span className="text-rr-slate">/</span>{" "}
            {formatNumber(row.projectedHours, 1)}
          </p>
          <p
            className={cn(
              "rr-numeric text-[11px]",
              row.varianceHours > 0
                ? row.variancePct >= 25
                  ? "text-status-red"
                  : "text-status-amber"
                : "text-status-green",
            )}
          >
            {row.varianceHours > 0 ? "+" : ""}
            {formatNumber(row.varianceHours, 1)}h (
            {row.variancePct > 0 ? "+" : ""}
            {Math.round(row.variancePct)}%)
          </p>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      align: "right",
      sortValue: (row) => row.state,
      render: (row) => (
        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
          <StatusPill status={row.status}>{STATE_LABELS[row.state]}</StatusPill>
          {row.awaitingInspection ? (
            <Badge variant="outline">Awaiting inspector</Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel padded={false} className="px-5 py-4">
        <PanelHeader
          title="Card execution board"
          subtitle="Every card on a live work order, ranked by the man-hours it is putting at risk"
          className="pb-3"
          actions={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Card, engine, technician"
            />
          }
        />
        <Tabs
          tabs={VIEWS.map((v) => ({
            id: v.id,
            label: v.label,
            count: scoped.filter(v.match).length,
          }))}
          active={view}
          onChange={(id) => setView(id as ViewId)}
        />
        <FilterBar className="pt-3">
          <label className="sr-only" htmlFor="task-card-facility">
            Filter by facility
          </label>
          <select
            id="task-card-facility"
            value={facilityId}
            onChange={(event) => setFacilityId(event.target.value)}
            className="h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
          >
            <option value="all">All facilities</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.icao} — {facility.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="task-card-skill">
            Filter by skill
          </label>
          <select
            id="task-card-skill"
            value={skill}
            onChange={(event) => setSkill(event.target.value)}
            className="h-8 rounded-full border border-rr-ink/12 bg-white px-3 text-xs text-rr-ink focus:border-rr-blue focus:outline-none"
          >
            <option value="all">All skills</option>
            {skills.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="rr-numeric text-[11px] text-rr-slate">
            {rows.length} of {cards.length} cards
          </span>
          {(facilityId !== "all" ||
            skill !== "all" ||
            query !== "" ||
            view !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFacilityId("all");
                setSkill("all");
                setQuery("");
                setView("all");
              }}
              className="text-[11px] font-semibold text-rr-blue hover:underline"
            >
              Reset filters
            </button>
          )}
        </FilterBar>
      </Panel>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="max-h-[calc(100vh-3rem)] overflow-y-auto 2xl:sticky 2xl:top-4">
          <DataTable
            columns={columns}
            rows={rows}
            dense
            rowKey={(row) => row.card.id}
            initialSortKey="hours"
            onRowClick={(row) => setSelectedId(row.card.id)}
            rowAccent={(row) =>
              row.card.id === selected?.card.id
                ? "border-rr-blue"
                : statusStyles[row.status].dot.replace("bg-", "border-")
            }
            emptyMessage="No cards match the current filters."
          />
        </div>
        {selected ? (
          <TaskCardDetail key={selected.card.id} execution={selected} />
        ) : null}
      </div>
    </div>
  );
}
