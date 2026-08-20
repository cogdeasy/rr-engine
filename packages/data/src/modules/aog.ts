/**
 * AOG command centre selectors.
 *
 * Every grounded aircraft in the generated fleet is expanded into a recovery
 * case: a clock against the contractual return-to-service target, a five step
 * recovery plan with exactly one blocking step, the parts and labour position
 * behind that step, and the ranked paths back to service. Everything is derived
 * from the deterministic dataset, so the API, the web app and tests agree.
 */

import type {
  AogEscalation,
  AogEvent,
  AogFacilityOption,
  AogFleetExposure,
  AogPartPosition,
  AogPartSource,
  AogRecoveryOption,
  AogRecoveryStep,
  AogStepId,
  AogTechnicianAvailability,
  Aircraft,
  Engine,
  ModuleCode,
  StatusLevel,
} from "@rr/types";
import { AIRPORTS } from "../catalog";
import { getDataset } from "../index";
import { addHours, clamp, createRng, iso, NOW, rand, round, type Rng } from "../rng";

/** Hourly cost of a grounded widebody: crew, passenger care, lost revenue, LDs. */
const COST_PER_HOUR_USD: Record<string, number> = {
  "A350-900": 14_800,
  "A350-1000": 17_400,
  "A380-800": 23_600,
  "B787-8": 11_900,
  "B787-9": 13_600,
  "B787-10": 15_200,
  "A330-900neo": 11_200,
};

const SEATS: Record<string, number> = {
  "A350-900": 315,
  "A350-1000": 369,
  "A380-800": 517,
  "B787-8": 248,
  "B787-9": 296,
  "B787-10": 336,
  "A330-900neo": 287,
};

const OWNERS: { name: string; role: string }[] = [
  { name: "A. Hughes", role: "AOG duty controller" },
  { name: "R. Patel", role: "Regional fleet manager" },
  { name: "M. Silva", role: "AOG desk lead" },
  { name: "L. Fischer", role: "Line maintenance manager" },
  { name: "C. Wei", role: "Customer service manager" },
  { name: "N. Haddad", role: "AOG duty controller" },
];

const STEP_TEMPLATE: { id: AogStepId; label: string; detail: string }[] = [
  { id: "diagnose", label: "Diagnose", detail: "Fault isolation, borescope and EHM download" },
  { id: "parts", label: "Parts", detail: "Secure and deliver the AOG kit to the stand" },
  { id: "labour", label: "Labour", detail: "Licensed team on the aircraft executing the repair" },
  { id: "test", label: "Test", detail: "Ground run, leak check and performance verification" },
  { id: "release", label: "Release", detail: "CRS sign-off and return of the aircraft to the operator" },
];

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

/** AOG freight moves door to door: handling either end plus the sector itself. */
function transitHoursFor(distanceKm: number): number {
  return round(4 + distanceKm / 720, 1);
}

function stationFor(aircraft: Aircraft, engine: Engine) {
  const dataset = getDataset();
  const lastFlight = dataset.flights
    .filter((f) => f.aircraftId === aircraft.id)
    .sort((a, b) => (a.arrivedAt < b.arrivedAt ? 1 : -1))[0];
  const icao = lastFlight?.destination ?? engine.location;
  const airport = AIRPORTS.find((a) => a.icao === icao) ?? AIRPORTS[0]!;
  return airport;
}

function escalationFor(hoursGrounded: number, hoursToTarget: number): AogEscalation {
  if (hoursToTarget < 0 || hoursGrounded >= 72) return "executive";
  if (hoursGrounded >= 36 || hoursToTarget < 6) return "regional";
  if (hoursGrounded >= 12) return "duty-manager";
  return "station";
}

function statusFor(hoursToTarget: number, slipHours: number): StatusLevel {
  if (hoursToTarget < 0 || slipHours > 6) return "red";
  if (slipHours > 0 || hoursToTarget < 8) return "amber";
  return "green";
}

