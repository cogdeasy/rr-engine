import Link from "next/link";
import type { HotSectionAssessment } from "@rr/types";
import { HOT_SECTION_INDICATORS } from "@rr/data";
import { HeatCell, StatusPill, cn, formatDate, statusStyles } from "@rr/ui";

/**
 * Turbine and combustor hardware condition, engine by engine.
 *
 * Each cell is a 0-100 distress index built from module life consumption,
 * borescope recency and the prognostic model. Grey means there is no inspection
 * inside the evidence window and no model output — the cell is unknown, not good.
 */
export function ConditionMatrix({ assessments }: { assessments: HotSectionAssessment[] }) {
  const columnStats = HOT_SECTION_INDICATORS.map((definition, index) => {
    const cells = assessments.map((a) => a.indicators[index]!);
    const known = cells.filter((c) => c.status !== "grey");
    return {
      definition,
      mean: known.length ? Math.round(known.reduce((s, c) => s + c.index, 0) / known.length) : 0,
      red: cells.filter((c) => c.status === "red").length,
      grey: cells.filter((c) => c.status === "grey").length,
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
        <caption className="sr-only">Hot section condition indices by engine and module</caption>
        <thead>
          <tr>
            <th scope="col" className="rr-label w-56 px-2 pb-2 text-left text-rr-slate">
              Engine
            </th>
            {HOT_SECTION_INDICATORS.map((definition) => (
              <th key={definition.id} scope="col" className="rr-label px-1 pb-2 text-center text-rr-slate" title={definition.label}>
                <span className="block">{definition.short}</span>
                <span className="block text-[9px] font-normal tracking-normal text-rr-slate/70">{definition.moduleCode}</span>
              </th>
            ))}
            <th scope="col" className="rr-label w-40 px-2 pb-2 text-left text-rr-slate">
              Hot section state
            </th>
          </tr>
        </thead>
        <tbody>
          {assessments.map((assessment) => (
            <tr key={assessment.engineId}>
              <th scope="row" className="px-2 text-left font-normal">
                <Link href={`/engines/${assessment.engineId}`} className="text-[13px] font-semibold text-rr-ink hover:text-rr-blue">
                  {assessment.esn}
                </Link>
                <span className="block text-[11px] text-rr-slate">
                  {assessment.operatorCode} · {assessment.family} · {assessment.cyclesSinceOverhaul.toLocaleString("en-GB")} cyc
                </span>
              </th>
              {assessment.indicators.map((indicator) => (
                <td key={indicator.id} className="px-0.5">
                  <HeatCell
                    value={indicator.index}
                    status={indicator.status}
                    title={`${assessment.esn} — ${indicator.label}: ${
                      indicator.status === "grey" ? "no evidence" : `${indicator.index}/100`
                    }. ${indicator.evidence}${
                      indicator.lastInspectedAt ? `. Last inspected ${formatDate(indicator.lastInspectedAt)}` : ""
                    }`}
                  />
                </td>
              ))}
              <td className="px-2">
                <div className="flex items-center gap-2">
                  <StatusPill status={assessment.status}>{assessment.urgency}</StatusPill>
                  <span className={cn("text-[11px] leading-snug", statusStyles[assessment.status].text)}>
                    {assessment.action.kind === "workscope"
                      ? "Restore hot section"
                      : assessment.action.kind === "borescope"
                        ? "Inspect"
                        : assessment.action.kind === "wash"
                          ? "Wash"
                          : assessment.action.kind === "reroute"
                            ? "Re-route"
                            : "Monitor"}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="rr-label px-2 pt-2 text-left text-rr-slate">
              Cohort mean · red cells
            </th>
            {columnStats.map((stat) => (
              <td key={stat.definition.id} className="px-1 pt-2 text-center">
                <span className="rr-numeric block text-[13px] font-semibold text-rr-ink">{stat.mean}</span>
                <span className={cn("rr-numeric block text-[10px]", stat.red > 0 ? "text-status-red" : "text-rr-slate")}>
                  {stat.red} red{stat.grey > 0 ? ` · ${stat.grey} grey` : ""}
                </span>
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
