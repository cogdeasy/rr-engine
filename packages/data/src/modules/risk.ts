/**
 * Failure risk selectors (`risk`, /predict/risk).
 *
 * Everything here is derived from the generated fleet: prognostics supply the
 * failure modes and their probabilities, flights supply the utilisation used to
 * convert calendar time into cycles, work orders supply the next maintenance
 * opportunity, and contracts/aircraft supply the commercial consequence.
 */

import type {
  Aircraft,
  Contract,
  Engine,
  EngineRiskItem,
  FailureModeContribution,
  ModuleCode,
  Operator,
  OperatorRiskExposure,
  Point,
  Prognostic,
  RiskBoard,
  RiskConsequenceBand,
  RiskConsequenceClass,
  RiskExposureTrend,
  RiskLikelihoodBand,
  RiskMatrixCell,
  RiskMitigation,
  RiskMitigationKind,
  RiskSummary,
  StatusLevel,
  WorkOrder,
} from "@rr/types";
import { FAILURE_MODES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Consequence model                                                   */
/* ------------------------------------------------------------------ */

interface ConsequenceSpec {
  consequence: RiskConsequenceClass;
  /** Baseline disruption cost to the operator, USD, before fleet factors. */
  baseCostUsd: number;
  /** How much of the risk a borescope-class inspection can retire, 0-1. */
  inspectionEffectiveness: number;
  /** How much of the risk a take-off derate can retire, 0-1. */
  derateEffectiveness: number;
  inspectionDetail: string;
  derateDetail: string;
  removalDetail: string;
}

/**
 * Consequence is a property of the failure mode, not of the engine: an HPT
 * blade release is an in-flight shutdown wherever it happens, a fan erosion is
 * a fuel-burn penalty.
 */
const CONSEQUENCE_MODEL: Record<string, ConsequenceSpec> = {
  "HPT blade tip oxidation": {
    consequence: "ifsd",
    baseCostUsd: 5_600_000,
    inspectionEffectiveness: 0.62,
    derateEffectiveness: 0.34,
    inspectionDetail: "Borescope HPT stage 1 for tip burn and coating loss",
    derateDetail: "Cap take-off rating at 10% derate to cut turbine entry temperature",
    removalDetail: "Plan HPT module swap at the next available shop slot",
  },
  "HPT NGV cracking": {
    consequence: "aog",
    baseCostUsd: 3_100_000,
    inspectionEffectiveness: 0.58,
    derateEffectiveness: 0.24,
    inspectionDetail: "Borescope NGV throat area, map crack lengths against limits",
    derateDetail: "Apply 8% derate and restrict hot-and-high departures",
    removalDetail: "Schedule unscheduled removal ahead of crack propagation limit",
  },
  "Combustor tile liberation": {
    consequence: "ifsd",
    baseCostUsd: 5_200_000,
    inspectionEffectiveness: 0.66,
    derateEffectiveness: 0.2,
    inspectionDetail: "Borescope combustor tiles and effusion cooling holes",
    derateDetail: "Reduce rating to limit combustor wall temperature",
    removalDetail: "Remove for combustor liner replacement",
  },
  "IPC rotor blade fatigue": {
    consequence: "ifsd",
    baseCostUsd: 4_700_000,
    inspectionEffectiveness: 0.54,
    derateEffectiveness: 0.3,
    inspectionDetail: "Eddy-current survey of IPC rotor blade roots",
    derateDetail: "Avoid resonant N2 dwell by limiting climb thrust",
    removalDetail: "Remove for IPC rotor set replacement",
  },
  "HPC tip rub / efficiency loss": {
    consequence: "delay-cancellation",
    baseCostUsd: 620_000,
    inspectionEffectiveness: 0.48,
    derateEffectiveness: 0.42,
    inspectionDetail: "Borescope HPC tip clearances and abradable liner condition",
    derateDetail: "Derate to restore surge margin and slow rub progression",
    removalDetail: "Remove for HPC re-blade and clearance restoration",
  },
  "Fan blade leading-edge erosion": {
    consequence: "performance",
    baseCostUsd: 210_000,
    inspectionEffectiveness: 0.7,
    derateEffectiveness: 0.18,
    inspectionDetail: "On-wing fan blade blend and leading-edge dressing",
    derateDetail: "Limit exposure to dusty sectors and reduce climb rating",
    removalDetail: "Replace fan blade set at next base input",
  },
  "LPT sulphidation attack": {
    consequence: "aog",
    baseCostUsd: 2_400_000,
    inspectionEffectiveness: 0.5,
    derateEffectiveness: 0.26,
    inspectionDetail: "Borescope LPT stages for sulphidation and coating loss",
    derateDetail: "Derate to lower LPT metal temperatures on long sectors",
    removalDetail: "Remove for LPT module refurbishment",
  },
  "Bearing chamber debris generation": {
    consequence: "ifsd",
    baseCostUsd: 6_100_000,
    inspectionEffectiveness: 0.44,
    derateEffectiveness: 0.16,
    inspectionDetail: "Magnetic chip detector check and oil debris laboratory analysis",
    derateDetail: "Reduce rating and shorten oil sampling interval",
    removalDetail: "Remove engine pending bearing chamber strip",
  },
  "Fuel metering unit drift": {
    consequence: "delay-cancellation",
    baseCostUsd: 480_000,
    inspectionEffectiveness: 0.62,
    derateEffectiveness: 0.12,
    inspectionDetail: "Bench-check and re-trim the fuel metering unit",
    derateDetail: "Restrict to reduced-thrust departures pending trim",
    removalDetail: "Replace fuel metering unit as an on-wing LRU change",
  },
  "Accessory gearbox seal leak": {
    consequence: "delay-cancellation",
    baseCostUsd: 390_000,
    inspectionEffectiveness: 0.6,
    derateEffectiveness: 0.1,
    inspectionDetail: "Inspect gearbox seals and quantify oil loss per sector",
    derateDetail: "Cap thrust to reduce gearbox loads pending seal change",
    removalDetail: "Change accessory gearbox seal pack on wing",
  },
  "Thrust reverser actuator degradation": {
    consequence: "delay-cancellation",
    baseCostUsd: 340_000,
    inspectionEffectiveness: 0.64,
    derateEffectiveness: 0.08,
    inspectionDetail: "Functional test of thrust reverser actuation and locks",
    derateDetail: "Dispatch with reverser deactivated under MEL",
    removalDetail: "Replace actuator assembly at next line opportunity",
  },
  "IPT shaft torsional wear": {
    consequence: "ifsd",
    baseCostUsd: 5_900_000,
    inspectionEffectiveness: 0.4,
    derateEffectiveness: 0.28,
    inspectionDetail: "Torsional vibration survey and spline wear measurement",
    derateDetail: "Limit transient thrust changes to reduce torsional cycling",
    removalDetail: "Remove for IPT shaft inspection and spline rework",
  },
};

const FALLBACK_SPEC: ConsequenceSpec = {
  consequence: "delay-cancellation",
  baseCostUsd: 500_000,
  inspectionEffectiveness: 0.5,
  derateEffectiveness: 0.2,
  inspectionDetail: "Targeted inspection at the next line opportunity",
  derateDetail: "Apply take-off derate pending investigation",
  removalDetail: "Plan removal at the next available slot",
};

const CONSEQUENCE_BAND: Record<RiskConsequenceClass, RiskConsequenceBand> = {
  performance: 1,
  "delay-cancellation": 2,
  aog: 3,
  ifsd: 4,
};

export const RISK_CONSEQUENCE_LABEL: Record<RiskConsequenceClass, string> = {
  performance: "Performance",
  "delay-cancellation": "Delay / cancel",
  aog: "AOG",
  ifsd: "IFSD",
};

export const RISK_LIKELIHOOD_LABEL: Record<RiskLikelihoodBand, string> = {
  1: "Remote",
  2: "Unlikely",
  3: "Possible",
  4: "Likely",
  5: "Probable",
};

/** Wide-body disruption cost scales with the size of the cabin left on the ground. */
const AIRCRAFT_FACTOR: Record<string, number> = {
  "A350-900": 1,
  "A350-1000": 1.12,
  "B787-8": 0.88,
  "B787-9": 0.96,
  "B787-10": 1.04,
  "A330-900neo": 0.9,
  "A380-800": 1.35,
};

/** TotalCare carries the risk on Rolls-Royce's balance sheet, so exposure is higher. */
const CONTRACT_FACTOR: Record<Contract["kind"], number> = {
  TotalCare: 1.18,
  "TotalCare Flex": 1.08,
  SelectCare: 0.95,
  "Time & Materials": 0.82,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Bands are calibrated to the probability of failure before the next opportunity. */
function likelihoodBand(probability: number): RiskLikelihoodBand {
  if (probability < 0.005) return 1;
  if (probability < 0.015) return 2;
  if (probability < 0.04) return 3;
  if (probability < 0.1) return 4;
  return 5;
}

export const RISK_LIKELIHOOD_RANGE: Record<RiskLikelihoodBand, string> = {
  1: "<0.5%",
  2: "0.5-1.5%",
  3: "1.5-4%",
  4: "4-10%",
  5: ">10%",
};

/** Fleet risk tolerance: score 12+ is intolerable, 6+ is on the watchlist. */
export function riskStatus(score: number): StatusLevel {
  if (score >= 12) return "red";
  if (score >= 6) return "amber";
  return "green";
}

/** Cycles flown per calendar day, measured from the last 45 days of sectors. */
function utilisationByAircraft(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const flight of getDataset().flights) {
    counts.set(flight.aircraftId, (counts.get(flight.aircraftId) ?? 0) + flight.cycles);
  }
  const out = new Map<string, number>();
  for (const [aircraftId, cycles] of counts) out.set(aircraftId, cycles / 45);
  return out;
}

interface Opportunity {
  label: string;
  at: string;
  days: number;
}

/**
 * The next point at which the engine can be worked: a planned work order if one
 * exists, otherwise the operator's routine line check slot.
 */
function nextOpportunity(engine: Engine, workOrders: WorkOrder[]): Opportunity {
  const planned = workOrders
    .filter((w) => w.engineId === engine.id && w.state !== "complete" && w.state !== "cancelled")
    .filter((w) => new Date(w.scheduledStart).getTime() > NOW.getTime())
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))[0];
  if (planned) {
    const days = Math.max(1, Math.round((new Date(planned.scheduledStart).getTime() - NOW.getTime()) / 86400000));
    return { label: `${planned.reference} · ${planned.type.replace(/-/g, " ")}`, at: planned.scheduledStart, days };
  }
  const rng = createRng(`${engine.id}:line-slot`);
  const days = rand.int(rng, 12, 52);
  return { label: "Routine line check", at: iso(addDays(NOW, days)), days };
}

