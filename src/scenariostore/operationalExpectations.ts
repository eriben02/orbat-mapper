import dayjs from "dayjs";
import type {
  OperationalExpectation,
  OperationalObject,
  OperationalObservation,
} from "@/types/operationalModels";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";

/**
 * Compare a plan expectation with observations that are known at the clock.
 * Absence of an observation is not evidence that the expected event did not occur.
 * Nothing here is written back onto an object, a claim, or the expectation.
 */

export type ExpectationStatus =
  "PENDING" | "AWAITING_CONFIRMATION" | "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";

export interface ExpectationRelation {
  objectId: string;
  objectKind: string;
  /** Stored relation type, not the derived inverse name. */
  relationType: string;
}

export interface ExpectationEvaluation {
  expectationId: string;
  subjectId: string;
  predicate: string;
  expectedValue: string;
  expectedAt: number | null;
  confirmBy: number | null;
  observationId: string | null;
  observationSource: string | null;
  observedAt: number | null;
  receivedAt: number | null;
  status: ExpectationStatus;
  rule: string;
  /** True only when the deadline passed with no known confirming observation. */
  attention: boolean;
  related: ExpectationRelation[];
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function expectationToInternal(
  expectation: OperationalExpectation,
): OperationalExpectation {
  return {
    ...expectation,
    expectedAt: +dayjs(expectation.expectedAt),
    confirmBy: +dayjs(expectation.confirmBy),
  };
}

export function observationToInternal(
  observation: OperationalObservation,
): OperationalObservation {
  return {
    ...observation,
    observedAt: +dayjs(observation.observedAt),
    receivedAt: +dayjs(observation.receivedAt),
    confidence: observation.confidence ?? "UNKNOWN",
  };
}

function relatedObjects(
  subjectId: string,
  objects: readonly OperationalObject[],
): ExpectationRelation[] {
  const trace = traceOperationalRelations(subjectId, objects, {
    includeInverses: true,
    excludeHidden: false,
    maxDepth: 1,
  });
  return trace.edges.map((edge) => ({
    objectId: edge.targetId,
    objectKind: edge.targetKind,
    relationType: edge.canonicalType,
  }));
}

function confirms(
  expectation: OperationalExpectation,
  observation: OperationalObservation,
  confirmBy: number,
): boolean {
  if (observation.subjectId !== expectation.subjectId) return false;
  if (observation.predicate !== expectation.predicate) return false;
  if (observation.value !== expectation.expectedValue) return false;
  const observedAt = asEpoch(observation.observedAt);
  return observedAt != null && observedAt <= confirmBy;
}

/**
 * Read-only. An observation counts only once `receivedAt` is at or before the clock.
 * `observedAt` is the event time and does not make the observation known early.
 */
export function evaluateExpectations(
  expectations: readonly OperationalExpectation[],
  observations: readonly OperationalObservation[],
  objects: readonly OperationalObject[],
  currentTime: number,
): ExpectationEvaluation[] {
  return expectations.map((expectation) => {
    const expectedAt = asEpoch(expectation.expectedAt);
    const confirmBy = asEpoch(expectation.confirmBy);
    const related = relatedObjects(expectation.subjectId, objects);
    if (expectedAt == null || confirmBy == null) {
      return {
        expectationId: expectation.id,
        subjectId: expectation.subjectId,
        predicate: expectation.predicate,
        expectedValue: expectation.expectedValue,
        expectedAt,
        confirmBy,
        observationId: null,
        observationSource: null,
        observedAt: null,
        receivedAt: null,
        status: "UNKNOWN",
        rule: "expectation-time-missing",
        attention: false,
        related,
      };
    }
    const known = observations.filter((observation) => {
      const receivedAt = asEpoch(observation.receivedAt);
      return receivedAt != null && receivedAt <= currentTime;
    });
    const match = known.find((observation) =>
      confirms(expectation, observation, confirmBy),
    );
    if (match) {
      return {
        expectationId: expectation.id,
        subjectId: expectation.subjectId,
        predicate: expectation.predicate,
        expectedValue: expectation.expectedValue,
        expectedAt,
        confirmBy,
        observationId: match.id,
        observationSource: match.source,
        observedAt: asEpoch(match.observedAt),
        receivedAt: asEpoch(match.receivedAt),
        status: "CONFIRMED",
        rule: "confirming-observation-known",
        attention: false,
        related,
      };
    }
    if (currentTime < expectedAt) {
      return blank(
        expectation,
        expectedAt,
        confirmBy,
        related,
        "PENDING",
        "before-expected-time",
        false,
      );
    }
    if (currentTime <= confirmBy) {
      return blank(
        expectation,
        expectedAt,
        confirmBy,
        related,
        "AWAITING_CONFIRMATION",
        "inside-confirmation-window",
        false,
      );
    }
    return blank(
      expectation,
      expectedAt,
      confirmBy,
      related,
      "NOT_CONFIRMED",
      "confirmation-deadline-passed",
      true,
    );
  });
}

function blank(
  expectation: OperationalExpectation,
  expectedAt: number,
  confirmBy: number,
  related: ExpectationRelation[],
  status: ExpectationStatus,
  rule: string,
  attention: boolean,
): ExpectationEvaluation {
  return {
    expectationId: expectation.id,
    subjectId: expectation.subjectId,
    predicate: expectation.predicate,
    expectedValue: expectation.expectedValue,
    expectedAt,
    confirmBy,
    observationId: null,
    observationSource: null,
    observedAt: null,
    receivedAt: null,
    status,
    rule,
    attention,
    related,
  };
}
