import { cn, formatNumber } from "@rr/ui";

/**
 * Quantifies what the shop visit bought: the EGT margin the engine had on wing
 * immediately before removal, the margin measured on the bed, and the margin
 * the build standard delivers when new.
 */
export function MarginRestoration({
  preRemovalC,
  atTestC,
  newEngineC,
  restorationPct,
  compact = false,
}: {
  preRemovalC: number;
  atTestC: number;
  newEngineC: number;
  restorationPct: number;
  compact?: boolean;
}) {
  const scale = Math.max(newEngineC, atTestC, 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const status = restorationPct >= 85 ? "green" : restorationPct >= 70 ? "amber" : "red";
  const statusText = { green: "text-status-green", amber: "text-status-amber", red: "text-status-red" }[status];
  const statusBar = { green: "bg-status-green", amber: "bg-status-amber", red: "bg-status-red" }[status];

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="rr-label text-rr-slate">Margin restored</p>
          <p className={cn("rr-numeric mt-1 font-semibold", compact ? "text-2xl" : "text-4xl", statusText)}>
            {formatNumber(restorationPct, 1)}
            <span className="ml-1 text-sm font-medium text-rr-slate">% of new</span>
          </p>
        </div>
        <p className="rr-numeric text-right text-xs text-rr-slate">
          +{formatNumber(Math.max(0, atTestC - preRemovalC), 1)}°C recovered
          <br />
          {formatNumber(Math.max(0, newEngineC - atTestC), 1)}°C short of new
        </p>
      </div>

      <div className="mt-4 space-y-2.5">
        <Row label="Pre-removal, on wing" value={preRemovalC} width={pct(preRemovalC)} bar="bg-rr-slate/40" />
        <Row label="At test cell" value={atTestC} width={pct(atTestC)} bar={statusBar} emphasis />
        <Row label="New engine, build standard" value={newEngineC} width={pct(newEngineC)} bar="bg-rr-blue/25" />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  width,
  bar,
  emphasis,
}: {
  label: string;
  value: number;
  width: string;
  bar: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={cn(emphasis ? "font-semibold text-rr-ink" : "text-rr-slate")}>{label}</span>
        <span className="rr-numeric text-rr-slate">{formatNumber(value, 1)}°C</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-rr-mist">
        <div className={cn("h-full rounded-full", bar)} style={{ width }} />
      </div>
    </div>
  );
}
