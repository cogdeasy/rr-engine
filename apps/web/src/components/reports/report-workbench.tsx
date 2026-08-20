"use client";

import * as React from "react";
import type { EngineFamily, ReportFacts, ReportId, ReportPeriodId, ReportScope } from "@rr/types";
import {
  REPORT_DEFINITIONS,
  buildReportDocument,
  defaultReportScope,
  getReportDefinition,
  reportDocumentToCsv,
  reportFileName,
  REPORT_PERIOD_IDS,
  resolveReportPeriod,
} from "@rr/data";
import { Badge, Button, FilterBar, FilterChip, Panel, PanelHeader, cn } from "@rr/ui";
import { ReportPreview } from "./report-preview";

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden; }
  #report-preview, #report-preview * { visibility: visible; }
  #report-preview { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; }
}
`;

export function ReportWorkbench({
  facts,
  families,
  initialReportId = "operator-monthly-review",
}: {
  facts: ReportFacts;
  families: EngineFamily[];
  initialReportId?: ReportId;
}) {
  const [scope, setScope] = React.useState<ReportScope>(() => defaultReportScope(initialReportId));
  const definition = getReportDefinition(scope.reportId);
  const doc = React.useMemo(() => buildReportDocument(facts, scope), [facts, scope]);
  const period = resolveReportPeriod(scope.periodId, facts.generatedAt);

  function selectReport(reportId: ReportId) {
    setScope((current) => ({ ...defaultReportScope(reportId, current.operatorId), periodId: current.periodId, family: current.family }));
  }

  function toggleSection(sectionId: string) {
    setScope((current) => ({
      ...current,
      sectionIds: current.sectionIds.includes(sectionId)
        ? current.sectionIds.filter((id) => id !== sectionId)
        : [...current.sectionIds, sectionId],
    }));
  }

  function exportCsv() {
    const blob = new Blob([reportDocumentToCsv(doc)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reportFileName(doc);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <style>{PRINT_STYLES}</style>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Report" subtitle="Pick the pack you are assembling" />
          <ul className="space-y-2" role="radiogroup" aria-label="Report catalogue">
            {REPORT_DEFINITIONS.map((def) => {
              const active = def.id === scope.reportId;
              return (
                <li key={def.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectReport(def.id)}
                    className={cn(
                      "w-full rounded-sm border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
                      active ? "border-rr-blue bg-rr-blue-50/70" : "border-rr-ink/10 bg-white hover:border-rr-blue/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-[13px] font-semibold", active ? "text-rr-blue" : "text-rr-ink")}>{def.name}</span>
                      <Badge variant={active ? "brand" : "neutral"}>{def.cadence}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-rr-slate">{def.purpose}</p>
                    <p className="rr-label mt-1.5 text-rr-slate">
                      {def.audience} · {def.format}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Scope" subtitle="Who the pack covers and over what window" />
          <div className="space-y-4">
            <label className="block">
              <span className="rr-label text-rr-slate">Operator</span>
              <select
                value={scope.operatorId}
                onChange={(event) => setScope((current) => ({ ...current, operatorId: event.target.value }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-rr-ink/12 bg-white px-2.5 text-[13px] text-rr-ink focus:border-rr-blue focus:outline-none"
              >
                <option value="all">All managed operators</option>
                {facts.operators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name} ({operator.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="rr-label text-rr-slate">Engine family</span>
              <select
                value={scope.family}
                onChange={(event) => setScope((current) => ({ ...current, family: event.target.value as EngineFamily | "all" }))}
                className="mt-1.5 h-9 w-full rounded-sm border border-rr-ink/12 bg-white px-2.5 text-[13px] text-rr-ink focus:border-rr-blue focus:outline-none"
              >
                <option value="all">All families</option>
                {families.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="rr-label text-rr-slate">Period</span>
              <FilterBar className="mt-1.5">
                {REPORT_PERIOD_IDS.map((periodId) => (
                  <FilterChip
                    key={periodId}
                    label={resolveReportPeriod(periodId, facts.generatedAt).label}
                    active={scope.periodId === periodId}
                    onClick={() => setScope((current) => ({ ...current, periodId: periodId as ReportPeriodId }))}
                  />
                ))}
              </FilterBar>
              <p className="mt-2 text-[11px] text-rr-slate">
                {period.days} days to {new Date(period.toIso).toISOString().slice(0, 10)}
              </p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Sections" subtitle="What the pack contains" />
          <ul className="space-y-2">
            {definition.sections.map((section) => {
              const checked = section.required || scope.sectionIds.includes(section.id);
              return (
                <li key={section.id}>
                  <label className={cn("flex cursor-pointer items-start gap-2.5", section.required && "cursor-not-allowed opacity-70")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={section.required}
                      onChange={() => toggleSection(section.id)}
                      className="mt-0.5 h-4 w-4 accent-rr-blue"
                    />
                    <span>
                      <span className="block text-[13px] font-medium text-rr-ink">
                        {section.title}
                        {section.required ? <span className="rr-label ml-2 text-rr-slate">Always included</span> : null}
                      </span>
                      <span className="block text-[11px] leading-relaxed text-rr-slate">{section.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rr-ink/10 px-5 py-3.5">
          <div>
            <p className="rr-label text-rr-slate">Live preview</p>
            <p className="text-[13px] font-semibold text-rr-ink">
              {definition.name} · {doc.scopeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{doc.sections.length} sections</Badge>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              Print pack
            </Button>
          </div>
        </div>
        <div className="max-h-[1180px] overflow-y-auto bg-rr-mist/40 p-5">
          <div className="mx-auto max-w-4xl border border-rr-ink/10 bg-white">
            <ReportPreview doc={doc} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
