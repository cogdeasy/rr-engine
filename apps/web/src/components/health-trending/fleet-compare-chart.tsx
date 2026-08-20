"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_COLOUR, AXIS_TEXT, GRID_COLOUR, monthDate, shortDate, STATUS_COLOURS } from "./chart-theme";

export interface CompareRow {
  t: string;
  engine: number | null;
  median: number;
  p10: number;
  /** Height of the p10–p90 band, stacked on top of p10. */
  band: number;
  p90: number;
}

/** Engine against the p10–p90 band of its own family for the same parameter. */
export function FleetCompareChart({
  rows,
  unit,
  amber,
  red,
  direction,
  engineLabel,
  colour,
  height = 300,
}: {
  rows: CompareRow[];
  unit: string;
  amber: number;
  red: number;
  direction: "higher-is-worse" | "lower-is-worse";
  engineLabel: string;
  colour: string;
  height?: number;
}) {
  const worse = direction === "higher-is-worse";
  const { min, max } = React.useMemo(() => {
    const values = rows.flatMap((r) => [r.p10, r.p90, r.engine].filter((v): v is number => typeof v === "number"));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [rows]);

  const amberVisible = worse ? amber < max : amber > min;
  const redVisible = worse ? red < max : red > min;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 88, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOUR} vertical={false} />
          <XAxis dataKey="t" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS_TEXT }} stroke={AXIS_COLOUR} minTickGap={40} />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: AXIS_TEXT }}
            stroke={AXIS_COLOUR}
            width={62}
            tickFormatter={(v: number) => v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}
            label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 10, fill: AXIS_TEXT }}
          />
          {amberVisible ? (
            <ReferenceLine
              y={amber}
              stroke={STATUS_COLOURS.amber}
              strokeDasharray="6 4"
              label={{ value: `AMBER ${amber}${unit}`, position: "right", fill: STATUS_COLOURS.amber, fontSize: 10, offset: 6 }}
            />
          ) : null}
          {redVisible ? (
            <ReferenceLine
              y={red}
              stroke={STATUS_COLOURS.red}
              strokeDasharray="6 4"
              label={{ value: `RED ${red}${unit}`, position: "right", fill: STATUS_COLOURS.red, fontSize: 10, offset: 6 }}
            />
          ) : null}

          <Area dataKey="p10" stackId="band" stroke="none" fill="none" isAnimationActive={false} legendType="none" name="p10" />
          <Area
            dataKey="band"
            stackId="band"
            stroke="none"
            fill="#a9a5e6"
            fillOpacity={0.35}
            isAnimationActive={false}
            name="Fleet p10–p90"
          />
          <Line
            type="monotone"
            dataKey="median"
            name="Family median"
            stroke="#98a0c6"
            strokeWidth={1.4}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="engine"
            name={engineLabel}
            stroke={colour}
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
          <Tooltip content={<CompareTooltip unit={unit} engineLabel={engineLabel} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareTooltip({
  active,
  label,
  payload,
  unit,
  engineLabel,
}: {
  active?: boolean;
  label?: string;
  payload?: { payload?: CompareRow }[];
  unit: string;
  engineLabel: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row || !label) return null;
  return (
    <div className="rr-panel min-w-52 p-3 text-xs">
      <p className="rr-label text-rr-slate">{monthDate(label)}</p>
      <dl className="mt-2 space-y-1">
        <Row label={engineLabel} value={row.engine} unit={unit} strong />
        <Row label="Family median" value={row.median} unit={unit} />
        <Row label="Family p10" value={row.p10} unit={unit} />
        <Row label="Family p90" value={row.p90} unit={unit} />
      </dl>
    </div>
  );
}

function Row({ label, value, unit, strong }: { label: string; value: number | null; unit: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-rr-slate">{label}</dt>
      <dd className={strong ? "rr-numeric font-semibold text-rr-ink" : "rr-numeric text-rr-ink"}>
        {value === null ? "—" : `${value}${unit}`}
      </dd>
    </div>
  );
}
