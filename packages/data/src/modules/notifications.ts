/**
 * Escalations module selectors.
 *
 * A "red condition" is an open alert that is critical or high severity, i.e.
 * one the fleet services centre must have acknowledged by an accountable
 * owner. Everything here is derived deterministically from the generated
 * dataset so the API, the web app and tests agree.
 *
 * Domain assumptions (synthetic data, documented rather than hidden):
 *  - Persistent conditions re-trigger on the EHM feed; the escalation clock
 *    starts at the last re-trigger, not at the first ever detection.
 *  - Acknowledgement SLA is a function of severity, tightened one step for
 *    every tier the condition has already been escalated through.
 *  - Owners are drawn from the technician/engineering roster in the dataset.
 */

import type {
  AcknowledgementState,
  Alert,
  Escalation,
  EscalationEvent,
  EscalationOwner,
  EscalationSummary,
  EscalationTier,
  EscalationTierGroup,
  NotificationChannel,
  Point,
  Severity,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, NOW, rand, round } from "../rng";

export const ESCALATION_TIERS: {
  tier: EscalationTier;
  label: string;
  description: string;
  role: string;
  channel: NotificationChannel;
  /** Acknowledgement window in minutes for a critical condition at this tier. */
  slaMinutes: number;
}[] = [
  {
    tier: "T1",
    label: "Tier 1 — Duty controller",
    description: "Fleet services duty desk. First responder for every red condition raised by EHM.",
    role: "Duty controller",
    channel: "console",
    slaMinutes: 30,
  },
  {
    tier: "T2",
    label: "Tier 2 — Fleet engineer",
    description: "Engine family specialist. Owns technical disposition when the duty desk cannot clear it.",
    role: "Fleet engineer",
    channel: "email",
    slaMinutes: 60,
  },
  {
    tier: "T3",
    label: "Tier 3 — Operations manager",
    description: "Accountable for customer impact and dispatch. Engaged when the SLA is at risk.",
    role: "Operations manager",
    channel: "sms",
    slaMinutes: 120,
  },
  {
    tier: "T4",
    label: "Tier 4 — Executive on call",
    description: "Customer director on call. Engaged for AOG exposure and breached commitments.",
    role: "Executive on call",
    channel: "phone",
    slaMinutes: 240,
  },
];

const TIER_ORDER: EscalationTier[] = ["T1", "T2", "T3", "T4"];

export function tierMeta(tier: EscalationTier) {
  return ESCALATION_TIERS.find((t) => t.tier === tier) ?? ESCALATION_TIERS[0]!;
}

/** Acknowledgement window in minutes for a severity at a tier. */
export function ackSlaMinutes(severity: Severity, tier: EscalationTier): number {
  const bySeverity: Record<Severity, number> = { critical: 30, high: 90, medium: 240, low: 480, info: 720 };
  const tighten: Record<EscalationTier, number> = { T1: 1, T2: 0.75, T3: 0.5, T4: 0.35 };
  return Math.max(10, Math.round(bySeverity[severity] * tighten[tier]));
}

function minutesBetween(from: string | Date, to: string | Date): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

function addMinutes(from: string | Date, minutes: number): string {
  return new Date(new Date(from).getTime() + minutes * 60000).toISOString();
}

/** Open alerts that represent a red condition requiring an accountable owner. */
function redConditions(): Alert[] {
  return getDataset().alerts.filter(
    (a) =>
      a.state !== "closed" &&
      a.state !== "false-positive" &&
      (a.severity === "critical" || a.severity === "high" || a.status === "red"),
  );
}

