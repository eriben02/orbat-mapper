import { describe, expect, it } from "vitest";
import type {
  AirspaceControlMeasure,
  OperationalPackage,
} from "@/types/operationalModels";
import {
  inverseRelationType,
  presentRelations,
} from "@/scenariostore/operationalRelations";

const ROZ_ID = "roz-internal";
const PKG_ID = "pkg-internal";

function roz(designator = "ROZ ALFA"): AirspaceControlMeasure {
  return {
    id: ROZ_ID,
    kind: "airspace",
    designator,
    type: "ROZ",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    vertical: {
      lower: { system: "FL", value: 100 },
      upper: { system: "FL", value: 280 },
    },
    validFrom: 0,
    validUntil: 1,
    status: "PLANNED",
    relations: [{ type: "source", target: { kind: "acmreq", id: "ACMREQ-047" } }],
  };
}

function pkg(designator = "PACKAGE-21"): OperationalPackage {
  return {
    id: PKG_ID,
    kind: "package",
    designator,
    name: "UAV Support Package",
    validFrom: 0,
    validUntil: 1,
    status: "PLANNED",
    relations: [{ type: "requires", target: { kind: "airspace", id: ROZ_ID } }],
  };
}

describe("operational relations", () => {
  it("derives required-by and does not store that edge", () => {
    const zone = roz();
    const packageObject = pkg();
    const inverse = presentRelations(zone, [zone, packageObject]).find(
      (row) => row.type === "required-by",
    );
    expect(inverse).toMatchObject({
      derived: true,
      targetId: PKG_ID,
      label: "PACKAGE-21",
      navigable: true,
    });
    expect(zone.relations.some((relation) => relation.type === "required-by")).toBe(
      false,
    );
    expect(inverseRelationType("requires")).toBe("required-by");
    expect(inverseRelationType("observes")).toBe("inverse-of-observes");
  });

  it("keeps the stored id when a designator changes", () => {
    const zone = roz("ROZ BRAVO");
    const packageObject = pkg();
    const requires = presentRelations(packageObject, [zone, packageObject]).find(
      (row) => row.type === "requires",
    );
    expect(requires).toMatchObject({
      label: "ROZ BRAVO",
      targetId: ROZ_ID,
      navigable: true,
    });
    expect(packageObject.relations[0]?.target.id).toBe(ROZ_ID);

    zone.designator = "ROZ CHARLIE";
    packageObject.designator = "PACKAGE-22";
    const again = presentRelations(packageObject, [zone, packageObject]).find(
      (row) => row.type === "requires",
    );
    const requiredBy = presentRelations(zone, [zone, packageObject]).find(
      (row) => row.type === "required-by",
    );
    expect(again?.label).toBe("ROZ CHARLIE");
    expect(again?.targetId).toBe(ROZ_ID);
    expect(packageObject.relations[0]?.target.id).toBe(ROZ_ID);
    expect(requiredBy).toMatchObject({ label: "PACKAGE-22", targetId: PKG_ID });
  });

  it("does not crash when the target object is gone", () => {
    const packageObject = pkg();
    packageObject.relations = [
      { type: "requires", target: { kind: "airspace", id: "deleted-roz" } },
    ];
    expect(() => presentRelations(packageObject, [packageObject])).not.toThrow();
    expect(presentRelations(packageObject, [packageObject])[0]).toMatchObject({
      label: "deleted-roz",
      navigable: false,
      targetId: "deleted-roz",
    });
    expect(() => presentRelations(roz(), [roz()])).not.toThrow();
    expect(presentRelations(roz(), [roz()])).toEqual([
      expect.objectContaining({
        type: "source",
        label: "ACMREQ-047",
        navigable: false,
      }),
    ]);
  });
});
