import type {
  Aircraft,
  Alert,
  AlertSource,
  AlertState,
  AuditEntry,
  Contract,
  ContractKind,
  Engine,
  EngineFamily,
  EngineModule,
  Facility,
  Flight,
  InventoryItem,
  KpiSnapshot,
  LlpStatus,
  ModuleCode,
  Operator,
  Paginated,
  ParameterId,
  Part,
  Point,
  Prognostic,
  Series,
  ServiceBulletin,
  StatusLevel,
  TaskCard,
  Technician,
  TelemetrySnapshot,
  WorkOrder,
} from "@rr/types";
import {
  AIRPORTS,
  ENGINE_FAMILIES,
  ENGINE_MODULES,
  FACILITY_SEEDS,
  FAILURE_MODES,
  OPERATOR_SEEDS,
  PARAMETERS,
  SKILLS,
} from "./catalog";
import { addDays, addHours, clamp, createRng, daysAgo, iso, NOW, rand, round, type Rng } from "./rng";

export interface Dataset {
  operators: Operator[];
  aircraft: Aircraft[];
  engines: Engine[];
  engineModules: EngineModule[];
  flights: Flight[];
  alerts: Alert[];
  prognostics: Prognostic[];
  workOrders: WorkOrder[];
  taskCards: TaskCard[];
  facilities: Facility[];
  technicians: Technician[];
  parts: Part[];
  llps: LlpStatus[];
  inventory: InventoryItem[];
  contracts: Contract[];
  kpis: KpiSnapshot[];
  serviceBulletins: ServiceBulletin[];
  auditLog: AuditEntry[];
  generatedAt: string;
}

const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

