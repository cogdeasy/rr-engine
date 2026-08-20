/**
 * Warranty claims — derived generators and selectors.
 *
 * Claims are derived deterministically from the core dataset: every claim hangs
 * off a real work order for a real engine, and the cover assessed by the
 * eligibility checker is computed from the engine's own hours, cycles and
 * installation date against the warranty terms for its family.
 */

import type {
  Engine,
  ModuleCode,
  Point,
  Series,
  StatusLevel,
  WarrantyAgeingBucket,
  WarrantyClaim,
  WarrantyClaimState,
  WarrantyCoverKind,
  WarrantyCoverageItem,
  WarrantyEligibility,
  WarrantyEventType,
  WarrantyRejectionBreakdown,
  WarrantyRejectionReason,
  WarrantySummary,
  WorkOrder,
} from "@rr/types";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round, type Rng } from "../rng";

/* ------------------------------------------------------------------ */
/* Warranty terms                                                      */
/* ------------------------------------------------------------------ */

/** New-engine warranty terms in force per cover kind. */
const COVER_TERMS: Record<WarrantyCoverKind, { label: string; hours: number; cycles: number; months: number; slaDays: number; recoveryBias: number }> = {
  "new-engine-warranty": { label: "New engine warranty", hours: 20_000, cycles: 6_000, months: 60, slaDays: 45, recoveryBias: 0.86 },
  "parts-warranty": { label: "Parts warranty", hours: 8_000, cycles: 2_500, months: 24, slaDays: 30, recoveryBias: 0.74 },
  campaign: { label: "Campaign cover", hours: 30_000, cycles: 9_000, months: 84, slaDays: 60, recoveryBias: 0.93 },
  "service-bulletin": { label: "Service bulletin cover", hours: 24_000, cycles: 7_500, months: 72, slaDays: 60, recoveryBias: 0.81 },
  totalcare: { label: "TotalCare cover", hours: 40_000, cycles: 12_000, months: 120, slaDays: 30, recoveryBias: 0.95 },
  goodwill: { label: "Goodwill", hours: 60_000, cycles: 18_000, months: 180, slaDays: 90, recoveryBias: 0.42 },
};

export function warrantyCoverLabel(kind: WarrantyCoverKind): string {
  return COVER_TERMS[kind].label;
}

const REJECTION_CATALOG: Record<WarrantyRejectionReason, { label: string; mitigation: string }> = {
  "outside-time-limit": { label: "Outside time limit", mitigation: "Screen cover expiry before raising; escalate near-expiry events." },
  "outside-cycle-limit": { label: "Outside cycle limit", mitigation: "Check cyclic entitlement against LLP records at removal." },
  "operator-induced-damage": { label: "Operator-induced damage", mitigation: "Attach flight data evidence of operating envelope compliance." },
  "foreign-object-damage": { label: "Foreign object damage", mitigation: "Route FOD events to hull insurance, not warranty." },
  "insufficient-evidence": { label: "Insufficient evidence", mitigation: "Complete borescope imagery and strip report before submission." },
  "part-not-covered": { label: "Part not covered", mitigation: "Validate part number against the covered schedule at capture." },
  "unapproved-repair-shop": { label: "Unapproved repair shop", mitigation: "Route work to approved facilities or seek prior concession." },
  "duplicate-claim": { label: "Duplicate claim", mitigation: "Deduplicate against open claims for the same work order." },
};

export function warrantyRejectionLabel(reason: WarrantyRejectionReason): string {
  return REJECTION_CATALOG[reason].label;
}

const CLAIM_STATE_LABELS: Record<WarrantyClaimState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  "under-review": "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

export function warrantyStateLabel(state: WarrantyClaimState): string {
  return CLAIM_STATE_LABELS[state];
}

const EVENT_LABELS: Record<WarrantyEventType, string> = {
  "unscheduled-removal": "Unscheduled removal",
  "shop-finding": "Shop finding",
  "on-wing-repair": "On-wing repair",
  "component-failure": "Component failure",
  "campaign-embodiment": "Campaign embodiment",
};

export function warrantyEventLabel(event: WarrantyEventType): string {
  return EVENT_LABELS[event];
}

