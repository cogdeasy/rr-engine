/**
 * Selectors for the `engine-detail` module.
 *
 * Everything the per-engine dossier and its 3D twin render is derived here from
 * the deterministic dataset, so the page, the API and tests agree exactly.
 */

import type {
  Alert,
  EngineDossier,
  EngineFlightSummary,
  EngineRecommendedAction,
  EngineTwinAsset,
  ModuleCondition,
  ModuleCode,
  ModuleParameterReading,
  ParameterId,
  Prognostic,
  Series,
  StatusLevel,
} from "@rr/types";
import { ENGINE_3D_ASSETS, ENGINE_FAMILIES, ENGINE_MODULES, FAILURE_MODES, PARAMETERS } from "../catalog";
import { engineSeries, latestTelemetry } from "../generate";
import { getDataset, getEngine, severityRank, statusRank } from "../index";

/** Parameters an engineer looks at first when judging each physical module. */
const MODULE_PARAMETERS: Record<ModuleCode, ParameterId[]> = {
  FAN: ["vibN1", "n1"],
  IPC: ["vibN2", "n2"],
  HPC: ["n3", "t30", "p30"],
  COMBUSTOR: ["egt", "egtMargin"],
  HPT: ["egt", "tipClearance"],
  IPT: ["vibN2", "n2"],
  LPT: ["vibN1", "egt"],
  GEARBOX: ["oilTemp", "oilPressure"],
  ACCESSORY: ["fuelFlow", "oilPressure"],
  NACELLE: ["bleedPressure"],
  EXTERNALS: ["oilDebrisCount", "oilConsumption"],
};

/**
 * Ordered glTF node-name patterns that bind marketing model geometry to the
 * maintenance module breakdown. The Rolls-Royce assets name their meshes by
 * build module (`M01`…`M08`) and by system, so the first matching rule wins.
 */
const GLTF_NODE_RULES: { code: ModuleCode; pattern: RegExp }[] = [
  { code: "COMBUSTOR", pattern: /combusti?on|combustor/i },
  { code: "HPT", pattern: /hpturbine|hp turbine|hpblades|hp system blades|hpstaticblades|hp staticblades|minidisc/i },
  { code: "IPT", pattern: /ipturbine|ip turbine|_m07|m051|ipblades|ipbladessection/i },
  { code: "LPT", pattern: /lpturbine|lp turbine|_m08|m052|backblades/i },
  { code: "GEARBOX", pattern: /gearbox|imgear|sungear|planetgear|_m05_|m061|m062|_gb/i },
  { code: "HPC", pattern: /hpsystem|hpcomp|hp comp|_m06|m041|hpsys/i },
  { code: "IPC", pattern: /ipcomp|ip comp|_m03|m032|vsv|essvane/i },
  { code: "NACELLE", pattern: /fancase|fan case|lpcompressorcase|nacelle|cowl|reverser|_m02|imcase|_m04/i },
  { code: "FAN", pattern: /fanblade|fan blade|nosecone|_m01|m031|lpfan|lpcomp/i },
  { code: "EXTERNALS", pattern: /bearing|shaft|annulus/i },
  { code: "ACCESSORY", pattern: /_fu_|_ac_|_ms_|_oi_|_fa_|_sa_|manifold|pump|nozzle|probe|hmu|panel|harness|external|airflow/i },
];

/** Maps a glTF node name from an official RR engine asset to a maintenance module. */
export function moduleCodeForGltfNode(nodeName: string): ModuleCode | null {
  for (const rule of GLTF_NODE_RULES) {
    if (rule.pattern.test(nodeName)) return rule.code;
  }
  return null;
}

export function statusForParameter(parameter: ParameterId, value: number): StatusLevel {
  const def = PARAMETERS[parameter];
  if (!Number.isFinite(value)) return "grey";
  if (def.direction === "higher-is-worse") {
    if (value >= def.red.min) return "red";
    if (value >= def.amber.min) return "amber";
    return "green";
  }
  if (value <= def.red.max) return "red";
  if (value <= def.amber.max) return "amber";
  return "green";
}

