/**
 * Equirectangular projection helpers for the fleet map.
 *
 * The map is a plain SVG — no tile provider, no mapping SDK — so every
 * geographic feature is projected here into the fixed 1000 x 460 viewBox.
 */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 460;
/** Latitude window: the fleet never operates beyond these bounds. */
export const LAT_MAX = 78;
export const LAT_MIN = -56;

export interface Coord {
  lat: number;
  lon: number;
}

export function project({ lat, lon }: Coord): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_HEIGHT;
  return { x, y };
}

/** Ring points are stored flat as [lon, lat, lon, lat, ...]. */
export function ringToPath(ring: number[]): string {
  let path = "";
  for (let i = 0; i < ring.length; i += 2) {
    const { x, y } = project({ lon: ring[i]!, lat: ring[i + 1]! });
    path += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${path}Z`;
}

function slerp(from: Coord, to: Coord, fraction: number): Coord {
  const toRad = Math.PI / 180;
  const lat1 = from.lat * toRad;
  const lon1 = from.lon * toRad;
  const lat2 = to.lat * toRad;
  const lon2 = to.lon * toRad;
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2),
      ),
    );
  if (d === 0) return from;
  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);
  return { lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

/**
 * Great-circle arc between two airports, sampled and split where it crosses the
 * antimeridian so the path never draws a spurious line back across the map.
 */
export function greatCirclePath(from: Coord, to: Coord, fraction = 1, samples = 64): string {
  let path = "";
  let previousLon: number | null = null;
  let penDown = false;
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * fraction;
    const point = slerp(from, to, t);
    const { x, y } = project(point);
    const wrapped = previousLon !== null && Math.abs(point.lon - previousLon) > 180;
    if (!penDown || wrapped) {
      path += `M${x.toFixed(1)},${y.toFixed(1)}`;
      penDown = true;
    } else {
      path += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    previousLon = point.lon;
  }
  return path;
}

export const GRATICULE_LONS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
export const GRATICULE_LATS = [60, 40, 20, 0, -20, -40];