function ownerFor(alert: Alert, tier: EscalationTier, offset: number): EscalationOwner {
  const d = getDataset();
  const meta = tierMeta(tier);
  const roster = d.technicians;
  const index = (Math.abs(hash(alert.id + tier) + offset * 7)) % Math.max(1, roster.length);
  const person = roster[index]!;
  const facility = d.facilities.find((f) => f.id === person.facilityId);
  return {
    id: person.id,
    name: person.name,
    role: meta.role,
    email: `${person.name.toLowerCase().replace(/[^a-z]+/g, ".")}@rolls-royce.com`,
    base: facility?.icao ?? "EGNX",
    tier,
  };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function buildEscalation(alert: Alert): Escalation {
  const d = getDataset();
  const rng = createRng(`escalation:${alert.id}`);
  const engine = d.engines.find((e) => e.id === alert.engineId)!;
  const aircraft = d.aircraft.find((a) => a.id === engine.aircraftId);
  const operator = d.operators.find((o) => o.id === alert.operatorId);
  const workOrder = d.workOrders.find((w) => w.triggeringAlertIds.includes(alert.id));

  // The escalation clock starts at the last re-trigger of a persistent condition.
  const retriggerMinutesAgo = rand.int(rng, 8, 3600);
  const alertAgeMinutes = minutesBetween(alert.raisedAt, NOW);
  const raisedMinutesAgo = Math.min(alertAgeMinutes, retriggerMinutesAgo);
  const raisedAt = addMinutes(NOW, -raisedMinutesAgo);

  // Base tier from operational exposure. The condition then climbs one tier per
  // elapsed acknowledgement window, but the ladder stops the moment an owner
  // accepts it — an acknowledged condition never escalates further.
  const aog = aircraft?.status === "aog";
  const baseIndex = alert.severity === "critical" ? (aog ? 2 : 1) : engine.status === "red" ? 1 : 0;
  const baseTier = TIER_ORDER[baseIndex]!;
  const baseSla = ackSlaMinutes(alert.severity, baseTier);

  const acknowledgementState = rand.weighted<AcknowledgementState>(rng, [
    { value: "unacknowledged", weight: alert.state === "new" ? 58 : 16 },
    { value: "acknowledged", weight: 52 },
    { value: "resolved", weight: alert.state === "actioned" ? 40 : 14 },
  ]);

  const ackMinutes =
    acknowledgementState === "unacknowledged"
      ? null
      : Math.max(2, Math.min(raisedMinutesAgo, Math.round(baseSla * rand.float(rng, 0.15, 3.2))));
  const elapsedMinutes = ackMinutes ?? raisedMinutesAgo;
  const escalationSteps = Math.min(3 - baseIndex, Math.floor(elapsedMinutes / Math.max(1, baseSla)));
  const tier = TIER_ORDER[Math.min(3, baseIndex + escalationSteps)]!;
  const slaMinutes = ackSlaMinutes(alert.severity, tier);

  const acknowledgedAt = ackMinutes === null ? null : addMinutes(raisedAt, ackMinutes);
  const slaDueAt = addMinutes(raisedAt, slaMinutes);
  const slaRemainingMinutes = slaMinutes - elapsedMinutes;
  const breached = slaRemainingMinutes < 0;

  const reassignments = rand.weighted(rng, [
    { value: 0, weight: 68 },
    { value: 1, weight: 24 },
    { value: 2, weight: 8 },
  ]);
  const owner = ownerFor(alert, tier, reassignments);

  const trail = buildTrail({
    alert,
    raisedAt,
    tier,
    baseIndex,
    slaMinutes,
    acknowledgementState,
    acknowledgedAt,
    owner,
    reassignments,
    rng,
  });

  return {
    id: `ES-${alert.id.slice(3)}`,
    alertId: alert.id,
    engineId: engine.id,
    esn: engine.esn,
    engineFamily: engine.family,
    operatorId: alert.operatorId,
    operatorName: operator?.name ?? "Unassigned operator",
    aircraftTail: aircraft?.tail ?? null,
    title: alert.title,
    reason: redReason(alert, engine.egtMargin, aog),
    recommendedAction: alert.recommendedAction,
    severity: alert.severity,
    status: acknowledgementState === "unacknowledged" || breached ? "red" : acknowledgementState === "resolved" ? "green" : "amber",
    source: alert.source,
    ataChapter: alert.ataChapter,
    raisedAt,
    tier,
    owner,
    acknowledgementState,
    acknowledgedAt,
    acknowledgedBy: acknowledgedAt ? owner.name : null,
    elapsedMinutes,
    slaMinutes,
    slaDueAt,
    slaRemainingMinutes,
    breached,
    notifiedCount: trail.filter((e) => e.kind === "notified").length,
    reassignments,
    trail,
    relatedWorkOrderRef: workOrder?.reference ?? null,
  };
}

function redReason(alert: Alert, egtMargin: number, aog: boolean): string {
  if (aog) return `Aircraft is AOG — ${alert.severity} ${alert.source} finding on ATA ${alert.ataChapter}.`;
  if (alert.severity === "critical") {
    return `Critical ${alert.source} exceedance with ${egtMargin}°C EGT margin remaining; action required within ${alert.timeToActionHours ?? 24}h.`;
  }
  return `High severity ${alert.source} finding on ATA ${alert.ataChapter}; ${egtMargin}°C EGT margin remaining.`;
}

function buildTrail(input: {
  alert: Alert;
  raisedAt: string;
  tier: EscalationTier;
  baseIndex: number;
  slaMinutes: number;
  acknowledgementState: AcknowledgementState;
  acknowledgedAt: string | null;
  owner: EscalationOwner;
  reassignments: number;
  rng: () => number;
}): EscalationEvent[] {
  const { alert, raisedAt, tier, baseIndex, slaMinutes, acknowledgementState, acknowledgedAt, owner, reassignments, rng } =
    input;
  const events: EscalationEvent[] = [];
  const baseTier = TIER_ORDER[baseIndex]!;
  let n = 0;
  const push = (event: Omit<EscalationEvent, "id">) => {
    n += 1;
    events.push({ id: `${alert.id}-EV${n}`, ...event });
  };

  push({
    at: raisedAt,
    kind: "raised",
    actor: `${alert.source} pipeline`,
    channel: "console",
    tier: baseTier,
    detail: `Red condition raised automatically by ${alert.source} on ${alert.title.split(" — ")[0]}.`,
  });

  const currentIndex = TIER_ORDER.indexOf(tier);
  let cursor = 1;
  for (let i = baseIndex; i <= currentIndex; i += 1) {
    const stepTier = TIER_ORDER[i]!;
    const meta = tierMeta(stepTier);
    const stepOwner = i === currentIndex ? owner : ownerFor(alert, stepTier, 0);
    if (i > baseIndex) {
      push({
        at: addMinutes(raisedAt, cursor),
        kind: "escalated",
        actor: "escalation-engine",
        channel: "console",
        tier: stepTier,
        detail: `No acknowledgement inside the ${ackSlaMinutes(alert.severity, TIER_ORDER[i - 1]!)}m window — escalated to ${meta.role.toLowerCase()}.`,
      });
      cursor += 1;
    }
    push({
      at: addMinutes(raisedAt, cursor),
      kind: "notified",
      actor: stepOwner.name,
      channel: meta.channel,
      tier: stepTier,
      detail: `${meta.role} notified via ${meta.channel.toUpperCase()} at ${stepOwner.base}.`,
    });
    cursor += Math.max(2, Math.round(slaMinutes * rand.float(rng, 0.4, 1.1)));
  }

  if (reassignments > 0) {
    for (let i = 0; i < reassignments; i += 1) {
      const previous = ownerFor(alert, tier, i);
      push({
        at: addMinutes(raisedAt, Math.max(1, Math.round(slaMinutes * rand.float(rng, 0.2, 0.9)))),
        kind: "reassigned",
        actor: previous.name,
        channel: "console",
        tier,
        detail: `Ownership transferred from ${previous.name} (${previous.base}) to ${owner.name} (${owner.base}).`,
      });
    }
  }

  if (acknowledgedAt) {
    push({
      at: acknowledgedAt,
      kind: "acknowledged",
      actor: owner.name,
      channel: tierMeta(tier).channel,
      tier,
      detail: `Acknowledged by ${owner.name}, ${owner.role.toLowerCase()} — ${alert.recommendedAction.toLowerCase()}.`,
    });
    if (acknowledgementState === "resolved") {
      push({
        at: addMinutes(acknowledgedAt, Math.round(slaMinutes * rand.float(rng, 1.2, 6))),
        kind: "resolved",
        actor: owner.name,
        channel: "console",
        tier,
        detail: "Disposition recorded and condition cleared from the escalation inbox.",
      });
    }
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : 1));
}