function statusFromScore(score: number): StatusLevel {
  if (score < 45) return "red";
  if (score < 70) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */

function makeOperators(rng: Rng): Operator[] {
  return OPERATOR_SEEDS.map((seed, i) => ({
    id: id("OP", i + 1),
    code: seed.code,
    name: seed.name,
    region: seed.region,
    homeBase: seed.homeBase,
    contractId: id("CT", i + 1),
    fleetSize: rand.int(rng, 6, 22),
  }));
}

function makeFacilities(rng: Rng): Facility[] {
  return FACILITY_SEEDS.map((seed, i) => ({
    id: id("FC", i + 1),
    name: seed.name,
    icao: seed.icao,
    region: seed.region,
    kind: seed.kind,
    capacity: seed.capacity,
    utilisationPct: rand.int(rng, 52, 98),
    lat: seed.lat,
    lon: seed.lon,
  }));
}

function familyForAircraft(type: Aircraft["type"], rng: Rng): EngineFamily {
  const candidates = ENGINE_FAMILIES.filter((f) => f.aircraft.includes(type));
  return rand.pick(rng, candidates.length > 0 ? candidates : ENGINE_FAMILIES).family;
}

function makeFleet(rng: Rng, operators: Operator[]) {
  const aircraft: Aircraft[] = [];
  const engines: Engine[] = [];
  const engineModules: EngineModule[] = [];
  let acN = 0;
  let engN = 0;

  for (const operator of operators) {
    const seed = OPERATOR_SEEDS.find((o) => o.code === operator.code)!;
    for (let i = 0; i < operator.fleetSize; i += 1) {
      acN += 1;
      const type = rand.pick(rng, seed.fleet);
      const family = familyForAircraft(type, rng);
      const spec = ENGINE_FAMILIES.find((f) => f.family === family)!;
      const engineCount = type === "A380-800" ? 4 : 2;
      const aircraftId = id("AC", acN);
      const tail = `${operator.code === "BA" ? "G" : operator.code === "SQ" ? "9V" : operator.code === "EK" ? "A6" : "N"}-${operator.code}${String(acN).padStart(3, "0")}`;
      const engineIds: string[] = [];

      for (let p = 0; p < engineCount; p += 1) {
        engN += 1;
        const esn = `ESN-${20000 + engN}`;
        const cyclesSinceOverhaul = rand.int(rng, 40, spec.overhaulIntervalCycles);
        const lifeFraction = cyclesSinceOverhaul / spec.overhaulIntervalCycles;
        const environmentSeverity = rand.int(rng, 1, 5);
        const deterioration = lifeFraction * (0.55 + environmentSeverity * 0.09);
        const egtMargin = round(
          clamp(spec.newEgtMargin * (1 - deterioration) + rand.gaussian(rng, 0, 4), -6, spec.newEgtMargin),
          1,
        );
        const healthScore = round(clamp(38 + (egtMargin / spec.newEgtMargin) * 62 + rand.gaussian(rng, 0, 6), 5, 99), 0);
        const totalFlightCycles = cyclesSinceOverhaul + rand.int(rng, 0, 9000);
        const status = statusFromScore(healthScore);
        const engineId = id("EN", engN);
        engineIds.push(engineId);

        engines.push({
          id: engineId,
          esn,
          family,
          operatorId: operator.id,
          aircraftId,
          position: (p + 1) as 1 | 2 | 3 | 4,
          installedAt: iso(daysAgo(rand.int(rng, 30, 1800))),
          buildStandard: `${family.split(" ").pop()}-B${rand.int(rng, 1, 4)}.${rand.int(rng, 0, 9)}`,
          lifeStage:
            lifeFraction > 0.92 ? "pre-shop-visit" : lifeFraction < 0.12 ? "new" : lifeFraction > 0.6 ? "mature" : "mature",
          totalFlightHours: round(totalFlightCycles * rand.float(rng, 5.2, 8.4), 0),
          totalFlightCycles,
          hoursSinceOverhaul: round(cyclesSinceOverhaul * rand.float(rng, 5.2, 8.4), 0),
          cyclesSinceOverhaul,
          egtMargin,
          healthScore,
          status,
          rulCycles: Math.max(0, Math.round((spec.overhaulIntervalCycles - cyclesSinceOverhaul) * rand.float(rng, 0.75, 1.15))),
          environmentSeverity,
          thrustRating: `${(spec.thrustLbf / 1000).toFixed(0)}k lbf`,
          location: operator.homeBase,
        });

        for (const mod of ENGINE_MODULES) {
          const modLife = clamp(lifeFraction * rand.float(rng, 0.7, 1.35), 0, 1.25);
          engineModules.push({
            code: mod.code,
            label: mod.label,
            engineId,
            status: modLife > 0.95 ? "red" : modLife > 0.75 ? "amber" : "green",
            lifeConsumedPct: round(modLife * 100, 1),
            lastInspectedAt: iso(daysAgo(rand.int(rng, 5, 420))),
            gltfNodes: mod.gltfNodeHints,
          });
        }
      }

      aircraft.push({
        id: aircraftId,
        tail,
        type,
        operatorId: operator.id,
        msn: String(rand.int(rng, 100, 690)),
        deliveredAt: iso(daysAgo(rand.int(rng, 120, 3200))),
        engineIds,
        status: rand.weighted(rng, [
          { value: "in-service" as const, weight: 82 },
          { value: "in-maintenance" as const, weight: 12 },
          { value: "aog" as const, weight: 3 },
          { value: "stored" as const, weight: 3 },
        ]),
      });
    }
  }

  return { aircraft, engines, engineModules };
}

function makeFlights(rng: Rng, aircraft: Aircraft[]): Flight[] {
  const flights: Flight[] = [];
  let n = 0;
  for (const ac of aircraft) {
    const sectors = rand.int(rng, 8, 18);
    for (let i = 0; i < sectors; i += 1) {
      n += 1;
      const origin = rand.pick(rng, AIRPORTS);
      let destination = rand.pick(rng, AIRPORTS);
      while (destination.icao === origin.icao) destination = rand.pick(rng, AIRPORTS);
      const departedAt = addHours(daysAgo(rand.int(rng, 0, 45)), rand.int(rng, 0, 23));
      const blockHours = round(rand.float(rng, 2.5, 14.5), 1);
      flights.push({
        id: id("FL", n),
        aircraftId: ac.id,
        operatorId: ac.operatorId,
        flightNumber: `${ac.tail.split("-")[1]?.slice(0, 2) ?? "XX"}${rand.int(rng, 100, 999)}`,
        origin: origin.icao,
        destination: destination.icao,
        departedAt: iso(departedAt),
        arrivedAt: iso(addHours(departedAt, blockHours)),
        blockHours,
        cycles: 1,
        derate: rand.int(rng, 0, 25),
        outsideAirTempC: rand.int(rng, -8, 46),
        fuelBurnKg: round(blockHours * rand.float(rng, 5200, 7400), 0),
        environmentalExposure: round(((origin.dusty ? 0.5 : 0.08) + (destination.dusty ? 0.5 : 0.08)) * rand.float(rng, 0.6, 1), 2),
      });
    }
  }
  return flights;
}

const ALERT_SOURCES: AlertSource[] = [
  "EHM",
  "ACARS",
  "pilot-report",
  "borescope",
  "oil-debris",
  "vibration-analysis",
  "prognostic-model",
  "line-maintenance",
];

function makeAlerts(rng: Rng, engines: Engine[]): Alert[] {
  const alerts: Alert[] = [];
  let n = 0;
  for (const engine of engines) {
    const count = engine.status === "red" ? rand.int(rng, 2, 5) : engine.status === "amber" ? rand.int(rng, 1, 3) : rand.int(rng, 0, 1);
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const failure = rand.pick(rng, FAILURE_MODES);
      const severity = rand.weighted(rng, [
        { value: "critical" as const, weight: engine.status === "red" ? 26 : 4 },
        { value: "high" as const, weight: 22 },
        { value: "medium" as const, weight: 34 },
        { value: "low" as const, weight: 18 },
      ]);
      const status: StatusLevel = severity === "critical" ? "red" : severity === "high" ? "amber" : severity === "medium" ? "amber" : "green";
      const source = rand.pick(rng, ALERT_SOURCES);
      const parameter = rand.pick(rng, Object.keys(PARAMETERS) as ParameterId[]);
      alerts.push({
        id: id("AL", n),
        engineId: engine.id,
        operatorId: engine.operatorId,
        raisedAt: iso(daysAgo(rand.int(rng, 0, 60))),
        source,
        severity,
        status,
        state: rand.weighted<AlertState>(rng, [
          { value: "new", weight: 26 },
          { value: "triaged", weight: 20 },
          { value: "investigating", weight: 18 },
          { value: "actioned", weight: 16 },
          { value: "closed", weight: 14 },
          { value: "false-positive", weight: 6 },
        ]),
        title: `${failure.mode} — ${engine.esn}`,
        description: `${source} detected a deviation consistent with ${failure.mode.toLowerCase()} on ${engine.family} ${engine.esn}. Signature observed across ${rand.int(rng, 2, 14)} consecutive sectors.`,
        parameter,
        ataChapter: failure.ata,
        confidence: source === "prognostic-model" ? round(rand.float(rng, 0.62, 0.97), 2) : undefined,
        recommendedAction: rand.pick(rng, [
          "Schedule borescope inspection at next A-check",
          "Increase EHM sampling rate to every sector",
          "Plan on-wing water wash and re-baseline performance",
          "Raise work order for module swap at next available slot",
          "Defer — monitor trend for a further 25 cycles",
          "Ground engine pending oil debris laboratory analysis",
        ]),
        timeToActionHours: severity === "critical" ? rand.int(rng, 2, 48) : severity === "high" ? rand.int(rng, 48, 240) : rand.int(rng, 240, 1400),
      });
    }
  }
  return alerts;
}