function reading(parameter: ParameterId, value: number | undefined): ModuleParameterReading | null {
  if (value === undefined) return null;
  const def = PARAMETERS[parameter];
  const worse = def.direction === "higher-is-worse";
  return {
    id: parameter,
    label: def.label,
    unit: def.unit,
    value,
    status: statusForParameter(parameter, value),
    amber: worse ? def.amber.min : def.amber.max,
    red: worse ? def.red.min : def.red.max,
    min: worse ? def.nominal.min : def.red.min,
    max: worse ? def.red.max : def.nominal.max,
    direction: def.direction,
  };
}

function isOpen(alert: Alert): boolean {
  return alert.state !== "closed" && alert.state !== "false-positive";
}

/**
 * Alerts carry the failure mode's ATA chapter, which is finer than the module's
 * own chapter for some modes (73-21 vs 73-00, 78-30 vs 78-00), so both
 * vocabularies are indexed.
 */
const MODULE_BY_ATA: Map<string, ModuleCode> = new Map([
  ...ENGINE_MODULES.map((m) => [m.ataChapter, m.code] as const),
  ...FAILURE_MODES.map((f) => [f.ata, f.module] as const),
]);

function moduleForAtaChapter(ataChapter: string): ModuleCode | null {
  return MODULE_BY_ATA.get(ataChapter) ?? null;
}

/** Alerts are raised against a failure mode, which the catalog maps to a module. */
function alertsByModule(alerts: Alert[]): Map<ModuleCode, Alert[]> {
  const byModule = new Map<ModuleCode, Alert[]>();
  for (const alert of alerts) {
    const code = moduleForAtaChapter(alert.ataChapter);
    if (!code) continue;
    const bucket = byModule.get(code) ?? [];
    bucket.push(alert);
    byModule.set(code, bucket);
  }
  return byModule;
}

function describeReason(
  status: StatusLevel,
  lifeConsumedPct: number,
  drivingAlert: Alert | null,
  prognostic: Prognostic | null,
  worstReading: ModuleParameterReading | null,
): string {
  if (drivingAlert && (drivingAlert.status === "red" || drivingAlert.status === "amber")) {
    return `${drivingAlert.source} alert: ${drivingAlert.title.split(" — ")[0]} (ATA ${drivingAlert.ataChapter}).`;
  }
  if (worstReading && worstReading.status !== "green") {
    return `${worstReading.label} at ${worstReading.value}${worstReading.unit} against a ${worstReading.status} limit of ${worstReading.status === "red" ? worstReading.red : worstReading.amber}${worstReading.unit}.`;
  }
  if (status !== "green") {
    return `${lifeConsumedPct}% of certified module life consumed${prognostic ? `; ${Math.round(prognostic.probability * 100)}% risk of ${prognostic.failureMode.toLowerCase()} within ${prognostic.horizonCycles} cycles` : ""}.`;
  }
  return `Within limits — ${lifeConsumedPct}% of certified life consumed, no open findings.`;
}

