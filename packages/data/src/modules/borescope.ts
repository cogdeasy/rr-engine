/**
 * Borescope inspection data.
 *
 * Inspections are derived deterministically from the generated fleet: an
 * engine's condition (health score, hot-section exposure, environment severity)
 * drives how often it is scoped, what the probe finds and how fast each defect
 * grows. Damage sites persist across inspections as "tracks" so a finding can be
 * compared against the same site at the previous inspection.
 */

import type {
  BorescopeDamageType,
  BorescopeDimension,
  BorescopeDisposition,
  BorescopeFinding,
  BorescopeInspection,
  BorescopeLimit,
  BorescopeModuleTrend,
  BorescopeReinspection,
  BorescopeSummary,
  BorescopeTrigger,
  ModuleCode,
  Severity,
  StatusLevel,
} from "@rr/types";
import { ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, daysAgo, iso, NOW, rand, round, type Rng } from "../rng";

/* ------------------------------------------------------------------ */
/* Engine-manual limits                                                */
/* ------------------------------------------------------------------ */

interface DamageSpec {
  damageType: BorescopeDamageType;
  dimension: BorescopeDimension;
  unit: "mm" | "mm²";
  serviceableMax: number;
  repairableMax: number;
  /** Relative likelihood of the damage type appearing in this module. */
  weight: number;
  /** Typical growth per 1,000 cycles for an active site. */
  growthPerKCycles: number;
}

interface ModuleInspectionSpec {
  moduleCode: ModuleCode;
  stages: string[];
  bladesPerStage: number;
  damage: DamageSpec[];
  /** Relative likelihood the module is covered by a given inspection. */
  coverage: number;
  ataChapter: string;
}

