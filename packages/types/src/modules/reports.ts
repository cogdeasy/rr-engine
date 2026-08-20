/**
 * Types for the Reports & exports module (`/assure/reports`).
 *
 * The module answers "what goes into this month's customer review pack?", so
 * the model is a report *definition* (what can be produced), a *scope* (who and
 * over what period) and a rendered *document* (the sections and values that end
 * up in the pack). Documents are built from a compact fact table so that the
 * same builder runs on the server and in the browser preview.
 */

import type { EngineFamily, Iso, KpiSnapshot, Region, StatusLevel } from "../index";

export type ReportId =
  | "fleet-health-summary"
  | "operator-monthly-review"
  | "reliability-report"
  | "cost-report"
  | "compliance-status";

export type ReportCadence = "weekly" | "monthly" | "quarterly";

export type ReportPeriodId = "last-30-days" | "last-90-days" | "quarter-to-date" | "last-12-months";

export interface ReportPeriod {
  id: ReportPeriodId;
  label: string;
  /** Inclusive window used to filter dated facts. */
  fromIso: Iso;
  toIso: Iso;
  days: number;
}

export interface ReportSectionDefinition {
  id: string;
  title: string;
  description: string;
  /** Sections marked required are always present in the pack. */
  required?: boolean;
}

export interface ReportDefinition {
  id: ReportId;
  name: string;
  audience: string;
  purpose: string;
  cadence: ReportCadence;
  /** Typical distribution format of the produced pack. */
  format: "PDF" | "CSV" | "XLSX";
  sections: ReportSectionDefinition[];
}

export interface ReportScope {
  reportId: ReportId;
  /** Operator id, or "all" for the whole managed fleet. */
  operatorId: string;
  /** Engine family, or "all". */
  family: EngineFamily | "all";
  periodId: ReportPeriodId;
  sectionIds: string[];
}

export interface ReportMetric {
  label: string;
  value: string;
  unit?: string;
  status: StatusLevel;
  caption?: string;
}

export interface ReportTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface ReportTableRow {
  key: string;
  status: StatusLevel;
  cells: Record<string, string>;
}

export interface ReportSection {
  id: string;
  title: string;
  description: string;
  metrics?: ReportMetric[];
  columns?: ReportTableColumn[];
  rows?: ReportTableRow[];
  narrative?: string;
  /** Why a red/amber row appears in this section, in one sentence. */
  colourNote?: string;
}

export interface ReportFinding {
  id: string;
  status: StatusLevel;
  title: string;
  detail: string;
  action: string;
}

export interface ReportDocument {
  reportId: ReportId;
  title: string;
  subtitle: string;
  scopeLabel: string;
  periodLabel: string;
  generatedAt: Iso;
  coverage: { engines: number; aircraft: number; operators: number; flights: number };
  headline: ReportMetric[];
  findings: ReportFinding[];
  sections: ReportSection[];
}

export type ScheduleRunStatus = "delivered" | "late" | "failed" | "pending";

export interface ScheduledReport {
  id: string;
  reportId: ReportId;
  name: string;
  operatorId: string;
  operatorName: string;
  cadence: ReportCadence;
  format: "PDF" | "CSV" | "XLSX";
  recipients: string[];
  owner: string;
  lastRunAt: Iso;
  nextRunAt: Iso;
  lastRunStatus: ScheduleRunStatus;
  status: StatusLevel;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Fact table                                                          */
/* ------------------------------------------------------------------ */

export interface ReportOperatorFact {
  id: string;
  code: string;
  name: string;
  region: Region;
  homeBase: string;
  contractKind: string;
  availabilityTarget: number;
  availabilityActual: number;
  penaltiesUsd: number;
  ratePerEfhUsd: number;
  contractStatus: StatusLevel;
  contractEndsAt: Iso;
}

export interface ReportEngineFact {
  id: string;
  esn: string;
  family: EngineFamily;
  operatorId: string;
  tail: string | null;
  status: StatusLevel;
  healthScore: number;
  egtMargin: number;
  rulCycles: number;
  cyclesSinceOverhaul: number;
  totalFlightHours: number;
  lifeStage: string;
  location: string;
}

export interface ReportAlertFact {
  id: string;
  engineId: string;
  esn: string;
  operatorId: string;
  family: EngineFamily;
  raisedAt: Iso;
  severity: string;
  status: StatusLevel;
  state: string;
  source: string;
  ataChapter: string;
  title: string;
  recommendedAction: string;
  timeToActionHours: number | null;
}

export interface ReportWorkOrderFact {
  id: string;
  reference: string;
  operatorId: string;
  engineId: string;
  esn: string;
  family: EngineFamily;
  type: string;
  state: string;
  status: StatusLevel;
  raisedAt: Iso;
  scheduledStart: Iso;
  tatDays: number;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
}

export interface ReportBulletinFact {
  id: string;
  reference: string;
  kind: "SB" | "AD" | "ASB";
  title: string;
  family: EngineFamily;
  mandatory: boolean;
  complianceDueAt: Iso;
  estimatedHoursPerEngine: number;
  /** Affected/embodied engine counts per operator, so packs can be scoped. */
  byOperator: Record<string, { affected: number; embodied: number }>;
}

export interface ReportLlpFact {
  id: string;
  engineId: string;
  esn: string;
  operatorId: string;
  family: EngineFamily;
  partNumber: string;
  cyclesRemaining: number;
  projectedExpiryDate: Iso;
  status: StatusLevel;
}

export interface ReportFlightMonthFact {
  operatorId: string;
  /** "2026-07" */
  month: string;
  flights: number;
  blockHours: number;
  fuelBurnKg: number;
}

export interface ReportAuditFact {
  id: string;
  at: Iso;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
}

export interface ReportFacts {
  generatedAt: Iso;
  operators: ReportOperatorFact[];
  engines: ReportEngineFact[];
  alerts: ReportAlertFact[];
  workOrders: ReportWorkOrderFact[];
  bulletins: ReportBulletinFact[];
  llps: ReportLlpFact[];
  flightMonths: ReportFlightMonthFact[];
  audit: ReportAuditFact[];
  kpis: KpiSnapshot[];
  aircraftCount: number;
}
