/**
 * Shop visit workscoping selectors.
 *
 * The workscope is derived, never stored: module condition, prognostics, open
 * alerts and LLP life are combined into a severity index per module, the index
 * drives the level of work (inspect / repair / restore / replace), and the
 * levels roll up into cost, turn-time, restored EGT margin and the projected
 * next removal for each of the three standard shop visit scenarios.
 */

import type {
  Engine,
  EngineWorkscope,
  ModuleCode,
  StatusLevel,
  WorkscopeCandidate,
  WorkscopeDriver,
  WorkscopeLevel,
  WorkscopeLlpLine,
  WorkscopeModuleLine,
  WorkscopeQueueSummary,
  WorkscopeScenario,
  WorkscopeScenarioId,
} from "@rr/types";
import { ENGINE_FAMILIES, ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

/** Modules a shop visit workscope is written against. */
const WORKSCOPE_MODULES: ModuleCode[] = ["FAN", "IPC", "HPC", "COMBUSTOR", "HPT", "IPT", "LPT", "EXTERNALS"];

/** Share of the recoverable EGT margin each module is responsible for. */
const MARGIN_SHARE: Record<string, number> = {
  HPT: 0.34,
  HPC: 0.2,
  COMBUSTOR: 0.18,
  IPT: 0.09,
  LPT: 0.08,
  IPC: 0.06,
  FAN: 0.04,
  EXTERNALS: 0.01,
};

const LEVEL_ORDER: WorkscopeLevel[] = ["inspect", "repair", "restore", "replace"];

const LEVEL_COST_FACTOR: Record<WorkscopeLevel, number> = {
  inspect: 0.12,
  repair: 0.38,
  restore: 0.74,
  replace: 1.15,
};

/** Fraction of the module's recoverable margin returned by each level. */
const LEVEL_RECOVERY: Record<WorkscopeLevel, number> = {
  inspect: 0.04,
  repair: 0.36,
  restore: 0.86,
  replace: 1,
};

const LABOUR_RATE_USD_PER_HOUR = 118;
/** Fixed induction, strip, build and pass-off days on every shop visit. */
const FIXED_TAT_DAYS = 18;

const rank = (level: WorkscopeLevel) => LEVEL_ORDER.indexOf(level);
const maxLevel = (a: WorkscopeLevel, b: WorkscopeLevel) => (rank(a) >= rank(b) ? a : b);
const minLevel = (a: WorkscopeLevel, b: WorkscopeLevel) => (rank(a) <= rank(b) ? a : b);

export function workscopeLevelLabel(level: WorkscopeLevel): string {
  return { inspect: "Inspect", repair: "Repair", restore: "Restore", replace: "Replace" }[level];
}

export function workscopeLevelStatus(level: WorkscopeLevel): StatusLevel {
  return { inspect: "green", repair: "green", restore: "amber", replace: "red" }[level] as StatusLevel;
}

function familySpec(engine: Engine) {
  return ENGINE_FAMILIES.find((f) => f.family === engine.family) ?? ENGINE_FAMILIES[0]!;
}

function levelFromSeverity(severity: number): WorkscopeLevel {
  if (severity >= 78) return "replace";
  if (severity >= 58) return "restore";
  if (severity >= 36) return "repair";
  return "inspect";
}

export function workscopeSeverityStatus(severity: number): StatusLevel {
  if (severity >= 78) return "red";
  if (severity >= 58) return "amber";
  return "green";
}

/** Deterministic sortie rate for an engine, cycles per calendar day. */
function cyclesPerDay(engine: Engine): number {
  const rng = createRng(`${engine.id}:utilisation`);
  return round(rand.float(rng, 0.7, 2.1), 2);
}

/* ------------------------------------------------------------------ */
/* Module build-up                                                     */
/* ------------------------------------------------------------------ */

interface ModuleAssessment {
  code: ModuleCode;
  label: string;
  ataChapter: string;
  status: StatusLevel;
  lifeConsumedPct: number;
  lastInspectedAt: string | null;
  severityIndex: number;
  recommendedLevel: WorkscopeLevel;
  drivers: WorkscopeDriver[];
  rationale: string;
  /** Full-overhaul reference cost for this module, before the level factor. */
  referenceCostUsd: number;
  referenceHours: number;
  recoverableMarginC: number;
  llps: WorkscopeLlpLine[];
}

function assessModules(engine: Engine): ModuleAssessment[] {
  const data = getDataset();
  const spec = familySpec(engine);
  const overhaulCostUsd = spec.thrustLbf * 96;
  const overhaulHours = 5200 + spec.thrustLbf / 90;
  const recoverableMargin = Math.max(0, spec.newEgtMargin - engine.egtMargin);
  const modules = data.engineModules.filter((m) => m.engineId === engine.id);
  const prognostics = data.prognostics.filter((p) => p.engineId === engine.id);
  const alerts = data.alerts.filter((a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive");
  const llps = data.llps.filter((l) => l.engineId === engine.id);
  const parts = data.parts;

  return WORKSCOPE_MODULES.map((code) => {
    const modSpec = ENGINE_MODULES.find((m) => m.code === code)!;
    const mod = modules.find((m) => m.code === code);
    const lifeConsumedPct = mod?.lifeConsumedPct ?? 0;
    const drivers: WorkscopeDriver[] = [];

    const lifePoints = clamp(lifeConsumedPct * 0.52, 0, 62);
    drivers.push({
      label: "Certified life consumed",
      detail: `${round(lifeConsumedPct, 1)}% of the module's certified life used since last overhaul`,
      contribution: round(lifePoints, 1),
      status: lifeConsumedPct > 95 ? "red" : lifeConsumedPct > 75 ? "amber" : "green",
    });

    const modulePrognostics = prognostics.filter((p) => p.moduleCode === code);
    const worst = modulePrognostics.sort((a, b) => b.probability - a.probability)[0];
    if (worst) {
      const points = clamp(worst.probability * 34, 0, 34);
      drivers.push({
        label: worst.failureMode,
        detail: `${Math.round(worst.probability * 100)}% probability of exceedance within ${worst.horizonCycles} cycles (${worst.modelVersion})`,
        contribution: round(points, 1),
        status: worst.probability > 0.6 ? "red" : worst.probability > 0.3 ? "amber" : "green",
      });
    }

    const moduleAlerts = alerts.filter((a) => a.ataChapter === modSpec.ataChapter);
    if (moduleAlerts.length > 0) {
      const critical = moduleAlerts.filter((a) => a.severity === "critical" || a.severity === "high").length;
      const points = clamp(moduleAlerts.length * 5 + critical * 6, 0, 22);
      drivers.push({
        label: `${moduleAlerts.length} open alert${moduleAlerts.length > 1 ? "s" : ""} on ATA ${modSpec.ataChapter}`,
        detail: moduleAlerts[0]!.title,
        contribution: round(points, 1),
        status: critical > 0 ? "red" : "amber",
      });
    }

    const moduleLlps = llps.filter((l) => l.moduleCode === code);
    const tightest = [...moduleLlps].sort((a, b) => a.cyclesRemaining - b.cyclesRemaining)[0];
    if (tightest && tightest.cyclesRemaining < 3000) {
      const points = clamp((3000 - tightest.cyclesRemaining) / 140, 0, 21);
      drivers.push({
        label: "Life-limited part expiry",
        detail: `${tightest.partNumber} has ${tightest.cyclesRemaining.toLocaleString("en-GB")} cycles remaining of ${tightest.cyclicLimit.toLocaleString("en-GB")}`,
        contribution: round(points, 1),
        status: tightest.status,
      });
    }

    if (engine.environmentSeverity >= 4 && (code === "HPT" || code === "HPC" || code === "COMBUSTOR")) {
      drivers.push({
        label: "Harsh environment exposure",
        detail: `Environment severity ${engine.environmentSeverity}/5 accelerates hot-section sulphidation and tip rub`,
        contribution: 7,
        status: "amber",
      });
    }

    const severityIndex = round(clamp(drivers.reduce((sum, d) => sum + d.contribution, 0), 0, 100), 1);
    const recommendedLevel = levelFromSeverity(severityIndex);

    const llpLines: WorkscopeLlpLine[] = moduleLlps.map((llp) => {
      const part = parts.find((p) => p.partNumber === llp.partNumber);
      return {
        id: llp.id,
        partNumber: llp.partNumber,
        serialNumber: llp.serialNumber,
        description: part?.description ?? `${modSpec.label} life-limited part`,
        moduleCode: code,
        cyclesRemaining: llp.cyclesRemaining,
        cyclicLimit: llp.cyclicLimit,
        stubCyclesScrapped: llp.cyclesRemaining,
        unitCostUsd: part?.unitCostUsd ?? 420_000,
        leadTimeDays: part?.leadTimeDays ?? 60,
        supplier: part?.supplier ?? "Rolls-Royce Derby",
        status: llp.status,
        mandatory: llp.cyclesRemaining < 400,
        reason:
          llp.cyclesRemaining < 400
            ? "Below the 400-cycle dispatch reserve — must be replaced at this visit"
            : `Expires after ${llp.cyclesRemaining.toLocaleString("en-GB")} further cycles`,
      };
    });

    const worstDriver = [...drivers].sort((a, b) => b.contribution - a.contribution)[0];

    return {
      code,
      label: modSpec.label,
      ataChapter: modSpec.ataChapter,
      status: mod?.status ?? "grey",
      lifeConsumedPct: round(lifeConsumedPct, 1),
      lastInspectedAt: mod?.lastInspectedAt ?? null,
      severityIndex,
      recommendedLevel,
      drivers,
      rationale: worstDriver
        ? `${workscopeLevelLabel(recommendedLevel)} driven by ${worstDriver.label.toLowerCase()}.`
        : "No condition evidence — inspect only.",
      referenceCostUsd: Math.round(overhaulCostUsd * modSpec.overhaulCostShare),
      referenceHours: Math.round(overhaulHours * modSpec.overhaulCostShare),
      recoverableMarginC: round(recoverableMargin * (MARGIN_SHARE[code] ?? 0.02), 1),
      llps: llpLines,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

interface ScenarioRule {
  id: WorkscopeScenarioId;
  label: string;
  intent: string;
  /** Severity above which the module is opened at all. */
  openAbove: number;
  /** Level ceiling applied to the recommended level. */
  ceiling: WorkscopeLevel;
  /** Level floor applied to every opened module. */
  floor: WorkscopeLevel;
  /** LLPs with fewer cycles remaining than this are replaced. */
  llpThreshold: number;
  risks: (engine: Engine) => string[];
}

const SCENARIO_RULES: ScenarioRule[] = [
  {
    id: "minimum-viable",
    label: "Minimum viable",
    intent: "Clear the defects that stop the engine flying and return it to service in the shortest possible TAT.",
    openAbove: 74,
    ceiling: "repair",
    floor: "inspect",
    llpThreshold: 400,
    risks: () => [
      "Hot-section deterioration is carried forward — EGT margin recovery is partial.",
      "Next removal likely unscheduled; slot will have to be found at short notice.",
    ],
  },
  {
    id: "performance-restoration",
    label: "Performance restoration",
    intent: "Restore EGT margin and buy a full planned interval by opening every module carrying real deterioration.",
    openAbove: 36,
    ceiling: "replace",
    floor: "repair",
    llpThreshold: 2600,
    risks: () => [
      "Modules below the severity threshold stay closed; stub life on those LLPs remains a future exposure.",
    ],
  },
  {
    id: "full-overhaul",
    label: "Full overhaul",
    intent: "Zero-time the engine: every module restored or replaced and the LLP stack refreshed to a common interval.",
    openAbove: -1,
    ceiling: "replace",
    floor: "restore",
    llpThreshold: 6500,
    risks: (engine) => [
      `Highest cash cost and the longest TAT — ${engine.esn} is out of service for the whole visit.`,
      "Scrapped stub life on parts that had usable cycles remaining.",
    ],
  },
];

/**
 * A module below the scenario's severity threshold stays closed unless it holds
 * a mandatory LLP: that part cannot be deferred, so the module has to come
 * apart far enough to change it.
 */
function scenarioLevel(rule: ScenarioRule, assessment: ModuleAssessment): WorkscopeLevel {
  const forced = assessment.llps.some((llp) => llp.mandatory);
  if (assessment.severityIndex <= rule.openAbove) return forced ? "repair" : "inspect";
  return maxLevel(forced ? "repair" : rule.floor, maxLevel(rule.floor, minLevel(rule.ceiling, assessment.recommendedLevel)));
}

function buildScenario(engine: Engine, assessments: ModuleAssessment[], rule: ScenarioRule): WorkscopeScenario {
  const spec = familySpec(engine);
  const perDay = cyclesPerDay(engine);

  const modules: WorkscopeModuleLine[] = assessments.map((assessment) => {
    const level = scenarioLevel(rule, assessment);
    const factor = LEVEL_COST_FACTOR[level];
    const llps = assessment.llps.filter(
      (llp) => llp.mandatory || (level !== "inspect" && llp.cyclesRemaining < rule.llpThreshold),
    );
    const labourHours = Math.round(assessment.referenceHours * factor);
    const labourUsd = labourHours * LABOUR_RATE_USD_PER_HOUR;
    const materialUsd =
      Math.round(assessment.referenceCostUsd * factor * 0.62) + llps.reduce((sum, l) => sum + l.unitCostUsd, 0);
    return {
      code: assessment.code,
      label: assessment.label,
      ataChapter: assessment.ataChapter,
      status: assessment.status,
      lifeConsumedPct: assessment.lifeConsumedPct,
      lastInspectedAt: assessment.lastInspectedAt,
      severityIndex: assessment.severityIndex,
      recommendedLevel: assessment.recommendedLevel,
      level,
      labourHours,
      labourUsd,
      materialUsd,
      costUsd: labourUsd + materialUsd,
      shopDays: Math.max(1, Math.round(labourHours / 34)),
      egtMarginRestoredC: round(assessment.recoverableMarginC * LEVEL_RECOVERY[level], 1),
      llps,
      drivers: assessment.drivers,
      rationale: assessment.rationale,
    };
  });

  const opened = modules.filter((m) => m.level !== "inspect");
  const llps = modules.flatMap((m) => m.llps);
  const labourUsd = modules.reduce((sum, m) => sum + m.labourUsd, 0);
  const materialUsd = modules.reduce((sum, m) => sum + m.materialUsd, 0);
  const labourHours = modules.reduce((sum, m) => sum + m.labourHours, 0);
  const costUsd = labourUsd + materialUsd;

  // Benches run in parallel: the longest module sets the critical path and the
  // rest contribute a queueing penalty. Long-lead LLPs extend the visit.
  const criticalPath = opened.length > 0 ? Math.max(...opened.map((m) => m.shopDays)) : 0;
  const queueing = opened.reduce((sum, m) => sum + m.shopDays, 0) - criticalPath;
  const longestLead = llps.reduce((max, l) => Math.max(max, l.leadTimeDays), 0);
  const leadPenalty = Math.min(24, Math.max(0, longestLead - 60) * 0.35);
  const tatDays = Math.round(FIXED_TAT_DAYS + criticalPath + queueing * 0.25 + leadPenalty);

  const egtMarginRestoredC = round(modules.reduce((sum, m) => sum + m.egtMarginRestoredC, 0), 1);
  const projectedEgtMarginC = round(engine.egtMargin + egtMarginRestoredC, 1);

  // Margin decays with cycles at the rate this engine has demonstrated since
  // its last overhaul, scaled by the severity of the routes it flies.
  const demonstratedDecay = Math.max(
    0.0035,
    (spec.newEgtMargin - engine.egtMargin) / Math.max(300, engine.cyclesSinceOverhaul),
  );
  const decayPerCycle = demonstratedDecay * (0.86 + engine.environmentSeverity * 0.05);
  const usableMargin = Math.max(0, projectedEgtMarginC - 8);
  const performanceCycles = Math.round(clamp(usableMargin / decayPerCycle, 0, spec.overhaulIntervalCycles * 1.25));

  const remainingLlpCycles = assessments
    .flatMap((a) => a.llps)
    .map((llp) => (llps.some((r) => r.id === llp.id) ? llp.cyclicLimit : llp.cyclesRemaining));
  const llpCycles = remainingLlpCycles.length > 0 ? Math.min(...remainingLlpCycles) : performanceCycles;

  const nextRemovalCycles = Math.min(performanceCycles, llpCycles);
  const nextRemovalLimiter = llpCycles < performanceCycles ? "llp" : "performance";

  return {
    id: rule.id,
    label: rule.label,
    intent: rule.intent,
    modules,
    modulesOpened: opened.length,
    llps,
    labourUsd,
    materialUsd,
    costUsd,
    labourHours,
    tatDays,
    egtMarginRestoredC,
    projectedEgtMarginC,
    onWingCyclesAdded: nextRemovalCycles,
    nextRemovalCycles,
    nextRemovalAt: iso(addDays(NOW, Math.round(tatDays + nextRemovalCycles / perDay))),
    nextRemovalLimiter,
    costPerOnWingCycleUsd: round(costUsd / Math.max(1, nextRemovalCycles), 0),
    risks: rule.risks(engine),
  };
}

/* ------------------------------------------------------------------ */
/* Engine workscope                                                    */
/* ------------------------------------------------------------------ */

export function buildEngineWorkscope(engineId: string): EngineWorkscope | undefined {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;

  const spec = familySpec(engine);
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const assessments = assessModules(engine);
  const scenarios = SCENARIO_RULES.map((rule) => buildScenario(engine, assessments, rule));
  const perDay = cyclesPerDay(engine);

  const tightestLlp = assessments
    .flatMap((a) => a.llps)
    .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining)[0];
  const removalWithinCycles = Math.max(0, Math.min(engine.rulCycles, tightestLlp?.cyclesRemaining ?? engine.rulCycles));
  const removalReason =
    tightestLlp && tightestLlp.cyclesRemaining <= engine.rulCycles
      ? `LLP ${tightestLlp.partNumber} expires in ${tightestLlp.cyclesRemaining.toLocaleString("en-GB")} cycles`
      : engine.egtMargin < 12
        ? `EGT margin at ${engine.egtMargin}°C — performance-limited removal`
        : `Predicted removal at ${engine.rulCycles.toLocaleString("en-GB")} cycles remaining`;
  const urgency: StatusLevel = removalWithinCycles < 400 ? "red" : removalWithinCycles < 1200 ? "amber" : "green";

  // Cheapest scenario per on-wing cycle that still buys a worthwhile interval;
  // otherwise the deepest workscope available.
  const viable = scenarios.filter((s) => s.nextRemovalCycles >= spec.overhaulIntervalCycles * 0.55);
  const recommended =
    [...(viable.length > 0 ? viable : scenarios)].sort((a, b) => a.costPerOnWingCycleUsd - b.costPerOnWingCycleUsd)[0] ??
    scenarios[1]!;

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    buildStandard: engine.buildStandard,
    operatorId: engine.operatorId,
    operatorCode: operator?.code ?? "—",
    operatorName: operator?.name ?? "Unassigned",
    aircraftTail: aircraft?.tail ?? null,
    location: engine.location,
    status: engine.status,
    healthScore: engine.healthScore,
    egtMarginC: engine.egtMargin,
    newEgtMarginC: spec.newEgtMargin,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    overhaulIntervalCycles: spec.overhaulIntervalCycles,
    rulCycles: engine.rulCycles,
    environmentSeverity: engine.environmentSeverity,
    cyclesPerDay: perDay,
    removalReason,
    removalWithinCycles,
    removalBy: iso(addDays(NOW, Math.round(removalWithinCycles / perDay))),
    urgency,
    openAlerts: data.alerts.filter((a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive")
      .length,
    scenarios,
    recommendedScenarioId: recommended.id,
    recommendationRationale: `${recommended.label} returns ${recommended.egtMarginRestoredC}°C of EGT margin for $${(
      recommended.costPerOnWingCycleUsd
    ).toLocaleString("en-GB")} per on-wing cycle — the lowest cost per cycle of the three scenarios that still buys a planned interval.`,
  };
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

/**
 * Cycles until the engine has to come off wing: whichever binds first, the
 * predicted remaining life or the tightest life-limited part.
 */
function removalWithinCyclesFor(engine: Engine): number {
  const tightest = getDataset()
    .llps.filter((l) => l.engineId === engine.id)
    .reduce((min, l) => Math.min(min, l.cyclesRemaining), Number.POSITIVE_INFINITY);
  return Math.max(0, Math.min(engine.rulCycles, tightest));
}

/** Engines whose next event is a shop visit needing a workscope decision. */
export function workscopeQueue(limit = 14): WorkscopeCandidate[] {
  const data = getDataset();
  return [...data.engines]
    .filter((e) => e.status !== "green" || e.lifeStage === "pre-shop-visit")
    .sort(
      (a, b) => removalWithinCyclesFor(a) - removalWithinCyclesFor(b) || a.healthScore - b.healthScore,
    )
    .slice(0, limit)
    .map((engine) => {
      const workscope = buildEngineWorkscope(engine.id)!;
      const recommended = workscope.scenarios.find((s) => s.id === workscope.recommendedScenarioId)!;
      return {
        engineId: workscope.engineId,
        esn: workscope.esn,
        family: workscope.family,
        operatorCode: workscope.operatorCode,
        operatorName: workscope.operatorName,
        status: workscope.status,
        urgency: workscope.urgency,
        egtMarginC: workscope.egtMarginC,
        healthScore: workscope.healthScore,
        removalWithinCycles: workscope.removalWithinCycles,
        removalBy: workscope.removalBy,
        redModules: recommended.modules.filter((m) => m.severityIndex >= 78).length,
        llpsDue: recommended.llps.length,
        recommendedScenarioId: recommended.id,
        recommendedCostUsd: recommended.costUsd,
        recommendedTatDays: recommended.tatDays,
      };
    });
}

export function workscopeQueueSummary(limit = 14): WorkscopeQueueSummary {
  const candidates = workscopeQueue(limit);
  const workscopes = candidates.map((c) => buildEngineWorkscope(c.engineId)!);
  const recommendedScenarios = workscopes.map((w) => w.scenarios.find((s) => s.id === w.recommendedScenarioId)!);
  const fullOverhauls = workscopes.map((w) => w.scenarios.find((s) => s.id === "full-overhaul")!);
  return {
    candidates: candidates.length,
    urgent: candidates.filter((c) => c.urgency === "red").length,
    committedCostUsd: recommendedScenarios.reduce((sum, s) => sum + s.costUsd, 0),
    averageTatDays: Math.round(
      recommendedScenarios.reduce((sum, s) => sum + s.tatDays, 0) / Math.max(1, recommendedScenarios.length),
    ),
    modulesToOpen: recommendedScenarios.reduce((sum, s) => sum + s.modulesOpened, 0),
    llpsToReplace: recommendedScenarios.reduce((sum, s) => sum + s.llps.length, 0),
    marginRestoredC: round(
      recommendedScenarios.reduce((sum, s) => sum + s.egtMarginRestoredC, 0) / Math.max(1, recommendedScenarios.length),
      1,
    ),
    deferralSavingsUsd:
      fullOverhauls.reduce((sum, s) => sum + s.costUsd, 0) - recommendedScenarios.reduce((sum, s) => sum + s.costUsd, 0),
  };
}