const MODULE_SPECS: ModuleInspectionSpec[] = [
  {
    moduleCode: "FAN",
    stages: ["Fan stage 1", "LPC stage 1", "LPC stage 2"],
    bladesPerStage: 22,
    coverage: 0.5,
    ataChapter: "72-30",
    damage: [
      { damageType: "FOD dent", dimension: "depth", unit: "mm", serviceableMax: 0.8, repairableMax: 1.6, weight: 40, growthPerKCycles: 0.02 },
      { damageType: "nick", dimension: "depth", unit: "mm", serviceableMax: 0.5, repairableMax: 1.1, weight: 25, growthPerKCycles: 0.015 },
      { damageType: "erosion", dimension: "depth", unit: "mm", serviceableMax: 1.2, repairableMax: 2.4, weight: 20, growthPerKCycles: 0.05 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 2.0, repairableMax: 4.0, weight: 15, growthPerKCycles: 0.22 },
    ],
  },
  {
    moduleCode: "IPC",
    stages: ["IPC stage 3", "IPC stage 5", "IPC stage 8"],
    bladesPerStage: 46,
    coverage: 0.45,
    ataChapter: "72-40",
    damage: [
      { damageType: "erosion", dimension: "depth", unit: "mm", serviceableMax: 0.9, repairableMax: 1.8, weight: 35, growthPerKCycles: 0.06 },
      { damageType: "coating loss", dimension: "area", unit: "mm²", serviceableMax: 90, repairableMax: 220, weight: 30, growthPerKCycles: 7 },
      { damageType: "tip curl", dimension: "length", unit: "mm", serviceableMax: 1.5, repairableMax: 3.0, weight: 20, growthPerKCycles: 0.09 },
      { damageType: "nick", dimension: "depth", unit: "mm", serviceableMax: 0.4, repairableMax: 0.9, weight: 15, growthPerKCycles: 0.012 },
    ],
  },
  {
    moduleCode: "HPC",
    stages: ["HPC stage 1", "HPC stage 3", "HPC stage 6"],
    bladesPerStage: 58,
    coverage: 0.7,
    ataChapter: "72-45",
    damage: [
      { damageType: "coating loss", dimension: "area", unit: "mm²", serviceableMax: 70, repairableMax: 180, weight: 32, growthPerKCycles: 9 },
      { damageType: "tip curl", dimension: "length", unit: "mm", serviceableMax: 1.2, repairableMax: 2.4, weight: 26, growthPerKCycles: 0.11 },
      { damageType: "erosion", dimension: "depth", unit: "mm", serviceableMax: 0.7, repairableMax: 1.4, weight: 24, growthPerKCycles: 0.05 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 1.6, repairableMax: 3.2, weight: 18, growthPerKCycles: 0.26 },
    ],
  },
  {
    moduleCode: "COMBUSTOR",
    stages: ["Combustor outer tiles", "Combustor inner tiles", "Fuel spray nozzles"],
    bladesPerStage: 40,
    coverage: 0.9,
    ataChapter: "72-50",
    damage: [
      { damageType: "spallation", dimension: "area", unit: "mm²", serviceableMax: 120, repairableMax: 320, weight: 34, growthPerKCycles: 16 },
      { damageType: "burn-through", dimension: "area", unit: "mm²", serviceableMax: 25, repairableMax: 70, weight: 20, growthPerKCycles: 5 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 6.0, repairableMax: 12.0, weight: 28, growthPerKCycles: 0.55 },
      { damageType: "distortion", dimension: "width", unit: "mm", serviceableMax: 2.5, repairableMax: 5.0, weight: 18, growthPerKCycles: 0.14 },
    ],
  },
  {
    moduleCode: "HPT",
    stages: ["HPT stage 1 blades", "HPT stage 1 NGVs", "HPT stage 2 blades"],
    bladesPerStage: 68,
    coverage: 1,
    ataChapter: "72-55",
    damage: [
      { damageType: "coating loss", dimension: "area", unit: "mm²", serviceableMax: 60, repairableMax: 150, weight: 30, growthPerKCycles: 12 },
      { damageType: "cooling-hole blockage", dimension: "area", unit: "mm²", serviceableMax: 12, repairableMax: 30, weight: 18, growthPerKCycles: 2.4 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 3.0, repairableMax: 6.0, weight: 26, growthPerKCycles: 0.48 },
      { damageType: "burn-through", dimension: "area", unit: "mm²", serviceableMax: 18, repairableMax: 45, weight: 12, growthPerKCycles: 4.2 },
      { damageType: "missing material", dimension: "area", unit: "mm²", serviceableMax: 20, repairableMax: 55, weight: 14, growthPerKCycles: 6 },
    ],
  },
  {
    moduleCode: "IPT",
    stages: ["IPT stage 1 blades", "IPT stage 1 NGVs"],
    bladesPerStage: 74,
    coverage: 0.55,
    ataChapter: "72-56",
    damage: [
      { damageType: "coating loss", dimension: "area", unit: "mm²", serviceableMax: 80, repairableMax: 200, weight: 34, growthPerKCycles: 9 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 3.5, repairableMax: 7.0, weight: 26, growthPerKCycles: 0.34 },
      { damageType: "erosion", dimension: "depth", unit: "mm", serviceableMax: 1.0, repairableMax: 2.0, weight: 22, growthPerKCycles: 0.06 },
      { damageType: "spallation", dimension: "area", unit: "mm²", serviceableMax: 110, repairableMax: 260, weight: 18, growthPerKCycles: 11 },
    ],
  },
  {
    moduleCode: "LPT",
    stages: ["LPT stage 2 blades", "LPT stage 4 blades", "LPT stage 6 blades"],
    bladesPerStage: 96,
    coverage: 0.35,
    ataChapter: "72-60",
    damage: [
      { damageType: "erosion", dimension: "depth", unit: "mm", serviceableMax: 1.4, repairableMax: 2.8, weight: 40, growthPerKCycles: 0.05 },
      { damageType: "crack", dimension: "length", unit: "mm", serviceableMax: 4.0, repairableMax: 8.0, weight: 24, growthPerKCycles: 0.28 },
      { damageType: "coating loss", dimension: "area", unit: "mm²", serviceableMax: 140, repairableMax: 330, weight: 22, growthPerKCycles: 8 },
      { damageType: "distortion", dimension: "width", unit: "mm", serviceableMax: 3.0, repairableMax: 6.0, weight: 14, growthPerKCycles: 0.1 },
    ],
  },
];

export const BORESCOPE_LIMITS: BorescopeLimit[] = MODULE_SPECS.flatMap((spec) =>
  spec.damage.map((damage) => ({
    id: `BL-${spec.moduleCode}-${damage.damageType.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 6)}`,
    moduleCode: spec.moduleCode,
    damageType: damage.damageType,
    dimension: damage.dimension,
    unit: damage.unit,
    serviceableMax: damage.serviceableMax,
    repairableMax: damage.repairableMax,
    reference: `EM ${spec.ataChapter}-00 Insp/Check-01`,
  })),
);

