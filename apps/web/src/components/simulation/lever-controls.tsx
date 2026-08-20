"use client";

import * as React from "react";
import type { SimulationBaseline, SimulationLevers, WorkscopeLevel } from "@rr/types";
import { LEVER_RANGES, WORKSCOPE_LEVELS } from "@rr/data";
import { Button, cn, formatNumber } from "@rr/ui";

/**
 * The five operating-profile levers. Every control is a native input so it is
 * keyboard operable, and each one shows how far it has moved from the profile
 * the engine flies today.
 */

function LeverSlider({
  id,
  label,
  value,
  baselineValue,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  baselineValue: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  hint: string;
  onChange: (value: number) => void;
}) {
  const changed = value !== baselineValue;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="rr-label text-rr-slate">
          {label}
        </label>
        <span className={cn("rr-numeric text-sm font-semibold", changed ? "text-rr-blue" : "text-rr-ink")}>
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-rr-mist accent-rr-blue outline-none focus-visible:ring-2 focus-visible:ring-rr-blue/40"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1.5 text-[11px] leading-snug text-rr-slate">
        {changed ? (
          <span className="text-rr-blue">Flown today: {format(baselineValue)}. </span>
        ) : (
          <span>As flown today. </span>
        )}
        {hint}
      </p>
    </div>
  );
}

export function LeverControls({
  baseline,
  levers,
  onChange,
  onReset,
  onApplyRecommendation,
  removalDateLabel,
}: {
  baseline: SimulationBaseline;
  levers: SimulationLevers;
  onChange: (levers: SimulationLevers) => void;
  onReset: () => void;
  onApplyRecommendation: () => void;
  removalDateLabel: string;
}) {
  const set = <K extends keyof SimulationLevers>(key: K, value: SimulationLevers[K]) =>
    onChange({ ...levers, [key]: value });

  const minOffset = Math.max(LEVER_RANGES.removalOffsetCycles.min, -(baseline.plannedRemovalCycles - 120));

  return (
    <div className="space-y-6">
      <LeverSlider
        id="lever-removal"
        label="Removal date"
        value={levers.removalOffsetCycles}
        baselineValue={baseline.levers.removalOffsetCycles}
        min={minOffset}
        max={LEVER_RANGES.removalOffsetCycles.max}
        step={LEVER_RANGES.removalOffsetCycles.step}
        format={(v) => `${v > 0 ? "+" : ""}${formatNumber(v)} cyc`}
        hint={`Removal falls on ${removalDateLabel}; plan is ${formatNumber(baseline.plannedRemovalCycles)} cycles away.`}
        onChange={(v) => set("removalOffsetCycles", v)}
      />
      <LeverSlider
        id="lever-derate"
        label="Take-off derate"
        value={levers.deratePct}
        baselineValue={baseline.levers.deratePct}
        min={LEVER_RANGES.deratePct.min}
        max={LEVER_RANGES.deratePct.max}
        step={LEVER_RANGES.deratePct.step}
        format={(v) => `${v}%`}
        hint="Reduced take-off thrust slows EGT margin decay but adds a small cruise fuel penalty."
        onChange={(v) => set("deratePct", v)}
      />
      <LeverSlider
        id="lever-severity"
        label="Route severity mix"
        value={levers.routeSeverity}
        baselineValue={baseline.levers.routeSeverity}
        min={LEVER_RANGES.routeSeverity.min}
        max={LEVER_RANGES.routeSeverity.max}
        step={LEVER_RANGES.routeSeverity.step}
        format={(v) => `${v.toFixed(1)} / 5`}
        hint="1 is temperate short-haul, 5 is hot, sandy and high-cycle rotations."
        onChange={(v) => set("routeSeverity", v)}
      />
      <LeverSlider
        id="lever-wash"
        label="Wash interval"
        value={levers.washIntervalDays}
        baselineValue={baseline.levers.washIntervalDays}
        min={LEVER_RANGES.washIntervalDays.min}
        max={LEVER_RANGES.washIntervalDays.max}
        step={LEVER_RANGES.washIntervalDays.step}
        format={(v) => (v === 0 ? "No washes" : `${v} days`)}
        hint="On-wing water washes recover compressor efficiency, with diminishing returns as the interval shortens."
        onChange={(v) => set("washIntervalDays", v)}
      />

      <div>
        <span className="rr-label text-rr-slate">Workscope level</span>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-sm bg-rr-mist p-1" role="group" aria-label="Workscope level">
          {WORKSCOPE_LEVELS.map((option) => {
            const active = levers.workscope === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => set("workscope", option.id as WorkscopeLevel)}
                className={cn(
                  "rounded-sm px-2 py-2 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rr-blue",
                  active ? "bg-white text-rr-blue shadow-[0_1px_2px_rgba(5,6,31,0.08)]" : "text-rr-slate hover:text-rr-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-rr-slate">
          {WORKSCOPE_LEVELS.find((w) => w.id === levers.workscope)?.description}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-rr-ink/8 pt-4">
        <Button type="button" size="sm" onClick={onApplyRecommendation}>
          Apply recommendation
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onReset}>
          Reset to as-flown
        </Button>
      </div>
    </div>
  );
}
