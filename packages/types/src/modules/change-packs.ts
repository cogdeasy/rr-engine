/**
 * DN (Data Notification) change-pack lifecycle: the Rolls-Royce end-to-end
 * process for taking an EHM analytic from requirement capture to production
 * monitoring, with a Definition of Done per area and a gate between stages.
 */

import type { StatusLevel } from "../index";

/** The three lanes of the end-to-end process. */
export type DnStage = "design" | "build" | "release";

/** Formal decision points between stages. */
export type DnGate = "design-buyoff" | "tech-review" | "cab";

export type DnGateState = "not-reached" | "in-review" | "passed" | "blocked";

/** Definition-of-Done areas, in the order they are worked. */
export type DodArea = "design-development" | "dev-testing" | "stg4" | "preprod" | "prod";

/** A single Definition-of-Done activity within an area. */
export interface DodActivity {
  id: string;
  area: DodArea;
  label: string;
  done: boolean;
  /** Set when `done`; the sign-off owner and moment. */
  completedBy: string | null;
  completedAt: string | null;
  /** Activities the process treats as non-waivable. */
  mandatory: boolean;
}

export interface DnGateRecord {
  gate: DnGate;
  state: DnGateState;
  /** Named approver once the gate has been decided or is in review. */
  approver: string | null;
  decidedAt: string | null;
  /** Why a gate is blocked; null otherwise. */
  blockedReason: string | null;
}

export interface ChangePack {
  id: string;
  /** Human reference, e.g. `DN-2418`. */
  ref: string;
  title: string;
  /** The analytic or dashboard the pack delivers. */
  deliverable: string;
  engineFamily: string;
  operatorId: string | null;
  stage: DnStage;
  /** The activity currently being worked. */
  currentActivity: string;
  owner: string;
  redTeamOwner: string;
  raisedAt: string;
  /** Contracted date for production deployment. */
  targetAt: string;
  /** Red = gate blocked or past target, amber = at risk, green = on track. */
  status: StatusLevel;
  daysToTarget: number;
  gates: DnGateRecord[];
  activities: DodActivity[];
  /** Engines whose monitoring changes when this pack ships. */
  affectedEngines: number;
  /** Open PIR (post-implementation review) findings, production packs only. */
  pirFindings: number;
  riskNote: string | null;
  exportControlled: boolean;
}

export interface DodAreaProgress {
  area: DodArea;
  label: string;
  activities: number;
  complete: number;
  completePct: number;
  /** Packs currently held in this area. */
  packs: number;
  status: StatusLevel;
}

export interface DnStageProgress {
  stage: DnStage;
  label: string;
  packs: number;
  blocked: number;
  atRisk: number;
  /** Mean days packs have spent in this stage. */
  meanDaysInStage: number;
}

export interface ChangePackSummary {
  packs: number;
  blocked: number;
  atRisk: number;
  onTrack: number;
  awaitingGate: number;
  pastTarget: number;
  openPirFindings: number;
  /** Mean Definition-of-Done completion across live packs, 0-100. */
  meanDodPct: number;
  stages: DnStageProgress[];
  areas: DodAreaProgress[];
}