/** Per-module condition for one engine: status, drivers, live readings and action. */
export function engineModuleConditions(engineId: string): ModuleCondition[] {
  const engine = getEngine(engineId);
  if (!engine) return [];
  const data = getDataset();
  const telemetry = latestTelemetry(engine);
  const alerts = data.alerts.filter((a) => a.engineId === engine.id && isOpen(a));
  const byModule = alertsByModule(alerts);
  const prognostics = data.prognostics.filter((p) => p.engineId === engine.id);

  return data.engineModules
    .filter((m) => m.engineId === engine.id)
    .map((module) => {
      const spec = ENGINE_MODULES.find((s) => s.code === module.code)!;
      const moduleAlerts = [...(byModule.get(module.code) ?? [])].sort(
        (a, b) => severityRank(b.severity) - severityRank(a.severity),
      );
      const drivingAlert = moduleAlerts[0] ?? null;
      const prognostic =
        [...prognostics.filter((p) => p.moduleCode === module.code)].sort((a, b) => b.probability - a.probability)[0] ??
        null;
      const readings = MODULE_PARAMETERS[module.code]
        .map((parameter) => reading(parameter, telemetry.values[parameter]))
        .filter((r): r is ModuleParameterReading => r !== null);
      const worstReading =
        [...readings].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0] ?? null;

      // A module is as bad as the worst of: its life consumption, its open
      // alerts and its live readings — colour always has a single explanation.
      const status = [
        module.status,
        drivingAlert?.status ?? "green",
        worstReading?.status ?? "green",
      ].sort((a, b) => statusRank(b) - statusRank(a))[0] as StatusLevel;

      return {
        code: module.code,
        label: module.label,
        description: spec.description,
        ataChapter: spec.ataChapter,
        status,
        lifeConsumedPct: module.lifeConsumedPct,
        lastInspectedAt: module.lastInspectedAt,
        gltfNodes: module.gltfNodes,
        openAlertIds: moduleAlerts.map((a) => a.id),
        drivingAlert,
        prognostic,
        readings,
        reason: describeReason(status, module.lifeConsumedPct, drivingAlert, prognostic, worstReading),
        recommendedAction:
          drivingAlert?.recommendedAction ??
          (status === "red"
            ? "Raise a module inspection work order at the next available slot"
            : status === "amber"
              ? "Keep on the watchlist and re-baseline after the next flight cycle"
              : null),
      } satisfies ModuleCondition;
    })
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.lifeConsumedPct - a.lifeConsumedPct);
}

/** The single decision the dossier leads with. */
export function engineRecommendedAction(engineId: string, precomputedModules?: ModuleCondition[]): EngineRecommendedAction {
  const engine = getEngine(engineId);
  if (!engine) {
    return {
      status: "grey",
      headline: "Engine not found",
      detail: "No dossier is available for this serial number.",
      dueInHours: null,
      moduleCode: null,
      alertId: null,
      cta: "Back to engine explorer",
    };
  }
  const data = getDataset();
  const openAlerts = data.alerts
    .filter((a) => a.engineId === engine.id && isOpen(a))
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        (a.timeToActionHours ?? Number.MAX_SAFE_INTEGER) - (b.timeToActionHours ?? Number.MAX_SAFE_INTEGER),
    );
  const driver = openAlerts[0];
  const worstModule = (precomputedModules ?? engineModuleConditions(engine.id))[0];

  if (driver) {
    return {
      status: driver.status,
      headline: driver.recommendedAction,
      detail: `${driver.severity} ${driver.source} finding on ${engine.esn}: ${driver.title.split(" — ")[0]} (ATA ${driver.ataChapter}). ${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"} on this engine.`,
      dueInHours: driver.timeToActionHours,
      moduleCode: worstModule?.code ?? null,
      alertId: driver.id,
      cta: driver.status === "red" ? "Raise work order" : "Add to watchlist",
    };
  }

  const prognostic = [...data.prognostics.filter((p) => p.engineId === engine.id)].sort(
    (a, b) => b.probability - a.probability,
  )[0];

  if (prognostic && prognostic.probability > 0.35) {
    return {
      status: "amber",
      headline: `Plan a ${prognostic.moduleCode} inspection before ${prognostic.rulCycles} cycles`,
      detail: `Prognostic model ${prognostic.modelVersion} gives a ${Math.round(prognostic.probability * 100)}% probability of ${prognostic.failureMode.toLowerCase()} within ${prognostic.horizonCycles} cycles.`,
      dueInHours: null,
      moduleCode: prognostic.moduleCode,
      alertId: null,
      cta: "Open workscope planner",
    };
  }

  return {
    status: "green",
    headline: "No action required — continue in service",
    detail: `All modules within limits. ${engine.egtMargin}°C EGT margin remaining and ${engine.rulCycles} cycles of predicted useful life.`,
    dueInHours: null,
    moduleCode: null,
    alertId: null,
    cta: "Review trends",
  };
}

