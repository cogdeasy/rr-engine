/**
 * Derived selectors for the `compliance` module (SB & AD embodiment).
 *
 * Everything here is derived from the deterministic dataset: the bulletin
 * population comes from `dataset.serviceBulletins`, the applicable engines from
 * the bulletin's own `affectedEngineIds`, and per-engine utilisation from the
 * generated flight history. Per-task detail that the base generator does not
 * carry (utilisation limits, evidence, kit cost) is derived from a stable RNG
 * seeded with the bulletin/engine pair, so every render, API call and test sees
 * identical values.
 */

import type {
  ComplianceBulletin,
  ComplianceBundleOption,
  ComplianceDisposition,
  ComplianceEvidence,
  ComplianceHorizonBucket,
  ComplianceLimitDriver,
  ComplianceMatrix,
  ComplianceMatrixCell,
  ComplianceMatrixRow,
  ComplianceOperatorRollup,
  ComplianceSummary,
  ComplianceTask,
  Engine,
  ServiceBulletin,
  StatusLevel,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { createRng, NOW, addDays, iso, rand, round } from "../rng";

/** Days inside which an outstanding obligation joins the planning watchlist. */
export const COMPLIANCE_HORIZON_DAYS = 90;

const LABOUR_RATE_USD_PER_HOUR = 185;
/** Access, transport and out-of-service cost avoided by bundling into a shop visit. */
const STANDALONE_ACCESS_COST_USD = 42_000;

const SIGNATORIES = [
  "a.hughes@rolls-royce.com",
  "r.patel@rolls-royce.com",
  "m.silva@rolls-royce.com",
  "j.okafor@rolls-royce.com",
  "l.bergstrom@rolls-royce.com",
];

const DAY_MS = 86_400_000;

function daysBetween(from: Date, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - from.getTime()) / DAY_MS);
}

const utilisationCache = new Map<string, { hoursPerDay: number; cyclesPerDay: number }>();

/**
 * Average daily flight hours and cycles for an engine, measured from the
 * generated flight history of the aircraft it is installed on. Off-wing engines
 * accrue nothing, so utilisation-driven limits do not run for them.
 */
export function engineUtilisation(engineId: string): { hoursPerDay: number; cyclesPerDay: number } {
  const cached = utilisationCache.get(engineId);
  if (cached) return cached;
  const value = computeUtilisation(engineId);
  utilisationCache.set(engineId, value);
  return value;
}

function computeUtilisation(engineId: string): { hoursPerDay: number; cyclesPerDay: number } {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId);
  if (!engine?.aircraftId) return { hoursPerDay: 0, cyclesPerDay: 0 };
  const flights = data.flights.filter((f) => f.aircraftId === engine.aircraftId);
  if (flights.length === 0) return { hoursPerDay: 0, cyclesPerDay: 0 };
  const times = flights.map((f) => new Date(f.departedAt).getTime());
  const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY_MS);
  const hours = flights.reduce((sum, f) => sum + f.blockHours, 0);
  return {
    hoursPerDay: round(hours / spanDays, 2),
    cyclesPerDay: round(flights.length / spanDays, 3),
  };
}

/** Human-readable applicability rule shown on the bulletin detail. */
function applicabilityRule(bulletin: ServiceBulletin, engines: Engine[]): string {
  const rng = createRng(`${bulletin.id}:applicability`);
  const buildStandards = Array.from(new Set(engines.map((e) => e.buildStandard))).sort();
  const cycleGate = rand.int(rng, 2, 14) * 500;
  const variants = [
    `${bulletin.family} engines, all build standards, pre-mod embodiment only`,
    `${bulletin.family} engines with more than ${cycleGate.toLocaleString("en-GB")} cycles since new`,
    `${bulletin.family} engines at build standard ${buildStandards[0] ?? "—"} and earlier`,
    `${bulletin.family} engines, on-wing and shop-visit populations, excluding units already at post-mod standard`,
  ];
  return rand.pick(rng, variants);
}

