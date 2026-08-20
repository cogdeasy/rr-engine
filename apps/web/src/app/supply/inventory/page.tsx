import Link from "next/link";
import {
  ConditionMixBar,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  TrendChart,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import {
  INVENTORY_HORIZON_DAYS,
  facilityStockSummaries,
  getDataset,
  inventorySummary,
  inventoryValueSeries,
  moduleStockValues,
  rotablePool,
  rotablePoolSummary,
  shortageLines,
  slowMovers,
  stockPositions,
} from "@rr/data";
import { ShortageBoard } from "@/components/inventory/shortage-board";
import { StockExplorer } from "@/components/inventory/stock-explorer";

export const metadata = { title: "Parts & inventory" };

export default function InventoryPage() {
  const data = getDataset();
  const summary = inventorySummary();
  const shortages = shortageLines();
  const positions = stockPositions();
  const rotables = rotablePool();
  const pool = rotablePoolSummary();
  const slowMoverLines = slowMovers();
  const facilitySummaries = facilityStockSummaries();
  const modules = moduleStockValues();
  const valueSeries = inventoryValueSeries();

  const facilities = facilitySummaries.map((f) => ({ id: f.facilityId, icao: f.icao }));
  const blocking = shortages.filter((line) => line.position.blockingDemand > 0);
  const nextActions = [...blocking, ...shortages.filter((line) => line.position.blockingDemand === 0)].slice(0, 5);
  const maxModuleValue = Math.max(1, ...modules.map((m) => m.valueUsd));
  const poolCoverPct = pool.poolUnits === 0 ? 0 : Math.round((pool.serviceable / pool.poolUnits) * 100);

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        {/* Grid texture as an overlay: the utility sets background-image, which would otherwise replace the gradient. */}
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Supply · parts &amp; inventory</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.blockedWorkOrders} work order{summary.blockedWorkOrders === 1 ? "" : "s"} held for parts,{" "}
              {summary.shortLines} line{summary.shortLines === 1 ? "" : "s"} short in the next {summary.horizonDays} days
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              Stock, reservations and reorder exposure across the network, resolved against every open work order due
              inside the horizon. Red means an engine is already waiting; amber means the lead time still covers it.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#shortage-board"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Clear {blocking.length} blocking shortage{blocking.length === 1 ? "" : "s"}
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/execute/work-orders"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Work orders awaiting parts
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Blocking" value={formatNumber(summary.blockingLines)} tone="red" caption="lines holding work" />
            <HeroStat label="Short" value={formatNumber(summary.shortLines)} tone="amber" caption={`inside ${summary.horizonDays} days`} />
            <HeroStat label="Fill rate" value={`${summary.fillRatePct}%`} tone={summary.fillRatePct >= 90 ? "green" : "amber"} caption="planned demand covered" />
            <HeroStat label="Exposure" value={formatUsd(summary.exposureUsd)} tone="amber" caption="value of short stock" />
          </div>
        </div>
      </section>

      {/* Roll-up strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Inventory value"
          value={formatUsd(summary.totalValueUsd)}
          caption={`${formatNumber(summary.linesTracked)} stocked lines across ${facilitySummaries.length} facilities`}
        />
        <StatTile
          label="Stockouts"
          value={summary.stockoutLines}
          status={summary.stockoutLines > 0 ? "red" : "green"}
          caption="Part numbers at zero on hand"
        />
        <StatTile
          label="Serviceable rotables"
          value={pool.serviceable}
          status={pool.entriesBelowCover > 0 ? "amber" : "green"}
          caption={`${pool.entriesBelowCover} pools below planned cover`}
        />
        <StatTile
          label="Rotable turn time"
          value={pool.averageTurnDays}
          unit="days"
          status={pool.averageTurnDays > pool.targetTurnDays ? "amber" : "green"}
          caption={`Target ${pool.targetTurnDays} days shop-to-shelf`}
        />
        <StatTile
          label="Slow-mover capital"
          value={formatUsd(summary.slowMoverValueUsd)}
          status={summary.slowMoverValueUsd > 0 ? "amber" : "green"}
          caption={`${slowMoverLines.length} lines with no demand in ${INVENTORY_HORIZON_DAYS} days`}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-4">
        {/* Recommended actions */}
        <Panel className="xl:col-span-1">
          <PanelHeader title="Recommended actions" subtitle="Highest-impact recoveries first" />
          <ol className="space-y-3">
            {nextActions.map((line, index) => (
              <li
                key={line.position.id}
                className={cn("border-l-2 pl-3", line.position.status === "red" ? "border-l-status-red" : "border-l-status-amber")}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-snug text-rr-ink">
                    <span className="rr-numeric mr-1.5 text-rr-slate">{index + 1}</span>
                    {line.actionLabel}
                  </p>
                  <StatusPill status={line.position.status}>{line.position.status === "red" ? "Act now" : "Watch"}</StatusPill>
                </div>
                <p className="rr-numeric mt-1 text-[11px] text-rr-slate">
                  {line.position.partNumber} · {line.position.facilityIcao} ·{" "}
                  {line.position.daysToFirstNeed === null
                    ? "no date"
                    : line.position.daysToFirstNeed === 0
                      ? "needed now"
                      : `need in ${line.position.daysToFirstNeed}d`}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{line.position.reason}</p>
              </li>
            ))}
          </ol>
        </Panel>

        {/* Facility cover */}
        <Panel className="xl:col-span-3">
          <PanelHeader
            title="Cover by facility"
            subtitle="Share of planned demand coverable from stock on hand, with value held"
          />
          <ul className="space-y-3">
            {facilitySummaries.map((facility) => (
              <li key={facility.facilityId} className="flex items-center gap-4">
                <div className="w-52 shrink-0">
                  <p className="text-[13px] font-medium text-rr-ink">
                    <span className="rr-numeric mr-1.5">{facility.icao}</span>
                    {facility.name}
                  </p>
                  <p className="text-[11px] text-rr-slate">
                    {facility.lines} lines · {formatUsd(facility.valueUsd)} held
                  </p>
                </div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-rr-mist">
                  <div
                    className={cn("h-full rounded-full", statusStyles[facility.status].dot)}
                    style={{ width: `${facility.fillRatePct}%` }}
                  />
                </div>
                <div className="rr-numeric w-16 shrink-0 text-right text-[13px] font-semibold text-rr-ink">
                  {facility.fillRatePct}%
                </div>
                <div className="w-36 shrink-0 text-right text-[11px] text-rr-slate">
                  {facility.blockingLines > 0 ? (
                    <span className="font-semibold text-status-red">{facility.blockingLines} blocking</span>
                  ) : facility.shortLines > 0 ? (
                    <span className="text-status-amber">{facility.shortLines} short</span>
                  ) : (
                    <span className="text-status-green">Fully covered</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Shortage board */}
      <section id="shortage-board" className="scroll-mt-6">
        <ShortageBoard shortages={shortages} facilities={facilities} horizonDays={summary.horizonDays} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Rotable pool */}
        <Panel className="xl:col-span-1">
          <PanelHeader
            title="Rotable pool"
            subtitle="Repairable assets cycling shop-to-shelf"
            actions={<StatusPill status={pool.entriesBelowCover > 0 ? "amber" : "green"}>{poolCoverPct}% serviceable</StatusPill>}
          />
          <ConditionMixBar
            serviceable={pool.serviceable}
            unserviceable={pool.unserviceable}
            inRepair={pool.inRepair}
            inTransit={pool.inTransit}
            className="h-3"
          />
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <PoolStat label="Serviceable" value={pool.serviceable} tone="text-status-green" />
            <PoolStat label="Unserviceable" value={pool.unserviceable} tone="text-status-red" />
            <PoolStat label="In repair" value={pool.inRepair} tone="text-status-amber" />
            <PoolStat label="In transit" value={pool.inTransit} tone="text-rr-blue" />
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-rr-slate">
            {pool.entriesBelowCover} pool{pool.entriesBelowCover === 1 ? "" : "s"} sit below the serviceable count needed
            for planned removals; average repair turn time is {pool.averageTurnDays} days against a{" "}
            {pool.targetTurnDays}-day target.
          </p>
        </Panel>

        {/* Value roll-up */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Inventory value roll-up"
            subtitle="Twelve-month holding value with the current split by engine module"
            actions={<span className="rr-numeric text-lg font-semibold text-rr-ink">{formatUsd(summary.totalValueUsd)}</span>}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <TrendChart series={valueSeries} height={168} showThresholds={false} />
            <ul className="space-y-2">
              {modules.slice(0, 8).map((module) => (
                <li key={module.moduleCode} className="flex items-center gap-3">
                  <span className="rr-label w-24 shrink-0 text-rr-slate">{module.moduleCode}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-rr-mist">
                    <div className="h-full rounded-full bg-rr-blue" style={{ width: `${(module.valueUsd / maxModuleValue) * 100}%` }} />
                  </div>
                  <span className="rr-numeric w-16 shrink-0 text-right text-[12px] font-semibold text-rr-ink">
                    {formatUsd(module.valueUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      {/* Detail */}
      <StockExplorer positions={positions} rotables={rotables} slowMoverLines={slowMoverLines} facilities={facilities} />

      <p className="text-[11px] leading-relaxed text-rr-slate">
        Demand is derived from the {formatNumber(data.workOrders.length)} work orders in the plan: every open work order
        scheduled inside {INVENTORY_HORIZON_DAYS} days consumes the parts on its task cards at the facility executing the
        work. Cover, shortfall and exposure are recomputed from that demand against live stock, reservations and inbound
        orders.
      </p>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: string; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{value}</p>
      <p className="text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}

function PoolStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="rr-label text-rr-slate">{label}</dt>
      <dd className={cn("rr-numeric text-2xl font-semibold", tone)}>{value}</dd>
    </div>
  );
}
