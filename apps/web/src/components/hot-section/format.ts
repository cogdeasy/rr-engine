/** Shared formatting for the hot section module. */

/** Days until margin exhaustion, expressed the way a planner reads it. */
export function formatHorizon(days: number): string {
  if (days <= 0) return "exhausted";
  if (days < 90) return `${days} d`;
  if (days < 730) return `${Math.round(days / 30)} mo`;
  if (days > 1825) return "5 yr+";
  return `${(days / 365).toFixed(1)} yr`;
}