function makePrognostics(rng: Rng, engines: Engine[]): Prognostic[] {
  const out: Prognostic[] = [];
  let n = 0;
  for (const engine of engines) {
    const count = engine.status === "green" ? 1 : rand.int(rng, 2, 3);
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const failure = rand.pick(rng, FAILURE_MODES);
      const probability = round(clamp(rand.float(rng, 0.02, 0.9) * (engine.status === "red" ? 1.3 : engine.status === "amber" ? 1 : 0.5), 0.01, 0.98), 2);
      const rul = Math.max(20, Math.round(engine.rulCycles * rand.float(rng, 0.4, 1.1)));
      out.push({
        id: id("PG", n),
        engineId: engine.id,
        moduleCode: failure.module,
        failureMode: failure.mode,
        probability,
        horizonCycles: rand.pick(rng, [250, 500, 1000, 2000]),
        rulCycles: rul,
        confidenceInterval: { min: Math.round(rul * 0.72), max: Math.round(rul * 1.34) },
        modelVersion: `ehm-prognostics-v${rand.int(rng, 3, 7)}.${rand.int(rng, 0, 9)}`,
        computedAt: iso(daysAgo(rand.int(rng, 0, 5))),
        drivers: [
          { label: "EGT margin decay rate", contribution: round(rand.float(rng, 0.1, 0.45), 2) },
          { label: "Environmental severity", contribution: round(rand.float(rng, 0.05, 0.35), 2) },
          { label: "Derate profile", contribution: round(rand.float(rng, 0.02, 0.25), 2) },
          { label: "Cycles since overhaul", contribution: round(rand.float(rng, 0.05, 0.3), 2) },
        ],
      });
    }
  }
  return out;
}

