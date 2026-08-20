/**
 * Environmental exposure selectors.
 *
 * Every value here is derived from the deterministic fleet in `generate.ts`
 * (flights, aircraft, engines) combined with airport climate reference data, so
 * the API, the web app and tests observe identical exposure scores.
 *
 * Model, in one paragraph: each catalog airport carries a climate profile
 * (aridity, mineral dust source strength, distance to salt water, urban
 * pollution and mean daily maximum temperature). Those become five 0-100 driver
 * intensities. A sector's exposure is the mean of its origin and destination
 * intensities; an engine's exposure is the sector-weighted mean over every
 * sector its aircraft has flown in the sample window, calibrated against the
 * severity band recorded for the engine by the EHM ground system. The composite
 * severity index drives a severity-adjusted overhaul interval.
 */

import type {
  AirportExposure,
  EngineExposure,
  EnvironmentExposureReport,
  EnvironmentSummary,
  ExposureCorrelation,
  ExposureDriverDefinition,
  ExposureDriverId,
  IntervalRecommendation,
  Region,
  RotationAction,
  RouteExposure,
  StatusLevel,
} from "@rr/types";
import { AIRPORTS, ENGINE_FAMILIES } from "../catalog";
import { getDataset } from "../index";
import { clamp, NOW, round } from "../rng";

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export const EXPOSURE_DRIVERS: ExposureDriverDefinition[] = [
  {
    id: "dust",
    label: "Airborne dust",
    mechanism: "Fine mineral dust glazes HPT cooling holes and blocks blade film cooling.",
    weight: 0.3,
    unit: "index",
  },
  {
    id: "sand",
    label: "Sand ingestion",
    mechanism: "Coarse quartz erodes compressor aerofoils and strips blade coatings.",
    weight: 0.24,
    unit: "index",
  },
  {
    id: "salinity",
    label: "Salt-laden air",
    mechanism: "Marine aerosol drives LPT and turbine disc sulphidation attack.",
    weight: 0.18,
    unit: "index",
  },
  {
    id: "pollution",
    label: "Urban pollution",
    mechanism: "Sulphate and soot loading accelerates hot-section corrosion and fouling.",
    weight: 0.12,
    unit: "index",
  },
  {
    id: "temperature",
    label: "Ambient temperature",
    mechanism: "High OAT raises take-off EGT, consuming margin on every cycle.",
    weight: 0.16,
    unit: "index",
  },
];

const DRIVER_IDS = EXPOSURE_DRIVERS.map((d) => d.id);

interface ClimateProfile {
  climate: string;
  region: Region;
  /** 0-1 dryness of the surrounding terrain. */
  aridity: number;
  /** 0-1 strength of the local mineral sand source. */
  sandSource: number;
  /** Kilometres to salt water; fresh-water coastlines are treated as inland. */
  saltWaterKm: number;
  /** 0-1 urban/industrial particulate and sulphate loading. */
  pollution: number;
  /** Mean daily maximum temperature, °C. */
  meanMaxTempC: number;
  routeGroup: string;
}

