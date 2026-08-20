import type { AcknowledgementState, EscalationEventKind, NotificationChannel, StatusLevel } from "@rr/types";

/** Compact operational duration, e.g. "48m", "3h 12m", "2d 4h". */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs}m`;
  const hours = Math.floor(abs / 60);
  if (hours < 48) {
    const rest = abs % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/** SLA countdown text: negative remaining reads as an overdue breach. */
export function formatCountdown(remainingMinutes: number): string {
  return remainingMinutes < 0 ? `${formatDuration(remainingMinutes)} over` : `${formatDuration(remainingMinutes)} left`;
}

export function ackLabel(state: AcknowledgementState): string {
  return { unacknowledged: "Unacknowledged", acknowledged: "Acknowledged", resolved: "Resolved" }[state];
}

export function ackStatus(state: AcknowledgementState, breached: boolean): StatusLevel {
  if (state === "unacknowledged") return "red";
  if (state === "resolved") return "green";
  return breached ? "amber" : "green";
}

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  console: "Console",
  email: "Email",
  sms: "SMS",
  phone: "Phone",
  acars: "ACARS",
  "operator-portal": "Operator portal",
};

export const EVENT_LABEL: Record<EscalationEventKind, string> = {
  raised: "Raised",
  notified: "Notified",
  viewed: "Viewed",
  acknowledged: "Acknowledged",
  escalated: "Escalated",
  reassigned: "Reassigned",
  resolved: "Resolved",
};

export const EVENT_STATUS: Record<EscalationEventKind, StatusLevel> = {
  raised: "red",
  notified: "grey",
  viewed: "grey",
  acknowledged: "green",
  escalated: "amber",
  reassigned: "grey",
  resolved: "green",
};