export function borescopeModuleLabel(code: ModuleCode): string {
  return ENGINE_MODULES.find((m) => m.code === code)?.label ?? code;
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

const INSPECTORS = [
  "A. Hughes",
  "R. Patel",
  "M. Silva",
  "L. Fischer",
  "K. Okafor",
  "Y. Haddad",
  "C. Wei",
  "N. Lindqvist",
];

const PROBES = ["Olympus IPLEX NX 6.0mm", "Olympus IPLEX GX 4.0mm", "GE Mentor Visual iQ 6.1mm", "Karl Storz 8.4mm rigid"];

function severityFor(ratio: number): Severity {
  if (ratio >= 1.6) return "critical";
  if (ratio >= 1) return "high";
  if (ratio >= 0.85) return "medium";
  if (ratio >= 0.6) return "low";
  return "info";
}

function dispositionFor(ratio: number, repairRatio: number): BorescopeDisposition {
  if (ratio > repairRatio) return "remove";
  if (ratio > 1) return "repair";
  if (ratio >= 0.8) return "monitor";
  return "serviceable";
}

function statusFor(disposition: BorescopeDisposition): StatusLevel {
  if (disposition === "remove") return "red";
  if (disposition === "repair") return "red";
  if (disposition === "monitor") return "amber";
  return "green";
}

function recommendedActionFor(
  disposition: BorescopeDisposition,
  damageType: BorescopeDamageType,
  stage: string,
  cyclesToLimit: number | null,
): string {
  switch (disposition) {
    case "remove":
      return `Beyond repairable limit — schedule engine removal and ${stage.split(" ")[0]} module strip within 10 cycles.`;
    case "repair":
      return `Raise on-wing repair task for the ${damageType} at ${stage}; blend/patch to the approved scheme before further flight.`;
    case "monitor":
      return cyclesToLimit !== null && cyclesToLimit < 900
        ? `Re-inspect within ${Math.max(100, Math.round(cyclesToLimit / 100) * 100)} cycles — projected to reach the serviceable limit at the current growth rate.`
        : "Retain in service on a shortened repeat interval and trend at the next scheduled inspection.";
    default:
      return "Within serviceable limits — no action beyond the standard repeat interval.";
  }
}

function triggerFor(rng: Rng, hasAlert: boolean, index: number): BorescopeTrigger {
  if (hasAlert && index === 0) return "alert-driven";
  return rand.weighted<BorescopeTrigger>(rng, [
    { value: "scheduled", weight: 46 },
    { value: "repeat", weight: 28 },
    { value: "SB/AD compliance", weight: 12 },
    { value: "alert-driven", weight: 9 },
    { value: "post-event", weight: 5 },
  ]);
}

interface BorescopeData {
  inspections: BorescopeInspection[];
  findings: BorescopeFinding[];
}

let cached: BorescopeData | null = null;

function build(): BorescopeData {
  const data = getDataset();
  const inspections: BorescopeInspection[] = [];
  const findings: BorescopeFinding[] = [];
  let inspectionN = 0;
  let findingN = 0;

  for (const engine of data.engines) {
    const rng = createRng(`borescope:${engine.id}`);
    // Hot, harsh-environment and low-health engines are scoped more often.
    const exposure = clamp(
      (100 - engine.healthScore) / 100 + engine.environmentSeverity / 12 + (engine.lifeStage === "pre-shop-visit" ? 0.25 : 0),
      0.15,
      1.6,
    );
    if (!rand.bool(rng, clamp(0.42 + exposure * 0.4, 0.3, 0.95))) continue;

    const engineAlerts = data.alerts.filter((a) => a.engineId === engine.id && a.state !== "closed");
    const hasAlert = engineAlerts.some((a) => a.source === "borescope" || a.severity === "critical");
    const facility = rand.pick(rng, data.facilities);
    const inspector = rand.pick(rng, INSPECTORS);

    const historyCount = rand.int(rng, 2, 4);
    /** Damage sites that persist between visits, keyed by track id. */
    const tracks = new Map<string, { spec: DamageSpec; moduleCode: ModuleCode; stage: string; blade: number | null; clock: number; measured: number; inspectionId: string; observedAt: string; findingId: string; cycles: number }>();

    // Oldest inspection first so tracks progress forwards in time.
    const spacingCycles = rand.int(rng, 420, 1400);
    for (let visit = historyCount - 1; visit >= 0; visit -= 1) {
      inspectionN += 1;
      const inspectionId = `BI-${String(inspectionN).padStart(4, "0")}`;
      // Time already flown since the latest visit is what drives the repeat-inspection clock.
      const sinceLatest = rand.weighted(rng, [
        { value: rand.int(rng, 5, 220), weight: 74 },
        { value: rand.int(rng, 220, 520), weight: 19 },
        { value: rand.int(rng, 520, 1100), weight: 7 },
      ]);
      const offset = visit === 0 ? Math.min(sinceLatest, spacingCycles - 80) : rand.int(rng, 0, 120);
      const cyclesAtInspection = Math.max(200, engine.totalFlightCycles - visit * spacingCycles - offset);
      const cyclesSince = engine.totalFlightCycles - cyclesAtInspection;
      const daysSince = Math.round(cyclesSince / rand.float(rng, 1.1, 2.6)) + rand.int(rng, 1, 20);
      const performedAt = daysAgo(clamp(daysSince, 2, 900));
      const modules = MODULE_SPECS.filter((spec) => rand.bool(rng, spec.coverage));
      if (modules.length === 0) modules.push(MODULE_SPECS.find((m) => m.moduleCode === "HPT")!);

      const visitFindings: BorescopeFinding[] = [];

      for (const spec of modules) {
        // Carry forward existing tracks in this module.
        for (const [trackId, track] of tracks) {
          if (track.moduleCode !== spec.moduleCode) continue;
          const deltaCycles = cyclesAtInspection - track.cycles;
          if (deltaCycles <= 0) continue;
          const growth = (track.spec.growthPerKCycles * deltaCycles) / 1000;
          const measured = round(track.measured + growth * rand.float(rng, 0.55, 1.9), track.spec.unit === "mm" ? 2 : 0);
          visitFindings.push(
            makeFinding({
              rng,
              findingN: (findingN += 1),
              inspectionId,
              engineId: engine.id,
              spec: track.spec,
              moduleCode: spec.moduleCode,
              stage: track.stage,
              blade: track.blade,
              clock: track.clock,
              measured,
              trackId,
              previous: track,
              observedAt: iso(performedAt),
              inspector,
              cyclesAtInspection,
            }),
          );
        }

        // New sites found at this visit.
        const newSites = rand.weighted(rng, [
          { value: 0, weight: 34 },
          { value: 1, weight: 32 },
          { value: 2, weight: 20 * exposure },
          { value: 3, weight: 9 * exposure },
        ]);
        for (let i = 0; i < newSites; i += 1) {
          const damage = rand.weighted(
            rng,
            spec.damage.map((d) => ({ value: d, weight: d.weight })),
          );
          const stage = rand.pick(rng, spec.stages);
          const blade = rand.int(rng, 1, spec.bladesPerStage);
          const clock = rand.int(rng, 1, 12);
          const trackId = `BT-${engine.id}-${spec.moduleCode}-${blade}-${damage.damageType.slice(0, 3)}`;
          if (tracks.has(trackId)) continue;
          // New damage is usually well inside limits; harsh operation biases it up. A rare
          // severe event (bird strike, liberated material) lands beyond the repairable limit.
          const severeEvent = rand.bool(rng, 0.012 * exposure);
          const repairRatio = damage.repairableMax / damage.serviceableMax;
          const ratio = severeEvent
            ? rand.float(rng, repairRatio + 0.05, repairRatio + 0.6)
            : clamp(rand.gaussian(rng, 0.42 + exposure * 0.22, 0.24), 0.08, 1.45);
          const measured = round(damage.serviceableMax * ratio, damage.unit === "mm" ? 2 : 0);
          const finding = makeFinding({
            rng,
            findingN: (findingN += 1),
            inspectionId,
            engineId: engine.id,
            spec: damage,
            moduleCode: spec.moduleCode,
            stage,
            blade,
            clock,
            measured,
            trackId,
            previous: null,
            observedAt: iso(performedAt),
            inspector,
            cyclesAtInspection,
          });
          visitFindings.push(finding);
        }
      }

      // Record the state of every site seen at this visit for the next one.
      for (const finding of visitFindings) {
        const spec = MODULE_SPECS.find((m) => m.moduleCode === finding.moduleCode)!.damage.find(
          (d) => d.damageType === finding.damageType,
        )!;
        if (finding.disposition === "remove" || finding.disposition === "repair") {
          tracks.delete(finding.trackId);
          continue;
        }
        tracks.set(finding.trackId, {
          spec,
          moduleCode: finding.moduleCode,
          stage: finding.stage,
          blade: finding.bladeNumber,
          clock: finding.clockPosition,
          measured: finding.measured,
          inspectionId,
          observedAt: finding.observedAt,
          findingId: finding.id,
          cycles: cyclesAtInspection,
        });
      }

      findings.push(...visitFindings);

      const exceedances = visitFindings.filter((f) => f.exceedsServiceable).length;
      const worstDisposition = worstOf(visitFindings.map((f) => f.disposition));
      // The worse the findings, the tighter the agreed repeat interval.
      const intervalCycles =
        worstDisposition === "remove"
          ? 0
          : worstDisposition === "repair"
            ? rand.int(rng, 100, 250)
            : worstDisposition === "monitor"
              ? rand.int(rng, 250, 600)
              : rand.int(rng, 700, 1600);
      const cyclesToNextDue = intervalCycles === 0 ? 0 : intervalCycles - cyclesSince;
      const isLatest = visit === 0;

      inspections.push({
        id: inspectionId,
        reference: `BSI-${engine.esn.replace("ESN-", "")}-${String(historyCount - visit).padStart(2, "0")}`,
        engineId: engine.id,
        operatorId: engine.operatorId,
        aircraftId: engine.aircraftId,
        facilityId: facility.id,
        trigger: triggerFor(rng, hasAlert, visit),
        performedAt: iso(performedAt),
        inspector,
        probe: rand.pick(rng, PROBES),
        modulesInspected: modules.map((m) => m.moduleCode),
        cyclesAtInspection,
        findingCount: visitFindings.length,
        exceedanceCount: exceedances,
        worstDisposition,
        status: statusFor(worstDisposition),
        intervalCycles,
        cyclesSince,
        cyclesToNextDue,
        nextDueAt: iso(addDays(performedAt, Math.round(intervalCycles / 1.6))),
        overdue: isLatest && intervalCycles > 0 && cyclesToNextDue < 0,
        summary: summaryLine(visitFindings, modules.length),
      });
    }
  }

  inspections.sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
  return { inspections, findings };
}

function summaryLine(findings: BorescopeFinding[], moduleCount: number): string {
  if (findings.length === 0) return `No reportable damage across ${moduleCount} modules scoped.`;
  const worst = [...findings].sort((a, b) => b.limitRatio - a.limitRatio)[0]!;
  return `${findings.length} finding${findings.length === 1 ? "" : "s"} across ${moduleCount} modules; worst is ${worst.damageType} at ${worst.stage} at ${Math.round(worst.limitRatio * 100)}% of the serviceable limit.`;
}

function worstOf(dispositions: BorescopeDisposition[]): BorescopeDisposition {
  const order: BorescopeDisposition[] = ["serviceable", "monitor", "repair", "remove"];
  return dispositions.reduce<BorescopeDisposition>(
    (worst, d) => (order.indexOf(d) > order.indexOf(worst) ? d : worst),
    "serviceable",
  );
}

function makeFinding(args: {
  rng: Rng;
  findingN: number;
  inspectionId: string;
  engineId: string;
  spec: DamageSpec;
  moduleCode: ModuleCode;
  stage: string;
  blade: number | null;
  clock: number;
  measured: number;
  trackId: string;
  previous: { measured: number; inspectionId: string; observedAt: string; cycles: number } | null;
  observedAt: string;
  inspector: string;
  cyclesAtInspection: number;
}): BorescopeFinding {
  const { rng, spec, measured, previous } = args;
  const ratio = round(measured / spec.serviceableMax, 3);
  const repairRatio = spec.repairableMax / spec.serviceableMax;
  const disposition = dispositionFor(ratio, repairRatio);
  const deltaCycles = previous ? Math.max(1, args.cyclesAtInspection - previous.cycles) : null;
  const growthPerKCycles =
    previous && deltaCycles ? round(((measured - previous.measured) / deltaCycles) * 1000, spec.unit === "mm" ? 3 : 1) : null;
  const headroom = spec.serviceableMax - measured;
  const cyclesToServiceableLimit =
    growthPerKCycles !== null && growthPerKCycles > 0 && headroom > 0
      ? Math.round((headroom / growthPerKCycles) * 1000)
      : null;

  return {
    id: `BF-${String(args.findingN).padStart(5, "0")}`,
    inspectionId: args.inspectionId,
    engineId: args.engineId,
    moduleCode: args.moduleCode,
    stage: args.stage,
    bladeNumber: args.blade,
    clockPosition: args.clock,
    damageType: spec.damageType,
    dimension: spec.dimension,
    unit: spec.unit,
    measured,
    serviceableLimit: spec.serviceableMax,
    repairableLimit: spec.repairableMax,
    limitRatio: ratio,
    exceedsServiceable: measured > spec.serviceableMax,
    exceedsRepairable: measured > spec.repairableMax,
    severity: severityFor(ratio),
    status: statusFor(disposition),
    disposition,
    recommendedAction: recommendedActionFor(disposition, spec.damageType, args.stage, cyclesToServiceableLimit),
    imageSeed: `${args.trackId}:${args.inspectionId}`,
    trackId: args.trackId,
    previousMeasured: previous?.measured ?? null,
    previousInspectionId: previous?.inspectionId ?? null,
    previousObservedAt: previous?.observedAt ?? null,
    growthPerKCycles,
    cyclesToServiceableLimit,
    observedAt: args.observedAt,
    inspector: args.inspector,
    notes: `${spec.damageType} observed at ${args.clock} o'clock${args.blade ? `, aerofoil ${args.blade}` : ""}; probe measurement taken with 3D phase measurement, ${rand.int(rng, 2, 4)} passes.`,
    limitReference: `EM ${ENGINE_MODULES.find((m) => m.code === args.moduleCode)?.ataChapter ?? "72-00"}-00 Insp/Check-01`,
  };
}

function getBorescopeData(): BorescopeData {
  if (!cached) cached = build();
  return cached;
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function getBorescopeInspections(): BorescopeInspection[] {
  return getBorescopeData().inspections;
}

export function getBorescopeFindings(): BorescopeFinding[] {
  return getBorescopeData().findings;
}

export function getBorescopeInspection(inspectionId: string): BorescopeInspection | undefined {
  return getBorescopeData().inspections.find((i) => i.id === inspectionId);
}

export function getFindingsForInspection(inspectionId: string): BorescopeFinding[] {
  return getBorescopeData().findings.filter((f) => f.inspectionId === inspectionId);
}

export function getBorescopeFinding(findingId: string): BorescopeFinding | undefined {
  return getBorescopeData().findings.find((f) => f.id === findingId);
}

/** Latest inspection per engine — the current state of the fleet. */
export function getLatestInspections(): BorescopeInspection[] {
  const latest = new Map<string, BorescopeInspection>();
  for (const inspection of getBorescopeData().inspections) {
    const current = latest.get(inspection.engineId);
    if (!current || current.performedAt < inspection.performedAt) latest.set(inspection.engineId, inspection);
  }
  return [...latest.values()].sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
}

/** Findings from the latest inspection of each engine, worst first. */
export function getOpenBorescopeFindings(): BorescopeFinding[] {
  const latestIds = new Set(getLatestInspections().map((i) => i.id));
  return getBorescopeData()
    .findings.filter((f) => latestIds.has(f.inspectionId))
    .sort((a, b) => b.limitRatio - a.limitRatio);
}

/** The same damage site at every inspection that recorded it, oldest first. */
export function getFindingProgression(findingId: string): BorescopeFinding[] {
  const finding = getBorescopeFinding(findingId);
  if (!finding) return [];
  return getBorescopeData()
    .findings.filter((f) => f.trackId === finding.trackId)
    .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
}

export function borescopeSummary(): BorescopeSummary {
  const { inspections, findings } = getBorescopeData();
  const open = getOpenBorescopeFindings();
  const reinspections = getReinspectionQueue();
  const thirtyDaysAgo = iso(daysAgo(30));
  const intervals = inspections.filter((i) => i.intervalCycles > 0).map((i) => i.intervalCycles).sort((a, b) => a - b);

  return {
    inspections: inspections.length,
    inspectionsLast30Days: inspections.filter((i) => i.performedAt >= thirtyDaysAgo).length,
    findings: findings.length,
    openExceedances: open.filter((f) => f.exceedsServiceable).length,
    enginesWithExceedance: new Set(open.filter((f) => f.exceedsServiceable).map((f) => f.engineId)).size,
    removalCandidates: open.filter((f) => f.disposition === "remove").length,
    repairCandidates: open.filter((f) => f.disposition === "repair").length,
    monitorCount: open.filter((f) => f.disposition === "monitor").length,
    overdueEngines: reinspections.filter((r) => r.status === "red").length,
    dueSoonEngines: reinspections.filter((r) => r.status === "amber").length,
    medianIntervalCycles: intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)]! : 0,
  };
}

