import type { OperationalObject, OperationalRelation } from "@/types/operationalModels";

/**
 * Explicit inverses for edges this model actually stores.
 * Any other type still inverts, as `inverse-of-<type>`, so a new edge does not
 * need a Package/Airspace special case. Register a name here when the UI should
 * say something other than that fallback.
 *
 * Only one direction is stored. `required-by` is never written on ROZ ALFA.
 */
const INVERSE_RELATION_TYPE: Record<string, string> = {
  requires: "required-by",
  "required-by": "requires",
  "executed-by": "executes",
  executes: "executed-by",
  targets: "targeted-by",
  "targeted-by": "targets",
  "depends-on-effect-window": "effect-window-for",
  "effect-window-for": "depends-on-effect-window",
  "synchronized-with": "synchronized-by",
  "synchronized-by": "synchronized-with",
  "requires-recalculation": "recalculation-for",
  "recalculation-for": "requires-recalculation",
  "timing-assumption": "assumption-for",
  "assumption-for": "timing-assumption",
};

export function inverseRelationType(type: string): string {
  return INVERSE_RELATION_TYPE[type] ?? `inverse-of-${type}`;
}

/** What the panel prints. A rename of `designator` changes this and nothing else. */
export function operationalObjectLabel(object: OperationalObject): string {
  if (object.designator) return object.designator;
  if ("name" in object && object.name) return object.name;
  return object.id;
}

export interface PresentedRelation {
  key: string;
  type: string;
  /** False when this row is an edge stored on `object`. */
  derived: boolean;
  targetId: string;
  targetKind: string;
  /** Current designator, or the raw id when the target is not in the scenario. */
  label: string;
  navigable: boolean;
}

function matchesObject(
  relation: OperationalRelation,
  object: OperationalObject,
): boolean {
  return relation.target.id === object.id && relation.target.kind === object.kind;
}

/**
 * Canonical edges on `object`, then inverse edges stored on other objects.
 * A missing target becomes a non-navigable row. It does not throw.
 * If both directions were stored, the derived copy is dropped.
 */
export function presentRelations(
  object: OperationalObject,
  objects: readonly OperationalObject[],
): PresentedRelation[] {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const rows: PresentedRelation[] = [];
  const relations = object.relations ?? [];

  for (const relation of relations) {
    const target = byId.get(relation.target.id);
    const navigable = Boolean(target && target.kind === relation.target.kind);
    rows.push({
      key: `canonical:${relation.type}:${relation.target.kind}:${relation.target.id}`,
      type: relation.type,
      derived: false,
      targetId: relation.target.id,
      targetKind: relation.target.kind,
      label: navigable && target ? operationalObjectLabel(target) : relation.target.id,
      navigable,
    });
  }

  for (const other of objects) {
    if (other.id === object.id) continue;
    for (const relation of other.relations ?? []) {
      if (!matchesObject(relation, object)) continue;
      const inverse = inverseRelationType(relation.type);
      const alreadyStored = relations.some(
        (stored) =>
          stored.type === inverse &&
          stored.target.id === other.id &&
          stored.target.kind === other.kind,
      );
      if (alreadyStored) continue;
      rows.push({
        key: `inverse:${other.id}:${relation.type}:${relation.target.id}`,
        type: inverse,
        derived: true,
        targetId: other.id,
        targetKind: other.kind,
        label: operationalObjectLabel(other),
        navigable: true,
      });
    }
  }

  return rows;
}
