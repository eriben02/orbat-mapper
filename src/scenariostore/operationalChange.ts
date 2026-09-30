import type {
  OperationalClaim,
  OperationalObject,
  OperationalRelation,
} from "@/types/operationalModels";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";

/**
 * Evaluate a proposed TOT against declared dependencies.
 * This does not write the proposal back onto the plan.
 * A finding is either calculated from stored numbers or flagged because the
 * model does not contain the facts a calculation would need.
 */

export type EvaluationStatus =
  "SATISFIED" | "CONFLICT" | "CHANGED" | "REVIEW_REQUIRED" | "UNKNOWN" | "CLAIM_PRESENT";

export interface EvaluationFact {
  key: string;
  value: string | number | boolean;
}

export interface EvaluationFinding {
  status: EvaluationStatus;
  objectId: string;
  objectKind: string;
  relationType: string;
  relationSourceId: string;
  derived: false;
  rule: string;
  calculated: boolean;
  review: boolean;
  facts: EvaluationFact[];
}

export interface ProposedChangeEvaluation {
  subjectId: string;
  field: "tot";
  current: number | null;
  proposed: number;
  findings: EvaluationFinding[];
}

const EVALUATED_RELATION_TYPES = new Set([
  "depends-on-effect-window",
  "synchronized-with",
  "requires-recalculation",
  "timing-assumption",
  "requires",
]);

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function finding(
  relation: OperationalRelation,
  sourceId: string,
  target: { id: string; kind: string } | undefined,
  status: EvaluationStatus,
  rule: string,
  calculated: boolean,
  facts: EvaluationFact[],
): EvaluationFinding {
  return {
    status,
    objectId: target?.id ?? relation.target.id,
    objectKind: target?.kind ?? relation.target.kind,
    relationType: relation.type,
    relationSourceId: sourceId,
    derived: false,
    rule,
    calculated,
    review: status !== "SATISFIED" && status !== "CONFLICT",
    facts,
  };
}

function evaluateRelation(
  relation: OperationalRelation,
  sourceId: string,
  target: OperationalObject | undefined,
  current: number | null,
  proposed: number,
  changed: boolean,
): EvaluationFinding | null {
  if (!EVALUATED_RELATION_TYPES.has(relation.type)) return null;
  if (!target || target.kind !== relation.target.kind) {
    return finding(
      relation,
      sourceId,
      undefined,
      "UNKNOWN",
      "dependency-target-missing",
      false,
      [{ key: "proposed", value: proposed }],
    );
  }

  if (relation.type === "depends-on-effect-window") {
    const from = asEpoch(relation.constraint?.validFrom);
    const until = asEpoch(relation.constraint?.validUntil);
    if (from == null || until == null) {
      return finding(
        relation,
        sourceId,
        target,
        "UNKNOWN",
        "effect-window-missing",
        false,
        [{ key: "proposed", value: proposed }],
      );
    }
    const inside = proposed >= from && proposed <= until;
    return finding(
      relation,
      sourceId,
      target,
      inside ? "SATISFIED" : "CONFLICT",
      "effect-window-contains-instant",
      true,
      [
        { key: "windowFrom", value: from },
        { key: "windowUntil", value: until },
        { key: "proposed", value: proposed },
        { key: "inside", value: inside },
      ],
    );
  }

  if (relation.type === "synchronized-with") {
    const effectAt = asEpoch(relation.constraint?.effectAt);
    if (effectAt == null) {
      return finding(
        relation,
        sourceId,
        target,
        "UNKNOWN",
        "synchronization-instant-missing",
        false,
        [{ key: "proposed", value: proposed }],
      );
    }
    if (!changed) {
      return finding(
        relation,
        sourceId,
        target,
        "SATISFIED",
        "synchronization-unchanged",
        true,
        [
          { key: "effectAt", value: effectAt },
          { key: "proposed", value: proposed },
        ],
      );
    }
    return finding(
      relation,
      sourceId,
      target,
      "CHANGED",
      "synchronization-instant-not-moved",
      true,
      [
        { key: "effectAt", value: effectAt },
        { key: "current", value: current ?? proposed },
        { key: "proposed", value: proposed },
      ],
    );
  }

  if (relation.type === "requires-recalculation") {
    const factors = relation.constraint?.unresolvedFactors ?? [];
    if (!changed) {
      return finding(
        relation,
        sourceId,
        target,
        "SATISFIED",
        "subject-time-unchanged",
        true,
        [{ key: "proposed", value: proposed }],
      );
    }
    return finding(
      relation,
      sourceId,
      target,
      "REVIEW_REQUIRED",
      "insufficient-model-for-recomputation",
      false,
      [
        { key: "proposed", value: proposed },
        { key: "validityCompared", value: false },
        ...factors.map((factor) => ({ key: "unresolvedFactor", value: factor })),
      ],
    );
  }

  if (relation.type === "timing-assumption") {
    if (!changed) {
      return finding(
        relation,
        sourceId,
        target,
        "SATISFIED",
        "assumption-basis-unchanged",
        true,
        [{ key: "proposed", value: proposed }],
      );
    }
    return finding(
      relation,
      sourceId,
      target,
      "REVIEW_REQUIRED",
      "timing-assumption-not-recomputed",
      false,
      [
        { key: "proposed", value: proposed },
        { key: "basis", value: relation.constraint?.basis ?? "subject-time" },
      ],
    );
  }

  if (!changed) {
    return finding(
      relation,
      sourceId,
      target,
      "SATISFIED",
      "requirement-unchanged",
      true,
      [{ key: "proposed", value: proposed }],
    );
  }
  const from = asEpoch(target.validFrom);
  const until = asEpoch(target.validUntil);
  const comparable = from != null && until != null;
  const inside = comparable ? proposed >= from && proposed <= until : false;
  return finding(
    relation,
    sourceId,
    target,
    "UNKNOWN",
    "requires-does-not-state-usability",
    false,
    [
      { key: "proposed", value: proposed },
      { key: "validityFrom", value: from ?? "absent" },
      { key: "validityUntil", value: until ?? "absent" },
      { key: "proposedInsideValidity", value: comparable ? inside : "unknown" },
    ],
  );
}