function partsFor(rng: Rng, moduleCode: ModuleCode, stationIcao: string, engineFamily: string): AogPartPosition[] {
  const dataset = getDataset();
  const station = AIRPORTS.find((a) => a.icao === stationIcao) ?? AIRPORTS[0]!;
  const candidates = dataset.parts.filter((p) => p.moduleCode === moduleCode && !p.lifeLimited);
  const chosen = rand.sample(rng, candidates.length > 0 ? candidates : dataset.parts, 2);

  return chosen.map((part) => {
    const stationFacility = dataset.facilities.find((f) => f.icao === stationIcao);
    const atStation = stationFacility
      ? dataset.inventory.find((i) => i.partNumber === part.partNumber && i.facilityId === stationFacility.id)
      : undefined;
    const onHandAtStation = Math.max(0, (atStation?.onHand ?? 0) - (atStation?.reserved ?? 0));
    const requiredQty = rand.int(rng, 1, 2);

    const sources: AogPartSource[] = dataset.inventory
      .filter((item) => item.partNumber === part.partNumber && item.facilityId !== stationFacility?.id)
      .map((item) => {
        const facility = dataset.facilities.find((f) => f.id === item.facilityId)!;
        const distanceKm = haversineKm(station, facility);
        return {
          facilityId: facility.id,
          facilityName: facility.name,
          icao: facility.icao,
          available: Math.max(0, item.onHand - item.reserved),
          distanceKm,
          transitHours: transitHoursFor(distanceKm),
        };
      })
      .filter((source) => source.available > 0)
      .sort((a, b) => a.transitHours - b.transitHours)
      .slice(0, 3);

    const status: StatusLevel =
      onHandAtStation >= requiredQty ? "green" : sources.length > 0 ? "amber" : "red";

    return {
      partNumber: part.partNumber,
      description: `${part.description} (${engineFamily})`,
      moduleCode: part.moduleCode,
      requiredQty,
      onHandAtStation,
      sources,
      supplier: part.supplier,
      leadTimeDays: part.leadTimeDays,
      unitCostUsd: part.unitCostUsd,
      nextDeliveryAt: atStation?.nextDeliveryAt ?? null,
      status,
    };
  });
}

