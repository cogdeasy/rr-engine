/**
 * Deterministic selectors for the `change-packs` module.
 *
 * The population models the Rolls-Royce end-to-end DN process: each pack walks
 * Design -> Build -> Release through a fixed Definition-of-Done checklist, and
 * stops at the Design buy-off, Tech review and CAB gates. Everything is derived
 * from an RNG seeded on the pack reference, so the web app, API and tests all
 * observe identical packs.
 */

import type {
  ChangePack,
  ChangePackSummary,
  DnGate,
  DnGateRecord,
  DnGateState,
  DnStage,
  DnStageProgress,
  DodActivity,
  DodArea,
  DodAreaProgress,
  StatusLevel,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, NOW, addDays, iso, rand } from "../rng";

const DAY_MS = 86_400_000;

export const DN_STAGE_LABELS: Record<DnStage, string> = {
  design: "Design",
  build: "Build",
  release: "Release",
};

export const DN_GATE_LABELS: Record<DnGate, string> = {
  "design-buyoff": "Design buy-off",
  "tech-review": "Tech review",
  cab: "Doc, approval & CAB",
};

export const DOD_AREA_LABELS: Record<DodArea, string> = {
  "design-development": "Design & development",
  "dev-testing": "DEV testing / validation",
  stg4: "STG4 deployment & testing",
  preprod: "PreProd",
  prod: "Prod",
};

/** The Definition of Done, transcribed from the end-to-end process. */
const DOD_TEMPLATE: { area: DodArea; label: string; mandatory: boolean }[] = [
  { area: "design-development", label: "Analyse event data (storage/customer, hdf5, csv)", mandatory: true },
  { area: "design-development", label: "Analyse normal data (Databricks)", mandatory: true },
  { area: "design-development", label: "Design buy-off by the stakeholders and experts", mandatory: true },
  { area: "design-development", label: "Repos — create a new branch for DN development", mandatory: false },
  { area: "design-development", label: "DN development on PyCharm", mandatory: false },
  { area: "dev-testing", label: "DEV — functional test (on the event/scenario data)", mandatory: true },
  { area: "dev-testing", label: "DEV — integration test", mandatory: true },
  { area: "dev-testing", label: "DEV — pylint test", mandatory: false },
  { area: "dev-testing", label: "Validation framework (VF) — functional test", mandatory: true },
  { area: "dev-testing", label: "Repos — script review, pull request approval & merge to main", mandatory: true },
  { area: "dev-testing", label: "Packages are correctly created in the pipeline", mandatory: false },
  { area: "dev-testing", label: "Create US for RED TEAM records", mandatory: false },
  { area: "stg4", label: "Add & publish parameters to the schema on EHM UI", mandatory: true },
  { area: "stg4", label: "Deployment", mandatory: true },
  { area: "stg4", label: "Regression test", mandatory: true },
  { area: "stg4", label: "Validation test", mandatory: true },
  { area: "stg4", label: "Performance test", mandatory: false },
  { area: "stg4", label: "Check DN notification on EHM UI issue page", mandatory: true },
  { area: "stg4", label: "DN dashboard & user acceptance", mandatory: true },
  { area: "stg4", label: "Technical review", mandatory: true },
  { area: "stg4", label: "Sanctioning process & documentation", mandatory: true },
  { area: "stg4", label: "Change pack to Gate 4", mandatory: true },
  { area: "preprod", label: "EHM Value Delivery Board (VDB) — CLE only", mandatory: true },
  { area: "preprod", label: "CAB", mandatory: true },
  { area: "preprod", label: "RED TEAM (create US)", mandatory: true },
  { area: "preprod", label: "Add & publish parameters to the schema on EHM UI", mandatory: true },
  { area: "preprod", label: "Deployment", mandatory: true },
  { area: "preprod", label: "Sanity tests / smoke test", mandatory: true },
  { area: "preprod", label: "Change pack documentation", mandatory: false },
  { area: "prod", label: "RED TEAM (create US)", mandatory: true },
  { area: "prod", label: "Add & publish parameters to the schema on EHM UI", mandatory: true },
  { area: "prod", label: "Deployment", mandatory: true },
  { area: "prod", label: "PIR — continuous monitoring LIVE, ensure no issue/error", mandatory: true },
  { area: "prod", label: "Change pack documentation (add PIR results)", mandatory: false },
];

