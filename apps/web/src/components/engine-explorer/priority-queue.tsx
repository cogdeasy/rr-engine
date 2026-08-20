import Link from "next/link";
import type { EngineRegisterRow } from "@rr/types";
import { StatusPill, cn, formatNumber } from "@rr/ui";

/**
 * The decision the Engine explorer exists to support: the next engines to work,
 * each with the evidence that put it at the top of the queue and the single
 * action a controller should take next.
 */
export function PriorityQueue({ rows }: { rows: EngineRegisterRow[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {rows.map((row) => (
        <article key={row.engineId} className="rounded-sm border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="rr-label text-rr-blue-200">Priority {row.priorityRank}</p>
              <Link href={`/engines/${row.engineId}`} className="rr-numeric text-lg font-semibold text-white hover:underline">
                {row.esn}
              </Link>
              <p className="text-[11px] text-rr-cloud/70">
                {row.family} · {row.operatorCode} · {row.aircraftTail ?? "off wing"}
              </p>
            </div>
            <StatusPill status={row.status} />
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
            <QueueStat label="EGT margin" value={`${row.egtMargin.toFixed(1)}°C`} status={row.egtMarginStatus} />
            <QueueStat label="RUL" value={`${formatNumber(row.rulCycles)} cyc`} status={row.rulStatus} />
            <QueueStat
              label="Shop visit"
              value={row.daysToShopVisit === null ? "—" : `${formatNumber(row.daysToShopVisit)} d`}
              status={row.shopVisitStatus}
            />
          </dl>

          <ul className="mt-3 space-y-1">
            {row.drivers.slice(0, 2).map((driver) => (
              <li key={driver.code} className="flex items-start gap-2 text-[11px] leading-snug text-rr-cloud/80">
                <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rr-blue-200" />
                {driver.label}
              </li>
            ))}
          </ul>

          <Link
            href={row.recommendedActionRoute}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-rr-blue transition-colors hover:bg-rr-blue-50"
          >
            {row.recommendedAction}
            <span aria-hidden>›</span>
          </Link>
        </article>
      ))}
    </div>
  );
}

function QueueStat({ label, value, status }: { label: string; value: string; status: EngineRegisterRow["status"] }) {
  const colour = {
    red: "text-status-red",
    amber: "text-status-amber",
    green: "text-status-green",
    grey: "text-rr-cloud/70",
  }[status];
  return (
    <div>
      <dt className="rr-label text-rr-cloud/50">{label}</dt>
      <dd className={cn("rr-numeric mt-0.5 text-sm font-semibold", colour)}>{value}</dd>
    </div>
  );
}
