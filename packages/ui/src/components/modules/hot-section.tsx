import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/**
 * Presentational primitives shared by the hot section condition module.
 *
 * Colour follows the platform rule: red = act now, amber = watchlist, green =
 * nominal, grey = no trustworthy evidence. Intensity within a status band
 * encodes how far through that band the reading sits, never anything else.
 */

const STATUS_RGB: Record<StatusLevel, string> = {
  red: "216, 30, 43",
  amber: "240, 140, 0",
  green: "10, 135, 84",
  grey: "107, 112, 137",
};

export function HeatCell({
  value,
  status,
  title,
  suffix,
  className,
}: {
  /** 0-100 distress index; higher is worse. */
  value: number;
  status: StatusLevel;
  title?: string;
  suffix?: string;
  className?: string;
}) {
  const intensity = status === "grey" ? 0.1 : 0.14 + Math.min(1, Math.max(0, value / 100)) * 0.46;
  return (
    <span
      title={title}
      className={cn(
        "rr-numeric flex h-9 w-full items-center justify-center rounded-sm text-[13px] font-semibold tabular-nums",
        status === "grey" ? "text-status-grey" : status === "amber" ? "text-rr-ink" : "text-rr-ink",
        className,
      )}
      style={{ backgroundColor: `rgba(${STATUS_RGB[status]}, ${intensity.toFixed(2)})` }}
    >
      {status === "grey" ? "—" : `${Math.round(value)}${suffix ?? ""}`}
    </span>
  );
}

/**
 * Stacked share of the deterioration rate by driver. Uses the brand blue ramp,
 * not the status palette, because attribution is categorical rather than
 * operational.
 */
const DRIVER_COLOURS = ["#10069f", "#3b32c2", "#a9a5e6"];

export function DriverAttributionBar({
  drivers,
  showLegend = false,
  className,
}: {
  drivers: { label: string; share: number; detail?: string }[];
  showLegend?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-rr-mist"
        role="img"
        aria-label={drivers.map((d) => `${d.label} ${Math.round(d.share * 100)}%`).join(", ")}
      >
        {drivers.map((driver, index) => (
          <span
            key={driver.label}
            title={`${driver.label} — ${Math.round(driver.share * 100)}%`}
            style={{ width: `${driver.share * 100}%`, backgroundColor: DRIVER_COLOURS[index % DRIVER_COLOURS.length] }}
          />
        ))}
      </div>
      {showLegend ? (
        <ul className="mt-3 space-y-2">
          {drivers.map((driver, index) => (
            <li key={driver.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: DRIVER_COLOURS[index % DRIVER_COLOURS.length] }}
              />
              <div className="min-w-0">
                <p className="flex items-baseline gap-2 text-[13px] font-medium text-rr-ink">
                  {driver.label}
                  <span className="rr-numeric text-xs text-rr-slate">{Math.round(driver.share * 100)}%</span>
                </p>
                {driver.detail ? <p className="text-[11px] leading-snug text-rr-slate">{driver.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Compact "why is this red" line used beside every red condition on the page. */
export function ReasonLine({ status, children }: { status: StatusLevel; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-snug", statusStyles[status].text)}>
      <span aria-hidden className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", statusStyles[status].dot)} />
      <span className="text-rr-slate">{children}</span>
    </p>
  );
}
