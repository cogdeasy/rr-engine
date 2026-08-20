"use client";

import * as React from "react";
import type { ParameterTracePoint } from "@rr/types";
import { cn } from "../../utils";

/**
 * Cross-correlation heatmap for a shortlist of parameters. Deep blue is
 * collinear: two cells that dark are the same information twice, and only one
 * of them belongs in the model.
 */
export function CorrelationMatrix({
  codes,
  values,
  selected,
  onSelect,
  className,
}: {
  codes: string[];
  values: number[][];
  selected?: string;
  onSelect?: (code: string) => void;
  className?: string;
}) {
  if (codes.length === 0) return null;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="border-separate border-spacing-0.5">
        <tbody>
          {codes.map((rowCode, row) => (
            <tr key={rowCode}>
              <th
                scope="row"
                className={cn(
                  "rr-numeric whitespace-nowrap pr-3 text-right text-[10px] font-medium",
                  rowCode === selected ? "text-rr-blue" : "text-rr-slate",
                )}
              >
                <button type="button" onClick={() => onSelect?.(rowCode)} className="hover:text-rr-blue">
                  {rowCode}
                </button>
              </th>
              {codes.map((colCode, col) => {
                const value = values[row]?.[col] ?? 0;
                return (
                  <td key={colCode}>
                    <div
                      title={`${rowCode} × ${colCode}: ${value.toFixed(2)}`}
                      className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[9px] font-semibold"
                      style={{
                        backgroundColor:
                          value >= 0
                            ? `rgba(16, 6, 159, ${Math.min(0.92, Math.abs(value)).toFixed(2)})`
                            : `rgba(216, 30, 43, ${Math.min(0.92, Math.abs(value)).toFixed(2)})`,
                        color: Math.abs(value) > 0.55 ? "#ffffff" : "#05061f",
                      }}
                    >
                      {value.toFixed(1).replace("0.", ".")}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td />
            {codes.map((code) => (
              <td key={code} className="pt-1 align-top">
                <span className="rr-numeric block h-16 w-7 text-[9px] leading-tight text-rr-slate [writing-mode:vertical-rl]">
                  {code}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * One parameter through the 90 days before the event: the normal population
 * band against the event population median, in sigma. Where the line leaves the
 * band is the lead time an analytic could realistically claim.
 */
export function SignalTrace({
  points,
  leadDays,
  height = 220,
  className,
}: {
  points: ParameterTracePoint[];
  leadDays: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const width = 640;
  const values = points.flatMap((p) => [p.event, p.normalHigh, p.normalLow]);
  const min = Math.min(...values) - 0.6;
  const max = Math.max(...values) + 0.6;
  const toX = (day: number) => ((day + 90) / 90) * width;
  const toY = (v: number) => height - ((v - min) / (max - min)) * height;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.day).toFixed(1)},${toY(p.event).toFixed(1)}`).join(" ");
  const band = [
    ...points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.day).toFixed(1)},${toY(p.normalHigh).toFixed(1)}`),
    ...[...points].reverse().map((p) => `L${toX(p.day).toFixed(1)},${toY(p.normalLow).toFixed(1)}`),
    "Z",
  ].join(" ");

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <path d={band} fill="#05061f" fillOpacity={0.07} />
        {/* Onset of separation: everything to the right is detectable warning. */}
        <line
          x1={toX(-leadDays)}
          x2={toX(-leadDays)}
          y1={0}
          y2={height}
          stroke="#f08c00"
          strokeDasharray="6 4"
          strokeWidth={1.2}
        />
        <line x1={width - 1} x2={width - 1} y1={0} y2={height} stroke="#d81e2b" strokeWidth={1.6} />
        <path d={line} fill="none" stroke="#10069f" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-rr-slate">
        <span>90 days before event</span>
        <span className="text-status-amber">separation at −{leadDays}d</span>
        <span className="text-status-red">event</span>
      </div>
    </div>
  );
}
