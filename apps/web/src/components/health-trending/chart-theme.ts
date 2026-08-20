/** Chart palette for the trending workbench. */

/**
 * Series colours are identity only — they are drawn from the RR blue/violet end
 * of the visualisation ramp so that red, amber and green stay reserved for
 * operational state.
 */
export const SERIES_COLOURS = ["#10069f", "#00a3d3", "#7b4bd8", "#3b32c2", "#4b4f77", "#0b0d33"] as const;

export const STATUS_COLOURS = {
  red: "#d81e2b",
  amber: "#f08c00",
  green: "#0a8754",
  grey: "#6b7089",
} as const;

export const AXIS_COLOUR = "#c9cbe0";
export const AXIS_TEXT = "#4b4f77";
export const GRID_COLOUR = "rgba(5, 6, 31, 0.07)";

export function seriesColour(index: number): string {
  return SERIES_COLOURS[index % SERIES_COLOURS.length]!;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function monthDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
