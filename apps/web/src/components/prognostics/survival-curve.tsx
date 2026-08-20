import type { EngineSurvivalCurve } from "@rr/types";
import { formatNumber } from "@rr/ui";

/**
 * Survival and hazard curves for one engine with the recommended removal
 * window shaded. Survival reads on the left axis (probability the engine is
 * still serviceable), hazard on the right (failures per 1,000 cycles).
 */
export function SurvivalCurve({ curve, height = 220 }: { curve: EngineSurvivalCurve; height?: number }) {
  const width = 680;
  const plotHeight = height - 26;
  const maxCycles = curve.points[curve.points.length - 1]?.cycles ?? 1;
  const maxHazard = Math.max(...curve.points.map((p) => p.hazardPer1kCycles), 0.001);

  const x = (cycles: number) => (cycles / maxCycles) * width;
  const ySurvival = (v: number) => plotHeight - v * plotHeight;
  const yHazard = (v: number) => plotHeight - (v / maxHazard) * plotHeight;

  const survivalPath = curve.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cycles).toFixed(2)},${ySurvival(p.survival).toFixed(2)}`)
    .join(" ");
  const hazardPath = curve.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cycles).toFixed(2)},${yHazard(p.hazardPer1kCycles).toFixed(2)}`)
    .join(" ");
  const survivalArea = `${survivalPath} L${width},${plotHeight} L0,${plotHeight} Z`;

  const windowX = x(curve.windowFromCycles);
  const windowWidth = Math.max(2, x(curve.windowToCycles) - windowX);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Survival and hazard curves for engine ${curve.esn}. Recommended removal window between ${curve.windowFromCycles} and ${curve.windowToCycles} cycles.`}
      >
        <defs>
          <linearGradient id={`survival-${curve.engineId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10069f" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#10069f" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={plotHeight * f} y2={plotHeight * f} stroke="#05061f" strokeOpacity={0.06} />
        ))}

        {/* Maintenance opportunity window */}
        <rect x={windowX} y={0} width={windowWidth} height={plotHeight} fill="#f08c00" fillOpacity={0.1} />
        <line x1={windowX} x2={windowX} y1={0} y2={plotHeight} stroke="#f08c00" strokeWidth={1.2} strokeDasharray="5 4" />
        <line
          x1={windowX + windowWidth}
          x2={windowX + windowWidth}
          y1={0}
          y2={plotHeight}
          stroke="#d81e2b"
          strokeWidth={1.2}
          strokeDasharray="5 4"
        />

        <path d={survivalArea} fill={`url(#survival-${curve.engineId})`} />
        <path d={survivalPath} fill="none" stroke="#10069f" strokeWidth={2} />
        <path d={hazardPath} fill="none" stroke="#d81e2b" strokeWidth={1.6} strokeDasharray="4 3" />

        <text x={windowX + 6} y={14} className="rr-label" fontSize={9} fill="#f08c00">
          WINDOW OPENS
        </text>
        <text x={Math.min(width - 4, windowX + windowWidth + 6)} y={14} className="rr-label" fontSize={9} fill="#d81e2b" textAnchor={windowX + windowWidth > width - 90 ? "end" : "start"}>
          REMOVE BY
        </text>

        <line x1={0} x2={width} y1={plotHeight} y2={plotHeight} stroke="#05061f" strokeOpacity={0.12} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={f * width} y={height - 6} fontSize={10} fill="#4b4f77" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} className="rr-numeric">
            {formatNumber(Math.round(maxCycles * f))}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-3 text-[11px] text-rr-slate">
        <span className="inline-flex items-center gap-3">
          <LegendSwatch colour="#10069f" label="Survival probability" />
          <LegendSwatch colour="#d81e2b" label="Hazard / 1k cycles" dashed />
          <LegendSwatch colour="#f08c00" label="Removal window" block />
        </span>
        <span className="rr-numeric">
          Weibull shape {curve.shape} · scale {formatNumber(curve.scaleCycles)} cycles
        </span>
      </figcaption>
    </figure>
  );
}

function LegendSwatch({ colour, label, dashed, block }: { colour: string; label: string; dashed?: boolean; block?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {block ? (
        <span className="h-2.5 w-3 rounded-[1px]" style={{ backgroundColor: colour, opacity: 0.25 }} />
      ) : (
        <span
          className="h-0 w-4 border-t-2"
          style={{ borderColor: colour, borderTopStyle: dashed ? "dashed" : "solid" }}
        />
      )}
      {label}
    </span>
  );
}
