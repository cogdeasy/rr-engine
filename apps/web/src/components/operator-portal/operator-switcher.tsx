import Link from "next/link";
import type { OperatorPortalOption } from "@rr/types";
import { StatusDot, cn } from "@rr/ui";

/**
 * Operator switcher. Server-rendered links so the whole portal stays a server
 * component and remains keyboard navigable without client JavaScript.
 */
export function OperatorSwitcher({
  options,
  activeId,
}: {
  options: OperatorPortalOption[];
  activeId: string;
}) {
  return (
    <nav aria-label="Select operator" className="flex flex-wrap items-center gap-2">
      <span className="rr-label mr-1 text-rr-slate">Operator</span>
      {options.map((option) => {
        const active = option.id === activeId;
        return (
          <Link
            key={option.id}
            href={`/commercial/operator-portal?operator=${option.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rr-blue",
              active
                ? "border-rr-blue bg-rr-blue text-white"
                : "border-rr-ink/12 bg-white text-rr-slate hover:border-rr-blue/40 hover:text-rr-blue",
            )}
          >
            <StatusDot status={option.status} />
            <span>{option.code}</span>
            <span className={cn("font-medium", active ? "text-white/80" : "text-rr-slate/80")}>{option.name}</span>
            {option.openActions > 0 ? (
              <span className={cn("rr-numeric rounded-full px-1.5 text-[10px]", active ? "bg-white/20" : "bg-rr-mist")}>
                {option.openActions}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
