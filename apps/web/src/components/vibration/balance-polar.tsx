import type { RotorBalance, StatusLevel } from "@rr/types";

const SIZE = 320;
const CENTRE = SIZE / 2;
const MAX_RADIUS = 130;

const STATUS_HEX: Record<StatusLevel, string> = {
  red: "#ff5f6d",
  amber: "#ffb43d",
  green: "#2fd39b",
  grey: "#8f96bb",
};

/**
 * Polar plot of the 1x N1 imbalance vector: magnitude as radius, phase angle as
 * bearing from blade 1. A tight cluster of historic shots means the vector is
 * repeatable and can be trimmed; a scattered one means something is moving.
 */
export function BalancePolar({ balance, status }: { balance: RotorBalance; status: StatusLevel }) {
  const scaleMax = Math.max(balance.trimLimitIps * 1.2, balance.magnitudeIps * 1.15, 1);
  const radius = (magnitude: number) => (Math.min(magnitude, scaleMax) / scaleMax) * MAX_RADIUS;
  const point = (magnitude: number, phaseDeg: number) => {
    const theta = ((phaseDeg - 90) * Math.PI) / 180;
    return { x: CENTRE + radius(magnitude) * Math.cos(theta), y: CENTRE + radius(magnitude) * Math.sin(theta) };
  };

  const current = point(balance.magnitudeIps, balance.phaseDeg);
  const predicted = point(balance.predictedResidualIps, balance.phaseDeg);
  const trimRing = radius(balance.trimLimitIps);
  const history = balance.history.map((shot) => ({ shot, ...point(shot.magnitudeIps, shot.phaseDeg) }));
  const colour = STATUS_HEX[status];

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[320px]"
      role="img"
      aria-label={`Rotor balance polar plot. Current imbalance ${balance.magnitudeIps} IPS at ${balance.phaseDeg} degrees, phase scatter ${balance.phaseScatterDeg} degrees.`}
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={CENTRE} cy={CENTRE} r={MAX_RADIUS * f} fill="none" stroke="#e7eaf8" strokeOpacity={0.176} />
      ))}
      {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => {
        const edge = point(scaleMax, deg);
        return <line key={deg} x1={CENTRE} y1={CENTRE} x2={edge.x} y2={edge.y} stroke="#e7eaf8" strokeOpacity={0.132} />;
      })}

      <circle cx={CENTRE} cy={CENTRE} r={trimRing} fill="none" stroke="#ffb43d" strokeWidth={1.2} strokeDasharray="5 4" />
      <text x={CENTRE + 4} y={CENTRE - trimRing - 5} fontSize={10} fill="#ffb43d" fontWeight={600}>
        trim limit {balance.trimLimitIps} IPS
      </text>

      {["0°", "90°", "180°", "270°"].map((label, i) => {
        const edge = point(scaleMax * 1.06, i * 90);
        return (
          <text key={label} x={edge.x} y={edge.y + 3} fontSize={10} textAnchor="middle" fill="#98a0c6">
            {label}
          </text>
        );
      })}

      <polyline
        points={history.map((h) => `${h.x},${h.y}`).join(" ")}
        fill="none"
        stroke="#8b85ff"
        strokeOpacity={0.35}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      {history.map((h, index) => (
        <g key={h.shot.id}>
          <circle cx={h.x} cy={h.y} r={4} fill="#ffffff" stroke="#8b85ff" strokeOpacity={0.3 + (index / history.length) * 0.7} strokeWidth={1.6} />
        </g>
      ))}

      <line x1={CENTRE} y1={CENTRE} x2={current.x} y2={current.y} stroke={colour} strokeWidth={2.2} />
      <circle cx={current.x} cy={current.y} r={5.5} fill={colour} />
      <circle cx={predicted.x} cy={predicted.y} r={4.5} fill="none" stroke="#2fd39b" strokeWidth={1.8} strokeDasharray="3 2" />
      <circle cx={CENTRE} cy={CENTRE} r={2.5} fill="#e7eaf8" />
    </svg>
  );
}
