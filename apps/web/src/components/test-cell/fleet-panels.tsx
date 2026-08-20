import type { TestCellFamilyStat, TestCellUtilisation, TestFailureCauseStat } from "@rr/types";
import { Panel, PanelHeader, cn, formatNumber } from "@rr/ui";

/** Why engines fail pass-off, ranked by frequency across the tested fleet. */
export function FailureCauses({ causes }: { causes: TestFailureCauseStat[] }) {
  const worst = Math.max(...causes.map((c) => c.runs), 1);
  return (
    <Panel>
      <PanelHeader
        title="Common failure causes"
        subtitle="Governing finding on every run that did not pass cleanly, with the typical rework it triggers."
      />
      <div className="space-y-3.5">
        {causes.map((cause, index) => (
          <div key={cause.cause}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-rr-ink">{cause.cause}</p>
              <p className="rr-numeric shrink-0 text-xs text-rr-slate">
                {cause.runs} runs · {formatNumber(cause.sharePct, 1)}%
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rr-mist">
              <div
                className={cn("h-full rounded-full", index === 0 ? "bg-status-red" : index < 3 ? "bg-status-amber" : "bg-rr-blue/40")}
                style={{ width: `${(cause.runs / worst) * 100}%` }}
              />
            </div>
            <p className="rr-label mt-1 text-rr-slate">
              {cause.engines} engines · {cause.meanReworkHours}h mean rework{cause.module ? ` · module ${cause.module}` : ""}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Restoration and yield by engine family — where the shop process is weakest. */
export function FamilyComparison({ families }: { families: TestCellFamilyStat[] }) {
  return (
    <Panel padded={false}>
      <div className="p-5 pb-0">
        <PanelHeader title="Restoration by engine family" subtitle="Mean test-cell margin against the margin a new engine delivers." />
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-rr-ink/8 bg-rr-mist/60">
            <th className="rr-label px-5 py-2.5 text-left text-rr-slate">Family</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">Runs</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">First-pass yield</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">Margin at test</th>
            <th className="rr-label px-5 py-2.5 text-right text-rr-slate">Restored</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rr-ink/8">
          {families.map((family) => (
            <tr key={family.family}>
              <td className="px-5 py-2.5 font-medium text-rr-ink">{family.family}</td>
              <td className="rr-numeric px-3 py-2.5 text-right text-rr-slate">{family.runs}</td>
              <td
                className={cn(
                  "rr-numeric px-3 py-2.5 text-right font-medium",
                  family.firstPassYieldPct >= 80 ? "text-status-green" : family.firstPassYieldPct >= 65 ? "text-status-amber" : "text-status-red",
                )}
              >
                {formatNumber(family.firstPassYieldPct, 1)}%
              </td>
              <td className="rr-numeric px-3 py-2.5 text-right text-rr-slate">
                {formatNumber(family.meanEgtMarginAtTestC, 1)}
                <span className="text-[11px]"> / {formatNumber(family.newEngineEgtMarginC, 0)}°C</span>
              </td>
              <td className="px-5 py-2.5 text-right">
                <div className="inline-flex w-32 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rr-mist">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        family.meanRestorationPct >= 85 ? "bg-status-green" : family.meanRestorationPct >= 70 ? "bg-status-amber" : "bg-status-red",
                      )}
                      style={{ width: `${Math.min(100, family.meanRestorationPct)}%` }}
                    />
                  </div>
                  <span className="rr-numeric w-12 text-right text-xs text-rr-ink">{formatNumber(family.meanRestorationPct, 1)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Bed loading and pass rate by test facility. */
export function BedUtilisation({ beds }: { beds: TestCellUtilisation[] }) {
  return (
    <Panel padded={false}>
      <div className="p-5 pb-0">
        <PanelHeader title="Test bed loading" subtitle="Runs, pass rate and mean occupancy per facility." />
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-rr-ink/8 bg-rr-mist/60">
            <th className="rr-label px-5 py-2.5 text-left text-rr-slate">Facility</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">Beds</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">Runs</th>
            <th className="rr-label px-3 py-2.5 text-right text-rr-slate">Mean run</th>
            <th className="rr-label px-5 py-2.5 text-right text-rr-slate">Pass rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rr-ink/8">
          {beds.map((bed) => (
            <tr key={bed.facilityId}>
              <td className="px-5 py-2.5">
                <p className="font-medium text-rr-ink">{bed.facilityName}</p>
                <p className="rr-label text-rr-slate">{bed.icao}</p>
              </td>
              <td className="rr-numeric px-3 py-2.5 text-right text-rr-slate">{bed.cells}</td>
              <td className="rr-numeric px-3 py-2.5 text-right text-rr-slate">{bed.runs}</td>
              <td className="rr-numeric px-3 py-2.5 text-right text-rr-slate">{bed.meanDurationMinutes} min</td>
              <td
                className={cn(
                  "rr-numeric px-5 py-2.5 text-right font-medium",
                  bed.passRatePct >= 80 ? "text-status-green" : bed.passRatePct >= 65 ? "text-status-amber" : "text-status-red",
                )}
              >
                {formatNumber(bed.passRatePct, 1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
