/**
 * Workforce & skills selectors.
 *
 * The base dataset carries technicians (facility, shift, licences, skills,
 * certified engine families) but no currency dates, absence plan or task-card
 * assignments. Those three concepts are derived here, deterministically from
 * each technician's id, so the web app, the API and tests agree exactly.
 *
 * Domain assumptions, all encoded in one place:
 *  - licences and authorisations are renewed on a 24-month cycle;
 *  - facilities run a three-shift pattern with an early-shift bias
 *    (45% early / 35% late / 20% night of the day's hands-on demand);
 *  - a technician's `utilisationPct` is load already committed to running work,
 *    so only the remaining hours are bookable against new task cards;
 *  - a technician spreads their bookable hours evenly across the skills they
 *    hold, so holding five skills does not create five people's worth of cover;
 *  - task cards that are in progress or signed off already have an owner; open
 *    and blocked cards are the staffing gap a planner has to close.
 */

import type {
  AssignmentSuggestion,
  Certification,
  CoverageCell,
  CoverageSkillRow,
  EngineFamily,
  FacilityLabourForecast,
  LabourWeek,
  ShiftId,
  StatusLevel,
  SuggestedTechnician,
  TaskCard,
  Technician,
  TechnicianProfile,
  WorkforceOverview,
  WorkforceSummary,
  WorkOrder,
} from "@rr/types";
import { SKILLS } from "../catalog";
import { getDataset } from "../index";
import { addDays, clamp, createRng, iso, NOW, rand, round } from "../rng";

export const WORKFORCE_HORIZON_WEEKS = 8;

const SHIFTS: ShiftId[] = ["early", "late", "night"];

/** Share of hands-on demand worked by each shift in a standard MRO pattern. */
const SHIFT_DEMAND_SHARE: Record<ShiftId, number> = { early: 0.45, late: 0.35, night: 0.2 };

const CONTRACTED_HOURS: Record<ShiftId, number> = { early: 37.5, late: 37.5, night: 34 };

const ABSENCE_REASONS = ["annual leave", "type training", "secondment"] as const;

function certificationStatus(daysToExpiry: number): StatusLevel {
  if (daysToExpiry <= 0) return "red";
  if (daysToExpiry <= 30) return "red";
  if (daysToExpiry <= 90) return "amber";
  return "green";
}

function worstStatus(statuses: StatusLevel[]): StatusLevel {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("amber")) return "amber";
  if (statuses.includes("green")) return "green";
  return "grey";
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** Monday 00:00 UTC of the week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(d, -offset);
}

