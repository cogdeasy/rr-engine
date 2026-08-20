import { StatusPill, cn, formatUsd, statusStyles } from "@rr/ui";
import type { RemovalCause } from "@rr/types";

/**
 * Pareto of unscheduled removal causes: bars are the share of removals, the
 * line is the running cumulative share. Everything left of the 80% rule is the
 * vital few worth a campaign.
 */
export function RemovalPareto({ causes }: { causes: RemovalCause[] }) {
  if (causes.length === 0) return null;
  const shown = causes;
  const height = 180;
  const barWidth = 44;
  const gap = 18;
  const width = shown.length * (barWidth + gap);
  const peak = Math.max(...shown.map((c) => c.sharePct));
  const barTop = (share: number) => height - (share / peak) * (height - 24);
  const cumY = (pct: number) => height - (pct / 100) * (height - 24);

  const line = shown
    .map((cause, i) => `${i === 0 ? "M" : "L"}${i * (barWidth + gap) + barWidth / 2},${cumY(cause.cumulativePct).toFixed(1)}`)
    .join(" ");

  const fill: Record<string, string> = { red: "#d81e2b", amber: "#f08c00", green: "#0a8754", grey: "#6b7089" };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 8}`} className="w-full" style={{ height: 200 }} role="img" aria-label="Pareto of unscheduled removal causes">
        <line x1={0} x2={width} y1={cumY(80)} y2={cumY(80)} stroke="#05061f" strokeOpacity={0.25} strokeDasharray="5 4" strokeWidth={1} />
        {shown.map((cause, i) => (
          <rect
            key={cause.id}
            x={i * (barWidth + gap)}
            y={barTop(cause.sharePct)}
            width={barWidth}
            height={height - barTop(cause.sharePct)}
            rx={1.5}
            fill={fill[cause.status]}
            opacity={cause.vitalFew ? 0.92 : 0.4}
          />
        ))}
        <path d={line} fill="none" stroke="#10069f" strokeWidth={1.6} />
        {shown.map((cause, i) => (
          <circle key={`${cause.id}-dot`} cx={i * (barWidth + gap) + barWidth / 2} cy={cumY(cause.cumulativePct)} r={2.6} fill="#10069f" />
        ))}
      </svg>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-rr-ink/8">
            <th className="rr-label whitespace-nowrap py-2 text-left text-rr-slate">Removal cause</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-left text-rr-slate">Module</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Removals</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Share</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Cumulative</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Mean TAT</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Shop cost</th>
            <th className="rr-label whitespace-nowrap py-2 pl-4 text-right text-rr-slate">Priority</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((cause) => (
            <tr key={cause.id} className="border-b border-rr-ink/5 last:border-0">
              <td className={cn("border-l-2 py-2.5 pl-3 font-medium text-rr-ink", statusStyles[cause.status].border.replace("border-", "border-l-"))}>
                {cause.cause}
                <span className="ml-2 whitespace-nowrap text-[11px] text-rr-slate">ATA {cause.ataChapter}</span>
              </td>
              <td className="whitespace-nowrap py-2.5 pl-4 text-[12px] text-rr-slate">{cause.moduleCode}</td>
              <td className="rr-numeric whitespace-nowrap py-2.5 pl-4 text-right font-semibold text-rr-ink">{cause.removals}</td>
              <td className="rr-numeric whitespace-nowrap py-2.5 pl-4 text-right text-rr-slate">{cause.sharePct}%</td>
              <td className="rr-numeric whitespace-nowrap py-2.5 pl-4 text-right text-rr-slate">{cause.cumulativePct}%</td>
              <td className="rr-numeric whitespace-nowrap py-2.5 pl-4 text-right text-rr-slate">{cause.meanTatDays} d</td>
              <td className="rr-numeric whitespace-nowrap py-2.5 pl-4 text-right text-rr-ink">{formatUsd(cause.costUsd)}</td>
              <td className="whitespace-nowrap py-2.5 pl-4 text-right">
                <StatusPill status={cause.status}>{cause.status === "red" ? "Campaign" : cause.vitalFew ? "Vital few" : "Monitor"}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
