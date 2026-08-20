/**
 * Audit trail selectors.
 *
 * The audit ledger is *derived*, never hand-written: every record is projected
 * from a real entity in the generated dataset (an alert disposition, a work
 * order state change, a task card sign-off, a configuration change) so the
 * trail always reconciles with the fleet it describes. Records are then
 * hash-chained in chronological order, which is what makes the trail
 * tamper-evident: recomputing a record's hash also invalidates every hash
 * after it.
 */

import type {
  Alert,
  AuditActor,
  AuditActorKind,
  AuditActorSummary,
  AuditAttentionItem,
  AuditCategory,
  AuditDayGroup,
  AuditEntityTimeline,
  AuditEntityType,
  AuditEvidence,
  AuditFieldChange,
  AuditIntegrity,
  AuditRecord,
  AuditTrailSummary,
  Severity,
  StatusLevel,
  TaskCard,
  Technician,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { addHours, createRng, hashString, iso, NOW, rand, type Rng } from "../rng";

/* ------------------------------------------------------------------ */
/* Actors                                                              */
/* ------------------------------------------------------------------ */

const ACTOR_SEEDS: { handle: string; name: string; kind: AuditActorKind; role: string; organisation: string }[] = [
  { handle: "a.hughes@rolls-royce.com", name: "Alison Hughes", kind: "controller", role: "Duty fleet controller", organisation: "Rolls-Royce Fleet Services" },
  { handle: "r.patel@rolls-royce.com", name: "Rohan Patel", kind: "engineer", role: "Engine health engineer", organisation: "Rolls-Royce Fleet Services" },
  { handle: "m.silva@rolls-royce.com", name: "Mariana Silva", kind: "planner", role: "Shop visit planner", organisation: "Rolls-Royce Services" },
  { handle: "k.osei@rolls-royce.com", name: "Kwame Osei", kind: "quality", role: "Quality & airworthiness", organisation: "Rolls-Royce Services" },
  { handle: "j.lindqvist@rolls-royce.com", name: "Johan Lindqvist", kind: "engineer", role: "Lead certifying engineer", organisation: "Rolls-Royce Services" },
  { handle: "s.tanaka@rolls-royce.com", name: "Sora Tanaka", kind: "controller", role: "AOG desk controller", organisation: "Rolls-Royce Fleet Services" },
  { handle: "operations@operator", name: "Operator maintenance control", kind: "operator", role: "Customer MCC", organisation: "Operator" },
  { handle: "ehm-service", name: "EHM ingest service", kind: "system", role: "Automated pipeline", organisation: "Rolls-Royce Platform" },
  { handle: "prognostics-pipeline", name: "Prognostics pipeline", kind: "system", role: "Model runtime", organisation: "Rolls-Royce Platform" },
];

const ACTORS: AuditActor[] = ACTOR_SEEDS.map((seed, index) => ({
  id: `ACT-${String(index + 1).padStart(3, "0")}`,
  ...seed,
}));

const HUMAN_ACTORS = ACTORS.filter((a) => a.kind !== "system");
const QUALITY_ACTORS = ACTORS.filter((a) => a.kind === "quality" || a.role.includes("certifying"));

function actorByHandle(handle: string): AuditActor {
  return ACTORS.find((a) => a.handle === handle) ?? ACTORS[0]!;
}

function actorFor(rng: Rng, kinds: AuditActorKind[]): AuditActor {
  const pool = ACTORS.filter((a) => kinds.includes(a.kind));
  return rand.pick(rng, pool.length > 0 ? pool : HUMAN_ACTORS);
}

/* ------------------------------------------------------------------ */
/* Record assembly                                                     */
/* ------------------------------------------------------------------ */

const RETENTION_YEARS = 10;
/** Actions left uncountersigned beyond this are an evidential gap, not a queue. */
const COUNTERSIGN_SLA_HOURS = 48;

type DraftRecord = Omit<AuditRecord, "sequence" | "hash" | "previousHash" | "status">;

function hoursBetween(from: string, to: string): number {
  return Math.round(((new Date(to).getTime() - new Date(from).getTime()) / 3600000) * 10) / 10;
}

function ageHours(at: string): number {
  return Math.max(0, Math.round(hoursBetween(at, iso(NOW)) * 10) / 10);
}

function change(field: string, before: string | null, after: string | null): AuditFieldChange {
  return { field, before, after };
}

function statusFor(record: DraftRecord): StatusLevel {
  if (record.actor.kind === "system" && !record.override) return "grey";
  const overdue = ageHours(record.at) > COUNTERSIGN_SLA_HOURS;
  if (record.requiresCountersignature && !record.countersignedBy) return overdue ? "red" : "amber";
  if (record.override && record.evidence.length === 0) return "red";
  if (record.override) return "amber";
  return "green";
}

/** FNV-1a over the canonical form, chained onto the previous record's hash. */
function chainHash(record: DraftRecord, previousHash: string): string {
  const canonical = [
    previousHash,
    record.id,
    record.at,
    record.actor.handle,
    record.action,
    record.entityType,
    record.entityId,
    record.detail,
    record.changes.map((c) => `${c.field}:${c.before ?? "-"}>${c.after ?? "-"}`).join("|"),
    record.evidence.map((e) => e.reference).join("|"),
    String(record.override),
    record.countersignedBy ?? "-",
  ].join("\u0001");
  const high = hashString(canonical);
  const low = hashString(`${canonical}\u0002${high}`);
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Projections                                                         */
/* ------------------------------------------------------------------ */

interface Ctx {
  esn: (engineId: string) => string | undefined;
  operatorCode: (operatorId: string) => string | undefined;
}

function alertRecords(rng: Rng, alerts: Alert[], ctx: Ctx): DraftRecord[] {
  const out: DraftRecord[] = [];
  const dispositions: Partial<Record<Alert["state"], { action: string; after: string; override: number }>> = {
    triaged: { action: "alert.triaged", after: "triaged", override: 0.12 },
    investigating: { action: "alert.investigation-opened", after: "investigating", override: 0.1 },
    actioned: { action: "alert.actioned", after: "actioned", override: 0.18 },
    closed: { action: "alert.closed", after: "closed", override: 0.14 },
    "false-positive": { action: "alert.dismissed-false-positive", after: "false-positive", override: 0.55 },
  };

  for (const alert of alerts) {
    const evidence: AuditEvidence[] = [
      { kind: "telemetry", reference: `${alert.engineId}/${alert.parameter ?? "egtMargin"}`, label: `${alert.source} trace at raise time` },
    ];
    if (alert.confidence !== undefined) {
      evidence.push({ kind: "prognostic", reference: alert.id, label: `Model confidence ${(alert.confidence * 100).toFixed(0)}%` });
    }

    out.push({
      id: `AR-${alert.id}-RAISED`,
      at: alert.raisedAt,
      actor: alert.source === "pilot-report" ? actorByHandle("operations@operator") : actorByHandle("ehm-service"),
      action: "alert.raised",
      category: "alert-disposition",
      entityType: "Alert",
      entityId: alert.id,
      entityLabel: alert.title,
      engineId: alert.engineId,
      esn: ctx.esn(alert.engineId),
      operatorId: alert.operatorId,
      operatorCode: ctx.operatorCode(alert.operatorId),
      detail: `${alert.severity} ${alert.source} alert raised on ${ctx.esn(alert.engineId) ?? alert.engineId}: ${alert.description}`,
      changes: [change("state", null, "new"), change("severity", null, alert.severity)],
      evidence,
      override: false,
      requiresCountersignature: false,
      severity: alert.severity,
    });

    const disposition = dispositions[alert.state];
    if (!disposition) continue;

    const actor = actorFor(rng, ["engineer", "controller"]);
    const at = iso(addHours(new Date(alert.raisedAt), rand.float(rng, 1, 72, 1)));
    if (new Date(at) > NOW) continue;
    const override = rand.bool(rng, disposition.override);
    const escalated = alert.severity === "critical" || alert.severity === "high";

    out.push({
      id: `AR-${alert.id}-DISP`,
      at,
      actor,
      action: disposition.action,
      category: "alert-disposition",
      entityType: "Alert",
      entityId: alert.id,
      entityLabel: alert.title,
      engineId: alert.engineId,
      esn: ctx.esn(alert.engineId),
      operatorId: alert.operatorId,
      operatorCode: ctx.operatorCode(alert.operatorId),
      detail: override
        ? `Recommended action "${alert.recommendedAction}" not followed; disposition set to ${disposition.after}`
        : `Disposition set to ${disposition.after} against recommended action "${alert.recommendedAction}"`,
      changes: [
        change("state", "new", disposition.after),
        ...(override ? [change("recommendedAction", alert.recommendedAction, "deferred to next scheduled event")] : []),
        ...(alert.assignee ? [change("assignee", null, alert.assignee)] : []),
      ],
      evidence: override && rand.bool(rng, 0.35) ? [] : evidence,
      override,
      overrideReason: override
        ? rand.pick(rng, [
            "Parameter shift attributable to sensor drift confirmed on ground run",
            "Trend within operator-agreed concession, review at next A-check",
            "Duplicate of an existing open alert on the same module",
            "Aircraft repositioning; action deferred to arrival station",
          ])
        : undefined,
      requiresCountersignature: override && escalated,
      ...countersignature(rng, at, override && escalated),
      severity: alert.severity,
    });
  }
  return out;
}

function countersignature(rng: Rng, at: string, required: boolean): { countersignedBy?: string; countersignedAt?: string } {
  if (!required || rand.bool(rng, 0.35)) return {};
  const at2 = iso(addHours(new Date(at), rand.float(rng, 0.5, 30, 1)));
  if (new Date(at2) > NOW) return {};
  return { countersignedBy: rand.pick(rng, QUALITY_ACTORS).handle, countersignedAt: at2 };
}

const WORK_ORDER_FLOW: { state: WorkOrder["state"]; action: string }[] = [
  { state: "draft", action: "work-order.raised" },
  { state: "planned", action: "work-order.planned" },
  { state: "released", action: "work-order.released" },
  { state: "in-progress", action: "work-order.started" },
  { state: "awaiting-parts", action: "work-order.suspended-awaiting-parts" },
  { state: "complete", action: "work-order.closed" },
];

function workOrderRecords(rng: Rng, workOrders: WorkOrder[], ctx: Ctx): DraftRecord[] {
  const out: DraftRecord[] = [];
  for (const wo of workOrders) {
    if (wo.state === "cancelled") {
      out.push({
        id: `AR-${wo.id}-CANCEL`,
        at: iso(addHours(new Date(wo.raisedAt), rand.float(rng, 6, 120, 1))),
        actor: actorFor(rng, ["planner", "controller"]),
        action: "work-order.cancelled",
        category: "work-order",
        entityType: "WorkOrder",
        entityId: wo.id,
        entityLabel: wo.reference,
        engineId: wo.engineId,
        esn: ctx.esn(wo.engineId),
        operatorId: wo.operatorId,
        operatorCode: ctx.operatorCode(wo.operatorId),
        detail: `${wo.reference} cancelled before release; scope folded into the next scheduled event`,
        changes: [change("state", "planned", "cancelled")],
        evidence: [{ kind: "document", reference: wo.reference, label: "Planning note" }],
        override: false,
        requiresCountersignature: false,
        severity: wo.priority,
      });
      continue;
    }

    const target = WORK_ORDER_FLOW.findIndex((s) => s.state === wo.state);
    const steps = WORK_ORDER_FLOW.slice(0, target < 0 ? 1 : target + 1);
    let cursor = new Date(wo.raisedAt);
    let previousState: string | null = null;

    steps.forEach((step, index) => {
      cursor = addHours(cursor, index === 0 ? 0 : rand.float(rng, 4, 96, 1));
      if (cursor > NOW) return;
      const at = iso(cursor);
      const isRelease = step.state === "released";
      const override = isRelease && rand.bool(rng, 0.12);
      out.push({
        id: `AR-${wo.id}-${step.state.toUpperCase()}`,
        at,
        actor: step.state === "draft" ? actorFor(rng, ["engineer", "controller"]) : actorFor(rng, ["planner", "controller", "engineer"]),
        action: step.action,
        category: "work-order",
        entityType: "WorkOrder",
        entityId: wo.id,
        entityLabel: wo.reference,
        engineId: wo.engineId,
        esn: ctx.esn(wo.engineId),
        operatorId: wo.operatorId,
        operatorCode: ctx.operatorCode(wo.operatorId),
        detail:
          step.state === "draft"
            ? `${wo.type.replace(/-/g, " ")} raised for ${ctx.esn(wo.engineId) ?? wo.engineId} with ${wo.tatDays}-day TAT`
            : override
              ? `${wo.reference} released ahead of the planned slot to protect operator availability`
              : `${wo.reference} moved to ${step.state.replace(/-/g, " ")}`,
        changes: [
          change("state", previousState, step.state),
          ...(step.state === "planned" ? [change("scheduledStart", null, wo.scheduledStart), change("facilityId", null, wo.facilityId)] : []),
          ...(step.state === "complete" && wo.actualCostUsd !== undefined
            ? [change("actualCostUsd", `$${Math.round(wo.estimatedCostUsd).toLocaleString("en-GB")}`, `$${Math.round(wo.actualCostUsd).toLocaleString("en-GB")}`)]
            : []),
        ],
        evidence: [
          { kind: "document", reference: wo.reference, label: "Work order package" },
          ...(wo.triggeringAlertIds.length > 0
            ? [{ kind: "telemetry" as const, reference: wo.triggeringAlertIds[0]!, label: `Triggering alert ${wo.triggeringAlertIds[0]}` }]
            : []),
        ],
        override,
        overrideReason: override ? "Slot brought forward at operator request; capacity re-sequenced" : undefined,
        requiresCountersignature: step.state === "complete" || override,
        ...countersignature(rng, at, step.state === "complete" || override),
        severity: wo.priority,
      });
      previousState = step.state;
    });
  }
  return out;
}

/** Certifying technicians act in the ledger under their own licence, not a shared account. */
function technicianActor(technician: Technician, facilityName: string): AuditActor {
  const [first = "", last = ""] = technician.name.split(" ");
  return {
    id: technician.id,
    name: technician.name,
    handle: `${first.charAt(0)}.${last}@rolls-royce.com`.toLowerCase(),
    kind: "engineer",
    role: `Certifying technician · ${technician.licences[0] ?? "B1"}`,
    organisation: facilityName,
  };
}

function taskCardRecords(rng: Rng, taskCards: TaskCard[], workOrders: WorkOrder[], ctx: Ctx): DraftRecord[] {
  const data = getDataset();
  const out: DraftRecord[] = [];
  const byId = new Map(workOrders.map((w) => [w.id, w] as const));
  for (const card of taskCards) {
    if (card.state !== "signed-off") continue;
    const wo = byId.get(card.workOrderId);
    const facilityTechs = data.technicians.filter((t) => t.facilityId === wo?.facilityId);
    const technician = rand.pick(rng, facilityTechs.length > 0 ? facilityTechs : data.technicians);
    const facility = data.facilities.find((f) => f.id === technician.facilityId);
    const actor = technicianActor(technician, facility ? `${facility.name} (${facility.icao})` : "Rolls-Royce Services");
    const started = wo?.actualStart ?? wo?.scheduledStart ?? wo?.raisedAt ?? iso(NOW);
    const startedAt = new Date(started) > NOW ? new Date(wo?.raisedAt ?? iso(NOW)) : new Date(started);
    const proposed = addHours(startedAt, rand.float(rng, 2, 200, 1));
    // Sign-offs cannot be recorded in the future; fall back into the recent past.
    const signOffAt = iso(proposed > NOW ? addHours(NOW, -rand.float(rng, 1, 96, 1)) : proposed);
    const actualHours = Math.round((card.estimatedHours * rand.float(rng, 0.7, 1.45, 3)) * 10) / 10;
    const hoursOver = actualHours - card.estimatedHours;
    out.push({
      id: `AR-${card.id}-SIGNOFF`,
      at: signOffAt,
      actor,
      action: "task-card.signed-off",
      category: "sign-off",
      entityType: "TaskCard",
      entityId: card.id,
      entityLabel: `${card.reference} · ${card.title}`,
      engineId: wo?.engineId,
      esn: wo ? ctx.esn(wo.engineId) : undefined,
      operatorId: wo?.operatorId,
      operatorCode: wo ? ctx.operatorCode(wo.operatorId) : undefined,
      detail: `${card.title} certified complete under ATA ${card.ataChapter}${hoursOver > 1 ? `, ${hoursOver.toFixed(1)}h over estimate` : ""}`,
      changes: [change("state", "in-progress", "signed-off"), change("actualHours", card.estimatedHours.toFixed(1), actualHours.toFixed(1))],
      evidence: [
        { kind: "inspection", reference: card.reference, label: `${card.skillRequired} certification` },
        ...(card.moduleCode ? [{ kind: "borescope" as const, reference: `${wo?.engineId ?? card.workOrderId}/${card.moduleCode}`, label: `${card.moduleCode} inspection media` }] : []),
      ],
      override: false,
      requiresCountersignature: card.moduleCode === "HPT" || card.moduleCode === "COMBUSTOR",
      ...countersignature(rng, signOffAt, card.moduleCode === "HPT" || card.moduleCode === "COMBUSTOR"),
      severity: "medium",
    });
  }
  return out;
}

function configurationRecords(rng: Rng, ctx: Ctx): DraftRecord[] {
  const data = getDataset();
  const out: DraftRecord[] = [];

  const models = [...new Set(data.prognostics.map((p) => p.modelVersion))].sort();
  models.forEach((version, index) => {
    const at = iso(addHours(NOW, -rand.float(rng, 48, 1400, 1) - index));
    out.push({
      // Index keeps ids unique even for versions differing only in punctuation.
      id: `AR-CFG-MODEL-${index + 1}-${version.replace(/[^a-zA-Z0-9]/g, "")}`,
      at,
      actor: actorByHandle("prognostics-pipeline"),
      action: "configuration.model-deployed",
      category: "configuration",
      entityType: "Configuration",
      entityId: `prognostic-model/${version}`,
      entityLabel: `Prognostic model ${version}`,
      detail: `Prognostic model ${version} promoted to production scoring for ${data.prognostics.filter((p) => p.modelVersion === version).length} engine-module pairs`,
      changes: [change("modelVersion", index === 0 ? null : models[index - 1]!, version)],
      evidence: [{ kind: "document", reference: `MODEL-VALIDATION-${version}`, label: "Validation pack" }],
      override: false,
      requiresCountersignature: true,
      ...countersignature(rng, at, true),
      severity: "info",
    });
  });

  const thresholdEngines = rand.sample(rng, data.engines, 6);
  for (const engine of thresholdEngines) {
    const at = iso(addHours(NOW, -rand.float(rng, 6, 900, 1)));
    const before = Math.round(engine.egtMargin + rand.float(rng, 3, 9, 1));
    const after = Math.round(engine.egtMargin);
    out.push({
      id: `AR-CFG-THRESH-${engine.id}`,
      at,
      actor: actorFor(rng, ["engineer"]),
      action: "configuration.alert-threshold-changed",
      category: "configuration",
      entityType: "Configuration",
      entityId: `threshold/${engine.id}/egtMargin`,
      entityLabel: `EGT margin threshold · ${engine.esn}`,
      engineId: engine.id,
      esn: engine.esn,
      operatorId: engine.operatorId,
      operatorCode: ctx.operatorCode(engine.operatorId),
      detail: `Amber EGT margin threshold retuned for ${engine.esn} (${engine.family}) following build-standard review`,
      changes: [change("egtMargin.amber", `${before} °C`, `${after} °C`)],
      evidence: [{ kind: "policy", reference: `EHM-TUNING-${engine.family.replace(/\s+/g, "")}`, label: "Fleet tuning policy" }],
      override: true,
      overrideReason: "Threshold relaxed against the fleet default for this build standard",
      requiresCountersignature: true,
      ...countersignature(rng, at, true),
      severity: "medium",
    });
  }

  const bulletins = rand.sample(rng, data.serviceBulletins, 8);
  for (const sb of bulletins) {
    const at = iso(addHours(NOW, -rand.float(rng, 12, 1000, 1)));
    const embodied = sb.embodiedEngineIds.length;
    out.push({
      id: `AR-${sb.id}-COMPLIANCE`,
      at,
      actor: actorFor(rng, ["quality", "planner"]),
      action: sb.mandatory ? "compliance.ad-embodiment-recorded" : "compliance.sb-embodiment-recorded",
      category: "compliance",
      entityType: "ServiceBulletin",
      entityId: sb.id,
      entityLabel: `${sb.reference} · ${sb.title}`,
      detail: `${sb.reference} embodiment updated to ${embodied}/${sb.affectedEngineIds.length} affected engines, due ${sb.complianceDueAt.slice(0, 10)}`,
      changes: [change("embodiedEngines", String(Math.max(0, embodied - 1)), String(embodied))],
      evidence: [{ kind: "document", reference: sb.reference, label: sb.kind === "AD" ? "Airworthiness directive" : "Service bulletin" }],
      override: false,
      requiresCountersignature: sb.mandatory,
      ...countersignature(rng, at, sb.mandatory),
      severity: sb.mandatory ? "high" : "low",
    });
  }

  const contracts = rand.sample(rng, data.contracts, 5);
  for (const contract of contracts) {
    const at = iso(addHours(NOW, -rand.float(rng, 24, 1200, 1)));
    const operator = data.operators.find((o) => o.id === contract.operatorId);
    out.push({
      id: `AR-${contract.id}-COMMERCIAL`,
      at,
      actor: actorFor(rng, ["controller", "planner"]),
      action: "contract.availability-adjustment-recorded",
      category: "commercial",
      entityType: "Contract",
      entityId: contract.id,
      entityLabel: `${operator?.name ?? contract.operatorId} · ${contract.kind}`,
      operatorId: contract.operatorId,
      operatorCode: operator?.code,
      detail: `Availability position restated to ${contract.availabilityActual.toFixed(1)}% against a ${contract.availabilityTarget.toFixed(1)}% commitment`,
      changes: [
        change("availabilityActual", `${(contract.availabilityActual + 0.4).toFixed(1)}%`, `${contract.availabilityActual.toFixed(1)}%`),
        change("penaltiesUsd", "$0", `$${Math.round(contract.penaltiesUsd).toLocaleString("en-GB")}`),
      ],
      evidence: [{ kind: "document", reference: contract.id, label: "Contract performance statement" }],
      override: contract.penaltiesUsd > 0,
      overrideReason: contract.penaltiesUsd > 0 ? "Liquidated damages accepted rather than disputed" : undefined,
      requiresCountersignature: contract.penaltiesUsd > 0,
      ...countersignature(rng, at, contract.penaltiesUsd > 0),
      severity: contract.status === "red" ? "high" : "medium",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

let cachedTrail: AuditTrailSummary | null = null;

function buildRecords(): AuditRecord[] {
  const data = getDataset();
  const rng = createRng("rr-audit-ledger");
  const esnById = new Map(data.engines.map((e) => [e.id, e.esn] as const));
  const codeById = new Map(data.operators.map((o) => [o.id, o.code] as const));
  const ctx: Ctx = { esn: (id) => esnById.get(id), operatorCode: (id) => codeById.get(id) };

  const drafts = [
    ...alertRecords(rng, data.alerts, ctx),
    ...workOrderRecords(rng, data.workOrders, ctx),
    ...taskCardRecords(rng, data.taskCards, data.workOrders, ctx),
    ...configurationRecords(rng, ctx),
  ]
    .filter((d) => new Date(d.at) <= NOW)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));

  let previousHash = "0".repeat(16);
  return drafts.map((draft, index) => {
    const hash = chainHash(draft, previousHash);
    const record: AuditRecord = {
      ...draft,
      sequence: index + 1,
      status: statusFor(draft),
      previousHash,
      hash,
    };
    previousHash = hash;
    return record;
  });
}

/** Recompute the chain and report any record whose stored hash disagrees. */
export function verifyAuditChain(records: AuditRecord[]): { verified: boolean; brokenAt: string[] } {
  const brokenAt: string[] = [];
  let previousHash = "0".repeat(16);
  for (const record of records) {
    if (record.previousHash !== previousHash || chainHash(record, previousHash) !== record.hash) brokenAt.push(record.id);
    previousHash = record.hash;
  }
  return { verified: brokenAt.length === 0, brokenAt };
}

function integrityOf(records: AuditRecord[]): AuditIntegrity {
  const { verified, brokenAt } = verifyAuditChain(records);
  const first = records[0];
  const last = records[records.length - 1];
  const retentionUntil = new Date(NOW);
  retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + RETENTION_YEARS);
  return {
    totalRecords: records.length,
    firstAt: first?.at ?? iso(NOW),
    lastAt: last?.at ?? iso(NOW),
    headHash: last?.hash ?? "0".repeat(16),
    chainVerified: verified,
    brokenAt,
    retentionYears: RETENTION_YEARS,
    retentionUntil: iso(retentionUntil),
    lastVerifiedAt: iso(addHours(NOW, -1)),
    writeMode: "append-only",
  };
}

function actorSummaries(records: AuditRecord[]): AuditActorSummary[] {
  const byActor = new Map<string, AuditActorSummary>();
  for (const record of records) {
    const existing = byActor.get(record.actor.id);
    const awaiting = record.requiresCountersignature && !record.countersignedBy ? 1 : 0;
    if (existing) {
      existing.records += 1;
      existing.overrides += record.override ? 1 : 0;
      existing.awaitingCountersignature += awaiting;
      if (record.at > existing.lastActiveAt) existing.lastActiveAt = record.at;
    } else {
      byActor.set(record.actor.id, {
        actor: record.actor,
        records: 1,
        overrides: record.override ? 1 : 0,
        awaitingCountersignature: awaiting,
        lastActiveAt: record.at,
      });
    }
  }
  return [...byActor.values()].sort((a, b) => b.records - a.records);
}

/** The evidential gaps a quality lead has to close, worst first. */
export function auditAttention(records: AuditRecord[]): AuditAttentionItem[] {
  return records
    .filter((r) => r.status === "red")
    .map((record) => ({
      record,
      reason:
        record.requiresCountersignature && !record.countersignedBy
          ? `Awaiting countersignature for ${Math.round(ageHours(record.at))}h (SLA ${COUNTERSIGN_SLA_HOURS}h)`
          : "Override recorded with no supporting evidence attached",
      ageHours: ageHours(record.at),
    }))
    .sort((a, b) => b.ageHours - a.ageHours);
}

export function auditTrail(): AuditTrailSummary {
  if (cachedTrail) return cachedTrail;
  const records = buildRecords();
  const now = NOW.getTime();
  const within = (days: number) => (at: string) => now - new Date(at).getTime() <= days * 86400000;

  const countsByCategory = {} as Record<AuditCategory, number>;
  const countsByEntityType = {} as Record<AuditEntityType, number>;
  for (const record of records) {
    countsByCategory[record.category] = (countsByCategory[record.category] ?? 0) + 1;
    countsByEntityType[record.entityType] = (countsByEntityType[record.entityType] ?? 0) + 1;
  }

  const countersignRequired = records.filter((r) => r.requiresCountersignature);
  const decisionRecords = records.filter((r) => r.actor.kind !== "system");
  const dailyCounts = new Map<string, number>();
  for (const record of records.filter((r) => within(30)(r.at))) {
    const day = record.at.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  cachedTrail = {
    records,
    integrity: integrityOf(records),
    actors: actorSummaries(records),
    attention: auditAttention(records),
    countsByCategory,
    countsByEntityType,
    recordsLast7Days: records.filter((r) => within(7)(r.at)).length,
    overridesLast30Days: records.filter((r) => r.override && within(30)(r.at)).length,
    countersignatureCompliancePct:
      countersignRequired.length === 0
        ? 100
        : Math.round((countersignRequired.filter((r) => r.countersignedBy).length / countersignRequired.length) * 1000) / 10,
    evidenceCoveragePct:
      decisionRecords.length === 0
        ? 100
        : Math.round((decisionRecords.filter((r) => r.evidence.length > 0).length / decisionRecords.length) * 1000) / 10,
    dailyVolume: [...dailyCounts.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, count]) => ({ t: `${day}T00:00:00.000Z`, v: count })),
  };
  return cachedTrail;
}

export function auditRecords(): AuditRecord[] {
  return auditTrail().records;
}

/** Newest-first chronological grouping, which is how investigators read a trail. */
export function groupAuditByDay(records: AuditRecord[]): AuditDayGroup[] {
  const byDay = new Map<string, AuditRecord[]>();
  for (const record of [...records].sort((a, b) => (a.at < b.at ? 1 : -1))) {
    const day = record.at.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(record);
    else byDay.set(day, [record]);
  }
  return [...byDay.entries()].map(([date, dayRecords]) => ({
    date,
    records: dayRecords,
    overrides: dayRecords.filter((r) => r.override).length,
    awaitingCountersignature: dayRecords.filter((r) => r.requiresCountersignature && !r.countersignedBy).length,
  }));
}

/** Everything the ledger holds about one engine or work order. */
export function auditEntityTimeline(entityId: string): AuditEntityTimeline | undefined {
  const records = auditRecords().filter((r) => r.entityId === entityId || r.engineId === entityId || r.esn === entityId);
  if (records.length === 0) return undefined;
  const ordered = [...records].sort((a, b) => (a.at < b.at ? -1 : 1));
  const anchor = ordered.find((r) => r.entityId === entityId) ?? ordered[ordered.length - 1]!;
  const engine = getDataset().engines.find((e) => e.id === entityId || e.esn === entityId);
  return {
    entityType: engine ? "Engine" : anchor.entityType,
    entityId: engine?.id ?? entityId,
    entityLabel: engine ? `${engine.esn} · ${engine.family}` : anchor.entityLabel,
    engineId: engine?.id ?? anchor.engineId,
    esn: engine?.esn ?? anchor.esn,
    operatorCode: anchor.operatorCode,
    records: [...ordered].reverse(),
    firstAt: ordered[0]!.at,
    lastAt: ordered[ordered.length - 1]!.at,
    overrides: ordered.filter((r) => r.override).length,
    distinctActors: new Set(ordered.map((r) => r.actor.id)).size,
  };
}

/** Entities with the busiest histories — the useful starting points for a drill-down. */
export function auditEntityIndex(limit = 12): { id: string; label: string; kind: "Engine" | "WorkOrder"; records: number; overrides: number }[] {
  const data = getDataset();
  const records = auditRecords();
  const engines = new Map<string, { records: number; overrides: number }>();
  const workOrders = new Map<string, { records: number; overrides: number }>();

  for (const record of records) {
    if (record.engineId) {
      const bucket = engines.get(record.engineId) ?? { records: 0, overrides: 0 };
      bucket.records += 1;
      bucket.overrides += record.override ? 1 : 0;
      engines.set(record.engineId, bucket);
    }
    if (record.entityType === "WorkOrder") {
      const bucket = workOrders.get(record.entityId) ?? { records: 0, overrides: 0 };
      bucket.records += 1;
      bucket.overrides += record.override ? 1 : 0;
      workOrders.set(record.entityId, bucket);
    }
  }

  const engineRows = [...engines.entries()].map(([id, counts]) => {
    const engine = data.engines.find((e) => e.id === id);
    return { id, label: engine ? `${engine.esn} · ${engine.family}` : id, kind: "Engine" as const, ...counts };
  });
  const woRows = [...workOrders.entries()].map(([id, counts]) => {
    const wo = data.workOrders.find((w) => w.id === id);
    return { id, label: wo ? `${wo.reference} · ${wo.type.replace(/-/g, " ")}` : id, kind: "WorkOrder" as const, ...counts };
  });

  return [...engineRows, ...woRows].sort((a, b) => b.overrides - a.overrides || b.records - a.records).slice(0, limit);
}

export { ACTORS as auditActors, COUNTERSIGN_SLA_HOURS };
