import * as React from "react";
import type { KpiSnapshot, StatusLevel, Trend } from "@rr/types";
import { cn, formatNumber, statusStyles } from "../utils";
import { Sparkline } from "./charts";

export function TrendArrow({ trend, good }: { trend: Trend; good?: boolean }) {
  const glyph = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  return <span className={cn("text-[10px]", good === undefined ? "text-rr-slate" : good ? "text-status-green" : "text-status-red")}>{glyph}</span>;
}

export function KpiTile({ kpi, className }: { kpi: KpiSnapshot; className?: string }) {
  const dp = Math.abs(kpi.value) < 10 && !Number.isInteger(kpi.value) ? 3 : kpi.unit === "%" ? 2 : 0;
  return (
    <div className={cn("rr-panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="rr-label text-rr-slate">{kpi.label}</span>
        <span className={cn("h-1.5 w-1.5 rounded-full", statusStyles[kpi.status].dot)} aria-label={kpi.status} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("rr-numeric text-3xl font-semibold tracking-tight", statusStyles[kpi.status].text)}>
          {formatNumber(kpi.value, dp)}
        </span>
        <span className="text-xs font-medium text-rr-slate">{kpi.unit}</span>
      </div>
      <Sparkline points={kpi.history} status={kpi.status} height={28} />
      <div className="flex items-center justify-between text-[11px] text-rr-slate">
        <span className="inline-flex items-center gap-1">
          <TrendArrow trend={kpi.trend} />
          {kpi.deltaPct > 0 ? "+" : ""}
          {kpi.deltaPct}% vs prior
        </span>
        <span className="rr-numeric">
          target {formatNumber(kpi.target, dp)}
          {kpi.unit === "%" ? "%" : ""}
        </span>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  status = "grey",
  caption,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  status?: StatusLevel;
  caption?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rr-panel p-4", className)}>
      <p className="rr-label text-rr-slate">{label}</p>
      <p className={cn("rr-numeric mt-2 text-3xl font-semibold", status === "grey" ? "text-rr-ink" : statusStyles[status].text)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-rr-slate">{unit}</span> : null}
      </p>
      {caption ? <p className="mt-1 text-[11px] text-rr-slate">{caption}</p> : null}
    </div>
  );
}