const CLIMATE: Record<string, ClimateProfile> = {
  EGLL: { climate: "Temperate maritime", region: "Europe", aridity: 0.12, sandSource: 0.04, saltWaterKm: 55, pollution: 0.55, meanMaxTempC: 15, routeGroup: "North Atlantic & Europe" },
  EDDF: { climate: "Temperate continental", region: "Europe", aridity: 0.15, sandSource: 0.04, saltWaterKm: 380, pollution: 0.52, meanMaxTempC: 19, routeGroup: "North Atlantic & Europe" },
  LPPT: { climate: "Mediterranean, Saharan intrusions", region: "Europe", aridity: 0.36, sandSource: 0.16, saltWaterKm: 6, pollution: 0.44, meanMaxTempC: 24, routeGroup: "Iberia & West Med" },
  KJFK: { climate: "Humid continental, coastal", region: "North America", aridity: 0.18, sandSource: 0.05, saltWaterKm: 2, pollution: 0.5, meanMaxTempC: 23, routeGroup: "North Atlantic & Europe" },
  KLAX: { climate: "Coastal semi-arid", region: "North America", aridity: 0.56, sandSource: 0.22, saltWaterKm: 1, pollution: 0.62, meanMaxTempC: 24, routeGroup: "Pacific coastal" },
  CYYZ: { climate: "Humid continental", region: "North America", aridity: 0.18, sandSource: 0.05, saltWaterKm: 520, pollution: 0.38, meanMaxTempC: 21, routeGroup: "North Atlantic & Europe" },
  SBGR: { climate: "Subtropical plateau", region: "South America", aridity: 0.2, sandSource: 0.06, saltWaterKm: 58, pollution: 0.68, meanMaxTempC: 25, routeGroup: "South Atlantic" },
  OMDB: { climate: "Hot desert, coastal", region: "Middle East", aridity: 0.94, sandSource: 0.9, saltWaterKm: 3, pollution: 0.6, meanMaxTempC: 41, routeGroup: "Gulf & Arabian Peninsula" },
  OTHH: { climate: "Hot desert, coastal", region: "Middle East", aridity: 0.95, sandSource: 0.88, saltWaterKm: 4, pollution: 0.58, meanMaxTempC: 42, routeGroup: "Gulf & Arabian Peninsula" },
  OERK: { climate: "Hot desert interior", region: "Middle East", aridity: 1, sandSource: 0.96, saltWaterKm: 330, pollution: 0.54, meanMaxTempC: 43, routeGroup: "Gulf & Arabian Peninsula" },
  VIDP: { climate: "Semi-arid, Thar dust belt", region: "Asia Pacific", aridity: 0.78, sandSource: 0.68, saltWaterKm: 900, pollution: 0.96, meanMaxTempC: 35, routeGroup: "South Asia dust belt" },
  ZBAA: { climate: "Semi-arid, spring dust storms", region: "Greater China", aridity: 0.68, sandSource: 0.58, saltWaterKm: 150, pollution: 0.84, meanMaxTempC: 27, routeGroup: "North Asia dust belt" },
  VHHH: { climate: "Humid subtropical, coastal", region: "Greater China", aridity: 0.16, sandSource: 0.05, saltWaterKm: 1, pollution: 0.62, meanMaxTempC: 30, routeGroup: "Pacific coastal" },
  WSSS: { climate: "Tropical maritime", region: "Asia Pacific", aridity: 0.05, sandSource: 0.03, saltWaterKm: 1, pollution: 0.46, meanMaxTempC: 32, routeGroup: "Pacific coastal" },
  RJTT: { climate: "Humid subtropical, bayside", region: "Asia Pacific", aridity: 0.12, sandSource: 0.07, saltWaterKm: 1, pollution: 0.48, meanMaxTempC: 26, routeGroup: "Pacific coastal" },
  YSSY: { climate: "Temperate oceanic", region: "Asia Pacific", aridity: 0.26, sandSource: 0.14, saltWaterKm: 1, pollution: 0.34, meanMaxTempC: 23, routeGroup: "Pacific coastal" },
  HAAB: { climate: "Highland semi-arid", region: "Africa", aridity: 0.62, sandSource: 0.46, saltWaterKm: 620, pollution: 0.52, meanMaxTempC: 24, routeGroup: "African highland & Sahel" },
  FAOR: { climate: "Highveld semi-arid", region: "Africa", aridity: 0.58, sandSource: 0.48, saltWaterKm: 480, pollution: 0.6, meanMaxTempC: 26, routeGroup: "African highland & Sahel" },
};

const FALLBACK_CLIMATE: ClimateProfile = {
  climate: "Unclassified",
  region: "Europe",
  aridity: 0.3,
  sandSource: 0.15,
  saltWaterKm: 200,
  pollution: 0.45,
  meanMaxTempC: 22,
  routeGroup: "Unclassified",
};

/** Sample window of the flight record held by the platform, in days. */
export const EXPOSURE_WINDOW_DAYS = 45;

/** Indicative cost of one unplanned severity-driven engine removal. */
const UNPLANNED_REMOVAL_COST_USD = 4_200_000;

/* ------------------------------------------------------------------ */
/* Scoring primitives                                                  */
/* ------------------------------------------------------------------ */

export function exposureStatus(index: number): StatusLevel {
  if (index >= 62) return "red";
  if (index >= 45) return "amber";
  return "green";
}

