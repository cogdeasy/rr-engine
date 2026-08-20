"use client";

import * as React from "react";
import type { TraceabilityNode } from "@rr/types";
import { Badge, StatusDot, StatusPill, cn, formatNumber } from "@rr/ui";
import { SOURCE_LABEL } from "./labels";

/** Engine → module → part serial → source drill-down. */
export function TraceabilityTree({ esn, nodes }: { esn: string; nodes: TraceabilityNode[] }) {
  const firstGap = nodes.find((n) => !n.traceComplete)?.moduleCode;
  const [open, setOpen] = React.useState<string[]>(firstGap ? [firstGap] : nodes[0] ? [nodes[0].moduleCode] : []);

  function toggle(code: string) {
    setOpen((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  return (
    <div>
      <p className="rr-label mb-3 text-rr-slate">
        Engine <span className="rr-numeric text-rr-ink">{esn}</span>
      </p>
      <ul className="space-y-2">
        {nodes.map((node) => {
          const expanded = open.includes(node.moduleCode);
          const panelId = `trace-${node.moduleCode}`;
          const gapParts = node.parts.filter((p) => p.releaseCertificate === null).length;
          return (
            <li key={node.moduleCode} className="rounded-sm border border-rr-ink/10">
              <button
                type="button"
                onClick={() => toggle(node.moduleCode)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-rr-mist focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rr-blue"
              >
                <span aria-hidden className="rr-numeric w-3 text-[10px] text-rr-slate">
                  {expanded ? "−" : "+"}
                </span>
                <StatusDot status={node.traceComplete ? "green" : "red"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rr-ink">{node.label}</span>
                  <span className="rr-numeric block truncate text-[11px] text-rr-slate">
                    {node.serialNumber} · {SOURCE_LABEL[node.source]} · {node.parts.length} serialised parts
                  </span>
                </span>
                {gapParts > 0 ? (
                  <StatusPill status="red">
                    {gapParts} missing cert{gapParts > 1 ? "s" : ""}
                  </StatusPill>
                ) : (
                  <Badge variant="outline">Pack complete</Badge>
                )}
              </button>

              {expanded ? (
                <div id={panelId} className="overflow-x-auto border-t border-rr-ink/8">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-rr-mist/60">
                        <th className="rr-label px-3 py-2 text-left text-rr-slate">Part</th>
                        <th className="rr-label px-3 py-2 text-left text-rr-slate">Serial</th>
                        <th className="rr-label px-3 py-2 text-left text-rr-slate">Source</th>
                        <th className="rr-label px-3 py-2 text-left text-rr-slate">Supplier / batch</th>
                        <th className="rr-label px-3 py-2 text-right text-rr-slate">Cycles remaining</th>
                        <th className="rr-label px-3 py-2 text-left text-rr-slate">Release certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.parts.map((part) => (
                        <tr key={part.serialNumber} className="border-t border-rr-ink/5">
                          <td className="px-3 py-2">
                            <span className="block text-rr-ink">{part.description}</span>
                            <span className="rr-numeric block text-[11px] text-rr-slate">{part.partNumber}</span>
                          </td>
                          <td className="rr-numeric px-3 py-2 text-rr-ink">{part.serialNumber}</td>
                          <td className="px-3 py-2 text-rr-slate">{SOURCE_LABEL[part.source]}</td>
                          <td className="px-3 py-2 text-rr-slate">
                            <span className="block">{part.supplier}</span>
                            <span className="rr-numeric block text-[11px] text-rr-slate/80">{part.batch}</span>
                          </td>
                          <td className="rr-numeric px-3 py-2 text-right">
                            {part.lifeLimited && part.cyclesRemaining !== null ? (
                              <span className={cn("font-semibold", part.status === "red" && "text-status-red", part.status === "amber" && "text-status-amber")}>
                                {formatNumber(part.cyclesRemaining)}
                              </span>
                            ) : (
                              <span className="text-rr-slate/70">Not life limited</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {part.releaseCertificate ? (
                              <span className="rr-numeric text-rr-slate">{part.releaseCertificate}</span>
                            ) : (
                              <StatusPill status="red">Missing EASA Form 1</StatusPill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
