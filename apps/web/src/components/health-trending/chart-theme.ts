/** Chart palette for the trending workbench. */

/**
 * Series colours are identity only — they are drawn from the RR blue/violet end
 * of the visualisation ramp so that red, amber and green stay reserved for
 * operational state.
 */
export const SERIES_COLOURS = ["#6a63ff", "#35c8ff", "#b07cff", "#8b85ff", "#98a0c6", "#0b0d33"] as const;

export const STATUS_COLOURS = {
  red: "#ff5f6d",
  amber: "#ffb43d",
  green: "#2fd39b",
  grey: "#8f96bb",
} as const;

export const AXIS_COLOUR = "#c9cbe0";
export const AXIS_TEXT = "#98a0c6";
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