function driverIntensities(profile: ClimateProfile): Record<ExposureDriverId, number> {
  return {
    dust: round(clamp(10 + profile.aridity * 70 + profile.sandSource * 18, 0, 100), 1),
    sand: round(clamp(profile.sandSource * 94 + profile.aridity * 6, 0, 100), 1),
    salinity: round(clamp(96 * Math.exp(-profile.saltWaterKm / 14), 0, 100), 1),
    pollution: round(clamp(profile.pollution * 100, 0, 100), 1),
    temperature: round(clamp(((profile.meanMaxTempC - 8) / 35) * 100, 0, 100), 1),
  };
}

function composite(drivers: Record<ExposureDriverId, number>): number {
  return round(
    EXPOSURE_DRIVERS.reduce((sum, driver) => sum + drivers[driver.id] * driver.weight, 0),
    1,
  );
}

function emptyDrivers(): Record<ExposureDriverId, number> {
  return { dust: 0, sand: 0, salinity: 0, pollution: 0, temperature: 0 };
}

/* ------------------------------------------------------------------ */
/* Airport & route exposure                                            */
/* ------------------------------------------------------------------ */

interface AirportBase {
  icao: string;
  iata: string;
  city: string;
  lat: number;
  lon: number;
  profile: ClimateProfile;
  drivers: Record<ExposureDriverId, number>;
  severityIndex: number;
}

let airportBaseCache: Map<string, AirportBase> | null = null;

function airportBases(): Map<string, AirportBase> {
  if (airportBaseCache) return airportBaseCache;
  const map = new Map<string, AirportBase>();
  for (const airport of AIRPORTS) {
    const profile = CLIMATE[airport.icao] ?? FALLBACK_CLIMATE;
    const drivers = driverIntensities(profile);
    map.set(airport.icao, {
      icao: airport.icao,
      iata: airport.iata,
      city: airport.city,
      lat: airport.lat,
      lon: airport.lon,
      profile,
      drivers,
      severityIndex: composite(drivers),
    });
  }
  airportBaseCache = map;
  return map;
}

/** Route group ("Gulf & Arabian Peninsula", …) an airport belongs to. */
export function routeGroupForAirport(icao: string): string {
  return (CLIMATE[icao] ?? FALLBACK_CLIMATE).routeGroup;
}

interface ExposureIndex {
  airports: AirportExposure[];
  routes: RouteExposure[];
  engines: EngineExposure[];
}

let indexCache: ExposureIndex | null = null;