/** Engines whose repeat inspection is overdue (red) or due inside 150 cycles (amber). */
export function getReinspectionQueue(): BorescopeReinspection[] {
  const data = getDataset();
  const out: BorescopeReinspection[] = [];
  for (const inspection of getLatestInspections()) {
    if (inspection.intervalCycles === 0) continue;
    const engine = data.engines.find((e) => e.id === inspection.engineId);
    if (!engine) continue;
    const status: StatusLevel =
      inspection.cyclesToNextDue < 0 ? "red" : inspection.cyclesToNextDue <= 150 ? "amber" : "green";
    if (status === "green") continue;
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    out.push({
      engineId: engine.id,
      esn: engine.esn,
      operatorCode: operator?.code ?? "—",
      family: engine.family,
      tail: aircraft?.tail ?? null,
      lastInspectionId: inspection.id,
      lastInspectedAt: inspection.performedAt,
      intervalCycles: inspection.intervalCycles,
      cyclesSince: inspection.cyclesSince,
      cyclesToNextDue: inspection.cyclesToNextDue,
      nextDueAt: inspection.nextDueAt,
      status,
      driver:
        inspection.worstDisposition === "repair"
          ? "Repair-band finding under repetitive inspection"
          : inspection.worstDisposition === "monitor"
            ? "Monitored finding approaching the serviceable limit"
            : "Standard repeat interval",
    });
  }
  return out.sort((a, b) => a.cyclesToNextDue - b.cyclesToNextDue);
}

