import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { OperationalObject } from "@/types/operationalModels";

export interface AirspaceRenderProperties {
  objectId: string;
  designator: string;
  type: string;
  status: string;
  purpose: string;
  selected: boolean;
  /** A known claim exists. This is not an availability state. */
  report: boolean;
}

export interface AirspaceRenderPlanOptions {
  /** Drop measures whose projected window does not contain the clock. */
  filterVisible: boolean;
  selectedIds: ReadonlySet<string>;
  /** Object ids that have a claim known at the current time. */
  reportedIds?: ReadonlySet<string>;
}

/**
 * Store → GeoJSON. The geometry is the operational object's geometry.
 * Nothing in this function writes back to the store or to a layer item.
 */
export function buildAirspaceRenderPlan(
  objects: readonly OperationalObject[],
  options: AirspaceRenderPlanOptions,
): FeatureCollection<Polygon, AirspaceRenderProperties> {
  const features: Feature<Polygon, AirspaceRenderProperties>[] = [];
  for (const object of objects) {
    if (object.kind !== "airspace") continue;
    if (options.filterVisible && object._hidden) continue;
    const projected = object._state;
    const geometry = projected?.geometry ?? object.geometry;
    features.push({
      type: "Feature",
      geometry,
      properties: {
        objectId: object.id,
        designator: projected?.designator ?? object.designator,
        type: object.type,
        status: projected?.status ?? object.status,
        purpose: projected?.purpose ?? object.purpose ?? "",
        selected: options.selectedIds.has(object.id),
        report: options.reportedIds?.has(object.id) ?? false,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
