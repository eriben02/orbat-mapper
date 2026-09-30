import dayjs from "dayjs";
import type { OperationalClaim } from "@/types/operationalModels";

/**
 * A claim is what a source says. It is not the subject's state.
 * Times on the returned view are epoch milliseconds.
 */

export interface SubjectClaim {
  id: string;
  subjectId: string;
  predicate: string;
  value: string;
  reportedAt: number;
  validFrom: number | null;
  validUntil: number | null;
  source: string;
  reason: string | null;
  authority: string;
  confidence: string;
  /** reportedAt is at or before the query time. */
  known: boolean;
  /** Known, and the query time is inside the asserted window. */
  currentlyValid: boolean;
  /** Known, and the asserted window has ended. The claim is kept. */
  historical: boolean;
  /** Known, and the asserted window has not started. */
  futureValid: boolean;
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function claimToInternal(claim: OperationalClaim): OperationalClaim {
  const validFrom = asEpoch(claim.validFrom);
  const validUntil = asEpoch(claim.validUntil);
  return {
    ...claim,
    reportedAt: +dayjs(claim.reportedAt),
    ...(validFrom != null ? { validFrom } : {}),
    ...(validUntil != null ? { validUntil } : {}),
  };
}

/**
 * Every stored claim for the subject is returned.
 * A later claim does not replace an earlier one.
 * Flags are derived from the query time. Nothing is deleted.
 */
export function getClaimsForSubject(
  subjectId: string,
  claims: readonly OperationalClaim[],
  currentTime: number,
): SubjectClaim[] {
  const views: SubjectClaim[] = [];
  for (const claim of claims) {
    if (claim.subjectId !== subjectId) continue;
    const reportedAt = asEpoch(claim.reportedAt);
    const validFrom = asEpoch(claim.validFrom);
    const validUntil = asEpoch(claim.validUntil);
    if (reportedAt == null) continue;
    const known = reportedAt <= currentTime;
    const windowed = validFrom != null && validUntil != null;
    const inside = windowed && currentTime >= validFrom && currentTime <= validUntil;
    views.push({
      id: claim.id,
      subjectId: claim.subjectId,
      predicate: claim.predicate,
      value: claim.value,
      reportedAt,
      validFrom,
      validUntil,
      source: claim.source,
      reason: claim.reason ?? null,
      authority: claim.authority,
      confidence: claim.confidence,
      known,
      currentlyValid: known && (windowed ? inside : true),
      historical: known && windowed && currentTime > validUntil,
      futureValid: known && windowed && currentTime < validFrom,
    });
  }
  return views;
}