function makeMaintenance(rng: Rng, engines: Engine[], facilities: Facility[], alerts: Alert[]) {
  const workOrders: WorkOrder[] = [];
  const taskCards: TaskCard[] = [];
  let woN = 0;
  let tcN = 0;

  for (const engine of engines) {
    const needsWork = engine.status !== "green" || rand.bool(rng, 0.25);
    if (!needsWork) continue;
    woN += 1;
    const facility = rand.pick(rng, facilities);
    const type = rand.weighted(rng, [
      { value: "line" as const, weight: 26 },
      { value: "base" as const, weight: 16 },
      { value: "shop-visit" as const, weight: 18 },
      { value: "borescope" as const, weight: 20 },
      { value: "on-wing-repair" as const, weight: 10 },
      { value: "module-swap" as const, weight: 7 },
      { value: "aog-recovery" as const, weight: 3 },
    ]);
    const scheduledStart = addDays(NOW, rand.int(rng, -30, 90));
    const tatDays = type === "shop-visit" ? rand.int(rng, 45, 95) : type === "module-swap" ? rand.int(rng, 10, 25) : rand.int(rng, 1, 6);
    const state = rand.weighted(rng, [
      { value: "planned" as const, weight: 26 },
      { value: "released" as const, weight: 14 },
      { value: "in-progress" as const, weight: 22 },
      { value: "awaiting-parts" as const, weight: 12 },
      { value: "complete" as const, weight: 22 },
      { value: "draft" as const, weight: 4 },
    ]);
    const priority = engine.status === "red" ? rand.pick(rng, ["critical", "high"] as const) : rand.pick(rng, ["medium", "low"] as const);
    const workOrderId = id("WO", woN);
    const cards: string[] = [];
    const cardCount = type === "shop-visit" ? rand.int(rng, 5, 9) : rand.int(rng, 2, 5);
    for (let i = 0; i < cardCount; i += 1) {
      tcN += 1;
      const mod = rand.pick(rng, ENGINE_MODULES);
      const cardId = id("TC", tcN);
      cards.push(cardId);
      taskCards.push({
        id: cardId,
        workOrderId,
        reference: `TC-${mod.ataChapter}-${rand.int(rng, 100, 999)}`,
        title: rand.pick(rng, [
          `Borescope inspection — ${mod.label}`,
          `Replace ${mod.label} sensor harness`,
          `Blade blend repair — ${mod.label}`,
          `NDT eddy current survey — ${mod.label}`,
          `Strip and inspect ${mod.label}`,
          `Rebalance rotor assembly — ${mod.label}`,
        ]),
        ataChapter: mod.ataChapter,
        moduleCode: mod.code,
        estimatedHours: round(rand.float(rng, 2, 48), 1),
        skillRequired: rand.pick(rng, SKILLS),
        state: rand.weighted(rng, [
          { value: "open" as const, weight: 34 },
          { value: "in-progress" as const, weight: 26 },
          { value: "blocked" as const, weight: 12 },
          { value: "signed-off" as const, weight: 28 },
        ]),
        partsRequired: [],
      });
    }
    const estimatedCostUsd =
      type === "shop-visit" ? rand.int(rng, 3_800_000, 9_600_000) : type === "module-swap" ? rand.int(rng, 900_000, 2_600_000) : rand.int(rng, 18_000, 320_000);
    workOrders.push({
      id: workOrderId,
      reference: `WO-${2026}-${String(woN).padStart(4, "0")}`,
      engineId: engine.id,
      operatorId: engine.operatorId,
      type,
      state,
      priority,
      raisedAt: iso(daysAgo(rand.int(rng, 1, 120))),
      scheduledStart: iso(scheduledStart),
      scheduledEnd: iso(addDays(scheduledStart, tatDays)),
      facilityId: facility.id,
      estimatedCostUsd,
      actualCostUsd: state === "complete" ? Math.round(estimatedCostUsd * rand.float(rng, 0.86, 1.32)) : undefined,
      taskCardIds: cards,
      triggeringAlertIds: alerts.filter((a) => a.engineId === engine.id).slice(0, 2).map((a) => a.id),
      tatDays,
      status: priority === "critical" ? "red" : state === "awaiting-parts" ? "amber" : state === "complete" ? "green" : "amber",
    });
  }

  return { workOrders, taskCards };
}