function facilitiesFor(stationIcao: string, engineFamily: string): AogFacilityOption[] {
  const dataset = getDataset();
  const station = AIRPORTS.find((a) => a.icao === stationIcao) ?? AIRPORTS[0]!;
  return dataset.facilities
    .map((facility) => {
      const distanceKm = haversineKm(station, facility);
      const capableTechnicians = dataset.technicians.filter(
        (t) => t.facilityId === facility.id && t.certifiedFamilies.some((f) => f === engineFamily),
      ).length;
      const slotsFree = Math.max(0, facility.capacity - Math.round((facility.capacity * facility.utilisationPct) / 100));
      const status: StatusLevel =
        capableTechnicians === 0 ? "grey" : slotsFree === 0 ? "red" : slotsFree === 1 ? "amber" : "green";
      return {
        facilityId: facility.id,
        name: facility.name,
        icao: facility.icao,
        kind: facility.kind,
        distanceKm,
        transitHours: transitHoursFor(distanceKm),
        slotsFree,
        utilisationPct: facility.utilisationPct,
        capableTechnicians,
        status,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function techniciansFor(rng: Rng, facilityId: string, engineFamily: string): AogTechnicianAvailability[] {
  const dataset = getDataset();
  const facility = dataset.facilities.find((f) => f.id === facilityId);
  return dataset.technicians
    .filter((t) => t.facilityId === facilityId && t.certifiedFamilies.some((f) => f === engineFamily))
    .sort((a, b) => a.utilisationPct - b.utilisationPct)
    .slice(0, 5)
    .map((technician) => {
      const availableInHours = round(clamp((technician.utilisationPct - 55) / 6, 0, 14) + rand.float(rng, 0, 2), 1);
      const status: StatusLevel = availableInHours <= 2 ? "green" : availableInHours <= 8 ? "amber" : "red";
      return {
        technicianId: technician.id,
        name: technician.name,
        facilityIcao: facility?.icao ?? "—",
        shift: technician.shift,
        skills: technician.skills.slice(0, 3),
        utilisationPct: technician.utilisationPct,
        availableInHours,
        status,
      };
    });
}

function buildSteps(
  rng: Rng,
  hoursGrounded: number,
  partsStatus: StatusLevel,
  labourReadyHours: number,
  owner: string,
): { steps: AogRecoveryStep[]; blockingStepId: AogStepId; remainingHours: number } {
  const planned: Record<AogStepId, number> = {
    diagnose: round(rand.float(rng, 3, 9), 1),
    parts: partsStatus === "green" ? round(rand.float(rng, 2, 6), 1) : partsStatus === "amber" ? round(rand.float(rng, 10, 26), 1) : round(rand.float(rng, 30, 60), 1),
    labour: round(rand.float(rng, 8, 26) + labourReadyHours, 1),
    test: round(rand.float(rng, 3, 7), 1),
    release: round(rand.float(rng, 1, 3), 1),
  };

  let budget = hoursGrounded;
  const steps: AogRecoveryStep[] = [];
  let blockingStepId: AogStepId | null = null;

  for (const template of STEP_TEMPLATE) {
    const plannedHours = planned[template.id];
    const elapsedHours = round(Math.max(0, Math.min(budget, plannedHours * 1.9)), 1);
    budget = round(Math.max(0, budget - elapsedHours), 1);

    let state: AogRecoveryStep["state"];
    if (elapsedHours >= plannedHours && budget > 0) {
      state = "complete";
    } else if (elapsedHours <= 0) {
      state = "pending";
    } else {
      state = "in-progress";
    }
    if (state !== "complete" && blockingStepId === null) blockingStepId = template.id;

    steps.push({
      id: template.id,
      label: template.label,
      detail: template.detail,
      plannedHours,
      elapsedHours,
      state,
      blocking: false,
      owner,
      status: state === "complete" ? "green" : "grey",
    });
  }

  // The last step never completes while the aircraft is still grounded.
  if (blockingStepId === null) {
    blockingStepId = "release";
    const release = steps[steps.length - 1]!;
    release.state = "in-progress";
  }

  const blocking = steps.find((s) => s.id === blockingStepId)!;
  blocking.blocking = true;
  blocking.state = blocking.id === "parts" && partsStatus !== "green" ? "blocked" : blocking.state === "pending" ? "in-progress" : blocking.state;
  blocking.status = "red";
  for (const step of steps) {
    if (step.blocking) continue;
    if (step.state === "complete") step.status = "green";
    else if (step.state === "in-progress") step.status = "amber";
    else step.status = "grey";
  }

  const remainingHours = round(
    steps.reduce((sum, step) => sum + Math.max(0, step.plannedHours - step.elapsedHours), 0),
    1,
  );

  return { steps, blockingStepId, remainingHours };
}

/** The shop the ferry option routes to: nearest facility with both crew and a free slot. */
function ferryTargetFor(facilities: AogFacilityOption[]): AogFacilityOption {
  return facilities.find((f) => f.capableTechnicians > 0 && f.slotsFree > 0) ?? facilities[0]!;
}

function buildOptions(
  rng: Rng,
  remainingHours: number,
  parts: AogPartPosition[],
  facilities: AogFacilityOption[],
  costPerHourUsd: number,
  esn: string,
): AogRecoveryOption[] {
  const blockingPart = parts.find((p) => p.status !== "green") ?? parts[0]!;
  const nearestSource = blockingPart.sources[0];
  const nearestCapable = ferryTargetFor(facilities);
  const options: AogRecoveryOption[] = [];

  if (blockingPart.onHandAtStation >= blockingPart.requiredQty) {
    options.push({
      id: "station-stock",
      label: "Fit from station stock",
      detail: `${blockingPart.requiredQty} × ${blockingPart.partNumber} unreserved at the station — no freight leg required.`,
      hoursToRts: round(remainingHours, 1),
      costUsd: Math.round(remainingHours * costPerHourUsd + blockingPart.unitCostUsd * blockingPart.requiredQty),
      confidence: 0.92,
      recommended: false,
      constraints: ["Requires a licensed B1 release on shift"],
    });
  }

  if (nearestSource) {
    const hours = round(remainingHours + nearestSource.transitHours * 0.6, 1);
    options.push({
      id: "aog-freight",
      label: `AOG freight from ${nearestSource.icao}`,
      detail: `${nearestSource.available} unreserved at ${nearestSource.facilityName}, ${nearestSource.distanceKm.toLocaleString("en-GB")} km — charter freight on the next available slot.`,
      hoursToRts: hours,
      costUsd: Math.round(hours * costPerHourUsd + blockingPart.unitCostUsd * blockingPart.requiredQty + 48_000),
      confidence: 0.81,
      recommended: false,
      constraints: ["Customs clearance at the receiving station", "Charter slot to be confirmed"],
    });
  }

  const ferryHours = round(nearestCapable.transitHours + remainingHours * 0.75, 1);
  options.push({
    id: "ferry-to-base",
    label: `Ferry to ${nearestCapable.icao}`,
    detail: `Recover ${esn} at ${nearestCapable.name}: ${nearestCapable.slotsFree} slot(s) free and ${nearestCapable.capableTechnicians} certified technicians on strength.`,
    hoursToRts: ferryHours,
    costUsd: Math.round(ferryHours * costPerHourUsd + 210_000),
    confidence: 0.74,
    recommended: false,
    constraints: ["Requires a ferry permit against the deferred defect", "Payload restricted, passengers re-accommodated"],
  });

  const supplierHours = round(blockingPart.leadTimeDays * 24 * 0.35 + remainingHours, 1);
  options.push({
    id: "supplier-expedite",
    label: `Expedite from ${blockingPart.supplier}`,
    detail: `Standard lead time ${blockingPart.leadTimeDays} days; AOG priority pulls the promise date forward but leaves the aircraft on the ground.`,
    hoursToRts: supplierHours,
    costUsd: Math.round(supplierHours * costPerHourUsd + blockingPart.unitCostUsd * blockingPart.requiredQty * 1.35),
    confidence: 0.63,
    recommended: false,
    constraints: ["Supplier AOG desk approval", "Highest exposure of the available paths"],
  });

  const swapHours = round(rand.float(rng, 26, 44) + nearestCapable.transitHours * 0.4, 1);
  options.push({
    id: "engine-swap",
    label: "Serviceable engine swap",
    detail: `Install a lease engine and route ${esn} to the shop as a planned removal, clearing the AOG clock immediately after the change.`,
    hoursToRts: swapHours,
    costUsd: Math.round(swapHours * costPerHourUsd + 1_450_000),
    confidence: 0.7,
    recommended: false,
    constraints: ["Lease engine availability", "Build standard compatibility check"],
  });

  options.sort((a, b) => a.hoursToRts - b.hoursToRts);
  options[0]!.recommended = true;
  return options;
}

let cache: { dataset: ReturnType<typeof getDataset>; events: AogEvent[] } | null = null;

/** Every grounded aircraft, expanded into a full recovery case and ranked by urgency. */
export function getAogEvents(): AogEvent[] {
  const dataset = getDataset();
  if (cache?.dataset === dataset) return cache.events;
  const grounded = dataset.aircraft.filter((a) => a.status === "aog");

  const events = grounded.map((aircraft, index) => {
    const rng = createRng(`aog:${aircraft.id}`);
    const engines = dataset.engines.filter((e) => aircraft.engineIds.includes(e.id));
    const engine = [...engines].sort((a, b) => a.healthScore - b.healthScore)[0]!;
    const operator = dataset.operators.find((o) => o.id === aircraft.operatorId)!;
    const contract = dataset.contracts.find((c) => c.operatorId === operator.id);
    const station = stationFor(aircraft, engine);

    const engineAlerts = dataset.alerts
      .filter((a) => aircraft.engineIds.includes(a.engineId) && a.state !== "closed" && a.state !== "false-positive")
      .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1));
    const alert = engineAlerts[0];
    const engineModule = dataset.engineModules
      .filter((m) => m.engineId === engine.id)
      .sort((a, b) => b.lifeConsumedPct - a.lifeConsumedPct)[0]!;

    const hoursGrounded = round(rand.float(rng, 4, 96), 1);
    const groundedAt = addHours(NOW, -hoursGrounded);
    /** Contractual recovery target: 24h for a line defect, 72h when a module is involved. */
    const targetWindowHours = engineModule.status === "red" ? 72 : rand.pick(rng, [24, 36, 48]);
    const targetRts = addHours(groundedAt, targetWindowHours);

    const parts = partsFor(rng, engineModule.code, station.icao, engine.family);
    const partsStatus: StatusLevel = parts.some((p) => p.status === "red")
      ? "red"
      : parts.some((p) => p.status === "amber")
        ? "amber"
        : "green";
    const facilities = facilitiesFor(station.icao, engine.family);
    const nearestCapable = facilities.find((f) => f.capableTechnicians > 0) ?? facilities[0]!;
    const technicians = techniciansFor(rng, nearestCapable.facilityId, engine.family);
    const labourReadyHours = technicians[0]?.availableInHours ?? 6;
    const ownerSeed = OWNERS[index % OWNERS.length]!;

    const { steps, blockingStepId, remainingHours } = buildSteps(rng, hoursGrounded, partsStatus, labourReadyHours, ownerSeed.name);
    const projectedRts = addHours(NOW, remainingHours);
    const hoursToTarget = round((targetRts.getTime() - NOW.getTime()) / 3_600_000, 1);
    const slipHours = round(Math.max(0, (projectedRts.getTime() - targetRts.getTime()) / 3_600_000), 1);

    const costPerHourUsd = COST_PER_HOUR_USD[aircraft.type] ?? 12_000;
    const options = buildOptions(rng, remainingHours, parts, facilities, costPerHourUsd, engine.esn);
    // Always surface the facilities the rest of the case refers to (crew source and ferry
    // target) even when they are not among the four closest.
    const surfacedFacilities = [...new Set([...facilities.slice(0, 4), nearestCapable, ferryTargetFor(facilities)])].sort(
      (a, b) => a.distanceKm - b.distanceKm,
    );
    const workOrder = dataset.workOrders.find((w) => w.engineId === engine.id && w.state !== "complete");

    const seats = SEATS[aircraft.type] ?? 300;
    const cancelledSectors = Math.max(1, Math.round((hoursGrounded + remainingHours) / 11));

    return {
      id: `AOG-${aircraft.id.replace("AC-", "")}`,
      aircraftId: aircraft.id,
      tail: aircraft.tail,
      aircraftType: aircraft.type,
      operatorId: operator.id,
      operatorName: operator.name,
      operatorCode: operator.code,
      contractKind: contract?.kind ?? "Time & Materials",

      engineId: engine.id,
      esn: engine.esn,
      engineFamily: engine.family,
      enginePosition: engine.position ?? 1,
      moduleCode: engineModule.code,

      stationIcao: station.icao,
      stationCity: station.city,

      groundedAt: iso(groundedAt),
      targetRtsAt: iso(targetRts),
      projectedRtsAt: iso(projectedRts),
      hoursGrounded,
      hoursToTarget,
      slipHours,

      cause: alert?.title.split(" — ")[0] ?? `${engineModule.label} deterioration`,
      causeDetail:
        alert?.description ??
        `${engineModule.label} life consumed ${engineModule.lifeConsumedPct}% on ${engine.family} ${engine.esn}; aircraft held pending disposition.`,
      ataChapter: alert?.ataChapter ?? "72-00",
      alertId: alert?.id ?? null,
      workOrderReference: workOrder?.reference ?? null,

      escalation: escalationFor(hoursGrounded, hoursToTarget),
      owner: ownerSeed.name,
      ownerRole: ownerSeed.role,
      status: statusFor(hoursToTarget, slipHours),

      steps,
      blockingStepId,
      parts,
      facilities: surfacedFacilities,
      technicians,
      options,

      costPerHourUsd,
      exposureUsd: Math.round((hoursGrounded + remainingHours) * costPerHourUsd),
      passengersAffected: seats * cancelledSectors,
      cancelledSectors,
    } satisfies AogEvent;
  });

  const sorted = events.sort(
    (a, b) => rankStatus(b.status) - rankStatus(a.status) || b.exposureUsd - a.exposureUsd,
  );
  cache = { dataset, events: sorted };
  return sorted;
}

function rankStatus(status: StatusLevel): number {
  return { red: 3, amber: 2, green: 1, grey: 0 }[status];
}

export function getAogEvent(eventId: string): AogEvent | undefined {
  return getAogEvents().find((event) => event.id === eventId || event.tail === eventId);
}

/** Fleet-level cost exposure and the hours recoverable by taking the recommended path. */
export function aogFleetExposure(): AogFleetExposure {
  const events = getAogEvents();
  const exposureUsd = events.reduce((sum, e) => sum + e.exposureUsd, 0);
  const byOperator = [...new Map(events.map((e) => [e.operatorId, e])).keys()].map((operatorId) => {
    const forOperator = events.filter((e) => e.operatorId === operatorId);
    const first = forOperator[0]!;
    return {
      operatorId,
      operatorName: first.operatorName,
      operatorCode: first.operatorCode,
      events: forOperator.length,
      exposureUsd: forOperator.reduce((sum, e) => sum + e.exposureUsd, 0),
      worstHoursGrounded: Math.max(...forOperator.map((e) => e.hoursGrounded)),
      status: forOperator.some((e) => e.status === "red") ? ("red" as const) : forOperator.some((e) => e.status === "amber") ? ("amber" as const) : ("green" as const),
    };
  }).sort((a, b) => b.exposureUsd - a.exposureUsd);

  const recoverableHours = round(
    events.reduce((sum, event) => {
      const [recommended, nextBest] = event.options;
      if (!recommended || !nextBest) return sum;
      return sum + Math.max(0, nextBest.hoursToRts - recommended.hoursToRts);
    }, 0),
    1,
  );

  return {
    events: events.length,
    aircraftGrounded: new Set(events.map((e) => e.aircraftId)).size,
    targetsBreached: events.filter((e) => e.hoursToTarget < 0 || e.slipHours > 0).length,
    partsBlocked: events.filter((e) => e.blockingStepId === "parts").length,
    exposureUsd,
    exposurePerHourUsd: events.reduce((sum, e) => sum + e.costPerHourUsd, 0),
    averageHoursGrounded: round(events.reduce((sum, e) => sum + e.hoursGrounded, 0) / Math.max(1, events.length), 1),
    longestHoursGrounded: events.length > 0 ? Math.max(...events.map((e) => e.hoursGrounded)) : 0,
    passengersAffected: events.reduce((sum, e) => sum + e.passengersAffected, 0),
    recoverableHours,
    byOperator,
  };
}
