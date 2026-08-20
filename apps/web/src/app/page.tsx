import Link from "next/link";
import {
  Badge,
  Gauge,
  KpiTile,
  Panel,
  PanelHeader,
  StatusPill,
  StatTile,
  formatNumber,
  formatUsd,
  relativeTime,
  statusStyles,
  cn,
} from "@rr/ui";
import { fleetSummary, getDataset, getOpenAlerts } from "@rr/data";
import { ModuleIcon } from "@/components/icon";
import { WatchlistTable } from "@/components/fleet-overview/watchlist-table";

export default function FleetOverviewPage() {
  const data = getDataset();
  const summary = fleetSummary();
  const openAlerts = getOpenAlerts();
  const alerts = openAlerts.slice(0, 6);

  const watchlist = [...data.engines]
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 8)
    .map((engine) => ({
      engine,
      operator: data.operators.find((o) => o.id === engine.operatorId),
      aircraft: data.aircraft.find((a) => a.id === engine.aircraftId),
      alerts: openAlerts.filter((a) => a.engineId === engine.id).length,
    }));

  const byOperator = data.operators
    .map((operator) => {
      const engines = data.engines.filter((e) => e.operatorId === operator.id);
      const red = engines.filter((e) => e.status === "red").length;
      const amber = engines.filter((e) => e.status === "amber").length;
      return { operator, total: engines.length, red, amber, green: engines.length - red - amber };
    })
    .sort((a, b) => b.red - a.red || b.amber - a.amber)
    .slice(0, 7);

  const upcoming = [...data.workOrders]
    .filter((w) => w.state !== "complete" && w.state !== "cancelled")
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="space-y-12">
      {/* Masthead — white, editorial, RR blue rule */}
      <section>
        <div className="border-t-2 border-rr-blue pt-8">
          <p className="rr-label text-rr-blue">Fleet services operations centre</p>
          <h1 className="rr-display mt-5 max-w-4xl text-rr-ink">
            {formatNumber(summary.engines)} engines under management.
            <br />
            <span className="text-rr-slate">{summary.byStatus.red} flagged red this morning.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-rr-slate">
            Live engine health, prognostics and maintenance execution across the managed Trent and UltraFan fleet.
            Every red condition here has an owner, a recommended action and a deadline.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/alerts"
              className="inline-flex items-center gap-2 rounded-full bg-rr-blue px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-rr-blue-600"
            >
              Triage {summary.openAlerts} open alerts
              <span aria-hidden>›</span>
            </Link>
            <Link
              href="/engines"
              className="inline-flex items-center gap-2 rounded-full border border-rr-ink/20 px-7 py-3 text-sm font-semibold text-rr-ink transition-colors hover:border-rr-blue hover:text-rr-blue"
            >
              Engine explorer
            </Link>
          </div>
        </div>

        <div className="mt-12 grid divide-y divide-rr-ink/10 border-y border-rr-ink/10 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x xl:divide-rr-ink/10">
          <HeroStat label="Red" value={summary.byStatus.red} tone="red" caption="immediate action" />
          <HeroStat label="Amber" value={summary.byStatus.amber} tone="amber" caption="on watchlist" />
          <HeroStat label="Green" value={summary.byStatus.green} tone="green" caption="within limits" />
          <HeroStat label="AOG" value={summary.aogAircraft} tone="red" caption="aircraft grounded" />
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {data.kpis.slice(0, 5).map((kpi) => (
          <KpiTile key={kpi.id} kpi={kpi} />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        <StatTile label="Average EGT margin" value={summary.averageEgtMargin} unit="°C" status={summary.averageEgtMargin < 30 ? "amber" : "green"} caption="Fleet mean, all build standards" />
        <StatTile label="Open work orders" value={summary.activeWorkOrders} status="amber" caption="In progress or awaiting parts" />
        <StatTile label="Critical alerts" value={summary.criticalAlerts} status={summary.criticalAlerts > 0 ? "red" : "green"} caption="Action required inside 48h" />
        <StatTile label="Managed operators" value={summary.operators} caption={`${summary.aircraft} aircraft`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Watchlist */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Engine watchlist"
            subtitle="Lowest health scores across the managed fleet, ranked by deterioration"
            actions={
              <Link href="/engines" className="text-xs font-semibold text-rr-blue hover:underline">
                All engines ›
              </Link>
            }
          />
          <WatchlistTable
            rows={watchlist.map(({ engine, operator, aircraft, alerts: count }) => ({
              engineId: engine.id,
              esn: engine.esn,
              family: engine.family,
              tail: aircraft?.tail ?? "off wing",
              operator: operator?.name ?? "Unassigned",
              egtMargin: engine.egtMargin,
              rulCycles: engine.rulCycles,
              alerts: count,
              healthScore: engine.healthScore,
              status: engine.status,
            }))}
          />
        </Panel>

        {/* Alerts */}
        <Panel>
          <PanelHeader
            title="Priority alerts"
            subtitle="Highest severity, awaiting disposition"
            actions={
              <Link href="/alerts" className="text-xs font-semibold text-rr-blue hover:underline">
                Triage ›
              </Link>
            }
          />
          <ul className="space-y-3">
            {alerts.map((alert) => {
              const engine = data.engines.find((e) => e.id === alert.engineId);
              return (
                <li key={alert.id} className={cn("border-l-2 pl-3", statusStyles[alert.status].border.replace("border-", "border-l-"))}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium leading-snug text-rr-ink">{alert.title}</p>
                    <StatusPill status={alert.status}>{alert.severity}</StatusPill>
                  </div>
                  <p className="mt-1 text-[11px] text-rr-slate">
                    {alert.source} · ATA {alert.ataChapter} · {engine?.family} · {relativeTime(alert.raisedAt)}
                    {alert.timeToActionHours !== null ? ` · action within ${alert.timeToActionHours}h` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Operator status */}
        <Panel className="xl:col-span-2">
          <PanelHeader title="Status by operator" subtitle="Engine condition distribution for the top exposure customers" />
          <ul className="space-y-3">
            {byOperator.map(({ operator, total, red, amber, green }) => (
              <li key={operator.id} className="flex items-center gap-4">
                <div className="w-44 shrink-0">
                  <p className="text-[13px] font-medium text-rr-ink">{operator.name}</p>
                  <p className="text-[11px] text-rr-slate">
                    {operator.code} · {operator.region}
                  </p>
                </div>
                <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-rr-mist">
                  {red > 0 ? <div className="bg-status-red" style={{ width: `${(red / total) * 100}%` }} /> : null}
                  {amber > 0 ? <div className="bg-status-amber" style={{ width: `${(amber / total) * 100}%` }} /> : null}
                  {green > 0 ? <div className="bg-status-green" style={{ width: `${(green / total) * 100}%` }} /> : null}
                </div>
                <div className="rr-numeric w-28 shrink-0 text-right text-[11px] text-rr-slate">
                  <span className="font-semibold text-status-red">{red}</span> / <span className="font-semibold text-status-amber">{amber}</span> / {total}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Fleet health gauge */}
        <Panel className="flex flex-col items-center justify-center gap-4">
          <PanelHeader title="Fleet health index" subtitle="Weighted mean of engine health scores" className="w-full" />
          <Gauge value={summary.averageHealthScore} status={summary.averageHealthScore > 70 ? "green" : summary.averageHealthScore > 50 ? "amber" : "red"} label="index" size={150} />
          <div className="grid w-full grid-cols-3 gap-2 text-center">
            {(["red", "amber", "green"] as const).map((status) => (
              <div key={status} className={cn("rounded-sm px-2 py-2", statusStyles[status].bg)}>
                <p className={cn("rr-numeric text-lg font-semibold", statusStyles[status].text)}>{summary.byStatus[status]}</p>
                <p className="rr-label text-rr-slate">{statusStyles[status].label}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Upcoming maintenance */}
      <Panel>
        <PanelHeader
          title="Next maintenance events"
          subtitle="Scheduled removals, shop visits and inspections across the network"
          actions={
            <Link href="/plan/schedule" className="text-xs font-semibold text-rr-blue hover:underline">
              Full schedule ›
            </Link>
          }
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((wo) => {
            const engine = data.engines.find((e) => e.id === wo.engineId);
            const facility = data.facilities.find((f) => f.id === wo.facilityId);
            return (
              <div key={wo.id} className="rounded-sm border border-rr-ink/8 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-rr-ink">{wo.reference}</p>
                    <p className="text-[11px] text-rr-slate">
                      {engine?.esn} · {wo.type.replace("-", " ")}
                    </p>
                  </div>
                  <StatusPill status={wo.status}>{wo.priority}</StatusPill>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-rr-slate">
                  <div>
                    <dt className="rr-label">Start</dt>
                    <dd className="rr-numeric text-rr-ink">{new Date(wo.scheduledStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</dd>
                  </div>
                  <div>
                    <dt className="rr-label">TAT</dt>
                    <dd className="rr-numeric text-rr-ink">{wo.tatDays} days</dd>
                  </div>
                  <div>
                    <dt className="rr-label">Facility</dt>
                    <dd className="text-rr-ink">{facility?.icao}</dd>
                  </div>
                  <div>
                    <dt className="rr-label">Estimate</dt>
                    <dd className="rr-numeric text-rr-ink">{formatUsd(wo.estimatedCostUsd)}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-4 bg-rr-blue-50/60">
        <div className="flex items-center gap-3">
          <ModuleIcon name="cube" className="h-5 w-5 text-rr-blue" />
          <div>
            <p className="text-sm font-semibold text-rr-ink">Explore the interactive engine twin</p>
            <p className="text-xs text-rr-slate">Official Rolls-Royce 3D geometry with module-level health overlays.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="brand">Trent XWB</Badge>
          <Badge variant="brand">Trent 1000 TEN</Badge>
          <Badge variant="brand">Trent 7000</Badge>
          <Badge variant="brand">UltraFan</Badge>
          <Link href="/engines/EN-0001" className="ml-2 text-xs font-semibold text-rr-blue hover:underline">
            Open twin ›
          </Link>
        </div>
      </Panel>
    </div>
  );
}

function HeroStat({ label, value, tone, caption }: { label: string; value: number; tone: "red" | "amber" | "green"; caption: string }) {
  const colour = { red: "text-status-red", amber: "text-status-amber", green: "text-status-green" }[tone];
  const dot = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green" }[tone];
  return (
    <div className="px-1 py-7 xl:px-8 xl:first:pl-0">
      <p className="rr-label flex items-center gap-2 text-rr-slate">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-4 text-5xl font-semibold leading-none", colour)}>{value}</p>
      <p className="mt-3 text-[11px] text-rr-slate">{caption}</p>
    </div>
  );
}

export const metadata = { title: "Fleet overview" };
