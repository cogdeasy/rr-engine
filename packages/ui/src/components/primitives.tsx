import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../utils";

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "light" | "dark";
  padded?: boolean;
}

export function Panel({ tone = "light", padded = true, className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        tone === "light" ? "rr-panel" : "rr-panel-dark text-white",
        padded && "p-6",
        className,
      )}
      {...props}
    />
  );
}

export interface PanelHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ title, subtitle, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 pb-5", className)}>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-rr-ink">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-rr-slate">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function StatusDot({ status, className }: { status: StatusLevel; className?: string }) {
  return (
    <span className={cn("inline-flex h-2 w-2 shrink-0 rounded-full", statusStyles[status].dot, className)} aria-hidden />
  );
}

export interface StatusPillProps {
  status: StatusLevel;
  children?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function StatusPill({ status, children, size = "sm", className }: StatusPillProps) {
  const s = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        s.bg,
        s.text,
        s.border,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        className,
      )}
    >
      <StatusDot status={status} />
      {children ?? s.label}
    </span>
  );
}

export function Badge({
  children,
  className,
  variant = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "neutral" | "brand" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        variant === "neutral" && "bg-white/[0.06] text-rr-slate",
        variant === "brand" && "bg-rr-blue-50 text-rr-blue-200",
        variant === "outline" && "border border-white/15 text-rr-slate",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "onDark";
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm",
        variant === "primary" && "bg-rr-blue text-white hover:bg-rr-blue-600",
        variant === "secondary" && "border border-white/20 bg-white/[0.04] text-rr-ink hover:bg-white/[0.09]",
        variant === "ghost" && "text-rr-slate hover:bg-white/[0.06] hover:text-rr-ink",
        variant === "danger" && "bg-status-red text-white hover:brightness-95",
        variant === "onDark" && "border border-white/60 text-white hover:bg-white/10",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-3xl">
        {eyebrow ? <p className="rr-label text-rr-blue-200">{eyebrow}</p> : null}
        <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-tight text-rr-ink">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rr-slate">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rr-panel flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-rr-ink">{title}</p>
      {description ? <p className="max-w-md text-xs text-rr-slate">{description}</p> : null}
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  status,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  status?: StatusLevel;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="rr-label text-rr-slate">{label}</span>
      <span className={cn("rr-numeric text-2xl font-semibold", status ? statusStyles[status].text : "text-rr-ink")}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-rr-slate">{unit}</span> : null}
      </span>
      {hint ? <span className="text-xs text-rr-slate">{hint}</span> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  status = "green",
  className,
}: {
  value: number;
  max?: number;
  status?: StatusLevel;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div className={cn("h-full rounded-full transition-[width]", statusStyles[status].dot)} style={{ width: `${pct}%` }} />
    </div>
  );
}
