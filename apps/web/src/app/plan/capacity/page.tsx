import Link from "next/link";
import { capacityOverview } from "@rr/data";
import { Panel, PanelHeader, StatTile, StatusPill, cn, formatDate, formatNumber, statusStyles } from "@rr/ui";
import { CapacityWorkspace } from "@/components/capacity/capacity-workspace";
import { ChartLegend, DemandCapacityChart } from "@/components/capacity/demand-capacity-chart";
import { LoadLevellingPanel } from "@/components/capacity/load-levelling-panel";

export const metadata = { title: "Shop capacity" };

export default function ShopCapacityPage() {
  const overview = capacityOverview();
  const { summary, moves, network, facilities } = overview;

  const headroom = [...facilities].sort((a, b) => a.utilisationPct - b.utilisationPct)[0];
  const pressured = [...facilities].sort((a, b) => b.peakUtilisationPct - a.peakUtilisationPct)[0];
  const primaryLane = moves.reduce<Record<string, number>>((acc, move) => {
    const key = `${move.fromFacilityName}→${move.toFacilityName}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topLane = Object.entries(primaryLane).sort((a, b) => b[1] - a[1])[0];
  const contractedBays = network[0]?.capacityBayMonths ?? 0;

  return (
    <div className="space-y-7">
      {/* Hero — the decision this page supports */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Plan · Shop capacity</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.atRiskInductions} of {summary.inductions} inductions cannot make their removal date at the shop
              nearest to them
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Bays, slots and turn-around across {facilities.length} overhaul bases and partner shops for the next{" "}
              {overview.horizonMonths} months. Rerouting {moves.length} engines recovers{" "}
              {formatNumber(summary.recoverableDelayDays)} of the {formatNumber(summary.totalDelayDays)} delay days in
              the plan.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#load-levelling"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {moves.length} reroutes
                <span aria-hidden>›</span>
              </a>
              <Link
                href="/plan/schedule"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Maintenance schedule
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat
              label="Network utilisation"
              value={`${summary.networkUtilisationPct}%`}
              tone={summary.networkUtilisationPct > 100 ? "red" : summary.networkUtilisationPct >= 85 ? "amber" : "green"}
              caption={`${contractedBays} contracted bays`}
            />
            <HeroStat
              label="Overloaded months"
              value={summary.overloadedFacilityMonths}
              tone={summary.overloadedFacilityMonths > 0 ? "red" : "green"}
              caption={`peak ${formatNumber(summary.peakShortfallBayMonths, 1)} bay-months short in ${summary.peakShortfallMonth}`}
            />
            <HeroStat
              label="Next free slot"
              value={summary.nextFreeSlot ? summary.nextFreeSlot.icao : "None"}
              tone="green"
              caption={summary.nextFreeSlot ? formatDate(summary.nextFreeSlot.startsAt) : "no bay inside the horizon"}
            />
          </div>
        </div>
      </section>

      {/* Recommended action */}
      <Panel className="border-l-2 border-l-rr-blue">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="rr-label text-rr-blue">Recommended action</p>
            <p className="mt-2 text-lg font-semibold leading-snug text-rr-ink">
              {topLane
                ? `Move ${topLane[1]} engines off ${topLane[0].split("→")[0]} onto ${topLane[0].split("→")[1]}`
                : "Hold the plan — every induction lands on its removal date"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-rr-slate">
              {pressured && headroom
                ? `${pressured.icao} peaks at ${pressured.peakUtilisationPct}% in ${pressured.peakMonth} while ${headroom.icao} runs at ${headroom.utilisationPct}% mean utilisation with a bay free from ${headroom.nextFreeSlot ? formatDate(headroom.nextFreeSlot) : "—"}. Both are certified for the affected families.`
                : "All shops sit inside their contracted bays across the horizon."}
            </p>
          </div>
          <div className="flex gap-8">
            <ActionFigure label="Delay days recoverable" value={formatNumber(summary.recoverableDelayDays)} tone="green" />
            <ActionFigure
              label="Bay-months short"
              value={formatNumber(summary.bayMonthsShortfall, 1)}
              tone={summary.bayMonthsShortfall > 0 ? "red" : "green"}
            />
            <ActionFigure label="Watchlist inductions" value={summary.watchlistInductions} tone="amber" />
          </div>
        </div>
      </Panel>

      {/* Stat strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Inductions in horizon"
          value={summary.inductions}
          caption={`${summary.atRiskInductions} slipping more than 14 days`}
          status={summary.atRiskInductions > 0 ? "red" : "green"}
        />
        <StatTile
          label="Total slip in plan"
          value={formatNumber(summary.totalDelayDays)}
          unit="days"
          status={summary.totalDelayDays > 0 ? "amber" : "green"}
          caption="Sum of days each engine waits past its removal date"
        />
        <StatTile
          label="Engines in work today"
          value={facilities.reduce((sum, f) => sum + f.wipEngines, 0)}
          caption="Live and awaiting-parts shop visits"
        />
        <StatTile
          label="Network throughput"
          value={facilities.reduce((sum, f) => sum + f.throughputPerYear, 0)}
          unit="eng/yr"
          caption="Contracted bays at each shop's mean TAT"
        />
      </section>

      {/* Demand vs capacity */}
      <Panel>
        <PanelHeader
          title="Demand vs capacity"
          subtitle="Bay-months required if every engine is inducted on its removal date, against the bays contracted to this portfolio"
          actions={
            <StatusPill status={summary.bayMonthsShortfall > 0 ? "red" : "green"}>
              {formatNumber(summary.bayMonthsShortfall, 1)} bay-months short
            </StatusPill>
          }
        />
        <DemandCapacityChart months={network} />
        <div className="mt-4 border-t border-rr-ink/8 pt-3">
          <ChartLegend capacity={contractedBays} />
        </div>
      </Panel>

      <CapacityWorkspace overview={overview} />

      <div id="load-levelling" className="scroll-mt-6">
        <LoadLevellingPanel moves={moves} />
      </div>

      <p className="text-[11px] leading-relaxed text-rr-slate">
        Planning assumptions: only overhaul bases and partner shops can induct engines; 60% of each shop&apos;s bays are
        contracted to this portfolio; removal dates are driven by the earliest of LLP life, prognostic risk, EGT margin
        and the scheduled interval; work already in the shops holds its bays before any new induction is planned.
      </p>
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
  value: string | number;
  tone: "red" | "amber" | "green";
  caption: string;
}) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div className="max-w-[13rem]">
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] leading-snug text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function ActionFigure({ label, value, tone }: { label: string; value: string | number; tone: "red" | "amber" | "green" }) {
  return (
    <div>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-1 text-2xl font-semibold", statusStyles[tone].text)}>{value}</p>
    </div>
  );
}
