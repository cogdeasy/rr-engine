/**
 * What-if simulation (module id: `simulation`).
 *
 * Types for the digital-twin scenario model: the levers an operator can pull,
 * the modelled outcome of pulling them, and the comparison artefacts the
 * console renders (deltas, sensitivity, saved scenarios).
 */

import type { Point, StatusLevel } from "../index";

/** Depth of the next shop visit. Deeper workscopes restore more margin. */
export type WorkscopeLevel = "minimum" | "performance-restoration" | "full-overhaul";

/** The five levers exposed by the simulator. */
export interface SimulationLevers {
  /** Cycles the removal is deferred (+) or pulled forward (-) versus the plan. */
  removalOffsetCycles: number;
  /** Average take-off derate applied, percent. Higher derate preserves EGT margin. */
  deratePct: number;
  /** Blended route severity, 1 (benign) to 5 (harsh, sandy). */
  routeSeverity: number;
  /** Days between on-wing water washes; 0 disables the wash programme. */
  washIntervalDays: number;
  workscope: WorkscopeLevel;
}

/** Everything the deterministic model needs about one engine, derived from `@rr/data`. */
export interface SimulationBaseline {
  engineId: string;
  esn: string;
  family: string;
  buildStandard: string;
  operatorName: string;
  operatorCode: string;
  aircraftTail: string;
  contractKind: string;
  status: StatusLevel;
  /** °C of EGT margin remaining today. */
  egtMargin: number;
  /** °C of EGT margin on a new engine of this build standard. */
  newEgtMargin: number;
  /** °C at which the engine must come off wing. */
  minimumEgtMargin: number;
  healthScore: number;
  /** Strongest prognostic failure probability on this engine, 0-1. */
  prognosticRisk: number;
  cyclesSinceOverhaul: number;
  overhaulIntervalCycles: number;
  /** Cycles from today to the currently planned removal. */
  plannedRemovalCycles: number;
  cyclesPerYear: number;
  blockHoursPerCycle: number;
  fuelBurnKgPerCycle: number;
  ratePerEfhUsd: number;
  availabilityTarget: number;
  /** Shop-visit reference price for this family, before workscope scaling. */
  shopVisitBaseCostUsd: number;
  /** The operating profile the engine flies today. */
  levers: SimulationLevers;
}

/** Modelled result of running one lever set against one baseline. */
export interface SimulationOutcome {
  /** Cycles the engine stays on wing under this scenario. */
  onWingCycles: number;
  /** Calendar months on wing at the modelled utilisation. */
  onWingMonths: number;
  /** EGT margin decay, °C per 1,000 cycles. */
  decayPerThousandCycles: number;
  /** Margin left the day the engine is removed; negative means the limit is breached. */
  egtMarginAtRemoval: number;
  /** Cycles the engine could fly before hitting the minimum margin. */
  rulCycles: number;
  /** Cruise fuel burn penalty from deteriorated margin, percent. */
  fuelBurnPenaltyPct: number;
  fuelPenaltyCostUsd: number;
  washProgrammeCostUsd: number;
  shopVisitCostUsd: number;
  /** Value of certified life left unused when the engine is removed early. */
  lifeWasteCostUsd: number;
  /** Probability of an unscheduled removal before the planned removal, 0-1. */
  unscheduledRemovalRisk: number;
  /** Risk-weighted cost of disruption (AOG recovery, lease cover, liquidated damages). */
  disruptionCostUsd: number;
  totalCostUsd: number;
  /** Total cost divided by the cycles delivered — the comparable unit economics. */
  costPerCycleUsd: number;
  /** Modelled contractual availability across the on-wing period, percent. */
  availabilityPct: number;
  marginStatus: StatusLevel;
  riskStatus: StatusLevel;
  availabilityStatus: StatusLevel;
  /** EGT margin projection to removal, for charting. */
  marginProjection: Point[];
}

export type DeltaDirection = "higher-is-better" | "lower-is-better";

/** One row of the baseline-versus-scenario comparison. */
export interface SimulationDelta {
  key: string;
  label: string;
  unit: string;
  baseline: number;
  scenario: number;
  delta: number;
  deltaPct: number;
  direction: DeltaDirection;
  /** Green when the scenario is better than baseline, red when worse. */
  status: StatusLevel;
  decimals: number;
  /** Why an operator should care about this number. */
  note: string;
}

/** How much one lever moves the outcome, holding the others at the scenario setting. */
export interface SensitivityEntry {
  lever: keyof SimulationLevers;
  label: string;
  lowSetting: string;
  highSetting: string;
  /** Swing in total cost across the lever's range, USD. */
  costSwingUsd: number;
  /** Swing in on-wing cycles across the lever's range. */
  cycleSwing: number;
  /** Swing in EGT margin at removal, °C. */
  marginSwing: number;
  /** Share of the total cost swing across all levers, 0-1. */
  share: number;
}

export interface ScenarioRecommendation {
  levers: SimulationLevers;
  headline: string;
  rationale: string[];
  savingUsd: number;
  cyclesGained: number;
  riskDelta: number;
}

/** A scenario saved into the client-side comparison list. */
export interface SavedScenario {
  id: string;
  name: string;
  levers: SimulationLevers;
}

/** Row shown in the engine picker. */
export interface SimulationCandidate {
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  aircraftTail: string;
  status: StatusLevel;
  egtMargin: number;
  plannedRemovalCycles: number;
  unscheduledRemovalRisk: number;
  /** Headline opportunity from the recommended scenario, USD. */
  opportunityUsd: number;
}
