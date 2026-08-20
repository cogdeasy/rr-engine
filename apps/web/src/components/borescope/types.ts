import type { BorescopeFinding, BorescopeInspection } from "@rr/types";

/** A finding enriched with the fleet context the triage queue needs. */
export interface FindingView {
  finding: BorescopeFinding;
  engineId: string;
  esn: string;
  family: string;
  operatorCode: string;
  operatorName: string;
  tail: string | null;
  moduleLabel: string;
  inspection: Pick<
    BorescopeInspection,
    | "id"
    | "reference"
    | "performedAt"
    | "trigger"
    | "inspector"
    | "probe"
    | "cyclesAtInspection"
    | "intervalCycles"
    | "cyclesToNextDue"
    | "overdue"
    | "facilityId"
  >;
  facility: string;
  /** The same damage site at every inspection that recorded it, oldest first. */
  progression: {
    findingId: string;
    inspectionReference: string;
    observedAt: string;
    measured: number;
    limitRatio: number;
    imageSeed: string;
  }[];
}
