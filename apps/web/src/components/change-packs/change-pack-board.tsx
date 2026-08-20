"use client";

import * as React from "react";
import type { ChangePack, DnGateRecord, DnStage, DodActivity, DodArea } from "@rr/types";
import { Badge, Button, FilterBar, FilterChip, Panel, PanelHeader, ProgressBar, StatusPill, cn } from "@rr/ui";

const STAGE_ORDER: DnStage[] = ["design", "build", "release"];

const STAGE_LABELS: Record<DnStage, string> = { design: "Design", build: "Build", release: "Release" };

const AREA_ORDER: DodArea[] = ["design-development", "dev-testing", "stg4", "preprod", "prod"];

const AREA_LABELS: Record<DodArea, string> = {
  "design-development": "Design & development",
  "dev-testing": "DEV testing / validation",
  stg4: "STG4 deployment & testing",
  preprod: "PreProd",
  prod: "Prod",
};

const GATE_LABELS: Record<DnGateRecord["gate"], string> = {
  "design-buyoff": "Design buy-off",
  "tech-review": "Tech review",
  cab: "Doc, approval & CAB",
};

const GATE_TONE: Record<DnGateRecord["state"], string> = {
  passed: "border-status-green/30 bg-status-green/10 text-status-green",
  "in-review": "border-status-amber/30 bg-status-amber/10 text-status-amber",
  blocked: "border-status-red/30 bg-status-red/10 text-status-red",
  "not-reached": "border-rr-ink/10 bg-rr-mist text-rr-slate",
};

const GATE_STATE_LABELS: Record<DnGateRecord["state"], string> = {
  passed: "Passed",
  "in-review": "In review",
  blocked: "Blocked",
  "not-reached": "Not reached",
};

