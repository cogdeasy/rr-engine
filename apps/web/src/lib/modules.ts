/**
 * The module registry — the contract between parallel feature workstreams.
 *
 * Every route in the product is declared here up front, so feature branches
 * only ever create their own page file and never edit a shared navigation list.
 * `implemented: false` renders the standard "planned module" placeholder; the
 * feature branch that builds the module flips its own flag to true.
 */

export type ModuleGroupId = "operate" | "diagnose" | "predict" | "plan" | "execute" | "supply" | "commercial" | "assure" | "platform";

export interface ModuleGroup {
  id: ModuleGroupId;
  label: string;
  description: string;
}

export interface ModuleDefinition {
  id: string;
  group: ModuleGroupId;
  label: string;
  href: string;
  /** One-line description shown in the placeholder and in global search. */
  summary: string;
  /** The operational decision this module exists to support. */
  decision: string;
  icon: string;
  implemented: boolean;
}

export const MODULE_GROUPS: ModuleGroup[] = [
  { id: "operate", label: "Operate", description: "Live fleet state and the events demanding attention right now." },
  { id: "diagnose", label: "Diagnose", description: "Engine-level evidence: trends, signatures and physical condition." },
  { id: "predict", label: "Predict", description: "Where the fleet is heading and what will fail next." },
  { id: "plan", label: "Plan", description: "Turning predictions into slots, workscopes and resourced plans." },
  { id: "execute", label: "Execute", description: "Getting the work done on wing and in the shop." },
  { id: "supply", label: "Supply", description: "Parts availability, lead times and the supply chain behind the plan." },
  { id: "commercial", label: "Commercial", description: "Contract performance, cost and customer-facing reporting." },
  { id: "assure", label: "Assure", description: "Reliability, airworthiness compliance and evidence." },
  { id: "platform", label: "Platform", description: "Configuration, access and platform health." },
];

