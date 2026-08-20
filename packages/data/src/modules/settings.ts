/**
 * Settings & access selectors.
 *
 * Everything here is derived from the deterministic fleet dataset: the people
 * are drawn from the technician roster and operator list, the thresholds are
 * evaluated against real engine, LLP and prognostic populations, and platform
 * health is measured against the timestamps already present in the data.
 */

import type {
  AccessSummary,
  DataFreshness,
  EscalationPolicy,
  GovernanceAction,
  IntegrationStatus,
  ModelVersion,
  PermissionLevel,
  PlatformHealth,
  PlatformRoleId,
  PlatformUser,
  RoleDefinition,
  Severity,
  SettingsSnapshot,
  StatusLevel,
  ThresholdImpact,
  ThresholdPolicy,
} from "@rr/types";
import { PARAMETERS } from "../catalog";
import { getDataset } from "../index";
import { createRng, iso, NOW, rand, round } from "../rng";

/** Module groups mirrored from the web module registry. */
export const SETTINGS_MODULE_GROUPS: { id: string; label: string }[] = [
  { id: "operate", label: "Operate" },
  { id: "diagnose", label: "Diagnose" },
  { id: "predict", label: "Predict" },
  { id: "plan", label: "Plan" },
  { id: "execute", label: "Execute" },
  { id: "supply", label: "Supply" },
  { id: "commercial", label: "Commercial" },
  { id: "assure", label: "Assure" },
  { id: "platform", label: "Platform" },
];

interface RoleSeed {
  id: PlatformRoleId;
  label: string;
  mandate: string;
  escalationTier: 1 | 2 | 3;
  permissions: Record<string, PermissionLevel>;
}

const ROLE_SEEDS: RoleSeed[] = [
  {
    id: "duty-controller",
    label: "Duty controller",
    mandate: "Owns the live fleet picture and dispositions every red condition inside the shift.",
    escalationTier: 1,
    permissions: {
      operate: "approve",
      diagnose: "action",
      predict: "view",
      plan: "action",
      execute: "view",
      supply: "view",
      commercial: "view",
      assure: "view",
      platform: "view",
    },
  },
  {
    id: "reliability-engineer",
    label: "Reliability engineer",
    mandate: "Owns thresholds, prognostic models and the engineering justification behind removals.",
    escalationTier: 2,
    permissions: {
      operate: "action",
      diagnose: "approve",
      predict: "approve",
      plan: "action",
      execute: "view",
      supply: "view",
      commercial: "none",
      assure: "action",
      platform: "action",
    },
  },
  {
    id: "planner",
    label: "Maintenance planner",
    mandate: "Converts predicted removals into slots, workscopes and resourced plans.",
    escalationTier: 2,
    permissions: {
      operate: "view",
      diagnose: "view",
      predict: "view",
      plan: "approve",
      execute: "action",
      supply: "action",
      commercial: "view",
      assure: "view",
      platform: "none",
    },
  },
  {
    id: "shop-supervisor",
    label: "Shop supervisor",
    mandate: "Runs the bay: task card allocation, sign-off and shop turn-around performance.",
    escalationTier: 3,
    permissions: {
      operate: "view",
      diagnose: "view",
      predict: "none",
      plan: "view",
      execute: "approve",
      supply: "action",
      commercial: "none",
      assure: "action",
      platform: "none",
    },
  },
  {
    id: "operator-user",
    label: "Operator user",
    mandate: "Airline-side visibility of their own engines, events and contract performance.",
    escalationTier: 3,
    permissions: {
      operate: "view",
      diagnose: "view",
      predict: "view",
      plan: "view",
      execute: "none",
      supply: "none",
      commercial: "view",
      assure: "view",
      platform: "none",
    },
  },
];

const RR_STAFF: { roleId: PlatformRoleId; count: number }[] = [
  { roleId: "duty-controller", count: 4 },
  { roleId: "reliability-engineer", count: 6 },
  { roleId: "planner", count: 5 },
];

