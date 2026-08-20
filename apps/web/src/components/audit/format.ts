import type { AuditCategory, AuditEntityType } from "@rr/types";

/**
 * The ledger is stored and displayed in UTC. Formatting through explicit UTC
 * parts keeps server and client renders byte-identical regardless of the
 * viewer's timezone.
 */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value: number) => String(value).padStart(2, "0");

export function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatTimeUtc(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

export function formatShortUtc(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCFullYear()}`;
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

/** Change values are stored verbatim; render timestamps in the ledger's UTC style. */
export function formatChangeValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && ISO_LIKE.test(value)) {
    return `${formatShortUtc(value)} ${formatTimeUtc(value)}`;
  }
  return String(value);
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
