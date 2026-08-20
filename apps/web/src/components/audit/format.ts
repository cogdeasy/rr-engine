import type { AuditCategory, AuditEntityType } from "@rr/types";

/**
 * The ledger is stored and displayed in UTC. Formatting through explicit UTC
 * parts keeps server and client renders byte-identical regardless of the
 * viewer's timezone.
 */
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const shortFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

export function formatTimeUtc(iso: string): string {
  return `${timeFormatter.format(new Date(iso))}Z`;
}

export function formatShortUtc(iso: string): string {
  return shortFormatter.format(new Date(iso));
}

export function formatAge(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  "alert-disposition": "Alert disposition",
  "work-order": "Work order",
  "sign-off": "Sign-off",
  configuration: "Configuration",
  compliance: "Compliance",
  commercial: "Commercial",
};

export const ENTITY_LABELS: Record<AuditEntityType, string> = {
  Engine: "Engine",
  Alert: "Alert",
  WorkOrder: "Work order",
  TaskCard: "Task card",
  ServiceBulletin: "SB / AD",
  Contract: "Contract",
  Configuration: "Configuration",
};

export function actionLabel(action: string): string {
  const verb = action.split(".").slice(1).join(".");
  return verb.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
