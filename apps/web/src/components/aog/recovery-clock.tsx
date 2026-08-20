"use client";

import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "@rr/ui";

function pad(value: number): string {
  return String(Math.floor(Math.abs(value))).padStart(2, "0");
}

function format(totalHours: number): string {
  const hours = Math.floor(Math.abs(totalHours));
  const minutes = (Math.abs(totalHours) - hours) * 60;
  const seconds = (minutes - Math.floor(minutes)) * 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Live recovery clock. The first paint uses the server-computed elapsed hours so
 * markup matches, then the clock takes over on the client and ticks every second.
 */
export function RecoveryClock({
  sinceIso,
  initialHours,
  status,
  size = "md",
  className,
}: {
  sinceIso: string;
  initialHours: number;
  status: StatusLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [hours, setHours] = React.useState(initialHours);

  React.useEffect(() => {
    const since = new Date(sinceIso).getTime();
    const tick = () => setHours((Date.now() - since) / 3_600_000);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sinceIso]);

  return (
    <span
      className={cn(
        "rr-numeric font-semibold tabular-nums",
        size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-base",
        statusStyles[status].text,
        className,
      )}
      aria-label={`Time since grounding: ${Math.floor(hours)} hours`}
    >
      {format(hours)}
    </span>
  );
}

/** Countdown to (or overrun against) the contractual return-to-service target. */
export function TargetCountdown({
  targetIso,
  initialHours,
  className,
}: {
  targetIso: string;
  initialHours: number;
  className?: string;
}) {
  const [hours, setHours] = React.useState(initialHours);

  React.useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => setHours((target - Date.now()) / 3_600_000);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);

  const breached = hours < 0;
  return (
    <span className={cn("rr-numeric text-sm font-semibold tabular-nums", breached ? "text-status-red" : hours < 8 ? "text-status-amber" : "text-rr-ink", className)}>
      {breached ? "+" : "−"}
      {format(hours)}
      <span className="ml-1 text-[11px] font-medium text-rr-slate">{breached ? "over target" : "to target"}</span>
    </span>
  );
}