function buildIndex(): ExposureIndex {
  const data = getDataset();
  const bases = airportBases();

  const airportUse = new Map<string, { sectors: number; engines: Set<string> }>();
  const routeUse = new Map<
    string,
    { origin: string; destination: string; sectors: number; blockHours: number; operators: Set<string>; engines: Set<string> }
  >();

  interface EngineAccumulator {
    sectors: number;
    driverTotals: Record<ExposureDriverId, number>;
    harshSectors: number;
    routeSectors: Map<string, number>;
  }
  const engineAcc = new Map<string, EngineAccumulator>();
  const enginesByAircraft = new Map<string, string[]>();
  for (const engine of data.engines) {
    if (!engine.aircraftId) continue;
    const list = enginesByAircraft.get(engine.aircraftId) ?? [];
    list.push(engine.id);
    enginesByAircraft.set(engine.aircraftId, list);
  }

  for (const flight of data.flights) {
    const origin = bases.get(flight.origin);
    const destination = bases.get(flight.destination);
    if (!origin || !destination) continue;
    const engineIds = enginesByAircraft.get(flight.aircraftId) ?? [];

    for (const icao of [flight.origin, flight.destination]) {
      const entry = airportUse.get(icao) ?? { sectors: 0, engines: new Set<string>() };
      entry.sectors += 1;
      for (const engineId of engineIds) entry.engines.add(engineId);
      airportUse.set(icao, entry);
    }

    const [a, b] = [flight.origin, flight.destination].sort() as [string, string];
    const routeId = `${a}-${b}`;
    const route =
      routeUse.get(routeId) ??
      { origin: a, destination: b, sectors: 0, blockHours: 0, operators: new Set<string>(), engines: new Set<string>() };
    route.sectors += 1;
    route.blockHours += flight.blockHours;
    const operator = data.operators.find((o) => o.id === flight.operatorId);
    if (operator) route.operators.add(operator.code);
    for (const engineId of engineIds) route.engines.add(engineId);
    routeUse.set(routeId, route);

    const sectorDrivers = emptyDrivers();
    for (const driver of DRIVER_IDS) {
      sectorDrivers[driver] = (origin.drivers[driver] + destination.drivers[driver]) / 2;
    }
    const harsh = exposureStatus(origin.severityIndex) === "red" || exposureStatus(destination.severityIndex) === "red";

    for (const engineId of engineIds) {
      const acc =
        engineAcc.get(engineId) ??
        {
          sectors: 0,
          driverTotals: emptyDrivers(),
          harshSectors: 0,
          routeSectors: new Map<string, number>(),
        };
      acc.sectors += 1;
      for (const driver of DRIVER_IDS) acc.driverTotals[driver] += sectorDrivers[driver];
      if (harsh) acc.harshSectors += 1;
      acc.routeSectors.set(routeId, (acc.routeSectors.get(routeId) ?? 0) + 1);
      engineAcc.set(engineId, acc);
    }
  }

  const airports: AirportExposure[] = [...bases.values()]
    .map((base) => {
      const use = airportUse.get(base.icao);
      return {
        icao: base.icao,
        iata: base.iata,
        city: base.city,
        lat: base.lat,
        lon: base.lon,
        region: base.profile.region,
        climate: base.profile.climate,
        drivers: base.drivers,
        severityIndex: base.severityIndex,
        status: use && use.sectors > 0 ? exposureStatus(base.severityIndex) : ("grey" as StatusLevel),
        sectors: use?.sectors ?? 0,
        enginesExposed: use?.engines.size ?? 0,
      };
    })
    .sort((a, b) => b.severityIndex - a.severityIndex);

  const routes: RouteExposure[] = [...routeUse.entries()]
    .map(([id, route]) => {
      const origin = bases.get(route.origin)!;
      const destination = bases.get(route.destination)!;
      const drivers = emptyDrivers();
      for (const driver of DRIVER_IDS) drivers[driver] = (origin.drivers[driver] + destination.drivers[driver]) / 2;
      const severityIndex = composite(drivers);
      const worstDriver = DRIVER_IDS.reduce((worst, driver) =>
        drivers[driver] * driverWeight(driver) > drivers[worst] * driverWeight(worst) ? driver : worst,
      );
      return {
        id,
        origin: route.origin,
        destination: route.destination,
        originIata: origin.iata,
        destinationIata: destination.iata,
        label: `${origin.iata}–${destination.iata}`,
        sectors: route.sectors,
        severityIndex,
        status: exposureStatus(severityIndex),
        worstDriver,
        operatorCodes: [...route.operators].sort(),
        engineCount: route.engines.size,
        blockHours: round(route.blockHours, 0),
      };
    })
    .sort((a, b) => b.severityIndex - a.severityIndex || b.sectors - a.sectors);

  const routeById = new Map(routes.map((r) => [r.id, r]));

  const engines: EngineExposure[] = data.engines.map((engine) => {
    const acc = engineAcc.get(engine.id);
    const operator = data.operators.find((o) => o.id === engine.operatorId)!;
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const spec = ENGINE_FAMILIES.find((f) => f.family === engine.family)!;
    const sectors = acc?.sectors ?? 0;

    const meanDrivers = emptyDrivers();
    if (sectors > 0 && acc) {
      for (const driver of DRIVER_IDS) meanDrivers[driver] = acc.driverTotals[driver] / sectors;
    }
    const routeIndex = composite(meanDrivers);
    /* The EHM ground system files each engine into a 1-5 severity band from the
       operator's own dust and salt reporting; blend it with the route-derived
       index so recorded experience and planned routing both count. */
    const bandIndex = 18 + ((engine.environmentSeverity - 1) / 4) * 74;
    const severityIndex = sectors > 0 ? round(routeIndex * 0.6 + bandIndex * 0.4, 1) : 0;
    const scale = routeIndex > 0 ? severityIndex / routeIndex : 0;

    const contributions = emptyDrivers();
    for (const driver of DRIVER_IDS) {
      contributions[driver] = round(meanDrivers[driver] * driverWeight(driver) * scale, 1);
    }

    const worstRouteId =
      acc && acc.routeSectors.size > 0
        ? [...acc.routeSectors.keys()].sort(
            (a, b) => (routeById.get(b)?.severityIndex ?? 0) - (routeById.get(a)?.severityIndex ?? 0),
          )[0]!
        : null;

    const deteriorationRate =
      engine.cyclesSinceOverhaul > 0
        ? round(((spec.newEgtMargin - engine.egtMargin) / engine.cyclesSinceOverhaul) * 1000, 2)
        : 0;

    const factor = clamp(1 - 0.42 * ((severityIndex - 35) / 65), 0.62, 1);
    const adjustedIntervalCycles = Math.round(spec.overhaulIntervalCycles * factor);
    const cyclesToAdjustedRemoval = adjustedIntervalCycles - engine.cyclesSinceOverhaul;

    const ageDays = aircraft
      ? Math.max(180, (NOW.getTime() - new Date(aircraft.deliveredAt).getTime()) / 86_400_000)
      : 365;
    const cyclesPerYear = Math.round(clamp(engine.totalFlightCycles / (ageDays / 365), 220, 1150));

    const status: StatusLevel =
      sectors === 0
        ? "grey"
        : cyclesToAdjustedRemoval <= 0 || severityIndex >= 62
          ? "red"
          : severityIndex >= 45
            ? "amber"
            : "green";

    return {
      engineId: engine.id,
      esn: engine.esn,
      family: engine.family,
      operatorId: engine.operatorId,
      operatorCode: operator.code,
      operatorName: operator.name,
      region: operator.region,
      aircraftTail: aircraft?.tail ?? null,
      sectors,
      severityIndex,
      status,
      contributions,
      harshSectorPct: sectors > 0 ? round(((acc?.harshSectors ?? 0) / sectors) * 100, 0) : 0,
      worstRouteId,
      worstRouteLabel: worstRouteId ? (routeById.get(worstRouteId)?.label ?? null) : null,
      cyclesSinceOverhaul: engine.cyclesSinceOverhaul,
      egtMargin: engine.egtMargin,
      deteriorationRate,
      baselineIntervalCycles: spec.overhaulIntervalCycles,
      adjustedIntervalCycles,
      intervalDeltaCycles: adjustedIntervalCycles - spec.overhaulIntervalCycles,
      cyclesPerYear,
      cyclesToAdjustedRemoval,
      recommendedAction: recommendedAction(severityIndex, cyclesToAdjustedRemoval, sectors),
    };
  });

  indexCache = { airports, routes, engines };
  return indexCache;
}

