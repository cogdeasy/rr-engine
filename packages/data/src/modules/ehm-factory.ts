/**
 * Deterministic selectors for the `ehm-factory` module.
 *
 * The population is modelled on how the EHM team actually works: a snapshot
 * strand (~100 ACARS parameters, a handful of reports per flight) and a
 * continuous strand (~3,000 parameters at 1 Hz, delivered end-of-flight). The
 * snapshot strand takes weeks to develop, the continuous strand months, and
 * data exploration is the phase that dominates both. Everything is derived from
 * an RNG seeded on the analytic id.
 */

import type {
  Analytic,
  AnalyticStrand,
  DevPhase,
  DevPhaseSplit,
  EhmFactorySummary,
  StatusLevel,
  StrandProfile,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, rand, round } from "../rng";

export const STRAND_LABELS: Record<AnalyticStrand, string> = {
  snapshot: "Snapshot (ACARS)",
  continuous: "Continuous (1 Hz)",
};

/** Aspirational cycle time, in calendar days, per strand. */
export const STRAND_TARGET_DAYS: Record<AnalyticStrand, number> = { snapshot: 5, continuous: 10 };

const PHASE_LABELS: Record<DevPhase, string> = {
  "data-exploration": "Data exploration",
  "parameter-selection": "Parameter selection & enrichment",
  "model-development": "Model development",
  validation: "Validation & VF",
  deployment: "Deployment & sanctioning",
};

export const DEV_PHASES: DevPhase[] = [
  "data-exploration",
  "parameter-selection",
  "model-development",
  "validation",
  "deployment",
];

/**
 * Typical share of the cycle each phase consumes. Data exploration dominates:
 * it is the phase the team names as the hardest at fleet scale.
 */
const PHASE_WEIGHTS: Record<DevPhase, number> = {
  "data-exploration": 0.42,
  "parameter-selection": 0.16,
  "model-development": 0.18,
  validation: 0.15,
  deployment: 0.09,
};

const FAILURE_MODES: { name: string; strand: AnalyticStrand }[] = [
  { name: "HPT blade tip oxidation", strand: "snapshot" },
  { name: "EGT margin erosion", strand: "snapshot" },
  { name: "Oil consumption step change", strand: "snapshot" },
  { name: "Fuel flow deviation", strand: "snapshot" },
  { name: "Start-up profile anomaly", strand: "snapshot" },
  { name: "Take-off derate non-compliance", strand: "snapshot" },
  { name: "Compressor wash decay", strand: "snapshot" },
  { name: "Bleed valve schedule drift", strand: "snapshot" },
  { name: "Bearing vibration signature", strand: "continuous" },
  { name: "Fan blade imbalance onset", strand: "continuous" },
  { name: "LP spool speed drift", strand: "continuous" },
  { name: "Combustor liner distress", strand: "continuous" },
  { name: "HP shaft torsional response", strand: "continuous" },
  { name: "Surge margin encroachment", strand: "continuous" },
  { name: "Variable stator vane hysteresis", strand: "continuous" },
  { name: "Gearbox tooth-mesh sideband growth", strand: "continuous" },
  { name: "Sensor dropout / feed integrity", strand: "continuous" },
  { name: "Thermal transient severity index", strand: "continuous" },
];

const OWNERS = [
  "r.swallow@rolls-royce.com",
  "a.hughes@rolls-royce.com",
  "s.nakamura@rolls-royce.com",
  "l.bergstrom@rolls-royce.com",
  "j.okafor@rolls-royce.com",
];

/** Mean cost of one avoided in-service disruption under power-by-the-hour, USD. */
export const DISRUPTION_COST_USD = 148_000;

