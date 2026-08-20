"use client";

import * as React from "react";
import type { FacetOption } from "@rr/types";
import { cn } from "@rr/ui";

/**
 * Multi-select facet used by the engine register filter bar. Keyboard operable:
 * the trigger is a button, the panel is a fieldset of checkboxes and Escape
 * closes it.
 */
export function FacetSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
          selected.length > 0
            ? "border-rr-blue bg-rr-blue-50 text-rr-blue"
            : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
        )}
      >
        {label}
        {selected.length > 0 ? <span className="rr-numeric">{selected.length}</span> : null}
        <span aria-hidden className="text-[9px] opacity-60">
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-9 z-30 max-h-72 w-64 overflow-y-auto rounded-sm border border-rr-ink/10 bg-white p-1 shadow-[0_8px_24px_rgba(5,6,31,0.08)]">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-xs text-rr-ink hover:bg-rr-mist"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="h-3.5 w-3.5 accent-rr-blue"
              />
              <span className="flex-1 truncate capitalize">{option.label}</span>
              <span className="rr-numeric text-[11px] text-rr-slate">{option.count}</span>
            </label>
          ))}
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-sm px-2.5 py-1.5 text-left text-[11px] font-semibold text-rr-blue hover:bg-rr-blue-50"
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