const HANDLERS = [
  "a.hughes@rolls-royce.com",
  "r.patel@rolls-royce.com",
  "m.silva@rolls-royce.com",
  "l.fischer@rolls-royce.com",
  "k.okafor@rolls-royce.com",
];

const FINDINGS: Record<string, string[]> = {
  HPT: ["Stage 1 blade tip oxidation beyond limits", "NGV trailing edge burn-through", "Shroud segment distress"],
  HPC: ["Stage 6 blade rub and tip loss", "Variable vane bushing wear", "Compressor drum coating loss"],
  COMBUSTOR: ["Tile liner cracking at dilution ports", "Fuel spray nozzle coking", "Heat shield distortion"],
  IPC: ["Rotor blade leading edge erosion", "Booster stage FOD indication", "Vane ring displacement"],
  IPT: ["Disc rim cracking indication", "Blade shroud interlock wear", "Seal fin rub"],
  LPT: ["Stage 4 blade root fretting", "Case distortion at flange", "Interstage seal degradation"],
  FAN: ["Blade root coating loss", "Annulus filler panel debond", "Track liner wear"],
  GEARBOX: ["Accessory drive bearing spall", "Oil scavenge pump wear", "Idler gear tooth pitting"],
  ACCESSORY: ["Oil debris sensor drift", "Fuel metering unit leak", "Ignition exciter failure"],
  NACELLE: ["Thrust reverser actuator seizure", "Acoustic liner delamination", "Cowl latch corrosion"],
  EXTERNALS: ["Bleed valve harness chafe", "P30 sensor harness open circuit", "Fuel manifold clamp failure"],
};

function findingFor(moduleCode: ModuleCode, rng: Rng): string {
  return rand.pick(rng, FINDINGS[moduleCode] ?? ["Unscheduled component distress"]);
}

function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Claim register                                                      */
/* ------------------------------------------------------------------ */

const CLAIMABLE_TYPES: WorkOrder["type"][] = ["shop-visit", "module-swap", "on-wing-repair", "aog-recovery", "borescope"];

function eventTypeFor(workOrder: WorkOrder, rng: Rng): WarrantyEventType {
  switch (workOrder.type) {
    case "shop-visit":
      return rand.weighted(rng, [
        { value: "shop-finding" as const, weight: 60 },
        { value: "unscheduled-removal" as const, weight: 40 },
      ]);
    case "module-swap":
      return "unscheduled-removal";
    case "on-wing-repair":
      return rand.weighted(rng, [
        { value: "on-wing-repair" as const, weight: 70 },
        { value: "component-failure" as const, weight: 30 },
      ]);
    case "aog-recovery":
      return "component-failure";
    default:
      return "campaign-embodiment";
  }
}

function coverKindFor(engine: Engine, contractKind: string, rng: Rng): WarrantyCoverKind {
  const young = engine.totalFlightHours < 14_000 && engine.totalFlightCycles < 4_500;
  return rand.weighted(rng, [
    { value: "new-engine-warranty" as const, weight: young ? 46 : 8 },
    { value: "parts-warranty" as const, weight: 22 },
    { value: "campaign" as const, weight: 14 },
    { value: "service-bulletin" as const, weight: 12 },
    { value: "totalcare" as const, weight: contractKind.startsWith("TotalCare") ? 28 : 4 },
    { value: "goodwill" as const, weight: 8 },
  ]);
}

function claimStatus(state: WarrantyClaimState, slaBreachDays: number, evidenceComplete: boolean): StatusLevel {
  if (state === "rejected") return "red";
  if (state === "approved") return "green";
  if (slaBreachDays > 0) return "red";
  if (!evidenceComplete || slaBreachDays > -7) return "amber";
  if (state === "draft") return "grey";
  return "amber";
}

