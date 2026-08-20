"use client";

import * as React from "react";
import type { ShaftId, VibrationSpectrum } from "@rr/types";
import { Badge, Panel, PanelHeader, StatusPill, Tabs, cn, statusStyles } from "@rr/ui";

const STATUS_HEX: Record<string, string> = {
  red: "#ff5f6d",
  amber: "#ffb43d",
  green: "#2fd39b",
  grey: "#8f96bb",
};

const WIDTH = 960;
const HEIGHT = 280;

/**
 * Narrow-band spectrum with order markers. Synchronous energy (1x, 2x, 3x)
 * reads in brand blue; anything off the shaft orders is called out because that
 * is what separates a trimmable imbalance from bearing or rub damage.
 */
export function SpectrumPanel({
  spectra,
  advisoryLimits,
}: {
  spectra: VibrationSpectrum[];
  advisoryLimits: Record<ShaftId, number>;
}) {
  const [shaft, setShaft] = React.useState<ShaftId>(spectra[0]?.shaft ?? "N1");
  const spectrum = spectra.find((s) => s.shaft === shaft) ?? spectra[0]!;
  const advisory = advisoryLimits[spectrum.shaft];

  const maxAmp = Math.max(...spectrum.bins.map((b) => b.amplitudeIps), advisory * 0.6) * 1.18;
  const x = (hz: number) => (hz / spectrum.maxFrequencyHz) * WIDTH;
  const y = (amp: number) => HEIGHT - (amp / maxAmp) * HEIGHT;

  const line = spectrum.bins.map((bin, i) => `${i === 0 ? "M" : "L"}${x(bin.frequencyHz).toFixed(1)},${y(bin.amplitudeIps).toFixed(1)}`).join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const markers = spectrum.peaks.filter((peak) => peak.amplitudeIps > spectrum.noiseFloorIps * 2.2);
  const dominant = spectrum.peaks[0];

  return (
    <Panel>
      <PanelHeader
        title="Vibration spectrum"
        subtitle={`${spectrum.condition} · ${spectrum.resolutionHz} Hz resolution · captured from the last recorded sector`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="brand">{Math.round(spectrum.synchronousEnergyShare * 100)}% synchronous</Badge>
            {dominant ? <StatusPill status={dominant.status}>{dominant.label} dominant</StatusPill> : null}
          </div>
        }
      />

      <Tabs
        className="mb-4"
        active={shaft}
        onChange={(id) => setShaft(id as ShaftId)}
        tabs={spectra.map((s) => ({ id: s.shaft, label: `${s.shaft} spectrum` }))}
      />

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT + 34}`}
          className="w-full"
          role="img"
          aria-label={`Vibration spectrum for shaft ${spectrum.shaft}. Dominant peak ${dominant?.label} at ${dominant?.amplitudeIps} IPS.`}
        >
          <defs>
            <linearGradient id={`spectrum-${spectrum.shaft}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6a63ff" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#6a63ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={WIDTH} y1={HEIGHT * f} y2={HEIGHT * f} stroke="#e7eaf8" strokeOpacity={0.11} />
          ))}

          <line x1={0} x2={WIDTH} y1={y(advisory)} y2={y(advisory)} stroke="#ffb43d" strokeDasharray="6 4" strokeWidth={1.1} />
          <text x={6} y={y(advisory) - 5} fontSize={10} fill="#ffb43d" className="rr-numeric">
            advisory {advisory} IPS
          </text>

          {markers.map((peak, index) => {
            const colour = peak.synchronous ? "#6a63ff" : STATUS_HEX[peak.status] ?? "#8f96bb";
            return (
              <g key={peak.id}>
                <line
                  x1={x(peak.frequencyHz)}
                  x2={x(peak.frequencyHz)}
                  y1={y(peak.amplitudeIps) - 6}
                  y2={HEIGHT}
                  stroke={colour}
                  strokeOpacity={0.35}
                  strokeDasharray={peak.synchronous ? undefined : "3 3"}
                />
                <circle cx={x(peak.frequencyHz)} cy={y(peak.amplitudeIps)} r={3} fill={colour} />
                <text
                  x={x(peak.frequencyHz)}
                  y={Math.max(12, y(peak.amplitudeIps) - 12 - (index % 2) * 12)}
                  fontSize={10}
                  fontWeight={600}
                  textAnchor="middle"
                  fill={colour}
                >
                  {peak.label}
                </text>
              </g>
            );
          })}

          <path d={area} fill={`url(#spectrum-${spectrum.shaft})`} />
          <path d={line} fill="none" stroke="#6a63ff" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} stroke="#e7eaf8" strokeOpacity={0.33} />

          {[0, 100, 200, 300, 400, 500].map((hz) => (
            <g key={hz}>
              <line x1={x(hz)} x2={x(hz)} y1={HEIGHT} y2={HEIGHT + 4} stroke="#e7eaf8" strokeOpacity={0.5} />
              <text x={x(hz)} y={HEIGHT + 18} fontSize={10} textAnchor="middle" fill="#98a0c6" className="rr-numeric">
                {hz} Hz
              </text>
            </g>
          ))}
          <text x={WIDTH} y={HEIGHT + 32} fontSize={10} textAnchor="end" fill="#98a0c6">
            Amplitude scaled to {maxAmp.toFixed(2)} IPS full range
          </text>
        </svg>
      </div>

      <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {spectrum.peaks.slice(0, 6).map((peak) => (
          <li
            key={peak.id}
            className={cn(
              "rounded-sm border border-rr-ink/8 p-3",
              !peak.synchronous && peak.status !== "green" && statusStyles[peak.status].bg,
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-rr-ink">{peak.label}</p>
              <p className={cn("rr-numeric text-sm font-semibold", statusStyles[peak.status].text)}>{peak.amplitudeIps.toFixed(2)} IPS</p>
            </div>
            <p className="rr-numeric mt-0.5 text-[11px] text-rr-slate">
              {peak.frequencyHz} Hz · {peak.synchronous ? "synchronous" : "non-synchronous"}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-rr-slate">{peak.meaning}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