let cachedEscalations: Escalation[] | null = null;

/** Every open red condition with its ownership and acknowledgement state. */
export function getEscalations(): Escalation[] {
  if (!cachedEscalations) {
    cachedEscalations = redConditions()
      .map(buildEscalation)
      .sort(
        (a, b) =>
          Number(b.acknowledgementState === "unacknowledged") - Number(a.acknowledgementState === "unacknowledged") ||
          a.slaRemainingMinutes - b.slaRemainingMinutes,
      );
  }
  return cachedEscalations;
}

export function getEscalation(id: string): Escalation | undefined {
  return getEscalations().find((e) => e.id === id || e.alertId === id);
}

/** Escalations grouped by tier, highest tier first, unacknowledged first inside each tier. */
export function getEscalationsByTier(): EscalationTierGroup[] {
  const all = getEscalations();
  return [...ESCALATION_TIERS]
    .reverse()
    .map((meta) => {
      const escalations = all.filter((e) => e.tier === meta.tier);
      return {
        tier: meta.tier,
        label: meta.label,
        description: meta.description,
        slaMinutes: meta.slaMinutes,
        escalations,
        unacknowledged: escalations.filter((e) => e.acknowledgementState === "unacknowledged").length,
        breached: escalations.filter((e) => e.breached && e.acknowledgementState !== "resolved").length,
      };
    })
    .filter((group) => group.escalations.length > 0);
}

