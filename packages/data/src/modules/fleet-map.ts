/**
 * Derived selectors for the `fleet-map` module.
 *
 * The base dataset stores fleet condition but no live geography, so this file
 * derives a deterministic "now" position for every airframe from its most
 * recent sector, then matches flagged engines against the maintenance network.
 */

import type {
  Aircraft,
  Alert,
  Engine,
  EngineFamily,
  Facility,
  FleetMapAircraftNode,
  FleetMapAlertSummary,
  FleetMapEngineSummary,
  FleetMapPhase,
  FleetMapPlace,
  FleetMapRegionSummary,
  FleetMapSnapshot,
  FleetMapStation,
  FleetMapStationMatch,
  Region,
  StatusLevel,
} from "@rr/types";
import { AIRPORTS } from "../catalog";
import { getDataset, severityRank, statusRank } from "../index";
import { createRng, iso, NOW, rand, round } from "../rng";

const EARTH_RADIUS_KM = 6371;
/** Typical ferry/positioning speed for a wide-body, used for reachability maths. */
const FERRY_SPEED_KMH = 830;
/** A station is only offered as an option inside this radius. */
const CAPABILITY_RADIUS_KM = 4200;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Great-circle interpolation, used for both positions and drawn route arcs. */
export function interpolateGreatCircle(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  fraction: number,
): { lat: number; lon: number } {
  const toRad = Math.PI / 180;
  const lat1 = from.lat * toRad;
  const lon1 = from.lon * toRad;
  const lat2 = to.lat * toRad;
  const lon2 = to.lon * toRad;
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2),
      ),
    );
  if (d === 0) return { lat: from.lat, lon: from.lon };
  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);
  return { lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

/** Coarse geographic bucket, aligned to the operating regions in the domain model. */
export function regionForCoords(lat: number, lon: number): Region {
  if (lon >= 100 && lat >= 18 && lat <= 55) return "Greater China";
  if (lat < 12 && lon > -35 && lon < 62) return "Africa";
  if (lon >= 32 && lon <= 68 && lat >= 12 && lat < 42) return "Middle East";
  if (lon >= 62) return "Asia Pacific";
  if (lon < -30 && lat < 14) return "South America";
  if (lon < -30) return "North America";
  return "Europe";
}

function place(icao: string): FleetMapPlace | null {
  const airport = AIRPORTS.find((a) => a.icao === icao);
  if (!airport) return null;
  return { icao: airport.icao, iata: airport.iata, city: airport.city, lat: airport.lat, lon: airport.lon };
}

function fallbackPlace(homeBase: string): FleetMapPlace {
  return place(homeBase) ?? { icao: "EGLL", iata: "LHR", city: "London", lat: 51.47, lon: -0.45 };
}

function worstStatus(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((worst, level) => (statusRank(level) > statusRank(worst) ? level : worst), "grey");
}

function summariseEngine(engine: Engine, alerts: Alert[]): FleetMapEngineSummary {
  return {
    id: engine.id,
    esn: engine.esn,
    family: engine.family,
    position: engine.position,
    status: engine.status,
    egtMargin: engine.egtMargin,
    healthScore: engine.healthScore,
    rulCycles: engine.rulCycles,
    openAlerts: alerts.length,
  };
}

function summariseAlert(alert: Alert, esn: string): FleetMapAlertSummary {
  return {
    id: alert.id,
    engineId: alert.engineId,
    esn,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    source: alert.source,
    ataChapter: alert.ataChapter,
    raisedAt: alert.raisedAt,
    recommendedAction: alert.recommendedAction,
    timeToActionHours: alert.timeToActionHours,
  };
}

function isOpen(alert: Alert): boolean {
  return alert.state !== "closed" && alert.state !== "false-positive";
}

/**
 * Deterministic live position for an airframe.
 *
 * In-service aircraft are flown along their latest recorded sector; grounded,
 * AOG and in-maintenance aircraft sit at the station they last arrived into.
 */
function positionFor(aircraft: Aircraft, lastSector: { origin: string; destination: string; blockHours: number } | null, homeBase: string) {
  const rng = createRng(`fleet-map:${aircraft.id}`);
  const origin = (lastSector ? place(lastSector.origin) : null) ?? fallbackPlace(homeBase);
  const destination = (lastSector ? place(lastSector.destination) : null) ?? fallbackPlace(homeBase);
  const blockHours = lastSector?.blockHours ?? 6;

  const airborne = aircraft.status === "in-service" && rand.bool(rng, 0.62);
  if (!airborne) {
    const phase: FleetMapPhase = aircraft.status === "in-service" || aircraft.status === "stored" ? "on-ground" : "in-shop";
    return {
      phase,
      lat: destination.lat,
      lon: destination.lon,
      origin,
      destination,
      progress: 1,
      etaMinutes: null,
      altitudeFt: null,
      groundSpeedKts: null,
    };
  }

  const progress = rand.float(rng, 0.08, 0.94);
  const point = interpolateGreatCircle(origin, destination, progress);
  return {
    phase: "in-flight" as FleetMapPhase,
    lat: round(point.lat, 3),
    lon: round(point.lon, 3),
    origin,
    destination,
    progress: round(progress, 3),
    etaMinutes: Math.round((1 - progress) * blockHours * 60),
    altitudeFt: rand.int(rng, 31, 41) * 1000,
    groundSpeedKts: rand.int(rng, 440, 510),
  };
}

function matchStation(
  facility: Facility,
  from: { lat: number; lon: number },
  freeSlots: number,
  certifiedTechnicians: number,
  utilisationPct: number,
): FleetMapStationMatch {
  const distanceKm = Math.round(haversineKm(from, facility));
  return {
    stationId: facility.id,
    name: facility.name,
    icao: facility.icao,
    kind: facility.kind,
    distanceKm,
    ferryHours: round(distanceKm / FERRY_SPEED_KMH, 1),
    freeSlots,
    utilisationPct,
    certifiedTechnicians,
    capable: freeSlots > 0 && certifiedTechnicians > 0 && distanceKm <= CAPABILITY_RADIUS_KM,
  };
}

/**
 * The whole geographic picture: airframes, the maintenance network, and the
 * match between the two. Everything the fleet map renders comes from here.
 */
export function getFleetMapSnapshot(): FleetMapSnapshot {
  const data = getDataset();

  const openAlertsByEngine = new Map<string, Alert[]>();
  for (const alert of data.alerts) {
    if (!isOpen(alert)) continue;
    const list = openAlertsByEngine.get(alert.engineId);
    if (list) list.push(alert);
    else openAlertsByEngine.set(alert.engineId, [alert]);
  }

  const enginesByAircraft = new Map<string, Engine[]>();
  for (const engine of data.engines) {
    if (!engine.aircraftId) continue;
    const list = enginesByAircraft.get(engine.aircraftId);
    if (list) list.push(engine);
    else enginesByAircraft.set(engine.aircraftId, [engine]);
  }

  // The most recent sector defines the route an airframe is flying right now.
  const lastSectorByAircraft = new Map<string, { origin: string; destination: string; blockHours: number; departedAt: string }>();
  for (const flight of data.flights) {
    const current = lastSectorByAircraft.get(flight.aircraftId);
    if (current && current.departedAt >= flight.departedAt) continue;
    lastSectorByAircraft.set(flight.aircraftId, {
      origin: flight.origin,
      destination: flight.destination,
      blockHours: flight.blockHours,
      departedAt: flight.departedAt,
    });
  }

  const techniciansByFacility = new Map<string, { total: number; byFamily: Map<EngineFamily, number> }>();
  for (const technician of data.technicians) {
    const entry = techniciansByFacility.get(technician.facilityId) ?? { total: 0, byFamily: new Map() };
    entry.total += 1;
    for (const family of technician.certifiedFamilies) {
      entry.byFamily.set(family, (entry.byFamily.get(family) ?? 0) + 1);
    }
    techniciansByFacility.set(technician.facilityId, entry);
  }

  const occupancy = new Map<string, number>();
  for (const workOrder of data.workOrders) {
    if (workOrder.state !== "in-progress" && workOrder.state !== "awaiting-parts") continue;
    occupancy.set(workOrder.facilityId, (occupancy.get(workOrder.facilityId) ?? 0) + 1);
  }

  const stationState = data.facilities.map((facility) => {
    const crew = techniciansByFacility.get(facility.id) ?? { total: 0, byFamily: new Map<EngineFamily, number>() };
    const inWork = occupancy.get(facility.id) ?? 0;
    const freeSlots = Math.max(0, facility.capacity - inWork);
    const utilisationPct = Math.min(100, Math.round((inWork / Math.max(1, facility.capacity)) * 100));
    return { facility, crew, freeSlots, utilisationPct };
  });

  const operatorsById = new Map(data.operators.map((operator) => [operator.id, operator]));

  const aircraftNodes: FleetMapAircraftNode[] = data.aircraft.map((aircraft) => {
    const operator = operatorsById.get(aircraft.operatorId)!;
    const engines = enginesByAircraft.get(aircraft.id) ?? [];
    const engineAlerts = engines.flatMap((engine) =>
      (openAlertsByEngine.get(engine.id) ?? []).map((alert) => summariseAlert(alert, engine.esn)),
    );
    const worstAlert =
      engineAlerts
        .slice()
        .sort(
          (a, b) =>
            severityRank(b.severity) - severityRank(a.severity) ||
            (a.timeToActionHours ?? 1e9) - (b.timeToActionHours ?? 1e9),
        )[0] ?? null;

    const status = worstStatus(engines.map((engine) => engine.status));
    const geo = positionFor(aircraft, lastSectorByAircraft.get(aircraft.id) ?? null, operator.homeBase);
    const flaggedFamily = (engines.slice().sort((a, b) => statusRank(b.status) - statusRank(a.status))[0]?.family ??
      engines[0]?.family) as EngineFamily | undefined;

    const matches = stationState
      .map(({ facility, crew, freeSlots, utilisationPct }) =>
        matchStation(facility, geo, freeSlots, flaggedFamily ? (crew.byFamily.get(flaggedFamily) ?? 0) : crew.total, utilisationPct),
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearestCapable = matches.find((match) => match.capable) ?? null;
    const actionWindowHours = worstAlert?.timeToActionHours ?? null;
    const outOfReach =
      (status === "red" || status === "amber") &&
      (nearestCapable === null || (actionWindowHours !== null && nearestCapable.ferryHours > actionWindowHours));

    const recommendedAction = buildRecommendedAction(status, worstAlert, nearestCapable, geo.phase, geo.destination);

    return {
      id: aircraft.id,
      tail: aircraft.tail,
      type: aircraft.type,
      operatorId: operator.id,
      operatorCode: operator.code,
      operatorName: operator.name,
      fleetStatus: aircraft.status,
      phase: geo.phase,
      lat: geo.lat,
      lon: geo.lon,
      region: regionForCoords(geo.lat, geo.lon),
      origin: geo.origin,
      destination: geo.destination,
      progress: geo.progress,
      etaMinutes: geo.etaMinutes,
      altitudeFt: geo.altitudeFt,
      groundSpeedKts: geo.groundSpeedKts,
      status,
      families: Array.from(new Set(engines.map((engine) => engine.family))),
      engines: engines.map((engine) => summariseEngine(engine, openAlertsByEngine.get(engine.id) ?? [])),
      redEngines: engines.filter((engine) => engine.status === "red").length,
      amberEngines: engines.filter((engine) => engine.status === "amber").length,
      openAlerts: engineAlerts.length,
      worstAlert,
      nearestCapable,
      nearbyStations: matches.slice(0, 3),
      recommendedAction,
      actionWindowHours,
      outOfReach,
    };
  });

  const stations: FleetMapStation[] = stationState.map(({ facility, crew, freeSlots, utilisationPct }) => {
    const flaggedInRange = aircraftNodes.filter(
      (node) => node.status !== "green" && haversineKm(node, facility) <= CAPABILITY_RADIUS_KM,
    ).length;
    return {
      id: facility.id,
      name: facility.name,
      icao: facility.icao,
      region: facility.region,
      kind: facility.kind,
      lat: facility.lat,
      lon: facility.lon,
      capacity: facility.capacity,
      utilisationPct,
      freeSlots,
      technicians: crew.total,
      certifiedFamilies: Array.from(crew.byFamily.keys()),
      flaggedInRange,
      status: freeSlots === 0 ? "red" : freeSlots <= 1 ? "amber" : "green",
    };
  });

  const regions = summariseRegions(aircraftNodes, stations);

  return {
    generatedAt: iso(NOW),
    aircraft: aircraftNodes,
    stations,
    regions,
    operators: data.operators.map((operator) => ({
      id: operator.id,
      code: operator.code,
      name: operator.name,
      region: operator.region,
    })),
    families: Array.from(new Set(data.engines.map((engine) => engine.family))).sort(),
    totals: {
      aircraft: aircraftNodes.length,
      inFlight: aircraftNodes.filter((node) => node.phase === "in-flight").length,
      flaggedAircraft: aircraftNodes.filter((node) => node.status === "red" || node.status === "amber").length,
      redEngines: aircraftNodes.reduce((sum, node) => sum + node.redEngines, 0),
      amberEngines: aircraftNodes.reduce((sum, node) => sum + node.amberEngines, 0),
      unreachable: aircraftNodes.filter((node) => node.outOfReach).length,
      nearCapableBase: aircraftNodes.filter((node) => node.status !== "green" && node.nearestCapable !== null).length,
      freeSlots: stations.reduce((sum, station) => sum + station.freeSlots, 0),
    },
  };
}

function buildRecommendedAction(
  status: StatusLevel,
  worstAlert: FleetMapAlertSummary | null,
  nearestCapable: FleetMapStationMatch | null,
  phase: FleetMapPhase,
  destination: FleetMapPlace | null,
): string {
  if (status === "green" || !worstAlert) return "No action — continue routine EHM monitoring.";
  if (!nearestCapable) {
    return `${worstAlert.recommendedAction}. No certified station with a free slot in range — escalate to the network controller.`;
  }
  const where =
    phase === "in-flight" && destination && destination.icao !== nearestCapable.icao
      ? `after arrival ${destination.iata}, position ${nearestCapable.ferryHours}h to ${nearestCapable.icao}`
      : `at ${nearestCapable.icao}`;
  return `${worstAlert.recommendedAction} — ${where} (${nearestCapable.name}, ${nearestCapable.freeSlots} slot${nearestCapable.freeSlots === 1 ? "" : "s"} free).`;
}

function summariseRegions(aircraft: FleetMapAircraftNode[], stations: FleetMapStation[]): FleetMapRegionSummary[] {
  const regions: Region[] = [
    "Europe",
    "North America",
    "South America",
    "Middle East",
    "Africa",
    "Asia Pacific",
    "Greater China",
  ];
  return regions.map((region) => {
    const inRegion = aircraft.filter((node) => node.region === region);
    const red = inRegion.reduce((sum, node) => sum + node.redEngines, 0);
    const amber = inRegion.reduce((sum, node) => sum + node.amberEngines, 0);
    const regionStations = stations.filter((station) => station.region === region);
    const unreachable = inRegion.filter((node) => node.outOfReach).length;
    return {
      region,
      aircraft: inRegion.length,
      flaggedEngines: red + amber,
      redEngines: red,
      amberEngines: amber,
      stations: regionStations.length,
      freeSlots: regionStations.reduce((sum, station) => sum + station.freeSlots, 0),
      unreachable,
      status: red > 0 ? "red" : amber > 0 ? "amber" : inRegion.length === 0 ? "grey" : "green",
    };
  });
}
