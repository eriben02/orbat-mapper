import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioTime } from "@/scenariostore/time";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";
import type {
  AirspaceControlMeasure,
  OperationalMission,
  OperationalObject,
  OperationalPackage,
  OperationalTarget,
} from "@/types/operationalModels";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const PKG_ID = "pK21QvR8sT0uYxZ4aB7cD";
const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const TARGET_ID = "tG17QvR8sT0uYxZ4aB7cF";
const T_1100 = Date.parse("2026-01-15T11:00:00Z");
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1431 = Date.parse("2026-01-15T14:31:00Z");

function demoAt(timestamp: number) {
  const scenario = JSON.parse(
    readFileSync("public/scenarios/roz-alfa.json", "utf8"),
  ) as Scenario;
  const store = useNewScenarioStore(scenario);
  useScenarioTime(store).setCurrentTime(timestamp);
  const objects = store.state.operationalObjectIds.map(
    (id) => store.state.operationalObjectMap[id]!,
  );
  return { store, objects };
}

function named(
  kind: "package" | "mission" | "target",
  id: string,
  relations: OperationalObject["relations"] = [],
): OperationalPackage | OperationalMission | OperationalTarget {
  return {
    id,
    kind,
    designator: id.toUpperCase(),
    name: id,
    validFrom: 0,
    validUntil: 1,
    status: "PLANNED",
    relations,
  };
}

