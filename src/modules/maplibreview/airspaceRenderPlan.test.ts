import { describe, expect, it } from "vitest";
import { buildAirspaceRenderPlan } from "@/modules/maplibreview/airspaceRenderPlan";
import type { AirspaceControlMeasure } from "@/types/operationalModels";

const polygon: AirspaceControlMeasure["geometry"] = {
  type: "Polygon",
  coordinates: [
    [
      [14.5, 57.5],
      [16.5, 57.5],
      [16.5, 58.8],
      [14.5, 58.8],
      [14.5, 57.5],
    ],
  ],
};

function roz(hidden: boolean): AirspaceControlMeasure {
  return {
    id: "7N3kP0wQvR2sT8uYxZ4aB",
    kind: "airspace",
    designator: "ROZ ALFA",
    type: "ROZ",
    geometry: polygon,
    vertical: {
      lower: { system: "FL", value: 100 },
      upper: { system: "FL", value: 280 },
    },
    validFrom: Date.parse("2026-01-15T12:00:00Z"),
    validUntil: Date.parse("2026-01-15T14:30:00Z"),
    status: "PLANNED",
    purpose: "UAV operations",
    relations: [],
    _hidden: hidden,
    _state: {
      t: Date.parse("2026-01-15T13:00:00Z"),
      designator: "ROZ ALFA",
      geometry: polygon,
      status: "PLANNED",
      purpose: "UAV operations",
    },
  };
}

describe("buildAirspaceRenderPlan", () => {
  it("projects a visible measure and keeps the domain geometry", () => {
    const object = roz(false);
    const plan = buildAirspaceRenderPlan([object], {
      filterVisible: true,
      selectedIds: new Set([object.id]),
    });
    expect(plan.features).toHaveLength(1);
    expect(plan.features[0]?.geometry).toBe(object.geometry);
    expect(plan.features[0]?.properties).toMatchObject({
      objectId: object.id,
      designator: "ROZ ALFA",
      type: "ROZ",
      status: "PLANNED",
      purpose: "UAV operations",
      selected: true,
    });
  });

  it("omits a measure the clock has hidden", () => {
    const plan = buildAirspaceRenderPlan([roz(true)], {
      filterVisible: true,
      selectedIds: new Set(),
    });
    expect(plan.features).toEqual([]);
  });

  it("can still project a hidden measure when the filter is off", () => {
    const plan = buildAirspaceRenderPlan([roz(true)], {
      filterVisible: false,
      selectedIds: new Set(),
    });
    expect(plan.features).toHaveLength(1);
    expect(plan.features[0]?.properties.selected).toBe(false);
  });
});
