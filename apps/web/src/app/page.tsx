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
      {/* Hero — full-bleed dawn-above-cloud surface, editorial headline, translucent stat cards */}
      <section className="rr-hero-gradient relative -mx-10 -mt-12 overflow-hidden px-10 pb-10 pt-20 text-white xl:-mx-14 xl:px-14 xl:pt-28">
        <div className="rr-grid-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1600px]">
          <p className="rr-label text-rr-blue-200">Fleet services operations centre</p>
          <h1 className="rr-display mt-6 max-w-4xl text-white">
            {formatNumber(summary.engines)} engines under management.
            <br />
            <span className="text-white/55">{summary.byStatus.red} flagged red this morning.</span>
          </h1>
          <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-rr-cloud">
            Live engine health, prognostics and maintenance execution across the managed Trent and UltraFan fleet.
            Every red condition here has an owner, a recommended action and a deadline.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/alerts"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-rr-blue-deep transition-colors hover:bg-rr-cloud"
            >
              Triage {summary.openAlerts} open alerts
              <span aria-hidden>›</span>
            </Link>
            <Link
              href="/engines"
              className="inline-flex items-center gap-2 rounded-full border border-white/50 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Engine explorer
            </Link>
          </div>

          <div className="mt-20 grid gap-px overflow-hidden rounded-sm border border-white/15 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <HeroStat label="Red" value={summary.byStatus.red} tone="red" caption="immediate action" />
            <HeroStat label="Amber" value={summary.byStatus.amber} tone="amber" caption="on watchlist" />
            <HeroStat label="Green" value={summary.byStatus.green} tone="green" caption="within limits" />
            <HeroStat label="AOG" value={summary.aogAircraft} tone="red" caption="aircraft grounded" />
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="rr-label py-2 text-left text-rr-slate">Engine</th>
                  <th className="rr-label py-2 text-left text-rr-slate">Operator</th>
                  <th className="rr-label py-2 text-right text-rr-slate">EGT margin</th>
                  <th className="rr-label py-2 text-right text-rr-slate">Cycles left</th>
                  <th className="rr-label py-2 text-right text-rr-slate">Alerts</th>
                  <th className="rr-label py-2 text-right text-rr-slate">Health</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map(({ engine, operator, aircraft, alerts: count }) => (
                  <tr key={engine.id} className="border-b border-white/[0.06] last:border-0">
                    <td className={cn("py-3 pl-3 border-l-2", engine.status === "red" ? "border-status-red" : engine.status === "amber" ? "border-status-amber" : "border-status-green")}>
                      <Link href={`/engines/${engine.id}`} className="font-semibold text-rr-ink hover:text-rr-blue">
                        {engine.esn}
                      </Link>
                      <p className="text-[11px] text-rr-slate">
                        {engine.family} · {aircraft?.tail ?? "off wing"}
                      </p>
                    </td>
                    <td className="py-3 text-rr-slate">{operator?.name}</td>
                    <td className={cn("rr-numeric py-3 text-right font-semibold", engine.egtMargin < 12 ? "text-status-red" : engine.egtMargin < 25 ? "text-status-amber" : "text-rr-ink")}>
                      {engine.egtMargin}°C
                    </td>
                    <td className="rr-numeric py-3 text-right text-rr-slate">{formatNumber(engine.rulCycles)}</td>
                    <td className="rr-numeric py-3 text-right text-rr-slate">{count}</td>
                    <td className="py-3 text-right">
                      <StatusPill status={engine.status}>{engine.healthScore}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-white/10">
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
              <div key={wo.id} className="rounded-sm border border-white/10 bg-white/[0.02] p-5">
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

      <Panel className="flex flex-wrap items-center justify-between gap-4 border-rr-blue/30 bg-rr-blue-50">
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
    <div className="bg-white/[0.06] px-6 py-7 backdrop-blur-md">
      <p className="rr-label flex items-center gap-2 text-rr-cloud/70">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
      <p className={cn("rr-numeric mt-4 text-5xl font-semibold leading-none", colour)}>{value}</p>
      <p className="mt-3 text-[11px] text-rr-cloud/70">{caption}</p>
    </div>
  );
}

export const metadata = { title: "Fleet overview" };