/** Trend parameters shown on the dossier's Trends tab. */
export const ENGINE_DETAIL_TREND_PARAMETERS: ParameterId[] = ["egtMargin", "vibN1", "oilConsumption", "fuelFlow"];

export function engineTrendSeries(engineId: string, days = 180): Series[] {
  const engine = getEngine(engineId);
  if (!engine) return [];
  return ENGINE_DETAIL_TREND_PARAMETERS.map((parameter) => engineSeries(engine, parameter, days));
}

/** The GLB asset backing an engine's twin, or null when the family has none. */
export function engineTwinAsset(engineId: string): EngineTwinAsset | null {
  const engine = getEngine(engineId);
  if (!engine) return null;
  const spec = ENGINE_FAMILIES.find((f) => f.family === engine.family);
  if (!spec?.modelAsset) return null;
  const asset = ENGINE_3D_ASSETS[spec.modelAsset];
  if (!asset) return null;
  return {
    key: spec.modelAsset,
    label: asset.label,
    url: asset.url,
    localPath: asset.localPath,
    explodeClip: "ANIM_Separation",
    recombineClip: "ANIM_Recombine",
  };
}

/** The complete per-engine dossier consumed by the page and by the API. */
export function engineDossier(engineId: string): EngineDossier | null {
  const engine = getEngine(engineId);
  if (!engine) return null;
  const data = getDataset();
  const spec = ENGINE_FAMILIES.find((f) => f.family === engine.family)!;
  const workOrders = data.workOrders
    .filter((w) => w.engineId === engine.id)
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? 1 : -1));
  const workOrderIds = new Set(workOrders.map((w) => w.id));
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId) ?? null;
  const modules = engineModuleConditions(engine.id);
  const recentFlights: EngineFlightSummary[] = aircraft
    ? data.flights
        .filter((f) => f.aircraftId === aircraft.id)
        .sort((a, b) => (a.departedAt < b.departedAt ? 1 : -1))
        .slice(0, 10)
        .map((f) => ({
          id: f.id,
          flightNumber: f.flightNumber,
          origin: f.origin,
          destination: f.destination,
          departedAt: f.departedAt,
          blockHours: f.blockHours,
          derate: f.derate,
          outsideAirTempC: f.outsideAirTempC,
          environmentalExposure: f.environmentalExposure,
        }))
    : [];

  return {
    engine,
    operator: data.operators.find((o) => o.id === engine.operatorId) ?? null,
    aircraft,
    familyProfile: {
      family: spec.family,
      thrustLbf: spec.thrustLbf,
      fanDiameterIn: spec.fanDiameterIn,
      bypassRatio: spec.bypassRatio,
      entryIntoService: spec.entryIntoService,
      overhaulIntervalCycles: spec.overhaulIntervalCycles,
      newEgtMargin: spec.newEgtMargin,
      blurb: spec.blurb,
    },
    twin: engineTwinAsset(engine.id),
    modules,
    recommendedAction: engineRecommendedAction(engine.id, modules),
    alerts: data.alerts
      .filter((a) => a.engineId === engine.id)
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.raisedAt < b.raisedAt ? 1 : -1)),
    prognostics: data.prognostics
      .filter((p) => p.engineId === engine.id)
      .sort((a, b) => b.probability - a.probability),
    workOrders,
    taskCards: data.taskCards.filter((t) => workOrderIds.has(t.workOrderId)),
    llps: data.llps
      .filter((l) => l.engineId === engine.id)
      .sort((a, b) => a.cyclesRemaining - b.cyclesRemaining),
    serviceBulletins: data.serviceBulletins
      .filter((sb) => sb.affectedEngineIds.includes(engine.id) && !sb.embodiedEngineIds.includes(engine.id))
      .sort((a, b) => (a.complianceDueAt < b.complianceDueAt ? -1 : 1)),
    trends: engineTrendSeries(engine.id),
    recentFlights,
    cyclesToOverhaulInterval: Math.max(0, spec.overhaulIntervalCycles - engine.cyclesSinceOverhaul),
  };
}