export function getEscalationSummary(): EscalationSummary {
  const all = getEscalations();
  const unack = all.filter((e) => e.acknowledgementState === "unacknowledged");
  const acknowledged = all.filter((e) => e.acknowledgedAt !== null);
  const breached = all.filter((e) => e.breached && e.acknowledgementState !== "resolved");
  const meanAck = acknowledged.length
    ? round(acknowledged.reduce((s, e) => s + e.elapsedMinutes, 0) / acknowledged.length, 0)
    : 0;
  // Disjoint periods so the KPI delta is a genuine trend: conditions raised in
  // the last 24h against everything raised before that.
  const mean = (rows: Escalation[]) =>
    rows.length ? round(rows.reduce((s, e) => s + e.elapsedMinutes, 0) / rows.length, 0) : 0;
  const recent = acknowledged.filter((e) => minutesBetween(e.raisedAt, NOW) <= 1440);
  const older = acknowledged.filter((e) => minutesBetween(e.raisedAt, NOW) > 1440);
  const recentMeanAck = recent.length ? mean(recent) : meanAck;
  const priorMeanAck = older.length ? mean(older) : recentMeanAck;

  const byTier = TIER_ORDER.reduce(
    (acc, tier) => {
      const rows = all.filter((e) => e.tier === tier);
      acc[tier] = {
        total: rows.length,
        unacknowledged: rows.filter((e) => e.acknowledgementState === "unacknowledged").length,
        breached: rows.filter((e) => e.breached && e.acknowledgementState !== "resolved").length,
      };
      return acc;
    },
    {} as EscalationSummary["byTier"],
  );

  return {
    total: all.length,
    unacknowledged: unack.length,
    breached: breached.length,
    meanAckMinutes: meanAck,
    recentMeanAckMinutes: recentMeanAck,
    priorMeanAckMinutes: priorMeanAck,
    acknowledgedWithinSla: acknowledged.filter((e) => !e.breached).length,
    ackCoveragePct: all.length ? round(((all.length - unack.length) / all.length) * 100, 1) : 100,
    oldestUnacknowledgedMinutes: unack.reduce((max, e) => Math.max(max, e.elapsedMinutes), 0),
    byTier,
  };
}

/** Owners carrying open escalations, worst exposure first. */
export function getEscalationOwnerLoad(limit = 6) {
  const byOwner = new Map<string, { owner: Escalation["owner"]; open: number; unacknowledged: number; breached: number }>();
  for (const escalation of getEscalations()) {
    if (escalation.acknowledgementState === "resolved") continue;
    const entry = byOwner.get(escalation.owner.id) ?? {
      owner: escalation.owner,
      open: 0,
      unacknowledged: 0,
      breached: 0,
    };
    entry.open += 1;
    if (escalation.acknowledgementState === "unacknowledged") entry.unacknowledged += 1;
    if (escalation.breached) entry.breached += 1;
    byOwner.set(escalation.owner.id, entry);
  }
  return [...byOwner.values()]
    .sort((a, b) => b.unacknowledged - a.unacknowledged || b.breached - a.breached || b.open - a.open)
    .slice(0, limit);
}

/**
 * Mean acknowledgement time per bucket across the escalation window.
 *
 * The window matches the spread of the escalation clock (conditions re-trigger
 * within the trailing 60 hours), so every plotted point is a real mean over the
 * conditions raised in that bucket. Empty buckets carry the previous value
 * forward rather than inventing one.
 */
export function getAckTimeTrend(hours = 60, bucketHours = 4): Point[] {
  const all = getEscalations().filter((e) => e.acknowledgedAt !== null);
  const bucketMs = bucketHours * 3600000;
  const points: Point[] = [];
  let carried = 0;
  for (let start = NOW.getTime() - hours * 3600000; start < NOW.getTime(); start += bucketMs) {
    const rows = all.filter((e) => {
      const t = new Date(e.raisedAt).getTime();
      return t >= start && t < start + bucketMs;
    });
    if (rows.length) {
      carried = round(rows.reduce((s, e) => s + e.elapsedMinutes, 0) / rows.length, 1);
    }
    points.push({ t: new Date(start).toISOString(), v: carried });
  }
  return points;
}

/** On-shift owners available to take ownership of an escalation. */
export function getStandbyOwners(limit = 8): EscalationOwner[] {
  const roster = getDataset().technicians;
  const rng = createRng("escalation-standby");
  return rand
    .sample(rng, roster, limit)
    .map((person, i) => {
      const meta = ESCALATION_TIERS[i % ESCALATION_TIERS.length]!;
      const facility = getDataset().facilities.find((f) => f.id === person.facilityId);
      return {
        id: person.id,
        name: person.name,
        role: meta.role,
        email: `${person.name.toLowerCase().replace(/[^a-z]+/g, ".")}@rolls-royce.com`,
        base: facility?.icao ?? "EGNX",
        tier: meta.tier,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Notification volume by channel — evidence that the right people were reached. */
export function getChannelBreakdown() {
  const counts = new Map<NotificationChannel, number>();
  for (const escalation of getEscalations()) {
    for (const event of escalation.trail) {
      if (event.kind !== "notified") continue;
      counts.set(event.channel, (counts.get(event.channel) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}
