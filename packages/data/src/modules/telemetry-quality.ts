/**
 * Telemetry quality selectors.
 *
 * The synthetic fleet records which sectors were flown; this module derives how
 * much of the expected engine health monitoring data actually arrived, how
 * fresh it is and whether the samples are physically plausible. Everything is
 * deterministic: the same engine always has the same feed history.
 */

import type {
  DownstreamImpact,
  EngineFeedQuality,
  FeedIssue,
  FlightDataGap,
  IngestDay,
  ParameterFeedQuality,
  ParameterId,
  ParameterRollup,
  StatusLevel,
  TelemetryQualityReport,
  TelemetryQualitySummary,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import type { Dataset } from "../generate";
import { getDataset } from "../index";
import { clamp, createRng, daysAgo, iso, NOW, rand, round } from "../rng";

const WINDOW_DAYS = 30;
/** A feed is stale once a full week has passed without a snapshot. */
const STALE_HOURS = 168;

const PARAMETER_IDS = Object.keys(PARAMETERS) as ParameterId[];

/** Sampling reliability of the airborne link, by fit standard. */
const LINK_CLASSES = [
  { id: "ehm-4g", label: "EHM 4G quick access recorder", base: 1, weight: 52 },
  { id: "acars", label: "ACARS narrow-band downlink", base: 0.99, weight: 30 },
  { id: "legacy", label: "Legacy manual snapshot upload", base: 0.93, weight: 13 },
  { id: "degraded", label: "Unserviceable data acquisition unit", base: 0.45, weight: 5 },
] as const;

/** Parameters that are only fitted on the newer data acquisition standards. */
const OPTIONAL_PARAMETERS: ParameterId[] = ["tipClearance", "oilDebrisCount", "bleedPressure"];

function coverageStatus(coveragePct: number, received: number): StatusLevel {
  if (received === 0) return "grey";
  if (coveragePct >= 97) return "green";
  if (coveragePct >= 88) return "amber";
  return "red";
}

/** Aggregate coverage (a whole day, or a parameter across the fleet) tolerates more loss. */
function aggregateStatus(coveragePct: number, received: number): StatusLevel {
  if (received === 0) return "grey";
  if (coveragePct >= 93) return "green";
  if (coveragePct >= 85) return "amber";
  return "red";
}

function worst(levels: StatusLevel[]): StatusLevel {
  if (levels.includes("red")) return "red";
  if (levels.includes("amber")) return "amber";
  if (levels.includes("green")) return "green";
  return "grey";
}

function hoursBetween(from: Date, to: Date): number {
  return round((to.getTime() - from.getTime()) / 3_600_000, 1);
}

function linkClassFor(engineId: string) {
  const rng = createRng(`tq:link:${engineId}`);
  return rand.weighted(
    rng,
    LINK_CLASSES.map((c) => ({ value: c, weight: c.weight })),
  );
}

/* ------------------------------------------------------------------ */
/* Per-engine feed quality                                             */
/* ------------------------------------------------------------------ */

interface ParameterFeedResult {
  feed: ParameterFeedQuality;
  /** One flag per sector in the window: did this parameter arrive? */
  sectorFlags: boolean[];
}

function parameterFeed(
  engineId: string,
  parameter: ParameterId,
  sectors: { departedAt: string }[],
  linkBase: number,
  fitted: boolean,
): ParameterFeedResult {
  const def = PARAMETERS[parameter];
  const rng = createRng(`tq:param:${engineId}:${parameter}`);
  const expected = fitted ? sectors.length : 0;
  /** Per-parameter sensor availability on top of the link reliability. */
  const sensorHealth = !fitted
    ? 0
    : rand.weighted(rng, [
        { value: 1, weight: 90 },
        { value: clamp(rand.float(rng, 0.7, 0.95), 0, 1), weight: 9 },
        { value: 0, weight: 1 },
      ]);
  const received: string[] = [];
  const sectorFlags: boolean[] = [];

  for (const sector of fitted ? sectors : []) {
    const arrived = rand.bool(rng, linkBase * sensorHealth);
    sectorFlags.push(arrived);
    if (arrived) received.push(sector.departedAt);
  }

  const coveragePct = expected === 0 ? 0 : round((received.length / expected) * 100, 1);
  const lastSampleAt = received.length > 0 ? received[received.length - 1]! : null;
  const hoursSinceLastSample = lastSampleAt ? hoursBetween(new Date(lastSampleAt), NOW) : null;

  // Signal integrity: stuck values and physically implausible readings.
  const frozenSamples = received.length > 3 && rand.bool(rng, 0.035) ? rand.int(rng, 3, Math.min(9, received.length)) : 0;
  const outOfRangeSamples = received.length > 0 && rand.bool(rng, 0.05) ? rand.int(rng, 1, Math.max(1, Math.round(received.length * 0.2))) : 0;

  const issues: FeedIssue[] = [];
  if (received.length === 0) issues.push("no-data");
  if (received.length > 0 && coveragePct < 97) issues.push("gap");
  if (hoursSinceLastSample !== null && hoursSinceLastSample > STALE_HOURS) issues.push("stale");
  if (frozenSamples > 0) issues.push("frozen");
  if (outOfRangeSamples > 0) issues.push("out-of-range");

  const levels: StatusLevel[] = [coverageStatus(coveragePct, received.length)];
  if (hoursSinceLastSample !== null)
    levels.push(hoursSinceLastSample > STALE_HOURS * 2 ? "red" : hoursSinceLastSample > STALE_HOURS ? "amber" : "green");
  if (frozenSamples > 0) levels.push(frozenSamples >= 6 ? "red" : "amber");
  if (outOfRangeSamples > 0) levels.push("amber");

  const feed: ParameterFeedQuality = {
    engineId,
    parameter,
    label: def.label,
    unit: def.unit,
    ataChapter: def.ataChapter,
    fitted,
    expectedSnapshots: expected,
    receivedSnapshots: received.length,
    missingSnapshots: Math.max(0, expected - received.length),
    coveragePct,
    lastSampleAt,
    hoursSinceLastSample,
    frozenSamples,
    outOfRangeSamples,
    issues,
    status: received.length === 0 ? "grey" : worst(levels),
  };

  return { feed, sectorFlags };
}

const ACTIONS = {
  noData: "Raise line-maintenance task to restore the data acquisition unit before the next sector",
  stale: "Chase the operator for a manual snapshot upload; suspend automated trending until fresh data lands",
  frozen: "Book a sensor harness continuity check — the signal is frozen, not stable",
  gaps: "Increase EHM sampling rate to every sector and re-baseline once coverage recovers",
  plausibility: "Quarantine implausible samples and re-run the parameter validation rule set",
  nominal: "No action — feed is complete and inside plausibility limits",
} as const;

function recommendedAction(feed: {
  deadParameters: number;
  hoursSinceLastSample: number | null;
  frozenSignals: number;
  coveragePct: number;
  outOfRangeSamples: number;
}): string {
  if (feed.deadParameters > 0) return ACTIONS.noData;
  if (feed.hoursSinceLastSample !== null && feed.hoursSinceLastSample > STALE_HOURS) return ACTIONS.stale;
  if (feed.frozenSignals > 0) return ACTIONS.frozen;
  if (feed.coveragePct < 88) return ACTIONS.gaps;
  if (feed.outOfRangeSamples > 0) return ACTIONS.plausibility;
  return ACTIONS.nominal;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const ANALYTICS: { id: string; analytic: string; href: string; dependsOn: ParameterId[]; consequence: string }[] = [
  {
    id: "egt-trending",
    analytic: "EGT margin trending",
    href: "/health/trending",
    dependsOn: ["egt", "egtMargin", "t30", "p30"],
    consequence: "Deterioration rates are extrapolated from fewer points, so removal forecasts widen.",
  },
  {
    id: "prognostics",
    analytic: "Prognostic RUL models",
    href: "/predict/rul",
    dependsOn: ["egtMargin", "n2", "n3", "fuelFlow", "tipClearance"],
    consequence: "Models fall back to fleet priors where sector data is missing; confidence intervals widen.",
  },
  {
    id: "vibration",
    analytic: "Vibration signature analysis",
    href: "/health/vibration",
    dependsOn: ["vibN1", "vibN2", "vibN3"],
    consequence: "Rotor imbalance onset can be missed between snapshots on the affected engines.",
  },
  {
    id: "oil",
    analytic: "Oil system health",
    href: "/health/oil",
    dependsOn: ["oilPressure", "oilTemp", "oilConsumption", "oilDebrisCount"],
    consequence: "Consumption rate and debris counts are computed over an incomplete sample.",
  },
  {
    id: "performance",
    analytic: "Performance & fuel burn",
    href: "/health/performance",
    dependsOn: ["fuelFlow", "n1", "bleedPressure"],
    consequence: "Specific fuel consumption deltas are not comparable sector to sector.",
  },
];

let cachedReport: TelemetryQualityReport | null = null;

/** Cached because the whole fleet feed history is derived in one pass. */
export function telemetryQualityReport(): TelemetryQualityReport {
  if (!cachedReport) cachedReport = buildTelemetryQualityReport(getDataset());
  return cachedReport;
}

export function buildTelemetryQualityReport(dataset: Dataset): TelemetryQualityReport {
  // Start of the earliest day in the window, so every sector lands in an ingest bucket.
  const windowStart = new Date(`${iso(daysAgo(WINDOW_DAYS - 1)).slice(0, 10)}T00:00:00.000Z`);
  const aircraftById = new Map(dataset.aircraft.map((a) => [a.id, a]));
  const operatorById = new Map(dataset.operators.map((o) => [o.id, o]));

  const flightsInWindow = dataset.flights
    .filter((f) => new Date(f.departedAt) >= windowStart && new Date(f.departedAt) <= NOW)
    .sort((a, b) => (a.departedAt < b.departedAt ? -1 : 1));

  const sectorsByAircraft = new Map<string, typeof flightsInWindow>();
  for (const flight of flightsInWindow) {
    const list = sectorsByAircraft.get(flight.aircraftId) ?? [];
    list.push(flight);
    sectorsByAircraft.set(flight.aircraftId, list);
  }

  /** Per engine, how many parameters actually arrived for each sector it flew. */
  const receiptsByEngine = new Map<string, Map<string, number>>();

  const engines: EngineFeedQuality[] = dataset.engines.map((engine) => {
    const aircraft = engine.aircraftId ? aircraftById.get(engine.aircraftId) : undefined;
    const operator = operatorById.get(engine.operatorId);
    const sectors = (engine.aircraftId ? sectorsByAircraft.get(engine.aircraftId) : undefined) ?? [];
    const link = linkClassFor(engine.id);
    const fittedRng = createRng(`tq:fit:${engine.id}`);
    const optionalFitted = link.id === "ehm-4g" || rand.bool(fittedRng, 0.35);

    const results = PARAMETER_IDS.map((parameter) =>
      parameterFeed(engine.id, parameter, sectors, link.base, optionalFitted || !OPTIONAL_PARAMETERS.includes(parameter)),
    );
    const parameters = results.map((r) => r.feed);

    const expectedSnapshots = parameters.reduce((s, p) => s + p.expectedSnapshots, 0);
    const receivedSnapshots = parameters.reduce((s, p) => s + p.receivedSnapshots, 0);
    const coveragePct = expectedSnapshots === 0 ? 0 : round((receivedSnapshots / expectedSnapshots) * 100, 1);
    const lastSamples = parameters.map((p) => p.lastSampleAt).filter((t): t is string => t !== null);
    const lastSampleAt = lastSamples.length > 0 ? lastSamples.sort()[lastSamples.length - 1]! : null;
    const hoursSinceLastSample = lastSampleAt ? hoursBetween(new Date(lastSampleAt), NOW) : null;
    const deadParameters = parameters.filter((p) => p.fitted && p.status === "grey").length;
    const unfittedParameters = parameters.filter((p) => !p.fitted).length;
    const degradedParameters = parameters.filter((p) => p.status === "red" || p.status === "amber").length;
    const frozenSignals = parameters.filter((p) => p.frozenSamples > 0).length;
    const outOfRangeSamples = parameters.reduce((s, p) => s + p.outOfRangeSamples, 0);

    const receipts = new Map<string, number>();
    sectors.forEach((sector, index) => {
      receipts.set(sector.id, results.reduce((s, r) => s + (r.sectorFlags[index] ? 1 : 0), 0));
    });
    receiptsByEngine.set(engine.id, receipts);

    const sectorsReported = sectors.filter((_, index) => results.some((r) => r.sectorFlags[index])).length;

    const freshness = hoursSinceLastSample === null ? 0 : clamp(100 - Math.max(0, hoursSinceLastSample - 96) * 0.28, 0, 100);
    const integrity = clamp(100 - frozenSignals * 9 - outOfRangeSamples * 2.5 - deadParameters * 6, 0, 100);
    const trustIndex = sectors.length === 0 ? 0 : Math.round(coveragePct * 0.55 + freshness * 0.2 + integrity * 0.25);

    const status: StatusLevel =
      sectors.length === 0 || receivedSnapshots === 0
        ? "grey"
        : worst([
            coverageStatus(coveragePct, receivedSnapshots),
            deadParameters > 0 ? "red" : "green",
            trustIndex < 70 ? "red" : trustIndex < 88 ? "amber" : "green",
          ]);

    const impactedAlertIds =
      status === "red" || status === "grey"
        ? dataset.alerts
            .filter((a) => a.engineId === engine.id && a.state !== "closed" && a.state !== "false-positive")
            .map((a) => a.id)
        : [];

    return {
      engineId: engine.id,
      esn: engine.esn,
      family: engine.family,
      operatorId: engine.operatorId,
      operatorCode: operator?.code ?? "—",
      operatorName: operator?.name ?? "Unassigned",
      aircraftTail: aircraft?.tail ?? null,
      position: engine.position,
      engineStatus: engine.status,
      sectorsFlown: sectors.length,
      sectorsReported,
      sectorsMissing: Math.max(0, sectors.length - sectorsReported),
      coveragePct,
      lastSampleAt,
      hoursSinceLastSample,
      degradedParameters,
      deadParameters,
      unfittedParameters,
      frozenSignals,
      outOfRangeSamples,
      trustIndex,
      status,
      impactedAlertIds,
      recommendedAction: recommendedAction({ deadParameters, hoursSinceLastSample, frozenSignals, coveragePct, outOfRangeSamples }),
      parameters,
    };
  });

  /* Parameter roll-up ---------------------------------------------- */
  const engineById = new Map(engines.map((e) => [e.engineId, e]));

  const parameterRollup: ParameterRollup[] = PARAMETER_IDS.map((parameter) => {
    const feeds = engines.map((e) => e.parameters.find((p) => p.parameter === parameter)!);
    const expected = feeds.reduce((s, f) => s + f.expectedSnapshots, 0);
    const received = feeds.reduce((s, f) => s + f.receivedSnapshots, 0);
    const coveragePct = expected === 0 ? 0 : round((received / expected) * 100, 1);
    const enginesNoData = feeds.filter((f) => f.fitted && f.status === "grey").length;
    const enginesNotFitted = feeds.filter((f) => !f.fitted).length;
    const enginesDegraded = feeds.filter((f) => f.status === "red" || f.status === "amber").length;
    return {
      parameter,
      label: PARAMETERS[parameter].label,
      unit: PARAMETERS[parameter].unit,
      ataChapter: PARAMETERS[parameter].ataChapter,
      coveragePct,
      enginesNoData,
      enginesNotFitted,
      enginesDegraded,
      frozenSignals: feeds.filter((f) => f.frozenSamples > 0).length,
      outOfRangeSamples: feeds.reduce((s, f) => s + f.outOfRangeSamples, 0),
      status: worst([aggregateStatus(coveragePct, received), enginesNoData >= 5 ? "amber" : "green"]),
    };
  });

  /* Daily ingest --------------------------------------------------- */
  const ingest: IngestDay[] = [];
  for (let d = WINDOW_DAYS - 1; d >= 0; d -= 1) {
    const day = daysAgo(d);
    const dayKey = iso(day).slice(0, 10);
    const dayFlights = flightsInWindow.filter((f) => f.departedAt.slice(0, 10) === dayKey);
    let expected = 0;
    let received = 0;
    for (const flight of dayFlights) {
      const aircraft = aircraftById.get(flight.aircraftId);
      for (const engineId of aircraft?.engineIds ?? []) {
        const feed = engineById.get(engineId);
        if (!feed) continue;
        expected += PARAMETER_IDS.length - feed.unfittedParameters;
        received += receiptsByEngine.get(engineId)?.get(flight.id) ?? 0;
      }
    }
    const coveragePct = expected === 0 ? 0 : round((received / expected) * 100, 1);
    ingest.push({ date: iso(day), expected, received, coveragePct, status: aggregateStatus(coveragePct, received) });
  }

  /* Flights with missing or partial data ---------------------------- */
  const flightGaps: FlightDataGap[] = [];
  for (const flight of flightsInWindow) {
    const aircraft = aircraftById.get(flight.aircraftId);
    if (!aircraft) continue;
    const feeds = aircraft.engineIds.map((id) => engineById.get(id)).filter((f): f is EngineFeedQuality => !!f);
    if (feeds.length === 0) continue;
    const expectedParameters = feeds.reduce((s, f) => s + (PARAMETER_IDS.length - f.unfittedParameters), 0);
    const receivedParameters = feeds.reduce((s, f) => s + (receiptsByEngine.get(f.engineId)?.get(flight.id) ?? 0), 0);
    const missingCount = expectedParameters - receivedParameters;
    // Only sectors that lost a material share of their snapshot are worth chasing.
    if (missingCount / expectedParameters < 0.1) continue;
    const worstFeed = [...feeds].sort((a, b) => a.coveragePct - b.coveragePct)[0]!;
    const missingParameters = worstFeed.parameters
      .filter((p) => p.fitted && (p.status === "grey" || p.coveragePct < 92))
      .slice(0, 6)
      .map((p) => p.parameter);
    const kind = receivedParameters === 0 ? "missing" : "partial";
    flightGaps.push({
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      aircraftTail: aircraft.tail,
      operatorCode: operatorById.get(flight.operatorId)?.code ?? "—",
      route: `${flight.origin} → ${flight.destination}`,
      departedAt: flight.departedAt,
      blockHours: flight.blockHours,
      engineIds: aircraft.engineIds,
      expectedParameters,
      receivedParameters,
      missingParameters,
      kind,
      status: kind === "missing" ? "grey" : missingCount / expectedParameters > 0.25 ? "red" : "amber",
    });
  }
  flightGaps.sort((a, b) => (a.departedAt < b.departedAt ? 1 : -1));

  /* Downstream impact ----------------------------------------------- */
  const impacts: DownstreamImpact[] = ANALYTICS.map((analytic) => {
    const feeds = engines.flatMap((e) => e.parameters.filter((p) => analytic.dependsOn.includes(p.parameter)));
    const expected = feeds.reduce((s, f) => s + f.expectedSnapshots, 0);
    const received = feeds.reduce((s, f) => s + f.receivedSnapshots, 0);
    const coveragePct = expected === 0 ? 0 : round((received / expected) * 100, 1);
    const enginesAffected = engines.filter((e) =>
      e.parameters.some((p) => p.fitted && analytic.dependsOn.includes(p.parameter) && p.status !== "green"),
    ).length;
    const enginesBlind = engines.filter((e) =>
      e.parameters.some((p) => p.fitted && analytic.dependsOn.includes(p.parameter) && p.status === "grey"),
    ).length;
    return {
      ...analytic,
      coveragePct,
      enginesAffected,
      enginesBlind,
      status: enginesBlind >= 10 ? "red" : worst([aggregateStatus(coveragePct, received), enginesBlind > 0 ? "amber" : "green"]),
    };
  }).sort((a, b) => b.enginesBlind - a.enginesBlind || a.coveragePct - b.coveragePct);

  /* Summary ---------------------------------------------------------- */
  const snapshotsExpected = engines.reduce((s, e) => s + e.parameters.reduce((t, p) => t + p.expectedSnapshots, 0), 0);
  const snapshotsReceived = engines.reduce((s, e) => s + e.parameters.reduce((t, p) => t + p.receivedSnapshots, 0), 0);
  const reporting = engines.filter((e) => e.sectorsFlown > 0);
  const unverifiableRedAlerts = engines
    .filter((e) => e.status === "red" || e.status === "grey")
    .reduce((s, e) => s + e.impactedAlertIds.length, 0);

  const summary: TelemetryQualitySummary = {
    windowDays: WINDOW_DAYS,
    engines: engines.length,
    enginesGreen: engines.filter((e) => e.status === "green").length,
    enginesAmber: engines.filter((e) => e.status === "amber").length,
    enginesRed: engines.filter((e) => e.status === "red").length,
    enginesNoData: engines.filter((e) => e.status === "grey").length,
    parametersMonitored: PARAMETER_IDS.length,
    snapshotsExpected,
    snapshotsReceived,
    fleetCoveragePct: snapshotsExpected === 0 ? 0 : round((snapshotsReceived / snapshotsExpected) * 100, 1),
    fleetTrustIndex:
      reporting.length === 0 ? 0 : Math.round(reporting.reduce((s, e) => s + e.trustIndex, 0) / reporting.length),
    staleFeeds: engines.filter((e) => e.hoursSinceLastSample !== null && e.hoursSinceLastSample > STALE_HOURS).length,
    frozenSignals: engines.reduce((s, e) => s + e.frozenSignals, 0),
    outOfRangeSamples: engines.reduce((s, e) => s + e.outOfRangeSamples, 0),
    flightsMissingData: flightGaps.filter((f) => f.kind === "missing").length,
    flightsPartialData: flightGaps.filter((f) => f.kind === "partial").length,
    unverifiableRedAlerts,
  };

  return { summary, engines, parameters: parameterRollup, ingest, flightGaps, impacts };
}

/** Engines whose feed cannot support the alerts currently raised against them. */
export function untrustedEngineFeeds(report: TelemetryQualityReport = telemetryQualityReport()): EngineFeedQuality[] {
  return report.engines
    .filter((e) => e.status === "red" || e.status === "grey" || e.impactedAlertIds.length > 0)
    .sort((a, b) => b.impactedAlertIds.length - a.impactedAlertIds.length || a.trustIndex - b.trustIndex);
}

export function engineFeedQuality(engineId: string): EngineFeedQuality | undefined {
  return telemetryQualityReport().engines.find((e) => e.engineId === engineId || e.esn === engineId);
}