function completion(pack: ChangePack): number {
  return Math.round((pack.activities.filter((a) => a.done).length / pack.activities.length) * 100);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StageRail({ stage }: { stage: DnStage }) {
  const reached = STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Stage: ${STAGE_LABELS[stage]}`}>
      {STAGE_ORDER.map((s, index) => (
        <span
          key={s}
          className={cn("h-1 w-7 rounded-full", index <= reached ? "bg-rr-blue" : "bg-rr-ink/12")}
          aria-hidden
        />
      ))}
      <span className="rr-label ml-2 text-rr-slate">{STAGE_LABELS[stage]}</span>
    </div>
  );
}

function ActivityRow({ activity }: { activity: DodActivity }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
          activity.done
            ? "border-status-green/40 bg-status-green/10 text-status-green"
            : activity.mandatory
              ? "border-status-red/40 bg-status-red/10 text-status-red"
              : "border-rr-ink/15 bg-white text-rr-slate",
        )}
        aria-hidden
      >
        {activity.done ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("text-sm", activity.done ? "text-rr-slate line-through" : "text-rr-ink")}>{activity.label}</span>
        {activity.done && activity.completedBy ? (
          <span className="mt-0.5 block text-[11px] text-rr-slate">
            {activity.completedBy} · {activity.completedAt ? formatDate(activity.completedAt) : ""}
          </span>
        ) : activity.mandatory ? (
          <span className="mt-0.5 block text-[11px] font-semibold text-status-red">Mandatory — holds the next gate</span>
        ) : null}
      </span>
    </li>
  );
}

export function ChangePackBoard({ packs }: { packs: ChangePack[] }) {
  const [stage, setStage] = React.useState<DnStage | "all">("all");
  const [blockedOnly, setBlockedOnly] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string>(packs[0]?.id ?? "");

  const visible = React.useMemo(
    () =>
      packs.filter(
        (pack) =>
          (stage === "all" || pack.stage === stage) &&
          (!blockedOnly || pack.gates.some((gate) => gate.state === "blocked")),
      ),
    [packs, stage, blockedOnly],
  );

  const selected = packs.find((pack) => pack.id === selectedId) ?? visible[0] ?? packs[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Panel padded={false}>
        <div className="p-6 pb-0">
          <PanelHeader
            title="Change pack board"
            subtitle={`${visible.length} of ${packs.length} packs in the end-to-end process`}
          />
          <FilterBar className="pb-4">
            <FilterChip label="All stages" active={stage === "all"} onClick={() => setStage("all")} count={packs.length} />
            {STAGE_ORDER.map((s) => (
              <FilterChip
                key={s}
                label={STAGE_LABELS[s]}
                active={stage === s}
                onClick={() => setStage(s)}
                count={packs.filter((pack) => pack.stage === s).length}
              />
            ))}
            <FilterChip
              label="Blocked at gate"
              active={blockedOnly}
              onClick={() => setBlockedOnly((v) => !v)}
              count={packs.filter((pack) => pack.gates.some((gate) => gate.state === "blocked")).length}
            />
          </FilterBar>
        </div>
        <ul className="divide-y divide-rr-ink/8 border-t border-rr-ink/8">
          {visible.map((pack) => {
            const pct = completion(pack);
            const active = selected?.id === pack.id;
            return (
              <li key={pack.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(pack.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full flex-col gap-3 border-l-2 px-6 py-4 text-left transition-colors",
                    active ? "border-rr-blue bg-rr-blue-50/60" : "border-transparent hover:bg-rr-mist",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rr-numeric text-sm font-semibold text-rr-ink">{pack.ref}</span>
                    <StatusPill status={pack.status}>
                      {pack.daysToTarget < 0 ? `${Math.abs(pack.daysToTarget)}d past target` : `${pack.daysToTarget}d to target`}
                    </StatusPill>
                    <Badge variant="outline">{pack.engineFamily}</Badge>
                    {pack.exportControlled ? <Badge variant="outline">Export controlled</Badge> : null}
                  </div>
                  <p className="text-sm font-semibold text-rr-ink">{pack.title}</p>
                  <p className="text-xs text-rr-slate">
                    {pack.currentActivity} · owner {pack.owner}
                  </p>
                  <div className="flex items-center gap-4">
                    <StageRail stage={pack.stage} />
                    <span className="rr-numeric ml-auto text-xs font-semibold text-rr-ink">{pct}% DoD</span>
                  </div>
                  <ProgressBar value={pct} status={pack.status} />
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className="px-6 py-10 text-center text-sm text-rr-slate">No packs match these filters.</li> : null}
        </ul>
      </Panel>

      {selected ? (
        <div className="space-y-6">
          <Panel>
            <PanelHeader title={`${selected.ref} · gate sign-off`} subtitle={selected.deliverable} />
            <div className="space-y-3">
              {selected.gates.map((gate) => (
                <div key={gate.gate} className={cn("rounded-sm border px-4 py-3", GATE_TONE[gate.state])}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{GATE_LABELS[gate.gate]}</span>
                    <span className="rr-label">{GATE_STATE_LABELS[gate.state]}</span>
                  </div>
                  <p className="mt-1 text-xs">
                    {gate.state === "not-reached"
                      ? "Awaiting the preceding stage."
                      : gate.state === "blocked"
                        ? gate.blockedReason
                        : `${gate.approver}${gate.decidedAt ? ` · ${formatDate(gate.decidedAt)}` : " · decision outstanding"}`}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3 border-t border-rr-ink/8 pt-5">
              <Button size="sm">Record gate decision</Button>
              <Button variant="secondary" size="sm">
                Open change pack documentation
              </Button>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Definition of Done"
              subtitle={`${selected.activities.filter((a) => a.done).length} of ${selected.activities.length} activities complete`}
            />
            <div className="space-y-5">
              {AREA_ORDER.map((area) => {
                const activities = selected.activities.filter((activity) => activity.area === area);
                const done = activities.filter((activity) => activity.done).length;
                return (
                  <div key={area}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="rr-label text-rr-blue">{AREA_LABELS[area]}</p>
                      <span className="rr-numeric text-xs font-semibold text-rr-slate">
                        {done}/{activities.length}
                      </span>
                    </div>
                    <ul className="mt-1 divide-y divide-rr-ink/5">
                      {activities.map((activity) => (
                        <ActivityRow key={activity.id} activity={activity} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
