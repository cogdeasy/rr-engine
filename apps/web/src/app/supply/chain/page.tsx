import Link from "next/link";
import {
  criticalPartRegister,
  expediteOptions,
  openPurchaseOrders,
  shortageRisks,
  supplierPerformance,
  supplyChainSummary,
  SUPPLY_CHAIN_HORIZON_DAYS,
  NOW,
} from "@rr/data";
import {
  Badge,
  Gauge,
  Panel,
  PanelHeader,
  SectionHeading,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { CoverageHorizon } from "@/components/supply-chain/coverage-horizon";
import { ExpediteBoard } from "@/components/supply-chain/expedite-board";
import { SupplyWorkbench } from "@/components/supply-chain/supply-workbench";

export const metadata = { title: "Supply chain" };

export default function SupplyChainPage() {
  const horizon = SUPPLY_CHAIN_HORIZON_DAYS;
  const summary = supplyChainSummary(horizon);
  const shortages = shortageRisks(horizon);
  const critical = shortages.filter((s) => s.status === "red");
  const expedites = expediteOptions(horizon);
  const recommended = expedites.filter((e) => e.recommendation === "expedite").slice(0, 3);
  const suppliers = supplierPerformance();
  const orders = openPurchaseOrders();
  const register = criticalPartRegister();

  const worstSuppliers = [...suppliers].sort((a, b) => b.criticalShortageCount - a.criticalShortageCount).slice(0, 5);
  const maxSupplierShortages = Math.max(1, ...worstSuppliers.map((s) => s.criticalShortageCount));

  const byFacility = [...new Map(critical.map((s) => [s.facilityId, s.facilityName])).entries()]
    .map(([facilityId, facilityName]) => {
      const rows = critical.filter((s) => s.facilityId === facilityId);
      return {
        facilityId,
        facilityName,
        count: rows.length,
        delayDays: rows.reduce((sum, r) => sum + r.projectedDelayDays, 0),
        exposureUsd: rows.reduce((sum, r) => sum + r.delayCostUsd, 0),
      };
    })
    .sort((a, b) => b.exposureUsd - a.exposureUsd)
    .slice(0, 5);

  // One line per work order — the worst shortage on it — so the horizon reads as shop visits, not parts.
  const worstPerWorkOrder = new Map<string, (typeof critical)[number]>();
  for (const shortage of critical) {
    const held = worstPerWorkOrder.get(shortage.workOrderId);
    if (!held || shortage.projectedDelayDays > held.projectedDelayDays) worstPerWorkOrder.set(shortage.workOrderId, shortage);
  }
  const timeline = [...worstPerWorkOrder.values()]
    .sort((a, b) => b.projectedDelayDays - a.projectedDelayDays || a.daysToRequired - b.daysToRequired)
    .slice(0, 14);
  const singleSourceCritical = critical.filter((s) => s.singleSource).length;
  const decideThisWeek = critical.filter((s) => s.daysToRequired <= 7).length;

  return (
    <div className="space-y-7">
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        {/* Grid lines sit on their own layer: `.rr-grid-lines` sets background-image, which would
            otherwise win over the `background` shorthand of `.rr-hero-gradient`. */}
        <span className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Supply chain · material control</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {summary.shopVisitsAtRisk} shop visits slip in the next {horizon} days unless material moves
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {summary.criticalShortages} part shortages land after they are needed on dock, exposing{" "}
              {formatNumber(summary.delayDaysExposed)} days of turn-around and {formatUsd(summary.delayCostExposureUsd)} of delay cost.
              Committing {formatUsd(summary.expediteCostUsd)} of expedites recovers a net {formatUsd(summary.netBenefitUsd)}.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="#recommended-actions"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {recommended.length} recommended expedites
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/supply/inventory"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Stock positions
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat label="Decide this week" value={decideThisWeek} tone="red" caption="required on dock ≤ 7 days" />
            <HeroStat label="Shortages" value={summary.criticalShortages} tone="red" caption={`of ${summary.shortages} lines at risk`} />
            <HeroStat label="Sole-sourced" value={singleSourceCritical} tone="amber" caption="no alternate approved" />
            <HeroStat label="Late orders" value={summary.latePoCount} tone="amber" caption={`of ${summary.openPoCount} open`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StatTile
          label="Turn-around days exposed"
          value={formatNumber(summary.delayDaysExposed)}
          status="red"
          caption={`Across ${summary.shopVisitsAtRisk} work orders inside ${horizon} days`}
        />
        <StatTile
          label="Delay cost exposure"
          value={formatUsd(summary.delayCostExposureUsd)}
          status="red"
          caption="Liquidated damages plus lost availability"
        />
        <StatTile
          label="Expedite cost to recover"
          value={formatUsd(summary.expediteCostUsd)}
          status="amber"
          caption={`Net benefit ${formatUsd(summary.netBenefitUsd)} if committed`}
        />
        <StatTile
          label="Supplier on-time delivery"
          value={`${summary.fleetOnTimeDeliveryPct}%`}
          status={summary.fleetOnTimeDeliveryPct < 85 ? "red" : summary.fleetOnTimeDeliveryPct < 94 ? "amber" : "green"}
          caption={`${summary.singleSourceParts} sole-sourced · ${summary.longLeadParts} long-lead parts`}
        />
      </section>

      <section id="recommended-actions" className="space-y-4 scroll-mt-6">
        <SectionHeading
          eyebrow="Recommended action"
          title="Expedites that pay for themselves"
          description="Ranked by net benefit: the delay cost removed less the cost of recovery. Everything here is a red shortage with a credible recovery inside the required-on-dock date."
          actions={<Badge variant="brand">{expedites.length} options evaluated</Badge>}
        />
        <ExpediteBoard options={recommended} nowIso={NOW.toISOString()} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Material horizon"
            subtitle="Worst-hit shop visits first, one line per work order — the red overhang is the delay the shortage causes"
            actions={
              <Badge variant="outline">
                Top {timeline.length} of {worstPerWorkOrder.size} work orders
              </Badge>
            }
          />
          <CoverageHorizon shortages={timeline} horizonDays={horizon} />
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Supplier on-time delivery" subtitle="Weighted across the open order book" />
            <div className="flex items-center gap-6">
              <Gauge
                value={summary.fleetOnTimeDeliveryPct}
                status={summary.fleetOnTimeDeliveryPct < 85 ? "red" : summary.fleetOnTimeDeliveryPct < 94 ? "amber" : "green"}
                label="OTD %"
                size={124}
              />
              <ul className="min-w-0 flex-1 space-y-2">
                {worstSuppliers.map((supplier) => (
                  <li key={supplier.supplier}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-rr-ink">{supplier.supplier}</span>
                      <span className={cn("rr-numeric font-semibold", statusStyles[supplier.status].text)}>
                        {supplier.criticalShortageCount}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                      <div
                        className={cn("h-full rounded-full", statusStyles[supplier.status].dot)}
                        style={{ width: `${(supplier.criticalShortageCount / maxSupplierShortages) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
              Bars show how many red shortages each supplier is driving. Red suppliers are below 85% on-time delivery or above 7.5
              quality escapes per thousand parts received.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Exposure by shop" subtitle="Where the delay cost lands" />
            <ul className="divide-y divide-rr-ink/8">
              {byFacility.map((facility) => (
                <li key={facility.facilityId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-rr-ink">{facility.facilityName}</p>
                    <p className="rr-numeric text-[11px] text-rr-slate">
                      {facility.count} shortages · {formatNumber(facility.delayDays)} delay days
                    </p>
                  </div>
                  <span className="rr-numeric text-sm font-semibold text-status-red">{formatUsd(facility.exposureUsd)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Why is this red?" />
            <ul className="space-y-2 text-xs leading-relaxed text-rr-slate">
              <li className="flex gap-2">
                <StatusPill status="red">Red</StatusPill>
                <span>Earliest cover date falls after the required-on-dock date — the work order slips by that many days.</span>
              </li>
              <li className="flex gap-2">
                <StatusPill status="amber">Amber</StatusPill>
                <span>Cover lands inside five days of need, or the supplier has notified slip against its promise.</span>
              </li>
              <li className="flex gap-2">
                <StatusPill status="green">Green</StatusPill>
                <span>Stock on the shelf or an order landing with float to spare.</span>
              </li>
              <li className="flex gap-2">
                <StatusPill status="grey">No data</StatusPill>
                <span>Catalogue part with no demand inside the {horizon}-day horizon.</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="Working detail"
          title="Shortage, order and supplier book"
          description="Every line traces back to a task card on an open work order; cover comes from facility stock and the open purchase order book."
        />
        <SupplyWorkbench shortages={shortages} orders={orders} suppliers={suppliers} register={register} />
      </section>
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
      <p className="rr-label text-rr-cloud/60">{label}</p>
      <p className={cn("rr-numeric mt-1 text-4xl font-semibold", colour)}>{formatNumber(value)}</p>
      <p className="mt-1 text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