export const DOD_AREAS: DodArea[] = ["design-development", "dev-testing", "stg4", "preprod", "prod"];

/** Which areas belong to which lane of the process. */
const STAGE_AREAS: Record<DnStage, DodArea[]> = {
  design: ["design-development"],
  build: ["dev-testing", "stg4"],
  release: ["preprod", "prod"],
};

const CURRENT_ACTIVITY: Record<DnStage, string[]> = {
  design: [
    "Data prep & requirement capture",
    "Select parameter & data analysis/enrich",
    "Analytic development",
    "Sanctioning & troubleshooting",
  ],
  build: ["Build/config/test", "External (ETL) table & data visualisation", "CPS & DN packaging", "STG4 deployment & testing"],
  release: ["Doc, approval & CAB", "PreProd deployment", "Prod deployment & monitoring"],
};

const OWNERS = [
  "a.hughes@rolls-royce.com",
  "r.patel@rolls-royce.com",
  "m.silva@rolls-royce.com",
  "j.okafor@rolls-royce.com",
  "l.bergstrom@rolls-royce.com",
  "s.nakamura@rolls-royce.com",
];

const RED_TEAM = [
  "d.whitfield@rolls-royce.com",
  "k.osei@rolls-royce.com",
  "c.moreau@rolls-royce.com",
  "p.andersson@rolls-royce.com",
];

const DELIVERABLES: { title: string; deliverable: string }[] = [
  { title: "HPT blade tip oxidation onset detection", deliverable: "DN analytic + EHM UI issue page" },
  { title: "EGT margin erosion rate model refresh", deliverable: "DN analytic + trend dashboard" },
  { title: "Bearing vibration signature classifier", deliverable: "DN analytic + alert rule" },
  { title: "Oil consumption step-change detector", deliverable: "DN analytic" },
  { title: "Fuel flow deviation cross-check", deliverable: "ETL table + visualisation" },
  { title: "Compressor wash effectiveness scoring", deliverable: "DN dashboard" },
  { title: "Fan blade imbalance early warning", deliverable: "DN analytic + alert rule" },
  { title: "Start-up profile anomaly screen", deliverable: "DN analytic" },
  { title: "LP spool speed drift monitor", deliverable: "DN analytic + schema parameters" },
  { title: "Combustor liner distress indicator", deliverable: "DN analytic + EHM UI issue page" },
  { title: "Take-off derate compliance check", deliverable: "ETL table + visualisation" },
  { title: "Sensor dropout / feed integrity screen", deliverable: "DN analytic + data-quality rule" },
  { title: "Thrust reverser cycle counter", deliverable: "ETL table" },
  { title: "Hot-section RUL prior recalibration", deliverable: "DN analytic + model package" },
  { title: "Environmental exposure severity index", deliverable: "DN analytic + dashboard" },
  { title: "Borescope finding correlation report", deliverable: "DN dashboard" },
];

const RISK_NOTES = [
  "Validation framework run failed twice on the event dataset; awaiting rerun.",
  "Schema parameters not yet published, so the EHM UI issue page cannot be checked.",
  "CAB slot missed; next board is the following week.",
  "RED TEAM user story not raised, blocking the PreProd deployment.",
  "Regression test exposed a drift against the incumbent analytic.",
  "Awaiting stakeholder availability for design buy-off.",
];

const PACK_COUNT = 34;

function areaIndex(area: DodArea): number {
  return DOD_AREAS.indexOf(area);
}

