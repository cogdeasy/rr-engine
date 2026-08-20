import Link from "next/link";
import type { SimulationCandidate } from "@rr/types";
import { StatusPill, cn, formatNumber, formatUsd, statusStyles } from "@rr/ui";

/**
 * Engines worth simulating, worst condition first. Selection is a link so the
 * chosen engine survives a reload and can be shared with a colleague.
 */
export function EnginePicker({
  candidates,
  selectedEngineId,
}: {
  candidates: SimulationCandidate[];
  selectedEngineId: string;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {candidates.map((candidate) => {
        const selected = candidate.engineId === selectedEngineId;
        return (
          <li key={candidate.engineId}>
            <Link
              href={`/predict/simulation?engine=${candidate.engineId}`}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "block rounded-sm border px-3 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rr-blue",
                selected ? "border-rr-blue bg-rr-blue-50" : "border-rr-ink/8 bg-white hover:border-rr-blue/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-rr-ink">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusStyles[candidate.status].dot)} aria-hidden />
                  {candidate.esn}
                </span>
                <StatusPill status={candidate.status}>{(candidate.unscheduledRemovalRisk * 100).toFixed(0)}%</StatusPill>
              </div>
              <p className="mt-1 truncate text-[11px] text-rr-slate">
                {candidate.family} · {candidate.operatorCode} · {candidate.aircraftTail}
              </p>
              <p className="rr-numeric mt-1.5 text-[11px] text-rr-slate">
                {candidate.egtMargin} °C margin · {formatNumber(candidate.plannedRemovalCycles)} cyc to plan ·{" "}
                <span className="font-semibold text-rr-blue">{formatUsd(candidate.opportunityUsd)}</span> opportunity
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
