/**
 * Derived selectors for the `work-orders` execution module.
 *
 * The base dataset carries work orders and task cards but leaves execution
 * detail (who booked hours, which parts are short, what is holding the order)
 * unpopulated. Everything below is derived deterministically from the seeded
 * dataset so the API, the web app and tests agree on every value.
 */

import type {
  StatusLevel,
  TaskCard,
  WorkOrder,
  WorkOrderBlocker,
  WorkOrderBlockerKind,
  WorkOrderBlockerSummary,
  WorkOrderKpis,
  WorkOrderPartLine,
  WorkOrderRecommendation,
  WorkOrderStage,
  WorkOrderStageSummary,
  WorkOrderTaskLine,
  WorkOrderView,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, NOW, rand, round } from "../rng";

const DAY_MS = 86_400_000;

export const WORK_ORDER_STAGES: { stage: WorkOrderStage; label: string; description: string }[] = [
  { stage: "raised", label: "Raised", description: "Awaiting planning and release" },
  { stage: "planned", label: "Planned", description: "Slot and workscope agreed" },
  { stage: "in-work", label: "In work", description: "Hands on the engine" },
  { stage: "awaiting-parts", label: "Awaiting parts", description: "Held for material" },
  { stage: "test", label: "Test & pass-off", description: "Tasks signed, run pending" },
  { stage: "closed", label: "Closed", description: "Returned to service" },
];

const BLOCKER_LABELS: Record<WorkOrderBlockerKind, string> = {
  parts: "Material shortage",
  labour: "Labour / skill gap",
  inspection: "Inspection or NDT hold",
  approval: "Awaiting release approval",
  capacity: "Facility slot contention",
  aog: "AOG escalation",
};

export function blockerLabel(kind: WorkOrderBlockerKind): string {
  return BLOCKER_LABELS[kind];
}

function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

function isClosed(workOrder: WorkOrder): boolean {
  return workOrder.state === "complete" || workOrder.state === "cancelled";
}

function stageFor(workOrder: WorkOrder, cards: TaskCard[]): WorkOrderStage {
  if (isClosed(workOrder)) return "closed";
  if (workOrder.state === "awaiting-parts") return "awaiting-parts";
  if (workOrder.state === "draft") return "raised";
  const allSigned = cards.length > 0 && cards.every((c) => c.state === "signed-off");
  // A released order sits in planning until the floor starts booking against it.
  if (workOrder.state === "planned") return "planned";
  if (workOrder.state === "released") return allSigned ? "test" : "planned";
  return allSigned ? "test" : "in-work";
}

/** Booked labour is deterministic per task card and tracks the card's state. */
function bookedHoursFor(card: TaskCard): number {
  if (card.actualHours !== undefined) return card.actualHours;
  const rng = createRng(`wo-labour:${card.id}`);
  const fraction =
    card.state === "signed-off"
      ? rand.float(rng, 0.85, 1.28)
      : card.state === "in-progress"
        ? rand.float(rng, 0.25, 0.8)
        : card.state === "blocked"
          ? rand.float(rng, 0.1, 0.45)
          : 0;
  return round(card.estimatedHours * fraction, 1);
}

function partLinesFor(workOrder: WorkOrder, cards: TaskCard[]): WorkOrderPartLine[] {
  const data = getDataset();
  const lines = new Map<string, WorkOrderPartLine>();

  for (const card of cards) {
    if (card.state === "signed-off") continue;
    const rng = createRng(`wo-parts:${card.id}`);
    const candidates = data.parts.filter((p) => p.moduleCode === card.moduleCode);
    if (candidates.length === 0) continue;
    const count = card.state === "blocked" ? rand.int(rng, 1, 2) : rand.int(rng, 0, 2);
    for (const part of rand.sample(rng, candidates, count)) {
      const stock = data.inventory.find((i) => i.partNumber === part.partNumber && i.facilityId === workOrder.facilityId);
      const qtyRequired = part.lifeLimited ? 1 : rand.int(rng, 1, 4);
      const onHand = stock?.onHand ?? 0;
      const existing = lines.get(part.partNumber);
      const totalQty = (existing?.qtyRequired ?? 0) + qtyRequired;
      lines.set(part.partNumber, {
        partNumber: part.partNumber,
        description: part.description,
        moduleCode: part.moduleCode,
        qtyRequired: totalQty,
        onHand,
        onOrder: stock?.onOrder ?? 0,
        leadTimeDays: part.leadTimeDays,
        supplier: part.supplier,
        nextDeliveryAt: stock?.nextDeliveryAt ?? null,
        status: onHand >= totalQty ? "green" : (stock?.onOrder ?? 0) > 0 ? "amber" : "red",
      });
    }
  }

  return [...lines.values()].sort((a, b) => statusWeight(b.status) - statusWeight(a.status));
}

