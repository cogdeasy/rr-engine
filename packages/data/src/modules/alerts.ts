/**
 * Derived selectors for the alert triage module (`/alerts`).
 *
 * Everything the triage console renders is computed here from the deterministic
 * dataset so the page, the API and any test observe identical rows.
 */

import type {
  Alert,
  AlertEvidence,
  DispositionEntry,
  DispositionKind,
  Severity,
  TriageAlert,
  TriageSummary,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import { engineSeries } from "../generate";
import { getDataset, severityRank } from "../index";
import { createRng, NOW, rand } from "../rng";

const HOUR_MS = 3_600_000;

const OPEN_STATES: Alert["state"][] = ["new", "triaged", "investigating", "actioned"];

/**
 * Deterministic next departure for an airframe. The dataset stores completed
 * sectors only, so the forward-looking schedule an alert has to beat is derived
 * from the tail number rather than stored.
 */
export function nextSectorAt(aircraftId: string, status: string): Date | null {
  if (status !== "in-service") return null;
  const rng = createRng(`${aircraftId}:next-sector`);
  return new Date(NOW.getTime() + rand.float(rng, 1.5, 36, 2) * HOUR_MS);
}

function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / HOUR_MS) * 10) / 10;
}

/**
 * Severity weighting used to rank the queue: severity first, then how much of
 * the action window is left (deadline is `raisedAt + timeToActionHours`).
 */
function priorityScore(alert: Alert, hoursRemaining: number | null, hoursToNextSector: number | null): number {
  const severity = severityRank(alert.severity) * 1000;
  const urgency = hoursRemaining === null ? 0 : Math.max(0, 500 - Math.min(500, Math.max(0, hoursRemaining)));
  const overdue = hoursRemaining !== null && hoursRemaining <= 0 ? 400 : 0;
  const sector = hoursToNextSector !== null && hoursRemaining !== null && hoursRemaining <= hoursToNextSector ? 300 : 0;
  const confidence = Math.round((alert.confidence ?? 0.5) * 100);
  return severity + urgency + overdue + sector + confidence;
}

