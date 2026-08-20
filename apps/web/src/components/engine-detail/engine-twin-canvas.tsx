"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, ContactShadows, Html, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import type { ModuleCode, ModuleCondition, StatusLevel } from "@rr/types";
import { moduleCodeForGltfNode } from "@rr/data";

/**
 * The interactive Rolls-Royce engine twin.
 *
 * Geometry is the official Rolls-Royce Discover Engines GLB for the engine
 * family, loaded through a DRACO-enabled loader. Mesh names in those assets are
 * organised by build module, which lets us bind them to the maintenance module
 * breakdown, tint red/amber modules and hang hotspots off their centroids.
 */

const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";

const STATUS_EMISSIVE: Record<StatusLevel, { colour: string; intensity: number }> = {
  red: { colour: "#d81e2b", intensity: 0.55 },
  amber: { colour: "#f08c00", intensity: 0.42 },
  green: { colour: "#0a8754", intensity: 0.05 },
  grey: { colour: "#6b7089", intensity: 0 },
};

const SELECTED_EMISSIVE = { colour: "#3d31ff", intensity: 0.75 };

export interface EngineTwinCanvasProps {
  /** Ordered candidate sources — the CMS URL first, then the local cache. */
  sources: string[];
  modules: ModuleCondition[];
  selectedModule: ModuleCode | null;
  onSelectModule: (code: ModuleCode | null) => void;
  exploded: boolean;
  explodeClip: string;
  recombineClip: string;
  onAnimationsResolved?: (clips: string[]) => void;
  onLoadFailed?: () => void;
}

