import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { OperationalObject, PackageRoutePoint } from "@/types/operationalModels";

export const OPERATION_SOURCE_ID = "operation-map";
export const OPERATION_ROUTE_LAYER_ID = "operation-route";
export const OPERATION_POINT_LAYER_ID = "operation-point";
export const OPERATION_LABEL_LAYER_ID = "operation-label";
export const OPERATION_POINT_LAYER_IDS = [
  OPERATION_POINT_LAYER_ID,
  OPERATION_LABEL_LAYER_ID,
];

export interface OperationMapProperties {
  objectId: string;
  designator: string;
  kind: "package" | "target";
  role: "route" | "position";
  selected: boolean;
}

export interface OperationMapPlanOptions {
  filterVisible: boolean;
  selectedIds: ReadonlySet<string>;
  currentTime: number;
}

/**
 * Position on a stored route at `timestamp`.
 * Linear between the two surrounding points. No speed, fuel, or aircraft model.
 * Before the first point and after the last, the position stays at that end.
 */
export function projectPackagePositionAt(
  route: readonly PackageRoutePoint[],
  timestamp: number,
): [number, number] | null {
  if (!Number.isFinite(timestamp) || route.length === 0) return null;
  const points = [...route].sort((a, b) => Number(a.t) - Number(b.t));
  const first = points[0]!;
  const firstTime = Number(first.t);
  if (timestamp <= firstTime) return first.position;
  const last = points[points.length - 1]!;
  if (timestamp >= Number(last.t)) return last.position;
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index]!;
    const prev = points[index - 1]!;
    const nextTime = Number(next.t);
    if (timestamp > nextTime) continue;
    const span = nextTime - Number(prev.t);
    const ratio = span <= 0 ? 0 : (timestamp - Number(prev.t)) / span;
    return [
      prev.position[0] + (next.position[0] - prev.position[0]) * ratio,
      prev.position[1] + (next.position[1] - prev.position[1]) * ratio,
    ];
  }
  return last.position;
}

/**
 * Operational objects → GeoJSON. The route and the point are both projections.
 * This function does not write a layer item or a unit.
 */
export function buildOperationMapPlan(
  objects: readonly OperationalObject[],
  options: OperationMapPlanOptions,
): FeatureCollection<Point | LineString, OperationMapProperties> {
  const features: Feature<Point | LineString, OperationMapProperties>[] = [];
  for (const object of objects) {
    if (options.filterVisible && object._hidden) continue;
    if (object.kind === "package" && object.route?.length) {
      const selected = options.selectedIds.has(object.id);
      const designator = object._state?.designator ?? object.designator;
      const coordinates = [...object.route]
        .sort((a, b) => Number(a.t) - Number(b.t))
        .map((point) => point.position);
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          objectId: object.id,
          designator,
          kind: "package",
          role: "route",
          selected,
        },
      });
      const position = projectPackagePositionAt(object.route, options.currentTime);
      if (position) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: position },
          properties: {
            objectId: object.id,
            designator,
            kind: "package",
            role: "position",
            selected,
          },
        });
      }
    }
    if (object.kind === "target" && object.position) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: object.position },
        properties: {
          objectId: object.id,
          designator: object._state?.designator ?? object.designator,
          kind: "target",
          role: "position",
          selected: options.selectedIds.has(object.id),
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