function evidenceFor(bulletin: ServiceBulletin, engine: Engine, workOrders: WorkOrder[]): ComplianceEvidence {
  const rng = createRng(`${bulletin.id}:${engine.id}:evidence`);
  const data = getDataset();
  const completed = workOrders.filter((w) => w.engineId === engine.id && w.state === "complete");
  const workOrder = completed.length > 0 ? rand.pick(rng, completed) : null;
  const facility = workOrder
    ? data.facilities.find((f) => f.id === workOrder.facilityId)
    : rand.pick(rng, data.facilities);
  const daysAfterIssue = rand.int(rng, 20, 420);
  return {
    certificateRef: `CRS-${bulletin.reference.split("-").slice(-1)[0]}-${engine.esn.replace("ESN-", "")}`,
    embodiedAt: iso(addDays(new Date(bulletin.issuedAt), daysAfterIssue)),
    signatory: rand.pick(rng, SIGNATORIES),
    facilityIcao: facility?.icao ?? "—",
    workOrderReference: workOrder?.reference ?? null,
  };
}

function bundleFor(
  engine: Engine,
  dueAt: string,
  labourHours: number,
  workOrders: WorkOrder[],
): ComplianceBundleOption | null {
  const data = getDataset();
  const candidates = workOrders
    .filter(
      (w) =>
        w.engineId === engine.id &&
        w.state !== "complete" &&
        w.state !== "cancelled" &&
        new Date(w.scheduledStart).getTime() <= new Date(dueAt).getTime(),
    )
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1));
  const workOrder = candidates[0];
  if (!workOrder) return null;
  const facility = data.facilities.find((f) => f.id === workOrder.facilityId);
  return {
    workOrderId: workOrder.id,
    workOrderReference: workOrder.reference,
    facilityIcao: facility?.icao ?? "—",
    scheduledStart: workOrder.scheduledStart,
    marginDays: daysBetween(new Date(workOrder.scheduledStart), dueAt),
    savingUsd: Math.round(STANDALONE_ACCESS_COST_USD + labourHours * LABOUR_RATE_USD_PER_HOUR * 0.15),
  };
}

function recommendedAction(
  task: Pick<ComplianceTask, "disposition" | "kind" | "mandatory" | "esn" | "daysRemaining" | "drivingLimit">,
  bundle: ComplianceBundleOption | null,
): string {
  if (task.disposition === "embodied") return "Compliant — retain evidence for the next airworthiness review";
  if (task.disposition === "overdue") {
    return task.mandatory
      ? `Ground-stop risk: raise an AOG-priority work order for ${task.esn} and notify the authority`
      : `Raise a recovery work order for ${task.esn} — deadline passed ${Math.abs(task.daysRemaining)} days ago`;
  }
  if (bundle) {
    return `Bundle into ${bundle.workOrderReference} at ${bundle.facilityIcao} — ${bundle.marginDays} days of margin, saves ${Math.round(
      bundle.savingUsd / 1000,
    )}k`;
  }
  if (task.disposition === "due-soon") {
    const driver = task.drivingLimit === "calendar" ? "calendar deadline" : `${task.drivingLimit} limit`;
    return `Book a slot inside ${task.daysRemaining} days — ${driver} governs; no planned downtime to absorb it`;
  }
  return "Monitor — schedule with the next planned input for this engine";
}

function taskStatus(disposition: ComplianceDisposition): StatusLevel {
  if (disposition === "overdue") return "red";
  if (disposition === "due-soon") return "amber";
  if (disposition === "embodied") return "green";
  if (disposition === "planned") return "green";
  return "grey";
}

const taskCache = new Map<number, ComplianceTask[]>();

/** Every engine-level obligation across the fleet, nearest deadline first. */
export function complianceTasks(horizonDays = COMPLIANCE_HORIZON_DAYS): ComplianceTask[] {
  const cached = taskCache.get(horizonDays);
  if (cached) return cached;
  const computed = computeComplianceTasks(horizonDays);
  taskCache.set(horizonDays, computed);
  return computed;
}