/**
 * Read-only. `objects` and `claims` are not written.
 * A claim inside a proposed TOT is reported as CLAIM_PRESENT.
 * It does not become CONFLICT and it does not change object state.
 */
export function evaluateProposedTot(
  subjectId: string,
  objects: readonly OperationalObject[],
  proposed: number,
  claims: readonly OperationalClaim[] = [],
): ProposedChangeEvaluation {
  const subject = objects.find((item) => item.id === subjectId);
  const current =
    subject && "tot" in subject && subject.tot != null ? asEpoch(subject.tot) : null;
  const changed = current != null && current !== proposed;
  const trace = traceOperationalRelations(subjectId, objects, {
    includeInverses: true,
    excludeHidden: false,
  });
  const byId = new Map(objects.map((item) => [item.id, item]));
  const findings: EvaluationFinding[] = [];
  for (const node of trace.nodes) {
    const source = byId.get(node.id);
    if (!source) continue;
    for (const relation of source.relations ?? []) {
      const target = byId.get(relation.target.id);
      const match = target && target.kind === relation.target.kind ? target : undefined;
      const next = evaluateRelation(
        relation,
        source.id,
        match,
        current,
        proposed,
        changed,
      );
      if (next) findings.push(next);
    }
  }
  findings.push(...availabilityClaimFindings(findings, claims, proposed));
  return { subjectId, field: "tot", current, proposed, findings };
}

function availabilityClaimFindings(
  findings: readonly EvaluationFinding[],
  claims: readonly OperationalClaim[],
  proposed: number,
): EvaluationFinding[] {
  const extra: EvaluationFinding[] = [];
  const seen = new Set<string>();
  for (const item of findings) {
    if (item.relationType !== "requires") continue;
    for (const view of getClaimsForSubject(item.objectId, claims, proposed)) {
      if (view.predicate !== "availability" || !view.currentlyValid) continue;
      if (seen.has(view.id)) continue;
      seen.add(view.id);
      extra.push({
        status: "CLAIM_PRESENT",
        objectId: item.objectId,
        objectKind: item.objectKind,
        relationType: "claim",
        relationSourceId: view.id,
        derived: false,
        rule: "availability-claim-present",
        calculated: false,
        review: true,
        facts: [
          { key: "claimId", value: view.id },
          { key: "value", value: view.value },
          { key: "reportedAt", value: view.reportedAt },
          { key: "validFrom", value: view.validFrom ?? "absent" },
          { key: "validUntil", value: view.validUntil ?? "absent" },
          { key: "source", value: view.source },
          { key: "authority", value: view.authority },
          { key: "authoritative", value: false },
        ],
      });
    }
  }
  return extra;
}
