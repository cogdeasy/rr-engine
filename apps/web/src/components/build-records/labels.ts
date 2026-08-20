import type { BuildEventKind, BuildPartSource, ConfigConformance } from "@rr/types";

export const SOURCE_LABEL: Record<BuildPartSource, string> = {
  new: "New",
  overhauled: "Overhauled",
  repaired: "Repaired",
  "used-serviceable": "Used serviceable",
  loan: "Loan pool",
};

export const CONFORMANCE_LABEL: Record<ConfigConformance, string> = {
  standard: "At standard",
  superseded: "Superseded",
  "non-standard": "Non-standard",
};

export const EVENT_LABEL: Record<BuildEventKind, string> = {
  "engine-build": "Engine build",
  "module-replaced": "Module replaced",
  "module-overhauled": "Module overhauled",
  "llp-replaced": "LLP replaced",
  "sb-embodied": "SB embodied",
  "repair-embodied": "Repair embodied",
  "configuration-deviation": "Configuration deviation",
};
