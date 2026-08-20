import type { StatusLevel, TestCellOutcome } from "@rr/types";

/**
 * Outcome colour is operational, never decorative: a failed run stops a return
 * to service (red), a concession needs a human decision (amber), a clean pass
 * releases the engine (green) and a live run has no verdict yet (grey).
 */
export const OUTCOME_STATUS: Record<TestCellOutcome, StatusLevel> = {
  fail: "red",
  conditional: "amber",
  pass: "green",
  running: "grey",
};

export const OUTCOME_LABEL: Record<TestCellOutcome, string> = {
  fail: "Fail",
  conditional: "Conditional",
  pass: "Pass",
  running: "On bed",
};

export const TEST_POINT_LABEL: Record<string, string> = {
  idle: "Ground idle",
  cruise: "Cruise",
  "max-continuous": "Max continuous",
  "max-climb": "Max climb",
  "take-off": "Take-off",
  reslam: "Re-slam",
};