/** The last area a pack in this stage may have progressed into. */
function frontierArea(stage: DnStage): DodArea {
  const areas = STAGE_AREAS[stage];
  return areas[areas.length - 1]!;
}

function buildActivities(packId: string, stage: DnStage, stalled: boolean): DodActivity[] {
  const rng = createRng(`${packId}:dod`);
  const frontier = areaIndex(frontierArea(stage));
  return DOD_TEMPLATE.map((template, index) => {
    const at = areaIndex(template.area);
    // Everything before the current lane is closed out; the current lane is
    // partially worked, and a stalled pack leaves more of it open.
    const done = at < frontier ? true : at > frontier ? false : rand.bool(rng, stalled ? 0.34 : 0.62);
    const completedAt = done ? iso(addDays(NOW, -rand.int(rng, 1, 90))) : null;
    return {
      id: `${packId}-A${String(index + 1).padStart(2, "0")}`,
      area: template.area,
      label: template.label,
      done,
      completedBy: done ? rand.pick(rng, OWNERS) : null,
      completedAt,
      mandatory: template.mandatory,
    };
  });
}

function buildGates(packId: string, stage: DnStage, blocked: boolean): DnGateRecord[] {
  const rng = createRng(`${packId}:gates`);
  const order: DnGate[] = ["design-buyoff", "tech-review", "cab"];
  const reached = stage === "design" ? 0 : stage === "build" ? 1 : 2;
  return order.map((gate, index) => {
    let state: DnGateState;
    if (index < reached) state = "passed";
    else if (index > reached) state = "not-reached";
    else state = blocked ? "blocked" : "in-review";
    const decided = state === "passed";
    return {
      gate,
      state,
      approver: state === "not-reached" ? null : rand.pick(rng, RED_TEAM),
      decidedAt: decided ? iso(addDays(NOW, -rand.int(rng, 3, 120))) : null,
      blockedReason: state === "blocked" ? rand.pick(rng, RISK_NOTES) : null,
    };
  });
}

function packStatus(daysToTarget: number, blocked: boolean, dodPct: number): StatusLevel {
  if (blocked || daysToTarget < 0) return "red";
  if (daysToTarget < 21 || dodPct < 40) return "amber";
  return "green";
}

let cache: ChangePack[] | null = null;

/** Every live change pack, ordered most urgent first. */
export function changePacks(): ChangePack[] {
  if (cache) return cache;
  const dataset = getDataset();
  const families = [...new Set(dataset.engines.map((engine) => engine.family))];

  const packs: ChangePack[] = [];
  for (let i = 0; i < PACK_COUNT; i += 1) {
    const ref = `DN-${2400 + i * 3}`;
    const rng = createRng(`change-pack:${ref}`);
    const stage = rand.weighted<DnStage>(rng, [
      { value: "design", weight: 3 },
      { value: "build", weight: 4 },
      { value: "release", weight: 3 },
    ]);
    const blocked = rand.bool(rng, 0.18);
    const stalled = blocked || rand.bool(rng, 0.22);
    const seed = DELIVERABLES[i % DELIVERABLES.length]!;
    const raisedAt = addDays(NOW, -rand.int(rng, 30, 260));
    const targetAt = addDays(raisedAt, rand.int(rng, 90, 300));
    const daysToTarget = Math.round((targetAt.getTime() - NOW.getTime()) / DAY_MS);
    const activities = buildActivities(ref, stage, stalled);
    const dodPct = Math.round((activities.filter((a) => a.done).length / activities.length) * 100);
    const operator = rand.pick(rng, dataset.operators);
    const inProd = stage === "release" && dodPct > 80;

    packs.push({
      id: ref,
      ref,
      title: seed.title,
      deliverable: seed.deliverable,
      engineFamily: rand.pick(rng, families),
      operatorId: rand.bool(rng, 0.55) ? operator.id : null,
      stage,
      currentActivity: rand.pick(rng, CURRENT_ACTIVITY[stage]),
      owner: rand.pick(rng, OWNERS),
      redTeamOwner: rand.pick(rng, RED_TEAM),
      raisedAt: iso(raisedAt),
      targetAt: iso(targetAt),
      status: packStatus(daysToTarget, blocked, dodPct),
      daysToTarget,
      gates: buildGates(ref, stage, blocked),
      activities,
      affectedEngines: rand.int(rng, 12, 302),
      pirFindings: inProd ? rand.int(rng, 0, 3) : 0,
      riskNote: blocked || stalled ? rand.pick(rng, RISK_NOTES) : null,
      exportControlled: rand.bool(rng, 0.3),
    });
  }

  const rank: Record<StatusLevel, number> = { red: 0, amber: 1, green: 2, grey: 3 };
  cache = packs.sort((a, b) => rank[a.status] - rank[b.status] || a.daysToTarget - b.daysToTarget);
  return cache;
}

