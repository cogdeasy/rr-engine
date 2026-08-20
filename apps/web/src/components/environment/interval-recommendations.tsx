import type { IntervalRecommendation, RotationAction } from "@rr/types";
import { Badge, Button, Panel, PanelHeader, StatusPill, cn, formatNumber, formatUsd, statusStyles } from "@rr/ui";

const ACTION_LABEL: Record<RotationAction, string> = {
  rotate: "Rotate off harsh sectors",
  "shorten-interval": "Shorten overhaul interval",
  monitor: "Monitor, no change yet",
  hold: "Hold published interval",
};

const ACTION_HINT: Record<RotationAction, string> = {
  rotate: "Severity is high enough that swapping the routing is cheaper than the shop visit it is buying.",
  "shorten-interval": "Routing is structural for this operator; plan the shop visit earlier instead.",
  monitor: "Exposure is elevated but deterioration is still tracking the published curve.",
  hold: "Environment is nominal — no interval concession required.",
};

/** Operator × route-group interval concessions, ordered by the money at stake. */
export function IntervalRecommendations({ recommendations }: { recommendations: IntervalRecommendation[] }) {
  const priority: Record<RotationAction, number> = { rotate: 0, "shorten-interval": 1, monitor: 2, hold: 3 };
  const ranked = [...recommendations].sort(
    (a, b) => priority[a.action] - priority[b.action] || b.annualCostImpactUsd - a.annualCostImpactUsd || b.meanSeverityIndex - a.meanSeverityIndex,
  );

  return (
    <Panel>
      <PanelHeader
        title="Recommended interval adjustments"
        subtitle="Per operator and route group, the severity-adjusted overhaul interval and the unplanned-removal exposure it removes"
        actions={<Badge variant="outline">{ranked.length} populations</Badge>}
      />
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {ranked.map((rec) => (
          <li
            key={rec.id}
            className={cn("rounded-sm border border-rr-ink/8 p-4", rec.action === "rotate" && "border-status-red/30 bg-status-red-soft/30")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-rr-ink">
                  {rec.operatorCode} · {rec.routeGroup}
                </p>
                <p className="text-[11px] text-rr-slate">
                  {rec.operatorName} · {rec.engineCount} engines · mean severity{" "}
                  <span className={cn("rr-numeric font-semibold", statusStyles[rec.status].text)}>{rec.meanSeverityIndex}</span>
                </p>
              </div>
              <StatusPill status={rec.status} />
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="rr-label text-rr-slate">Interval</p>
                <p className="rr-numeric mt-0.5 text-xl font-semibold text-rr-ink">
                  {formatNumber(rec.baselineIntervalCycles)}
                  <span className="mx-1.5 text-sm font-normal text-rr-slate">→</span>
                  {formatNumber(rec.recommendedIntervalCycles)}
                  <span className="ml-1 text-xs font-medium text-rr-slate">cycles</span>
                </p>
              </div>
              <div className="text-right">
                <p className="rr-label text-rr-slate">Interval delta</p>
                <p className={cn("rr-numeric mt-0.5 text-xl font-semibold", rec.deltaPct < 0 ? "text-status-amber" : "text-rr-ink")}>
                  {rec.deltaPct > 0 ? "+" : ""}
                  {rec.deltaPct}%
                </p>
              </div>
              <div className="text-right">
                <p className="rr-label text-rr-slate">Exposure avoided / yr</p>
                <p className="rr-numeric mt-0.5 text-xl font-semibold text-rr-ink">{formatUsd(rec.annualCostImpactUsd)}</p>
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-snug text-rr-slate">{rec.rationale}</p>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-rr-ink/6 pt-3">
              <div>
                <p className="text-[12px] font-semibold text-rr-ink">{ACTION_LABEL[rec.action]}</p>
                <p className="text-[11px] text-rr-slate">{ACTION_HINT[rec.action]}</p>
              </div>
              <Button variant={rec.action === "rotate" ? "primary" : "secondary"} size="sm">
                {rec.action === "rotate" ? "Plan rotation" : rec.action === "shorten-interval" ? "Apply interval" : "Add to watchlist"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