const FIRST = ["Amara", "Ravi", "Helena", "Tomás", "Ingrid", "Callum", "Yuki", "Priya", "Mateo", "Freya", "Idris", "Nadia", "Owen", "Sofia", "Lars"];
const LAST = ["Hughes", "Patel", "Silva", "Nakamura", "Okonjo", "Lindqvist", "Moreau", "Bennett", "Rahman", "Costa", "Zhang", "Kowalski", "Dubois", "Ferreira", "Ali"];

function minutesBetween(from: string, to: Date = NOW): number {
  return Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60000));
}

function freshnessStatus(ageMinutes: number, expected: number): StatusLevel {
  if (ageMinutes > expected * 3) return "red";
  if (ageMinutes > expected * 1.5) return "amber";
  return "green";
}

/* ------------------------------------------------------------------ */
/* People and roles                                                    */
/* ------------------------------------------------------------------ */

export function platformUsers(): PlatformUser[] {
  const data = getDataset();
  const rng = createRng("settings-access-v1");
  const users: PlatformUser[] = [];
  let n = 0;

  const push = (user: Omit<PlatformUser, "id" | "status" | "exception">) => {
    n += 1;
    const dormantDays = Math.round(minutesBetween(user.lastActiveAt) / 1440);
    const role = ROLE_SEEDS.find((r) => r.id === user.roleId)!;
    const approves = Object.values(role.permissions).includes("approve");
    let status: StatusLevel = "green";
    let exception: string | null = null;
    if (!user.mfaEnrolled) {
      status = "red";
      exception = "No MFA enrolment on an account with platform access";
    } else if (approves && dormantDays > 45) {
      status = "red";
      exception = `Approval rights unused for ${dormantDays} days — revoke or recertify`;
    } else if (user.accessReviewDueDays < 0) {
      status = "red";
      exception = `Access review overdue by ${Math.abs(user.accessReviewDueDays)} days`;
    } else if (user.accessReviewDueDays <= 14) {
      status = "amber";
      exception = `Access review due in ${user.accessReviewDueDays} days`;
    } else if (dormantDays > 30) {
      status = "amber";
      exception = `Dormant for ${dormantDays} days`;
    }
    users.push({ ...user, id: `US-${String(n).padStart(4, "0")}`, status, exception });
  };

  for (const staff of RR_STAFF) {
    for (let i = 0; i < staff.count; i += 1) {
      const name = `${rand.pick(rng, FIRST)} ${rand.pick(rng, LAST)}`;
      const facility = rand.pick(rng, data.facilities);
      const global = rand.bool(rng, 0.45);
      push({
        name,
        email: `${name.split(" ")[0]!.toLowerCase()[0]}.${name.split(" ")[1]!.toLowerCase()}@rolls-royce.com`,
        roleId: staff.roleId,
        organisation: "Rolls-Royce Civil Aerospace",
        scopeKind: global ? "global" : "facility",
        scopeLabel: global ? "Global managed fleet" : `${facility.name} (${facility.icao})`,
        region: facility.region,
        lastActiveAt: iso(new Date(NOW.getTime() - rand.float(rng, 0.1, 70, 2) * 86400000)),
        mfaEnrolled: rand.bool(rng, 0.9),
        accessReviewDueDays: rand.int(rng, -25, 150),
        actionsLast30d: rand.int(rng, 0, 180),
      });
    }
  }

  for (const facility of data.facilities.filter((f) => f.kind === "overhaul-base" || f.kind === "partner-shop")) {
    const name = `${rand.pick(rng, FIRST)} ${rand.pick(rng, LAST)}`;
    push({
      name,
      email: `${name.split(" ")[0]!.toLowerCase()[0]}.${name.split(" ")[1]!.toLowerCase()}@rolls-royce.com`,
      roleId: "shop-supervisor",
      organisation: facility.name,
      scopeKind: "facility",
      scopeLabel: `${facility.name} (${facility.icao})`,
      region: facility.region,
      lastActiveAt: iso(new Date(NOW.getTime() - rand.float(rng, 0.05, 40, 2) * 86400000)),
      mfaEnrolled: rand.bool(rng, 0.92),
      accessReviewDueDays: rand.int(rng, -10, 160),
      actionsLast30d: rand.int(rng, 10, 240),
    });
  }

  for (const operator of data.operators.slice(0, 9)) {
    const name = `${rand.pick(rng, FIRST)} ${rand.pick(rng, LAST)}`;
    push({
      name,
      email: `${name.split(" ")[0]!.toLowerCase()[0]}.${name.split(" ")[1]!.toLowerCase()}@${operator.code.toLowerCase()}-airways.com`,
      roleId: "operator-user",
      organisation: operator.name,
      scopeKind: "operator",
      scopeLabel: `${operator.name} fleet only`,
      region: operator.region,
      lastActiveAt: iso(new Date(NOW.getTime() - rand.float(rng, 0.05, 60, 2) * 86400000)),
      mfaEnrolled: rand.bool(rng, 0.85),
      accessReviewDueDays: rand.int(rng, -20, 140),
      actionsLast30d: rand.int(rng, 0, 60),
    });
  }

  return users;
}

