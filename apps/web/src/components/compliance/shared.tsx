import type { ComplianceDisposition, ComplianceLimitDriver } from "@rr/types";
import { Badge, cn } from "@rr/ui";

/** Bulletin classification badge — AD and ASB carry regulatory force. */
export function KindBadge({ kind, mandatory }: { kind: "SB" | "AD" | "ASB"; mandatory: boolean }) {
  return (
    <span
      className={cn(
        "rr-numeric inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
        mandatory ? "bg-rr-blue text-white" : "bg-rr-mist text-rr-slate",
      )}
      title={mandatory ? "Mandatory — regulatory compliance required" : "Recommended service bulletin"}
    >
      {kind}
    </span>
  );
}

export const DISPOSITION_LABEL: Record<ComplianceDisposition, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  planned: "Planned",
  embodied: "Embodied",
  "not-applicable": "Not applicable",
};

export const LIMIT_LABEL: Record<ComplianceLimitDriver, string> = {
  calendar: "Calendar",
  hours: "Flight hours",
  cycles: "Flight cycles",
};

/** Days remaining rendered as the number an engineer acts on. */
export function DaysRemaining({ days, className }: { days: number; className?: string }) {
  const overdue = days < 0;
  return (
    <span
      className={cn(
        "rr-numeric font-semibold",
        overdue ? "text-status-red" : days <= 90 ? "text-status-amber" : "text-rr-ink",
        className,
      )}
    >
      {overdue ? `+${Math.abs(days)}` : days}
      <span className="ml-1 text-[10px] font-medium text-rr-slate">{overdue ? "days late" : "days"}</span>
    </span>
  );
}

export function ComplianceBar({ pct, status }: { pct: number; status: "red" | "amber" | "green" | "grey" }) {
  const fill = { red: "bg-status-red", amber: "bg-status-amber", green: "bg-status-green", grey: "bg-status-grey" }[status];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-rr-mist" role="img" aria-label={`${pct}% embodied`}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function MicroLabel({ children }: { children: React.ReactNode }) {
  return <p className="rr-label text-rr-slate">{children}</p>;
}

export function BundleBadge({ reference }: { reference: string }) {
  return <Badge variant="brand">Bundle · {reference}</Badge>;
}