export const MODULES: ModuleDefinition[] = [
  // Operate
  {
    id: "fleet-overview",
    group: "operate",
    label: "Fleet overview",
    href: "/",
    summary: "Single-screen state of the managed fleet with red/amber/green roll-up.",
    decision: "Where should the duty controller look first this shift?",
    icon: "gauge",
    implemented: true,
  },
  {
    id: "fleet-map",
    group: "operate",
    label: "Live fleet map",
    href: "/fleet/map",
    summary: "Geographic view of aircraft, engine status and maintenance bases.",
    decision: "Which flagged engines are near a station that can act on them?",
    icon: "map",
    implemented: true,
  },
  {
    id: "engine-explorer",
    group: "operate",
    label: "Engine explorer",
    href: "/engines",
    summary: "Filterable register of every managed engine with health ranking.",
    decision: "Which engines breach thresholds and in what order do we work them?",
    icon: "list",
    implemented: false,
  },
  {
    id: "engine-detail",
    group: "operate",
    label: "Engine detail & 3D twin",
    href: "/engines/EN-0001",
    summary: "Per-engine dossier with the interactive Rolls-Royce 3D engine model.",
    decision: "What exactly is wrong with this engine and which module drives it?",
    icon: "cube",
    implemented: false,
  },
  {
    id: "alerts",
    group: "operate",
    label: "Alert triage",
    href: "/alerts",
    summary: "EHM, ACARS and prognostic alerts queued for disposition.",
    decision: "Which alerts are real, and which need action before the next sector?",
    icon: "bell",
    implemented: false,
  },
  {
    id: "aog",
    group: "operate",
    label: "AOG command centre",
    href: "/aog",
    summary: "Aircraft on ground events with recovery clock and escalation state.",
    decision: "What is the fastest path to returning this aircraft to service?",
    icon: "siren",
    implemented: false,
  },
  {
    id: "notifications",
    group: "operate",
    label: "Escalations",
    href: "/notifications",
    summary: "Escalation workflow, ownership and acknowledgement trail.",
    decision: "Has every red condition been acknowledged by an accountable owner?",
    icon: "inbox",
    implemented: false,
  },

  // Diagnose
  {
    id: "health-trending",
    group: "diagnose",
    label: "Health trending",
    href: "/health/trending",
    summary: "EGT margin and performance parameter trending against limits.",
    decision: "Is deterioration within the expected band for this build standard?",
    icon: "activity",
    implemented: false,
  },
  {
    id: "vibration",
    group: "diagnose",
    label: "Vibration analysis",
    href: "/health/vibration",
    summary: "Per-shaft vibration levels, spectral peaks and balance history.",
    decision: "Is this a balance issue we can trim, or rotor damage?",
    icon: "waveform",
    implemented: false,
  },
  {
    id: "oil-debris",
    group: "diagnose",
    label: "Oil & debris monitoring",
    href: "/health/oil",
    summary: "Oil consumption, temperature and debris particle counts.",
    decision: "Is a bearing degrading, and does the engine need to come off wing?",
    icon: "droplet",
    implemented: false,
  },
  {
    id: "hot-section",
    group: "diagnose",
    label: "Hot section condition",
    href: "/health/hot-section",
    summary: "HPT tip clearance, EGT hot spots and combustor distress.",
    decision: "How much hot section life remains before a shop visit is forced?",
    icon: "flame",
    implemented: false,
  },
  {
    id: "performance",
    group: "diagnose",
    label: "Performance & fuel burn",
    href: "/health/performance",
    summary: "Specific fuel consumption deviation and washes' recovered margin.",
    decision: "Is a water wash worth the downtime for this engine?",
    icon: "fuel",
    implemented: false,
  },
  {
    id: "telemetry-quality",
    group: "diagnose",
    label: "Telemetry quality",
    href: "/health/telemetry",
    summary: "Sensor coverage, gaps and data quality by aircraft and parameter.",
    decision: "Can we trust the data behind a red flag on this engine?",
    icon: "signal",
    implemented: false,
  },

  // Predict
  {
    id: "prognostics",
    group: "predict",
    label: "Prognostics & RUL",
    href: "/predict/rul",
    summary: "Remaining useful life distributions per engine and module.",
    decision: "How many cycles can this engine safely stay on wing?",
    icon: "trending-down",
    implemented: false,
  },
  {
    id: "risk",
    group: "predict",
    label: "Failure risk",
    href: "/predict/risk",
    summary: "Failure-mode probabilities, drivers and model confidence.",
    decision: "Which failure mode dominates the risk for this fleet segment?",
    icon: "target",
    implemented: false,
  },
  {
    id: "simulation",
    group: "predict",
    label: "What-if simulation",
    href: "/predict/simulation",
    summary: "Digital twin scenarios: derate, routing and wash interventions.",
    decision: "What does changing the operating profile buy us in margin?",
    icon: "sliders",
    implemented: false,
  },
  {
    id: "environment",
    group: "predict",
    label: "Environmental exposure",
    href: "/predict/environment",
    summary: "Sand, dust and salt exposure accumulated per engine and route.",
    decision: "Should we rotate engines away from harsh-environment routes?",
    icon: "wind",
    implemented: false,
  },

  // Plan
  {
    id: "schedule",
    group: "plan",
    label: "Maintenance schedule",
    href: "/plan/schedule",
    summary: "Rolling plan of removals, shop visits and checks on one timeline.",
    decision: "Does the plan fit within contractual availability commitments?",
    icon: "calendar",
    implemented: false,
  },
  {
    id: "workscope",
    group: "plan",
    label: "Shop visit workscoping",
    href: "/plan/workscope",
    summary: "Module-by-module workscope build-up with cost and TAT impact.",
    decision: "Which modules do we open, and what does that cost in TAT?",
    icon: "layers",
    implemented: false,
  },
  {
    id: "capacity",
    group: "plan",
    label: "Shop capacity",
    href: "/plan/capacity",
    summary: "Slot utilisation across overhaul bases and partner shops.",
    decision: "Where is the next available slot that meets the removal date?",
    icon: "factory",
    implemented: false,
  },
  {
    id: "llp",
    group: "plan",
    label: "LLP life management",
    href: "/plan/llp",
    summary: "Life-limited part cycles remaining and stack optimisation.",
    decision: "Which LLPs must be replaced at the next shop visit?",
    icon: "clock",
    implemented: false,
  },
  {
    id: "workforce",
    group: "plan",
    label: "Workforce & skills",
    href: "/plan/workforce",
    summary: "Technician availability, licences and skill coverage by shift.",
    decision: "Do we have certified people to release this work on time?",
    icon: "users",
    implemented: false,
  },

  // Execute
  {
    id: "work-orders",
    group: "execute",
    label: "Work orders",
    href: "/execute/work-orders",
    summary: "Work order lifecycle from raise through release to sign-off.",
    decision: "What is blocking the work orders in progress today?",
    icon: "clipboard",
    implemented: false,
  },
  {
    id: "task-cards",
    group: "execute",
    label: "Task cards",
    href: "/execute/task-cards",
    summary: "Task card execution, sign-off and man-hour tracking.",
    decision: "Which tasks are behind estimate and why?",
    icon: "check-square",
    implemented: false,
  },
  {
    id: "borescope",
    group: "execute",
    label: "Borescope inspections",
    href: "/execute/borescope",
    summary: "Inspection findings, imagery and repeat-inspection intervals.",
    decision: "Does the observed damage exceed serviceable limits?",
    icon: "search",
    implemented: false,
  },
  {
    id: "test-cell",
    group: "execute",
    label: "Test cell results",
    href: "/execute/test-cell",
    summary: "Post-overhaul pass-off runs and restored margin verification.",
    decision: "Has this engine met its acceptance criteria for return to service?",
    icon: "zap",
    implemented: false,
  },
  {
    id: "build-records",
    group: "execute",
    label: "Build records",
    href: "/execute/build-records",
    summary: "Engine configuration, module serial history and traceability.",
    decision: "What is actually installed in this engine right now?",
    icon: "file-text",
    implemented: false,
  },

  // Supply
  {
    id: "inventory",
    group: "supply",
    label: "Parts & inventory",
    href: "/supply/inventory",
    summary: "Stock positions, reservations and reorder exposure by facility.",
    decision: "Will parts be on the shelf when the engine arrives?",
    icon: "package",
    implemented: false,
  },
  {
    id: "supply-chain",
    group: "supply",
    label: "Supply chain",
    href: "/supply/chain",
    summary: "Supplier lead times, purchase order status and shortage risk.",
    decision: "Which shortages will delay a shop visit in the next 90 days?",
    icon: "truck",
    implemented: false,
  },
  {
    id: "warranty",
    group: "supply",
    label: "Warranty claims",
    href: "/supply/warranty",
    summary: "Claim capture, recovery value and settlement status.",
    decision: "Is this repair recoverable under warranty or campaign cover?",
    icon: "shield",
    implemented: false,
  },

  // Commercial
  {
    id: "contracts",
    group: "commercial",
    label: "Contracts & TotalCare",
    href: "/commercial/contracts",
    summary: "Availability commitments, rates and liquidated damages exposure.",
    decision: "Which contracts are at risk of breaching availability this quarter?",
    icon: "handshake",
    implemented: false,
  },
  {
    id: "costs",
    group: "commercial",
    label: "Cost analytics",
    href: "/commercial/costs",
    summary: "Maintenance cost per engine flight hour, by driver and fleet.",
    decision: "Where is cost per EFH drifting away from plan?",
    icon: "chart",
    implemented: false,
  },
  {
    id: "operator-portal",
    group: "commercial",
    label: "Operator portal",
    href: "/commercial/operator-portal",
    summary: "Customer-facing view of their fleet health and planned events.",
    decision: "What does the airline need to see and agree to this week?",
    icon: "globe",
    implemented: false,
  },

  // Assure
  {
    id: "reliability",
    group: "assure",
    label: "Reliability KPIs",
    href: "/assure/reliability",
    summary: "Dispatch reliability, IFSD rate, MTBUR and unscheduled removals.",
    decision: "Is fleet reliability trending toward or away from target?",
    icon: "chart-line",
    implemented: false,
  },
  {
    id: "compliance",
    group: "assure",
    label: "SB & AD compliance",
    href: "/assure/compliance",
    summary: "Service bulletin and airworthiness directive embodiment status.",
    decision: "Which mandatory actions are approaching their compliance date?",
    icon: "badge-check",
    implemented: false,
  },
  {
    id: "audit",
    group: "assure",
    label: "Audit trail",
    href: "/assure/audit",
    summary: "Immutable record of decisions, overrides and sign-offs.",
    decision: "Who decided what, when, and on what evidence?",
    icon: "history",
    implemented: false,
  },
  {
    id: "reports",
    group: "assure",
    label: "Reports & exports",
    href: "/assure/reports",
    summary: "Scheduled fleet reports and data exports for customers and audits.",
    decision: "What goes into this month's customer review pack?",
    icon: "download",
    implemented: false,
  },

  // Platform
  {
    id: "settings",
    group: "platform",
    label: "Settings & access",
    href: "/settings",
    summary: "Roles, thresholds, integrations and notification preferences.",
    decision: "Who can act on what, and at which thresholds do we alert?",
    icon: "settings",
    implemented: false,
  },
];

export function moduleByHref(href: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.href === href);
}

export function modulesInGroup(group: ModuleGroupId): ModuleDefinition[] {
  return MODULES.filter((m) => m.group === group);
}