export function roleDefinitions(users = platformUsers()): RoleDefinition[] {
  return ROLE_SEEDS.map((seed) => {
    const members = users.filter((u) => u.roleId === seed.id);
    return {
      ...seed,
      memberCount: members.length,
      flaggedCount: members.filter((m) => m.status === "red" || m.status === "amber").length,
    };
  });
}

export function accessSummary(users = platformUsers()): AccessSummary {
  const approverRoles = new Set(
    ROLE_SEEDS.filter((r) => Object.values(r.permissions).includes("approve")).map((r) => r.id),
  );
  return {
    users: users.length,
    flagged: users.filter((u) => u.status === "red").length,
    withoutMfa: users.filter((u) => !u.mfaEnrolled).length,
    reviewsOverdue: users.filter((u) => u.accessReviewDueDays < 0).length,
    approvers: users.filter((u) => approverRoles.has(u.roleId)).length,
    dormant: users.filter((u) => minutesBetween(u.lastActiveAt) / 1440 > 45).length,
  };
}

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

/** Counts a population against a pair of limits. */
export function thresholdImpact(
  values: number[],
  amber: number,
  red: number,
  direction: ThresholdPolicy["direction"],
): ThresholdImpact {
  let redCount = 0;
  let amberCount = 0;
  for (const value of values) {
    const isRed = direction === "higher-is-worse" ? value >= red : value <= red;
    const isAmber = direction === "higher-is-worse" ? value >= amber : value <= amber;
    if (isRed) redCount += 1;
    else if (isAmber) amberCount += 1;
  }
  return { red: redCount, amber: amberCount, green: values.length - redCount - amberCount, total: values.length };
}

