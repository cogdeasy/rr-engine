import Link from "next/link";
import type { StatusLevel } from "@rr/types";
import { COST_CATEGORIES } from "@rr/types";
import { costAnalytics, costCategoryLabel } from "@rr/data";
import {
  Badge,
  CostBridgeChart,
  CostForecastChart,
  CostMixBar,
  Panel,
  PanelHeader,
  StatTile,
  StatusPill,
  cn,
  formatNumber,
  formatUsd,
  statusStyles,
} from "@rr/ui";
import { AogExposureTable } from "@/components/costs/aog-exposure-table";
import { BudgetTable } from "@/components/costs/budget-table";
import { DriverTable } from "@/components/costs/driver-table";
import { OperatorCostTable } from "@/components/costs/operator-cost-table";

export const metadata = { title: "Cost analytics" };

export default function CostAnalyticsPage() {
  const analytics = costAnalytics();
  const { current, prior, months, bridge, forecast, drivers, operators, families, budget, aog, actions, tolerance } = analytics;

  const variancePct = ((current.costPerEfh - current.budgetPerEfh) / current.budgetPerEfh) * 100;
  const fleetStatus = variancePct >= tolerance.redPct ? "red" : variancePct >= tolerance.amberPct ? "amber" : "green";
  const deltaVsPriorPct = ((current.costPerEfh - prior.costPerEfh) / prior.costPerEfh) * 100;
  const operatorsOverPlan = operators.filter((row) => row.variancePct >= tolerance.amberPct);
  const redOperators = operators.filter((row) => row.status === "red");
  const firstBreach = forecast.find((point) => point.status === "red");
  const annualisedGap = (current.costPerEfh - current.budgetPerEfh) * current.efh * 4;

  const mix = COST_CATEGORIES.map((category) => ({
    id: category,
    label: costCategoryLabel(category),
    valueUsd: current.cost[category],
    perEfh: current.cost[category] / Math.max(1, current.efh),
    deltaPct:
      ((current.cost[category] / Math.max(1, current.efh) - prior.cost[category] / Math.max(1, prior.efh)) /
        Math.max(0.01, prior.cost[category] / Math.max(1, prior.efh))) *
      100,
  })).sort((a, b) => b.valueUsd - a.valueUsd);

  const categoryBudget = budget.filter((row) => row.scope === "category");
  const operatorBudget = budget.filter((row) => row.scope === "operator");

  return (
    <div className="space-y-7">
      {/* Decision hero */}
      <section className="rr-hero-gradient relative overflow-hidden rounded-sm px-8 py-9 text-white">
        <div className="rr-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <p className="rr-label text-rr-blue-200">Commercial · Cost analytics</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              Fleet unit cost {formatNumber(current.costPerEfh, 0)} USD/EFH, {variancePct >= 0 ? "+" : ""}
              {variancePct.toFixed(1)}% against plan
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-cloud">
              {current.label} accrual across {formatNumber(operators.length)} managed operators. Drift is concentrated:{" "}
              {redOperators.length} operator{redOperators.length === 1 ? "" : "s"} beyond the {tolerance.redPct}% tolerance
              {firstBreach ? ` and the forecast breaches plan in ${firstBreach.label}` : " with the forecast inside plan"}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#operators"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
              >
                Review {operatorsOverPlan.length} operators over plan
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="#bridge"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Explain the movement
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <HeroStat
              label="Unit cost"
              value={formatNumber(current.costPerEfh, 0)}
              caption={`plan ${formatNumber(current.budgetPerEfh, 0)} USD/EFH`}
              tone={fleetStatus}
            />
            <HeroStat
              label="vs prior qtr"
              value={`${deltaVsPriorPct >= 0 ? "+" : ""}${deltaVsPriorPct.toFixed(1)}%`}
              caption={`${prior.label} baseline`}
              tone={deltaVsPriorPct > 0 ? "amber" : "green"}
            />
            <HeroStat label="Quarter spend" value={formatUsd(current.totalCostUsd)} caption={`${formatNumber(current.efh)} EFH flown`} />
            <HeroStat label="AOG exposure" value={formatUsd(aog.exposureUsd)} caption={`${aog.aircraftDown} aircraft grounded`} tone="red" />
          </div>
        </div>
      </section>

      {/* Recommended actions */}
      <section aria-label="Recommended actions" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => (
          <Panel key={action.id} className={cn("flex flex-col justify-between gap-4 border-l-2", statusStyles[action.status].border)}>
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="rr-label text-rr-slate">Recommended action</p>
                <StatusPill status={action.status}>{action.status === "red" ? "Act now" : "Watch"}</StatusPill>
              </div>
              <p className="mt-2 text-sm font-semibold leading-snug text-rr-ink">{action.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-rr-slate">{action.detail}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="rr-numeric text-sm font-semibold text-rr-ink">
                {formatUsd(action.impactUsd)} <span className="text-[11px] font-medium text-rr-slate">at stake</span>
              </span>
              <Link href={action.href} className="text-xs font-semibold text-rr-blue hover:underline">
                {action.action} ›
              </Link>
            </div>
          </Panel>
        ))}
      </section>

      {/* Stat strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Cost per EFH"
          value={formatNumber(current.costPerEfh, 0)}
          unit="USD"
          status={fleetStatus}
          caption={`Tolerance ±${tolerance.amberPct}% amber, ${tolerance.redPct}% red`}
        />
        <StatTile
          label="Annualised gap to plan"
          value={formatUsd(Math.abs(annualisedGap))}
          status={annualisedGap > 0 ? "amber" : "green"}
          caption={annualisedGap > 0 ? "Overspend if the quarter run rate holds" : "Underspend against plan"}
        />
        <StatTile
          label="Availability penalties"
          value={formatUsd(aog.penaltiesAccruedUsd)}
          status={aog.penaltiesAccruedUsd > 0 ? "amber" : "green"}
          caption="Accrued across the managed contract base"
        />
        <StatTile
          label="Operators over plan"
          value={`${operatorsOverPlan.length}/${operators.length}`}
          status={redOperators.length > 0 ? "red" : operatorsOverPlan.length > 0 ? "amber" : "green"}
          caption={`${redOperators.length} beyond the ${tolerance.redPct}% red tolerance`}
        />
      </section>

      {/* Bridge + mix */}
      <div id="bridge" className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Cost bridge, prior quarter to current"
            subtitle={`Every step is USD per engine flight hour. Red steps move unit cost by more than ${tolerance.amberPct}% on their own.`}
            actions={<Badge variant="brand">{`${prior.label} → ${current.label}`}</Badge>}
          />
          <CostBridgeChart steps={bridge} redStepPct={tolerance.amberPct} />
          <ul className="mt-4 grid gap-2 text-xs text-rr-slate sm:grid-cols-2">
            {bridge
              .filter((step) => step.kind === "delta")
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, 4)
              .map((step) => (
                <li key={step.id} className="flex gap-2 leading-relaxed">
                  <span
                    className={cn(
                      "rr-numeric shrink-0 font-semibold",
                      step.value > 0 ? "text-status-amber" : "text-status-green",
                    )}
                  >
                    {step.value >= 0 ? "+" : ""}
                    {step.value.toFixed(1)}
                  </span>
                  <span>{step.explanation}</span>
                </li>
              ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Where the money goes" subtitle={`${current.label} accrual by cost category, USD per EFH`} />
          <CostMixBar segments={mix} />
          <p className="mt-4 border-t border-rr-ink/8 pt-3 text-[11px] leading-relaxed text-rr-slate">
            Heavy maintenance and life-limited parts are accrued across the interval they buy, so the unit cost is comparable
            month to month even though the cash is lumpy.
          </p>
        </Panel>
      </div>

      {/* Forecast */}
      <Panel>
        <PanelHeader
          title="Twelve month forecast against plan"
          subtitle="Trailing actuals then a forecast band from the current trend and the heavy events already scheduled."
          actions={
            firstBreach ? (
              <StatusPill status="red">Plan breached in {firstBreach.label}</StatusPill>
            ) : (
              <StatusPill status="green">Inside plan for 12 months</StatusPill>
            )
          }
        />
        <CostForecastChart history={months.slice(-6)} forecast={forecast} />
        <div className="mt-4 grid gap-3 border-t border-rr-ink/8 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {forecast
            .filter((point) => point.scheduledEvents > 0)
            .slice(0, 4)
            .map((point) => (
              <div key={point.month} className="border-l border-rr-ink/8 pl-4 first:border-l-0 first:pl-0">
                <p className="rr-label text-rr-slate">{point.label}</p>
                <p className={cn("rr-numeric mt-1 text-lg font-semibold", statusStyles[point.status].text)}>
                  {formatNumber(point.costPerEfh, 0)}
                  <span className="ml-1 text-[11px] font-medium text-rr-slate">USD/EFH</span>
                </p>
                <p className="text-[11px] text-rr-slate">
                  {point.scheduledEvents} heavy events · {formatUsd(point.scheduledCostUsd)}
                </p>
              </div>
            ))}
        </div>
      </Panel>

      {/* Operators */}
      <section id="operators" className="space-y-3">
        <PanelHeader
          title="Cost per EFH by operator"
          subtitle={`Ranked by variance against each operator's own plan. Red is beyond the ${tolerance.redPct}% contractual tolerance.`}
        />
        <OperatorCostTable rows={operators} tolerancePct={tolerance.amberPct} />
      </section>

      {/* Drivers + families */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <PanelHeader
            title="Top cost drivers"
            subtitle="Unit economics behind the accrual: what each event costs, how often it happens and what it adds per EFH."
          />
          <DriverTable drivers={drivers} />
        </div>

        <Panel>
          <PanelHeader title="By engine family" subtitle="Unit cost against the plan implied by the certified overhaul interval" />
          <ul className="space-y-4">
            {families.map((family) => (
              <li key={family.family}>
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-rr-ink">{family.family}</p>
                    <p className="text-[11px] text-rr-slate">
                      {family.engines} engines · LLP {family.llpSharePct.toFixed(0)}% of spend
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="rr-numeric text-lg font-semibold text-rr-ink">{formatNumber(family.costPerEfh, 0)}</p>
                    <p className={cn("rr-numeric text-[11px] font-semibold", statusStyles[family.status].text)}>
                      {family.variancePct >= 0 ? "+" : ""}
                      {family.variancePct.toFixed(1)}% vs {formatNumber(family.budgetPerEfh, 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rr-mist">
                  <div
                    className={cn("h-full rounded-full", statusStyles[family.status].dot)}
                    style={{ width: `${Math.min(100, (family.costPerEfh / Math.max(...families.map((f) => f.costPerEfh))) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Budget vs actual */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <PanelHeader
            title="Budget versus actual, by category"
            subtitle={`${current.label} actual against the escalated plan. Red beyond ${tolerance.redPct}%.`}
          />
          <BudgetTable rows={categoryBudget} />
        </section>
        <section className="space-y-3">
          <PanelHeader title="Budget versus actual, worst operators" subtitle="The contracts carrying the fleet variance" />
          <BudgetTable rows={operatorBudget} />
        </section>
      </div>

      {/* AOG exposure */}
      <section className="space-y-3">
        <PanelHeader
          title="AOG and disruption exposure"
          subtitle="Grounded aircraft priced at the operator's daily disruption cost plus the availability penalty they trigger."
          actions={
            <Link href="/aog" className="text-xs font-semibold text-rr-blue hover:underline">
              AOG desk ›
            </Link>
          }
        />
        <AogExposureTable rows={aog.rows} />
      </section>

      <p className="text-[11px] leading-relaxed text-rr-slate">
        Accrual basis: shop visits and module swaps are amortised over the interval they buy, life-limited parts are charged per
        cycle against their certified limit, line and on-wing work is charged as it is flown, and availability penalties are
        attributed to the operator that earned them. Generated {new Date(analytics.generatedAt).toLocaleDateString("en-GB")}.
      </p>
    </div>
  );
}

function HeroStat({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: StatusLevel;
}) {
  return (
    <div>
      <p className="rr-label flex items-center gap-1.5 text-rr-cloud/70">
        {tone ? <span className={cn("h-1.5 w-1.5 rounded-full", statusStyles[tone].dot)} aria-hidden /> : null}
        {label}
      </p>
      <p className={cn("rr-numeric mt-1 text-3xl font-semibold", tone ? statusStyles[tone].text : "text-white")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}
