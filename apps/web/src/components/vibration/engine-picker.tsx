"use client";

import { useRouter } from "next/navigation";
import { cn } from "@rr/ui";
import type { StatusLevel } from "@rr/types";

export interface EngineOption {
  engineId: string;
  esn: string;
  operatorCode: string;
  tail: string | null;
  status: StatusLevel;
  worstRatio: number;
}

/**
 * Focus-engine selector. Selection lives in the URL so the analysis panels stay
 * server-rendered and every view is shareable with a colleague.
 */
export function EnginePicker({ options, selectedId, shaft }: { options: EngineOption[]; selectedId: string; shaft: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="rr-label text-rr-slate">Focus engine</span>
      <select
        value={selectedId}
        aria-label="Select the engine to analyse"
        onChange={(event) => router.push(`/health/vibration?engine=${event.target.value}&shaft=${shaft}`, { scroll: false })}
        className={cn(
          "h-8 min-w-64 rounded-full border border-rr-ink/12 bg-surface px-3.5 text-xs font-medium text-rr-ink",
          "focus:border-rr-blue focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
        )}
      >
        {options.map((option) => (
          <option key={option.engineId} value={option.engineId}>
            {option.esn} · {option.operatorCode} {option.tail ?? "off wing"} · {Math.round(option.worstRatio * 100)}% of limit
          </option>
        ))}
      </select>
    </label>
  );
}