function computeComplianceTasks(horizonDays: number): ComplianceTask[] {
  const data = getDataset();
  const out: ComplianceTask[] = [];

  for (const bulletin of data.serviceBulletins) {
    const embodiedSet = new Set(bulletin.embodiedEngineIds);
    const rngKit = createRng(`${bulletin.id}:limits`);
    // Only some bulletins impose utilisation limits on top of the calendar date.
    const imposesHours = rand.bool(rngKit, 0.45);
    const imposesCycles = rand.bool(rngKit, 0.55);
    const hoursAllowance = rand.int(rngKit, 600, 4200);
    const cyclesAllowance = rand.int(rngKit, 150, 1400);
    const kitCostUsd = rand.int(rngKit, 4_000, 240_000);

    for (const engineId of bulletin.affectedEngineIds) {
      const engine = data.engines.find((e) => e.id === engineId);
      if (!engine) continue;
      const operator = data.operators.find((o) => o.id === engine.operatorId);
      const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
      const embodied = embodiedSet.has(engineId);
      const utilisation = engineUtilisation(engineId);

      const calendarDaysRemaining = daysBetween(NOW, bulletin.complianceDueAt);
      const hoursLimit = imposesHours ? hoursAllowance : null;
      const cyclesLimit = imposesCycles ? cyclesAllowance : null;
      const hoursRemaining = hoursLimit === null ? null : round(hoursLimit - (engine.hoursSinceOverhaul % hoursLimit), 0);
      const cyclesRemaining = cyclesLimit === null ? null : Math.round(cyclesLimit - (engine.cyclesSinceOverhaul % cyclesLimit));

      const drivers: { driver: ComplianceLimitDriver; days: number }[] = [
        { driver: "calendar", days: calendarDaysRemaining },
      ];
      if (hoursRemaining !== null && utilisation.hoursPerDay > 0) {
        drivers.push({ driver: "hours", days: Math.round(hoursRemaining / utilisation.hoursPerDay) });
      }
      if (cyclesRemaining !== null && utilisation.cyclesPerDay > 0) {
        drivers.push({ driver: "cycles", days: Math.round(cyclesRemaining / utilisation.cyclesPerDay) });
      }
      drivers.sort((a, b) => a.days - b.days);
      const governing = drivers[0]!;

      const labourHours = round(bulletin.estimatedHoursPerEngine * (engine.lifeStage === "in-shop" ? 0.8 : 1), 1);
      const costUsd = Math.round(labourHours * LABOUR_RATE_USD_PER_HOUR + kitCostUsd);

      const dueAt =
        governing.driver === "calendar"
          ? bulletin.complianceDueAt
          : iso(addDays(NOW, governing.days));

      const bundle = embodied ? null : bundleFor(engine, dueAt, labourHours, data.workOrders);

      let disposition: ComplianceDisposition;
      if (embodied) disposition = "embodied";
      else if (governing.days < 0) disposition = "overdue";
      else if (governing.days <= horizonDays) disposition = bundle && bundle.marginDays >= 0 ? "planned" : "due-soon";
      else disposition = "planned";

      const base = {
        id: `${bulletin.id}:${engine.id}`,
        bulletinId: bulletin.id,
        reference: bulletin.reference,
        kind: bulletin.kind,
        title: bulletin.title,
        mandatory: bulletin.mandatory,
        engineId: engine.id,
        esn: engine.esn,
        family: engine.family,
        operatorId: engine.operatorId,
        operatorCode: operator?.code ?? "—",
        operatorName: operator?.name ?? "Unknown operator",
        aircraftTail: aircraft?.tail ?? null,
        onWing: engine.aircraftId !== null,
        embodied,
        evidence: embodied ? evidenceFor(bulletin, engine, data.workOrders) : null,
        dueAt,
        calendarDueAt: bulletin.complianceDueAt,
        calendarDaysRemaining,
        hoursLimit,
        cyclesLimit,
        hoursRemaining,
        cyclesRemaining,
        daysRemaining: governing.days,
        drivingLimit: governing.driver,
        disposition,
        status: taskStatus(disposition),
        labourHours,
        costUsd,
        bundle,
      };

      out.push({ ...base, recommendedAction: recommendedAction(base, bundle) });
    }
  }

  return out.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/** Outstanding, past-deadline obligations — the immediate-action register. */
export function complianceOverdueRegister(limit = 12): ComplianceTask[] {
  return complianceTasks()
    .filter((t) => t.disposition === "overdue")
    .sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.daysRemaining - b.daysRemaining)
    .slice(0, limit);
}

