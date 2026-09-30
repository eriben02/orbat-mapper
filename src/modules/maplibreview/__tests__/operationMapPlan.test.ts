import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import "@/dayjs";
import {
  buildOperationMapPlan,
  projectPackagePositionAt,
} from "@/modules/maplibreview/operationMapPlan";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioIO } from "@/scenariostore/io";
import { evaluateExpectations } from "@/scenariostore/operationalExpectations";
import { buildAirspaceRenderPlan } from "@/modules/maplibreview/airspaceRenderPlan";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const PACKAGE_ID = "pK21QvR8sT0uYxZ4aB7cD";
const TARGET_ID = "tG17QvR8sT0uYxZ4aB7cF";
const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1320 = Date.parse("2026-01-15T13:20:00Z");
const T_1340 = Date.parse("2026-01-15T13:40:00Z");
const T_1345 = Date.parse("2026-01-15T13:45:00Z");
const T_1347 = Date.parse("2026-01-15T13:47:00Z");
const T_1348 = Date.parse("2026-01-15T13:48:00Z");

function loadDemo() {
  const scenario = JSON.parse(
    readFileSync("public/scenarios/roz-alfa.json", "utf8"),
  ) as Scenario;
  return useNewScenarioStore(scenario);
}

function objectsOf(store: ReturnType<typeof loadDemo>) {
  return store.state.operationalObjectIds.map(
    (id) => store.state.operationalObjectMap[id]!,
  );
}

function planAt(store: ReturnType<typeof loadDemo>, time: number) {
  return buildOperationMapPlan(objectsOf(store), {
    filterVisible: true,
    selectedIds: new Set(),
    currentTime: time,
  });
}

function positionOf(store: ReturnType<typeof loadDemo>, objectId: string, time: number) {
  const feature = planAt(store, time).features.find(
    (item) =>
      item.properties.objectId === objectId && item.properties.role === "position",
  );
  return feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
}

describe("operation map projection", () => {
  it("keeps the package and the target as operational objects", () => {
    const store = loadDemo();
    expect(store.state.operationalObjectMap[PACKAGE_ID]?.kind).toBe("package");
    expect(store.state.operationalObjectMap[TARGET_ID]?.kind).toBe("target");
    expect(store.state.unitMap[PACKAGE_ID]).toBeUndefined();
    expect(store.state.unitMap[TARGET_ID]).toBeUndefined();
    expect(store.state.layerItemMap[PACKAGE_ID]).toBeUndefined();
    expect(store.state.layerItemMap[TARGET_ID]).toBeUndefined();
    expect(Object.values(store.state.unitMap)).toHaveLength(0);
    expect(Object.keys(store.state.layerItemMap)).toHaveLength(0);
  });

  it("moves the package with the clock and leaves the target where it is", () => {
    const store = loadDemo();
    const pkg = store.state.operationalObjectMap[PACKAGE_ID];
    const route = pkg?.kind === "package" ? (pkg.route ?? []) : [];
    expect(pkg?.kind).toBe("package");
    expect(projectPackagePositionAt(route, T_1300)).toEqual([13.9, 57.2]);
    expect(projectPackagePositionAt(route, T_1320)).toEqual([14.85, 57.65]);
    expect(projectPackagePositionAt(route, T_1340)).toEqual([15.45, 57.95]);
    expect(projectPackagePositionAt(route, T_1345)).toEqual([15.9, 58.1]);
    const between = projectPackagePositionAt(route, (T_1300 + T_1320) / 2);
    expect(between?.[0]).toBeCloseTo((13.9 + 14.85) / 2);
    expect(between?.[1]).toBeCloseTo((57.2 + 57.65) / 2);
    expect(projectPackagePositionAt(route, T_1345)).toEqual([15.9, 58.1]);
    expect(projectPackagePositionAt(route, T_1300)).toEqual([13.9, 57.2]);

    expect(positionOf(store, PACKAGE_ID, T_1300)).toEqual([13.9, 57.2]);
    expect(positionOf(store, PACKAGE_ID, T_1345)).toEqual([15.9, 58.1]);
    expect(positionOf(store, PACKAGE_ID, T_1300)).toEqual([13.9, 57.2]);
    expect(positionOf(store, TARGET_ID, T_1300)).toEqual([16.15, 58.2]);
    expect(positionOf(store, TARGET_ID, T_1345)).toEqual([16.15, 58.2]);
  });

  it("puts stable operational ids on the render output and nothing else", () => {
    const store = loadDemo();
    const plan = planAt(store, T_1300);
    const ids = plan.features.map((feature) => feature.properties.objectId);
    expect(ids).toEqual(expect.arrayContaining([PACKAGE_ID, TARGET_ID]));
    expect(ids).not.toContain("PACKAGE-21");
    expect(ids).not.toContain("TARGET-17");
    expect(plan.features.map((feature) => feature.properties.kind)).not.toContain(
      "mission",
    );
    expect(plan.features.map((feature) => feature.properties.designator)).not.toContain(
      "SEAD-03",
    );
    const route = plan.features.find((feature) => feature.properties.role === "route");
    expect(route?.geometry.type).toBe("LineString");
    expect(route?.properties.objectId).toBe(PACKAGE_ID);
  });

  it("round-trips the route and the target position", () => {
    const store = loadDemo();
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const restored = useNewScenarioStore(serializeToObject());
    const pkg = restored.state.operationalObjectMap[PACKAGE_ID];
    const target = restored.state.operationalObjectMap[TARGET_ID];
    expect(
      pkg?.kind === "package"
        ? pkg.route?.map((point) => [point.t, point.position])
        : null,
    ).toEqual([
      [T_1300, [13.9, 57.2]],
      [T_1320, [14.85, 57.65]],
      [T_1340, [15.45, 57.95]],
      [T_1345, [15.9, 58.1]],
    ]);
    expect(target?.kind === "target" ? target.position : null).toEqual([16.15, 58.2]);
  });

  it("still marks a known ROZ report without treating it as unavailability", () => {
    const store = loadDemo();
    const time = Date.parse("2026-01-15T13:20:00Z");
    const reported = new Set(
      objectsOf(store)
        .filter((object) =>
          getClaimsForSubject(object.id, store.state.operationalClaims, time).some(
            (claim) => claim.known,
          ),
        )
        .map((object) => object.id),
    );
    const airspace = buildAirspaceRenderPlan(objectsOf(store), {
      filterVisible: true,
      selectedIds: new Set(),
      reportedIds: reported,
    });
    const roz = airspace.features.find(
      (feature) => feature.properties.objectId === ROZ_ID,
    );
    expect(roz?.properties.report).toBe(true);
    expect(roz?.properties.status).toBe("PLANNED");
    expect(store.state.operationalObjectMap[ROZ_ID]?.status).toBe("PLANNED");
  });

  it("still confirms the late TLAM observation without a map object for it", () => {
    const store = loadDemo();
    const objects = objectsOf(store);
    const missed = evaluateExpectations(
      store.state.operationalExpectations,
      store.state.operationalObservations,
      objects,
      T_1347,
    )[0];
    const confirmed = evaluateExpectations(
      store.state.operationalExpectations,
      store.state.operationalObservations,
      objects,
      T_1348,
    )[0];
    expect(missed?.status).toBe("NOT_CONFIRMED");
    expect(confirmed?.status).toBe("CONFIRMED");
    const plan = planAt(store, T_1348);
    expect(plan.features.map((feature) => feature.properties.objectId)).not.toContain(
      "tL07QvR8sT0uYxZ4aB7cH",
    );
  });
});
