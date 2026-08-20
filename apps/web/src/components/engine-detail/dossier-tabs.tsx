"use client";

import * as React from "react";
import type { Alert, EngineDossier, LlpStatus, Prognostic, Series, TaskCard, WorkOrder } from "@rr/types";
import {
  Badge,
  Button,
  DataTable,
  Gauge,
  ModuleConditionCard,
  Panel,
  PanelHeader,
  ProgressBar,
  StatTile,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatDateTime,
  formatNumber,
  formatUsd,
  statusStyles,
  TrendChart,
  type Column,
} from "@rr/ui";

/**
 * The tabbed body of the engine dossier. Client-side because the tab strip and
 * the sortable tables are interactive; every value is passed in from the
 * deterministic dataset by the server component.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "alerts", label: "Alerts" },
  { id: "prognostics", label: "Prognostics" },
  { id: "maintenance", label: "Maintenance history" },
  { id: "llp", label: "LLP status" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DossierTabs({ dossier }: { dossier: EngineDossier }) {
  const [active, setActive] = React.useState<TabId>("overview");
  const openAlerts = dossier.alerts.filter((a) => a.state !== "closed" && a.state !== "false-positive");

  const counts: Record<TabId, number | undefined> = {
    overview: undefined,
    trends: dossier.trends.length,
    alerts: openAlerts.length,
    prognostics: dossier.prognostics.length,
    maintenance: dossier.workOrders.length,
    llp: dossier.llps.length,
  };

  return (
    <div className="space-y-5">
      <Tabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label, count: counts[tab.id] }))}
        active={active}
        onChange={(id) => setActive(id as TabId)}
      />
      {active === "overview" ? <OverviewTab dossier={dossier} /> : null}
      {active === "trends" ? <TrendsTab dossier={dossier} /> : null}
      {active === "alerts" ? <AlertsTab alerts={dossier.alerts} /> : null}
      {active === "prognostics" ? <PrognosticsTab prognostics={dossier.prognostics} /> : null}
      {active === "maintenance" ? <MaintenanceTab workOrders={dossier.workOrders} taskCards={dossier.taskCards} /> : null}
      {active === "llp" ? <LlpTab llps={dossier.llps} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab({ dossier }: { dossier: EngineDossier }) {
  const { engine, familyProfile, modules } = dossier;
  const marginStatus = engine.egtMargin < 15 ? "red" : engine.egtMargin < 30 ? "amber" : "green";
  const healthStatus = engine.healthScore < 60 ? "red" : engine.healthScore < 78 ? "amber" : "green";

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Headline health" subtitle={`Against a new-engine margin of ${familyProfile.newEgtMargin}°C`} />
          <div className="flex items-center justify-around gap-4 pb-2">
            <div className="text-center">
              <Gauge value={engine.egtMargin} max={familyProfile.newEgtMargin} status={marginStatus} label="EGT margin °C" />
            </div>
            <div className="text-center">
              <Gauge value={engine.healthScore} status={healthStatus} label="Health score" />
            </div>
          </div>
          <p className="border-t border-rr-ink/8 pt-3 text-xs leading-relaxed text-rr-slate">
            {familyProfile.blurb}
          </p>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile label="Total flight hours" value={formatNumber(engine.totalFlightHours)} caption="Since new" />
          <StatTile label="Total cycles" value={formatNumber(engine.totalFlightCycles)} caption="Since new" />
          <StatTile
            label="Hours since overhaul"
            value={formatNumber(engine.hoursSinceOverhaul)}
            caption={`${formatNumber(engine.cyclesSinceOverhaul)} cycles since shop visit`}
          />
          <StatTile
            label="Remaining useful life"
            value={formatNumber(engine.rulCycles)}
            unit="cyc"
            status={engine.rulCycles < 800 ? "red" : engine.rulCycles < 2000 ? "amber" : "green"}
            caption={`${formatNumber(dossier.cyclesToOverhaulInterval)} cycles to the ${formatNumber(familyProfile.overhaulIntervalCycles)}-cycle interval`}
          />
          <StatTile
            label="Environment severity"
            value={`${engine.environmentSeverity}/5`}
            status={engine.environmentSeverity >= 4 ? "amber" : "green"}
            caption={engine.environmentSeverity >= 4 ? "Harsh, dust-laden routes" : "Benign route mix"}
          />
          <StatTile label="Thrust rating" value={engine.thrustRating} caption={`${formatNumber(familyProfile.thrustLbf)} lbf class`} />
          <StatTile label="Build standard" value={engine.buildStandard} caption={`Life stage: ${engine.lifeStage}`} />
          <StatTile label="Location" value={engine.location} caption={engine.installedAt ? `Installed ${formatDate(engine.installedAt)}` : "Off-wing"} />
          <StatTile
            label="Fan diameter"
            value={familyProfile.fanDiameterIn}
            unit="in"
            caption={`Bypass ratio ${familyProfile.bypassRatio}:1 · EIS ${familyProfile.entryIntoService}`}
          />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between">
          <p className="rr-label text-rr-slate">Module condition · worst first</p>
          <p className="text-[11px] text-rr-slate">Colour is driven by open alerts, live parameters and life consumed</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((mod) => (
            <Panel key={mod.code}>
              <ModuleConditionCard condition={mod} />
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trends                                                              */
/* ------------------------------------------------------------------ */

