import type { ReportDocument, ReportMetric, ReportSection } from "@rr/types";
import { Badge, RrMark, StatusPill, cn, statusStyles } from "@rr/ui";

/**
 * Print-faithful rendering of a built report. The same markup is what the
 * browser prints, so the preview is the deliverable rather than a mock of it.
 */
export function ReportPreview({ doc }: { doc: ReportDocument }) {
  return (
    <article id="report-preview" className="bg-white">
      <header className="flex items-start justify-between gap-6 border-b border-rr-ink/10 px-8 py-7">
        <div>
          <p className="rr-label text-rr-blue">Rolls-Royce fleet services · {doc.title}</p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-rr-ink">{doc.scopeLabel}</h2>
          <p className="mt-1 text-xs text-rr-slate">{doc.periodLabel}</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-rr-slate">{doc.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <RrMark size={30} />
          <dl className="text-right text-[11px] text-rr-slate">
            <div className="flex items-center justify-end gap-2">
              <dt className="rr-label">Engines</dt>
              <dd className="rr-numeric font-semibold text-rr-ink">{doc.coverage.engines}</dd>
            </div>
            <div className="flex items-center justify-end gap-2">
              <dt className="rr-label">Aircraft</dt>
              <dd className="rr-numeric font-semibold text-rr-ink">{doc.coverage.aircraft}</dd>
            </div>
            <div className="flex items-center justify-end gap-2">
              <dt className="rr-label">Sectors</dt>
              <dd className="rr-numeric font-semibold text-rr-ink">{doc.coverage.flights}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-rr-ink/10 bg-rr-ink/8 sm:grid-cols-5">
        {doc.headline.map((m) => (
          <div key={m.label} className="bg-white px-5 py-4">
            <p className="rr-label text-rr-slate">{m.label}</p>
            <p className={cn("rr-numeric mt-1.5 text-2xl font-semibold", m.status === "grey" ? "text-rr-ink" : statusStyles[m.status].text)}>
              {m.value}
            </p>
            {m.caption ? <p className="mt-0.5 text-[11px] text-rr-slate">{m.caption}</p> : null}
          </div>
        ))}
      </div>

      <section className="border-b border-rr-ink/10 px-8 py-6">
        <div className="flex items-baseline justify-between">
          <h3 className="rr-label text-rr-slate">Exceptions and recommended actions</h3>
          <span className="text-[11px] text-rr-slate">{doc.findings.length} in this pack</span>
        </div>
        <ul className="mt-3 space-y-2.5">
          {doc.findings.map((finding) => (
            <li
              key={finding.id}
              className={cn("flex flex-wrap items-start gap-3 border-l-2 pl-4", statusStyles[finding.status].border.replace("border-", "border-l-"))}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-rr-ink">{finding.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-rr-slate">{finding.detail}</p>
                <p className="mt-1 text-xs font-medium text-rr-blue">Action · {finding.action}</p>
              </div>
              <StatusPill status={finding.status}>
                {finding.status === "red" ? "Act now" : finding.status === "amber" ? "Watch" : "Nominal"}
              </StatusPill>
            </li>
          ))}
        </ul>
      </section>

      {doc.sections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}

      <footer className="flex flex-wrap items-center justify-between gap-3 px-8 py-5 text-[11px] text-rr-slate">
        <span>
          Generated {new Date(doc.generatedAt).toISOString().slice(0, 10)} from the Rolls-Royce engine health platform. Values are
          computed from the live fleet dataset at build time.
        </span>
        <Badge variant="outline">Commercial in confidence</Badge>
      </footer>
    </article>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  return (
    <section className="break-inside-avoid border-b border-rr-ink/10 px-8 py-6 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-rr-ink">{section.title}</h3>
        <p className="text-[11px] text-rr-slate">{section.description}</p>
      </div>

      {section.metrics && section.metrics.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {section.metrics.map((m) => (
            <MetricBlock key={m.label} metric={m} />
          ))}
        </div>
      ) : null}

      {section.narrative ? <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-rr-ink/80">{section.narrative}</p> : null}

      {section.columns && section.rows ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rr-ink/10">
                {section.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn("rr-label py-2 text-rr-slate", column.align === "right" ? "text-right" : "text-left")}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.length === 0 ? (
                <tr>
                  <td colSpan={section.columns.length} className="py-6 text-center text-xs text-rr-slate">
                    No records in this scope and period.
                  </td>
                </tr>
              ) : (
                section.rows.map((r) => (
                  <tr key={r.key} className="border-b border-rr-ink/5 last:border-0">
                    {section.columns!.map((column, index) => (
                      <td
                        key={column.key}
                        className={cn(
                          "py-2.5 text-rr-ink",
                          column.align === "right" ? "rr-numeric text-right" : "text-left",
                          index === 0 && "pl-3",
                          index === 0 && r.status !== "grey" && cn("border-l-2", statusStyles[r.status].border.replace("border-", "border-l-")),
                        )}
                      >
                        {r.cells[column.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.colourNote ? (
        <p className="mt-3 text-[11px] italic text-rr-slate">Colour key · {section.colourNote}</p>
      ) : null}
    </section>
  );
}

function MetricBlock({ metric }: { metric: ReportMetric }) {
  return (
    <div className="rounded-sm border border-rr-ink/8 px-4 py-3">
      <p className="rr-label text-rr-slate">{metric.label}</p>
      <p className={cn("rr-numeric mt-1 text-xl font-semibold", metric.status === "grey" ? "text-rr-ink" : statusStyles[metric.status].text)}>
        {metric.value}
        {metric.unit && !metric.value.includes(metric.unit) ? <span className="ml-1 text-xs font-medium text-rr-slate">{metric.unit}</span> : null}
      </p>
      {metric.caption ? <p className="mt-0.5 text-[11px] text-rr-slate">{metric.caption}</p> : null}
    </div>
  );
}
