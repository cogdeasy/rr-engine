/**
 * @rr/data — the single source of truth for the platform's synthetic fleet.
 *
 * The dataset is generated once per process from a fixed seed, so the API, the
 * web app and every test observe exactly the same fleet without a database.
 */

import type { Alert, Engine, Prognostic, StatusLevel, WorkOrder } from "@rr/types";
import { generateDataset, type Dataset } from "./generate";

export * from "./catalog";
export * from "./rng";
export * from "./generate";
export * from "./modules";

let cached: Dataset | null = null;

export function getDataset(): Dataset {
  if (!cached) cached = generateDataset();
  return cached;
}

/* ------------------------------------------------------------------ */
/* Query helpers shared by the API and by server components            */
/* ------------------------------------------------------------------ */

export function getEngine(engineId: string): Engine | undefined {
  return getDataset().engines.find((e) => e.id === engineId || e.esn === engineId);
}

export function getEnginesByStatus(status: StatusLevel): Engine[] {
  return getDataset().engines.filter((e) => e.status === status);
}

export function getAlertsForEngine(engineId: string): Alert[] {
  return getDataset().alerts.filter((a) => a.engineId === engineId);
}

export function getOpenAlerts(): Alert[] {
  return getDataset()
    .alerts.filter((a) => a.state !== "closed" && a.state !== "false-positive")
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function getPrognosticsForEngine(engineId: string): Prognostic[] {
  return getDataset().prognostics.filter((p) => p.engineId === engineId);
}

export function getWorkOrdersForEngine(engineId: string): WorkOrder[] {
  return getDataset().workOrders.filter((w) => w.engineId === engineId);
}

export function severityRank(severity: Alert["severity"]): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity];
}

export function statusRank(status: StatusLevel): number {
  return { red: 3, amber: 2, green: 1, grey: 0 }[status];
}

/** Fleet-level roll-up used by the overview dashboard and the app shell. */
export function fleetSummary() {
  const d = getDataset();
  const byStatus = { red: 0, amber: 0, green: 0, grey: 0 } as Record<StatusLevel, number>;
  for (const engine of d.engines) byStatus[engine.status] += 1;
  return {
    engines: d.engines.length,
    aircraft: d.aircraft.length,
    operators: d.operators.length,
    byStatus,
    openAlerts: getOpenAlerts().length,
    criticalAlerts: d.alerts.filter((a) => a.severity === "critical" && a.state !== "closed").length,
    activeWorkOrders: d.workOrders.filter((w) => w.state === "in-progress" || w.state === "awaiting-parts").length,
    aogAircraft: d.aircraft.filter((a) => a.status === "aog").length,
    averageEgtMargin:
      Math.round((d.engines.reduce((s, e) => s + e.egtMargin, 0) / Math.max(1, d.engines.length)) * 10) / 10,
    averageHealthScore: Math.round(d.engines.reduce((s, e) => s + e.healthScore, 0) / Math.max(1, d.engines.length)),
  };
}