function statusWeight(status: StatusLevel): number {
  return { red: 3, amber: 2, green: 1, grey: 0 }[status];
}

function taskLinesFor(workOrder: WorkOrder, cards: TaskCard[]): WorkOrderTaskLine[] {
  const data = getDataset();
  const crew = data.technicians.filter((t) => t.facilityId === workOrder.facilityId);
  return cards.map((card) => {
    const skilled = crew.filter((t) => t.skills.includes(card.skillRequired));
    const rng = createRng(`wo-crew:${card.id}`);
    const assigned =
      card.assignedTechnicianId !== undefined
        ? (data.technicians.find((t) => t.id === card.assignedTechnicianId) ?? null)
        : card.state === "open" || skilled.length === 0
          ? null
          : rand.pick(rng, skilled);
    return {
      id: card.id,
      reference: card.reference,
      title: card.title,
      ataChapter: card.ataChapter,
      moduleCode: card.moduleCode,
      state: card.state,
      estimatedHours: card.estimatedHours,
      bookedHours: bookedHoursFor(card),
      skillRequired: card.skillRequired,
      technicianName: assigned?.name ?? null,
      skillGap: skilled.length === 0,
    };
  });
}

function blockersFor(
  workOrder: WorkOrder,
  stage: WorkOrderStage,
  taskLines: WorkOrderTaskLine[],
  partLines: WorkOrderPartLine[],
  ageingDays: number,
  daysToPromise: number,
  aogLinked: boolean,
): WorkOrderBlocker[] {
  if (stage === "closed") return [];
  const data = getDataset();
  const facility = data.facilities.find((f) => f.id === workOrder.facilityId);
  const out: WorkOrderBlocker[] = [];
  const rng = createRng(`wo-blockers:${workOrder.id}`);

  const short = partLines.filter((p) => p.onHand < p.qtyRequired);
  if (short.length > 0) {
    const worst = short.reduce((a, b) => (b.leadTimeDays > a.leadTimeDays ? b : a));
    const late = worst.leadTimeDays > Math.max(0, daysToPromise);
    out.push({
      id: `${workOrder.id}-parts`,
      kind: "parts",
      status: late ? "red" : "amber",
      title: `${short.length} part${short.length > 1 ? "s" : ""} short at ${facility?.icao ?? "base"}`,
      detail: `${worst.partNumber} — ${worst.qtyRequired} required, ${worst.onHand} on hand, ${worst.leadTimeDays}d lead time${late ? " (exceeds promise date)" : ""}.`,
      heldDays: Math.min(ageingDays, rand.int(rng, 1, 18)),
      owner: "Material planning",
    });
  }

  const blockedCards = taskLines.filter((t) => t.state === "blocked");
  const gapCards = taskLines.filter((t) => t.skillGap && t.state !== "signed-off");
  if (gapCards.length > 0) {
    out.push({
      id: `${workOrder.id}-labour`,
      kind: "labour",
      status: "red",
      title: `No certified technician for ${gapCards[0]!.skillRequired}`,
      detail: `${gapCards.length} task card${gapCards.length > 1 ? "s" : ""} at ${facility?.icao ?? "base"} require a skill not held by any technician on strength.`,
      heldDays: Math.min(ageingDays, rand.int(rng, 1, 12)),
      owner: "Shop floor lead",
    });
  }
  if (blockedCards.length > 0) {
    out.push({
      id: `${workOrder.id}-inspection`,
      kind: "inspection",
      status: blockedCards.length > 1 ? "red" : "amber",
      title: `${blockedCards.length} task card${blockedCards.length > 1 ? "s" : ""} on hold`,
      detail: `${blockedCards[0]!.reference} — ${blockedCards[0]!.title} awaiting findings disposition before work can continue.`,
      heldDays: Math.min(ageingDays, rand.int(rng, 1, 9)),
      owner: "Engineering support",
    });
  }

  if (workOrder.state === "draft" && ageingDays > 3) {
    out.push({
      id: `${workOrder.id}-approval`,
      kind: "approval",
      status: ageingDays > 10 ? "red" : "amber",
      title: "Not yet released",
      detail: `Raised ${ageingDays} days ago and still in draft — planning sign-off outstanding.`,
      heldDays: ageingDays,
      owner: "Maintenance planning",
    });
  }

  if (facility && facility.utilisationPct >= 92 && (stage === "planned" || stage === "raised")) {
    out.push({
      id: `${workOrder.id}-capacity`,
      kind: "capacity",
      status: facility.utilisationPct >= 97 ? "red" : "amber",
      title: `${facility.icao} at ${facility.utilisationPct}% utilisation`,
      detail: `${facility.name} has ${facility.capacity} slots and no clear induction window before the promised date.`,
      heldDays: Math.min(ageingDays, rand.int(rng, 1, 14)),
      owner: "Capacity planning",
    });
  }

  if (aogLinked) {
    out.push({
      id: `${workOrder.id}-aog`,
      kind: "aog",
      status: "red",
      title: "Aircraft on ground",
      detail: "Recovery clock running — this order gates the return to service of a grounded aircraft.",
      heldDays: Math.min(ageingDays, rand.int(rng, 1, 5)),
      owner: "AOG desk",
    });
  }

  return out.sort((a, b) => statusWeight(b.status) - statusWeight(a.status) || b.heldDays - a.heldDays);
}