function driverWeight(id: ExposureDriverId): number {
  return EXPOSURE_DRIVERS.find((d) => d.id === id)!.weight;
}

function recommendedAction(severityIndex: number, cyclesToRemoval: number, sectors: number): string {
  if (sectors === 0) return "No sector data — exclude from severity review";
  if (cyclesToRemoval <= 0) return "Plan removal — severity-adjusted interval already exceeded";
  if (severityIndex >= 62 && cyclesToRemoval < 500) return "Rotate to temperate routing and book a shop slot";
  if (severityIndex >= 62) return "Rotate off harsh sectors at the next rotation window";
  if (severityIndex >= 45) return "Water-wash every 250 cycles and hold on the watchlist";
  return "No action — baseline interval remains valid";
}

/* ------------------------------------------------------------------ */
/* Public selectors                                                    */
/* ------------------------------------------------------------------ */

function exposureIndex(): ExposureIndex {
  if (!indexCache) buildIndex();
  return indexCache!;
}

export function airportExposure(): AirportExposure[] {
  return exposureIndex().airports;
}

export function routeExposure(): RouteExposure[] {
  return exposureIndex().routes;
}

export function engineExposure(): EngineExposure[] {
  return exposureIndex().engines;
}

export function engineExposureFor(engineId: string): EngineExposure | undefined {
  return exposureIndex().engines.find((e) => e.engineId === engineId || e.esn === engineId);
}

