import type { AirportExposure, ExposureDriverDefinition, ExposureDriverId } from "@rr/types";
import {
  Badge,
  DriverBreakdownBar,
  DriverLegend,
  Panel,
  PanelHeader,
  StatusPill,
  cn,
  formatNumber,
  statusStyles,
} from "@rr/ui";

/** Airports ranked by composite severity, with the drivers that put them there. */
export function AirportRanking({
  airports,
  drivers,
  limit = 10,
}: {
  airports: AirportExposure[];
  drivers: ExposureDriverDefinition[];
  limit?: number;
}) {
  const ranked = [...airports].sort((a, b) => b.severityIndex - a.severityIndex).slice(0, limit);
  const worstDriverOf = (airport: AirportExposure) =>
    drivers.reduce((worst, driver) =>
      airport.drivers[driver.id] * driver.weight > airport.drivers[worst.id] * worst.weight ? driver : worst,
    );
  /** Weighted driver points, so the stacked bar sums to the composite index. */
  const contributionsOf = (airport: AirportExposure) =>
    Object.fromEntries(drivers.map((d) => [d.id, airport.drivers[d.id] * d.weight])) as Record<ExposureDriverId, number>;

  return (
    <Panel>
      <PanelHeader
        title="Airport severity ranking"
        subtitle="Composite of dust, sand, salinity, pollution and ambient temperature at each station the fleet touches"
        actions={<Badge variant="outline">{airports.length} stations</Badge>}
      />
      <DriverLegend className="pb-3" />
      <ol className="divide-y divide-rr-ink/5">
        {ranked.map((airport, index) => {
          const worst = worstDriverOf(airport);
          return (
            <li key={airport.icao} className="flex items-center gap-4 py-2.5">
              <span className="rr-numeric w-5 text-right text-[11px] text-rr-slate">{index + 1}</span>
              <div className="w-32 shrink-0">
                <p className="rr-numeric text-[13px] font-semibold text-rr-ink">{airport.iata}</p>
                <p className="truncate text-[11px] text-rr-slate">{airport.city}</p>
              </div>
              <div className="min-w-0 flex-1">
                <DriverBreakdownBar contributions={contributionsOf(airport)} total={100} height={10} />
                <p className="mt-1 truncate text-[11px] text-rr-slate">
                  {airport.climate} · {worst.label.toLowerCase()} dominant · {formatNumber(airport.sectors)} sectors ·{" "}
                  {formatNumber(airport.enginesExposed)} engines
                </p>
              </div>
              <span className={cn("rr-numeric w-12 text-right text-lg font-semibold", statusStyles[airport.status].text)}>
                {airport.severityIndex}
              </span>
              <StatusPill status={airport.status} />
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
