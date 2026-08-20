import type { ShaftVibration } from "@rr/types";
import { Sparkline, StatusPill, ThresholdBar, TrendArrow, cn, statusStyles } from "@rr/ui";

/**
 * One tracked order (1x N1/N2/N3): the level an analyst compares against the
 * advisory and alert limits before deciding whether to trim or inspect.
 */
export function ShaftCard({ shaft, description }: { shaft: ShaftVibration; description: string }) {
  const s = statusStyles[shaft.status];
  return (
    <div className="rr-panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rr-label text-rr-slate">1x {shaft.shaft} tracked order</p>
          <p className="mt-0.5 text-[11px] text-rr-slate">{description}</p>
        </div>
        <StatusPill status={shaft.status}>{shaft.status === "green" ? "Within limits" : shaft.status === "amber" ? "Advisory" : "Alert limit"}</StatusPill>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className={cn("rr-numeric text-4xl font-semibold leading-none", s.text)}>
          {shaft.latest.toFixed(2)}
          <span className="ml-1 text-sm font-medium text-rr-slate">{shaft.unit}</span>
        </p>
        <div className="text-right">
          <p className="rr-numeric text-[11px] text-rr-slate">
            <TrendArrow trend={shaft.trend} good={shaft.trend !== "up"} /> {shaft.deltaPct > 0 ? "+" : ""}
            {shaft.deltaPct}% vs baseline
          </p>
          <p className="rr-numeric text-[11px] text-rr-slate">
            {shaft.slopePer100Cycles > 0 ? "+" : ""}
            {shaft.slopePer100Cycles} {shaft.unit}/100 cyc
          </p>
        </div>
      </div>

      <ThresholdBar
        value={shaft.latest}
        min={0}
        max={Math.max(shaft.redLimit + 1, Math.ceil(shaft.latest * 2 + 0.4) / 2)}
        amber={shaft.amberLimit}
        red={shaft.redLimit}
        unit=" IPS"
      />

      <Sparkline points={shaft.series.points} status={shaft.status} height={30} />

      <dl className="grid grid-cols-3 gap-2 border-t border-rr-ink/8 pt-3 text-[11px] text-rr-slate">
        <div>
          <dt className="rr-label">Peak 180d</dt>
          <dd className="rr-numeric text-rr-ink">{shaft.peak.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="rr-label">Shaft speed</dt>
          <dd className="rr-numeric text-rr-ink">{shaft.rpm.toLocaleString("en-GB")} rpm</dd>
        </div>
        <div>
          <dt className="rr-label">Hrs &gt; limit</dt>
          <dd className={cn("rr-numeric", shaft.hoursAtExceedance > 0 ? s.text : "text-rr-ink")}>{shaft.hoursAtExceedance}</dd>
        </div>
      </dl>
    </div>
  );
}
