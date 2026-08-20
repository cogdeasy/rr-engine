"use client";

import * as React from "react";
import type { ConfigDiffRow, EngineBuildRecord, ModuleInstallation, SbEmbodimentRow } from "@rr/types";
import type { Column } from "@rr/ui";
import {
  Badge,
  Button,
  DataTable,
  Panel,
  PanelHeader,
  ProgressBar,
  StatusPill,
  Tabs,
  cn,
  formatDate,
  formatNumber,
  statusStyles,
} from "@rr/ui";
import { BuildTimeline } from "./build-timeline";
import { TraceabilityTree } from "./traceability-tree";
import { CONFORMANCE_LABEL, SOURCE_LABEL } from "./labels";

type Facility = { id: string; name: string; icao: string };
type TabId = "configuration" | "diff" | "history" | "traceability" | "bulletins";

export function RecordTabs({ record, facilities }: { record: EngineBuildRecord; facilities: Facility[] }) {
  const [tab, setTab] = React.useState<TabId>("configuration");

  React.useEffect(() => {
    setTab("configuration");
  }, [record.engineId]);

  const facilityName = React.useCallback(
    (id: string) => {
      const facility = facilities.find((f) => f.id === id);
      return facility ? `${facility.name} (${facility.icao})` : "Unknown facility";
    },
    [facilities],
  );

  const offStandard = record.diff.filter((d) => d.conformance !== "standard");
  const openBulletins = record.bulletins.filter((b) => !b.embodied);

  const moduleColumns: Column<ModuleInstallation>[] = [
    {
      key: "module",
      header: "Module",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <span className="block font-medium text-rr-ink">{row.label}</span>
          <span className="rr-numeric block text-[11px] text-rr-slate">
            {row.moduleCode} · ATA {row.ataChapter}
          </span>
        </div>
      ),
    },
    {
      key: "serial",
      header: "Serial",
      sortValue: (row) => row.serialNumber,
      render: (row) => <span className="rr-numeric text-rr-ink">{row.serialNumber}</span>,
    },
    {
      key: "standard",
      header: "Build standard",
      sortValue: (row) => row.buildStandard,
      render: (row) => (
        <div>
          <span className="rr-numeric block text-rr-ink">{row.buildStandard}</span>
          {row.conformance === "superseded" ? (
            <span className="rr-numeric block text-[11px] text-status-amber">fleet {row.fleetStandard}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      sortValue: (row) => row.source,
      render: (row) => <span className="text-rr-slate">{SOURCE_LABEL[row.source]}</span>,
    },
    {
      key: "installed",
      header: "Installed",
      sortValue: (row) => row.installedAt,
      render: (row) => (
        <div>
          <span className="rr-numeric block text-rr-ink">{formatDate(row.installedAt)}</span>
          <span className="block text-[11px] text-rr-slate">{facilityName(row.facilityId)}</span>
        </div>
      ),
    },
    {
      key: "since",
      header: "Since install",
      align: "right",
      sortValue: (row) => row.cyclesSinceInstall,
      render: (row) => (
        <div>
          <span className="rr-numeric block text-rr-ink">{formatNumber(row.cyclesSinceInstall)} cyc</span>
          <span className="rr-numeric block text-[11px] text-rr-slate">{formatNumber(row.hoursSinceInstall)} hrs</span>
        </div>
      ),
    },
    {
      key: "life",
      header: "Life consumed",
      sortValue: (row) => row.lifeConsumedPct,
      width: "8.5rem",
      render: (row) => (
        <div className="space-y-1">
          <span className={cn("rr-numeric text-xs font-semibold", statusStyles[row.status].text)}>
            {row.lifeConsumedPct}%
          </span>
          <ProgressBar value={row.lifeConsumedPct} status={row.status} />
        </div>
      ),
    },
    {
      key: "conformance",
      header: "Conformance",
      sortValue: (row) => row.conformance,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.conformance === "standard" ? (
            <Badge variant="outline">At standard</Badge>
          ) : (
            <StatusPill status="amber">{CONFORMANCE_LABEL[row.conformance]}</StatusPill>
          )}
          {!row.traceComplete ? <StatusPill status="red">Trace gap</StatusPill> : null}
        </div>
      ),
    },
  ];

  const diffColumns: Column<ConfigDiffRow>[] = [
    {
      key: "module",
      header: "Module",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <span className="block font-medium text-rr-ink">{row.label}</span>
          <span className="rr-numeric block text-[11px] text-rr-slate">{row.moduleCode}</span>
        </div>
      ),
    },
    {
      key: "installed",
      header: "Installed",
      sortValue: (row) => row.installedStandard,
      render: (row) => <span className="rr-numeric text-rr-ink">{row.installedStandard}</span>,
    },
    {
      key: "fleet",
      header: "Fleet standard",
      sortValue: (row) => row.fleetStandard,
      render: (row) => <span className="rr-numeric text-rr-slate">{row.fleetStandard}</span>,
    },
    {
      key: "behind",
      header: "Δ rev",
      align: "right",
      sortValue: (row) => row.revisionsBehind,
      render: (row) => (
        <span className={cn("rr-numeric font-semibold", row.revisionsBehind > 0 ? "text-status-amber" : "text-rr-slate/70")}>
          {row.revisionsBehind > 0 ? `−${row.revisionsBehind}` : "0"}
        </span>
      ),
    },
    {
      key: "impact",
      header: "Impact",
      render: (row) => <span className="text-xs leading-relaxed text-rr-slate">{row.impact}</span>,
    },
    {
      key: "action",
      header: "Recommended action",
      render: (row) => (
        <div className="flex items-start gap-2">
          <StatusPill status={row.status}>{CONFORMANCE_LABEL[row.conformance]}</StatusPill>
          <span className="text-xs leading-relaxed text-rr-ink">{row.recommendedAction}</span>
        </div>
      ),
    },
  ];

  const bulletinColumns: Column<SbEmbodimentRow>[] = [
    {
      key: "reference",
      header: "Reference",
      sortValue: (row) => row.reference,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="rr-numeric font-medium text-rr-ink">{row.reference}</span>
          <Badge variant={row.kind === "AD" ? "brand" : "neutral"}>{row.kind}</Badge>
        </div>
      ),
    },
    {
      key: "title",
      header: "Subject",
      render: (row) => <span className="text-xs leading-relaxed text-rr-slate">{row.title}</span>,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (row) => (row.mandatory ? 1 : 0),
      render: (row) => <span className="text-rr-slate">{row.mandatory ? "Mandatory" : "Recommended"}</span>,
    },
    {
      key: "due",
      header: "Compliance by",
      sortValue: (row) => row.dueAt,
      render: (row) => (
        <div>
          <span className="rr-numeric block text-rr-ink">{formatDate(row.dueAt)}</span>
          <span className={cn("rr-numeric block text-[11px]", row.daysToDue < 0 ? "text-status-red" : "text-rr-slate")}>
            {row.daysToDue < 0 ? `${Math.abs(row.daysToDue)}d overdue` : `${row.daysToDue}d remaining`}
          </span>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Est. hours",
      align: "right",
      sortValue: (row) => row.estimatedHours,
      render: (row) => <span className="rr-numeric text-rr-ink">{formatNumber(row.estimatedHours)}</span>,
    },
    {
      key: "status",
      header: "Embodiment",
      sortValue: (row) => (row.embodied ? 0 : 1),
      render: (row) =>
        row.embodied ? (
          <Badge variant="outline">Embodied</Badge>
        ) : (
          <StatusPill status={row.status}>
            {row.status === "red"
              ? "Overdue — ground risk"
              : row.status === "amber"
                ? "Due at next shop visit"
                : "Within compliance window"}
          </StatusPill>
        ),
    },
  ];

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "configuration", label: "Installed configuration", count: record.modules.length },
            { id: "diff", label: "Diff vs fleet standard", count: offStandard.length },
            { id: "history", label: "Build history", count: record.events.length },
            { id: "traceability", label: "Traceability", count: record.traceGapCount },
            { id: "bulletins", label: "SB embodiment", count: openBulletins.length },
          ]}
          className="flex-1"
        />
      </div>

      <div className="p-5">
        {tab === "configuration" ? (
          <>
            <PanelHeader
              title="As-built module configuration"
              subtitle="Every major assembly currently fitted, with serial, build standard and provenance"
              actions={<Button variant="secondary" size="sm">Export build pack</Button>}
            />
            <DataTable
              columns={moduleColumns}
              rows={record.modules}
              rowKey={(row) => row.id}
              rowAccent={(row) => (row.status === "red" ? "border-status-red" : row.status === "amber" ? "border-status-amber" : undefined)}
              initialSortKey="life"
              dense
              className="border-0 shadow-none"
            />
          </>
        ) : null}

        {tab === "diff" ? (
          <>
            <PanelHeader
              title="Configuration diff"
              subtitle="Installed build standard against the published fleet standard for this engine family"
            />
            {offStandard.length === 0 ? (
              <p className="px-1 py-8 text-center text-xs text-rr-slate">
                Every installed module matches the published fleet standard.
              </p>
            ) : (
              <DataTable
                columns={diffColumns}
                rows={offStandard}
                rowKey={(row) => row.moduleCode}
                rowAccent={(row) => (row.status === "red" ? "border-status-red" : "border-status-amber")}
                initialSortKey="behind"
                dense
                className="border-0 shadow-none"
              />
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-rr-slate">
              Superseded hardware is airworthy but behind the published standard — plan the upgrade into the next shop visit.
              Non-standard fitment (loan or used-serviceable hardware) is amber: it flies under an approved deviation but must
              be reconciled before the engine returns to its lease baseline. Red is reserved for airworthiness gaps — a missing
              release certificate or a passed mandatory compliance date.
            </p>
          </>
        ) : null}

        {tab === "history" ? (
          <>
            <PanelHeader
              title="Build history"
              subtitle="Every configuration change with date, facility, reason and certifying authority"
            />
            <BuildTimeline events={record.events} facilityName={facilityName} />
          </>
        ) : null}

        {tab === "traceability" ? (
          <>
            <PanelHeader
              title="Traceability drill-down"
              subtitle="Engine → module → part serial → source, with airworthiness release evidence"
            />
            <TraceabilityTree esn={record.esn} nodes={record.traceability} />
          </>
        ) : null}

        {tab === "bulletins" ? (
          <>
            <PanelHeader
              title="Modification and SB embodiment"
              subtitle="Service bulletins and airworthiness directives applicable to this build standard"
            />
            <DataTable
              columns={bulletinColumns}
              rows={record.bulletins}
              rowKey={(row) => row.bulletinId}
              rowAccent={(row) => (row.status === "red" && !row.embodied ? "border-status-red" : undefined)}
              initialSortKey="due"
              dense
              className="border-0 shadow-none"
            />
          </>
        ) : null}
      </div>
    </Panel>
  );
}