/** The full triage queue: open alerts, enriched and ranked. */
export function getTriageQueue(includeClosed = false): TriageAlert[] {
  const data = getDataset();
  const now = new Date(data.generatedAt);

  return data.alerts
    .filter((alert) => includeClosed || OPEN_STATES.includes(alert.state))
    .map((alert) => {
      const engine = data.engines.find((e) => e.id === alert.engineId);
      const aircraft = engine?.aircraftId ? data.aircraft.find((a) => a.id === engine.aircraftId) ?? null : null;
      const operator = data.operators.find((o) => o.id === alert.operatorId);
      const next = aircraft ? nextSectorAt(aircraft.id, aircraft.status) : null;
      const hoursToNextSector = next ? hoursBetween(now, next) : null;
      const ageHours = Math.max(0, hoursBetween(new Date(alert.raisedAt), now));
      const hoursRemaining = alert.timeToActionHours === null ? null : alert.timeToActionHours - ageHours;
      const needsActionBeforeNextSector = hoursToNextSector !== null && hoursRemaining !== null && hoursRemaining <= hoursToNextSector;
      const workOrder = data.workOrders.find(
        (w) => w.id === alert.relatedWorkOrderId || w.triggeringAlertIds.includes(alert.id),
      );

      return {
        alert,
        engineId: alert.engineId,
        esn: engine?.esn ?? alert.engineId,
        family: engine?.family ?? "unknown",
        positionLabel: engine?.position ? `#${engine.position}` : "off wing",
        engineStatus: engine?.status ?? "grey",
        engineHealthScore: engine?.healthScore ?? 0,
        egtMargin: engine?.egtMargin ?? 0,
        aircraftTail: aircraft?.tail ?? null,
        aircraftType: aircraft?.type ?? null,
        operatorCode: operator?.code ?? "—",
        operatorName: operator?.name ?? "Unassigned",
        hoursToNextSector,
        nextSectorAt: next ? next.toISOString() : null,
        needsActionBeforeNextSector,
        ageHours,
        priorityScore: priorityScore(alert, hoursRemaining, hoursToNextSector),
        relatedOpenAlerts: data.alerts.filter(
          (a) => a.engineId === alert.engineId && a.id !== alert.id && OPEN_STATES.includes(a.state),
        ).length,
        workOrderReference: workOrder?.reference ?? null,
      } satisfies TriageAlert;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.ageHours - b.ageHours);
}

/** Headline counts for the decision strip at the top of the page. */
export function getTriageSummary(queue = getTriageQueue()): TriageSummary {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
  const byState = { new: 0, triaged: 0, investigating: 0, actioned: 0, closed: 0, "false-positive": 0 } as Record<
    Alert["state"],
    number
  >;
  const bySource: Record<string, number> = {};

  for (const item of queue) {
    bySeverity[item.alert.severity] += 1;
    byState[item.alert.state] += 1;
    bySource[item.alert.source] = (bySource[item.alert.source] ?? 0) + 1;
  }

  const ages = queue.map((q) => q.ageHours).sort((a, b) => a - b);
  const medianAgeHours = ages.length === 0 ? 0 : Math.round(ages[Math.floor(ages.length / 2)]!);

  return {
    total: queue.length,
    bySeverity,
    byState,
    bySource,
    beforeNextSector: queue.filter((q) => q.needsActionBeforeNextSector).length,
    overdue: queue.filter((q) => q.alert.timeToActionHours !== null && q.ageHours > q.alert.timeToActionHours).length,
    criticalUnactioned: queue.filter((q) => q.alert.severity === "critical" && q.alert.state !== "actioned").length,
    medianAgeHours,
    enginesAffected: new Set(queue.map((q) => q.engineId)).size,
  };
}

const AUDIT_TO_DISPOSITION: Record<string, DispositionKind> = {
  "alert.triaged": "acknowledge",
  "alert.escalated": "escalate",
  "alert.assigned": "acknowledge",
  "alert.closed": "false-positive",
};

const DISPOSITION_RESULT: Record<DispositionKind, Alert["state"]> = {
  acknowledge: "triaged",
  escalate: "investigating",
  "raise-work-order": "actioned",
  "false-positive": "false-positive",
};

export function dispositionResultState(kind: DispositionKind): Alert["state"] {
  return DISPOSITION_RESULT[kind];
}

/** Disposition activity already recorded against an alert, newest last. */
export function getDispositionHistory(alertId: string): DispositionEntry[] {
  return getDataset()
    .auditLog.filter((entry) => entry.entityType === "Alert" && entry.entityId === alertId)
    .map((entry) => ({
      id: entry.id,
      alertId,
      kind: AUDIT_TO_DISPOSITION[entry.action] ?? "acknowledge",
      at: entry.at,
      actor: entry.actor,
      resultingState: DISPOSITION_RESULT[AUDIT_TO_DISPOSITION[entry.action] ?? "acknowledge"],
      detail: entry.detail,
    }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** Evidence pack for the detail pane: trigger trend, related alerts, work order. */
export function getAlertEvidence(alertId: string): AlertEvidence | null {
  const data = getDataset();
  const alert = data.alerts.find((a) => a.id === alertId);
  if (!alert) return null;
  const engine = data.engines.find((e) => e.id === alert.engineId) ?? null;
  const definition = alert.parameter ? PARAMETERS[alert.parameter] : null;
  const series = engine && alert.parameter ? engineSeries(engine, alert.parameter, 180) : null;
  const workOrder =
    data.workOrders.find((w) => w.id === alert.relatedWorkOrderId || w.triggeringAlertIds.includes(alert.id)) ?? null;

  return {
    alertId,
    series,
    parameterLabel: definition?.label ?? null,
    parameterUnit: definition?.unit ?? null,
    latestValue: series ? series.points[series.points.length - 1]?.v ?? null : null,
    amberThreshold: series?.amberThreshold ?? null,
    redThreshold: series?.redThreshold ?? null,
    direction: definition?.direction ?? null,
    relatedAlerts: data.alerts
      .filter((a) => a.engineId === alert.engineId && a.id !== alert.id && OPEN_STATES.includes(a.state))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 8),
    workOrder,
    history: getDispositionHistory(alertId),
  };
}

/**
 * Evidence for every queued alert so the client console can switch panes without
 * a round trip. Trigger trends are thinned to keep the payload small; the shape
 * of the deterioration is preserved.
 */
export function getTriageEvidence(queue = getTriageQueue()): Record<string, AlertEvidence> {
  const out: Record<string, AlertEvidence> = {};
  for (const item of queue) {
    const evidence = getAlertEvidence(item.alert.id);
    if (!evidence) continue;
    out[item.alert.id] = evidence.series
      ? { ...evidence, series: { ...evidence.series, points: thin(evidence.series.points, 24) } }
      : evidence;
  }
  return out;
}

function thin<T>(points: T[], target: number): T[] {
  if (points.length <= target) return points;
  const step = (points.length - 1) / (target - 1);
  return Array.from({ length: target }, (_, i) => points[Math.round(i * step)]!);
}
