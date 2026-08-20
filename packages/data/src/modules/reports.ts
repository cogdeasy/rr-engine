/**
 * Reports & exports — derived selectors for `/assure/reports`.
 *
 * `buildReportFacts()` flattens the generated dataset into a compact,
 * serialisable fact table. Every other function in this file is pure over those
 * facts, so the identical builder produces the server-rendered pack and the
 * live preview in the browser without shipping the generator to the client.
 */

import type {
  EngineFamily,
  ReportAlertFact,
  ReportAuditFact,
  ReportBulletinFact,
  ReportCadence,
  ReportDefinition,
  ReportDocument,
  ReportEngineFact,
  ReportFacts,
  ReportFinding,
  ReportFlightMonthFact,
  ReportId,
  ReportLlpFact,
  ReportMetric,
  ReportPeriod,
  ReportPeriodId,
  ReportScope,
  ReportSection,
  ReportTableRow,
  ReportWorkOrderFact,
  ScheduleRunStatus,
  ScheduledReport,
  StatusLevel,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, createRng, iso, NOW, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "fleet-health-summary",
    name: "Fleet health summary",
    audience: "Fleet services leadership",
    purpose: "State of the managed fleet: what is red today and what it will cost to clear.",
    cadence: "weekly",
    format: "PDF",
    sections: [
      { id: "fleet-status", title: "Fleet status", description: "Red/amber/green mix and headline health indices.", required: true },
      { id: "watchlist", title: "Engine watchlist", description: "Lowest health scores with the action each one needs." },
      { id: "alert-sources", title: "Detection sources", description: "Where this period's findings came from." },
      { id: "kpi-trend", title: "Performance indicators", description: "Dispatch, availability and IFSD against target." },
    ],
  },
  {
    id: "operator-monthly-review",
    name: "Operator monthly review",
    audience: "Customer fleet manager",
    purpose: "The customer-facing pack: contract performance, utilisation, events and agreed actions.",
    cadence: "monthly",
    format: "PDF",
    sections: [
      { id: "contract-performance", title: "Contract performance", description: "Availability against commitment and any liquidated damages.", required: true },
      { id: "utilisation", title: "Utilisation", description: "Sectors, block hours and fuel burn by month." },
      { id: "events", title: "Events in period", description: "Alerts raised, by severity, with the disposition of each." },
      { id: "maintenance", title: "Maintenance activity", description: "Work orders raised, in work and completed in the period." },
      { id: "agreed-actions", title: "Agreed actions", description: "What Rolls-Royce and the operator each owe before next review." },
    ],
  },
  {
    id: "reliability-report",
    name: "Reliability report",
    audience: "Engineering & airworthiness",
    purpose: "Reliability performance, dominant failure modes and removal drivers.",
    cadence: "monthly",
    format: "XLSX",
    sections: [
      { id: "reliability-kpis", title: "Reliability indicators", description: "IFSD rate, MTBUR and unscheduled removals.", required: true },
      { id: "failure-modes", title: "Dominant failure modes", description: "Findings grouped by ATA chapter." },
      { id: "removals", title: "Removals & shop visits", description: "Engine removals driving the reliability position." },
      { id: "alert-ageing", title: "Finding ageing", description: "How long open findings have been outstanding." },
    ],
  },
  {
    id: "cost-report",
    name: "Cost report",
    audience: "Commercial & finance",
    purpose: "Committed versus actual maintenance spend and where the variance sits.",
    cadence: "monthly",
    format: "XLSX",
    sections: [
      { id: "cost-summary", title: "Cost summary", description: "Committed, actual and variance for the period.", required: true },
      { id: "cost-by-type", title: "Cost by work type", description: "Where the money is being spent." },
      { id: "top-spend", title: "Largest exposures", description: "The work orders that dominate the bill." },
      { id: "penalties", title: "Availability penalties", description: "Liquidated damages accrued against contracted availability." },
    ],
  },
  {
    id: "compliance-status",
    name: "Compliance status",
    audience: "Regulator & quality",
    purpose: "Airworthiness directive and service bulletin embodiment, LLP position and evidence trail.",
    cadence: "quarterly",
    format: "PDF",
    sections: [
      { id: "ad-sb", title: "AD / SB embodiment", description: "Mandatory and recommended bulletins with embodiment progress.", required: true },
      { id: "compliance-exposure", title: "Compliance exposure", description: "Overdue mandatory work and hours required to clear it." },
      { id: "llp", title: "Life-limited parts", description: "Parts approaching or beyond their cyclic limit." },
      { id: "evidence", title: "Evidence trail", description: "Signed audit records supporting this statement." },
    ],
  },
];

export function getReportDefinition(reportId: ReportId): ReportDefinition {
  return REPORT_DEFINITIONS.find((r) => r.id === reportId) ?? REPORT_DEFINITIONS[0]!;
}

export const REPORT_PERIOD_IDS: ReportPeriodId[] = ["last-30-days", "last-90-days", "quarter-to-date", "last-12-months"];

export function resolveReportPeriod(periodId: ReportPeriodId, generatedAt: string): ReportPeriod {
  const to = new Date(generatedAt);
  const quarterStart = new Date(Date.UTC(to.getUTCFullYear(), Math.floor(to.getUTCMonth() / 3) * 3, 1));
  const spec: Record<ReportPeriodId, { label: string; from: Date }> = {
    "last-30-days": { label: "Last 30 days", from: addDays(to, -30) },
    "last-90-days": { label: "Last 90 days", from: addDays(to, -90) },
    "quarter-to-date": { label: "Quarter to date", from: quarterStart },
    "last-12-months": { label: "Last 12 months", from: addDays(to, -365) },
  };
  const { label, from } = spec[periodId];
  return {
    id: periodId,
    label,
    fromIso: iso(from),
    toIso: iso(to),
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)),
  };
}

export function defaultReportScope(reportId: ReportId = "operator-monthly-review", operatorId = "all"): ReportScope {
  const def = getReportDefinition(reportId);
  return {
    reportId,
    operatorId,
    family: "all",
    periodId: def.cadence === "quarterly" ? "last-90-days" : def.cadence === "weekly" ? "last-30-days" : "last-30-days",
    sectionIds: def.sections.map((s) => s.id),
  };
}

/* ------------------------------------------------------------------ */
/* Fact table                                                          */
/* ------------------------------------------------------------------ */