function recommendedActionFor(claim: Omit<WarrantyClaim, "recommendedAction">): string {
  if (claim.state === "rejected") {
    return `Appeal with ${REJECTION_CATALOG[claim.rejectionReason ?? "insufficient-evidence"].mitigation.toLowerCase()}`;
  }
  if (claim.state === "approved") return "Raise credit note and close against the work order";
  if (claim.state === "draft" && !claim.evidenceComplete) return "Attach strip report and borescope imagery, then submit";
  if (claim.state === "draft") return "Submit to the warranty desk — evidence pack complete";
  if (claim.slaBreachDays > 0) return `Escalate to the claims manager — ${claim.slaBreachDays}d past SLA`;
  if (!claim.evidenceComplete) return "Chase missing evidence before the assessment window closes";
  return "Awaiting assessment — no action required today";
}

let claimCache: WarrantyClaim[] | null = null;

/** Every warranty claim in the register, newest first. */
export function getWarrantyClaims(): WarrantyClaim[] {
  if (claimCache) return claimCache;
  const data = getDataset();
  const claims: WarrantyClaim[] = [];
  let n = 0;

  for (const workOrder of data.workOrders) {
    if (!CLAIMABLE_TYPES.includes(workOrder.type)) continue;
    const rng = createRng(`warranty:${workOrder.id}`);
    if (!rand.bool(rng, workOrder.type === "shop-visit" ? 0.62 : 0.34)) continue;

    const engine = data.engines.find((e) => e.id === workOrder.engineId);
    if (!engine) continue;
    const operator = data.operators.find((o) => o.id === engine.operatorId);
    const contract = data.contracts.find((c) => c.operatorId === engine.operatorId);
    const contractKind = contract?.kind ?? "Time & Materials";

    n += 1;
    const coverKind = coverKindFor(engine, contractKind, rng);
    const terms = COVER_TERMS[coverKind];
    const eventType = eventTypeFor(workOrder, rng);
    const engineModules = data.engineModules.filter((m) => m.engineId === engine.id);
    const worstModule = [...engineModules].sort((a, b) => b.lifeConsumedPct - a.lifeConsumedPct)[0];
    const moduleCode = worstModule?.code ?? "HPT";
    const part = rand.pick(rng, data.parts.filter((p) => p.moduleCode === moduleCode));

    const raisedAt = new Date(workOrder.raisedAt);
    const ageFromRaise = clamp(daysBetween(raisedAt, NOW), 0, 900);
    const claimedUsd = Math.round(
      clamp(
        (workOrder.actualCostUsd ?? workOrder.estimatedCostUsd) * rand.float(rng, 0.28, 0.86),
        45_000,
        6_800_000,
      ),
    );

    const evidenceComplete = rand.bool(rng, 0.72);
    const state = rand.weighted<WarrantyClaimState>(rng, [
      { value: "draft", weight: ageFromRaise < 25 ? 26 : 6 },
      { value: "submitted", weight: 18 },
      { value: "under-review", weight: 24 },
      { value: "approved", weight: ageFromRaise > 45 ? 62 : 14 },
      // High-value claims are campaign-backed and strip-report evidenced, so they
      // are rarely rejected outright; thin evidence packs are what get thrown out.
      {
        value: "rejected",
        weight: (claimedUsd > 2_000_000 ? 4 : 14) * (evidenceComplete ? 1 : 1.8) * (ageFromRaise > 45 ? 1 : 0.25),
      },
    ]);

    const submittedAt = state === "draft" ? null : iso(addDays(raisedAt, rand.int(rng, 2, 18)));
    const decided = state === "approved" || state === "rejected";
    const settlementDays = rand.int(rng, 12, Math.max(20, terms.slaDays + 55));
    const decidedAt = decided && submittedAt ? iso(addDays(new Date(submittedAt), settlementDays)) : null;

    const rejectionReason: WarrantyRejectionReason | null =
      state === "rejected"
        ? rand.weighted(rng, [
            { value: "outside-time-limit" as const, weight: 16 },
            { value: "outside-cycle-limit" as const, weight: 12 },
            { value: "operator-induced-damage" as const, weight: 18 },
            { value: "foreign-object-damage" as const, weight: 14 },
            { value: "insufficient-evidence" as const, weight: 20 },
            { value: "part-not-covered" as const, weight: 10 },
            { value: "unapproved-repair-shop" as const, weight: 6 },
            { value: "duplicate-claim" as const, weight: 4 },
          ])
        : null;

    const approvedUsd =
      state === "approved"
        ? Math.round(claimedUsd * clamp(terms.recoveryBias + rand.gaussian(rng, 0, 0.09), 0.35, 0.97))
        : 0;

    const referenceDate = decidedAt ? new Date(decidedAt) : NOW;
    const ageDays = clamp(daysBetween(raisedAt, referenceDate), 0, 900);
    const assessmentDays = submittedAt ? daysBetween(new Date(submittedAt), decidedAt ? new Date(decidedAt) : NOW) : 0;
    const slaBreachDays = decided ? 0 : assessmentDays - terms.slaDays;

    const base: Omit<WarrantyClaim, "recommendedAction"> = {
      id: `WC-${String(n).padStart(4, "0")}`,
      reference: `WC-2026-${String(1000 + n)}`,
      engineId: engine.id,
      esn: engine.esn,
      operatorId: engine.operatorId,
      operatorName: operator?.name ?? "Unknown operator",
      contractId: contract?.id ?? "",
      workOrderId: workOrder.id,
      workOrderReference: workOrder.reference,
      eventType,
      coverKind,
      moduleCode,
      partNumber: part?.partNumber ?? `RR-${moduleCode}-00000`,
      summary: findingFor(moduleCode, rng),
      state,
      claimedUsd,
      approvedUsd,
      recoveryRatePct: decided ? round((approvedUsd / claimedUsd) * 100, 1) : null,
      raisedAt: iso(raisedAt),
      submittedAt,
      decidedAt,
      ageDays,
      slaDays: terms.slaDays,
      slaBreachDays,
      rejectionReason,
      evidenceComplete: state === "approved" ? true : evidenceComplete,
      handler: rand.pick(rng, HANDLERS),
      status: claimStatus(state, slaBreachDays, evidenceComplete),
    };

    claims.push({ ...base, recommendedAction: recommendedActionFor(base) });
  }

  claimCache = claims.sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1));
  return claimCache;
}

