import * as React from "react";
import type { StatusLevel } from "@rr/types";
import { cn, statusStyles } from "../../utils";

/* ------------------------------------------------------------------ */
/* Synthetic probe frame                                               */
/* ------------------------------------------------------------------ */

function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function next(): number {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BorescopeFrameProps {
  /** Stable seed — the same seed always renders the same frame. */
  seed: string;
  /** Damage descriptor shown in the overlay, e.g. "crack". */
  damageType: string;
  /** Gas-path location shown in the overlay. */
  location: string;
  /** Clock position of the damage in the annulus, 1-12. */
  clockPosition: number;
  /** Measurement caption, e.g. "3.4 mm". */
  measurement: string;
  status: StatusLevel;
  timestamp?: string;
  probe?: string;
  /** Distinguishes SVG element ids when the same seed is rendered twice on a page. */
  instance?: string;
  className?: string;
}

const RETICLE = { red: "#ff5766", amber: "#ffb454", green: "#3ddc9b", grey: "#9aa0bd" } as const;

/**
 * A synthetic borescope frame.
 *
 * Real probe imagery is customer-confidential, so the platform renders a
 * deterministic schematic of the aerofoil annulus with the reported damage
 * marked in the operational status colour. Everything is derived from `seed`,
 * so a finding always renders the same frame.
 */
export function BorescopeFrame({
  seed,
  damageType,
  location,
  clockPosition,
  measurement,
  status,
  timestamp,
  probe,
  instance,
  className,
}: BorescopeFrameProps) {
  const rng = seededRandom(seed);
  const accent = RETICLE[status];
  const blades = 9;
  const angle = ((clockPosition % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const damageX = 160 + Math.cos(angle) * (46 + rng() * 22);
  const damageY = 120 + Math.sin(angle) * (32 + rng() * 16);
  const frameId = hashId(instance ? `${seed}#${instance}` : seed);
  const gradientId = `bs-vignette-${frameId}`;
  const glowId = `bs-glow-${frameId}`;

  return (
    <figure className={cn("relative overflow-hidden rounded-sm border border-rr-ink/12 bg-rr-ink", className)}>
      <svg
        viewBox="0 0 320 240"
        className="block w-full"
        role="img"
        aria-label={`Synthetic borescope frame: ${damageType} at ${location}, ${clockPosition} o'clock, measured ${measurement}`}
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="46%" r="62%">
            <stop offset="0%" stopColor="#2c3350" />
            <stop offset="55%" stopColor="#141a2e" />
            <stop offset="100%" stopColor="#05061f" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="320" height="240" fill={`url(#${gradientId})`} />

        {/* Aerofoil silhouettes receding into the annulus */}
        {Array.from({ length: blades }).map((_, i) => {
          const t = i / (blades - 1);
          const x = 20 + t * 280;
          const lean = -18 + rng() * 12;
          const height = 108 + rng() * 42;
          const width = 20 + rng() * 10;
          const shade = 0.1 + (1 - Math.abs(t - 0.5) * 1.6) * 0.22;
          return (
            <path
              key={i}
              d={`M${x},${210} C${x + lean * 0.4},${190} ${x + lean},${170} ${x + lean},${210 - height} L${x + lean + width},${210 - height + 14} C${x + lean + width},${180} ${x + width},${196} ${x + width},${210} Z`}
              fill={`rgba(190,200,235,${shade.toFixed(3)})`}
              stroke="rgba(220,228,255,0.16)"
              strokeWidth="0.6"
            />
          );
        })}

        {/* Combustion glow band */}
        <ellipse cx="160" cy="96" rx="150" ry="46" fill="rgba(120,140,220,0.07)" />

        {/* Sensor noise */}
        {Array.from({ length: 90 }).map((_, i) => (
          <circle
            key={`n${i}`}
            cx={rng() * 320}
            cy={rng() * 240}
            r={rng() * 0.9}
            fill="rgba(255,255,255,0.07)"
          />
        ))}

        {/* Damage site */}
        <circle cx={damageX} cy={damageY} r="34" fill={`url(#${glowId})`} />
        <DamageMark x={damageX} y={damageY} damageType={damageType} accent={accent} seed={seed} />

        {/* Measurement reticle */}
        <g stroke={accent} strokeWidth="1" fill="none" opacity="0.9">
          <circle cx={damageX} cy={damageY} r="21" strokeDasharray="4 4" />
          <line x1={damageX - 30} y1={damageY} x2={damageX - 24} y2={damageY} />
          <line x1={damageX + 24} y1={damageY} x2={damageX + 30} y2={damageY} />
          <line x1={damageX} y1={damageY - 30} x2={damageX} y2={damageY - 24} />
          <line x1={damageX} y1={damageY + 24} x2={damageX} y2={damageY + 30} />
        </g>
        <text
          x={damageX + 26}
          y={damageY - 24}
          fill={accent}
          fontSize="11"
          fontWeight="600"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {measurement}
        </text>

        {/* HUD */}
        <g style={{ fontFamily: "var(--font-mono, monospace)" }} fill="rgba(226,231,247,0.72)" fontSize="8.5">
          <text x="12" y="20" letterSpacing="1.6">
            {location.toUpperCase()}
          </text>
          <text x="12" y="32" letterSpacing="1.6">
            {clockPosition} O&apos;CLOCK
          </text>
          <text x="308" y="20" textAnchor="end" letterSpacing="1.6">
            {(probe ?? "IPLEX NX 6.0MM").toUpperCase()}
          </text>
          {timestamp ? (
            <text x="308" y="32" textAnchor="end" letterSpacing="1.6">
              {timestamp.toUpperCase()}
            </text>
          ) : null}
          <text x="12" y="228" letterSpacing="1.6">
            3D PHASE MEASUREMENT
          </text>
          <text x="308" y="228" textAnchor="end" letterSpacing="1.6">
            SYNTHETIC FRAME
          </text>
        </g>

        {/* Scale bar */}
        <g stroke="rgba(226,231,247,0.5)" strokeWidth="1">
          <line x1="230" y1="214" x2="290" y2="214" />
          <line x1="230" y1="210" x2="230" y2="218" />
          <line x1="290" y1="210" x2="290" y2="218" />
        </g>
        <text
          x="260"
          y="207"
          textAnchor="middle"
          fill="rgba(226,231,247,0.5)"
          fontSize="8"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          10 MM
        </text>

        {/* Lens vignette */}
        <rect width="320" height="240" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="22" opacity="0.35" />
      </svg>
    </figure>
  );
}

function hashId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) h = (h * 33) ^ seed.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function DamageMark({
  x,
  y,
  damageType,
  accent,
  seed,
}: {
  x: number;
  y: number;
  damageType: string;
  accent: string;
  seed: string;
}) {
  const rng = seededRandom(`${seed}:mark`);
  if (damageType.includes("crack")) {
    const points = Array.from({ length: 5 }).map((_, i) => {
      const t = i / 4;
      return `${(x - 12 + t * 24).toFixed(1)},${(y - 8 + t * 16 + (rng() - 0.5) * 7).toFixed(1)}`;
    });
    return <polyline points={points.join(" ")} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />;
  }
  if (damageType.includes("coating") || damageType.includes("spallation") || damageType.includes("missing")) {
    const path = Array.from({ length: 9 })
      .map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const r = 8 + rng() * 7;
        return `${i === 0 ? "M" : "L"}${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r * 0.75).toFixed(1)}`;
      })
      .join(" ");
    return <path d={`${path} Z`} fill={accent} fillOpacity="0.35" stroke={accent} strokeWidth="1.4" />;
  }
  if (damageType.includes("burn")) {
    return (
      <g>
        <ellipse cx={x} cy={y} rx="11" ry="8" fill="#05061f" stroke={accent} strokeWidth="1.8" />
        <ellipse cx={x} cy={y} rx="5" ry="3.5" fill={accent} fillOpacity="0.55" />
      </g>
    );
  }
  if (damageType.includes("blockage")) {
    return (
      <g fill={accent} fillOpacity="0.55" stroke={accent} strokeWidth="0.8">
        {Array.from({ length: 4 }).map((_, i) => (
          <circle key={i} cx={x - 9 + i * 6} cy={y + (i % 2 === 0 ? -2 : 3)} r="2.4" />
        ))}
      </g>
    );
  }
  if (damageType.includes("tip curl") || damageType.includes("distortion")) {
    return (
      <path
        d={`M${x - 13},${y + 7} C${x - 4},${y - 9} ${x + 6},${y - 11} ${x + 13},${y - 2}`}
        fill="none"
        stroke={accent}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    );
  }
  // Dents, nicks and erosion read as a shallow crater.
  return (
    <g>
      <ellipse cx={x} cy={y} rx="9" ry="6.5" fill={accent} fillOpacity="0.28" stroke={accent} strokeWidth="1.6" />
      <ellipse cx={x - 1.5} cy={y - 1} rx="3.5" ry="2.4" fill={accent} fillOpacity="0.5" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Limit bar                                                           */
/* ------------------------------------------------------------------ */

export interface BorescopeLimitBarProps {
  measured: number;
  serviceableLimit: number;
  repairableLimit: number;
  previous?: number | null;
  unit: string;
  className?: string;
}

/**
 * Where a measurement sits against the serviceable and repairable limits, with
 * the previous inspection's measurement marked so progression is visible.
 */
export function BorescopeLimitBar({
  measured,
  serviceableLimit,
  repairableLimit,
  previous,
  unit,
  className,
}: BorescopeLimitBarProps) {
  const max = Math.max(repairableLimit * 1.15, measured * 1.08);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const status: StatusLevel = measured > repairableLimit ? "red" : measured > serviceableLimit ? "red" : measured >= serviceableLimit * 0.8 ? "amber" : "green";

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-status-green-soft">
        <div className="absolute inset-y-0 bg-status-amber-soft" style={{ left: `${pct(serviceableLimit * 0.8)}%`, right: 0 }} />
        <div className="absolute inset-y-0 bg-status-red-soft" style={{ left: `${pct(serviceableLimit)}%`, right: 0 }} />
        <div className="absolute inset-y-0 w-px bg-status-amber" style={{ left: `${pct(serviceableLimit)}%` }} />
        <div className="absolute inset-y-0 w-px bg-status-red" style={{ left: `${pct(repairableLimit)}%` }} />
        {previous != null ? (
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-sm bg-rr-slate/60"
            style={{ left: `${pct(previous)}%` }}
            aria-hidden
          />
        ) : null}
        <div
          className={cn("absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-sm", statusStyles[status].dot)}
          style={{ left: `${pct(measured)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-rr-slate">
        <span className={cn("rr-numeric font-semibold", statusStyles[status].text)}>
          {measured} {unit}
        </span>
        <span className="rr-numeric">
          serviceable {serviceableLimit} {unit}
        </span>
        <span className="rr-numeric">
          repairable {repairableLimit} {unit}
        </span>
      </div>
    </div>
  );
}