describe("traceOperationalRelations", () => {
  it("walks the demo from ROZ ALFA through inverses to TARGET-17", () => {
    const { objects } = demoAt(T_1300);
    const trace = traceOperationalRelations(ROZ_ID, objects, { excludeHidden: true });
    const ids = trace.nodes.map((node) => node.id);
    expect(ids).toEqual([ROZ_ID, PKG_ID, MISSION_ID, TARGET_ID]);

    const toPackage = trace.edges.find((edge) => edge.targetId === PKG_ID);
    const toMission = trace.edges.find((edge) => edge.targetId === MISSION_ID);
    const toTarget = trace.edges.find((edge) => edge.targetId === TARGET_ID);
    expect(toPackage).toMatchObject({
      sourceId: ROZ_ID,
      sourceKind: "airspace",
      relationType: "required-by",
      derived: true,
      canonicalType: "requires",
      canonicalSourceId: PKG_ID,
      targetKind: "package",
      targetExists: true,
      depth: 1,
    });
    expect(toMission).toMatchObject({
      sourceId: PKG_ID,
      relationType: "executes",
      derived: true,
      canonicalType: "executed-by",
      canonicalSourceId: MISSION_ID,
      targetKind: "mission",
      depth: 2,
    });
    expect(toTarget).toMatchObject({
      sourceId: MISSION_ID,
      relationType: "targets",
      derived: false,
      canonicalType: "targets",
      canonicalSourceId: MISSION_ID,
      targetKind: "target",
      depth: 3,
    });
    expect(toPackage?.targetId).not.toBe("PACKAGE-21");
    expect(toMission?.targetId).not.toBe("MISSION-04");
    expect(toTarget?.targetId).not.toBe("TARGET-17");
  });

  it("does not use designators, so renaming one does not change connectivity", () => {
    const { objects } = demoAt(T_1300);
    const before = traceOperationalRelations(ROZ_ID, objects);
    const pkg = objects.find((item) => item.id === PKG_ID);
    const mission = objects.find((item) => item.id === MISSION_ID);
    const target = objects.find((item) => item.id === TARGET_ID);
    if (pkg) pkg.designator = "PACKAGE-RENAMED";
    if (mission) mission.designator = "MISSION-RENAMED";
    if (target) target.designator = "TARGET-RENAMED";
    const after = traceOperationalRelations(ROZ_ID, objects);
    expect(
      after.edges.map((edge) => [edge.sourceId, edge.targetId, edge.canonicalType]),
    ).toEqual(
      before.edges.map((edge) => [edge.sourceId, edge.targetId, edge.canonicalType]),
    );
  });

  it("can exclude objects outside the current validity window", () => {
    const hiddenClock = demoAt(T_1100);
    const hiddenTrace = traceOperationalRelations(ROZ_ID, hiddenClock.objects, {
      excludeHidden: true,
    });
    expect(hiddenTrace.nodes).toHaveLength(1);
    expect(hiddenTrace.edges).toEqual([]);
    expect(hiddenTrace.nodes[0]?.hidden).toBe(true);

    const later = demoAt(T_1431);
    const laterTrace = traceOperationalRelations(ROZ_ID, later.objects, {
      excludeHidden: true,
    });
    expect(laterTrace.nodes.find((node) => node.id === ROZ_ID)?.hidden).toBe(true);
    expect(laterTrace.nodes.map((node) => node.id)).toEqual([
      ROZ_ID,
      PKG_ID,
      MISSION_ID,
      TARGET_ID,
    ]);
    expect(laterTrace.nodes.find((node) => node.id === TARGET_ID)?.hidden).toBe(false);

    const { objects } = demoAt(T_1300);
    const target = objects.find((item) => item.id === TARGET_ID);
    if (target) target._hidden = true;
    const excluded = traceOperationalRelations(ROZ_ID, objects, { excludeHidden: true });
    expect(excluded.nodes.map((node) => node.id)).toEqual([ROZ_ID, PKG_ID, MISSION_ID]);
    const kept = traceOperationalRelations(ROZ_ID, objects, { excludeHidden: false });
    expect(kept.edges.find((edge) => edge.targetId === TARGET_ID)?.targetHidden).toBe(
      true,
    );
  });

  it("stops on cycles, duplicate edges, missing targets, and max depth", () => {
    const left = named("package", "left", [
      { type: "requires", target: { kind: "package", id: "right" } },
      { type: "requires", target: { kind: "package", id: "right" } },
    ]);
    const right = named("package", "right", [
      { type: "requires", target: { kind: "package", id: "left" } },
    ]);
    const cyclic = traceOperationalRelations("left", [left, right]);
    expect(cyclic.nodes.map((node) => node.id)).toEqual(["left", "right"]);
    expect(cyclic.edges).toHaveLength(2);

    const chain = [
      named("package", "a", [{ type: "requires", target: { kind: "mission", id: "b" } }]),
      named("mission", "b", [
        { type: "executed-by", target: { kind: "package", id: "a" } },
        { type: "targets", target: { kind: "target", id: "c" } },
      ]),
      named("target", "c"),
    ];
    const shallow = traceOperationalRelations("a", chain, {
      maxDepth: 1,
      includeInverses: false,
    });
    expect(shallow.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(shallow.edges.every((edge) => edge.depth <= 1)).toBe(true);

    const broken = named("mission", "solo", [
      { type: "targets", target: { kind: "target", id: "gone" } },
    ]);
    expect(() =>
      traceOperationalRelations("solo", [broken], { includeMissingTargets: true }),
    ).not.toThrow();
    const missing = traceOperationalRelations("solo", [broken], {
      includeMissingTargets: true,
    });
    expect(missing.edges[0]).toMatchObject({
      targetId: "gone",
      targetExists: false,
      derived: false,
    });
    expect(missing.nodes).toHaveLength(1);
  });

  it("does not invent a canonical edge when only the inverse is stored elsewhere", () => {
    const { objects } = demoAt(T_1300);
    const forwardOnly = traceOperationalRelations(ROZ_ID, objects, {
      includeInverses: false,
    });
    expect(forwardOnly.edges.some((edge) => edge.targetId === PKG_ID)).toBe(false);
    const zone = objects.find((item) => item.id === ROZ_ID) as AirspaceControlMeasure;
    expect(zone.relations.some((relation) => relation.target.id === PKG_ID)).toBe(false);
  });
});