function phaseSplit(cycleDays: number, rng: () => number): DevPhaseSplit[] {
  const jittered = DEV_PHASES.map((phase) => ({
    phase,
    weight: Math.max(0.02, PHASE_WEIGHTS[phase] * rand.float(rng, 0.75, 1.3, 3)),
  }));
  const total = jittered.reduce((sum, entry) => sum + entry.weight, 0);
  return jittered.map((entry) => {
    const share = entry.weight / total;
    return {
      phase: entry.phase,
      label: PHASE_LABELS[entry.phase],
      days: Math.max(1, Math.round(cycleDays * share)),
      sharePct: Math.round(share * 100),
    };
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

function analyticStatus(cycleDays: number, targetDays: number, precisionPct: number): StatusLevel {
  const overTarget = cycleDays > targetDays * 6;
  const noisy = precisionPct < 80;
  if (overTarget && noisy) return "red";
  if (overTarget || noisy) return "amber";
  return "green";
}

let cache: Analytic[] | null = null;

/** Every analytic in the factory, live and backlog, worst cycle time first. */
export function analytics(): Analytic[] {
  if (cache) return cache;
  const families = [...new Set(getDataset().engines.map((engine) => engine.family))];

  cache = FAILURE_MODES.map((mode, index) => {
    const id = `AN-${String(index + 1).padStart(3, "0")}`;
    const rng = createRng(`ehm-factory:${id}`);
    const snapshot = mode.strand === "snapshot";
    // Snapshot analytics run 8-12 weeks today; continuous run around six months.
    const cycleDays = snapshot ? rand.int(rng, 56, 92) : rand.int(rng, 140, 205);
    const targetDays = STRAND_TARGET_DAYS[mode.strand];
    const live = rand.bool(rng, 0.7);
    const observations = live ? rand.int(rng, 4_200, 19_000) : 0;
    // Roughly 1,000 operator notifications a year come out of ~200k observations.
    const notifications = live ? Math.max(1, Math.round(observations * rand.float(rng, 0.004, 0.009, 4))) : 0;
    const precisionPct = live ? rand.int(rng, 68, 97) : 0;
    const falsePositives = live ? Math.round(notifications * (1 - precisionPct / 100)) : 0;
    const avoidableEvents = live ? rand.int(rng, 8, 46) : 0;

    return {
      id,
      name: mode.name,
      engineFamily: rand.pick(rng, families),
      strand: mode.strand,
      parameters: snapshot ? rand.int(rng, 12, 40) : rand.int(rng, 180, 1_400),
      cycleDays,
      targetDays,
      phases: phaseSplit(cycleDays, rng),
      live,
      notifications,
      observations,
      precisionPct,
      falsePositives,
      avoidableEvents,
      costAvoidedUsd: avoidableEvents * 2 * DISRUPTION_COST_USD,
      computeCostUsd: snapshot ? rand.int(rng, 18_000, 60_000) : rand.int(rng, 120_000, 460_000),
      status: analyticStatus(cycleDays, targetDays, live ? precisionPct : 100),
      owner: rand.pick(rng, OWNERS),
    };
  }).sort((a, b) => b.cycleDays - a.cycleDays);

  return cache;
}

export function analytic(analyticId: string): Analytic | undefined {
  return analytics().find((entry) => entry.id === analyticId);
}

function strandProfiles(all: Analytic[]): StrandProfile[] {
  return (["snapshot", "continuous"] as AnalyticStrand[]).map((strand) => {
    const inStrand = all.filter((entry) => entry.strand === strand);
    const medianCycleDays = median(inStrand.map((entry) => entry.cycleDays));
    const target = STRAND_TARGET_DAYS[strand];
    return {
      strand,
      label: STRAND_LABELS[strand],
      analytics: inStrand.length,
      parameters: inStrand.reduce((sum, entry) => sum + entry.parameters, 0),
      medianCycleDays,
      targetDays: target,
      targetMultiple: round(medianCycleDays / target, 1),
      medianPrecisionPct: median(inStrand.filter((entry) => entry.live).map((entry) => entry.precisionPct)),
    };
  });
}

/** Cycle-time split across the whole factory, so the worst phase is obvious. */
function aggregatePhases(all: Analytic[]): DevPhaseSplit[] {
  const totalDays = all.reduce((sum, entry) => sum + entry.cycleDays, 0);
  return DEV_PHASES.map((phase) => {
    const days = all.reduce((sum, entry) => sum + (entry.phases.find((p) => p.phase === phase)?.days ?? 0), 0);
    return {
      phase,
      label: PHASE_LABELS[phase],
      days,
      sharePct: totalDays === 0 ? 0 : Math.round((days / totalDays) * 100),
    };
  });
}

export function ehmFactorySummary(): EhmFactorySummary {
  const all = analytics();
  const live = all.filter((entry) => entry.live);
  return {
    analytics: all.length,
    live: live.length,
    backlog: all.length - live.length,
    medianCycleDays: median(all.map((entry) => entry.cycleDays)),
    daysAboveTarget: all.reduce((sum, entry) => sum + Math.max(0, entry.cycleDays - entry.targetDays), 0),
    notifications: live.reduce((sum, entry) => sum + entry.notifications, 0),
    observations: live.reduce((sum, entry) => sum + entry.observations, 0),
    falsePositives: live.reduce((sum, entry) => sum + entry.falsePositives, 0),
    medianPrecisionPct: median(live.map((entry) => entry.precisionPct)),
    avoidableEvents: live.reduce((sum, entry) => sum + entry.avoidableEvents, 0),
    costAvoidedUsd: live.reduce((sum, entry) => sum + entry.costAvoidedUsd, 0),
    computeCostUsd: all.reduce((sum, entry) => sum + entry.computeCostUsd, 0),
    strands: strandProfiles(all),
    phases: aggregatePhases(all),
  };
}
