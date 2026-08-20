/**
 * Build records selectors — the as-built configuration of every managed engine.
 *
 * Everything here is derived deterministically from the generated fleet: module
 * installations hang off `engineModules`, serialised parts off `llps` and the
 * parts catalogue, embodiment status off `serviceBulletins`, and shop events off
 * `workOrders` and `facilities`. Nothing is hardcoded for display.
 */

import type {
  BuildEvent,
  BuildEventKind,
  BuildPartSource,
  BuildRecordSummary,
  BuildRecordsFleetSummary,
  ConfigConformance,
  ConfigDiffRow,
  Engine,
  EngineBuildRecord,
  ModuleCode,
  ModuleInstallation,
  SbEmbodimentRow,
  StatusLevel,
  TraceabilityNode,
  TraceabilityPart,
} from "@rr/types";
import { ENGINE_MODULES } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

/** Build standard revisions, oldest first. */
const REVISIONS = ["A", "B", "C", "D", "E"] as const;

const SOURCES: { value: BuildPartSource; weight: number }[] = [
  { value: "new", weight: 34 },
  { value: "overhauled", weight: 44 },
  { value: "repaired", weight: 19 },
  { value: "used-serviceable", weight: 2 },
  { value: "loan", weight: 1 },
];

/** Compact family code used in configuration references, e.g. "TXWB84". */
export function familyCode(family: string): string {
  return family.replace(/^Trent\s*/i, "T").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function revisionIndex(standard: string): number {
  const rev = standard.slice(-1);
  const index = REVISIONS.indexOf(rev as (typeof REVISIONS)[number]);
  return index < 0 ? 0 : index;
}

/** Published fleet standard for a family/module pair. */
export function fleetStandardFor(family: string, moduleCode: ModuleCode): string {
  const rng = createRng(`fleet-standard:${family}:${moduleCode}`);
  const rev = rand.weighted(rng, [
    { value: "C" as const, weight: 22 },
    { value: "D" as const, weight: 48 },
    { value: "E" as const, weight: 30 },
  ]);
  return `${familyCode(family)}/${moduleCode}-${rev}`;
}

function certifier(rng: () => number): string {
  return rand.pick(rng, [
    "a.hughes@rolls-royce.com",
    "r.patel@rolls-royce.com",
    "m.silva@rolls-royce.com",
    "l.fischer@rolls-royce.com",
    "haesl.qa@rolls-royce.com",
  ]);
}

/* ------------------------------------------------------------------ */
/* Module installations                                                */
/* ------------------------------------------------------------------ */

export function moduleInstallations(engineId: string): ModuleInstallation[] {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine) return [];
  const facilities = data.facilities;
  const llps = data.llps.filter((l) => l.engineId === engine.id);

  return data.engineModules
    .filter((m) => m.engineId === engine.id)
    .map((m) => {
      const spec = ENGINE_MODULES.find((s) => s.code === m.code);
      const rng = createRng(`build-record:${engine.id}:${m.code}`);
      const fleetStandard = fleetStandardFor(engine.family, m.code);
      const behind = rand.weighted(rng, [
        { value: 0, weight: 96 },
        { value: 1, weight: 3 },
        { value: 2, weight: 1 },
      ]);
      const installedRev = REVISIONS[Math.max(0, revisionIndex(fleetStandard) - behind)];
      const buildStandard = `${familyCode(engine.family)}/${m.code}-${installedRev}`;
      const source = rand.weighted(rng, SOURCES);
      const conformance: ConfigConformance =
        behind > 0 ? "superseded" : source === "loan" || source === "used-serviceable" ? "non-standard" : "standard";
      const cyclesSinceInstall = Math.round(
        clamp(engine.cyclesSinceOverhaul * rand.float(rng, 0.25, 1), 20, engine.cyclesSinceOverhaul || 20),
      );
      const traceComplete = rand.bool(rng, source === "loan" ? 0.7 : source === "used-serviceable" ? 0.9 : 0.995);
      const moduleLlps = llps.filter((l) => l.moduleCode === m.code);

      return {
        id: `${engine.id}:${m.code}`,
        engineId: engine.id,
        moduleCode: m.code,
        label: m.label,
        serialNumber: `${m.code}-${rand.int(rng, 100000, 999999)}`,
        buildStandard,
        fleetStandard,
        conformance,
        source,
        installedAt: iso(daysAgo(rand.int(rng, 20, 1500))),
        facilityId: rand.pick(rng, facilities).id,
        cyclesSinceInstall,
        hoursSinceInstall: Math.round(cyclesSinceInstall * rand.float(rng, 5.2, 8.4)),
        lifeConsumedPct: m.lifeConsumedPct,
        status: m.status,
        llpCount: moduleLlps.length,
        traceComplete: moduleLlps.length === 0 ? true : traceComplete,
        ataChapter: spec?.ataChapter ?? "72-00",
      } satisfies ModuleInstallation;
    })
    .sort(
      (a, b) =>
        revisionIndex(b.fleetStandard) -
        revisionIndex(b.buildStandard) -
        (revisionIndex(a.fleetStandard) - revisionIndex(a.buildStandard)) ||
        a.label.localeCompare(b.label),
    );
}

