/**
 * Deterministic pseudo-random helpers.
 *
 * The whole dataset is generated from a single seed so that every app, API
 * process and test run observes identical data without a database.
 */

export function createRng(seed: string | number) {
  let h = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return function next(): number {
    // mulberry32
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export const rand = {
  int(rng: Rng, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
  },
  float(rng: Rng, min: number, max: number, dp = 2): number {
    return round(rng() * (max - min) + min, dp);
  },
  pick<T>(rng: Rng, items: readonly T[]): T {
    return items[Math.floor(rng() * items.length)] as T;
  },
  weighted<T>(rng: Rng, items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let roll = rng() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item.value;
    }
    return items[items.length - 1]!.value;
  },
  bool(rng: Rng, probability = 0.5): boolean {
    return rng() < probability;
  },
  /** Approximately normal via central limit; clamped to +/- 3 sigma. */
  gaussian(rng: Rng, mean: number, stdDev: number): number {
    const u = (rng() + rng() + rng() + rng() + rng() + rng() - 3) / 3;
    return mean + u * 3 * stdDev;
  },
  sample<T>(rng: Rng, items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as T);
    }
    return out;
  },
};

export function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fixed "now" so that generated data is stable across processes and renders. */
export const NOW = new Date("2026-08-20T06:00:00.000Z");

export function iso(date: Date): string {
  return date.toISOString();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

export function daysAgo(days: number): Date {
  return addDays(NOW, -days);
}
