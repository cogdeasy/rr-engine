import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StatusLevel } from "@rr/types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const statusStyles: Record<StatusLevel, { text: string; bg: string; border: string; dot: string; label: string }> = {
  red: {
    text: "text-status-red",
    bg: "bg-status-red-soft",
    border: "border-status-red/30",
    dot: "bg-status-red",
    label: "Red",
  },
  amber: {
    text: "text-status-amber",
    bg: "bg-status-amber-soft",
    border: "border-status-amber/30",
    dot: "bg-status-amber",
    label: "Amber",
  },
  green: {
    text: "text-status-green",
    bg: "bg-status-green-soft",
    border: "border-status-green/30",
    dot: "bg-status-green",
    label: "Green",
  },
  grey: {
    text: "text-status-grey",
    bg: "bg-status-grey-soft",
    border: "border-status-grey/30",
    dot: "bg-status-grey",
    label: "No data",
  },
};

export function formatNumber(value: number, dp = 0): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string, now = new Date("2026-08-20T06:00:00.000Z")): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
