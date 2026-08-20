/**
 * Vibration analysis domain model.
 *
 * The module answers one question: is an elevated vibration signature a
 * balance condition that can be trimmed on wing, or rotor/bearing damage that
 * needs the engine off the aircraft?
 */

import type { Iso, ModuleCode, ParameterId, Series, StatusLevel, Trend } from "../index";

/** Rotating assembly. Trent architecture is three-shaft: LP (N1), IP (N2), HP (N3). */
export type ShaftId = "N1" | "N2" | "N3";

/** Signature families the interpretation engine can distinguish. */
export type VibrationSignatureKind =
  | "fan-imbalance"
  | "rotor-imbalance"
  | "bearing-distress"
  | "rotor-rub"
  | "nominal";

export interface ShaftVibration {
  shaft: ShaftId;
  /** Telemetry parameter backing this shaft's tracked order. */
  parameter: ParameterId;
  label: string;
  unit: string;
  /** Latest tracked-order (1x) amplitude. */
  latest: number;
  /** Highest amplitude observed in the trend window. */
  peak: number;
  /** Post-overhaul reference amplitude for the same shaft. */
  baseline: number;
  /** Change against baseline, percent. */
  deltaPct: number;
  amberLimit: number;
  redLimit: number;
  status: StatusLevel;
  trend: Trend;
  /** Rate of change over the trend window, IPS per 100 cycles. */
  slopePer100Cycles: number;
  /** Flight hours accumulated above the advisory limit. */
  hoursAtExceedance: number;
  /** Sectors in the window whose peak exceeded the advisory limit. */
  sectorsAtExceedance: number;
  /** Shaft speed at the analysed condition, used to place order markers. */
  rpm: number;
  /** 1x rotational frequency in Hz. */
  orderHz: number;
  series: Series;
}

export interface SpectrumBin {
  frequencyHz: number;
  amplitudeIps: number;
}

export interface SpectrumPeak {
  id: string;
  /** Order relative to the tracked shaft, e.g. "1x N1". */
  label: string;
  shaft: ShaftId;
  /** Multiple of shaft speed; non-integer values are non-synchronous. */
  order: number;
  frequencyHz: number;
  amplitudeIps: number;
  status: StatusLevel;
  /** Plain-language meaning of energy at this frequency. */
  meaning: string;
  synchronous: boolean;
}

export interface VibrationSpectrum {
  engineId: string;
  shaft: ShaftId;
  /** Condition the snapshot was captured at. */
  condition: string;
  capturedAt: Iso;
  resolutionHz: number;
  maxFrequencyHz: number;
  noiseFloorIps: number;
  bins: SpectrumBin[];
  peaks: SpectrumPeak[];
  /** Share of total spectral energy carried by the 1x tracked order, 0-1. */
  synchronousEnergyShare: number;
}

export interface BalanceShot {
  id: string;
  at: Iso;
  cyclesSinceOverhaul: number;
  /** Imbalance vector magnitude before the shot. */
  magnitudeIps: number;
  /** Imbalance phase angle, degrees clockwise from blade 1. */
  phaseDeg: number;
  /** Trim weight fitted, grams; zero for a survey-only run. */
  weightGrams: number;
  /** Fan blade / balance-screw position the weight went to. */
  positionDeg: number;
  outcome: "improved" | "no-change" | "worse" | "survey";
  note: string;
}

export interface RotorBalance {
  engineId: string;
  shaft: ShaftId;
  /** Current residual imbalance vector. */
  magnitudeIps: number;
  phaseDeg: number;
  /** Amplitude achievable if the recommended trim is fitted. */
  predictedResidualIps: number;
  /** Vibration level at which an on-wing trim balance is authorised. */
  trimLimitIps: number;
  /** Phase scatter across the recent shots; instability points at damage. */
  phaseScatterDeg: number;
  /** True when the vector is stable and inside the trim envelope. */
  trimmable: boolean;
  recommendedWeightGrams: number;
  recommendedPositionDeg: number;
  history: BalanceShot[];
}

export interface DiagnosisEvidence {
  label: string;
  detail: string;
  /** Contribution of this evidence to the classification, 0-1. */
  weight: number;
  supports: boolean;
}

export interface VibrationDiagnosis {
  engineId: string;
  kind: VibrationSignatureKind;
  label: string;
  /** Model confidence, 0-1. */
  confidence: number;
  status: StatusLevel;
  likelyModule: ModuleCode;
  ataChapter: string;
  summary: string;
  evidence: DiagnosisEvidence[];
  recommendedAction: string;
  /** Hours before the recommended action must be taken; null when advisory. */
  actionWindowHours: number | null;
  /** Alternative signature the data is second-most consistent with. */
  differential: { kind: VibrationSignatureKind; label: string; confidence: number };
  onWingRecoverable: boolean;
}

export interface EngineVibrationProfile {
  engineId: string;
  esn: string;
  family: string;
  operatorName: string;
  operatorCode: string;
  tail: string | null;
  position: number | null;
  location: string;
  cyclesSinceOverhaul: number;
  status: StatusLevel;
  /** Worst tracked order across the three shafts. */
  worstShaft: ShaftId;
  worstRatio: number;
  broadbandIps: number;
  broadbandStatus: StatusLevel;
  broadbandSeries: Series;
  shafts: ShaftVibration[];
  hoursAtExceedance: number;
  /** Composite ranking score used to order the fleet table. */
  severityScore: number;
  diagnosis: VibrationDiagnosis;
  balance: RotorBalance;
}

export interface VibrationFleetSummary {
  enginesMonitored: number;
  redCount: number;
  amberCount: number;
  greenCount: number;
  /** Engines whose signature is a trimmable balance condition. */
  trimmableCount: number;
  /** Engines whose signature indicates rotor or bearing damage. */
  damageCount: number;
  hoursAtExceedance: number;
  worstEngineId: string | null;
}