function mitigationsFor(
  spec: ConsequenceSpec,
  probability: number,
  consequenceCostUsd: number,
  opportunityDays: number,
  seed: string,
): RiskMitigation[] {
  const rng = createRng(`${seed}:mitigation`);
  const exposure = probability * consequenceCostUsd;

  const defs: { kind: RiskMitigationKind; label: string; detail: string; effectiveness: number; costUsd: number; leadTimeDays: number }[] = [
    {
      kind: "monitor",
      label: "Increase EHM sampling",
      detail: "Sample every sector and re-score at 25-cycle intervals",
      effectiveness: 0.14,
      costUsd: rand.int(rng, 3_000, 12_000),
      leadTimeDays: 0,
    },
    {
      kind: "inspect",
      label: "Inspect at next opportunity",
      detail: spec.inspectionDetail,
      effectiveness: spec.inspectionEffectiveness,
      costUsd: rand.int(rng, 28_000, 145_000),
      leadTimeDays: Math.min(opportunityDays, rand.int(rng, 2, 14)),
    },
    {
      kind: "derate",
      label: "Apply take-off derate",
      detail: spec.derateDetail,
      effectiveness: spec.derateEffectiveness,
      costUsd: rand.int(rng, 42_000, 210_000),
      leadTimeDays: 1,
    },
    {
      kind: "remove",
      label: "Plan removal",
      detail: spec.removalDetail,
      effectiveness: 0.94,
      costUsd: spec.consequence === "ifsd" || spec.consequence === "aog" ? rand.int(rng, 1_900_000, 4_400_000) : rand.int(rng, 240_000, 900_000),
      leadTimeDays: rand.int(rng, 14, 70),
    },
  ];

  const mitigations: RiskMitigation[] = defs.map((def) => {
    const residualProbability = round(probability * (1 - def.effectiveness), 4);
    const residualExposureUsd = Math.round(residualProbability * consequenceCostUsd);
    const score = likelihoodBand(residualProbability) * CONSEQUENCE_BAND[spec.consequence];
    return {
      kind: def.kind,
      label: def.label,
      detail: def.detail,
      leadTimeDays: def.leadTimeDays,
      costUsd: def.costUsd,
      effectiveness: round(def.effectiveness, 2),
      residualProbability,
      residualExposureUsd,
      netBenefitUsd: Math.round(exposure - residualExposureUsd - def.costUsd),
      residualStatus: riskStatus(score),
      recommended: false,
    } satisfies RiskMitigation;
  });

  /**
   * Intolerable risks cannot be answered with monitoring alone, so the choice is
   * restricted to interventions that physically retire the risk. Elsewhere the
   * best net benefit wins, falling back to monitoring when nothing pays for itself.
   */
  const intolerable = riskStatus(likelihoodBand(probability) * CONSEQUENCE_BAND[spec.consequence]) === "red";
  const candidates = intolerable ? mitigations.filter((m) => m.kind !== "monitor") : mitigations;
  const best = candidates.reduce((a, b) => (b.netBenefitUsd > a.netBenefitUsd ? b : a));
  const chosen = intolerable || best.netBenefitUsd > 0 ? best : mitigations[0]!;
  chosen.recommended = true;
  return mitigations;
}

