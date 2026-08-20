"use client";

import * as React from "react";
import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendEventKind, TrendExceedance } from "@rr/types";
import { AXIS_COLOUR, AXIS_TEXT, GRID_COLOUR, monthDate, shortDate, STATUS_COLOURS } from "./chart-theme";

export interface TrendChartSeries {
  key: string;
  label: string;
  colour: string;
}

export interface TrendChartEvent {
  id: string;
  /** Snapped to the nearest sample so the marker lands on the category axis. */
  at: string;
  kind: TrendEventKind;
  label: string;
  detail: string;
}

export interface TrendChartRow {
  t: string;
  [key: string]: string | number | null;
}

/** Axis ticks are rounded so the gridline labels stay readable. */
function axisTick(value: number): string {
  const abs = Math.abs(value);
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(dp);
}

const EVENT_GLYPH: Record<TrendEventKind, string> = {
  "water-wash": "W",
  "shop-visit": "S",
  "module-change": "M",
  borescope: "B",
  alert: "!",
};

export function TrendChart({
  rows,
  series,
  unit,
  amber,
  red,
  direction,
  exceedances = [],
  events = [],
  height = 340,
  showBrush = true,
  onRangeChange,
}: {
  rows: TrendChartRow[];
  series: TrendChartSeries[];
  unit: string;
  amber: number;
  red: number;
  direction: "higher-is-worse" | "lower-is-worse";
  exceedances?: TrendExceedance[];
  events?: TrendChartEvent[];
  height?: number;
  showBrush?: boolean;
  onRangeChange?: (range: { from: string; to: string }) => void;
}) {
  const worse = direction === "higher-is-worse";

  const { min, max } = React.useMemo(() => {
    const values: number[] = [];
    for (const row of rows) {
      for (const s of series) {
        const v = row[s.key];
        if (typeof v === "number") values.push(v);
      }
    }
    values.push(amber);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [rows, series, amber]);

  const amberZone = worse ? { y1: amber, y2: Math.min(red, max) } : { y1: Math.max(red, min), y2: amber };
  const redZone = worse ? { y1: Math.min(red, max), y2: max } : { y1: min, y2: Math.max(red, min) };
  const amberVisible = worse ? amber < max : amber > min;
  const redVisible = worse ? red < max : red > min;

  function handleBrush(range: { startIndex?: number; endIndex?: number }) {
    if (!onRangeChange || range.startIndex === undefined || range.endIndex === undefined) return;
    const from = rows[range.startIndex]?.t;
    const to = rows[range.endIndex]?.t;
    if (from && to) onRangeChange({ from, to });
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 88, bottom: showBrush ? 4 : 8, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOUR} vertical={false} />

          {redVisible ? (
            <ReferenceArea y1={redZone.y1} y2={redZone.y2} fill={STATUS_COLOURS.red} fillOpacity={0.05} ifOverflow="hidden" />
          ) : null}
          {amberVisible ? (
            <ReferenceArea y1={amberZone.y1} y2={amberZone.y2} fill={STATUS_COLOURS.amber} fillOpacity={0.06} ifOverflow="hidden" />
          ) : null}

          {exceedances.map((region) => (
            <ReferenceArea
              key={`${region.level}-${region.from}`}
              x1={region.from}
              x2={region.to}
              fill={STATUS_COLOURS[region.level]}
              fillOpacity={0.12}
              ifOverflow="hidden"
            />
          ))}

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

          {events.map((event) => (
            <ReferenceLine
              key={event.id}
              x={event.at}
              stroke={event.kind === "alert" ? STATUS_COLOURS.amber : "#4b4f77"}
              strokeDasharray="3 3"
              strokeOpacity={0.7}
              label={{
                value: EVENT_GLYPH[event.kind],
                position: "top",
                fontSize: 9,
                fill: event.kind === "alert" ? STATUS_COLOURS.amber : "#4b4f77",
              }}
            />
          ))}

          <XAxis
            dataKey="t"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: AXIS_TEXT }}
            stroke={AXIS_COLOUR}
            minTickGap={40}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: AXIS_TEXT }}
            stroke={AXIS_COLOUR}
            width={62}
            tickFormatter={axisTick}
            label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 10, fill: AXIS_TEXT }}
          />
          <Tooltip content={<TrendTooltip unit={unit} events={events} />} />
          {series.length > 1 ? (
            <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
          ) : null}

          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.colour}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}

          {showBrush ? (
            <Brush
              dataKey="t"
              height={26}
              travellerWidth={8}
              stroke="#a9a5e6"
              fill="#f4f5fa"
              tickFormatter={shortDate}
              onChange={handleBrush}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
}

function TrendTooltip({
  active,
  label,
  payload,
  unit,
  events,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  unit: string;
  events: TrendChartEvent[];
}) {
  if (!active || !payload?.length || !label) return null;
  const dayEvents = events.filter((e) => e.at === label);
  return (
    <div className="rr-panel min-w-48 p-3 text-xs">
      <p className="rr-label text-rr-slate">{monthDate(label)}</p>
      <ul className="mt-2 space-y-1">
        {payload.map((item) => (
          <li key={String(item.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-rr-slate">
              <span className="h-0.5 w-3" style={{ backgroundColor: item.color }} aria-hidden />
              {item.name}
            </span>
            <span className="rr-numeric font-semibold text-rr-ink">
              {item.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
      {dayEvents.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-rr-ink/8 pt-2">
          {dayEvents.map((event) => (
            <li key={event.id} className="text-[11px] text-rr-slate">
              <span className="font-semibold text-rr-ink">{event.label}</span> — {event.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