function recommendationFor(
  view: Omit<WorkOrderView, "recommendation">,
): WorkOrderRecommendation {
  const top = view.blockers[0];
  if (view.stage === "closed") {
    return { action: "No action — archive", rationale: "Order closed and returned to service.", status: "green" };
  }
  if (top?.kind === "aog") {
    return {
      action: "Escalate to AOG desk and pull the slot forward",
      rationale: `${view.aircraftTail ?? view.engineEsn} is grounded; every hour held is availability lost against the ${view.operatorCode} contract.`,
      status: "red",
    };
  }
  if (top?.kind === "parts") {
    const short = view.partLines.filter((p) => p.onHand < p.qtyRequired);
    // Same selection as the parts blocker: the line with the longest lead time.
    const worst = short.length === 0 ? undefined : short.reduce((a, b) => (b.leadTimeDays > a.leadTimeDays ? b : a));
    return {
      action: worst && worst.onOrder > 0 ? "Expedite inbound order and confirm ETA" : "Raise an AOG parts request",
      rationale: worst
        ? `${worst.partNumber} is ${worst.qtyRequired - worst.onHand} short at ${view.facilityIcao} with a ${worst.leadTimeDays}-day lead time from ${worst.supplier}.`
        : "Material shortage is holding the order.",
      status: top.status,
    };
  }
  if (top?.kind === "labour") {
    return {
      action: "Borrow a certified technician or subcontract the task",
      rationale: top.detail,
      status: "red",
    };
  }
  if (top?.kind === "inspection") {
    return {
      action: "Book an engineering disposition review today",
      rationale: top.detail,
      status: top.status,
    };
  }
  if (top?.kind === "approval") {
    return {
      action: "Release the work order to the shop floor",
      rationale: top.detail,
      status: top.status,
    };
  }
  if (top?.kind === "capacity") {
    return {
      action: "Re-slot to an alternate facility",
      rationale: top.detail,
      status: top.status,
    };
  }
  if (view.overdue) {
    return {
      action: "Re-baseline the promise date with the operator",
      rationale: `Promised ${Math.abs(view.daysToPromise)} days ago with ${round(100 - view.progressPct, 0)}% of task cards still open.`,
      status: "red",
    };
  }
  if (view.stage === "test") {
    return {
      action: "Schedule the pass-off run",
      rationale: "All task cards are signed off; the order only needs a test cell slot to close.",
      status: "green",
    };
  }
  return {
    action: "On plan — no intervention required",
    rationale: `${view.progressPct}% of task cards signed off with ${view.daysToPromise} days to the promise date.`,
    status: "green",
  };
}

