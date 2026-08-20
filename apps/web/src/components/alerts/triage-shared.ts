import type { Alert, DispositionKind, TriageAlert } from "@rr/types";

export const DISPOSITION_LABELS: Record<DispositionKind, string> = {
  acknowledge: "Acknowledged",
  escalate: "Escalated",
  "raise-work-order": "Work order raised",
  "false-positive": "Marked false positive",
};

export const STATE_LABELS: Record<Alert["state"], string> = {
  new: "New",
  triaged: "Triaged",
  investigating: "Investigating",
  actioned: "Actioned",
  closed: "Closed",
  "false-positive": "False positive",
};

export const SEVERITY_ORDER: Alert["severity"][] = ["critical", "high", "medium", "low", "info"];

export function severityLabel(severity: Alert["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  if (hours < 72) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Hours left before the recommended action is late. Negative means overdue. */
export function hoursRemaining(item: TriageAlert): number | null {
  if (item.alert.timeToActionHours === null) return null;
  return Math.round(item.alert.timeToActionHours - item.ageHours);
}

/**
 * One sentence explaining the row's colour, so no red on the page is unexplained.
 */
export function colourRationale(item: TriageAlert): string {
  const remaining = hoursRemaining(item);
  const parts: string[] = [`${severityLabel(item.alert.severity)} severity`];
  if (remaining !== null && remaining <= 0) parts.push(`action deadline passed ${formatHours(-remaining)} ago`);
  else if (remaining !== null) parts.push(`action due in ${formatHours(remaining)}`);
  if (item.needsActionBeforeNextSector && item.hoursToNextSector !== null) {
    parts.push(`aircraft departs in ${formatHours(item.hoursToNextSector)}`);
  }
  if (item.alert.confidence !== undefined) parts.push(`model confidence ${Math.round(item.alert.confidence * 100)}%`);
  return `${parts.join(" · ")}.`;
}