function buildItem(
  prognostic: Prognostic,
  engine: Engine,
  operator: Operator,
  aircraft: Aircraft | undefined,
  contract: Contract | undefined,
  cyclesPerDay: number,
  opportunity: Opportunity,
  corroboratingAlerts: number,
): EngineRiskItem {
  const spec = CONSEQUENCE_MODEL[prognostic.failureMode] ?? FALLBACK_SPEC;
  const cyclesToOpportunity = Math.max(1, Math.round(opportunity.days * cyclesPerDay));

  /**
   * The prognostic gives probability of exceedance over its own horizon. Convert
   * to the shorter maintenance-opportunity window with a constant-hazard model.
   */
  const hazard = -Math.log(Math.max(0.01, 1 - prognostic.probability)) / prognostic.horizonCycles;
  const probability = round(clamp(1 - Math.exp(-hazard * cyclesToOpportunity), 0.001, 0.97), 4);

  const consequenceCostUsd = Math.round(
    spec.baseCostUsd *
      (aircraft ? (AIRCRAFT_FACTOR[aircraft.type] ?? 1) : 0.85) *
      (contract ? CONTRACT_FACTOR[contract.kind] : 1) *
      (1 + engine.environmentSeverity * 0.02),
  );

  const likelihood = likelihoodBand(probability);
  const consequenceBand = CONSEQUENCE_BAND[spec.consequence];
  const riskScore = likelihood * consequenceBand;
  const exposureUsd = Math.round(probability * consequenceCostUsd);
  const mitigations = mitigationsFor(spec, probability, consequenceCostUsd, opportunity.days, prognostic.id);
  const recommended = mitigations.find((m) => m.recommended)!;

  /**
   * Confidence reflects how much independent evidence backs the prognostic:
   * corroborating alerts on the same engine, and how recently it was re-scored.
   */
  const stalenessDays = (NOW.getTime() - new Date(prognostic.computedAt).getTime()) / 86400000;
  const confidence = round(
    clamp(
      0.5 +
        0.06 * Math.min(4, corroboratingAlerts) +
        (stalenessDays <= 1 ? 0.14 : stalenessDays <= 3 ? 0.07 : 0) +
        rand.gaussian(createRng(`${prognostic.id}:confidence`), 0, 0.06),
      0.32,
      0.97,
    ),
    2,
  );

  return {
    id: prognostic.id,
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorId: operator.id,
    operatorCode: operator.code,
    operatorName: operator.name,
    region: operator.region,
    aircraftTail: aircraft?.tail ?? null,
    moduleCode: prognostic.moduleCode,
    failureMode: prognostic.failureMode,
    ataChapter: FAILURE_MODES.find((f) => f.mode === prognostic.failureMode)?.ata ?? "72-00",
    probability,
    likelihoodBand: likelihood,
    consequenceClass: spec.consequence,
    consequenceBand,
    riskScore,
    status: riskStatus(riskScore),
    rationale: `${RISK_LIKELIHOOD_LABEL[likelihood]} (${(probability * 100).toFixed(1)}%) within ${cyclesToOpportunity} cycles to ${opportunity.label}, ${RISK_CONSEQUENCE_LABEL[spec.consequence]} consequence at ${Math.round(consequenceCostUsd / 100_000) / 10}m USD`,
    cyclesToOpportunity,
    opportunityLabel: opportunity.label,
    opportunityAt: opportunity.at,
    consequenceCostUsd,
    exposureUsd,
    confidence,
    confidenceInterval: prognostic.confidenceInterval,
    modelVersion: prognostic.modelVersion,
    computedAt: prognostic.computedAt,
    drivers: [...prognostic.drivers].sort((a, b) => b.contribution - a.contribution),
    mitigations,
    recommendedMitigation: recommended,
    residualExposureUsd: recommended.residualExposureUsd,
  };
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

let cachedBoard: RiskBoard | null = null;

/** Every scored failure mode in the fleet, ranked by expected disruption cost. */
export function getEngineRiskItems(): EngineRiskItem[] {
  return getRiskBoard().items;
}

export function getRiskBoard(): RiskBoard {
  if (cachedBoard) return cachedBoard;
  const data = getDataset();
  const utilisation = utilisationByAircraft();
  const fleetMeanUtilisation =
    [...utilisation.values()].reduce((s, v) => s + v, 0) / Math.max(1, utilisation.size);
  const opportunityByEngine = new Map<string, Opportunity>();

  const items: EngineRiskItem[] = [];
  for (const prognostic of data.prognostics) {
    const engine = data.engines.find((e) => e.id === prognostic.engineId);
    if (!engine) continue;
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    if (!operator) continue;
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const contract = data.contracts.find((c) => c.operatorId === operator.id);
    let opportunity = opportunityByEngine.get(engine.id);
    if (!opportunity) {
      opportunity = nextOpportunity(engine, data.workOrders);
      opportunityByEngine.set(engine.id, opportunity);
    }
    const cyclesPerDay = engine.aircraftId ? (utilisation.get(engine.aircraftId) ?? fleetMeanUtilisation) : fleetMeanUtilisation;
    const ata = FAILURE_MODES.find((f) => f.mode === prognostic.failureMode)?.ata ?? "";
    const openAlerts = data.alerts.filter((a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive");
    // An alert on the same ATA chapter is direct corroboration; any other open
    // alert on the engine is weaker supporting evidence.
    const corroborating = openAlerts.filter((a) => a.ataChapter === ata).length * 2 + openAlerts.filter((a) => a.ataChapter !== ata).length;
    items.push(buildItem(prognostic, engine, operator, aircraft, contract, cyclesPerDay, opportunity, corroborating));
  }

  items.sort((a, b) => b.exposureUsd - a.exposureUsd);

  cachedBoard = {
    generatedAt: iso(NOW),
    summary: summarise(items, data.engines),
    items,
    matrix: buildMatrix(items),
    failureModes: buildFailureModes(items),
    operators: buildOperatorExposure(items),
    trend: buildTrend(items),
  };
  return cachedBoard;
}

function summarise(items: EngineRiskItem[], engines: Engine[]): RiskSummary {
  const scored = new Set(items.map((i) => i.engineId));
  const exposureUsd = items.reduce((s, i) => s + i.exposureUsd, 0);
  const residualExposureUsd = items.reduce((s, i) => s + i.residualExposureUsd, 0);
  const mitigationCostUsd = items
    .filter((i) => i.status !== "green")
    .reduce((s, i) => s + i.recommendedMitigation.costUsd, 0);
  const byMode = new Map<string, number>();
  for (const item of items) byMode.set(item.failureMode, (byMode.get(item.failureMode) ?? 0) + item.exposureUsd);
  const dominant = [...byMode.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const byOperator = new Map<string, number>();
  for (const item of items) byOperator.set(item.operatorCode, (byOperator.get(item.operatorCode) ?? 0) + item.exposureUsd);
  const worstOperator = [...byOperator.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];

  return {
    engines: scored.size,
    scoredItems: items.length,
    intolerable: items.filter((i) => i.status === "red").length,
    watchlist: items.filter((i) => i.status === "amber").length,
    exposureUsd: Math.round(exposureUsd),
    residualExposureUsd: Math.round(residualExposureUsd),
    buydownUsd: Math.round(exposureUsd - residualExposureUsd),
    mitigationCostUsd: Math.round(mitigationCostUsd),
    expectedIfsdEvents: round(items.filter((i) => i.consequenceClass === "ifsd").reduce((s, i) => s + i.probability, 0), 2),
    expectedAogEvents: round(items.filter((i) => i.consequenceClass === "aog").reduce((s, i) => s + i.probability, 0), 2),
    meanConfidence: round(items.reduce((s, i) => s + i.confidence, 0) / Math.max(1, items.length), 2),
    lowConfidenceItems: items.filter((i) => i.confidence < 0.6).length,
    dominantFailureMode: dominant[0],
    dominantFailureModeSharePct: round((dominant[1] / Math.max(1, exposureUsd)) * 100, 1),
    worstOperatorCode: worstOperator[0],
    worstOperatorExposureUsd: Math.round(worstOperator[1]),
    unscoredEngines: engines.filter((e) => !scored.has(e.id)).length,
  };
}

function buildMatrix(items: EngineRiskItem[]): RiskMatrixCell[] {
  const cells: RiskMatrixCell[] = [];
  for (let likelihood = 5; likelihood >= 1; likelihood -= 1) {
    for (let consequence = 1; consequence <= 4; consequence += 1) {
      const inCell = items.filter((i) => i.likelihoodBand === likelihood && i.consequenceBand === consequence);
      const score = likelihood * consequence;
      cells.push({
        likelihood: likelihood as RiskLikelihoodBand,
        consequence: consequence as RiskConsequenceBand,
        count: inCell.length,
        exposureUsd: inCell.reduce((s, i) => s + i.exposureUsd, 0),
        status: inCell.length === 0 ? "grey" : riskStatus(score),
        itemIds: inCell.map((i) => i.id),
      });
    }
  }
  return cells;
}

/** 90-day history for one aggregate, back-cast from today's exposure. */
function backcast(current: number, seed: string, drift: number): Point[] {
  const rng = createRng(seed);
  const points: Point[] = [];
  for (let day = 90; day >= 0; day -= 3) {
    const decay = 1 - (drift * day) / 90;
    const jitter = 1 + rand.gaussian(rng, 0, 0.02);
    points.push({ t: iso(daysAgo(day)), v: Math.round(current * decay * jitter) });
  }
  points[points.length - 1] = { t: iso(NOW), v: Math.round(current) };
  return points;
}

function buildTrend(items: EngineRiskItem[]): RiskExposureTrend {
  const currentUsd = items.reduce((s, i) => s + i.exposureUsd, 0);
  const residualUsd = items.reduce((s, i) => s + i.residualExposureUsd, 0);
  const gross = backcast(currentUsd, "risk:trend:gross", 0.22);
  const residual = backcast(residualUsd, "risk:trend:residual", 0.28);
  const first = gross[0]?.v ?? currentUsd;
  return {
    gross,
    residual,
    deltaPct: round(((currentUsd - first) / Math.max(1, first)) * 100, 1),
    peakUsd: Math.max(...gross.map((p) => p.v)),
    currentUsd: Math.round(currentUsd),
  };
}

function buildFailureModes(items: EngineRiskItem[]): FailureModeContribution[] {
  const total = items.reduce((s, i) => s + i.exposureUsd, 0);
  const groups = new Map<string, EngineRiskItem[]>();
  for (const item of items) {
    const list = groups.get(item.failureMode) ?? [];
    list.push(item);
    groups.set(item.failureMode, list);
  }
  return [...groups.entries()]
    .map(([failureMode, group]) => {
      const exposureUsd = group.reduce((s, i) => s + i.exposureUsd, 0);
      const worst = group.reduce((a, b) => (b.riskScore > a.riskScore ? b : a));
      const intolerable = group.filter((i) => i.status === "red").length;
      return {
        failureMode,
        moduleCode: group[0]!.moduleCode as ModuleCode,
        ataChapter: group[0]!.ataChapter,
        engines: new Set(group.map((i) => i.engineId)).size,
        intolerable,
        meanProbability: round(group.reduce((s, i) => s + i.probability, 0) / group.length, 3),
        exposureUsd: Math.round(exposureUsd),
        sharePct: round((exposureUsd / Math.max(1, total)) * 100, 1),
        residualExposureUsd: Math.round(group.reduce((s, i) => s + i.residualExposureUsd, 0)),
        // A mode is only "act now" when it carries a cluster of intolerable risks.
        status: intolerable >= 5 ? "red" : intolerable > 0 ? "amber" : "green",
        dominantConsequence: worst.consequenceClass,
        history: backcast(exposureUsd, `risk:mode:${failureMode}`, 0.24),
      } satisfies FailureModeContribution;
    })
    .sort((a, b) => b.exposureUsd - a.exposureUsd);
}

function buildOperatorExposure(items: EngineRiskItem[]): OperatorRiskExposure[] {
  const groups = new Map<string, EngineRiskItem[]>();
  for (const item of items) {
    const list = groups.get(item.operatorId) ?? [];
    list.push(item);
    groups.set(item.operatorId, list);
  }
  return [...groups.values()]
    .map((group) => {
      const intolerable = group.filter((i) => i.status === "red").length;
      return {
        operatorId: group[0]!.operatorId,
        operatorCode: group[0]!.operatorCode,
        operatorName: group[0]!.operatorName,
        region: group[0]!.region,
        engines: new Set(group.map((i) => i.engineId)).size,
        intolerable,
        exposureUsd: Math.round(group.reduce((s, i) => s + i.exposureUsd, 0)),
        residualExposureUsd: Math.round(group.reduce((s, i) => s + i.residualExposureUsd, 0)),
        status: intolerable >= 5 ? "red" : intolerable > 0 ? "amber" : "green",
      } satisfies OperatorRiskExposure;
    })
    .sort((a, b) => b.exposureUsd - a.exposureUsd);
}