let cachedViews: WorkOrderView[] | null = null;

/** Every work order enriched with stage, blockers, labour, parts and a recommended action. */
export function workOrderViews(): WorkOrderView[] {
  if (cachedViews) return cachedViews;
  const data = getDataset();

  cachedViews = data.workOrders.map((workOrder) => {
    const engine = data.engines.find((e) => e.id === workOrder.engineId);
    const aircraft = engine?.aircraftId ? data.aircraft.find((a) => a.id === engine.aircraftId) : undefined;
    const operator = data.operators.find((o) => o.id === workOrder.operatorId);
    const facility = data.facilities.find((f) => f.id === workOrder.facilityId);
    const cards = data.taskCards.filter((c) => c.workOrderId === workOrder.id);
    const alerts = data.alerts.filter((a) => workOrder.triggeringAlertIds.includes(a.id));

    const stage = stageFor(workOrder, cards);
    const taskLines = taskLinesFor(workOrder, cards);
    const partLines = stage === "closed" ? [] : partLinesFor(workOrder, cards);
    const ageingDays = Math.max(0, daysBetween(workOrder.raisedAt, NOW));
    const daysToPromise = daysBetween(NOW, workOrder.scheduledEnd);
    const overdue = stage !== "closed" && daysToPromise < 0;
    const aogLinked =
      workOrder.type === "aog-recovery" ||
      aircraft?.status === "aog" ||
      alerts.some((a) => a.severity === "critical" && (a.timeToActionHours ?? 999) <= 24);
    const signedOff = taskLines.filter((t) => t.state === "signed-off").length;
    const progressPct = taskLines.length === 0 ? 0 : Math.round((signedOff / taskLines.length) * 100);
    const blockers = blockersFor(workOrder, stage, taskLines, partLines, ageingDays, daysToPromise, aogLinked);

    const status: StatusLevel =
      stage === "closed"
        ? "green"
        : blockers.some((b) => b.status === "red") || overdue
          ? "red"
          : blockers.length > 0
            ? "amber"
            : "green";

    const ownerRng = createRng(`wo-owner:${workOrder.id}`);
    const crew = data.technicians.filter((t) => t.facilityId === workOrder.facilityId);
    const owner = crew.length > 0 ? rand.pick(ownerRng, crew).name : "Unassigned";

    const base: Omit<WorkOrderView, "recommendation"> = {
      workOrder,
      reference: workOrder.reference,
      stage,
      status,
      priority: workOrder.priority,
      engineId: workOrder.engineId,
      engineEsn: engine?.esn ?? workOrder.engineId,
      engineFamily: engine?.family ?? "—",
      aircraftTail: aircraft?.tail ?? null,
      operatorCode: operator?.code ?? "—",
      operatorName: operator?.name ?? "—",
      facilityIcao: facility?.icao ?? "—",
      facilityName: facility?.name ?? "—",
      owner,
      ageingDays,
      daysToPromise,
      overdue,
      aogLinked,
      progressPct,
      estimatedHours: round(taskLines.reduce((s, t) => s + t.estimatedHours, 0), 1),
      bookedHours: round(taskLines.reduce((s, t) => s + t.bookedHours, 0), 1),
      taskLines,
      partLines,
      blockers,
      alerts,
    };

    return { ...base, recommendation: recommendationFor(base) };
  });

  return cachedViews;
}

