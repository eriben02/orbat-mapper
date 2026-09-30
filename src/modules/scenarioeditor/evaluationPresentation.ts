import dayjs from "dayjs";
import type {
  EvaluationFinding,
  EvaluationStatus,
} from "@/scenariostore/operationalChange";

/** How a finding should be told apart. Not a pass/fail color. */
export type EvaluationTone =
  "conflict" | "changed" | "review" | "unknown" | "claim" | "satisfied";

export function formatZulu(timestamp: number | undefined | null) {
  if (timestamp == null || !Number.isFinite(timestamp)) return "";
  return dayjs.utc(timestamp).format("HHmm[Z]");
}

export function evaluationStatusLabel(status: EvaluationStatus) {
  switch (status) {
    case "CONFLICT":
      return "Conflict";
    case "CHANGED":
      return "Changed";
    case "REVIEW_REQUIRED":
      return "Review required";
    case "UNKNOWN":
      return "Unknown";
    case "CLAIM_PRESENT":
      return "Claim present";
    default:
      return "Satisfied";
  }
}

export function evaluationStatusTone(status: EvaluationStatus): EvaluationTone {
  switch (status) {
    case "CONFLICT":
      return "conflict";
    case "CHANGED":
      return "changed";
    case "REVIEW_REQUIRED":
      return "review";
    case "UNKNOWN":
      return "unknown";
    case "CLAIM_PRESENT":
      return "claim";
    default:
      return "satisfied";
  }
}

function factValue(finding: EvaluationFinding, key: string) {
  return finding.facts.find((item) => item.key === key)?.value;
}

/** Sentences from structured findings. This does not re-evaluate the change. */
export function evaluationFindingDetail(finding: EvaluationFinding) {
  const proposed = formatZulu(factValue(finding, "proposed") as number);
  const from = formatZulu(factValue(finding, "windowFrom") as number);
  const until = formatZulu(factValue(finding, "windowUntil") as number);
  switch (finding.rule) {
    case "effect-window-contains-instant":
      return finding.status === "CONFLICT"
        ? `${proposed} is outside effect window ${from}–${until}`
        : `${proposed} is inside effect window ${from}–${until}`;
    case "effect-window-missing":
      return "Effect window is not represented.";
    case "dependency-target-missing":
      return "The dependency target is not in the scenario.";
    case "synchronization-instant-not-moved":
      return `Represented effect at ${formatZulu(factValue(finding, "effectAt") as number)} is unchanged. Synchronization must be reviewed.`;
    case "insufficient-model-for-recomputation": {
      const factors = finding.facts
        .filter((item) => item.key === "unresolvedFactor")
        .map((item) => item.value)
        .join(", ");
      return factors
        ? `Feasibility cannot be calculated. Missing: ${factors}.`
        : "Feasibility cannot be calculated from the current model.";
    }
    case "timing-assumption-not-recomputed":
      return "The assessment is tied to the original timing. The model cannot calculate the effect of the change.";
    case "requires-does-not-state-usability": {
      const validityFrom = formatZulu(factValue(finding, "validityFrom") as number);
      const validityUntil = formatZulu(factValue(finding, "validityUntil") as number);
      const inside = factValue(finding, "proposedInsideValidity");
      if (inside === true) {
        return `Proposed time is inside the represented validity window ${validityFrom}–${validityUntil}. Usability for the mission is not represented.`;
      }
      if (inside === false) {
        return `Proposed time is outside the represented validity window ${validityFrom}–${validityUntil}. Usability for the mission is not represented.`;
      }
      return "No time constraint is represented for this requirement.";
    }
    case "availability-claim-present":
      return `A claim says ${String(factValue(finding, "value"))}. It is not object state.`;
    default:
      return finding.rule;
  }
}
