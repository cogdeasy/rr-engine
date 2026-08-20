import type { RiskExposureTrend } from "@rr/types";
import { formatUsd } from "@rr/ui";

const WIDTH = 640;
const HEIGHT = 190;

/**
 * Ninety days of fleet exposure: gross expected disruption cost against the
 * exposure that would remain if every recommended mitigation were committed.
 */
export function ExposureTrend({ trend, height = HEIGHT }: { trend: RiskExposureTrend; height?: number }) {
  const all = [...trend.gross, ...trend.residual];
  const max = Math.max(...all.map((p) => p.v)) * 1.08;
  const min = Math.min(...all.map((p) => p.v)) * 0.92;
  const toY = (v: number) => height - ((v - min) / Math.max(1, max - min)) * height;
  const toX = (i: number, length: number) => (i / Math.max(1, length - 1)) * WIDTH;

  const path = (points: typeof trend.gross) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i, points.length).toFixed(2)},${toY(p.v).toFixed(2)}`).join(" ");

  const grossLine = path(trend.gross);
  const first = trend.gross[0];
  const last = trend.gross[trend.gross.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Fleet risk exposure over the last 90 days, ${formatUsd(trend.currentUsd)} today`}
      >
        <defs>
          <linearGradient id="risk-exposure-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5f6d" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff5f6d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={WIDTH} y1={height * f} y2={height * f} stroke="#e7eaf8" strokeOpacity={0.132} strokeWidth={1} />
        ))}
        <path d={`${grossLine} L${WIDTH},${height} L0,${height} Z`} fill="url(#risk-exposure-fill)" />
        <path d={grossLine} fill="none" stroke="#ff5f6d" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        <path
          d={path(trend.residual)}
          fill="none"
          stroke="#6a63ff"
          strokeWidth={1.6}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-rr-slate">
        <span>{first ? new Date(first.t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>
        <span className="flex items-center gap-4">
          <LegendKey colour="#ff5f6d" label="Gross exposure" />
          <LegendKey colour="#6a63ff" label="Residual after mitigation" dashed />
        </span>
        <span>{last ? new Date(last.t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>
      </div>
    </div>
  );
}

function LegendKey({ colour, label, dashed }: { colour: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden>
        <line x1="0" y1="3" x2="18" y2="3" stroke={colour} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
