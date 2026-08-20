/**
 * Workforce & skills — "do we have certified people to release this work on time?"
 *
 * The domain model layers three ideas on top of the base `Technician` record:
 *   1. currency  — licences and family authorisations expire and must be renewed;
 *   2. capacity  — a technician contributes hours to a shift, minus planned absence;
 *   3. coverage  — a skill on a shift is only covered if certified, current heads exist.
 */

import type { EngineFamily, Iso, Severity, StatusLevel, Technician } from "../index";

export type ShiftId = Technician["shift"];

export type CertificationKind = "licence" | "family-authorisation" | "skill-approval";

/** A dated approval held by a technician. Expiry drives the currency warnings. */
export interface Certification {
  id: string;
  technicianId: string;
  kind: CertificationKind;
  label: string;
  issuedAt: Iso;
  expiresAt: Iso;
  daysToExpiry: number;
  /** red = expired or lapses inside 30 days, amber = inside 90 days, green = current. */
  status: StatusLevel;
}

/** Roster row: a technician with derived currency and capacity for the horizon. */
export interface TechnicianProfile {
  technician: Technician;
  facilityId: string;
  facilityIcao: string;
  shift: ShiftId;
  certifications: Certification[];
  /** Contracted hours per week before absence. */
  contractedHoursPerWeek: number;
  /** Already committed to running work, indirect tasks and training. */
  committedHoursPerWeek: number;
  /** Contracted minus committed hours — what a planner can actually book. */
  spareHoursPerWeek: number;
  /** Spare hours averaged across the horizon, after planned absence. */
  availableHoursPerWeek: number;
  absenceWeeks: number;
  absenceReason: "annual leave" | "type training" | "secondment" | null;
  /** Task cards currently assigned to this technician. */
  assignedTaskCards: number;
  assignedHours: number;
  /** Earliest certification expiry, the one a planner must renew first. */
  nextExpiry: Certification | null;
  /** red = a certification has lapsed (cannot sign off), amber = lapses inside 90 days. */
  status: StatusLevel;
}

/** One cell of the skill x shift coverage matrix, scoped to a facility or the network. */
export interface CoverageCell {
  skill: string;
  shift: ShiftId;
  /** Facility id, or "ALL" for the network roll-up. */
  facilityId: string;
  /** Heads holding the skill on this shift, current or not. */
  heads: number;
  /** Heads holding the skill who are current and not absent. */
  currentHeads: number;
  /** Heads holding the skill whose authorisation has lapsed. */
  lapsedHeads: number;
  /** Open task-card hours in the horizon needing this skill, split across shifts. */
  demandHours: number;
  /** Hours the current heads can offer this skill over the horizon. */
  capacityHours: number;
  /** capacityHours / demandHours, capped for display at 3. */
  coverageRatio: number;
  /** Positive when demand exceeds capacity. */
  shortfallHours: number;
  status: StatusLevel;
}

export interface CoverageSkillRow {
  skill: string;
  facilityId: string;
  cells: CoverageCell[];
  demandHours: number;
  capacityHours: number;
  shortfallHours: number;
  status: StatusLevel;
}

/** Demand vs available labour for one week at one facility. */
export interface LabourWeek {
  weekStart: Iso;
  label: string;
  demandHours: number;
  availableHours: number;
  balanceHours: number;
  utilisationPct: number;
  status: StatusLevel;
}

export interface FacilityLabourForecast {
  facilityId: string;
  facilityName: string;
  icao: string;
  headcount: number;
  weeks: LabourWeek[];
  demandHours: number;
  availableHours: number;
  balanceHours: number;
  peakUtilisationPct: number;
  /** First week in the horizon where demand exceeds available hours. */
  firstDeficitWeek: string | null;
  status: StatusLevel;
}

export interface SuggestedTechnician {
  technicianId: string;
  name: string;
  shift: ShiftId;
  utilisationPct: number;
  spareHoursPerWeek: number;
  /** 0-100 fit score: skill, family authorisation, currency margin and spare capacity. */
  matchScore: number;
  reasons: string[];
}

/** An unstaffed, time-critical task card and the best available technician for it. */
export interface AssignmentSuggestion {
  taskCardId: string;
  taskReference: string;
  taskTitle: string;
  workOrderId: string;
  workOrderReference: string;
  engineEsn: string;
  family: EngineFamily;
  facilityId: string;
  facilityIcao: string;
  priority: Severity;
  skillRequired: string;
  estimatedHours: number;
  startsAt: Iso;
  daysToStart: number;
  candidate: SuggestedTechnician | null;
  alternates: SuggestedTechnician[];
  /** red = no certified candidate or starts inside 48h, amber = staffable but tight. */
  status: StatusLevel;
  action: string;
}

export interface WorkforceSummary {
  headcount: number;
  facilities: number;
  /** Certifications already lapsed — these people cannot sign off work today. */
  lapsedCertifications: number;
  expiring30: number;
  expiring90: number;
  /** Skill x shift cells where demand exceeds capacity. */
  redCoverageCells: number;
  unstaffedPriorityCards: number;
  unstaffableCards: number;
  demandHours: number;
  availableHours: number;
  /** availableHours / demandHours as a percentage across the horizon. */
  coveragePct: number;
  horizonWeeks: number;
}

export interface WorkforceOverview {
  summary: WorkforceSummary;
  facilities: { id: string; name: string; icao: string; headcount: number; status: StatusLevel }[];
  /** Network-wide skill x shift coverage. */
  coverage: CoverageSkillRow[];
  /** Skill x shift coverage per facility, keyed by facility id. */
  coverageByFacility: { facilityId: string; icao: string; name: string; rows: CoverageSkillRow[] }[];
  shifts: { shift: ShiftId; heads: number; demandHours: number; capacityHours: number; status: StatusLevel }[];
  forecasts: FacilityLabourForecast[];
  suggestions: AssignmentSuggestion[];
  roster: TechnicianProfile[];
  expiries: Certification[];
}
