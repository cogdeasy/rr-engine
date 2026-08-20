import { getFleetMapSnapshot } from "@rr/data";
import { Panel, SectionHeading, StatTile, StatusPill, formatNumber } from "@rr/ui";
import { FleetMapConsole } from "@/components/fleet-map/fleet-map-console";

export const metadata = { title: "Live fleet map" };

export default function Page() {
  const snapshot = getFleetMapSnapshot();
  const { totals } = snapshot;
  const worst = snapshot.aircraft.find((node) => node.outOfReach) ?? null;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Operate"
        title="Live fleet map"
        description="Which flagged engines are near a station that can act on them? Every marker is an airframe; every diamond is a maintenance base with real slot and certification capacity."
        actions={
          <StatusPill status={totals.unreachable > 0 ? "red" : totals.redEngines > 0 ? "amber" : "green"} size="md">
            {totals.unreachable > 0
              ? `${totals.unreachable} out of reach`
              : totals.redEngines > 0
                ? `${totals.redEngines} red engines in cover`
                : "Network covered"}
          </StatusPill>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Red engines"
          value={formatNumber(totals.redEngines)}
          status={totals.redEngines > 0 ? "red" : "green"}
          caption="Open red alerts — action required now"
        />
        <StatTile
          label="Out of reach"
          value={formatNumber(totals.unreachable)}
          status={totals.unreachable > 0 ? "red" : "green"}
          caption={worst ? `Worst: ${worst.tail} · ${worst.operatorCode}` : "Every flagged airframe has a station"}
        />
        <StatTile
          label="Near a capable base"
          value={formatNumber(totals.nearCapableBase)}
          status="green"
          caption={`of ${formatNumber(totals.flaggedAircraft)} flagged airframes`}
        />
        <StatTile
          label="Amber engines"
          value={formatNumber(totals.amberEngines)}
          status={totals.amberEngines > 0 ? "amber" : "green"}
          caption="Watchlist — plan into the next visit"
        />
        <StatTile
          label="Shop slots free"
          value={formatNumber(totals.freeSlots)}
          status={totals.freeSlots > 0 ? "green" : "red"}
          caption={`${formatNumber(totals.inFlight)} of ${formatNumber(totals.aircraft)} airframes airborne`}
        />
      </div>

      <FleetMapConsole snapshot={snapshot} />

      <Panel className="text-[11px] leading-relaxed text-rr-slate">
        Positions are derived deterministically from each airframe&apos;s most recent sector in the generated dataset;
        reachability assumes an 830 km/h ferry speed and a 4,200 km capability radius. A station counts as capable when it
        has a free slot and at least one technician certified on the flagged engine family.
      </Panel>
    </div>
  );
}