interface MeshBinding {
  mesh: THREE.Mesh;
  code: ModuleCode;
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

function isStandardMaterial(material: THREE.Material | THREE.Material[]): material is THREE.MeshStandardMaterial {
  return !Array.isArray(material) && (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

function EngineModel({
  src,
  modules,
  selectedModule,
  onSelectModule,
  exploded,
  explodeClip,
  recombineClip,
  onAnimationsResolved,
}: {
  src: string;
  modules: ModuleCondition[];
  selectedModule: ModuleCode | null;
  onSelectModule: (code: ModuleCode | null) => void;
  exploded: boolean;
  explodeClip: string;
  recombineClip: string;
  onAnimationsResolved?: (clips: string[]) => void;
}) {
  const { scene, animations } = useGLTF(src, DRACO_DECODER_PATH);
  const group = React.useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  const [bindings, setBindings] = React.useState<MeshBinding[]>([]);

  const statusByModule = React.useMemo(() => {
    const map = new Map<ModuleCode, StatusLevel>();
    for (const mod of modules) map.set(mod.code, mod.status);
    return map;
  }, [modules]);

  // Bind meshes to maintenance modules once per asset.
  React.useEffect(() => {
    const next: MeshBinding[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (/collision/i.test(object.name)) {
        object.visible = false;
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
      const code = moduleCodeForGltfNode(object.name);
      if (!code || !isStandardMaterial(object.material)) return;
      const material = object.material.clone();
      object.material = material;
      next.push({
        mesh: object,
        code,
        material,
        baseEmissive: material.emissive.clone(),
        baseIntensity: material.emissiveIntensity,
      });
    });
    setBindings(next);
    onAnimationsResolved?.(animations.map((clip) => clip.name));
    return () => {
      for (const binding of next) binding.material.dispose();
    };
  }, [scene, animations, onAnimationsResolved]);

  // Status-coloured emissive tint; selection always wins so the click reads.
  React.useEffect(() => {
    for (const binding of bindings) {
      const selected = binding.code === selectedModule;
      const status = statusByModule.get(binding.code) ?? "grey";
      const tint = selected ? SELECTED_EMISSIVE : STATUS_EMISSIVE[status];
      const dimmed = selectedModule !== null && !selected;
      if (!selected && status === "green") {
        binding.material.emissive.copy(binding.baseEmissive);
        binding.material.emissiveIntensity = binding.baseIntensity;
      } else {
        binding.material.emissive.set(tint.colour);
        binding.material.emissiveIntensity = tint.intensity;
      }
      binding.material.transparent = dimmed;
      binding.material.opacity = dimmed ? 0.32 : 1;
      binding.material.needsUpdate = true;
    }
  }, [bindings, selectedModule, statusByModule]);

  // Cutaway / exploded view, driven by the asset's own animation clips.
  React.useEffect(() => {
    const forward = actions[explodeClip];
    const backward = actions[recombineClip];
    const clip = exploded ? forward : backward;
    if (!clip) return;
    (exploded ? backward : forward)?.stop();
    clip.reset();
    clip.setLoop(THREE.LoopOnce, 1);
    clip.clampWhenFinished = true;
    clip.timeScale = 1;
    clip.play();
  }, [actions, exploded, explodeClip, recombineClip]);

  const hotspots = React.useMemo(() => {
    if (bindings.length === 0) return [];
    const byCode = new Map<ModuleCode, THREE.Box3>();
    for (const binding of bindings) {
      const box = new THREE.Box3().setFromObject(binding.mesh);
      const existing = byCode.get(binding.code);
      byCode.set(binding.code, existing ? existing.union(box) : box);
    }
    return modules
      .filter((mod) => byCode.has(mod.code))
      .map((mod) => {
        const centre = new THREE.Vector3();
        byCode.get(mod.code)!.getCenter(centre);
        return { mod, position: centre };
      });
  }, [bindings, modules]);

  const handleClick = React.useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const code = moduleCodeForGltfNode(event.object.name);
      onSelectModule(code && code !== selectedModule ? code : null);
    },
    [onSelectModule, selectedModule],
  );

  return (
    <group ref={group}>
      <primitive object={scene} onClick={handleClick} />
      {hotspots.map(({ mod, position }) => (
        <Html key={mod.code} position={position} center distanceFactor={9} zIndexRange={[20, 0]}>
          <Hotspot
            mod={mod}
            selected={mod.code === selectedModule}
            onSelect={() => onSelectModule(mod.code === selectedModule ? null : mod.code)}
          />
        </Html>
      ))}
    </group>
  );
}

function Hotspot({
  mod,
  selected,
  onSelect,
}: {
  mod: ModuleCondition;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone =
    mod.status === "red"
      ? "border-status-red bg-status-red text-white"
      : mod.status === "amber"
        ? "border-status-amber bg-status-amber text-white"
        : "border-white/70 bg-white/85 text-rr-ink";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${mod.label} — ${mod.status} status`}
      aria-pressed={selected}
      className={[
        "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-sm transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        tone,
        selected ? "scale-110 ring-2 ring-white" : "hover:scale-105",
      ].join(" ")}
    >
      {mod.code}
    </button>
  );
}

class ModelBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LoadingCaption() {
  return (
    <Html center>
      <p className="rr-label whitespace-nowrap text-white/70">Loading engine geometry…</p>
    </Html>
  );
}

export function EngineTwinCanvas({
  sources,
  modules,
  selectedModule,
  onSelectModule,
  exploded,
  explodeClip,
  recombineClip,
  onAnimationsResolved,
  onLoadFailed,
}: EngineTwinCanvasProps) {
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const src = sources[sourceIndex];

  const handleError = React.useCallback(() => {
    setSourceIndex((index) => {
      const next = index + 1;
      if (next >= sources.length) {
        onLoadFailed?.();
        return index;
      }
      return next;
    });
  }, [sources.length, onLoadFailed]);

  if (!src) return null;

  return (
    <Canvas
      key={src}
      camera={{ position: [3.4, 1.4, 3.8], fov: 38 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      className="h-full w-full"
    >
      <color attach="background" args={["#05061f"]} />
      <hemisphereLight intensity={0.55} groundColor="#05061f" />
      <directionalLight position={[6, 8, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#8f9bff" />
      <React.Suspense fallback={<LoadingCaption />}>
        <ModelBoundary onError={handleError} fallback={null}>
          <Bounds fit clip observe margin={1.15}>
            <EngineModel
              src={src}
              modules={modules}
              selectedModule={selectedModule}
              onSelectModule={onSelectModule}
              exploded={exploded}
              explodeClip={explodeClip}
              recombineClip={recombineClip}
              onAnimationsResolved={onAnimationsResolved}
            />
          </Bounds>
        </ModelBoundary>
      </React.Suspense>
      <ContactShadows position={[0, -1.1, 0]} opacity={0.35} scale={14} blur={2.6} far={4} />
      <OrbitControls makeDefault enablePan={false} minDistance={1.6} maxDistance={12} autoRotate={false} />
    </Canvas>
  );
}

export default EngineTwinCanvas;