export function getWarrantyClaim(id: string): WarrantyClaim | undefined {
  return getWarrantyClaims().find((c) => c.id === id || c.reference === id);
}

export function getWarrantyClaimsForEngine(engineId: string): WarrantyClaim[] {
  return getWarrantyClaims().filter((c) => c.engineId === engineId);
}

export function isWarrantyClaimOpen(claim: WarrantyClaim): boolean {
  return claim.state !== "approved" && claim.state !== "rejected";
}

/* ------------------------------------------------------------------ */
/* Roll-ups                                                            */
/* ------------------------------------------------------------------ */

export function warrantySummary(): WarrantySummary {
  const claims = getWarrantyClaims();
  const open = claims.filter(isWarrantyClaimOpen);
  const decided = claims.filter((c) => c.decidedAt !== null);
  const approved = claims.filter((c) => c.state === "approved");
  const rejected = claims.filter((c) => c.state === "rejected");
  const claimedUsd = claims.reduce((s, c) => s + c.claimedUsd, 0);
  const recoveredUsd = approved.reduce((s, c) => s + c.approvedUsd, 0);
  // Recovery rate is measured against settled value only — open claims have not
  // had their chance to recover yet.
  const settledUsd = decided.reduce((s, c) => s + c.claimedUsd, 0);
  const settlementDays = decided.map((c) => daysBetween(c.submittedAt ?? c.raisedAt, c.decidedAt!));

  return {
    claims: claims.length,
    openClaims: open.length,
    claimedUsd,
    recoveredUsd,
    openValueUsd: open.reduce((s, c) => s + c.claimedUsd, 0),
    rejectedValueUsd: rejected.reduce((s, c) => s + c.claimedUsd, 0),
    recoveryRatePct: settledUsd > 0 ? round((recoveredUsd / settledUsd) * 100, 1) : 0,
    averageSettlementDays: settlementDays.length
      ? Math.round(settlementDays.reduce((s, d) => s + d, 0) / settlementDays.length)
      : 0,
    slaBreaches: open.filter((c) => c.slaBreachDays > 0).length,
    evidenceGaps: open.filter((c) => !c.evidenceComplete).length,
    expiringSoon: open.filter((c) => c.state === "draft" && c.ageDays > 20).length,
  };
}

