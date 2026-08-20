import {
  RISK_CONSEQUENCE_LABEL,
  RISK_LIKELIHOOD_LABEL,
  RISK_LIKELIHOOD_RANGE,
} from "@rr/data";
import type { RiskConsequenceBand, RiskLikelihoodBand, RiskMatrixCell } from "@rr/types";
import { cn, formatUsd, statusStyles } from "@rr/ui";

const LIKELIHOODS: RiskLikelihoodBand[] = [5, 4, 3, 2, 1];
const CONSEQUENCES: RiskConsequenceBand[] = [1, 2, 3, 4];
const CONSEQUENCE_BY_BAND: Record<RiskConsequenceBand, keyof typeof RISK_CONSEQUENCE_LABEL> = {
  1: "performance",
  2: "delay-cancellation",
  3: "aog",
  4: "ifsd",
};

/**
 * Likelihood of failure before the next maintenance opportunity against the
 * operational consequence if it is realised. Cells are coloured by the
 * tolerance band of the score, greyed when nothing sits in them.
 */
export function RiskMatrix({ cells }: { cells: RiskMatrixCell[] }) {
  const lookup = new Map(cells.map((cell) => [`${cell.likelihood}:${cell.consequence}`, cell]));
  const busiest = Math.max(1, ...cells.map((cell) => cell.exposureUsd));

  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-center">
        <span className="rr-label whitespace-nowrap text-rr-slate [writing-mode:vertical-rl] [transform:rotate(180deg)]">
          Likelihood before opportunity
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[7.5rem_repeat(4,minmax(0,1fr))] gap-1">
          {LIKELIHOODS.map((likelihood) => (
            <RowCells
              key={likelihood}
              likelihood={likelihood}
              lookup={lookup}
              busiest={busiest}
            />
          ))}
          <div />
          {CONSEQUENCES.map((consequence) => (
            <div key={consequence} className="pt-2 text-center">
              <p className="rr-label text-rr-ink">{RISK_CONSEQUENCE_LABEL[CONSEQUENCE_BY_BAND[consequence]]}</p>
            </div>
          ))}
        </div>
        <p className="rr-label mt-2 text-center text-rr-slate">Operational consequence</p>
      </div>
    </div>
  );
}

function RowCells({
  likelihood,
  lookup,
  busiest,
}: {
  likelihood: RiskLikelihoodBand;
  lookup: Map<string, RiskMatrixCell>;
  busiest: number;
}) {
  return (
    <>
      <div className="flex flex-col justify-center py-1 pr-2 text-right">
        <p className="text-xs font-semibold text-rr-ink">{RISK_LIKELIHOOD_LABEL[likelihood]}</p>
        <p className="rr-numeric text-[11px] text-rr-slate">{RISK_LIKELIHOOD_RANGE[likelihood]}</p>
      </div>
      {CONSEQUENCES.map((consequence) => {
        const cell = lookup.get(`${likelihood}:${consequence}`);
        const count = cell?.count ?? 0;
        const status = cell?.status ?? "grey";
        const styles = statusStyles[status];
        const intensity = count === 0 ? 0 : 0.25 + 0.75 * ((cell?.exposureUsd ?? 0) / busiest);
        return (
          <div
            key={consequence}
            className={cn(
              "relative overflow-hidden rounded-sm border px-3 py-3",
              count === 0 ? "border-rr-ink/8 bg-rr-mist/40" : styles.border,
            )}
            title={`${count} risks · ${formatUsd(cell?.exposureUsd ?? 0)} exposure · score ${likelihood * consequence}`}
          >
            {count > 0 ? (
              <div className={cn("absolute inset-0", styles.bg)} style={{ opacity: intensity }} aria-hidden />
            ) : null}
            <div className="relative">
              <p className={cn("rr-numeric text-xl font-semibold", count === 0 ? "text-rr-slate/50" : styles.text)}>
                {count}
              </p>
              <p className="rr-numeric mt-0.5 text-[11px] text-rr-slate">
                {count === 0 ? "—" : formatUsd(cell?.exposureUsd ?? 0)}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}