export function thresholdPolicies(): ThresholdPolicy[] {
  const data = getDataset();
  const rng = createRng("settings-thresholds-v1");
  const engines = data.engines;

  const worstLlpByEngine = new Map<string, number>();
  for (const llp of data.llps) {
    const current = worstLlpByEngine.get(llp.engineId);
    if (current === undefined || llp.cyclesRemaining < current) worstLlpByEngine.set(llp.engineId, llp.cyclesRemaining);
  }

  const worstPrognosticByEngine = new Map<string, number>();
  for (const prognostic of data.prognostics) {
    const current = worstPrognosticByEngine.get(prognostic.engineId);
    if (current === undefined || prognostic.probability > current) {
      worstPrognosticByEngine.set(prognostic.engineId, round(prognostic.probability * 100, 1));
    }
  }

  const changedAt = (daysAgoValue: number) => iso(new Date(NOW.getTime() - daysAgoValue * 86400000));
  const changers = ["a.hughes@rolls-royce.com", "r.patel@rolls-royce.com", "m.silva@rolls-royce.com"];

  const seeds: Omit<ThresholdPolicy, "lastChangedAt" | "lastChangedBy">[] = [
    {
      id: "egt-margin",
      label: "EGT margin",
      description: "Degrees of exhaust gas temperature margin remaining. The headline deterioration signal.",
      parameter: "egtMargin",
      unit: "°C",
      direction: "lower-is-worse",
      min: 0,
      max: 60,
      step: 1,
      amber: PARAMETERS.egtMargin.amber.max,
      red: PARAMETERS.egtMargin.red.max,
      ataChapter: PARAMETERS.egtMargin.ataChapter,
      population: "installed and spare engines",
      owner: "reliability-engineer",
      values: engines.map((e) => e.egtMargin),
    },
    {
      id: "health-score",
      label: "Engine health score",
      description: "Composite fleet-relative condition index used to rank the watchlist.",
      parameter: null,
      unit: "",
      direction: "lower-is-worse",
      min: 20,
      max: 95,
      step: 1,
      amber: 70,
      red: 45,
      ataChapter: null,
      population: "installed and spare engines",
      owner: "reliability-engineer",
      values: engines.map((e) => e.healthScore),
    },
    {
      id: "rul-cycles",
      label: "Remaining useful life",
      description: "Predicted cycles before removal is required; drives slot booking lead time.",
      parameter: null,
      unit: " cyc",
      direction: "lower-is-worse",
      min: 0,
      max: 4000,
      step: 50,
      amber: 1500,
      red: 600,
      ataChapter: null,
      population: "installed and spare engines",
      owner: "planner",
      values: engines.map((e) => e.rulCycles),
    },
    {
      id: "llp-cycles-remaining",
      label: "LLP cycles remaining",
      description: "Lowest life-limited part margin on each engine; a breach grounds the engine.",
      parameter: null,
      unit: " cyc",
      direction: "lower-is-worse",
      min: 0,
      max: 4000,
      step: 50,
      amber: 1200,
      red: 400,
      ataChapter: "72-00",
      population: "engines with lifed parts",
      owner: "planner",
      values: [...worstLlpByEngine.values()],
    },
    {
      id: "prognostic-probability",
      label: "Prognostic exceedance probability",
      description: "Highest modelled probability of failure before the prediction horizon.",
      parameter: null,
      unit: "%",
      direction: "higher-is-worse",
      min: 0,
      max: 100,
      step: 1,
      amber: 45,
      red: 70,
      ataChapter: null,
      population: "engines with an active prognostic",
      owner: "reliability-engineer",
      values: [...worstPrognosticByEngine.values()],
    },
    {
      id: "environment-severity",
      label: "Environmental severity",
      description: "Route harshness index; harsh operation shortens on-wing life and tightens inspection intervals.",
      parameter: null,
      unit: "",
      direction: "higher-is-worse",
      min: 1,
      max: 5,
      step: 1,
      amber: 4,
      red: 5,
      ataChapter: null,
      population: "installed and spare engines",
      owner: "duty-controller",
      values: engines.map((e) => e.environmentSeverity),
    },
  ];

  return seeds.map((seed) => ({
    ...seed,
    lastChangedAt: changedAt(rand.int(rng, 3, 210)),
    lastChangedBy: rand.pick(rng, changers),
  }));
}

/* ------------------------------------------------------------------ */
/* Escalation policy                                                   */
/* ------------------------------------------------------------------ */

const SEVERITY_SEEDS: {
  severity: Severity;
  label: string;
  primaryRoleId: PlatformRoleId;
  escalateToRoleId: PlatformRoleId;
  channels: string[];
  ackSlaMinutes: number;
  resolveSlaHours: number;
}[] = [
  {
    severity: "critical",
    label: "Critical — airworthiness impact",
    primaryRoleId: "duty-controller",
    escalateToRoleId: "reliability-engineer",
    channels: ["Page", "Voice", "Teams"],
    ackSlaMinutes: 15,
    resolveSlaHours: 4,
  },
  {
    severity: "high",
    label: "High — action before next sector",
    primaryRoleId: "duty-controller",
    escalateToRoleId: "planner",
    channels: ["Page", "Teams", "Email"],
    ackSlaMinutes: 60,
    resolveSlaHours: 24,
  },
  {
    severity: "medium",
    label: "Medium — schedule within the plan",
    primaryRoleId: "reliability-engineer",
    escalateToRoleId: "planner",
    channels: ["Teams", "Email"],
    ackSlaMinutes: 240,
    resolveSlaHours: 72,
  },
  {
    severity: "low",
    label: "Low — monitor on trend",
    primaryRoleId: "reliability-engineer",
    escalateToRoleId: "reliability-engineer",
    channels: ["Email"],
    ackSlaMinutes: 1440,
    resolveSlaHours: 336,
  },
  {
    severity: "info",
    label: "Informational — no acknowledgement required",
    primaryRoleId: "operator-user",
    escalateToRoleId: "operator-user",
    channels: ["Digest"],
    ackSlaMinutes: 0,
    resolveSlaHours: 0,
  },
];