const AGEING_BUCKETS: { id: string; label: string; minDays: number; maxDays: number | null; status: StatusLevel }[] = [
  { id: "0-30", label: "0-30 days", minDays: 0, maxDays: 30, status: "green" },
  { id: "31-60", label: "31-60 days", minDays: 31, maxDays: 60, status: "green" },
  { id: "61-90", label: "61-90 days", minDays: 61, maxDays: 90, status: "amber" },
  { id: "91-180", label: "91-180 days", minDays: 91, maxDays: 180, status: "amber" },
  { id: "180+", label: "180+ days", minDays: 181, maxDays: null, status: "red" },
];

/** Ageing profile of claims that are still open. */
export function warrantyAgeing(): WarrantyAgeingBucket[] {
  const open = getWarrantyClaims().filter(isWarrantyClaimOpen);
  return AGEING_BUCKETS.map((bucket) => {
    const rows = open.filter((c) => c.ageDays >= bucket.minDays && (bucket.maxDays === null || c.ageDays <= bucket.maxDays));
    return {
      id: bucket.id,
      label: bucket.label,
      minDays: bucket.minDays,
      maxDays: bucket.maxDays,
      count: rows.length,
      valueUsd: rows.reduce((s, c) => s + c.claimedUsd, 0),
      status: rows.length === 0 ? "grey" : bucket.status,
    };
  });
}

export function warrantyRejectionBreakdown(): WarrantyRejectionBreakdown[] {
  const rejected = getWarrantyClaims().filter((c) => c.state === "rejected" && c.rejectionReason);
  const total = rejected.length;
  const byReason = new Map<WarrantyRejectionReason, { count: number; valueUsd: number }>();
  for (const claim of rejected) {
    const key = claim.rejectionReason!;
    const entry = byReason.get(key) ?? { count: 0, valueUsd: 0 };
    entry.count += 1;
    entry.valueUsd += claim.claimedUsd;
    byReason.set(key, entry);
  }
  return [...byReason.entries()]
    .map(([reason, entry]) => ({
      reason,
      label: REJECTION_CATALOG[reason].label,
      count: entry.count,
      valueUsd: entry.valueUsd,
      sharePct: total > 0 ? round((entry.count / total) * 100, 1) : 0,
      mitigation: REJECTION_CATALOG[reason].mitigation,
    }))
    .sort((a, b) => b.count - a.count || b.valueUsd - a.valueUsd);
}

/**
 * Recovery rate by month, measured over a rolling 90-day settlement window so a
 * quiet month does not read as a collapse in recovery. Months with no decisions
 * in the window are omitted rather than plotted as zero.
 */
export function warrantyRecoveryTrend(months = 12): Series {
  const decided = getWarrantyClaims().filter((c) => c.state === "approved" || c.state === "rejected");
  const points: Point[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const end = addDays(NOW, -i * 30);
    const start = addDays(end, -90);
    const window = decided.filter((c) => {
      const at = new Date(c.decidedAt!);
      return at > start && at <= end;
    });
    const claimed = window.reduce((s, c) => s + c.claimedUsd, 0);
    if (claimed <= 0) continue;
    const recovered = window.reduce((s, c) => s + c.approvedUsd, 0);
    points.push({ t: iso(end), v: round((recovered / claimed) * 100, 1) });
  }
  return {
    id: "warranty-recovery-rate",
    label: "Recovery rate",
    unit: "%",
    points,
    amberThreshold: 65,
    redThreshold: 45,
  };
}

