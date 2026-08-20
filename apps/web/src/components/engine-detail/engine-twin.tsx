"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { EngineTwinAsset, ModuleCode, ModuleCondition } from "@rr/types";
import { Badge, Button, ModuleConditionCard, StatusPill, cn, statusStyles } from "@rr/ui";

/**
 * Twin shell: owns module selection and the cutaway state, and keeps the WebGL
 * canvas behind a lazy boundary so the dossier still renders (and stays useful)
 * if the asset, the network or WebGL itself is unavailable.
 */

const EngineTwinCanvas = dynamic(() => import("./engine-twin-canvas").then((m) => m.EngineTwinCanvas), {
  ssr: false,
  loading: () => <TwinSkeleton />,
});

function TwinSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#05061f]">
      <div className="flex flex-col items-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-white/70" aria-hidden />
        <p className="rr-label text-white/60">Loading 3D engine twin</p>
      </div>
    </div>
  );
}

/** Poster shown when the GLB cannot be fetched or decoded. */
function TwinPoster({ label, modules }: { label: string; modules: ModuleCondition[] }) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-[#05061f] p-6 text-white">
      <div>
        <p className="rr-label text-white/50">3D twin unavailable</p>
        <p className="mt-1 text-sm text-white/80">
          The {label} model could not be loaded. Module condition below is unaffected.
        </p>
      </div>
      <div aria-hidden className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-1.5">
          {modules.map((mod) => (
            <span
              key={mod.code}
              className={cn("h-16 w-4 rounded-sm opacity-70", statusStyles[mod.status].dot)}
              style={{ height: `${40 + mod.lifeConsumedPct}px` }}
            />
          ))}
        </div>
      </div>
      <p className="rr-label text-white/40">Schematic module strip · height = life consumed</p>
    </div>
  );
}

export interface EngineTwinProps {
  asset: EngineTwinAsset | null;
  modules: ModuleCondition[];
  esn: string;
}

export function EngineTwin({ asset, modules, esn }: EngineTwinProps) {
  const [selected, setSelected] = React.useState<ModuleCode | null>(null);
  const [exploded, setExploded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [clips, setClips] = React.useState<string[]>([]);

  const sources = React.useMemo(() => (asset ? [asset.url, asset.localPath] : []), [asset]);
  const selectedModule = modules.find((mod) => mod.code === selected) ?? null;
  const canExplode = asset ? clips.includes(asset.explodeClip) && clips.includes(asset.recombineClip) : false;
  const worst = modules[0] ?? null;

  const handleAnimations = React.useCallback((names: string[]) => setClips(names), []);
  const handleFailure = React.useCallback(() => setFailed(true), []);

  return (
    <div className="rr-panel grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative min-h-[520px] bg-[#05061f]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
          <div className="pointer-events-auto">
            <p className="rr-label text-white/50">Interactive twin</p>
            <p className="text-sm font-semibold text-white">{asset?.label ?? "No model for this family"}</p>
            <p className="mt-0.5 text-[11px] text-white/50">
              {esn} · drag to orbit, scroll to zoom, click a module to inspect
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              variant="onDark"
              size="sm"
              onClick={() => setExploded((value) => !value)}
              disabled={!canExplode || failed}
              aria-pressed={exploded}
              title={canExplode ? undefined : "This asset has no cutaway animation"}
            >
              {exploded ? "Recombine" : "Cutaway"}
            </Button>
            {selected ? (
              <Button variant="onDark" size="sm" onClick={() => setSelected(null)}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="h-full min-h-[460px] w-full">
          {asset && !failed ? (
            <EngineTwinCanvas
              sources={sources}
              modules={modules}
              selectedModule={selected}
              onSelectModule={setSelected}
              exploded={exploded}
              explodeClip={asset.explodeClip}
              recombineClip={asset.recombineClip}
              onAnimationsResolved={handleAnimations}
              onLoadFailed={handleFailure}
            />
          ) : (
            <TwinPoster label={asset?.label ?? "engine"} modules={modules} />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-3 p-4 text-[11px] text-white/60">
          {(["red", "amber", "green"] as const).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", statusStyles[status].dot)} aria-hidden />
              {status === "red" ? "Act now" : status === "amber" ? "Watchlist" : "Nominal"}
            </span>
          ))}
        </div>
      </div>

      <aside className="flex flex-col border-t border-rr-ink/8 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-2 border-b border-rr-ink/8 px-4 py-3">
          <p className="rr-label text-rr-slate">Module inspector</p>
          {selectedModule ? <StatusPill status={selectedModule.status} /> : <Badge variant="outline">Nothing selected</Badge>}
        </div>

        <div className="min-h-0 shrink-0 overflow-y-auto p-4">
          {selectedModule ? (
            <ModuleConditionCard condition={selectedModule} compact />
          ) : (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-rr-slate">
                Select a module in the twin — or from the list below — to see its condition, live parameters and last
                inspection.
              </p>
              {worst ? (
                <div className={cn("rounded-sm border p-3", statusStyles[worst.status].bg, statusStyles[worst.status].border)}>
                  <p className="rr-label text-rr-slate">Worst module</p>
                  <p className="mt-1 text-sm font-semibold text-rr-ink">{worst.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-rr-slate">{worst.reason}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-rr-ink/8">
          {modules.map((mod) => (
            <li key={mod.code}>
              <button
                type="button"
                onClick={() => setSelected(mod.code === selected ? null : mod.code)}
                aria-pressed={mod.code === selected}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-rr-blue-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rr-blue",
                  mod.code === selected && "bg-rr-blue-50",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", statusStyles[mod.status].dot)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-rr-ink">{mod.label}</span>
                  <span className="block truncate text-[11px] text-rr-slate">{mod.reason}</span>
                </span>
                <span className="rr-numeric text-xs font-semibold text-rr-slate">{mod.lifeConsumedPct}%</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

export default EngineTwin;
