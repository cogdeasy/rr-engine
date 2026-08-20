import Link from "next/link";
import { workforceOverview } from "@rr/data";
import {
  Badge,
  Panel,
  PanelHeader,
  ShiftLoadBar,
  StatTile,
  StatusPill,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { AssignmentBoard } from "@/components/workforce/assignment-board";
import { CoverageExplorer, type CoverageScope } from "@/components/workforce/coverage-explorer";
import { LabourForecast } from "@/components/workforce/labour-forecast";
import { RosterTable } from "@/components/workforce/roster-table";

export const metadata = { title: "Workforce & skills" };

const SHIFT_HOURS: Record<string, string> = {
  early: "06:00 – 14:00",
  late: "14:00 – 22:00",
  night: "22:00 – 06:00",
};

export default function WorkforcePage() {
  const overview = workforceOverview();
  const { summary, coverage, coverageByFacility, forecasts, roster, shifts, suggestions, expiries } = overview;

  const scopes: CoverageScope[] = [
    { facilityId: "ALL", label: "Network", name: "All facilities", rows: coverage },
    ...coverageByFacility.map((facility) => ({
      facilityId: facility.facilityId,
      label: facility.icao,
      name: facility.name,
      rows: facility.rows,
    })),
  ];
  const worstScope = [...scopes]
    .slice(1)
    .sort(
      (a, b) =>
        b.rows.reduce((s, r) => s + r.cells.filter((c) => c.status === "red").length, 0) -
        a.rows.reduce((s, r) => s + r.cells.filter((c) => c.status === "red").length, 0),
    )[0];

  const nameById = new Map(roster.map((p) => [p.technician.id, p] as const));
  const watchlist = expiries.slice(0, 9);
  const tightestFacility = [...forecasts].sort((a, b) => b.peakUtilisationPct - a.peakUtilisationPct)[0];

  return (
    <div className="space-y-7">
      {/* Hero — the staffing decision, then the two actions that resolve it. */}
      {/* `rr-grid-lines` is intentionally omitted: it declares `background-image`
          later in the stylesheet and would replace the hero gradient. */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Plan · Workforce &amp; skills</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.unstaffedPriorityCards} priority cards need a certified owner
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {formatNumber(summary.headcount)} technicians across {summary.facilities} facilities, holding{" "}
              {formatNumber(summary.availableHours)} bookable hours against {formatNumber(summary.demandHours)} hours of
              open work over the next {summary.horizonWeeks} weeks. Red below means the work cannot be released by a
              current authorisation as planned.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#assignments"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Staff {summary.unstaffedPriorityCards} priority cards
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#currency"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Renew {summary.lapsedCertifications} lapsed authorisations
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Lapsed" value={summary.lapsedCertifications} tone="red" caption="cannot sign off" />
            <HeroStat label="Expiring 30d" value={summary.expiring30} tone="amber" caption="renewal due" />
            <HeroStat label="Coverage gaps" value={summary.redCoverageCells} tone="red" caption="skill × shift cells" />
            <HeroStat label="Unstaffable" value={summary.unstaffableCards} tone="red" caption="no certified head" />
          </div>
        </div>
      </section>

      {/* Shift posture. */}
      <section className="grid gap-4 lg:grid-cols-4">
        {shifts.map((shift) => (
          <Panel key={shift.shift} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="rr-label text-rr-slate">{shift.shift} shift</p>
                <p className="rr-numeric mt-1 text-[11px] text-rr-slate">{SHIFT_HOURS[shift.shift]}</p>
              </div>
              <StatusPill status={shift.status} />
            </div>
            <p className="rr-numeric text-3xl font-semibold text-rr-ink">
              {shift.heads}
              <span className="ml-1.5 text-xs font-medium text-rr-slate">heads</span>
            </p>
            <ShiftLoadBar demandHours={shift.demandHours} capacityHours={shift.capacityHours} status={shift.status} />
            <p className="rr-numeric text-[11px] text-rr-slate">
              {formatNumber(shift.demandHours)}h booked of {formatNumber(shift.capacityHours)}h certified capacity
            </p>
          </Panel>
        ))}
        <StatTile
          label="Tightest facility"
          value={tightestFacility ? `${tightestFacility.peakUtilisationPct}%` : "—"}
          status={tightestFacility?.status ?? "grey"}
          caption={
            tightestFacility
              ? `${tightestFacility.facilityName} peak week · ${tightestFacility.headcount} heads`
              : "No facilities"
          }
        />
      </section>

      {/* Decision surface: what to staff, and who is about to fall out of currency. */}
      <div id="assignments" className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AssignmentBoard suggestions={suggestions} />
        </div>

        <Panel id="currency" className="scroll-mt-24">
          <PanelHeader
            title="Certification watchlist"
            subtitle="Earliest expiries first — a lapsed approval removes sign-off authority immediately"
            actions={
              <StatusPill status={summary.lapsedCertifications > 0 ? "red" : "amber"}>
                {summary.lapsedCertifications} lapsed
              </StatusPill>
            }
          />
          <ul className="divide-y divide-rr-ink/5">
            {watchlist.map((certification) => {
              const profile = nameById.get(certification.technicianId);
              return (
                <li key={certification.id} className="flex items-start gap-3 py-2.5">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusStyles[certification.status].dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-rr-ink">
                      {profile?.technician.name ?? certification.technicianId}
                    </p>
                    <p className="truncate text-[11px] text-rr-slate">
                      {certification.label} · {profile?.facilityIcao ?? "—"} · {profile?.shift ?? "—"} shift
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("rr-numeric text-[13px] font-semibold", statusStyles[certification.status].text)}>
                      {certification.daysToExpiry <= 0
                        ? `${Math.abs(certification.daysToExpiry)}d lapsed`
                        : `${certification.daysToExpiry}d`}
                    </p>
                    <p className="rr-numeric text-[10px] text-rr-slate">{formatDate(certification.expiresAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 rounded-sm bg-rr-mist p-3">
            <p className="rr-label text-rr-slate">Recommended action</p>
            <p className="mt-1 text-xs leading-relaxed text-rr-ink">
              Book renewal slots for the {summary.lapsedCertifications} lapsed and {summary.expiring30} sub-30-day
              approvals before rostering them onto sign-off work; {summary.expiring90} more fall due inside 90 days.
            </p>
          </div>
        </Panel>
      </div>

      {/* Coverage. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-rr-ink">Skill coverage</h2>
            <p className="mt-1 text-sm text-rr-slate">
              A cell is red when certified, current heads on that shift cannot absorb the hours booked against the skill
              {worstScope ? ` — ${worstScope.name} is worst placed.` : "."}
            </p>
          </div>
          <Badge variant="outline">{summary.horizonWeeks}-week horizon</Badge>
        </div>
        <CoverageExplorer scopes={scopes} initialScopeId={worstScope?.facilityId ?? "ALL"} />
      </section>

      {/* Capacity. */}
      <LabourForecast forecasts={forecasts} />

      {/* Roster. */}
      <RosterTable roster={roster} facilities={overview.facilities} />
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
  const colour = tone === "red" ? "text-status-red" : tone === "amber" ? "text-status-amber" : "text-status-green";
  return (
    <div>
      <p className="rr-label text-rr-blue-200">{label}</p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", value === 0 ? "text-white" : colour)}>{value}</p>
      <p className="mt-1 text-[11px] text-rr-cloud">{caption}</p>
    </div>
  );
}