/** Findings by engine module and severity across the fleet, with quarterly history. */
export function getBorescopeModuleTrends(): BorescopeModuleTrend[] {
  const { findings, inspections } = getBorescopeData();
  const quarters = quarterBuckets(6);

  return MODULE_SPECS.map((spec): BorescopeModuleTrend => {
    const moduleFindings = findings.filter((f) => f.moduleCode === spec.moduleCode);
    const coveringInspections = inspections.filter((i) => i.modulesInspected.includes(spec.moduleCode)).length;
    const red = moduleFindings.filter((f) => f.status === "red").length;
    const amber = moduleFindings.filter((f) => f.status === "amber").length;
    const green = moduleFindings.length - red - amber;
    return {
      moduleCode: spec.moduleCode,
      label: borescopeModuleLabel(spec.moduleCode),
      total: moduleFindings.length,
      red,
      amber,
      green,
      findingRate: coveringInspections > 0 ? round(moduleFindings.length / coveringInspections, 2) : 0,
      status: red > 0 && red / Math.max(1, moduleFindings.length) > 0.12 ? "red" : amber > 0 ? "amber" : "green",
      history: quarters.map((q) => {
        const inQuarter = moduleFindings.filter((f) => f.observedAt >= q.from && f.observedAt < q.to);
        return {
          period: q.label,
          total: inQuarter.length,
          exceedances: inQuarter.filter((f) => f.exceedsServiceable).length,
        };
      }),
    };
  }).sort((a, b) => b.red - a.red || b.total - a.total);
}

function quarterBuckets(count: number): { label: string; from: string; to: string }[] {
  const buckets: { label: string; from: string; to: string }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const end = new Date(NOW.getFullYear(), NOW.getMonth() - i * 3 + 1, 1);
    const start = new Date(NOW.getFullYear(), NOW.getMonth() - i * 3 - 2, 1);
    buckets.push({
      label: `Q${Math.floor(start.getMonth() / 3) + 1} ${String(start.getFullYear()).slice(2)}`,
      from: start.toISOString(),
      to: end.toISOString(),
    });
  }
  return buckets;
}