/** Claimed vs recovered value by operator, worst recovery first. */
export function warrantyByOperator() {
  const claims = getWarrantyClaims();
  const data = getDataset();
  return data.operators
    .map((operator) => {
      const rows = claims.filter((c) => c.operatorId === operator.id);
      const claimedUsd = rows.reduce((s, c) => s + c.claimedUsd, 0);
      const recoveredUsd = rows.reduce((s, c) => s + c.approvedUsd, 0);
      const openValueUsd = rows.filter(isWarrantyClaimOpen).reduce((s, c) => s + c.claimedUsd, 0);
      const recoveryRatePct = claimedUsd > 0 ? round((recoveredUsd / claimedUsd) * 100, 1) : 0;
      return {
        operatorId: operator.id,
        operator: operator.name,
        code: operator.code,
        claims: rows.length,
        openClaims: rows.filter(isWarrantyClaimOpen).length,
        claimedUsd,
        recoveredUsd,
        openValueUsd,
        recoveryRatePct,
        status: (rows.length === 0 ? "grey" : recoveryRatePct < 45 ? "red" : recoveryRatePct < 70 ? "amber" : "green") as StatusLevel,
      };
    })
    .filter((row) => row.claims > 0)
    .sort((a, b) => b.openValueUsd - a.openValueUsd);
}

/* ------------------------------------------------------------------ */
/* Eligibility checker                                                 */
/* ------------------------------------------------------------------ */

const COVERED_MODULES: ModuleCode[] = ["FAN", "IPC", "HPC", "COMBUSTOR", "HPT", "IPT", "LPT", "GEARBOX"];

function coverKindForItem(index: number, engine: Engine, rng: Rng): WarrantyCoverKind {
  if (index === 0) return engine.totalFlightHours < 16_000 ? "new-engine-warranty" : "totalcare";
  return rand.weighted(rng, [
    { value: "new-engine-warranty" as const, weight: engine.totalFlightHours < 16_000 ? 34 : 8 },
    { value: "parts-warranty" as const, weight: 28 },
    { value: "campaign" as const, weight: 16 },
    { value: "service-bulletin" as const, weight: 14 },
    { value: "totalcare" as const, weight: 18 },
  ]);
}

/**
 * Assess, item by item, which components on an engine remain in warranty by
 * hours, cycles and calendar, and what that is worth if the engine comes off
 * wing today.
 */
