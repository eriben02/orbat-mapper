import type { OperationalClaim, OperationalObject } from "@/types/operationalModels";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";
import { operationalObjectLabel } from "@/scenariostore/operationalRelations";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";

/**
 * Presentation for the odyssey demo scenario only.
 * Facts are read from operational objects, relations and claims.
 * Nothing here writes state or decides whether a dependency passes.
 */
export const DEMO_OPERATION_ID = "demo-roz-alfa";

export function isDemoOperation(scenarioId: string | undefined) {
  return scenarioId === DEMO_OPERATION_ID;
}

export interface DemoLink {
  id: string;
  designator: string;
  kind: string;
  relationType: string;
  navigable: boolean;
}

export interface DemoTimeBeat {
  id: string;
  time: number;
  label: string;
}

export interface DemoReport {
  id: string;
  subjectId: string;
  subjectDesignator: string;
  subjectStatus: string;
  predicate: string;
  value: string;
  reportedAt: number;
  validFrom: number | null;
  validUntil: number | null;
  source: string;
  reason: string | null;
  authority: string;
  confidence: string;
  currentlyValid: boolean;
  futureValid: boolean;
  historical: boolean;
}

export interface DemoMissionOverview {
  missionId: string;
  designator: string;
  name: string;
  status: string;
  tot: number | null;
  target: DemoLink | null;
  executedBy: DemoLink | null;
  dependencies: DemoLink[];
  beats: DemoTimeBeat[];
  reports: DemoReport[];
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function designatorOf(object: OperationalObject | undefined, fallback: string) {
  if (!object) return fallback;
  return object._state?.designator ?? operationalObjectLabel(object);
}

function linkFor(
  mission: OperationalObject,
  relationType: string,
  byId: Map<string, OperationalObject>,
): DemoLink | null {
  const relation = (mission.relations ?? []).find((item) => item.type === relationType);
  if (!relation) return null;
  const target = byId.get(relation.target.id);
  const navigable = Boolean(target && target.kind === relation.target.kind);
  return {
    id: relation.target.id,
    designator:
      navigable && target ? designatorOf(target, relation.target.id) : relation.target.id,
    kind: relation.target.kind,
    relationType,
    navigable,
  };
}

/**
 * One mission in the scenario is the demo focus.
 * More than one mission is not guessed at.
 */
export function buildDemoMissionOverview(
  objects: readonly OperationalObject[],
  claims: readonly OperationalClaim[],
  currentTime: number,
): DemoMissionOverview | null {
  const missions = objects.filter((item) => item.kind === "mission");
  if (missions.length !== 1) return null;
  const mission = missions[0]!;
  const byId = new Map(objects.map((item) => [item.id, item]));
  const target = linkFor(mission, "targets", byId);
  const executedBy = linkFor(mission, "executed-by", byId);
  const trace = traceOperationalRelations(mission.id, objects, {
    includeInverses: false,
    excludeHidden: false,
  });
  const headerIds = new Set(
    [mission.id, target?.id, executedBy?.id].filter((id): id is string => Boolean(id)),
  );
  const dependencies: DemoLink[] = [];
  for (const node of trace.nodes) {
    if (headerIds.has(node.id) || !node.exists) continue;
    const object = byId.get(node.id);
    const step = node.path[node.path.length - 1];
    if (!object || !step) continue;
    dependencies.push({
      id: object.id,
      designator: designatorOf(object, object.id),
      kind: object.kind,
      relationType: step.relationType,
      navigable: true,
    });
  }

  const beats: DemoTimeBeat[] = [];
  const tot = mission.kind === "mission" ? asEpoch(mission.tot) : null;
  if (tot != null) {
    beats.push({
      id: `tot:${mission.id}`,
      time: tot,
      label: `${designatorOf(mission, mission.id)} TOT`,
    });
  }
  for (const node of trace.nodes) {
    const source = byId.get(node.id);
    if (!source) continue;
    for (const relation of source.relations ?? []) {
      const targetObject = byId.get(relation.target.id);
      const name = designatorOf(targetObject, relation.target.id);
      const windowStart = asEpoch(relation.constraint?.validFrom);
      const effectAt = asEpoch(relation.constraint?.effectAt);
      if (relation.type === "depends-on-effect-window" && windowStart != null) {
        beats.push({
          id: `window:${source.id}:${relation.target.id}`,
          time: windowStart,
          label: `${name} effect window`,
        });
      }
      if (effectAt != null) {
        beats.push({
          id: `effect:${source.id}:${relation.target.id}`,
          time: effectAt,
          label: `${name} effect time`,
        });
      }
    }
  }

  const reports: DemoReport[] = [];
  for (const object of objects) {
    for (const view of getClaimsForSubject(object.id, claims, currentTime)) {
      const reported = asEpoch(view.reportedAt) ?? view.reportedAt;
      if (!beats.some((beat) => beat.id === `report:${view.id}`)) {
        beats.push({
          id: `report:${view.id}`,
          time: reported,
          label: `${view.source} report`,
        });
      }
      if (
        view.validFrom != null &&
        !beats.some((beat) => beat.id === `claim-from:${view.id}`)
      ) {
        beats.push({
          id: `claim-from:${view.id}`,
          time: view.validFrom,
          label: `Claimed ${designatorOf(object, object.id)} window`,
        });
      }
      if (
        view.validUntil != null &&
        !beats.some((beat) => beat.id === `claim-until:${view.id}`)
      ) {
        beats.push({
          id: `claim-until:${view.id}`,
          time: view.validUntil,
          label: `Claimed window ends`,
        });
      }
      if (!view.known) continue;
      reports.push({
        id: view.id,
        subjectId: object.id,
        subjectDesignator: designatorOf(object, object.id),
        subjectStatus: object._state?.status ?? object.status,
        predicate: view.predicate,
        value: view.value,
        reportedAt: reported,
        validFrom: view.validFrom,
        validUntil: view.validUntil,
        source: view.source,
        reason: view.reason,
        authority: view.authority,
        confidence: view.confidence,
        currentlyValid: view.currentlyValid,
        futureValid: view.futureValid,
        historical: view.historical,
      });
    }
  }
  beats.sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));

  return {
    missionId: mission.id,
    designator: designatorOf(mission, mission.id),
    name: mission.kind === "mission" ? (mission._state?.name ?? mission.name) : "",
    status: mission._state?.status ?? mission.status,
    tot,
    target,
    executedBy,
    dependencies,
    beats,
    reports,
  };
}