export function buildReportFacts(): ReportFacts {
  const d = getDataset();
  const aircraftById = new Map(d.aircraft.map((a) => [a.id, a]));
  const engineById = new Map(d.engines.map((e) => [e.id, e]));
  const contractByOperator = new Map(d.contracts.map((c) => [c.operatorId, c]));

  const engines: ReportEngineFact[] = d.engines.map((e) => ({
    id: e.id,
    esn: e.esn,
    family: e.family,
    operatorId: e.operatorId,
    tail: e.aircraftId ? (aircraftById.get(e.aircraftId)?.tail ?? null) : null,
    status: e.status,
    healthScore: e.healthScore,
    egtMargin: e.egtMargin,
    rulCycles: e.rulCycles,
    cyclesSinceOverhaul: e.cyclesSinceOverhaul,
    totalFlightHours: e.totalFlightHours,
    lifeStage: e.lifeStage,
    location: e.location,
  }));

  const alerts: ReportAlertFact[] = d.alerts.map((a) => {
    const engine = engineById.get(a.engineId);
    return {
      id: a.id,
      engineId: a.engineId,
      esn: engine?.esn ?? a.engineId,
      operatorId: a.operatorId,
      family: engine?.family ?? "Trent XWB-84",
      raisedAt: a.raisedAt,
      severity: a.severity,
      status: a.status,
      state: a.state,
      source: a.source,
      ataChapter: a.ataChapter,
      title: a.title,
      recommendedAction: a.recommendedAction,
      timeToActionHours: a.timeToActionHours,
    };
  });

  const workOrders: ReportWorkOrderFact[] = d.workOrders.map((w) => {
    const engine = engineById.get(w.engineId);
    return {
      id: w.id,
      reference: w.reference,
      operatorId: w.operatorId,
      engineId: w.engineId,
      esn: engine?.esn ?? w.engineId,
      family: engine?.family ?? "Trent XWB-84",
      type: w.type,
      state: w.state,
      status: w.status,
      raisedAt: w.raisedAt,
      scheduledStart: w.scheduledStart,
      tatDays: w.tatDays,
      estimatedCostUsd: w.estimatedCostUsd,
      actualCostUsd: w.actualCostUsd ?? null,
    };
  });

  const bulletins: ReportBulletinFact[] = d.serviceBulletins.map((sb) => {
    const byOperator: Record<string, { affected: number; embodied: number }> = {};
    const embodied = new Set(sb.embodiedEngineIds);
    for (const engineId of sb.affectedEngineIds) {
      const operatorId = engineById.get(engineId)?.operatorId;
      if (!operatorId) continue;
      const entry = (byOperator[operatorId] ??= { affected: 0, embodied: 0 });
      entry.affected += 1;
      if (embodied.has(engineId)) entry.embodied += 1;
    }
    return {
      id: sb.id,
      reference: sb.reference,
      kind: sb.kind,
      title: sb.title,
      family: sb.family,
      mandatory: sb.mandatory,
      complianceDueAt: sb.complianceDueAt,
      estimatedHoursPerEngine: sb.estimatedHoursPerEngine,
      byOperator,
    };
  });

  const llps: ReportLlpFact[] = d.llps
    .filter((l) => l.status !== "green")
    .map((l) => {
      const engine = engineById.get(l.engineId);
      return {
        id: l.id,
        engineId: l.engineId,
        esn: engine?.esn ?? l.engineId,
        operatorId: engine?.operatorId ?? "",
        family: engine?.family ?? "Trent XWB-84",
        partNumber: l.partNumber,
        cyclesRemaining: l.cyclesRemaining,
        projectedExpiryDate: l.projectedExpiryDate,
        status: l.status,
      };
    })
    .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining)
    .slice(0, 120);

  const monthKey = new Map<string, ReportFlightMonthFact>();
  for (const flight of d.flights) {
    const month = flight.departedAt.slice(0, 7);
    const key = `${flight.operatorId}:${month}`;
    const entry = monthKey.get(key) ?? { operatorId: flight.operatorId, month, flights: 0, blockHours: 0, fuelBurnKg: 0 };
    entry.flights += 1;
    entry.blockHours += flight.blockHours;
    entry.fuelBurnKg += flight.fuelBurnKg;
    monthKey.set(key, entry);
  }
  const flightMonths = [...monthKey.values()]
    .map((m) => ({ ...m, blockHours: round(m.blockHours, 0), fuelBurnKg: round(m.fuelBurnKg, 0) }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  const audit: ReportAuditFact[] = d.auditLog.slice(0, 60).map((a) => ({
    id: a.id,
    at: a.at,
    actor: a.actor,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
  }));

  return {
    generatedAt: d.generatedAt,
    operators: d.operators.map((o) => {
      const contract = contractByOperator.get(o.id);
      return {
        id: o.id,
        code: o.code,
        name: o.name,
        region: o.region,
        homeBase: o.homeBase,
        contractKind: contract?.kind ?? "Time & Materials",
        availabilityTarget: contract?.availabilityTarget ?? 0,
        availabilityActual: contract?.availabilityActual ?? 0,
        penaltiesUsd: contract?.penaltiesUsd ?? 0,
        ratePerEfhUsd: contract?.ratePerEfhUsd ?? 0,
        contractStatus: contract?.status ?? "grey",
        contractEndsAt: contract?.endsAt ?? d.generatedAt,
      };
    }),
    engines,
    alerts,
    workOrders,
    bulletins,
    llps,
    flightMonths,
    audit,
    kpis: d.kpis,
    aircraftCount: d.aircraft.length,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (locale-free so server and client agree)         */
/* ------------------------------------------------------------------ */

function num(value: number, dp = 0): string {
  const fixed = value.toFixed(dp);
  const [whole, frac] = fixed.split(".");
  return (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
}

function usd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${num(value / 1_000_000, 1)}m`;
  if (Math.abs(value) >= 1_000) return `$${num(value / 1_000, 0)}k`;
  return `$${num(value, 0)}`;
}

function shortDate(isoDate: string): string {
  const d = new Date(isoDate);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1] ?? m} ${year?.slice(2) ?? ""}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Scoping                                                             */
/* ------------------------------------------------------------------ */

interface ScopedFacts {
  period: ReportPeriod;
  operatorIds: Set<string>;
  operators: ReportFacts["operators"];
  engines: ReportEngineFact[];
  alerts: ReportAlertFact[];
  alertsInPeriod: ReportAlertFact[];
  workOrders: ReportWorkOrderFact[];
  workOrdersInPeriod: ReportWorkOrderFact[];
  bulletins: (ReportBulletinFact & { affected: number; embodied: number; status: StatusLevel })[];
  llps: ReportLlpFact[];
  flightMonths: ReportFlightMonthFact[];
  audit: ReportAuditFact[];
  scopeLabel: string;
}

function inPeriod(at: string, period: ReportPeriod): boolean {
  return at >= period.fromIso && at <= period.toIso;
}

/** A calendar month counts towards the period if any day of it falls inside the window. */
function monthOverlapsPeriod(month: string, period: ReportPeriod): boolean {
  const [year, index] = month.split("-").map(Number);
  const start = iso(new Date(Date.UTC(year!, index! - 1, 1)));
  const end = iso(new Date(Date.UTC(year!, index!, 0, 23, 59, 59, 999)));
  return end >= period.fromIso && start <= period.toIso;
}

function scopeFacts(facts: ReportFacts, scope: ReportScope): ScopedFacts {
  const period = resolveReportPeriod(scope.periodId, facts.generatedAt);
  const operators = scope.operatorId === "all" ? facts.operators : facts.operators.filter((o) => o.id === scope.operatorId);
  const operatorIds = new Set(operators.map((o) => o.id));
  const familyMatch = (family: EngineFamily) => scope.family === "all" || family === scope.family;

  const engines = facts.engines.filter((e) => operatorIds.has(e.operatorId) && familyMatch(e.family));
  const engineIds = new Set(engines.map((e) => e.id));
  const alerts = facts.alerts.filter((a) => engineIds.has(a.engineId));
  const workOrders = facts.workOrders.filter((w) => engineIds.has(w.engineId));
  const llps = facts.llps.filter((l) => engineIds.has(l.engineId));

  const bulletins = facts.bulletins
    .filter((b) => scope.family === "all" || b.family === scope.family)
    .map((b) => {
      let affected = 0;
      let embodied = 0;
      for (const [operatorId, counts] of Object.entries(b.byOperator)) {
        if (!operatorIds.has(operatorId)) continue;
        affected += counts.affected;
        embodied += counts.embodied;
      }
      const overdue = b.complianceDueAt < facts.generatedAt && embodied < affected;
      const ratio = affected === 0 ? 1 : embodied / affected;
      const status: StatusLevel = affected === 0 ? "grey" : overdue ? "red" : ratio < 0.6 ? "amber" : "green";
      return { ...b, affected, embodied, status };
    })
    .filter((b) => b.affected > 0);

  const scopeLabel =
    (scope.operatorId === "all" ? "All managed operators" : (operators[0]?.name ?? scope.operatorId)) +
    (scope.family === "all" ? "" : ` · ${scope.family}`);

  return {
    period,
    operatorIds,
    operators,
    engines,
    alerts,
    alertsInPeriod: alerts.filter((a) => inPeriod(a.raisedAt, period)),
    workOrders,
    workOrdersInPeriod: workOrders.filter((w) => inPeriod(w.raisedAt, period)),
    bulletins,
    llps,
    flightMonths: facts.flightMonths.filter((m) => operatorIds.has(m.operatorId) && monthOverlapsPeriod(m.month, period)),
    audit: facts.audit.filter((a) => inPeriod(a.at, period)),
    scopeLabel,
  };
}

function statusMix(engines: ReportEngineFact[]) {
  const mix = { red: 0, amber: 0, green: 0, grey: 0 } as Record<StatusLevel, number>;
  for (const engine of engines) mix[engine.status] += 1;
  return mix;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/* ------------------------------------------------------------------ */
/* Section builders                                                    */
/* ------------------------------------------------------------------ */

function metric(label: string, value: string, status: StatusLevel, caption?: string, unit?: string): ReportMetric {
  return { label, value, status, caption, unit };
}

function row(key: string, status: StatusLevel, cells: Record<string, string>): ReportTableRow {
  return { key, status, cells };
}

function fleetStatusSection(s: ScopedFacts): ReportSection {
  const mix = statusMix(s.engines);
  const avgHealth = round(mean(s.engines.map((e) => e.healthScore)), 0);
  const avgEgt = round(mean(s.engines.map((e) => e.egtMargin)), 1);
  return {
    id: "fleet-status",
    title: "Fleet status",
    description: "Red/amber/green mix and headline health indices.",
    metrics: [
      metric("Engines in scope", num(s.engines.length), "grey"),
      metric("Red", num(mix.red), mix.red > 0 ? "red" : "green", "Action required now"),
      metric("Amber", num(mix.amber), mix.amber > 0 ? "amber" : "green", "On watchlist"),
      metric("Green", num(mix.green), "green", "Within limits"),
      metric("Mean health index", num(avgHealth), avgHealth < 55 ? "red" : avgHealth < 70 ? "amber" : "green"),
      metric("Mean EGT margin", `${num(avgEgt, 1)}°C`, avgEgt < 20 ? "red" : avgEgt < 32 ? "amber" : "green"),
    ],
    narrative: `${num(mix.red)} of ${num(s.engines.length)} engines in scope are red and carry a recommended action with a deadline. Mean EGT margin across the scope is ${num(avgEgt, 1)}°C.`,
    colourNote: "Red engines are those with a health index below 45 — each one has an open recommended action.",
  };
}

function watchlistSection(s: ScopedFacts): ReportSection {
  const openAlertsByEngine = new Map<string, number>();
  for (const alert of s.alerts) {
    if (alert.state === "closed" || alert.state === "false-positive") continue;
    openAlertsByEngine.set(alert.engineId, (openAlertsByEngine.get(alert.engineId) ?? 0) + 1);
  }
  const rows = [...s.engines]
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 10)
    .map((e) =>
      row(e.id, e.status, {
        esn: e.esn,
        family: e.family,
        tail: e.tail ?? "off wing",
        egtMargin: `${num(e.egtMargin, 1)}°C`,
        health: num(e.healthScore),
        rul: num(e.rulCycles),
        alerts: num(openAlertsByEngine.get(e.id) ?? 0),
      }),
    );
  return {
    id: "watchlist",
    title: "Engine watchlist",
    description: "Lowest health scores with the action each one needs.",
    columns: [
      { key: "esn", label: "ESN" },
      { key: "family", label: "Family" },
      { key: "tail", label: "Tail" },
      { key: "egtMargin", label: "EGT margin", align: "right" },
      { key: "health", label: "Health", align: "right" },
      { key: "rul", label: "Cycles left", align: "right" },
      { key: "alerts", label: "Open findings", align: "right" },
    ],
    rows,
    colourNote: "Row colour follows the engine's own status; red rows breach the removal-planning threshold.",
  };
}

function alertSourcesSection(s: ScopedFacts): ReportSection {
  const bySource = new Map<string, { total: number; critical: number }>();
  for (const alert of s.alertsInPeriod) {
    const entry = bySource.get(alert.source) ?? { total: 0, critical: 0 };
    entry.total += 1;
    if (alert.severity === "critical") entry.critical += 1;
    bySource.set(alert.source, entry);
  }
  const total = s.alertsInPeriod.length || 1;
  const rows = [...bySource.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([source, counts]) =>
      row(source, counts.critical > 0 ? "red" : counts.total > total * 0.2 ? "amber" : "green", {
        source,
        total: num(counts.total),
        critical: num(counts.critical),
        share: `${num((counts.total / total) * 100, 0)}%`,
      }),
    );
  return {
    id: "alert-sources",
    title: "Detection sources",
    description: "Where this period's findings came from.",
    columns: [
      { key: "source", label: "Source" },
      { key: "total", label: "Findings", align: "right" },
      { key: "critical", label: "Critical", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows,
    colourNote: "A source is red when it raised at least one critical finding in the period.",
  };
}

function kpiTrendSection(facts: ReportFacts): ReportSection {
  const wanted = ["kpi-dispatch", "kpi-availability", "kpi-ifsd", "kpi-red-engines"];
  return {
    id: "kpi-trend",
    title: "Performance indicators",
    description: "Dispatch, availability and IFSD against target.",
    metrics: facts.kpis
      .filter((k) => wanted.includes(k.id))
      .map((k) => metric(k.label, `${num(k.value, k.unit === "%" ? 2 : k.value < 1 ? 3 : 0)}`, k.status, `Target ${num(k.target, k.unit === "%" ? 2 : k.target < 1 ? 3 : 0)} ${k.unit}`, k.unit)),
  };
}

function contractPerformanceSection(s: ScopedFacts): ReportSection {
  const rows = s.operators.map((o) => {
    const gap = round(o.availabilityActual - o.availabilityTarget, 2);
    return row(o.id, o.contractStatus, {
      operator: o.name,
      contract: o.contractKind,
      target: `${num(o.availabilityTarget, 2)}%`,
      actual: `${num(o.availabilityActual, 2)}%`,
      gap: `${gap > 0 ? "+" : ""}${num(gap, 2)} pts`,
      penalties: usd(o.penaltiesUsd),
      rate: `$${num(o.ratePerEfhUsd, 2)}`,
    });
  });
  const penalties = s.operators.reduce((sum, o) => sum + o.penaltiesUsd, 0);
  const shortfall = s.operators.filter((o) => o.availabilityActual < o.availabilityTarget).length;
  return {
    id: "contract-performance",
    title: "Contract performance",
    description: "Availability against commitment and any liquidated damages.",
    metrics: [
      metric("Operators below commitment", num(shortfall), shortfall > 0 ? "red" : "green", `of ${num(s.operators.length)} in scope`),
      metric("Liquidated damages", usd(penalties), penalties > 0 ? "red" : "green", "Accrued this period"),
      metric(
        "Mean availability",
        `${num(mean(s.operators.map((o) => o.availabilityActual)), 2)}%`,
        mean(s.operators.map((o) => o.availabilityActual - o.availabilityTarget)) < 0 ? "amber" : "green",
      ),
    ],
    columns: [
      { key: "operator", label: "Operator" },
      { key: "contract", label: "Contract" },
      { key: "target", label: "Target", align: "right" },
      { key: "actual", label: "Actual", align: "right" },
      { key: "gap", label: "Gap", align: "right" },
      { key: "penalties", label: "Penalties", align: "right" },
      { key: "rate", label: "$/EFH", align: "right" },
    ],
    rows,
    colourNote: "Red means availability is more than 0.8 points below the contracted commitment, so damages accrue.",
  };
}

function utilisationSection(s: ScopedFacts): ReportSection {
  const byMonth = new Map<string, { flights: number; blockHours: number; fuelBurnKg: number }>();
  for (const m of s.flightMonths) {
    const entry = byMonth.get(m.month) ?? { flights: 0, blockHours: 0, fuelBurnKg: 0 };
    entry.flights += m.flights;
    entry.blockHours += m.blockHours;
    entry.fuelBurnKg += m.fuelBurnKg;
    byMonth.set(m.month, entry);
  }
  const rows = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) =>
      row(month, "grey", {
        month: monthLabel(month),
        flights: num(v.flights),
        blockHours: num(v.blockHours),
        avgSector: `${num(v.flights === 0 ? 0 : v.blockHours / v.flights, 1)} h`,
        fuel: `${num(v.fuelBurnKg / 1000, 0)} t`,
      }),
    );
  const totalHours = [...byMonth.values()].reduce((sum, v) => sum + v.blockHours, 0);
  const totalFlights = [...byMonth.values()].reduce((sum, v) => sum + v.flights, 0);
  return {
    id: "utilisation",
    title: "Utilisation",
    description: "Sectors, block hours and fuel burn by month.",
    metrics: [
      metric("Sectors flown", num(totalFlights), "grey", "In period"),
      metric("Block hours", num(totalHours), "grey", "In period"),
      metric("Hours per engine", num(s.engines.length === 0 ? 0 : totalHours / s.engines.length, 0), "grey"),
    ],
    columns: [
      { key: "month", label: "Month" },
      { key: "flights", label: "Sectors", align: "right" },
      { key: "blockHours", label: "Block hours", align: "right" },
      { key: "avgSector", label: "Mean sector", align: "right" },
      { key: "fuel", label: "Fuel burn", align: "right" },
    ],
    rows,
    colourNote: "Utilisation is reported without status colour — it is context, not a condition.",
  };
}

function eventsSection(s: ScopedFacts): ReportSection {
  const severities = ["critical", "high", "medium", "low"] as const;
  const counts = severities.map((sev) => s.alertsInPeriod.filter((a) => a.severity === sev).length);
  const rows = [...s.alertsInPeriod]
    .sort((a, b) => severityRankLocal(b.severity) - severityRankLocal(a.severity) || (a.raisedAt < b.raisedAt ? 1 : -1))
    .slice(0, 12)
    .map((a) =>
      row(a.id, a.status, {
        raised: shortDate(a.raisedAt),
        esn: a.esn,
        finding: a.title,
        ata: a.ataChapter,
        severity: a.severity,
        state: a.state,
        action: a.recommendedAction,
      }),
    );
  return {
    id: "events",
    title: "Events in period",
    description: "Alerts raised, by severity, with the disposition of each.",
    metrics: severities.map((sev, i) =>
      metric(
        `${sev[0]!.toUpperCase()}${sev.slice(1)}`,
        num(counts[i] ?? 0),
        sev === "critical" ? ((counts[i] ?? 0) > 0 ? "red" : "green") : sev === "high" ? "amber" : "grey",
      ),
    ),
    columns: [
      { key: "raised", label: "Raised" },
      { key: "esn", label: "ESN" },
      { key: "finding", label: "Finding" },
      { key: "ata", label: "ATA", align: "right" },
      { key: "severity", label: "Severity" },
      { key: "state", label: "State" },
      { key: "action", label: "Recommended action" },
    ],
    rows,
    colourNote: "Red rows are critical findings — each requires disposition inside 48 hours.",
  };
}

function severityRankLocal(severity: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function maintenanceSection(s: ScopedFacts): ReportSection {
  const rows = [...s.workOrdersInPeriod]
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, 12)
    .map((w) =>
      row(w.id, w.status, {
        reference: w.reference,
        esn: w.esn,
        type: w.type.replace(/-/g, " "),
        state: w.state.replace(/-/g, " "),
        start: shortDate(w.scheduledStart),
        tat: `${num(w.tatDays)} d`,
        cost: usd(w.actualCostUsd ?? w.estimatedCostUsd),
      }),
    );
  const awaitingParts = s.workOrdersInPeriod.filter((w) => w.state === "awaiting-parts").length;
  const completed = s.workOrdersInPeriod.filter((w) => w.state === "complete").length;
  return {
    id: "maintenance",
    title: "Maintenance activity",
    description: "Work orders raised, in work and completed in the period.",
    metrics: [
      metric("Raised in period", num(s.workOrdersInPeriod.length), "grey"),
      metric("Completed", num(completed), "green"),
      metric("Awaiting parts", num(awaitingParts), awaitingParts > 0 ? "amber" : "green", "Blocked on supply"),
    ],
    columns: [
      { key: "reference", label: "Work order" },
      { key: "esn", label: "ESN" },
      { key: "type", label: "Type" },
      { key: "state", label: "State" },
      { key: "start", label: "Start" },
      { key: "tat", label: "TAT", align: "right" },
      { key: "cost", label: "Cost", align: "right" },
    ],
    rows,
    colourNote: "Red rows are critical-priority work orders; amber rows are open or blocked on parts.",
  };
}

function agreedActionsSection(s: ScopedFacts, findings: ReportFinding[]): ReportSection {
  const rows = findings.map((f, i) =>
    row(f.id, f.status, {
      ref: `A-${String(i + 1).padStart(2, "0")}`,
      finding: f.title,
      detail: f.detail,
      action: f.action,
      owner: f.status === "red" ? "Rolls-Royce fleet services" : "Joint review",
      due: shortDate(iso(addDays(new Date(s.period.toIso), f.status === "red" ? 7 : 30))),
    }),
  );
  return {
    id: "agreed-actions",
    title: "Agreed actions",
    description: "What Rolls-Royce and the operator each owe before next review.",
    columns: [
      { key: "ref", label: "Ref" },
      { key: "finding", label: "Finding" },
      { key: "detail", label: "Detail" },
      { key: "action", label: "Agreed action" },
      { key: "owner", label: "Owner" },
      { key: "due", label: "Due" },
    ],
    rows,
    colourNote: "Red actions are commitments due inside seven days of the review.",
  };
}

function reliabilityKpiSection(facts: ReportFacts, s: ScopedFacts): ReportSection {
  const wanted = ["kpi-ifsd", "kpi-mtbur", "kpi-unscheduled", "kpi-dispatch"];
  const removals = s.workOrdersInPeriod.filter((w) => w.type === "shop-visit" || w.type === "module-swap").length;
  return {
    id: "reliability-kpis",
    title: "Reliability indicators",
    description: "IFSD rate, MTBUR and unscheduled removals.",
    metrics: [
      ...facts.kpis
        .filter((k) => wanted.includes(k.id))
        .map((k) => metric(k.label, num(k.value, k.value < 1 ? 3 : 0), k.status, `Target ${num(k.target, k.target < 1 ? 3 : 0)} ${k.unit}`, k.unit)),
      metric("Removals in period", num(removals), removals > 6 ? "amber" : "green", "Shop visits and module swaps"),
    ],
    colourNote: "Indicator colour is the platform KPI status: red where the measure is outside its contractual target.",
  };
}

function failureModesSection(s: ScopedFacts): ReportSection {
  const byAta = new Map<string, { total: number; critical: number; example: string }>();
  for (const alert of s.alertsInPeriod) {
    const entry = byAta.get(alert.ataChapter) ?? { total: 0, critical: 0, example: alert.title };
    entry.total += 1;
    if (alert.severity === "critical") entry.critical += 1;
    byAta.set(alert.ataChapter, entry);
  }
  const total = s.alertsInPeriod.length || 1;
  const rows = [...byAta.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([ata, v]) =>
      row(ata, v.critical > 0 ? "red" : v.total / total > 0.15 ? "amber" : "green", {
        ata: `ATA ${ata}`,
        mode: v.example.split(" — ")[0] ?? v.example,
        findings: num(v.total),
        critical: num(v.critical),
        share: `${num((v.total / total) * 100, 0)}%`,
      }),
    );
  return {
    id: "failure-modes",
    title: "Dominant failure modes",
    description: "Findings grouped by ATA chapter.",
    columns: [
      { key: "ata", label: "Chapter" },
      { key: "mode", label: "Representative mode" },
      { key: "findings", label: "Findings", align: "right" },
      { key: "critical", label: "Critical", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows,
    colourNote: "Red chapters contain at least one critical finding; amber chapters account for more than 15% of findings.",
  };
}

function removalsSection(s: ScopedFacts): ReportSection {
  const rows = s.workOrders
    .filter((w) => w.type === "shop-visit" || w.type === "module-swap" || w.type === "aog-recovery")
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))
    .slice(0, 10)
    .map((w) =>
      row(w.id, w.status, {
        reference: w.reference,
        esn: w.esn,
        family: w.family,
        type: w.type.replace(/-/g, " "),
        start: shortDate(w.scheduledStart),
        tat: `${num(w.tatDays)} d`,
        state: w.state.replace(/-/g, " "),
      }),
    );
  return {
    id: "removals",
    title: "Removals & shop visits",
    description: "Engine removals driving the reliability position.",
    columns: [
      { key: "reference", label: "Work order" },
      { key: "esn", label: "ESN" },
      { key: "family", label: "Family" },
      { key: "type", label: "Type" },
      { key: "start", label: "Start" },
      { key: "tat", label: "TAT", align: "right" },
      { key: "state", label: "State" },
    ],
    rows,
    colourNote: "Red removals are critical-priority — they are on the AOG recovery or unplanned removal path.",
  };
}

function alertAgeingSection(s: ScopedFacts): ReportSection {
  const open = s.alerts.filter((a) => a.state !== "closed" && a.state !== "false-positive");
  const buckets = [
    { id: "0-7", label: "0–7 days", min: 0, max: 7 },
    { id: "8-30", label: "8–30 days", min: 8, max: 30 },
    { id: "31-60", label: "31–60 days", min: 31, max: 60 },
    { id: "60+", label: "Over 60 days", min: 61, max: Number.POSITIVE_INFINITY },
  ];
  const rows = buckets.map((bucket) => {
    const items = open.filter((a) => {
      const age = daysBetween(a.raisedAt, s.period.toIso);
      return age >= bucket.min && age <= bucket.max;
    });
    const critical = items.filter((a) => a.severity === "critical").length;
    return row(bucket.id, items.length === 0 ? "green" : bucket.min > 30 || critical > 0 ? "red" : bucket.min > 7 ? "amber" : "grey", {
      age: bucket.label,
      findings: num(items.length),
      critical: num(critical),
      oldest: items.length === 0 ? "—" : shortDate([...items].sort((a, b) => (a.raisedAt < b.raisedAt ? -1 : 1))[0]!.raisedAt),
    });
  });
  return {
    id: "alert-ageing",
    title: "Finding ageing",
    description: "How long open findings have been outstanding.",
    columns: [
      { key: "age", label: "Age band" },
      { key: "findings", label: "Open findings", align: "right" },
      { key: "critical", label: "Critical", align: "right" },
      { key: "oldest", label: "Oldest raised" },
    ],
    rows,
    colourNote: "Anything open beyond 30 days is red: it has breached the fleet-services disposition standard.",
  };
}

function costSummarySection(s: ScopedFacts): ReportSection {
  const committed = s.workOrdersInPeriod.reduce((sum, w) => sum + w.estimatedCostUsd, 0);
  const actual = s.workOrdersInPeriod.reduce((sum, w) => sum + (w.actualCostUsd ?? 0), 0);
  const closed = s.workOrdersInPeriod.filter((w) => w.actualCostUsd !== null);
  const closedEstimate = closed.reduce((sum, w) => sum + w.estimatedCostUsd, 0);
  const variance = actual - closedEstimate;
  const blockHours = s.flightMonths.reduce((sum, m) => sum + m.blockHours, 0);
  const costPerEfh = blockHours === 0 ? 0 : committed / blockHours;
  return {
    id: "cost-summary",
    title: "Cost summary",
    description: "Committed, actual and variance for the period.",
    metrics: [
      metric("Committed", usd(committed), "grey", `${num(s.workOrdersInPeriod.length)} work orders`),
      metric("Actual (closed)", usd(actual), "grey", `${num(closed.length)} closed`),
      metric(
        "Variance",
        `${variance > 0 ? "+" : ""}${usd(variance)}`,
        variance > closedEstimate * 0.1 ? "red" : variance > 0 ? "amber" : "green",
        "Actual against estimate on closed work",
      ),
      metric("Cost per block hour", `$${num(costPerEfh, 0)}`, costPerEfh > 400 ? "amber" : "green"),
    ],
    colourNote: "Variance is red when closed work has overrun its estimate by more than 10%.",
  };
}

function costByTypeSection(s: ScopedFacts): ReportSection {
  const byType = new Map<string, { count: number; estimate: number; actual: number }>();
  for (const w of s.workOrdersInPeriod) {
    const entry = byType.get(w.type) ?? { count: 0, estimate: 0, actual: 0 };
    entry.count += 1;
    entry.estimate += w.estimatedCostUsd;
    entry.actual += w.actualCostUsd ?? 0;
    byType.set(w.type, entry);
  }
  const rows = [...byType.entries()]
    .sort((a, b) => b[1].estimate - a[1].estimate)
    .map(([type, v]) => {
      const variancePct = v.actual === 0 ? 0 : ((v.actual - v.estimate) / Math.max(1, v.estimate)) * 100;
      return row(type, v.actual > v.estimate * 1.1 ? "red" : v.actual > v.estimate ? "amber" : "green", {
        type: type.replace(/-/g, " "),
        count: num(v.count),
        estimate: usd(v.estimate),
        actual: v.actual === 0 ? "—" : usd(v.actual),
        variance: v.actual === 0 ? "—" : `${variancePct > 0 ? "+" : ""}${num(variancePct, 1)}%`,
      });
    });
  return {
    id: "cost-by-type",
    title: "Cost by work type",
    description: "Where the money is being spent.",
    columns: [
      { key: "type", label: "Work type" },
      { key: "count", label: "Orders", align: "right" },
      { key: "estimate", label: "Estimate", align: "right" },
      { key: "actual", label: "Actual", align: "right" },
      { key: "variance", label: "Variance", align: "right" },
    ],
    rows,
    colourNote: "Red work types have overrun their estimate by more than 10% on closed orders.",
  };
}

function topSpendSection(s: ScopedFacts): ReportSection {
  const rows = [...s.workOrders]
    .sort((a, b) => (b.actualCostUsd ?? b.estimatedCostUsd) - (a.actualCostUsd ?? a.estimatedCostUsd))
    .slice(0, 10)
    .map((w) =>
      row(w.id, w.status, {
        reference: w.reference,
        esn: w.esn,
        type: w.type.replace(/-/g, " "),
        state: w.state.replace(/-/g, " "),
        estimate: usd(w.estimatedCostUsd),
        actual: w.actualCostUsd === null ? "—" : usd(w.actualCostUsd),
      }),
    );
  return {
    id: "top-spend",
    title: "Largest exposures",
    description: "The work orders that dominate the bill.",
    columns: [
      { key: "reference", label: "Work order" },
      { key: "esn", label: "ESN" },
      { key: "type", label: "Type" },
      { key: "state", label: "State" },
      { key: "estimate", label: "Estimate", align: "right" },
      { key: "actual", label: "Actual", align: "right" },
    ],
    rows,
    colourNote: "Row colour is the work order's own status — red is critical priority.",
  };
}

function penaltiesSection(s: ScopedFacts): ReportSection {
  const rows = [...s.operators]
    .sort((a, b) => b.penaltiesUsd - a.penaltiesUsd)
    .map((o) =>
      row(o.id, o.penaltiesUsd > 0 ? (o.contractStatus === "red" ? "red" : "amber") : "green", {
        operator: o.name,
        contract: o.contractKind,
        shortfall: `${num(round(o.availabilityActual - o.availabilityTarget, 2), 2)} pts`,
        penalties: usd(o.penaltiesUsd),
        endsAt: shortDate(o.contractEndsAt),
      }),
    );
  return {
    id: "penalties",
    title: "Availability penalties",
    description: "Liquidated damages accrued against contracted availability.",
    columns: [
      { key: "operator", label: "Operator" },
      { key: "contract", label: "Contract" },
      { key: "shortfall", label: "Availability gap", align: "right" },
      { key: "penalties", label: "Damages", align: "right" },
      { key: "endsAt", label: "Contract ends" },
    ],
    rows,
    colourNote: "Red operators are more than 0.8 points below commitment and are accruing damages every month.",
  };
}

function adSbSection(s: ScopedFacts): ReportSection {
  const rows = [...s.bulletins]
    .sort((a, b) => (a.complianceDueAt < b.complianceDueAt ? -1 : 1))
    .slice(0, 12)
    .map((b) =>
      row(b.id, b.status, {
        reference: b.reference,
        kind: b.kind,
        title: b.title,
        family: b.family,
        due: shortDate(b.complianceDueAt),
        embodiment: `${num(b.embodied)} / ${num(b.affected)}`,
        compliance: `${num((b.embodied / Math.max(1, b.affected)) * 100, 0)}%`,
      }),
    );
  return {
    id: "ad-sb",
    title: "AD / SB embodiment",
    description: "Mandatory and recommended bulletins with embodiment progress.",
    columns: [
      { key: "reference", label: "Reference" },
      { key: "kind", label: "Type" },
      { key: "title", label: "Title" },
      { key: "family", label: "Family" },
      { key: "due", label: "Due" },
      { key: "embodiment", label: "Embodied", align: "right" },
      { key: "compliance", label: "Compliance", align: "right" },
    ],
    rows,
    colourNote: "Red bulletins are past their compliance date with engines still un-embodied.",
  };
}

function complianceExposureSection(s: ScopedFacts): ReportSection {
  const overdue = s.bulletins.filter((b) => b.status === "red");
  const dueSoon = s.bulletins.filter((b) => b.status !== "red" && daysBetween(s.period.toIso, b.complianceDueAt) <= 90 && b.embodied < b.affected);
  const outstandingEngines = s.bulletins.reduce((sum, b) => sum + (b.affected - b.embodied), 0);
  const hours = s.bulletins.reduce((sum, b) => sum + (b.affected - b.embodied) * b.estimatedHoursPerEngine, 0);
  return {
    id: "compliance-exposure",
    title: "Compliance exposure",
    description: "Overdue mandatory work and hours required to clear it.",
    metrics: [
      metric("Overdue bulletins", num(overdue.length), overdue.length > 0 ? "red" : "green", "Past compliance date"),
      metric("Due within 90 days", num(dueSoon.length), dueSoon.length > 0 ? "amber" : "green"),
      metric("Engines outstanding", num(outstandingEngines), outstandingEngines > 0 ? "amber" : "green"),
      metric("Labour to clear", `${num(hours, 0)} h`, hours > 2000 ? "amber" : "green", "Estimated, all outstanding engines"),
    ],
    narrative:
      overdue.length > 0
        ? `${num(overdue.length)} bulletin(s) are past their compliance date for this scope and must be included in the regulator submission with a recovery plan.`
        : "No bulletin in this scope is past its compliance date.",
    colourNote: "Red exposure means a mandatory bulletin is past its due date on at least one in-scope engine.",
  };
}

function llpSection(s: ScopedFacts): ReportSection {
  const rows = [...s.llps]
    .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining)
    .slice(0, 12)
    .map((l) =>
      row(l.id, l.status, {
        esn: l.esn,
        part: l.partNumber,
        family: l.family,
        remaining: num(l.cyclesRemaining),
        expiry: shortDate(l.projectedExpiryDate),
      }),
    );
  const red = s.llps.filter((l) => l.status === "red").length;
  return {
    id: "llp",
    title: "Life-limited parts",
    description: "Parts approaching or beyond their cyclic limit.",
    metrics: [
      metric("Parts below 400 cycles", num(red), red > 0 ? "red" : "green", "Removal must be planned now"),
      metric("Parts on watch", num(s.llps.length - red), s.llps.length - red > 0 ? "amber" : "green", "Below 1,500 cycles remaining"),
    ],
    columns: [
      { key: "esn", label: "ESN" },
      { key: "part", label: "Part number" },
      { key: "family", label: "Family" },
      { key: "remaining", label: "Cycles left", align: "right" },
      { key: "expiry", label: "Projected expiry" },
    ],
    rows,
    colourNote: "Red parts have fewer than 400 cycles remaining — the engine cannot be released beyond that limit.",
  };
}

function evidenceSection(s: ScopedFacts): ReportSection {
  const rows = s.audit.slice(0, 10).map((a) =>
    row(a.id, "grey", {
      at: shortDate(a.at),
      actor: a.actor,
      action: a.action,
      entity: `${a.entityType} ${a.entityId}`,
    }),
  );
  return {
    id: "evidence",
    title: "Evidence trail",
    description: "Signed audit records supporting this statement.",
    columns: [
      { key: "at", label: "Timestamp" },
      { key: "actor", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "entity", label: "Entity" },
    ],
    rows,
    colourNote: "Audit records carry no status colour; they are evidence, not condition.",
  };
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

function buildFindings(s: ScopedFacts): ReportFinding[] {
  const findings: ReportFinding[] = [];
  const mix = statusMix(s.engines);
  if (mix.red > 0) {
    const worst = [...s.engines].sort((a, b) => a.healthScore - b.healthScore)[0]!;
    findings.push({
      id: "finding-red-engines",
      status: "red",
      title: `${num(mix.red)} engine(s) flagged red`,
      detail: `Worst is ${worst.esn} at health index ${num(worst.healthScore)} with ${num(worst.egtMargin, 1)}°C EGT margin.`,
      action: "Include the removal plan for each red engine and confirm slot dates with the operator.",
    });
  }
  const shortfall = s.operators.filter((o) => o.availabilityActual < o.availabilityTarget);
  if (shortfall.length > 0) {
    const worst = [...shortfall].sort((a, b) => a.availabilityActual - a.availabilityTarget - (b.availabilityActual - b.availabilityTarget))[0]!;
    findings.push({
      id: "finding-availability",
      status: worst.contractStatus === "red" ? "red" : "amber",
      title: `${num(shortfall.length)} operator(s) below availability commitment`,
      detail: `${worst.name} is at ${num(worst.availabilityActual, 2)}% against a ${num(worst.availabilityTarget, 2)}% target, with ${usd(worst.penaltiesUsd)} accrued.`,
      action: "Attach the availability recovery appendix and the damages calculation to the pack.",
    });
  }
  const overdueSb = s.bulletins.filter((b) => b.status === "red");
  if (overdueSb.length > 0) {
    findings.push({
      id: "finding-compliance",
      status: "red",
      title: `${num(overdueSb.length)} bulletin(s) past compliance date`,
      detail: `${overdueSb[0]!.reference} — ${overdueSb[0]!.title}, due ${shortDate(overdueSb[0]!.complianceDueAt)}.`,
      action: "Add the compliance status report to the pack and record the agreed recovery date.",
    });
  }
  const staleAlerts = s.alerts.filter(
    (a) => a.state !== "closed" && a.state !== "false-positive" && daysBetween(a.raisedAt, s.period.toIso) > 30,
  );
  if (staleAlerts.length > 0) {
    findings.push({
      id: "finding-ageing",
      status: "amber",
      title: `${num(staleAlerts.length)} finding(s) open beyond 30 days`,
      detail: "Findings older than the disposition standard weaken the reliability narrative in the review.",
      action: "Close or re-baseline ageing findings before the pack is issued.",
    });
  }
  const awaitingParts = s.workOrders.filter((w) => w.state === "awaiting-parts");
  if (awaitingParts.length > 0) {
    findings.push({
      id: "finding-parts",
      status: "amber",
      title: `${num(awaitingParts.length)} work order(s) blocked on parts`,
      detail: "Supply delay is the dominant driver of turn-around time in this scope.",
      action: "Include the supply recovery position so the delay is not read as shop performance.",
    });
  }
  if (findings.length === 0) {
    findings.push({
      id: "finding-nominal",
      status: "green",
      title: "No exceptions in scope",
      detail: "Availability, compliance and engine condition are all within agreed limits for the period.",
      action: "Issue the standard pack without an exceptions appendix.",
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Document builder                                                    */
/* ------------------------------------------------------------------ */

export function buildReportDocument(facts: ReportFacts, scope: ReportScope): ReportDocument {
  const def = getReportDefinition(scope.reportId);
  const s = scopeFacts(facts, scope);
  const findings = buildFindings(s);
  const selected = new Set(scope.sectionIds.length > 0 ? scope.sectionIds : def.sections.map((x) => x.id));

  const builders: Record<string, () => ReportSection> = {
    "fleet-status": () => fleetStatusSection(s),
    watchlist: () => watchlistSection(s),
    "alert-sources": () => alertSourcesSection(s),
    "kpi-trend": () => kpiTrendSection(facts),
    "contract-performance": () => contractPerformanceSection(s),
    utilisation: () => utilisationSection(s),
    events: () => eventsSection(s),
    maintenance: () => maintenanceSection(s),
    "agreed-actions": () => agreedActionsSection(s, findings),
    "reliability-kpis": () => reliabilityKpiSection(facts, s),
    "failure-modes": () => failureModesSection(s),
    removals: () => removalsSection(s),
    "alert-ageing": () => alertAgeingSection(s),
    "cost-summary": () => costSummarySection(s),
    "cost-by-type": () => costByTypeSection(s),
    "top-spend": () => topSpendSection(s),
    penalties: () => penaltiesSection(s),
    "ad-sb": () => adSbSection(s),
    "compliance-exposure": () => complianceExposureSection(s),
    llp: () => llpSection(s),
    evidence: () => evidenceSection(s),
  };

  const sections = def.sections
    .filter((section) => section.required || selected.has(section.id))
    .map((section) => builders[section.id]!())
    .filter(Boolean);

  const mix = statusMix(s.engines);
  const tails = new Set(s.engines.map((e) => e.tail).filter((t): t is string => t !== null));
  const flights = s.flightMonths.reduce((sum, m) => sum + m.flights, 0);

  const headline: ReportMetric[] = [
    metric("Engines", num(s.engines.length), "grey", s.scopeLabel),
    metric("Red", num(mix.red), mix.red > 0 ? "red" : "green", "Action now"),
    metric("Amber", num(mix.amber), mix.amber > 0 ? "amber" : "green", "Watchlist"),
    metric("Findings in period", num(s.alertsInPeriod.length), s.alertsInPeriod.some((a) => a.severity === "critical") ? "red" : "amber"),
    metric("Committed spend", usd(s.workOrdersInPeriod.reduce((sum, w) => sum + w.estimatedCostUsd, 0)), "grey", "Work raised in period"),
  ];

  return {
    reportId: def.id,
    title: def.name,
    subtitle: def.purpose,
    scopeLabel: s.scopeLabel,
    periodLabel: `${s.period.label} · ${shortDate(s.period.fromIso)} to ${shortDate(s.period.toIso)}`,
    generatedAt: facts.generatedAt,
    coverage: { engines: s.engines.length, aircraft: tails.size, operators: s.operators.length, flights },
    headline,
    findings,
    sections,
  };
}

/* ------------------------------------------------------------------ */
/* Export helpers                                                      */
/* ------------------------------------------------------------------ */

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Flattens a rendered document into a single CSV, section by section. */
export function reportDocumentToCsv(doc: ReportDocument): string {
  const lines: string[] = [];
  lines.push(["Report", doc.title].map(csvCell).join(","));
  lines.push(["Scope", doc.scopeLabel].map(csvCell).join(","));
  lines.push(["Period", doc.periodLabel].map(csvCell).join(","));
  lines.push(["Generated", doc.generatedAt].map(csvCell).join(","));
  lines.push("");
  lines.push(["Headline", "Value", "Status"].join(","));
  for (const m of doc.headline) lines.push([m.label, m.value, m.status].map(csvCell).join(","));
  lines.push("");
  lines.push(["Finding", "Detail", "Action", "Status"].join(","));
  for (const f of doc.findings) lines.push([f.title, f.detail, f.action, f.status].map(csvCell).join(","));

  for (const section of doc.sections) {
    lines.push("");
    lines.push([section.title].map(csvCell).join(","));
    if (section.metrics && section.metrics.length > 0) {
      lines.push(["Metric", "Value", "Status"].join(","));
      for (const m of section.metrics) lines.push([m.label, m.value, m.status].map(csvCell).join(","));
    }
    if (section.columns && section.rows) {
      lines.push([...section.columns.map((c) => c.label), "Status"].map(csvCell).join(","));
      for (const r of section.rows) {
        lines.push([...section.columns.map((c) => r.cells[c.key] ?? ""), r.status].map(csvCell).join(","));
      }
    }
  }
  return lines.join("\n");
}

export function reportFileName(doc: ReportDocument): string {
  const slug = `${doc.reportId}-${doc.scopeLabel}-${doc.periodLabel.split(" · ")[0] ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}.csv`;
}

/* ------------------------------------------------------------------ */
/* Scheduled reports                                                   */
/* ------------------------------------------------------------------ */

const SCHEDULE_OWNERS = [
  "a.hughes@rolls-royce.com",
  "r.patel@rolls-royce.com",
  "m.silva@rolls-royce.com",
  "l.fischer@rolls-royce.com",
];

function cadenceDays(cadence: ReportCadence): number {
  return cadence === "weekly" ? 7 : cadence === "monthly" ? 30 : 91;
}

/**
 * The distribution list: which pack goes to which customer, how often, and
 * whether the last run actually landed.
 */
export function listScheduledReports(facts: ReportFacts = buildReportFacts()): ScheduledReport[] {
  const out: ScheduledReport[] = [];
  const now = new Date(facts.generatedAt);
  let n = 0;

  for (const operator of facts.operators) {
    const rng = createRng(`reports:${operator.id}`);
    const definitions = [
      getReportDefinition("operator-monthly-review"),
      getReportDefinition(rand.pick(rng, ["fleet-health-summary", "reliability-report", "cost-report", "compliance-status"] as ReportId[])),
    ];
    for (const def of definitions) {
      n += 1;
      const days = cadenceDays(def.cadence);
      const sinceLastRun = rand.int(rng, 0, days + 6);
      const lastRunAt = addDays(now, -sinceLastRun);
      const nextRunAt = addDays(lastRunAt, days);
      const overdue = nextRunAt < now;
      const failed = rand.bool(rng, 0.12);
      const running = sinceLastRun === 0;
      const lastRunStatus: ScheduleRunStatus = failed ? "failed" : overdue ? "late" : running ? "pending" : "delivered";
      const status: StatusLevel = failed ? "red" : overdue ? "amber" : running ? "grey" : "green";
      out.push({
        id: `RS-${String(n).padStart(3, "0")}`,
        reportId: def.id,
        name: `${operator.code} · ${def.name}`,
        operatorId: operator.id,
        operatorName: operator.name,
        cadence: def.cadence,
        format: def.format,
        recipients: [
          `fleet.${operator.code.toLowerCase()}@${operator.name.split(" ")[0]!.toLowerCase().replace(/[^a-z]/g, "")}.com`,
          rand.pick(rng, SCHEDULE_OWNERS),
        ],
        owner: rand.pick(rng, SCHEDULE_OWNERS),
        lastRunAt: iso(lastRunAt),
        nextRunAt: iso(overdue ? addDays(now, rand.int(rng, 0, 3)) : nextRunAt),
        lastRunStatus,
        status,
        note: failed
          ? "Delivery failed — recipient mailbox rejected the attachment size."
          : overdue
            ? "Run window missed while the fleet extract was rebuilding."
            : running
              ? "Run in progress — delivery not yet confirmed."
              : "Delivered on schedule.",
      });
    }
  }

  return out.sort((a, b) => (a.nextRunAt < b.nextRunAt ? -1 : 1));
}

export interface ReportsOverview {
  scheduled: number;
  failed: number;
  late: number;
  dueThisWeek: number;
  operatorsCovered: number;
  nextRunAt: string;
  exceptionsOpen: number;
}

export function reportsOverview(facts: ReportFacts, schedules: ScheduledReport[]): ReportsOverview {
  const weekEnd = iso(addDays(new Date(facts.generatedAt), 7));
  const exceptions = facts.engines.filter((e) => e.status === "red").length;
  return {
    scheduled: schedules.length,
    failed: schedules.filter((s) => s.lastRunStatus === "failed").length,
    late: schedules.filter((s) => s.lastRunStatus === "late").length,
    dueThisWeek: schedules.filter((s) => s.nextRunAt <= weekEnd).length,
    operatorsCovered: new Set(schedules.map((s) => s.operatorId)).size,
    nextRunAt: schedules[0]?.nextRunAt ?? iso(NOW),
    exceptionsOpen: exceptions,
  };
}