/** Bulletin-level roll-up used by the SB/AD directory. */
export function complianceBulletins(horizonDays = COMPLIANCE_HORIZON_DAYS): ComplianceBulletin[] {
  const data = getDataset();
  const tasks = complianceTasks(horizonDays);

  return data.serviceBulletins
    .map((bulletin) => {
      const own = tasks.filter((t) => t.bulletinId === bulletin.id);
      const outstanding = own.filter((t) => !t.embodied);
      const overdue = outstanding.filter((t) => t.disposition === "overdue");
      const dueSoon = outstanding.filter((t) => t.disposition === "due-soon");
      const bundleable = outstanding.filter((t) => t.bundle !== null);
      const embodied = own.length - outstanding.length;
      const compliancePct = own.length === 0 ? 100 : round((embodied / own.length) * 100, 1);
      const engines = data.engines.filter((e) => bulletin.affectedEngineIds.includes(e.id));
      const nextDue = [...outstanding].sort((a, b) => a.daysRemaining - b.daysRemaining)[0] ?? null;

      const status: StatusLevel =
        overdue.length > 0 ? "red" : dueSoon.length > 0 ? "amber" : outstanding.length > 0 ? "green" : "green";

      const action =
        overdue.length > 0
          ? `${overdue.length} engine${overdue.length === 1 ? "" : "s"} past deadline — raise recovery work orders now`
          : dueSoon.length > 0
            ? bundleable.length > 0
              ? `Bundle ${bundleable.length} of ${dueSoon.length} due engines into planned shop visits`
              : `Book slots for ${dueSoon.length} engine${dueSoon.length === 1 ? "" : "s"} inside the ${horizonDays}-day horizon`
            : outstanding.length > 0
              ? "On track — embody with the next planned input"
              : "Fleet campaign complete — evidence filed";

      return {
        id: bulletin.id,
        reference: bulletin.reference,
        kind: bulletin.kind,
        title: bulletin.title,
        family: bulletin.family,
        mandatory: bulletin.mandatory,
        issuedAt: bulletin.issuedAt,
        dueAt: bulletin.complianceDueAt,
        applicabilityRule: applicabilityRule(bulletin, engines),
        applicable: own.length,
        embodied,
        outstanding: outstanding.length,
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        bundleable: bundleable.length,
        compliancePct,
        status,
        labourHoursPerEngine: bulletin.estimatedHoursPerEngine,
        outstandingLabourHours: round(
          outstanding.reduce((sum, t) => sum + t.labourHours, 0),
          0,
        ),
        outstandingCostUsd: outstanding.reduce((sum, t) => sum + t.costUsd, 0),
        nextDueAt: nextDue?.dueAt ?? null,
        recommendedAction: action,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || a.compliancePct - b.compliancePct);
}

/** Fleet KPI roll-up for the compliance header. */
export function complianceSummary(horizonDays = COMPLIANCE_HORIZON_DAYS): ComplianceSummary {
  const data = getDataset();
  const tasks = complianceTasks(horizonDays);
  const outstanding = tasks.filter((t) => !t.embodied);
  const overdue = outstanding.filter((t) => t.disposition === "overdue");
  const dueSoon = outstanding.filter((t) => t.disposition === "due-soon");
  const bundleable = outstanding.filter((t) => t.bundle !== null);
  const mandatory = tasks.filter((t) => t.mandatory);
  const mandatoryEmbodied = mandatory.filter((t) => t.embodied).length;
  const embodied = tasks.length - outstanding.length;

  const bucketDefs: { id: string; label: string; from: number; to: number; status: StatusLevel }[] = [
    { id: "overdue", label: "Overdue", from: Number.NEGATIVE_INFINITY, to: -1, status: "red" },
    { id: "d30", label: "0-30 days", from: 0, to: 30, status: "amber" },
    { id: "d90", label: "31-90 days", from: 31, to: 90, status: "amber" },
    { id: "d180", label: "91-180 days", from: 91, to: 180, status: "green" },
    { id: "beyond", label: "180+ days", from: 181, to: Number.POSITIVE_INFINITY, status: "green" },
  ];

  const horizon: ComplianceHorizonBucket[] = bucketDefs.map((bucket) => {
    const inBucket = outstanding.filter((t) => t.daysRemaining >= bucket.from && t.daysRemaining <= bucket.to);
    return {
      id: bucket.id,
      label: bucket.label,
      tasks: inBucket.length,
      labourHours: round(
        inBucket.reduce((sum, t) => sum + t.labourHours, 0),
        0,
      ),
      status: bucket.status,
    };
  });

  return {
    horizonDays,
    bulletins: data.serviceBulletins.length,
    mandatoryBulletins: data.serviceBulletins.filter((b) => b.mandatory).length,
    applicableTasks: tasks.length,
    embodiedTasks: embodied,
    outstandingTasks: outstanding.length,
    overdueTasks: overdue.length,
    dueSoonTasks: dueSoon.length,
    bundleableTasks: bundleable.length,
    compliancePct: tasks.length === 0 ? 100 : round((embodied / tasks.length) * 100, 1),
    mandatoryCompliancePct: mandatory.length === 0 ? 100 : round((mandatoryEmbodied / mandatory.length) * 100, 1),
    enginesAffected: new Set(tasks.map((t) => t.engineId)).size,
    enginesOverdue: new Set(overdue.map((t) => t.engineId)).size,
    outstandingLabourHours: round(
      outstanding.reduce((sum, t) => sum + t.labourHours, 0),
      0,
    ),
    outstandingCostUsd: outstanding.reduce((sum, t) => sum + t.costUsd, 0),
    bundleSavingUsd: bundleable.reduce((sum, t) => sum + (t.bundle?.savingUsd ?? 0), 0),
    horizon,
  };
}

/** Operator-level compliance rate, worst first. */
export function complianceByOperator(horizonDays = COMPLIANCE_HORIZON_DAYS): ComplianceOperatorRollup[] {
  const data = getDataset();
  const tasks = complianceTasks(horizonDays);

  return data.operators
    .map((operator) => {
      const own = tasks.filter((t) => t.operatorId === operator.id);
      const outstanding = own.filter((t) => !t.embodied);
      const overdue = outstanding.filter((t) => t.disposition === "overdue").length;
      const dueSoon = outstanding.filter((t) => t.disposition === "due-soon").length;
      const embodied = own.length - outstanding.length;
      const compliancePct = own.length === 0 ? 100 : round((embodied / own.length) * 100, 1);
      return {
        operatorId: operator.id,
        operatorCode: operator.code,
        operatorName: operator.name,
        engines: data.engines.filter((e) => e.operatorId === operator.id).length,
        applicable: own.length,
        embodied,
        overdue,
        dueSoon,
        compliancePct,
        status: (overdue > 0 ? "red" : dueSoon > 0 ? "amber" : own.length === 0 ? "grey" : "green") as StatusLevel,
        exposureUsd: outstanding.reduce((sum, t) => sum + t.costUsd, 0),
      };
    })
    .filter((row) => row.applicable > 0)
    .sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || a.compliancePct - b.compliancePct);
}

/**
 * Engine x bulletin matrix. Engines with the worst exposure come first so the
 * top-left of the grid is always the part of the fleet needing action.
 */
export function complianceMatrix(engineLimit = 24, horizonDays = COMPLIANCE_HORIZON_DAYS): ComplianceMatrix {
  const data = getDataset();
  const tasks = complianceTasks(horizonDays);
  const bulletins = data.serviceBulletins;
  const byEngine = new Map<string, ComplianceTask[]>();
  for (const task of tasks) {
    const list = byEngine.get(task.engineId);
    if (list) list.push(task);
    else byEngine.set(task.engineId, [task]);
  }

  const rows: ComplianceMatrixRow[] = [];
  for (const [engineId, engineTasks] of byEngine) {
    const engine = data.engines.find((e) => e.id === engineId);
    if (!engine) continue;
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
    const outstanding = engineTasks.filter((t) => !t.embodied);
    const overdue = outstanding.filter((t) => t.disposition === "overdue").length;
    const dueSoon = outstanding.filter((t) => t.disposition === "due-soon").length;
    const embodied = engineTasks.length - outstanding.length;

    const cells: ComplianceMatrixCell[] = bulletins.map((bulletin) => {
      const task = engineTasks.find((t) => t.bulletinId === bulletin.id);
      if (!task) {
        return { bulletinId: bulletin.id, taskId: null, status: "grey", disposition: "not-applicable", daysRemaining: null };
      }
      return {
        bulletinId: bulletin.id,
        taskId: task.id,
        status: task.status,
        disposition: task.disposition,
        daysRemaining: task.daysRemaining,
      };
    });

    rows.push({
      engineId,
      esn: engine.esn,
      family: engine.family,
      operatorCode: operator?.code ?? "—",
      aircraftTail: aircraft?.tail ?? null,
      overdue,
      dueSoon,
      outstanding: outstanding.length,
      compliancePct: engineTasks.length === 0 ? 100 : round((embodied / engineTasks.length) * 100, 1),
      status: overdue > 0 ? "red" : dueSoon > 0 ? "amber" : "green",
      cells,
    });
  }

  rows.sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || a.compliancePct - b.compliancePct);

  return {
    bulletins: bulletins.map((b) => ({
      id: b.id,
      reference: b.reference,
      kind: b.kind,
      mandatory: b.mandatory,
      status: b.status,
    })),
    rows: rows.slice(0, engineLimit),
  };
}
