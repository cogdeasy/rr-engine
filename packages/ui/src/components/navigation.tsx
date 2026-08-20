"use client";

import * as React from "react";
import { cn } from "../utils";

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: React.ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 border-b border-rr-ink/10", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.id ? "border-rr-blue text-rr-blue" : "border-transparent text-rr-slate hover:text-rr-ink",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="rr-numeric ml-1.5 text-[11px] text-rr-slate">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-rr-blue bg-rr-blue text-white" : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
      )}
    >
      {label}
      {count !== undefined ? <span className="rr-numeric opacity-70">{count}</span> : null}
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-8 w-56 rounded-full border border-rr-ink/12 bg-surface px-3.5 text-xs text-rr-ink placeholder:text-rr-slate/70 focus:border-rr-blue focus:outline-none",
        className,
      )}
    />
  );
}