export function openWorkOrderViews(): WorkOrderView[] {
  return workOrderViews().filter((v) => v.stage !== "closed");
}

export function getWorkOrderView(reference: string): WorkOrderView | undefined {
  return workOrderViews().find((v) => v.workOrder.id === reference || v.reference === reference);
}

export function workOrderKpis(): WorkOrderKpis {
  const views = workOrderViews();
  const open = views.filter((v) => v.stage !== "closed");
  // Closed orders in completion order, so the recent half is a genuine prior-period comparison.
  const closed = views
    .filter((v) => v.stage === "closed")
    .sort((a, b) => new Date(a.workOrder.scheduledEnd).getTime() - new Date(b.workOrder.scheduledEnd).getTime());
  const cycleDays = closed.map((v) => Math.max(1, daysBetween(v.workOrder.raisedAt, v.workOrder.scheduledEnd)));
  const mean = (values: number[]) => (values.length === 0 ? 0 : round(values.reduce((s, v) => s + v, 0) / values.length, 1));
  const half = Math.floor(cycleDays.length / 2);
  const recent = half === 0 ? cycleDays : cycleDays.slice(half);
  const prior = half === 0 ? cycleDays : cycleDays.slice(0, half);

  return {
    open: open.length,
    overdue: open.filter((v) => v.overdue).length,
    awaitingParts: open.filter((v) => v.blockers.some((b) => b.kind === "parts")).length,
    blocked: open.filter((v) => v.blockers.length > 0).length,
    aogLinked: open.filter((v) => v.aogLinked).length,
    criticalOpen: open.filter((v) => v.priority === "critical").length,
    avgCycleTimeDays: mean(recent),
    priorCycleTimeDays: mean(prior),
    labourHoursBooked: Math.round(open.reduce((s, v) => s + v.bookedHours, 0)),
  };
}

export function workOrderStageSummary(): WorkOrderStageSummary[] {
  const views = workOrderViews();
  return WORK_ORDER_STAGES.map(({ stage, label }) => {
    const inStage = views.filter((v) => v.stage === stage);
    return {
      stage,
      label,
      orders: inStage.length,
      overdue: inStage.filter((v) => v.overdue).length,
      aogLinked: inStage.filter((v) => v.aogLinked).length,
    };
  });
}

export function workOrderBlockerSummary(): WorkOrderBlockerSummary[] {
  const open = openWorkOrderViews();
  const byKind = new Map<WorkOrderBlockerKind, { orders: number; heldDays: number; red: boolean; topDetail: string; topHeld: number }>();

  for (const view of open) {
    for (const blocker of view.blockers) {
      const entry = byKind.get(blocker.kind) ?? { orders: 0, heldDays: 0, red: false, topDetail: blocker.detail, topHeld: -1 };
      entry.orders += 1;
      entry.heldDays += blocker.heldDays;
      entry.red = entry.red || blocker.status === "red";
      if (blocker.heldDays > entry.topHeld) {
        entry.topHeld = blocker.heldDays;
        entry.topDetail = `${view.reference} — ${blocker.detail}`;
      }
      byKind.set(blocker.kind, entry);
    }
  }

  return [...byKind.entries()]
    .map(([kind, entry]) => ({
      kind,
      label: BLOCKER_LABELS[kind],
      orders: entry.orders,
      status: (entry.red ? "red" : "amber") as StatusLevel,
      heldDays: entry.heldDays,
      topDetail: entry.topDetail,
    }))
    .sort((a, b) => b.orders - a.orders);
}

/** Orders a controller should work first: red status, weighted by AOG, priority and ageing. */
export function workOrderPriorityQueue(limit = 5): WorkOrderView[] {
  const rank = (v: WorkOrderView) =>
    (v.aogLinked ? 1000 : 0) +
    (v.priority === "critical" ? 400 : v.priority === "high" ? 200 : 0) +
    (v.overdue ? 250 : 0) +
    v.blockers.filter((b) => b.status === "red").length * 120 +
    v.ageingDays;
  return openWorkOrderViews()
    .filter((v) => v.status === "red")
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit);
}