export function changePack(packId: string): ChangePack | undefined {
  return changePacks().find((pack) => pack.id === packId || pack.ref === packId);
}

/** Definition-of-Done completion for one pack, 0-100. */
export function dodCompletion(pack: ChangePack): number {
  return Math.round((pack.activities.filter((activity) => activity.done).length / pack.activities.length) * 100);
}

/** Mandatory activities still open — what actually holds the next gate. */
export function outstandingMandatory(pack: ChangePack): DodActivity[] {
  return pack.activities.filter((activity) => activity.mandatory && !activity.done);
}

function areaProgress(packs: ChangePack[]): DodAreaProgress[] {
  return DOD_AREAS.map((area) => {
    const activities = packs.flatMap((pack) => pack.activities.filter((activity) => activity.area === area));
    const complete = activities.filter((activity) => activity.done).length;
    const completePct = activities.length === 0 ? 0 : Math.round((complete / activities.length) * 100);
    const held = packs.filter((pack) => frontierArea(pack.stage) === area).length;
    return {
      area,
      label: DOD_AREA_LABELS[area],
      activities: activities.length,
      complete,
      completePct,
      packs: held,
      status: completePct >= 75 ? "green" : completePct >= 45 ? "amber" : "red",
    };
  });
}

function stageProgress(packs: ChangePack[]): DnStageProgress[] {
  return (["design", "build", "release"] as DnStage[]).map((stage) => {
    const inStage = packs.filter((pack) => pack.stage === stage);
    const days = inStage.map((pack) => Math.round((NOW.getTime() - new Date(pack.raisedAt).getTime()) / DAY_MS));
    return {
      stage,
      label: DN_STAGE_LABELS[stage],
      packs: inStage.length,
      blocked: inStage.filter((pack) => pack.gates.some((gate) => gate.state === "blocked")).length,
      atRisk: inStage.filter((pack) => pack.status === "amber").length,
      meanDaysInStage: days.length === 0 ? 0 : Math.round(days.reduce((sum, d) => sum + d, 0) / days.length),
    };
  });
}

export function changePackSummary(): ChangePackSummary {
  const packs = changePacks();
  const dod = packs.map(dodCompletion);
  return {
    packs: packs.length,
    blocked: packs.filter((pack) => pack.gates.some((gate) => gate.state === "blocked")).length,
    atRisk: packs.filter((pack) => pack.status === "amber").length,
    onTrack: packs.filter((pack) => pack.status === "green").length,
    awaitingGate: packs.filter((pack) => pack.gates.some((gate) => gate.state === "in-review")).length,
    pastTarget: packs.filter((pack) => pack.daysToTarget < 0).length,
    openPirFindings: packs.reduce((sum, pack) => sum + pack.pirFindings, 0),
    meanDodPct: dod.length === 0 ? 0 : Math.round(dod.reduce((sum, d) => sum + d, 0) / dod.length),
    stages: stageProgress(packs),
    areas: areaProgress(packs),
  };
}
