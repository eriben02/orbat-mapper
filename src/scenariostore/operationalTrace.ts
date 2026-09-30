import type { OperationalObject, OperationalRelation } from "@/types/operationalModels";
import { inverseRelationType } from "@/scenariostore/operationalRelations";

/**
 * Walk stored operational relationships.
 * Each step keeps the relation type and whether it is the stored edge or an inverse.
 * A path is a connection in the model. It is not an operational conclusion.
 */

export interface OperationalTraceEdge {
  sourceId: string;
  sourceKind: string;
  /** Relation type in the direction of this step. An inverse name when `derived`. */
  relationType: string;
  /** True when this step walks a stored edge backwards. */
  derived: boolean;
  /** Type of the stored edge, always in its canonical direction. */
  canonicalType: string;
  /** Object that stores the canonical edge. */
  canonicalSourceId: string;
  targetId: string;
  targetKind: string;
  targetExists: boolean;
  /** Target exists and its projected window does not contain the current clock. */
  targetHidden: boolean;
  depth: number;
}

export interface OperationalTraceNode {
  id: string;
  kind: string;
  depth: number;
  exists: boolean;
  hidden: boolean;
  /** Edges from the start object along the first path that reached this node. */
  path: OperationalTraceEdge[];
}

export interface OperationalTrace {
  startId: string;
  startExists: boolean;
  edges: OperationalTraceEdge[];
  nodes: OperationalTraceNode[];
}

export interface TraceOperationalRelationsOptions {
  /** Do not expand past this many edges. Default 6. */
  maxDepth?: number;
  /** Omit objects outside their validity window, and do not walk through them. */
  excludeHidden?: boolean;
  /** Also walk stored edges backwards, using the registered inverse name. Default true. */
  includeInverses?: boolean;
  /** Record edges whose target is not an operational object in this scenario. */
  includeMissingTargets?: boolean;
}

const DEFAULT_MAX_DEPTH = 6;

interface StepDraft {
  sourceId: string;
  sourceKind: string;
  relationType: string;
  derived: boolean;
  canonicalType: string;
  canonicalSourceId: string;
  targetId: string;
  targetKind: string;
  targetExists: boolean;
  targetHidden: boolean;
}

function ancestorIds(node: OperationalTraceNode): Set<string> {
  const ids = new Set<string>();
  if (node.path.length === 0) {
    ids.add(node.id);
    return ids;
  }
  const first = node.path[0];
  if (first) ids.add(first.sourceId);
  for (const edge of node.path) ids.add(edge.targetId);
  return ids;
}

function edgeKey(
  edge: Pick<
    OperationalTraceEdge,
    "canonicalSourceId" | "canonicalType" | "targetId" | "derived"
  >,
): string {
  return [
    edge.canonicalSourceId,
    edge.canonicalType,
    edge.targetId,
    edge.derived ? "1" : "0",
  ].join("|");
}

function canonicalStep(
  object: OperationalObject,
  relation: OperationalRelation,
  byId: ReadonlyMap<string, OperationalObject>,
): StepDraft {
  const target = byId.get(relation.target.id);
  const exists = Boolean(target && target.kind === relation.target.kind);
  return {
    sourceId: object.id,
    sourceKind: object.kind,
    relationType: relation.type,
    derived: false,
    canonicalType: relation.type,
    canonicalSourceId: object.id,
    targetId: relation.target.id,
    targetKind: exists && target ? target.kind : relation.target.kind,
    targetExists: exists,
    targetHidden: Boolean(exists && target?._hidden),
  };
}

function stepsFrom(
  object: OperationalObject,
  objects: readonly OperationalObject[],
  byId: ReadonlyMap<string, OperationalObject>,
  includeInverses: boolean,
): StepDraft[] {
  const steps: StepDraft[] = [];
  const relations = object.relations ?? [];
  for (const relation of relations) steps.push(canonicalStep(object, relation, byId));
  if (!includeInverses) return steps;
  for (const other of objects) {
    if (other.id === object.id) continue;
    for (const relation of other.relations ?? []) {
      if (relation.target.id !== object.id || relation.target.kind !== object.kind) {
        continue;
      }
      const inverse = inverseRelationType(relation.type);
      const alreadyStored = relations.some(
        (stored) =>
          stored.type === inverse &&
          stored.target.id === other.id &&
          stored.target.kind === other.kind,
      );
      if (alreadyStored) continue;
      steps.push({
        sourceId: object.id,
        sourceKind: object.kind,
        relationType: inverse,
        derived: true,
        canonicalType: relation.type,
        canonicalSourceId: other.id,
        targetId: other.id,
        targetKind: other.kind,
        targetExists: true,
        targetHidden: Boolean(other._hidden),
      });
    }
  }
  return steps;
}

/**
 * Breadth-first walk from `startObjectId`.
 * Connectivity uses stable ids. Designators are not read.
 * The start object is kept even when it is outside its validity window.
 */
export function traceOperationalRelations(
  startObjectId: string,
  objects: readonly OperationalObject[],
  options: TraceOperationalRelationsOptions = {},
): OperationalTrace {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const excludeHidden = options.excludeHidden ?? false;
  const includeInverses = options.includeInverses ?? true;
  const includeMissingTargets = options.includeMissingTargets ?? false;
  const byId = new Map(objects.map((item) => [item.id, item]));
  const start = byId.get(startObjectId);
  if (!start) {
    return { startId: startObjectId, startExists: false, edges: [], nodes: [] };
  }

  const startNode: OperationalTraceNode = {
    id: start.id,
    kind: start.kind,
    depth: 0,
    exists: true,
    hidden: Boolean(start._hidden),
    path: [],
  };
  const nodes = [startNode];
  const edges: OperationalTraceEdge[] = [];
  const nodeById = new Map<string, OperationalTraceNode>([[start.id, startNode]]);
  const seenEdges = new Set<string>();
  const queue = [start.id];
  const expanded = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || expanded.has(currentId)) continue;
    expanded.add(currentId);
    const current = byId.get(currentId);
    const currentNode = nodeById.get(currentId);
    if (!current || !currentNode) continue;
    if (currentNode.depth >= maxDepth) continue;
    if (excludeHidden && current._hidden && current.id !== start.id) continue;

    const ancestors = ancestorIds(currentNode);
    for (const step of stepsFrom(current, objects, byId, includeInverses)) {
      if (!step.targetExists && !includeMissingTargets) continue;
      if (step.targetExists && excludeHidden && step.targetHidden) continue;
      if (step.targetExists && ancestors.has(step.targetId)) continue;
      const key = edgeKey(step);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const edge: OperationalTraceEdge = { ...step, depth: currentNode.depth + 1 };
      edges.push(edge);
      if (!step.targetExists) continue;
      if (nodeById.has(step.targetId)) continue;
      const target = byId.get(step.targetId);
      if (!target) continue;
      const node: OperationalTraceNode = {
        id: target.id,
        kind: target.kind,
        depth: edge.depth,
        exists: true,
        hidden: Boolean(target._hidden),
        path: [...currentNode.path, edge],
      };
      nodes.push(node);
      nodeById.set(target.id, node);
      queue.push(target.id);
    }
  }

  return { startId: start.id, startExists: true, edges, nodes };
}