const FIRST_NAMES = ["Amelia", "Raj", "Chen", "Sofia", "Marcus", "Priya", "Tom", "Ines", "Yusuf", "Hannah", "Diego", "Nadia", "Oliver", "Mei", "Kwame", "Lena"];
const LAST_NAMES = ["Hughes", "Patel", "Wei", "Marques", "Okafor", "Silva", "Novak", "Haddad", "Kim", "Fischer", "Bianchi", "Ahmed", "Lindqvist", "Traoré"];

function makeTechnicians(rng: Rng, facilities: Facility[]): Technician[] {
  const out: Technician[] = [];
  let n = 0;
  for (const facility of facilities) {
    const count = facility.capacity * rand.int(rng, 3, 6);
    for (let i = 0; i < count; i += 1) {
      n += 1;
      out.push({
        id: id("TN", n),
        name: `${rand.pick(rng, FIRST_NAMES)} ${rand.pick(rng, LAST_NAMES)}`,
        facilityId: facility.id,
        licences: rand.sample(rng, ["EASA Part-66 B1", "EASA Part-66 B2", "FAA A&P", "CAAC AMT"], rand.int(rng, 1, 2)),
        skills: rand.sample(rng, SKILLS, rand.int(rng, 2, 5)),
        shift: rand.pick(rng, ["early", "late", "night"] as const),
        utilisationPct: rand.int(rng, 45, 99),
        certifiedFamilies: rand.sample(rng, ENGINE_FAMILIES.map((f) => f.family), rand.int(rng, 1, 3)),
      });
    }
  }
  return out;
}

function makeParts(rng: Rng): Part[] {
  const out: Part[] = [];
  for (const mod of ENGINE_MODULES) {
    for (let i = 0; i < 6; i += 1) {
      const lifeLimited = i < 2;
      out.push({
        partNumber: `RR-${mod.code}-${rand.int(rng, 10000, 99999)}`,
        description: `${mod.label} ${rand.pick(rng, ["rotor disc", "blade set", "seal segment", "bearing", "casing half", "sensor harness", "vane ring", "liner tile"])}`,
        moduleCode: mod.code,
        lifeLimited,
        cyclicLimit: lifeLimited ? rand.pick(rng, [8000, 10000, 12000, 15000, 20000]) : undefined,
        unitCostUsd: lifeLimited ? rand.int(rng, 180_000, 1_400_000) : rand.int(rng, 1_200, 96_000),
        leadTimeDays: rand.int(rng, 3, 260),
        supplier: rand.pick(rng, ["Rolls-Royce Derby", "Rolls-Royce Dahlewitz", "ITP Aero", "Safran", "GKN Aerospace", "Howmet", "MTU Aero Engines"]),
      });
    }
  }
  return out;
}