/** Least-squares fit of deterioration rate against composite severity index. */
export function exposureCorrelation(): ExposureCorrelation {
  const sample = exposureIndex().engines.filter((e) => e.sectors > 0 && e.cyclesSinceOverhaul > 200);
  const n = sample.length;
  if (n < 3) {
    return { points: [], slope: 0, intercept: 0, r: 0, rSquared: 0, sampleSize: 0, ratePer10Points: 0 };
  }
  const meanX = sample.reduce((s, e) => s + e.severityIndex, 0) / n;
  const meanY = sample.reduce((s, e) => s + e.deteriorationRate, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const e of sample) {
    const dx = e.severityIndex - meanX;
    const dy = e.deteriorationRate - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return {
    points: sample.map((e) => ({
      engineId: e.engineId,
      esn: e.esn,
      severityIndex: e.severityIndex,
      deteriorationRate: e.deteriorationRate,
      status: e.status,
    })),
    slope: round(slope, 4),
    intercept: round(meanY - slope * meanX, 3),
    r: round(r, 3),
    rSquared: round(r * r, 3),
    sampleSize: n,
    ratePer10Points: round(slope * 10, 3),
  };
}

function actionFor(meanSeverity: number, redShare: number): RotationAction {
  if (meanSeverity >= 62 || redShare >= 0.5) return "rotate";
  if (meanSeverity >= 52) return "shorten-interval";
  if (meanSeverity >= 42) return "monitor";
  return "hold";
}

let recommendationCache: IntervalRecommendation[] | null = null;

/** Recommended interval adjustments per operator × route group. */
export function intervalRecommendations(): IntervalRecommendation[] {
  if (recommendationCache) return recommendationCache;
  const data = getDataset();
  const engines = exposureIndex().engines.filter((e) => e.sectors > 0);
  const groups = new Map<string, EngineExposure[]>();

  for (const engine of engines) {
    /* Engines are filed under the group driving their exposure, not the one
       they fly most: a concession is justified by the worst environment. */
    const key = `${engine.operatorId}::${worstExposureRouteGroup(engine)}`;
    const list = groups.get(key) ?? [];
    list.push(engine);
    groups.set(key, list);
  }

  const out: IntervalRecommendation[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const [operatorId, routeGroup] = key.split("::") as [string, string];
    const operator = data.operators.find((o) => o.id === operatorId)!;
    const meanSeverity = round(members.reduce((s, m) => s + m.severityIndex, 0) / members.length, 1);
    const baseline = Math.round(members.reduce((s, m) => s + m.baselineIntervalCycles, 0) / members.length);
    const recommended = Math.round(members.reduce((s, m) => s + m.adjustedIntervalCycles, 0) / members.length);
    const redShare = members.filter((m) => m.status === "red").length / members.length;
    const cyclesPerYear = Math.round(members.reduce((s, m) => s + m.cyclesPerYear, 0) / members.length);
    /* Unplanned-removal exposure avoided: the share of severity-driven early
       removals the adjusted interval is expected to convert into planned work. */
    const avoidedRisk = clamp((meanSeverity - 40) / 120, 0, 0.4);
    const removalsPerYear = (members.length * cyclesPerYear) / Math.max(1, baseline);
    const annualCostImpactUsd = Math.round(removalsPerYear * avoidedRisk * UNPLANNED_REMOVAL_COST_USD);
    const action = actionFor(meanSeverity, redShare);
    /* Only rotate/shorten populations actually adopt a concession; watchlist and
       nominal populations stay on the published interval. */
    const adopts = action === "rotate" || action === "shorten-interval";
    const recommendedInterval = adopts ? recommended : baseline;

    out.push({
      id: `${operator.code}-${routeGroup.replace(/[^A-Za-z]+/g, "-").toLowerCase()}`,
      operatorId,
      operatorCode: operator.code,
      operatorName: operator.name,
      region: operator.region,
      routeGroup,
      engineCount: members.length,
      meanSeverityIndex: meanSeverity,
      status: exposureStatus(meanSeverity),
      baselineIntervalCycles: baseline,
      recommendedIntervalCycles: recommendedInterval,
      deltaPct: round(((recommendedInterval - baseline) / baseline) * 100, 1),
      annualCostImpactUsd: adopts ? annualCostImpactUsd : 0,
      action,
      rationale: rationaleFor(action, routeGroup, meanSeverity, baseline - recommendedInterval),
    });
  }

  recommendationCache = out.sort((a, b) => b.meanSeverityIndex - a.meanSeverityIndex || b.engineCount - a.engineCount);
  return recommendationCache;
}

function worstExposureRouteGroup(engine: EngineExposure): string {
  const route = exposureIndex().routes.find((r) => r.id === engine.worstRouteId);
  if (!route) return "Unclassified";
  const originGroup = routeGroupForAirport(route.origin);
  const destinationGroup = routeGroupForAirport(route.destination);
  const originSeverity = airportSeverity(route.origin);
  const destinationSeverity = airportSeverity(route.destination);
  return originSeverity >= destinationSeverity ? originGroup : destinationGroup;
}

function airportSeverity(icao: string): number {
  return airportBases().get(icao)?.severityIndex ?? 0;
}

function rationaleFor(action: RotationAction, routeGroup: string, meanSeverity: number, tightening: number): string {
  switch (action) {
    case "rotate":
      return `Severity ${meanSeverity} on ${routeGroup} sectors. Rotate the worst engines onto temperate routings and tighten the interval by ${tightening} cycles.`;
    case "shorten-interval":
      return `Sustained severity ${meanSeverity} on ${routeGroup}. Adopt the ${tightening}-cycle tightening rather than re-routing; the fleet absorbs it inside the existing slot plan.`;
    case "monitor":
      return `Severity ${meanSeverity} on ${routeGroup} sits inside the watchlist band. Hold the baseline interval and re-score after the next 250 cycles.`;
    default:
      return `Severity ${meanSeverity} on ${routeGroup} is nominal. No interval change justified.`;
  }
}

export function environmentSummary(): EnvironmentSummary {
  const engines = exposureIndex().engines.filter((e) => e.sectors > 0);
  const airports = exposureIndex().airports;
  const recommendations = intervalRecommendations();
  const sectors = exposureIndex().routes.reduce((s, r) => s + r.sectors, 0);

  const ranked = [...engines].sort((a, b) => a.severityIndex - b.severityIndex);
  const quartile = Math.max(1, Math.floor(ranked.length / 4));
  const mild = ranked.slice(0, quartile);
  const harsh = ranked.slice(-quartile);
  const meanRate = (list: EngineExposure[]) => list.reduce((s, e) => s + e.deteriorationRate, 0) / Math.max(1, list.length);

  const worst = airports.find((a) => a.sectors > 0) ?? null;
  const harshSectors = engines.reduce((s, e) => s + (e.harshSectorPct / 100) * e.sectors, 0);
  const totalEngineSectors = engines.reduce((s, e) => s + e.sectors, 0);

  return {
    enginesAssessed: engines.length,
    sectorsAnalysed: sectors,
    windowDays: EXPOSURE_WINDOW_DAYS,
    meanSeverityIndex: round(engines.reduce((s, e) => s + e.severityIndex, 0) / Math.max(1, engines.length), 1),
    redEngines: engines.filter((e) => e.status === "red").length,
    amberEngines: engines.filter((e) => e.status === "amber").length,
    harshSectorPct: round((harshSectors / Math.max(1, totalEngineSectors)) * 100, 0),
    marginPenalty: round(meanRate(harsh) - meanRate(mild), 2),
    cyclesAtRisk: engines.reduce((s, e) => s + Math.max(0, -e.cyclesToAdjustedRemoval), 0),
    annualCostImpactUsd: recommendations
      .filter((r) => r.action === "rotate" || r.action === "shorten-interval")
      .reduce((s, r) => s + r.annualCostImpactUsd, 0),
    worstAirport: worst ? { iata: worst.iata, city: worst.city, severityIndex: worst.severityIndex } : null,
    generatedAt: NOW.toISOString(),
  };
}

/** Everything the environmental exposure module renders, in one call. */
export function environmentExposureReport(): EnvironmentExposureReport {
  return {
    summary: environmentSummary(),
    drivers: EXPOSURE_DRIVERS,
    airports: airportExposure(),
    routes: routeExposure(),
    engines: engineExposure(),
    correlation: exposureCorrelation(),
    recommendations: intervalRecommendations(),
  };
}
