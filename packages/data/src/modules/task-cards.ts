/**
 * Task cards module — derived execution state.
 *
 * The generated dataset carries the static definition of every task card
 * (reference, ATA chapter, estimate, skill, state). Everything the shop floor
 * needs on top of that — step progress, booked man-hours, tooling, part
 * readiness, the mechanic/inspector sign-off and its audit trail — is derived
 * here, deterministically from the card id, so the API, the web app and tests
 * all observe identical execution state.
 */

import type {
  StatusLevel,
  TaskCard,
  TaskCardExecution,
  TaskCardPartLine,
  TaskCardSignOff,
  TaskCardStep,
  TaskCardStepState,
  TaskCardSummary,
  TaskCardTrailEntry,
  TaskCardVarianceDriver,
  WorkOrderCardProgress,
} from "@rr/types";
import { ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { addHours, createRng, iso, NOW, rand, round, type Rng } from "../rng";

/* ------------------------------------------------------------------ */
/* Reference text                                                      */
/* ------------------------------------------------------------------ */

const BLOCK_REASONS = [
  "Awaiting rotable from stores — part reserved, not yet kitted",
  "Awaiting engineering disposition on out-of-limit finding",
  "Borescope bay occupied — no tooling slot until next shift",
  "Awaiting customer approval to proceed beyond quoted scope",
  "Calibration expired on the assigned torque equipment",
  "Engine not cool enough for entry — thermal soak in progress",
];

const TOOLING = [
  "Video borescope kit VB-8 (articulating)",
  "Torque wrench set, calibrated to 2026-11",
  "Module lifting sling, 2.5t",
  "Eddy current probe set, 500 kHz–2 MHz",
  "Blade blending stone kit",
  "Rotor turning tool",
  "Fan case alignment jig",
  "Ultrasonic couplant and shear-wave probe",
  "Digital depth gauge, 0.01 mm",
];

const SAFETY_NOTES = [
  "Engine must be electrically isolated and tagged before entry.",
  "Two-person rule applies while the cowl doors are open.",
  "Foreign object debris control: log every tool in and out of the gas path.",
  "Fuel system depressurised and drains confirmed clear before disconnection.",
  "Hot section entry only after a minimum four-hour cool-down.",
  "Respiratory protection required when handling thermal barrier coating debris.",
];

const STEP_TEMPLATES: { instruction: string; inspection?: boolean }[] = [
  { instruction: "Review previous shift hand-over and confirm card revision is current" },
  { instruction: "Establish safety zone, isolate engine and fit protective covers" },
  { instruction: "Gain access — remove cowling and fit borescope guide tube" },
  { instruction: "Perform the inspection sweep and record findings against the limits table", inspection: true },
  { instruction: "Assess findings against the engine manual serviceable limits", inspection: true },
  { instruction: "Carry out the rectification or blend within published limits" },
  { instruction: "Reinstate access panels and remove all tooling from the gas path" },
  { instruction: "Complete the FOD sweep and tool count reconciliation", inspection: true },
  { instruction: "Update the build record and raise the release-to-service entry", inspection: true },
];

const RECOMMENDED = {
  blocked: "Escalate the blocker to the shift lead now — every hour lost here lands on the work order TAT.",
  overrun: "Rebaseline the estimate and add a second technician; the card will not close within the planned slot.",
  inspection: "Assign an inspector this shift — the mechanic has finished and the card is idle awaiting stamp.",
  partsShort: "Expedite the short part from stores before the technician stands down.",
  running: "On plan — no intervention required; keep the current crew on the card.",
  ready: "Release to the floor and assign a qualified technician for the next shift.",
  closed: "Closed at or under estimate — fold the actual into the next workscope estimate.",
};

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

function burnFactor(rng: Rng, state: TaskCard["state"]): number {
  // Real shops overrun more often than they under-run.
  if (state === "signed-off") return rand.float(rng, 0.78, 1.45, 2);
  if (state === "blocked") return rand.float(rng, 1.05, 1.7, 2);
  return rand.float(rng, 0.85, 1.5, 2);
}

function stepsFor(rng: Rng, card: TaskCard, progressPct: number, blocked: boolean): TaskCardStep[] {
  const count = rand.int(rng, 5, 7);
  const chosen = STEP_TEMPLATES.slice(0, count);
  const weights = chosen.map(() => rand.float(rng, 0.6, 1.6, 2));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const done = Math.floor((progressPct / 100) * count);

  return chosen.map((template, i) => {
    const estimatedHours = round((card.estimatedHours * weights[i]!) / totalWeight, 1);
    let state: TaskCardStepState;
    if (i < done) state = "done";
    else if (i === done && blocked) state = "blocked";
    else if (i === done && progressPct > 0) state = "active";
    else state = "pending";
    return {
      id: `${card.id}-S${i + 1}`,
      index: i + 1,
      instruction: template.instruction,
      state,
      estimatedHours,
      actualHours: state === "done" ? round(estimatedHours * rand.float(rng, 0.75, 1.5, 2), 1) : undefined,
      requiresInspection: template.inspection === true,
      note:
        state === "blocked"
          ? "Step held — see blocker below."
          : state === "done" && rand.bool(rng, 0.18)
            ? "Finding recorded against the engine manual limits table."
            : undefined,
    };
  });
}

function partsFor(rng: Rng, card: TaskCard, facilityId: string): TaskCardPartLine[] {
  const dataset = getDataset();
  const candidates = dataset.parts.filter((p) => p.moduleCode === card.moduleCode);
  if (candidates.length === 0) return [];
  const picked = rand.sample(rng, candidates, rand.int(rng, 0, 3));
  return picked.map((part) => {
    const stock = dataset.inventory.find((i) => i.partNumber === part.partNumber && i.facilityId === facilityId);
    const qty = rand.int(rng, 1, 4);
    const onHand = stock?.onHand ?? 0;
    const status: StatusLevel = onHand === 0 ? "red" : onHand < qty ? "amber" : "green";
    return {
      partNumber: part.partNumber,
      description: part.description,
      qty,
      onHand,
      leadTimeDays: part.leadTimeDays,
      status,
    };
  });
}

function signOffStamp(rng: Rng, role: TaskCardSignOff["role"]): string {
  return `${role === "mechanic" ? "B1" : "QA"}-${rand.int(rng, 1000, 9999)}`;
}

function buildTrail(
  card: TaskCard,
  steps: TaskCardStep[],
  technicianName: string | null,
  inspectorName: string | null,
  blockedReason: string | null,
  signOffs: TaskCardSignOff[],
  startedAt: Date,
  rng: Rng,
): TaskCardTrailEntry[] {
  const entries: TaskCardTrailEntry[] = [];
  let cursor = startedAt;
  const push = (actor: string, action: string, detail: string) => {
    entries.push({ id: `${card.id}-T${entries.length + 1}`, at: iso(cursor), actor, action, detail });
  };

  push("Planning", "Card released", `${card.reference} released to the floor against ATA ${card.ataChapter}.`);
  if (technicianName) {
    cursor = addHours(cursor, rand.int(rng, 1, 6));
    push("Shift lead", "Technician assigned", `${technicianName} assigned — ${card.skillRequired} authorisation verified.`);
  }
  for (const step of steps.filter((s) => s.state === "done")) {
    cursor = addHours(cursor, Math.max(1, Math.round(step.actualHours ?? step.estimatedHours)));
    push(technicianName ?? "Technician", `Step ${step.index} complete`, `${step.instruction} — ${step.actualHours ?? step.estimatedHours}h booked.`);
  }
  if (blockedReason) {
    cursor = addHours(cursor, rand.int(rng, 1, 4));
    push(technicianName ?? "Technician", "Card blocked", blockedReason);
  }
  for (const signOff of signOffs.filter((s) => s.at !== null)) {
    entries.push({
      id: `${card.id}-T${entries.length + 1}`,
      at: signOff.at as string,
      actor: signOff.name,
      action: signOff.role === "mechanic" ? "Mechanic sign-off" : "Inspector stamp",
      detail: `Recorded under stamp ${signOff.stamp}.`,
    });
  }
  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function statusFor(input: {
  state: TaskCard["state"];
  variancePct: number;
  blocked: boolean;
  awaitingInspection: boolean;
  shortParts: boolean;
}): { status: StatusLevel; reason: string; recommendedAction: string } {
  if (input.blocked) {
    return { status: "red", reason: "Card is blocked — no man-hours can be booked until it is cleared.", recommendedAction: RECOMMENDED.blocked };
  }
  if (input.state !== "signed-off" && input.variancePct >= 25) {
    return {
      status: "red",
      reason: `Forecast to overrun the estimate by ${Math.round(input.variancePct)}%.`,
      recommendedAction: RECOMMENDED.overrun,
    };
  }
  if (input.awaitingInspection) {
    return { status: "amber", reason: "Work complete but idle awaiting an inspector stamp.", recommendedAction: RECOMMENDED.inspection };
  }
  if (input.shortParts && input.state !== "signed-off") {
    return { status: "amber", reason: "A required part is short at this facility.", recommendedAction: RECOMMENDED.partsShort };
  }
  if (input.state !== "signed-off" && input.variancePct >= 10) {
    return {
      status: "amber",
      reason: `Tracking ${Math.round(input.variancePct)}% above estimate.`,
      recommendedAction: RECOMMENDED.overrun,
    };
  }
  if (input.state === "signed-off") {
    return {
      status: input.variancePct >= 25 ? "amber" : "green",
      reason: input.variancePct >= 25 ? `Closed ${Math.round(input.variancePct)}% over estimate.` : "Closed at or near estimate.",
      recommendedAction: RECOMMENDED.closed,
    };
  }
  if (input.state === "open") {
    return { status: "grey", reason: "Not started — no man-hours booked yet.", recommendedAction: RECOMMENDED.ready };
  }
  return { status: "green", reason: "Running to estimate.", recommendedAction: RECOMMENDED.running };
}

function executionFor(card: TaskCard): TaskCardExecution {
  const dataset = getDataset();
  const rng = createRng(`task-card-execution:${card.id}`);
  const workOrder = dataset.workOrders.find((w) => w.id === card.workOrderId)!;
  const engine = dataset.engines.find((e) => e.id === workOrder.engineId);
  const operator = dataset.operators.find((o) => o.id === workOrder.operatorId);
  const facility = dataset.facilities.find((f) => f.id === workOrder.facilityId);
  const facilityTechs = dataset.technicians.filter((t) => t.facilityId === workOrder.facilityId);
  const qualified = facilityTechs.filter((t) => t.skills.includes(card.skillRequired));
  const pool = qualified.length > 0 ? qualified : facilityTechs;

  const technician = card.state === "open" || pool.length === 0 ? null : rand.pick(rng, pool);
  const inspectorPool = facilityTechs.filter((t) => t.id !== technician?.id);
  const inspector = inspectorPool.length > 0 ? rand.pick(rng, inspectorPool) : null;

  const progressPct =
    card.state === "signed-off" ? 100 : card.state === "in-progress" ? rand.int(rng, 25, 90) : card.state === "blocked" ? rand.int(rng, 10, 70) : 0;

  const factor = burnFactor(rng, card.state);
  const hoursToDate = round(card.estimatedHours * (progressPct / 100) * factor, 1);
  const projectedHours =
    card.state === "signed-off"
      ? hoursToDate
      : card.state === "open"
        ? card.estimatedHours
        : round(Math.max(hoursToDate, card.estimatedHours * factor), 1);
  const varianceHours = round(projectedHours - card.estimatedHours, 1);
  const variancePct = round((varianceHours / Math.max(0.5, card.estimatedHours)) * 100, 1);

  const blockedReason = card.state === "blocked" ? rand.pick(rng, BLOCK_REASONS) : null;
  const steps = stepsFor(rng, card, progressPct, card.state === "blocked");
  const parts = partsFor(rng, card, workOrder.facilityId);
  const tooling = rand.sample(rng, TOOLING, rand.int(rng, 2, 4));
  const safetyNotes = rand.sample(rng, SAFETY_NOTES, rand.int(rng, 2, 3));

  const startedAt = new Date(NOW.getTime() - rand.int(rng, 8, 260) * 3600000);
  const mechanicSignedAt =
    card.state === "signed-off" || (card.state === "in-progress" && progressPct >= 85 && rand.bool(rng, 0.55))
      ? iso(addHours(startedAt, Math.max(2, Math.round(hoursToDate))))
      : null;
  const inspectorSignedAt = card.state === "signed-off" ? iso(addHours(startedAt, Math.max(3, Math.round(hoursToDate) + rand.int(rng, 1, 9)))) : null;
  const awaitingInspection = mechanicSignedAt !== null && inspectorSignedAt === null;

  const signOffs: TaskCardSignOff[] = [
    { role: "mechanic", name: technician?.name ?? "Unassigned", stamp: signOffStamp(rng, "mechanic"), at: mechanicSignedAt },
    { role: "inspector", name: inspector?.name ?? "Unassigned", stamp: signOffStamp(rng, "inspector"), at: inspectorSignedAt },
  ];

  const shortParts = parts.some((p) => p.status !== "green");
  const { status, reason, recommendedAction } = statusFor({
    state: card.state,
    variancePct,
    blocked: card.state === "blocked",
    awaitingInspection,
    shortParts,
  });

  const moduleSpec = ENGINE_MODULES.find((m) => m.code === card.moduleCode);

  return {
    card: { ...card, actualHours: hoursToDate > 0 ? hoursToDate : undefined, assignedTechnicianId: technician?.id, partsRequired: parts.map((p) => ({ partNumber: p.partNumber, qty: p.qty })), signOffBy: inspectorSignedAt ? inspector?.name : undefined, signOffAt: inspectorSignedAt ?? undefined },
    reference: card.reference,
    title: card.title,
    ataChapter: card.ataChapter,
    moduleCode: card.moduleCode,
    skillRequired: card.skillRequired,
    state: card.state,

    workOrderId: workOrder.id,
    workOrderReference: workOrder.reference,
    priority: workOrder.priority,
    dueAt: workOrder.scheduledEnd,
    engineEsn: engine?.esn ?? "—",
    engineFamily: engine?.family ?? "—",
    operatorName: operator?.name ?? "—",
    facilityId: workOrder.facilityId,
    facilityName: facility?.name ?? "—",
    facilityIcao: facility?.icao ?? "—",

    technicianName: technician?.name ?? null,
    inspectorName: inspector?.name ?? null,

    estimatedHours: card.estimatedHours,
    hoursToDate,
    projectedHours,
    varianceHours,
    variancePct,
    progressPct,

    awaitingInspection,
    blockedReason,
    status,
    reason,
    recommendedAction,

    steps,
    tooling,
    parts,
    safetyNotes: moduleSpec ? [`${moduleSpec.label}: ${moduleSpec.description}`, ...safetyNotes] : safetyNotes,
    signOffs,
    trail: buildTrail(card, steps, technician?.name ?? null, inspector?.name ?? null, blockedReason, signOffs, startedAt, rng),
  };
}

let cachedExecutions: TaskCardExecution[] | null = null;

/** Every task card in the dataset, enriched with derived execution state. */
export function taskCardExecutions(): TaskCardExecution[] {
  if (!cachedExecutions) {
    cachedExecutions = getDataset()
      .taskCards.filter((card) => getDataset().workOrders.some((w) => w.id === card.workOrderId))
      .map(executionFor);
  }
  return cachedExecutions;
}

export function taskCardExecution(cardId: string): TaskCardExecution | undefined {
  return taskCardExecutions().find((e) => e.card.id === cardId || e.reference === cardId);
}

/** Cards on live work orders — the ones a shift lead can still influence. */
export function activeTaskCardExecutions(): TaskCardExecution[] {
  const live = new Set(
    getDataset()
      .workOrders.filter((w) => w.state !== "complete" && w.state !== "cancelled" && w.state !== "draft")
      .map((w) => w.id),
  );
  return taskCardExecutions().filter((e) => live.has(e.workOrderId));
}

/* ------------------------------------------------------------------ */
/* Roll-ups                                                            */
/* ------------------------------------------------------------------ */

export function taskCardSummary(executions = activeTaskCardExecutions()): TaskCardSummary {
  const estimatedHours = round(executions.reduce((s, e) => s + e.estimatedHours, 0), 0);
  const hoursToDate = round(executions.reduce((s, e) => s + e.hoursToDate, 0), 0);
  const projectedHours = round(executions.reduce((s, e) => s + e.projectedHours, 0), 0);
  const varianceHours = round(projectedHours - estimatedHours, 0);
  const signedOff = executions.filter((e) => e.state === "signed-off");
  return {
    totalCards: executions.length,
    activeCards: executions.filter((e) => e.state === "in-progress").length,
    behindEstimate: executions.filter((e) => e.state !== "signed-off" && e.variancePct >= 10).length,
    blocked: executions.filter((e) => e.state === "blocked").length,
    awaitingInspection: executions.filter((e) => e.awaitingInspection).length,
    signedOff: signedOff.length,
    estimatedHours,
    hoursToDate,
    projectedHours,
    varianceHours,
    variancePct: round((varianceHours / Math.max(1, estimatedHours)) * 100, 1),
    manHoursAtRisk: round(
      executions.filter((e) => e.state !== "signed-off" && e.varianceHours > 0).reduce((s, e) => s + e.varianceHours, 0),
      0,
    ),
    firstTimeQualityPct: signedOff.length === 0 ? 0 : round((signedOff.filter((e) => e.varianceHours <= 0).length / signedOff.length) * 100, 0),
  };
}

export function workOrderCardProgress(executions = activeTaskCardExecutions()): WorkOrderCardProgress[] {
  const dataset = getDataset();
  const byWorkOrder = new Map<string, TaskCardExecution[]>();
  for (const execution of executions) {
    const list = byWorkOrder.get(execution.workOrderId) ?? [];
    list.push(execution);
    byWorkOrder.set(execution.workOrderId, list);
  }

  const rows: WorkOrderCardProgress[] = [];
  for (const [workOrderId, cards] of byWorkOrder) {
    const workOrder = dataset.workOrders.find((w) => w.id === workOrderId)!;
    const estimatedHours = round(cards.reduce((s, c) => s + c.estimatedHours, 0), 1);
    const hoursToDate = round(cards.reduce((s, c) => s + c.hoursToDate, 0), 1);
    const projectedHours = round(cards.reduce((s, c) => s + c.projectedHours, 0), 1);
    const varianceHours = round(projectedHours - estimatedHours, 1);
    const variancePct = round((varianceHours / Math.max(1, estimatedHours)) * 100, 1);
    const blocked = cards.filter((c) => c.state === "blocked").length;
    const awaitingInspection = cards.filter((c) => c.awaitingInspection).length;
    const completionPct = round(
      (cards.reduce((s, c) => s + c.estimatedHours * (c.progressPct / 100), 0) / Math.max(0.5, estimatedHours)) * 100,
      0,
    );
    const worst = [...cards].sort((a, b) => rankStatus(b.status) - rankStatus(a.status) || b.varianceHours - a.varianceHours)[0];
    const notStarted = cards.every((c) => c.state === "open");
    const status: StatusLevel = notStarted
      ? "grey"
      : blocked > 0 || variancePct >= 25
        ? "red"
        : awaitingInspection > 0 || variancePct >= 10
          ? "amber"
          : "green";

    rows.push({
      workOrderId,
      reference: workOrder.reference,
      engineEsn: dataset.engines.find((e) => e.id === workOrder.engineId)?.esn ?? "—",
      operatorName: dataset.operators.find((o) => o.id === workOrder.operatorId)?.name ?? "—",
      facilityId: workOrder.facilityId,
      facilityIcao: dataset.facilities.find((f) => f.id === workOrder.facilityId)?.icao ?? "—",
      priority: workOrder.priority,
      dueAt: workOrder.scheduledEnd,
      totalCards: cards.length,
      signedOff: cards.filter((c) => c.state === "signed-off").length,
      inProgress: cards.filter((c) => c.state === "in-progress").length,
      blocked,
      awaitingInspection,
      open: cards.filter((c) => c.state === "open").length,
      estimatedHours,
      hoursToDate,
      projectedHours,
      varianceHours,
      variancePct,
      completionPct,
      status,
      worstCardReference: worst?.reference ?? null,
      worstCardReason: worst?.status === "green" ? null : (worst?.reason ?? null),
    });
  }

  return rows.sort((a, b) => rankStatus(b.status) - rankStatus(a.status) || b.varianceHours - a.varianceHours);
}

/** Where the man-hour overrun is concentrated, by skill discipline. */
export function taskCardVarianceDrivers(executions = activeTaskCardExecutions()): TaskCardVarianceDriver[] {
  const bySkill = new Map<string, { cards: number; varianceHours: number }>();
  for (const execution of executions) {
    if (execution.varianceHours <= 0) continue;
    const entry = bySkill.get(execution.skillRequired) ?? { cards: 0, varianceHours: 0 };
    entry.cards += 1;
    entry.varianceHours += execution.varianceHours;
    bySkill.set(execution.skillRequired, entry);
  }
  return [...bySkill.entries()]
    .map(([label, entry]) => ({ label, cards: entry.cards, varianceHours: round(entry.varianceHours, 0) }))
    .sort((a, b) => b.varianceHours - a.varianceHours);
}

function rankStatus(status: StatusLevel): number {
  return { red: 3, amber: 2, green: 1, grey: 0 }[status];
}