function makeLlps(rng: Rng, engines: Engine[], parts: Part[]): LlpStatus[] {
  const lifed = parts.filter((p) => p.lifeLimited);
  const out: LlpStatus[] = [];
  let n = 0;
  for (const engine of engines) {
    for (const part of rand.sample(rng, lifed, 6)) {
      n += 1;
      const limit = part.cyclicLimit ?? 12000;
      const used = clamp(engine.totalFlightCycles * rand.float(rng, 0.5, 1.05), 0, limit * 1.02);
      const remaining = Math.max(0, Math.round(limit - used));
      out.push({
        id: id("LL", n),
        engineId: engine.id,
        partNumber: part.partNumber,
        serialNumber: `SN${rand.int(rng, 100000, 999999)}`,
        moduleCode: part.moduleCode,
        cyclesUsed: Math.round(used),
        cyclicLimit: limit,
        cyclesRemaining: remaining,
        status: remaining < 400 ? "red" : remaining < 1500 ? "amber" : "green",
        projectedExpiryDate: iso(addDays(NOW, Math.round(remaining / rand.float(rng, 1.2, 3.4)))),
      });
    }
  }
  return out;
}

function makeInventory(rng: Rng, parts: Part[], facilities: Facility[]): InventoryItem[] {
  const out: InventoryItem[] = [];
  let n = 0;
  for (const facility of facilities) {
    for (const part of rand.sample(rng, parts, 22)) {
      n += 1;
      const onHand = rand.int(rng, 0, 24);
      const reorderPoint = rand.int(rng, 2, 10);
      out.push({
        id: id("IV", n),
        partNumber: part.partNumber,
        facilityId: facility.id,
        onHand,
        reserved: rand.int(rng, 0, Math.max(0, onHand)),
        onOrder: rand.int(rng, 0, 12),
        reorderPoint,
        status: onHand === 0 ? "red" : onHand <= reorderPoint ? "amber" : "green",
        nextDeliveryAt: rand.bool(rng, 0.6) ? iso(addDays(NOW, rand.int(rng, 1, 120))) : null,
      });
    }
  }
  return out;
}

function makeContracts(rng: Rng, operators: Operator[], engines: Engine[]): Contract[] {
  return operators.map((operator, i) => {
    const covered = engines.filter((e) => e.operatorId === operator.id).map((e) => e.id);
    const target = rand.float(rng, 97, 99.5, 1);
    const actual = round(clamp(target + rand.gaussian(rng, -0.4, 0.8), 90, 100), 2);
    const kind = rand.pick<ContractKind>(rng, ["TotalCare", "TotalCare Flex", "SelectCare", "Time & Materials"]);
    return {
      id: id("CT", i + 1),
      operatorId: operator.id,
      kind,
      startsAt: iso(daysAgo(rand.int(rng, 400, 2600))),
      endsAt: iso(addDays(NOW, rand.int(rng, 120, 3600))),
      ratePerEfhUsd: round(rand.float(rng, 180, 460), 2),
      availabilityTarget: target,
      availabilityActual: actual,
      penaltiesUsd: actual < target ? rand.int(rng, 50_000, 2_400_000) : 0,
      coveredEngineIds: covered,
      status: actual < target - 0.8 ? "red" : actual < target ? "amber" : "green",
    };
  });
}

function historyPoints(rng: Rng, base: number, months: number, drift: number): Point[] {
  const points: Point[] = [];
  let value = base;
  for (let i = months; i >= 0; i -= 1) {
    value = value + rand.gaussian(rng, drift, Math.abs(base) * 0.02);
    points.push({ t: iso(daysAgo(i * 30)), v: round(value, 2) });
  }
  return points;
}