export function workforceWeeks(count = WORKFORCE_HORIZON_WEEKS): Date[] {
  const first = weekStart(NOW);
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ */
/* Currency, absence and assignment derivation                         */
/* ------------------------------------------------------------------ */

function certificationsFor(technician: Technician): Certification[] {
  const rng = createRng(`cert:${technician.id}`);
  const out: Certification[] = [];
  let n = 0;

  const push = (kind: Certification["kind"], label: string, spread: [number, number]) => {
    n += 1;
    const daysToExpiry = rand.int(rng, spread[0], spread[1]);
    const expiresAt = addDays(NOW, daysToExpiry);
    out.push({
      id: `${technician.id}-C${n}`,
      technicianId: technician.id,
      kind,
      label,
      issuedAt: iso(addDays(expiresAt, -730)),
      expiresAt: iso(expiresAt),
      daysToExpiry,
      status: certificationStatus(daysToExpiry),
    });
  };

  for (const licence of technician.licences) push("licence", licence, [-45, 700]);
  for (const family of technician.certifiedFamilies) push("family-authorisation", family, [-30, 640]);
  for (const skill of technician.skills) push("skill-approval", skill, [-20, 600]);

  return out.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

interface AbsencePlan {
  weeks: number;
  startWeek: number;
  reason: (typeof ABSENCE_REASONS)[number] | null;
}

function absenceFor(technician: Technician): AbsencePlan {
  const rng = createRng(`absence:${technician.id}`);
  const weeks = rand.weighted(rng, [
    { value: 0, weight: 62 },
    { value: 1, weight: 24 },
    { value: 2, weight: 11 },
    { value: 3, weight: 3 },
  ]);
  if (weeks === 0) return { weeks: 0, startWeek: 0, reason: null };
  return {
    weeks,
    startWeek: rand.int(rng, 0, WORKFORCE_HORIZON_WEEKS - weeks),
    reason: rand.pick(rng, ABSENCE_REASONS),
  };
}

/** Bookable hours per week: contracted less the load already committed. */
function spareHours(technician: Technician): number {
  return round(CONTRACTED_HOURS[technician.shift] * (1 - technician.utilisationPct / 100), 1);
}

/** Bookable hours a technician can offer in a given horizon week (0 while absent). */
function hoursInWeek(technician: Technician, absence: AbsencePlan, weekIndex: number): number {
  const absent = absence.weeks > 0 && weekIndex >= absence.startWeek && weekIndex < absence.startWeek + absence.weeks;
  if (absent) return 0;
  return spareHours(technician);
}

/**
 * Task cards that are already under way or signed off have an owner. The base
 * generator leaves `assignedTechnicianId` empty, so ownership is derived here:
 * the card goes to a technician at the work order's facility holding the
 * required skill, falling back to any technician at that facility.
 */
export function taskCardOwners(): Map<string, string> {
  return cache().owners;
}

function isStaffed(card: TaskCard): boolean {
  return card.state === "in-progress" || card.state === "signed-off";
}

/** Remaining hands-on hours on a card; signed-off cards are done. */
function remainingHours(card: TaskCard): number {
  if (card.state === "signed-off") return 0;
  if (card.state === "in-progress") return round(card.estimatedHours * 0.45, 1);
  return card.estimatedHours;
}

function workOrderIsLive(order: WorkOrder): boolean {
  return order.state !== "complete" && order.state !== "cancelled" && order.state !== "draft";
}

/* ------------------------------------------------------------------ */
/* Core build                                                          */
/* ------------------------------------------------------------------ */

interface WorkforceCache {
  overview: WorkforceOverview;
  owners: Map<string, string>;
}

let cached: WorkforceCache | null = null;

function cache(): WorkforceCache {
  if (!cached) cached = build();
  return cached;
}

export function workforceOverview(): WorkforceOverview {
  return cache().overview;
}

function build(): WorkforceCache {
  const data = getDataset();
  const weeks = workforceWeeks();
  const horizonEnd = addDays(weeks[weeks.length - 1]!, 7);

  const byFacility = new Map<string, Technician[]>();
  for (const technician of data.technicians) {
    const list = byFacility.get(technician.facilityId) ?? [];
    list.push(technician);
    byFacility.set(technician.facilityId, list);
  }

  const orderById = new Map(data.workOrders.map((w) => [w.id, w] as const));
  const engineById = new Map(data.engines.map((e) => [e.id, e] as const));

  /* Ownership of cards already under way. */
  const owners = new Map<string, string>();
  for (const card of data.taskCards) {
    if (!isStaffed(card)) continue;
    const order = orderById.get(card.workOrderId);
    if (!order) continue;
    const pool = byFacility.get(order.facilityId) ?? [];
    if (pool.length === 0) continue;
    const skilled = pool.filter((t) => t.skills.includes(card.skillRequired));
    const rng = createRng(`assign:${card.id}`);
    const chosen = rand.pick(rng, skilled.length > 0 ? skilled : pool);
    owners.set(card.id, chosen.id);
  }

  /* Roster with currency and capacity. */
  const roster: TechnicianProfile[] = data.technicians.map((technician) => {
    const facility = data.facilities.find((f) => f.id === technician.facilityId);
    const certifications = certificationsFor(technician);
    const absence = absenceFor(technician);
    const contracted = CONTRACTED_HOURS[technician.shift];
    const spare = spareHours(technician);
    const availableHoursPerWeek = round((spare * (WORKFORCE_HORIZON_WEEKS - absence.weeks)) / WORKFORCE_HORIZON_WEEKS, 1);
    const ownedCards = data.taskCards.filter((c) => owners.get(c.id) === technician.id);
    const nextExpiry = certifications[0] ?? null;
    return {
      technician,
      facilityId: technician.facilityId,
      facilityIcao: facility?.icao ?? "—",
      shift: technician.shift,
      certifications,
      contractedHoursPerWeek: contracted,
      committedHoursPerWeek: round(contracted - spare, 1),
      spareHoursPerWeek: spare,
      availableHoursPerWeek,
      absenceWeeks: absence.weeks,
      absenceReason: absence.reason,
      assignedTaskCards: ownedCards.length,
      assignedHours: round(ownedCards.reduce((sum, c) => sum + remainingHours(c), 0), 1),
      nextExpiry,
      status: worstStatus(certifications.map((c) => c.status)),
    };
  });

  const profileById = new Map(roster.map((p) => [p.technician.id, p] as const));

  /* Demand: unfinished card hours placed on the weeks their work order spans. */
  const demandByFacilityWeek = new Map<string, number[]>();
  /** facilityId -> skill -> remaining hours in the horizon. */
  const demandByFacilitySkill = new Map<string, Map<string, number>>();

  for (const order of data.workOrders) {
    if (!workOrderIsLive(order)) continue;
    const start = new Date(order.scheduledStart);
    const end = new Date(order.scheduledEnd);
    if (end < weeks[0]! || start > horizonEnd) continue;
    const cards = data.taskCards.filter((c) => c.workOrderId === order.id);
    const hours = cards.reduce((sum, c) => sum + remainingHours(c), 0);
    if (hours <= 0) continue;

    const spanned = weeks
      .map((w, i) => ({ i, w }))
      .filter(({ w }) => addDays(w, 7) > start && w < end)
      .map(({ i }) => i);
    const target = spanned.length > 0 ? spanned : [0];
    const perWeek = hours / target.length;

    const series = demandByFacilityWeek.get(order.facilityId) ?? weeks.map(() => 0);
    for (const i of target) series[i] = (series[i] ?? 0) + perWeek;
    demandByFacilityWeek.set(order.facilityId, series);

    const skillMap = demandByFacilitySkill.get(order.facilityId) ?? new Map<string, number>();
    for (const card of cards) {
      const cardHours = remainingHours(card);
      if (cardHours <= 0) continue;
      skillMap.set(card.skillRequired, (skillMap.get(card.skillRequired) ?? 0) + cardHours);
    }
    demandByFacilitySkill.set(order.facilityId, skillMap);
  }

  /* Facility labour forecast. */
  const forecasts: FacilityLabourForecast[] = data.facilities.map((facility) => {
    const pool = byFacility.get(facility.id) ?? [];
    const absences = new Map(pool.map((t) => [t.id, absenceFor(t)] as const));
    const demandSeries = demandByFacilityWeek.get(facility.id) ?? weeks.map(() => 0);

    const weekRows: LabourWeek[] = weeks.map((week, i) => {
      const availableHours = round(
        pool.reduce((sum, t) => sum + hoursInWeek(t, absences.get(t.id)!, i), 0),
        0,
      );
      const demandHours = round(demandSeries[i] ?? 0, 0);
      const balanceHours = round(availableHours - demandHours, 0);
      const utilisationPct = availableHours > 0 ? round((demandHours / availableHours) * 100, 0) : 0;
      return {
        weekStart: iso(week),
        label: weekLabel(week),
        demandHours,
        availableHours,
        balanceHours,
        utilisationPct,
        status: utilisationPct > 100 ? "red" : utilisationPct > 88 ? "amber" : availableHours === 0 ? "grey" : "green",
      };
    });

    const demandHours = round(weekRows.reduce((s, w) => s + w.demandHours, 0), 0);
    const availableHours = round(weekRows.reduce((s, w) => s + w.availableHours, 0), 0);
    const peak = weekRows.reduce((m, w) => Math.max(m, w.utilisationPct), 0);
    const deficit = weekRows.find((w) => w.balanceHours < 0) ?? null;

    return {
      facilityId: facility.id,
      facilityName: facility.name,
      icao: facility.icao,
      headcount: pool.length,
      weeks: weekRows,
      demandHours,
      availableHours,
      balanceHours: round(availableHours - demandHours, 0),
      peakUtilisationPct: peak,
      firstDeficitWeek: deficit?.label ?? null,
      status: worstStatus(weekRows.map((w) => w.status)),
    };
  });

  /* Skill x shift coverage, per facility and for the network. */
  const coverageFor = (facilityId: string): CoverageSkillRow[] => {
    const pool = facilityId === "ALL" ? roster : roster.filter((p) => p.facilityId === facilityId);
    const demandForSkill = (skill: string) => {
      if (facilityId !== "ALL") return demandByFacilitySkill.get(facilityId)?.get(skill) ?? 0;
      let total = 0;
      for (const map of demandByFacilitySkill.values()) total += map.get(skill) ?? 0;
      return total;
    };

    return SKILLS.map((skill) => {
      const demandHours = demandForSkill(skill);
      const cells: CoverageCell[] = SHIFTS.map((shift) => {
        const holders = pool.filter((p) => p.shift === shift && p.technician.skills.includes(skill));
        const current = holders.filter((p) => {
          const approval = p.certifications.find((c) => c.kind === "skill-approval" && c.label === skill);
          return (approval?.daysToExpiry ?? 0) > 0;
        });
        const capacityHours = round(
          current.reduce(
            (sum, p) => sum + (p.availableHoursPerWeek / Math.max(1, p.technician.skills.length)) * WORKFORCE_HORIZON_WEEKS,
            0,
          ),
          0,
        );
        const cellDemand = round(demandHours * SHIFT_DEMAND_SHARE[shift], 0);
        const ratio = cellDemand === 0 ? 3 : round(capacityHours / cellDemand, 2);
        const shortfallHours = Math.max(0, round(cellDemand - capacityHours, 0));
        return {
          skill,
          shift,
          facilityId,
          heads: holders.length,
          currentHeads: current.length,
          lapsedHeads: holders.length - current.length,
          demandHours: cellDemand,
          capacityHours,
          coverageRatio: Math.min(3, ratio),
          shortfallHours,
          status:
            cellDemand === 0
              ? "grey"
              : current.length === 0 || ratio < 1
                ? "red"
                : ratio < 1.25
                  ? "amber"
                  : "green",
        };
      });
      return {
        skill,
        facilityId,
        cells,
        demandHours: round(cells.reduce((s, c) => s + c.demandHours, 0), 0),
        capacityHours: round(cells.reduce((s, c) => s + c.capacityHours, 0), 0),
        shortfallHours: round(cells.reduce((s, c) => s + c.shortfallHours, 0), 0),
        status: worstStatus(cells.map((c) => c.status)),
      };
    }).sort((a, b) => b.shortfallHours - a.shortfallHours || a.skill.localeCompare(b.skill));
  };

  const coverage = coverageFor("ALL");
  const coverageByFacility = data.facilities.map((facility) => ({
    facilityId: facility.id,
    icao: facility.icao,
    name: facility.name,
    rows: coverageFor(facility.id),
  }));

  const shifts = SHIFTS.map((shift) => {
    const heads = roster.filter((p) => p.shift === shift).length;
    const demandHours = round(coverage.reduce((s, row) => s + (row.cells.find((c) => c.shift === shift)?.demandHours ?? 0), 0), 0);
    const capacityHours = round(coverage.reduce((s, row) => s + (row.cells.find((c) => c.shift === shift)?.capacityHours ?? 0), 0), 0);
    return {
      shift,
      heads,
      demandHours,
      capacityHours,
      status: (capacityHours < demandHours ? "red" : capacityHours < demandHours * 1.25 ? "amber" : "green") as StatusLevel,
    };
  });

  /* Assignment suggestions for unstaffed, high-priority work. */
  const suggestions = buildSuggestions({
    taskCards: data.taskCards,
    orderById,
    engineById,
    roster,
    profileById,
    byFacility,
    facilities: data.facilities,
    owners,
  });

  const expiries = roster
    .flatMap((p) => p.certifications)
    .filter((c) => c.daysToExpiry <= 90)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const availableHours = round(forecasts.reduce((s, f) => s + f.availableHours, 0), 0);
  const demandHours = round(forecasts.reduce((s, f) => s + f.demandHours, 0), 0);

  const summary: WorkforceSummary = {
    headcount: roster.length,
    facilities: data.facilities.length,
    lapsedCertifications: expiries.filter((c) => c.daysToExpiry <= 0).length,
    expiring30: expiries.filter((c) => c.daysToExpiry > 0 && c.daysToExpiry <= 30).length,
    expiring90: expiries.filter((c) => c.daysToExpiry > 30 && c.daysToExpiry <= 90).length,
    redCoverageCells: coverageByFacility.reduce(
      (s, f) => s + f.rows.reduce((rs, row) => rs + row.cells.filter((c) => c.status === "red").length, 0),
      0,
    ),
    unstaffedPriorityCards: suggestions.length,
    unstaffableCards: suggestions.filter((s) => s.candidate === null).length,
    demandHours,
    availableHours,
    coveragePct: demandHours > 0 ? round((availableHours / demandHours) * 100, 0) : 100,
    horizonWeeks: WORKFORCE_HORIZON_WEEKS,
  };

  return {
    owners,
    overview: {
      summary,
      facilities: data.facilities.map((f) => ({
        id: f.id,
        name: f.name,
        icao: f.icao,
        headcount: (byFacility.get(f.id) ?? []).length,
        status: forecasts.find((x) => x.facilityId === f.id)?.status ?? "grey",
      })),
      coverage,
      coverageByFacility,
      shifts,
      forecasts,
      suggestions,
      roster,
      expiries,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Suggestion engine                                                   */
/* ------------------------------------------------------------------ */

interface SuggestionInput {
  taskCards: TaskCard[];
  orderById: Map<string, WorkOrder>;
  engineById: Map<string, { esn: string; family: EngineFamily }>;
  roster: TechnicianProfile[];
  profileById: Map<string, TechnicianProfile>;
  byFacility: Map<string, Technician[]>;
  facilities: { id: string; icao: string }[];
  owners: Map<string, string>;
}

function scoreCandidate(profile: TechnicianProfile, card: TaskCard, family: EngineFamily): SuggestedTechnician | null {
  const skillApproval = profile.certifications.find((c) => c.kind === "skill-approval" && c.label === card.skillRequired);
  if (!skillApproval || skillApproval.daysToExpiry <= 0) return null;
  const familyApproval = profile.certifications.find((c) => c.kind === "family-authorisation" && c.label === family);
  if (!familyApproval || familyApproval.daysToExpiry <= 0) return null;
  const licence = profile.certifications.find((c) => c.kind === "licence");
  if (!licence || licence.daysToExpiry <= 0) return null;

  const spareHoursPerWeek = round(profile.availableHoursPerWeek * (1 - profile.technician.utilisationPct / 100), 1);
  const capacityScore = clamp(spareHoursPerWeek * 3.2, 0, 30);
  const currencyScore = clamp(Math.min(skillApproval.daysToExpiry, familyApproval.daysToExpiry) / 12, 0, 20);
  const loadScore = clamp(18 - profile.assignedTaskCards * 3.5, 0, 18);
  const matchScore = Math.round(clamp(32 + capacityScore + currencyScore + loadScore, 0, 100));

  const reasons = [
    `${card.skillRequired} approval current for ${skillApproval.daysToExpiry}d`,
    `${family} authorisation held`,
    `${spareHoursPerWeek}h/week spare on ${profile.shift} shift`,
  ];
  if (profile.absenceWeeks > 0 && profile.absenceReason) reasons.push(`${profile.absenceWeeks}w ${profile.absenceReason} booked`);

  return {
    technicianId: profile.technician.id,
    name: profile.technician.name,
    shift: profile.shift,
    utilisationPct: profile.technician.utilisationPct,
    spareHoursPerWeek,
    matchScore,
    reasons,
  };
}

function buildSuggestions(input: SuggestionInput): AssignmentSuggestion[] {
  const { taskCards, orderById, engineById, byFacility, profileById, owners } = input;
  const out: AssignmentSuggestion[] = [];

  for (const card of taskCards) {
    if (owners.has(card.id) || card.state === "signed-off") continue;
    const order = orderById.get(card.workOrderId);
    if (!order || !workOrderIsLive(order)) continue;
    if (order.priority !== "critical" && order.priority !== "high") continue;

    const start = new Date(order.scheduledStart);
    const daysToStart = daysBetween(NOW, start);
    if (daysToStart > WORKFORCE_HORIZON_WEEKS * 7) continue;

    const engine = engineById.get(order.engineId);
    if (!engine) continue;

    const pool = (byFacility.get(order.facilityId) ?? [])
      .map((t) => profileById.get(t.id))
      .filter((p): p is TechnicianProfile => Boolean(p));

    const ranked = pool
      .map((p) => scoreCandidate(p, card, engine.family))
      .filter((c): c is SuggestedTechnician => c !== null)
      .sort((a, b) => b.matchScore - a.matchScore);

    const candidate = ranked[0] ?? null;
    const facilityIcao = input.facilities.find((f) => f.id === order.facilityId)?.icao ?? "—";
    const urgent = daysToStart <= 2;

    out.push({
      taskCardId: card.id,
      taskReference: card.reference,
      taskTitle: card.title,
      workOrderId: order.id,
      workOrderReference: order.reference,
      engineEsn: engine.esn,
      family: engine.family,
      facilityId: order.facilityId,
      facilityIcao,
      priority: order.priority,
      skillRequired: card.skillRequired,
      estimatedHours: card.estimatedHours,
      startsAt: order.scheduledStart,
      daysToStart,
      candidate,
      alternates: ranked.slice(1, 3),
      status: candidate === null ? "red" : urgent ? "red" : daysToStart <= 10 ? "amber" : "green",
      action:
        candidate === null
          ? `No current ${card.skillRequired} + ${engine.family} authorisation at ${facilityIcao} — borrow from network or expedite renewal`
          : `Assign ${candidate.name} (${candidate.shift} shift) and release the card`,
    });
  }

  return out
    .sort((a, b) => {
      const rank = (s: AssignmentSuggestion) => (s.candidate === null ? 0 : 1);
      return rank(a) - rank(b) || a.daysToStart - b.daysToStart || b.estimatedHours - a.estimatedHours;
    })
    .slice(0, 24);
}

/** Roster filtered to one facility, used by the API and by the roster table. */
export function workforceRoster(facilityId?: string): TechnicianProfile[] {
  const roster = workforceOverview().roster;
  return facilityId ? roster.filter((p) => p.facilityId === facilityId) : roster;
}