export function escalationPolicies(): EscalationPolicy[] {
  const data = getDataset();
  return SEVERITY_SEEDS.map((seed) => {
    const open = data.alerts.filter(
      (a) => a.severity === seed.severity && a.state !== "closed" && a.state !== "false-positive",
    );
    const unacknowledged = open.filter((a) => a.state === "new");
    const breached = unacknowledged.filter(
      (a) => seed.ackSlaMinutes > 0 && minutesBetween(a.raisedAt) > seed.ackSlaMinutes,
    );
    const ackAges = open
      .filter((a) => a.state !== "new")
      .map((a) => Math.min(minutesBetween(a.raisedAt), seed.ackSlaMinutes || 1))
      .sort((a, b) => a - b);
    const medianAckMinutes = ackAges.length > 0 ? ackAges[Math.floor(ackAges.length / 2)]! : 0;
    const status: StatusLevel =
      seed.ackSlaMinutes === 0 ? "grey" : breached.length > 0 ? "red" : unacknowledged.length > 0 ? "amber" : "green";
    return {
      ...seed,
      openCount: open.length,
      breachedCount: breached.length,
      medianAckMinutes,
      status,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Platform health                                                     */
/* ------------------------------------------------------------------ */

export function platformHealth(): PlatformHealth {
  const data = getDataset();

  const latest = (values: string[]) => values.reduce((a, b) => (a > b ? a : b), values[0] ?? iso(NOW));

  const freshnessSeeds: { id: string; label: string; last: string; expected: number; records: number }[] = [
    {
      id: "flights",
      label: "Flight & ACARS records",
      last: latest(data.flights.map((f) => f.arrivedAt)),
      expected: 90,
      records: data.flights.length,
    },
    {
      id: "alerts",
      label: "EHM alert stream",
      last: latest(data.alerts.map((a) => a.raisedAt)),
      expected: 120,
      records: data.alerts.length,
    },
    {
      id: "prognostics",
      label: "Prognostic scoring run",
      last: latest(data.prognostics.map((p) => p.computedAt)),
      expected: 1440,
      records: data.prognostics.length,
    },
    {
      id: "work-orders",
      label: "MRO work order sync",
      last: latest(data.workOrders.map((w) => w.raisedAt)),
      expected: 360,
      records: data.workOrders.length,
    },
    {
      id: "inventory",
      label: "Inventory positions",
      last: latest(data.inventory.filter((i) => i.nextDeliveryAt).map((i) => i.nextDeliveryAt!)),
      expected: 720,
      records: data.inventory.length,
    },
    {
      id: "audit",
      label: "Audit log",
      last: latest(data.auditLog.map((a) => a.at)),
      expected: 240,
      records: data.auditLog.length,
    },
  ];

  const freshness: DataFreshness[] = freshnessSeeds.map((seed) => {
    const ageMinutes = minutesBetween(seed.last);
    return {
      id: seed.id,
      label: seed.label,
      lastUpdatedAt: seed.last,
      ageMinutes,
      expectedIntervalMinutes: seed.expected,
      records: seed.records,
      status: freshnessStatus(ageMinutes, seed.expected),
    };
  });

  const integrationSeeds: {
    id: string;
    name: string;
    kind: IntegrationStatus["kind"];
    direction: IntegrationStatus["direction"];
    last: string;
    expected: number;
    volume: number;
    owner: PlatformRoleId;
    note: string;
  }[] = [
    {
      id: "ehm",
      name: "Engine Health Monitoring feed",
      kind: "telemetry",
      direction: "inbound",
      last: latest(data.alerts.filter((a) => a.source === "EHM").map((a) => a.raisedAt)),
      expected: 120,
      volume: data.flights.length * 4,
      owner: "reliability-engineer",
      note: "Snapshot and full-flight parameters from the on-wing EHM unit.",
    },
    {
      id: "acars",
      name: "ACARS downlink gateway",
      kind: "airline",
      direction: "inbound",
      last: latest(data.alerts.filter((a) => a.source === "ACARS").map((a) => a.raisedAt)),
      expected: 90,
      volume: data.flights.length,
      owner: "duty-controller",
      note: "Take-off and cruise reports relayed by the operator datalink provider.",
    },
    {
      id: "prognostics",
      name: "Prognostics scoring pipeline",
      kind: "model",
      direction: "inbound",
      last: latest(data.prognostics.map((p) => p.computedAt)),
      expected: 1440,
      volume: data.prognostics.length,
      owner: "reliability-engineer",
      note: "Nightly batch scoring every managed engine against the active model set.",
    },
    {
      id: "mro-erp",
      name: "MRO ERP (work orders & task cards)",
      kind: "mro",
      direction: "bidirectional",
      last: latest(data.workOrders.map((w) => w.raisedAt)),
      expected: 360,
      volume: data.taskCards.length,
      owner: "planner",
      note: "Work order, task card and labour booking exchange with the shop system.",
    },
    {
      id: "supply",
      name: "Parts & logistics network",
      kind: "supply",
      direction: "bidirectional",
      last: latest(data.inventory.filter((i) => i.nextDeliveryAt).map((i) => i.nextDeliveryAt!)),
      expected: 720,
      volume: data.inventory.length,
      owner: "planner",
      note: "Stock positions, reservations and inbound deliveries across the network.",
    },
    {
      id: "billing",
      name: "TotalCare billing & availability",
      kind: "commercial",
      direction: "outbound",
      last: latest(data.contracts.map((c) => c.startsAt)),
      expected: 10080,
      volume: data.contracts.length,
      owner: "duty-controller",
      note: "Flight-hour usage and availability performance posted to the contract ledger.",
    },
  ];

  const integrations: IntegrationStatus[] = integrationSeeds.map((seed) => {
    const ageMinutes = minutesBetween(seed.last);
    return {
      id: seed.id,
      name: seed.name,
      kind: seed.kind,
      direction: seed.direction,
      lastSyncAt: seed.last,
      ageMinutes,
      expectedIntervalMinutes: seed.expected,
      volumePerDay: seed.volume,
      owner: seed.owner,
      status: freshnessStatus(ageMinutes, seed.expected),
      note: seed.note,
    };
  });

  const byVersion = new Map<string, { engines: Set<string>; last: string; confidence: number[]; modes: Set<string> }>();
  for (const prognostic of data.prognostics) {
    const entry = byVersion.get(prognostic.modelVersion) ?? {
      engines: new Set<string>(),
      last: prognostic.computedAt,
      confidence: [],
      modes: new Set<string>(),
    };
    entry.engines.add(prognostic.engineId);
    entry.modes.add(prognostic.failureMode);
    entry.confidence.push(prognostic.confidenceInterval.max - prognostic.confidenceInterval.min);
    if (prognostic.computedAt > entry.last) entry.last = prognostic.computedAt;
    byVersion.set(prognostic.modelVersion, entry);
  }

  const models: ModelVersion[] = [...byVersion.entries()]
    .map(([version, entry]) => {
      const spread = entry.confidence.reduce((s, v) => s + v, 0) / Math.max(1, entry.confidence.length);
      const meanConfidence = round(Math.max(0.4, 1 - spread / 4000), 2);
      const ageDays = minutesBetween(entry.last) / 1440;
      return {
        id: version,
        name: "Prognostic exceedance model",
        version,
        scope: `${entry.modes.size} failure modes`,
        enginesCovered: entry.engines.size,
        lastScoredAt: entry.last,
        meanConfidence,
        status: (ageDays > 7 ? "amber" : meanConfidence < 0.55 ? "amber" : "green") as StatusLevel,
      };
    })
    .sort((a, b) => b.enginesCovered - a.enginesCovered);

  return {
    datasetSeed: "rr-engine-2026",
    generatedAt: data.generatedAt,
    freshness,
    integrations,
    models,
  };
}

/* ------------------------------------------------------------------ */
/* Recommended governance actions                                      */
/* ------------------------------------------------------------------ */

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function governanceActions(
  users = platformUsers(),
  escalations = escalationPolicies(),
  health = platformHealth(),
  thresholds = thresholdPolicies(),
): GovernanceAction[] {
  const actions: GovernanceAction[] = [];
  const summary = accessSummary(users);

  if (summary.withoutMfa > 0) {
    actions.push({
      id: "enforce-mfa",
      title: `Enforce MFA on ${summary.withoutMfa} accounts`,
      detail: "These accounts can act on live fleet data without a second factor. Enrol or suspend them today.",
      status: "red",
      ctaLabel: "Suspend until enrolled",
      owner: "duty-controller",
    });
  }

  if (summary.reviewsOverdue > 0) {
    actions.push({
      id: "access-review",
      title: `${plural(summary.reviewsOverdue, "access review")} overdue`,
      detail: "Quarterly recertification has lapsed. Confirm each user still needs their current permission level.",
      status: "red",
      ctaLabel: "Start recertification",
      owner: "duty-controller",
    });
  }

  const breached = escalations.filter((e) => e.breachedCount > 0);
  if (breached.length > 0) {
    const total = breached.reduce((s, e) => s + e.breachedCount, 0);
    actions.push({
      id: "ack-breach",
      title: `${total} alerts past their acknowledgement SLA`,
      detail: `${breached.map((e) => e.severity).join(", ")} tiers have unacknowledged alerts. Page the escalation owner or widen the tier.`,
      status: "red",
      ctaLabel: "Page tier owner",
      owner: "duty-controller",
    });
  }

  const staleIntegrations = health.integrations.filter((i) => i.status !== "green");
  if (staleIntegrations.length > 0) {
    actions.push({
      id: "stale-feed",
      title: `${plural(staleIntegrations.length, "integration")} behind schedule`,
      detail: `${staleIntegrations[0]!.name} last synced ${Math.round(staleIntegrations[0]!.ageMinutes / 60)}h ago against a ${Math.round(staleIntegrations[0]!.expectedIntervalMinutes / 60)}h expectation.`,
      status: staleIntegrations.some((i) => i.status === "red") ? "red" : "amber",
      ctaLabel: "Open feed diagnostics",
      owner: "reliability-engineer",
    });
  }

  const stale = thresholds
    .filter((t) => minutesBetween(t.lastChangedAt) / 1440 > 180)
    .sort((a, b) => (a.lastChangedAt < b.lastChangedAt ? -1 : 1));
  if (stale.length > 0) {
    actions.push({
      id: "threshold-review",
      title: `${plural(stale.length, "threshold")} unchanged for over six months`,
      detail: `${stale.map((t) => t.label).join(", ")} ${stale.length === 1 ? "predates" : "predate"} the current build standards. Re-baseline against fleet distribution.`,
      status: "amber",
      ctaLabel: "Review limits",
      owner: "reliability-engineer",
    });
  }

  if (summary.dormant > 0) {
    actions.push({
      id: "dormant",
      title: `${plural(summary.dormant, "dormant account")}`,
      detail: "No recorded activity for 45 days or more. Dormant privileged access is the main audit finding risk.",
      status: "amber",
      ctaLabel: "Review dormant users",
      owner: "duty-controller",
    });
  }

  return actions;
}

/** Everything the Settings & access console renders, in one deterministic call. */
export function settingsSnapshot(): SettingsSnapshot {
  const users = platformUsers();
  const thresholds = thresholdPolicies();
  const escalations = escalationPolicies();
  const health = platformHealth();
  return {
    moduleGroups: SETTINGS_MODULE_GROUPS,
    roles: roleDefinitions(users),
    users,
    accessSummary: accessSummary(users),
    thresholds,
    escalations,
    health,
    actions: governanceActions(users, escalations, health, thresholds),
  };
}