function makeKpis(rng: Rng, engines: Engine[], workOrders: WorkOrder[], contracts: Contract[]): KpiSnapshot[] {
  const red = engines.filter((e) => e.status === "red").length;
  const avgAvailability = round(contracts.reduce((s, c) => s + c.availabilityActual, 0) / contracts.length, 2);
  const aogCount = workOrders.filter((w) => w.type === "aog-recovery").length;
  const defs: Omit<KpiSnapshot, "history">[] = [
    { id: "kpi-dispatch", label: "Dispatch reliability", value: round(rand.float(rng, 99.1, 99.85), 2), unit: "%", target: 99.5, trend: "up", deltaPct: round(rand.float(rng, -0.3, 0.4), 2), status: "green" },
    { id: "kpi-availability", label: "Fleet availability", value: avgAvailability, unit: "%", target: 98.5, trend: avgAvailability >= 98.5 ? "up" : "down", deltaPct: round(rand.float(rng, -1.2, 0.9), 2), status: avgAvailability >= 98.5 ? "green" : "amber" },
    { id: "kpi-ifsd", label: "IFSD rate", value: round(rand.float(rng, 0.002, 0.012), 3), unit: "/1000 EFH", target: 0.008, trend: "flat", deltaPct: round(rand.float(rng, -12, 9), 1), status: "green" },
    { id: "kpi-unscheduled", label: "Unscheduled removals", value: rand.int(rng, 4, 19), unit: "engines", target: 8, trend: "down", deltaPct: round(rand.float(rng, -18, 22), 1), status: "amber" },
    { id: "kpi-red-engines", label: "Engines flagged red", value: red, unit: "engines", target: 0, trend: red > 8 ? "up" : "flat", deltaPct: round(rand.float(rng, -8, 26), 1), status: red > 6 ? "red" : red > 2 ? "amber" : "green" },
    { id: "kpi-tat", label: "Shop visit TAT", value: rand.int(rng, 52, 88), unit: "days", target: 60, trend: "down", deltaPct: round(rand.float(rng, -9, 6), 1), status: "amber" },
    { id: "kpi-aog", label: "Active AOG events", value: aogCount, unit: "events", target: 0, trend: "flat", deltaPct: 0, status: aogCount > 2 ? "red" : aogCount > 0 ? "amber" : "green" },
    { id: "kpi-cost", label: "Maintenance cost per EFH", value: round(rand.float(rng, 210, 340), 2), unit: "USD", target: 250, trend: "up", deltaPct: round(rand.float(rng, -4, 11), 1), status: "amber" },
    { id: "kpi-fuel", label: "Fuel burn deviation", value: round(rand.float(rng, 0.4, 2.6), 2), unit: "%", target: 1.0, trend: "up", deltaPct: round(rand.float(rng, -5, 14), 1), status: "amber" },
    { id: "kpi-mtbur", label: "MTBUR", value: rand.int(rng, 9000, 21000), unit: "hours", target: 12000, trend: "up", deltaPct: round(rand.float(rng, -3, 8), 1), status: "green" },
  ];
  return defs.map((d) => ({ ...d, history: historyPoints(rng, d.value, 12, d.trend === "up" ? d.value * 0.004 : -d.value * 0.003) }));
}

function makeServiceBulletins(rng: Rng, engines: Engine[]): ServiceBulletin[] {
  const out: ServiceBulletin[] = [];
  for (let i = 0; i < 18; i += 1) {
    const family = rand.pick(rng, ENGINE_FAMILIES).family;
    const affected = engines.filter((e) => e.family === family).map((e) => e.id);
    const embodied = rand.sample(rng, affected, Math.floor(affected.length * rand.float(rng, 0.1, 0.9)));
    const due = addDays(NOW, rand.int(rng, -60, 720));
    const kind = rand.weighted(rng, [
      { value: "SB" as const, weight: 55 },
      { value: "AD" as const, weight: 25 },
      { value: "ASB" as const, weight: 20 },
    ]);
    out.push({
      id: id("SB", i + 1),
      reference: `${kind}-${family.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase()}-${rand.int(rng, 72, 79)}-${rand.int(rng, 1000, 9999)}`,
      kind,
      title: rand.pick(rng, [
        "Inspection of HPT stage 1 blade coating",
        "Introduction of improved IPC rotor blade",
        "Repetitive borescope inspection of combustor tiles",
        "Software update to EEC build standard",
        "Replacement of fuel manifold clamp",
        "Enhanced oil debris monitoring sampling",
      ]),
      family,
      issuedAt: iso(daysAgo(rand.int(rng, 30, 900))),
      complianceDueAt: iso(due),
      mandatory: kind !== "SB",
      affectedEngineIds: affected,
      embodiedEngineIds: embodied,
      status: due < NOW ? "red" : embodied.length / Math.max(1, affected.length) < 0.4 ? "amber" : "green",
      estimatedHoursPerEngine: round(rand.float(rng, 1.5, 90), 1),
    });
  }
  return out;
}