function trendStatus(series: Series): "red" | "amber" | "green" {
  const last = series.points[series.points.length - 1]?.v;
  if (last === undefined) return "green";
  const higherIsWorse = (series.redThreshold ?? 0) >= (series.amberThreshold ?? 0);
  if (series.redThreshold !== undefined && (higherIsWorse ? last >= series.redThreshold : last <= series.redThreshold)) return "red";
  if (series.amberThreshold !== undefined && (higherIsWorse ? last >= series.amberThreshold : last <= series.amberThreshold)) return "amber";
  return "green";
}

function TrendsTab({ dossier }: { dossier: EngineDossier }) {
  const flightColumns: Column<EngineDossier["recentFlights"][number]>[] = [
    { key: "flight", header: "Flight", render: (f) => <span className="font-medium text-rr-ink">{f.flightNumber}</span>, sortValue: (f) => f.flightNumber },
    { key: "sector", header: "Sector", render: (f) => `${f.origin} → ${f.destination}` },
    { key: "departed", header: "Departed", render: (f) => formatDateTime(f.departedAt), sortValue: (f) => f.departedAt },
    { key: "block", header: "Block hrs", align: "right", render: (f) => <span className="rr-numeric">{f.blockHours.toFixed(1)}</span>, sortValue: (f) => f.blockHours },
    { key: "derate", header: "Derate", align: "right", render: (f) => <span className="rr-numeric">{f.derate}%</span>, sortValue: (f) => f.derate },
    { key: "oat", header: "OAT", align: "right", render: (f) => <span className="rr-numeric">{f.outsideAirTempC}°C</span>, sortValue: (f) => f.outsideAirTempC },
    {
      key: "exposure",
      header: "Env. exposure",
      align: "right",
      sortValue: (f) => f.environmentalExposure,
      render: (f) => (
        <div className="ml-auto flex w-28 items-center gap-2">
          <ProgressBar value={f.environmentalExposure * 100} status={f.environmentalExposure > 0.6 ? "amber" : "green"} />
          <span className="rr-numeric text-[11px] text-rr-slate">{Math.round(f.environmentalExposure * 100)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        {dossier.trends.map((series) => {
          const status = trendStatus(series);
          const last = series.points[series.points.length - 1]?.v ?? 0;
          return (
            <Panel key={series.id}>
              <PanelHeader
                title={series.label}
                subtitle={`Last 180 days · amber ${series.amberThreshold ?? "—"} / red ${series.redThreshold ?? "—"} ${series.unit}`}
                actions={
                  <span className={cn("rr-numeric text-xl font-semibold", statusStyles[status].text)}>
                    {formatNumber(last, Number.isInteger(last) ? 0 : 2)}
                    <span className="ml-1 text-xs font-medium text-rr-slate">{series.unit}</span>
                  </span>
                }
              />
              <TrendChart series={series} height={180} />
            </Panel>
          );
        })}
      </div>
      <div>
        <p className="rr-label mb-3 text-rr-slate">Recent flights</p>
        <DataTable
          columns={flightColumns}
          rows={dossier.recentFlights}
          rowKey={(f) => f.id}
          initialSortKey="departed"
          emptyMessage="No recent sectors — this engine is off-wing."
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

function AlertsTab({ alerts }: { alerts: Alert[] }) {
  const columns: Column<Alert>[] = [
    { key: "status", header: "State", width: "110px", render: (a) => <StatusPill status={a.status}>{a.severity}</StatusPill>, sortValue: (a) => a.status },
    {
      key: "title",
      header: "Finding",
      render: (a) => (
        <div className="max-w-md">
          <p className="font-medium text-rr-ink">{a.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-rr-slate">{a.description}</p>
        </div>
      ),
      sortValue: (a) => a.title,
    },
    { key: "source", header: "Source", render: (a) => <Badge variant="outline">{a.source}</Badge> },
    { key: "ata", header: "ATA", render: (a) => <span className="rr-numeric">{a.ataChapter}</span>, sortValue: (a) => a.ataChapter },
    { key: "raised", header: "Raised", render: (a) => formatDateTime(a.raisedAt), sortValue: (a) => a.raisedAt },
    {
      key: "due",
      header: "Action due",
      align: "right",
      sortValue: (a) => a.timeToActionHours ?? 1e9,
      render: (a) =>
        a.timeToActionHours === null ? (
          <span className="text-rr-slate">—</span>
        ) : (
          <span className={cn("rr-numeric font-semibold", a.timeToActionHours <= 24 ? "text-status-red" : "text-rr-ink")}>
            {a.timeToActionHours}h
          </span>
        ),
    },
    { key: "workflow", header: "Workflow", render: (a) => <Badge>{a.state}</Badge> },
    {
      key: "action",
      header: "Recommended action",
      render: (a) => <span className="text-xs text-rr-slate">{a.recommendedAction}</span>,
    },
  ];

  return (
    <DataTable columns={columns} rows={alerts} rowKey={(a) => a.id} initialSortKey="raised" emptyMessage="No alerts raised against this engine." />
  );
}

/* ------------------------------------------------------------------ */
/* Prognostics                                                         */
/* ------------------------------------------------------------------ */

function PrognosticsTab({ prognostics }: { prognostics: Prognostic[] }) {
  if (prognostics.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-rr-slate">No prognostic models have flagged this engine.</p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {prognostics.map((p) => {
        const status = p.probability > 0.6 ? "red" : p.probability > 0.35 ? "amber" : "green";
        return (
          <Panel key={p.id}>
            <PanelHeader
              title={p.failureMode}
              subtitle={`${p.moduleCode} · model ${p.modelVersion} · computed ${formatDate(p.computedAt)}`}
              actions={<StatusPill status={status}>{Math.round(p.probability * 100)}%</StatusPill>}
            />
            <div className="grid grid-cols-3 gap-4 border-b border-rr-ink/8 pb-4">
              <div>
                <p className="rr-label text-rr-slate">Horizon</p>
                <p className="rr-numeric text-xl font-semibold text-rr-ink">{formatNumber(p.horizonCycles)}</p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">RUL</p>
                <p className={cn("rr-numeric text-xl font-semibold", statusStyles[status].text)}>{formatNumber(p.rulCycles)}</p>
              </div>
              <div>
                <p className="rr-label text-rr-slate">80% CI</p>
                <p className="rr-numeric text-xl font-semibold text-rr-ink">
                  {formatNumber(p.confidenceInterval.min)}–{formatNumber(p.confidenceInterval.max)}
                </p>
              </div>
            </div>
            <div className="pt-4">
              <p className="rr-label text-rr-slate">Model drivers</p>
              <ul className="mt-3 space-y-2.5">
                {p.drivers.map((driver) => (
                  <li key={driver.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-rr-ink">{driver.label}</span>
                      <span className="rr-numeric text-rr-slate">{Math.round(driver.contribution * 100)}%</span>
                    </div>
                    <ProgressBar className="mt-1" value={driver.contribution * 100} status={status} />
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance history                                                 */
/* ------------------------------------------------------------------ */

function MaintenanceTab({ workOrders, taskCards }: { workOrders: WorkOrder[]; taskCards: TaskCard[] }) {
  const [selected, setSelected] = React.useState<string | null>(workOrders[0]?.id ?? null);
  const cards = taskCards.filter((t) => t.workOrderId === selected);

  const columns: Column<WorkOrder>[] = [
    { key: "reference", header: "Reference", render: (w) => <span className="font-medium text-rr-ink">{w.reference}</span>, sortValue: (w) => w.reference },
    { key: "type", header: "Type", render: (w) => <Badge variant="outline">{w.type}</Badge> },
    { key: "state", header: "State", render: (w) => <StatusPill status={w.status}>{w.state}</StatusPill>, sortValue: (w) => w.state },
    { key: "scheduled", header: "Scheduled", render: (w) => `${formatDate(w.scheduledStart)} → ${formatDate(w.scheduledEnd)}`, sortValue: (w) => w.scheduledStart },
    { key: "tat", header: "TAT", align: "right", render: (w) => <span className="rr-numeric">{w.tatDays}d</span>, sortValue: (w) => w.tatDays },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      sortValue: (w) => w.actualCostUsd ?? w.estimatedCostUsd,
      render: (w) => <span className="rr-numeric">{formatUsd(w.actualCostUsd ?? w.estimatedCostUsd)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <DataTable
        columns={columns}
        rows={workOrders}
        rowKey={(w) => w.id}
        initialSortKey="scheduled"
        onRowClick={(w) => setSelected(w.id)}
        emptyMessage="No maintenance recorded against this engine."
      />
      {selected ? (
        <Panel>
          <PanelHeader
            title={`Task cards · ${workOrders.find((w) => w.id === selected)?.reference ?? ""}`}
            subtitle={`${cards.length} card${cards.length === 1 ? "" : "s"} — select another work order above to switch`}
          />
          {cards.length === 0 ? (
            <p className="text-sm text-rr-slate">No task cards on this work order.</p>
          ) : (
            <ul className="divide-y divide-rr-ink/8">
              {cards.map((card) => (
                <li key={card.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rr-ink">
                      {card.reference} · {card.title}
                    </p>
                    <p className="mt-0.5 text-xs text-rr-slate">
                      ATA {card.ataChapter}
                      {card.moduleCode ? ` · ${card.moduleCode}` : ""} · {card.skillRequired}
                      {card.signOffBy ? ` · signed off by ${card.signOffBy}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rr-numeric text-xs text-rr-slate">
                      {card.actualHours ?? card.estimatedHours}h
                    </span>
                    <Badge variant={card.state === "signed-off" ? "brand" : "neutral"}>{card.state}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LLP status                                                          */
/* ------------------------------------------------------------------ */

function LlpTab({ llps }: { llps: LlpStatus[] }) {
  const columns: Column<LlpStatus>[] = [
    { key: "part", header: "Part", render: (l) => <span className="rr-numeric font-medium text-rr-ink">{l.partNumber}</span>, sortValue: (l) => l.partNumber },
    { key: "serial", header: "Serial", render: (l) => <span className="rr-numeric">{l.serialNumber}</span>, sortValue: (l) => l.serialNumber },
    { key: "moduleCode", header: "Module", render: (l) => <Badge variant="outline">{l.moduleCode}</Badge>, sortValue: (l) => l.moduleCode },
    {
      key: "life",
      header: "Life used",
      sortValue: (l) => l.cyclesUsed / l.cyclicLimit,
      render: (l) => (
        <div className="flex w-52 items-center gap-3">
          <ProgressBar value={l.cyclesUsed} max={l.cyclicLimit} status={l.status} />
          <span className="rr-numeric text-[11px] text-rr-slate">{Math.round((l.cyclesUsed / l.cyclicLimit) * 100)}%</span>
        </div>
      ),
    },
    {
      key: "remaining",
      header: "Cycles remaining",
      align: "right",
      sortValue: (l) => l.cyclesRemaining,
      render: (l) => <span className={cn("rr-numeric font-semibold", statusStyles[l.status].text)}>{formatNumber(l.cyclesRemaining)}</span>,
    },
    { key: "expiry", header: "Projected expiry", align: "right", render: (l) => formatDate(l.projectedExpiryDate), sortValue: (l) => l.projectedExpiryDate },
  ];

  const critical = llps.filter((l) => l.status === "red").length;

  return (
    <div className="space-y-4">
      {critical > 0 ? (
        <Panel className={cn("flex items-center justify-between gap-4", statusStyles.red.bg, statusStyles.red.border)}>
          <p className="text-sm text-rr-ink">
            <span className="font-semibold">{critical} life-limited part{critical === 1 ? "" : "s"}</span> will expire before the
            next planned shop visit — build them into the workscope now.
          </p>
          <Button size="sm" variant="secondary">
            Plan LLP replacement
          </Button>
        </Panel>
      ) : null}
      <DataTable columns={columns} rows={llps} rowKey={(l) => l.id} initialSortKey="remaining" emptyMessage="No life-limited parts recorded." />
    </div>
  );
}