export function warrantyEligibility(engineId: string): WarrantyEligibility | undefined {
  const data = getDataset();
  const engine = data.engines.find((e) => e.id === engineId || e.esn === engineId);
  if (!engine) return undefined;
  const operator = data.operators.find((o) => o.id === engine.operatorId);
  const contract = data.contracts.find((c) => c.operatorId === engine.operatorId);
  const aircraft = data.aircraft.find((a) => a.id === engine.aircraftId);
  const workOrder = data.workOrders
    .filter((w) => w.engineId === engine.id && w.state !== "cancelled")
    .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))[0];

  const rng = createRng(`warranty-cover:${engine.id}`);
  const coverStart = new Date(engine.installedAt ?? aircraft?.deliveredAt ?? iso(addDays(NOW, -1500)));
  const daysInService = Math.max(1, daysBetween(coverStart, NOW));

  const items: WarrantyCoverageItem[] = COVERED_MODULES.map((moduleCode, index) => {
    const coverKind = coverKindForItem(index, engine, rng);
    const terms = COVER_TERMS[coverKind];
    const part = rand.pick(rng, data.parts.filter((p) => p.moduleCode === moduleCode));
    const engineModule = data.engineModules.find((m) => m.engineId === engine.id && m.code === moduleCode);

    const hoursLimit = Math.round(terms.hours * rand.float(rng, 0.85, 1.15));
    const cyclesLimit = Math.round(terms.cycles * rand.float(rng, 0.85, 1.15));
    const expiresAt = addDays(coverStart, Math.round(terms.months * 30.4));

    const hoursUsed = Math.round(engine.totalFlightHours);
    const cyclesUsed = engine.totalFlightCycles;
    const hoursRemaining = hoursLimit - hoursUsed;
    const cyclesRemaining = cyclesLimit - cyclesUsed;
    const daysRemaining = daysBetween(NOW, expiresAt);

    const hoursPct = hoursUsed / hoursLimit;
    const cyclesPct = cyclesUsed / cyclesLimit;
    const calendarPct = daysInService / Math.max(1, daysBetween(coverStart, expiresAt));
    const consumed = Math.max(hoursPct, cyclesPct, calendarPct);
    const limitingFactor: WarrantyCoverageItem["limitingFactor"] =
      consumed === hoursPct ? "hours" : consumed === cyclesPct ? "cycles" : "calendar";

    const covered = hoursRemaining > 0 && cyclesRemaining > 0 && daysRemaining > 0;
    const replacementUsd = Math.round((part?.unitCostUsd ?? 120_000) * rand.float(rng, 1.1, 2.6));
    // Cover tapers over the last fifth of life on pro-rated schedules.
    const proRata = coverKind === "parts-warranty" || coverKind === "goodwill" ? clamp(1 - consumed, 0.25, 1) : 1;
    const recoverableUsd = covered ? Math.round(replacementUsd * proRata) : 0;

    const status: StatusLevel = !covered ? "grey" : consumed > 0.9 ? "red" : consumed > 0.75 ? "amber" : "green";

    return {
      id: `${engine.id}:${moduleCode}`,
      engineId: engine.id,
      moduleCode,
      partNumber: part?.partNumber ?? `RR-${moduleCode}-00000`,
      description: engineModule?.label ?? moduleCode,
      coverKind,
      hoursLimit,
      cyclesLimit,
      expiresAt: iso(expiresAt),
      hoursUsed,
      cyclesUsed,
      hoursRemaining,
      cyclesRemaining,
      daysRemaining,
      covered,
      limitingFactor,
      consumedPct: round(consumed * 100, 1),
      recoverableUsd,
      exposureUsd: covered ? 0 : replacementUsd,
      status,
    };
  });

  const recoverableUsd = items.reduce((s, i) => s + i.recoverableUsd, 0);
  const exposureUsd = items.reduce((s, i) => s + i.exposureUsd, 0);
  const coveredCount = items.filter((i) => i.covered).length;
  const totalValue = recoverableUsd + exposureUsd;
  const recoveryPotentialPct = totalValue > 0 ? round((recoverableUsd / totalValue) * 100, 1) : 0;
  const expiringItems = items.filter((i) => i.covered && (i.daysRemaining < 120 || i.consumedPct > 90));

  const status: StatusLevel =
    coveredCount === 0 ? "red" : recoveryPotentialPct < 40 ? "amber" : expiringItems.length > 0 ? "amber" : "green";

  const recommendation =
    coveredCount === 0
      ? "No cover remains — raise the event as an operator-funded repair and check campaign applicability."
      : expiringItems.length > 0
        ? `Capture the claim now: ${expiringItems.length} covered item${expiringItems.length === 1 ? "" : "s"} lapse within the next quarter.`
        : `Claim all ${coveredCount} covered items with the strip report; entitlement is comfortably in date.`;

  return {
    engineId: engine.id,
    esn: engine.esn,
    operatorId: engine.operatorId,
    operatorName: operator?.name ?? "Unknown operator",
    family: engine.family,
    contractKind: contract?.kind ?? "Time & Materials",
    workOrderId: workOrder?.id ?? null,
    workOrderReference: workOrder?.reference ?? null,
    eventSummary: workOrder
      ? `${workOrder.type.replace(/-/g, " ")} · ${workOrder.state.replace(/-/g, " ")}`
      : "No open maintenance event",
    assessedAt: iso(NOW),
    coverStartsAt: iso(coverStart),
    hoursSinceNew: Math.round(engine.totalFlightHours),
    cyclesSinceNew: engine.totalFlightCycles,
    items,
    coveredCount,
    totalCount: items.length,
    recoverableUsd,
    exposureUsd,
    recoveryPotentialPct,
    status,
    recommendation,
  };
}

/**
 * Removal candidates worth assessing: engines with an open maintenance event or
 * a red/amber condition, ranked by recoverable value at risk.
 */
export function warrantyEligibilityCandidates(limit = 8): WarrantyEligibility[] {
  const data = getDataset();
  const openByEngine = new Set(
    data.workOrders
      .filter((w) => w.state !== "complete" && w.state !== "cancelled")
      .map((w) => w.engineId),
  );
  const engines = data.engines
    .filter((e) => openByEngine.has(e.id) || e.status === "red")
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, limit);

  return engines
    .map((engine) => warrantyEligibility(engine.id))
    .filter((e): e is WarrantyEligibility => e !== undefined)
    .sort((a, b) => b.recoverableUsd - a.recoverableUsd);
}