function makeAuditLog(rng: Rng, workOrders: WorkOrder[], alerts: Alert[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  const actors = ["a.hughes@rolls-royce.com", "r.patel@rolls-royce.com", "ehm-service", "prognostics-pipeline", "m.silva@rolls-royce.com"];
  for (let i = 0; i < 220; i += 1) {
    const useWo = rand.bool(rng, 0.5) && workOrders.length > 0;
    const entity = useWo ? rand.pick(rng, workOrders) : rand.pick(rng, alerts);
    out.push({
      id: id("AU", i + 1),
      at: iso(daysAgo(rand.float(rng, 0, 45, 3))),
      actor: rand.pick(rng, actors),
      action: useWo ? rand.pick(rng, ["work-order.state-changed", "work-order.cost-updated", "task-card.signed-off"]) : rand.pick(rng, ["alert.triaged", "alert.escalated", "alert.closed", "alert.assigned"]),
      entityType: useWo ? "WorkOrder" : "Alert",
      entityId: entity.id,
      detail: useWo ? `Work order ${(entity as WorkOrder).reference} updated` : `Alert ${(entity as Alert).id} handled`,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ------------------------------------------------------------------ */

export function generateDataset(seed = "rr-engine-2026"): Dataset {
  const rng = createRng(seed);
  const operators = makeOperators(rng);
  const facilities = makeFacilities(rng);
  const { aircraft, engines, engineModules } = makeFleet(rng, operators);
  const flights = makeFlights(rng, aircraft);
  const alerts = makeAlerts(rng, engines);
  const prognostics = makePrognostics(rng, engines);
  const { workOrders, taskCards } = makeMaintenance(rng, engines, facilities, alerts);
  const technicians = makeTechnicians(rng, facilities);
  const parts = makeParts(rng);
  const llps = makeLlps(rng, engines, parts);
  const inventory = makeInventory(rng, parts, facilities);
  const contracts = makeContracts(rng, operators, engines);
  const kpis = makeKpis(rng, engines, workOrders, contracts);
  const serviceBulletins = makeServiceBulletins(rng, engines);
  const auditLog = makeAuditLog(rng, workOrders, alerts);

  return {
    operators,
    aircraft,
    engines,
    engineModules,
    flights,
    alerts,
    prognostics,
    workOrders,
    taskCards,
    facilities,
    technicians,
    parts,
    llps,
    inventory,
    contracts,
    kpis,
    serviceBulletins,
    auditLog,
    generatedAt: iso(NOW),
  };
}

/* ------------------------------------------------------------------ */
/* Derived series                                                      */
/* ------------------------------------------------------------------ */

/** Per-engine parameter history, generated on demand and deterministic per engine. */
export function engineSeries(engine: Engine, parameter: ParameterId, days = 180): Series {
  const def = PARAMETERS[parameter];
  const rng = createRng(`${engine.id}:${parameter}`);
  const points: Point[] = [];
  const worse = def.direction === "higher-is-worse";
  const start = worse ? def.nominal.min + (def.nominal.max - def.nominal.min) * 0.45 : def.nominal.max * 0.9;
  const health = engine.healthScore / 100;
  let value = parameter === "egtMargin" ? engine.egtMargin + (1 - health) * 18 : start;

  for (let i = days; i >= 0; i -= 3) {
    const drift = (worse ? 1 : -1) * (1 - health) * Math.abs(start) * 0.0022;
    value = value + drift * 3 + rand.gaussian(rng, 0, Math.abs(start) * 0.006);
    points.push({ t: iso(daysAgo(i)), v: round(value, parameter === "oilConsumption" || parameter.startsWith("vib") ? 2 : 1) });
  }

  return {
    id: `${engine.id}:${parameter}`,
    label: def.label,
    unit: def.unit,
    points,
    amberThreshold: worse ? def.amber.min : def.amber.max,
    redThreshold: worse ? def.red.min : def.red.max,
  };
}

export function latestTelemetry(engine: Engine): TelemetrySnapshot {
  const values: Partial<Record<ParameterId, number>> = {};
  for (const parameter of Object.keys(PARAMETERS) as ParameterId[]) {
    const series = engineSeries(engine, parameter, 12);
    values[parameter] = series.points[series.points.length - 1]?.v;
  }
  return { engineId: engine.id, t: iso(NOW), values };
}

export function paginate<T>(items: T[], page = 1, pageSize = 25): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export type { ModuleCode, StatusLevel };