/* ------------------------------------------------------------------ */
/* Configuration diff against the fleet standard                       */
/* ------------------------------------------------------------------ */

const IMPACT_BY_MODULE: Partial<Record<ModuleCode, string>> = {
  HPT: "Older blade coating standard; EGT margin recovery at overhaul is ~8°C lower.",
  COMBUSTOR: "Pre-modification tile set; repetitive borescope interval applies.",
  HPC: "Earlier tip-clearance control build; fuel burn deterioration rate is higher.",
  IPC: "Superseded rotor blade design covered by an in-service improvement bulletin.",
  FAN: "Pre-modification leading-edge protection; erosion inspection interval unchanged.",
  LPT: "Earlier coating standard; sulphidation resistance below current standard.",
  GEARBOX: "Earlier seal standard; oil consumption trend to be monitored.",
  ACCESSORY: "Superseded FADEC harness routing; no operational limitation.",
  NACELLE: "Earlier thrust reverser actuator standard; no dispatch limitation.",
  EXTERNALS: "Earlier bearing chamber scavenge standard; debris monitoring unchanged.",
  IPT: "Earlier shaft coupling standard; torsional inspection at next shop visit.",
};

export function configurationDiff(engineId: string): ConfigDiffRow[] {
  return moduleInstallations(engineId)
    .map((installation) => {
      const revisionsBehind = Math.max(0, revisionIndex(installation.fleetStandard) - revisionIndex(installation.buildStandard));
      const status: StatusLevel =
        revisionsBehind >= 2 ? "amber" : installation.conformance === "non-standard" ? "amber" : revisionsBehind === 1 ? "amber" : "green";
      const impact =
        revisionsBehind > 0
          ? (IMPACT_BY_MODULE[installation.moduleCode] ?? "Superseded build standard; no dispatch limitation.")
          : installation.conformance === "non-standard"
            ? `Fitted as ${installation.source.replace("-", " ")} hardware against an approved deviation.`
            : "At published fleet standard.";
      const recommendedAction =
        revisionsBehind >= 2
          ? `Bundle ${installation.moduleCode} upgrade to ${installation.fleetStandard} into the next shop visit workscope.`
          : revisionsBehind === 1
            ? `Review ${installation.moduleCode} upgrade at next module access — no immediate action.`
            : installation.conformance === "non-standard"
              ? `Confirm deviation approval and plan return of the ${installation.source.replace("-", " ")} ${installation.moduleCode}.`
              : "None — configuration conforms.";

      return {
        moduleCode: installation.moduleCode,
        label: installation.label,
        installedStandard: installation.buildStandard,
        fleetStandard: installation.fleetStandard,
        conformance: installation.conformance,
        source: installation.source,
        revisionsBehind,
        impact,
        recommendedAction,
        status,
      } satisfies ConfigDiffRow;
    })
    .sort((a, b) => b.revisionsBehind - a.revisionsBehind || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */
/* Build history                                                       */
/* ------------------------------------------------------------------ */

const REPLACEMENT_REASONS = [
  "Borescope finding beyond limits",
  "Life-limited part expiry",
  "EGT margin recovery",
  "Oil debris indication",
  "Vibration signature out of limits",
  "Scheduled overhaul workscope",
  "Foreign object damage",
];

/** Date of the last full engine build, shared by the fleet list and the engine record. */
function engineBuildDate(engine: Engine, rng: () => number): Date {
  return daysAgo(Math.round(engine.hoursSinceOverhaul / rand.float(rng, 7, 13)));
}

export function buildHistory(engineId: string): BuildEvent[] {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine) return [];
  const installations = moduleInstallations(engine.id);
  const rng = createRng(`build-history:${engine.id}`);
  const events: BuildEvent[] = [];
  const buildAt = engineBuildDate(engine, rng);
  const buildFacility = rand.pick(rng, data.facilities.filter((f) => f.kind === "overhaul-base" || f.kind === "partner-shop"));

  events.push({
    id: `${engine.id}:BUILD`,
    engineId: engine.id,
    at: iso(buildAt),
    kind: "engine-build",
    moduleCode: null,
    facilityId: buildFacility.id,
    fromSerial: null,
    toSerial: engine.esn,
    reason: `Full overhaul build to ${engine.buildStandard}; engine released to service after test cell pass.`,
    reference: `BR-${engine.esn.replace("ESN-", "")}-000`,
    certifiedBy: certifier(rng),
    status: "green",
  });

  for (const installation of installations) {
    if (new Date(installation.installedAt) <= buildAt) continue;
    const kind: BuildEventKind = rand.bool(rng, 0.6) ? "module-replaced" : "module-overhauled";
    events.push({
      id: `${engine.id}:${installation.moduleCode}:INST`,
      engineId: engine.id,
      at: installation.installedAt,
      kind,
      moduleCode: installation.moduleCode,
      facilityId: installation.facilityId,
      fromSerial: `${installation.moduleCode}-${rand.int(rng, 100000, 999999)}`,
      toSerial: installation.serialNumber,
      reason: `${rand.pick(rng, REPLACEMENT_REASONS)} — ${installation.source.replace("-", " ")} ${installation.label.toLowerCase()} fitted at ${installation.buildStandard}.`,
      reference: `BR-${engine.esn.replace("ESN-", "")}-${installation.moduleCode}`,
      certifiedBy: certifier(rng),
      status: installation.conformance === "standard" ? "green" : "amber",
    });
  }

  for (const llp of data.llps.filter((l) => l.engineId === engine.id).slice(0, 3)) {
    const at = daysAgo(rand.int(rng, 40, 1400));
    events.push({
      id: `${engine.id}:${llp.id}:LLP`,
      engineId: engine.id,
      at: iso(at),
      kind: "llp-replaced",
      moduleCode: llp.moduleCode,
      facilityId: rand.pick(rng, data.facilities).id,
      fromSerial: `SN${rand.int(rng, 100000, 999999)}`,
      toSerial: llp.serialNumber,
      reason: `Life-limited part ${llp.partNumber} replaced at ${llp.cyclicLimit.toLocaleString("en-GB")} cycle limit; back-to-birth record re-issued.`,
      reference: `LLP-${llp.id}`,
      certifiedBy: certifier(rng),
      status: llp.status === "red" ? "amber" : "green",
    });
  }

  for (const sb of data.serviceBulletins.filter((s) => s.embodiedEngineIds.includes(engine.id)).slice(0, 4)) {
    events.push({
      id: `${engine.id}:${sb.id}:SB`,
      engineId: engine.id,
      at: iso(addDays(new Date(sb.issuedAt), rand.int(rng, 20, 260))),
      kind: "sb-embodied",
      moduleCode: null,
      facilityId: rand.pick(rng, data.facilities).id,
      fromSerial: null,
      toSerial: null,
      reason: `${sb.reference} embodied — ${sb.title}.`,
      reference: sb.reference,
      certifiedBy: certifier(rng),
      status: "green",
    });
  }

  for (const installation of installations.filter((i) => i.conformance === "non-standard").slice(0, 2)) {
    events.push({
      id: `${engine.id}:${installation.moduleCode}:DEV`,
      engineId: engine.id,
      at: installation.installedAt,
      kind: "configuration-deviation",
      moduleCode: installation.moduleCode,
      facilityId: installation.facilityId,
      fromSerial: null,
      toSerial: installation.serialNumber,
      reason: `Approved deviation: ${installation.source.replace("-", " ")} ${installation.label.toLowerCase()} retained pending availability of standard hardware.`,
      reference: `DEV-${engine.esn.replace("ESN-", "")}-${installation.moduleCode}`,
      certifiedBy: certifier(rng),
      status: "amber",
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Traceability                                                        */
/* ------------------------------------------------------------------ */

export function traceability(engineId: string): TraceabilityNode[] {
  const data = getDataset();
  const installations = moduleInstallations(engineId);

  return installations.map((installation) => {
    const rng = createRng(`trace:${engineId}:${installation.moduleCode}`);
    const catalogue = data.parts.filter((p) => p.moduleCode === installation.moduleCode);
    const lifed = data.llps.filter((l) => l.engineId === engineId && l.moduleCode === installation.moduleCode);

    const lifedParts: TraceabilityPart[] = lifed.map((llp) => {
      const part = data.parts.find((p) => p.partNumber === llp.partNumber);
      const partRng = createRng(`trace-part:${llp.id}`);
      const certified = installation.traceComplete || rand.bool(partRng, 0.5);
      return {
        partNumber: llp.partNumber,
        description: part?.description ?? "Life-limited rotating part",
        serialNumber: llp.serialNumber,
        moduleCode: llp.moduleCode,
        lifeLimited: true,
        cyclesUsed: llp.cyclesUsed,
        cyclicLimit: llp.cyclicLimit,
        cyclesRemaining: llp.cyclesRemaining,
        supplier: part?.supplier ?? "Rolls-Royce Derby",
        releaseCertificate: certified ? `EASA-F1-${rand.int(partRng, 100000, 999999)}` : null,
        batch: `B${rand.int(partRng, 1000, 9999)}`,
        source: installation.source,
        status: llp.status,
      };
    });

    const rotableParts: TraceabilityPart[] = rand
      .sample(rng, catalogue.filter((p) => !p.lifeLimited), 2)
      .map((part) => {
        const partRng = createRng(`trace-rotable:${engineId}:${part.partNumber}`);
        return {
          partNumber: part.partNumber,
          description: part.description,
          serialNumber: `SN${rand.int(partRng, 100000, 999999)}`,
          moduleCode: part.moduleCode,
          lifeLimited: false,
          cyclesUsed: installation.cyclesSinceInstall,
          cyclicLimit: null,
          cyclesRemaining: null,
          supplier: part.supplier,
          releaseCertificate: rand.bool(partRng, installation.traceComplete ? 0.999 : 0.7)
            ? `EASA-F1-${rand.int(partRng, 100000, 999999)}`
            : null,
          batch: `B${rand.int(partRng, 1000, 9999)}`,
          source: installation.source,
          status: "green" as StatusLevel,
        };
      });

    return {
      moduleCode: installation.moduleCode,
      label: installation.label,
      serialNumber: installation.serialNumber,
      source: installation.source,
      traceComplete: [...lifedParts, ...rotableParts].every((p) => p.releaseCertificate !== null),
      parts: [...lifedParts, ...rotableParts],
    } satisfies TraceabilityNode;
  });
}

/* ------------------------------------------------------------------ */
/* Service bulletin embodiment                                         */
/* ------------------------------------------------------------------ */

export function embodimentStatus(engineId: string): SbEmbodimentRow[] {
  const data = getDataset();
  return data.serviceBulletins
    .filter((sb) => sb.affectedEngineIds.includes(engineId))
    .map((sb) => {
      const embodied = sb.embodiedEngineIds.includes(engineId);
      const daysToDue = Math.round((new Date(sb.complianceDueAt).getTime() - NOW.getTime()) / 86400000);
      const status: StatusLevel =
        embodied ? "green" : daysToDue < 0 && sb.mandatory ? "red" : daysToDue < 90 ? "amber" : "green";
      return {
        bulletinId: sb.id,
        reference: sb.reference,
        kind: sb.kind,
        title: sb.title,
        mandatory: sb.mandatory,
        embodied,
        dueAt: sb.complianceDueAt,
        daysToDue,
        estimatedHours: sb.estimatedHoursPerEngine,
        status,
      } satisfies SbEmbodimentRow;
    })
    .sort((a, b) => a.daysToDue - b.daysToDue);
}

/* ------------------------------------------------------------------ */
/* Engine build record                                                 */
/* ------------------------------------------------------------------ */

function conformanceCounts(installations: ModuleInstallation[]) {
  const superseded = installations.filter((m) => m.conformance === "superseded").length;
  const nonStandard = installations.filter((m) => m.conformance === "non-standard").length;
  const atStandard = installations.length - superseded - nonStandard;
  return { superseded, nonStandard, atStandard };
}

function configurationStatusFor(overdueBulletins: number, traceGaps: number, superseded: number, nonStandard: number): StatusLevel {
  if (overdueBulletins > 0 || traceGaps > 0) return "red";
  if (superseded > 0 || nonStandard > 0) return "amber";
  return "green";
}

export function engineBuildRecord(engineId: string): EngineBuildRecord | undefined {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;

  const modules = moduleInstallations(engine.id);
  const events = buildHistory(engine.id);
  const diff = configurationDiff(engine.id);
  const trace = traceability(engine.id);
  const bulletins = embodimentStatus(engine.id);
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const build = events.find((e) => e.kind === "engine-build");
  const { superseded, nonStandard, atStandard } = conformanceCounts(modules);
  const traceGapCount = trace.reduce((sum, node) => sum + node.parts.filter((p) => p.releaseCertificate === null).length, 0);
  const overdueBulletinCount = bulletins.filter((b) => b.status === "red").length;
  const configurationStatus = configurationStatusFor(overdueBulletinCount, traceGapCount, superseded, nonStandard);

  const worstDiff = diff[0];
  const recommendedAction =
    overdueBulletinCount > 0
      ? `Embody ${bulletins.find((b) => b.status === "red")?.reference} — mandatory compliance date passed. Raise a work order before the next departure.`
      : traceGapCount > 0
        ? `Recover ${traceGapCount} missing release certificate${traceGapCount === 1 ? "" : "s"} from the build pack before the next airworthiness review.`
        : superseded > 0 && worstDiff
          ? `Add the ${worstDiff.moduleCode} upgrade to ${worstDiff.fleetStandard} to the next shop visit workscope.`
          : nonStandard > 0
            ? "Confirm deviation approvals remain valid and plan replacement with standard hardware."
            : "No configuration action — engine is at fleet standard with a complete build pack.";

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorName: operator?.name ?? "Unassigned",
    aircraftTail: aircraft?.tail ?? null,
    buildStandard: engine.buildStandard,
    lastBuildAt: build?.at ?? engine.installedAt ?? iso(NOW),
    lastBuildFacilityId: build?.facilityId ?? data.facilities[0]!.id,
    totalFlightCycles: engine.totalFlightCycles,
    cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
    modules,
    events,
    diff,
    traceability: trace,
    bulletins,
    supersededCount: superseded,
    nonStandardCount: nonStandard,
    traceGapCount,
    overdueBulletinCount,
    configurationStatus,
    conformancePct: round((atStandard / Math.max(1, modules.length)) * 100, 0),
    recommendedAction,
  };
}

/* ------------------------------------------------------------------ */
/* Fleet roll-up                                                       */
/* ------------------------------------------------------------------ */

function summaryFor(engine: Engine): BuildRecordSummary {
  const data = getDataset();
  const modules = moduleInstallations(engine.id);
  const { superseded, nonStandard, atStandard } = conformanceCounts(modules);
  const traceGapCount = traceability(engine.id).reduce(
    (sum, node) => sum + node.parts.filter((p) => p.releaseCertificate === null).length,
    0,
  );
  const overdueBulletinCount = embodimentStatus(engine.id).filter((b) => b.status === "red").length;
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const lastBuildAt = iso(engineBuildDate(engine, createRng(`build-history:${engine.id}`)));

  return {
    engineId: engine.id,
    esn: engine.esn,
    family: engine.family,
    operatorCode: operator?.code ?? "--",
    operatorName: operator?.name ?? "Unassigned",
    aircraftTail: aircraft?.tail ?? null,
    buildStandard: engine.buildStandard,
    conformancePct: round((atStandard / Math.max(1, modules.length)) * 100, 0),
    supersededCount: superseded,
    nonStandardCount: nonStandard,
    traceGapCount,
    overdueBulletinCount,
    lastBuildAt,
    configurationStatus: configurationStatusFor(overdueBulletinCount, traceGapCount, superseded, nonStandard),
  };
}

let summaryCache: BuildRecordSummary[] | null = null;

/** Configuration roll-up for every managed engine, worst configuration first. */
export function buildRecordSummaries(): BuildRecordSummary[] {
  if (!summaryCache) {
    summaryCache = getDataset()
      .engines.map(summaryFor)
      .sort(
        (a, b) =>
          b.overdueBulletinCount - a.overdueBulletinCount ||
          b.traceGapCount - a.traceGapCount ||
          b.supersededCount + b.nonStandardCount - (a.supersededCount + a.nonStandardCount) ||
          a.conformancePct - b.conformancePct,
      );
  }
  return summaryCache;
}

export function buildRecordsFleetSummary(): BuildRecordsFleetSummary {
  const summaries = buildRecordSummaries();
  return {
    engines: summaries.length,
    atStandard: summaries.filter((s) => s.configurationStatus === "green").length,
    superseded: summaries.filter((s) => s.supersededCount > 0).length,
    nonStandard: summaries.filter((s) => s.nonStandardCount > 0).length,
    traceGaps: summaries.filter((s) => s.traceGapCount > 0).length,
    overdueBulletins: summaries.filter((s) => s.overdueBulletinCount > 0).length,
    averageConformancePct: round(summaries.reduce((sum, s) => sum + s.conformancePct, 0) / Math.max(1, summaries.length), 0),
    attention: summaries.filter((s) => s.configurationStatus !== "green").slice(0, 12),
  };
}
