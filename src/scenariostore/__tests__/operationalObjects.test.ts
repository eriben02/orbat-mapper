import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import "@/dayjs";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioTime } from "@/scenariostore/time";
import { useScenarioIO } from "@/scenariostore/io";
import {
  isAirspaceHiddenAt,
  projectAirspaceStateAt,
} from "@/scenariostore/operationalObjects";
import { presentRelations } from "@/scenariostore/operationalRelations";
import type { AirspaceControlMeasure } from "@/types/operationalModels";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const PKG_ID = "pK21QvR8sT0uYxZ4aB7cD";
const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const TARGET_ID = "tG17QvR8sT0uYxZ4aB7cF";
const T_1100 = Date.parse("2026-01-15T11:00:00Z");
const T_1200 = Date.parse("2026-01-15T12:00:00Z");
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1430 = Date.parse("2026-01-15T14:30:00Z");
const T_1431 = Date.parse("2026-01-15T14:31:00Z");
const T_1600 = Date.parse("2026-01-15T16:00:00Z");
const T_1601 = Date.parse("2026-01-15T16:01:00Z");

function demoScenario(): Scenario {
  return JSON.parse(readFileSync("public/scenarios/roz-alfa.json", "utf8")) as Scenario;
}

function loadRoz() {
  const store = useNewScenarioStore(demoScenario());
  const object = store.state.operationalObjectMap[ROZ_ID];
  if (object?.kind !== "airspace") throw new Error("ROZ ALFA was not loaded");
  const time = useScenarioTime(store);
  return { store, object, time };
}

describe("ROZ ALFA projection", () => {
  it("loads the demo as a domain object, not a layer item", () => {
    const { store, object } = loadRoz();
    expect(object.designator).toBe("ROZ ALFA");
    expect(object.kind).toBe("airspace");
    expect(object.type).toBe("ROZ");
    expect(object.id).not.toBe(object.designator);
    expect(object.geometry.type).toBe("Polygon");
    expect(store.state.layerItemMap).toEqual({});
    expect(
      object.relations.map((relation) => [relation.type, relation.target.id]),
    ).toEqual([
      ["source", "ACMREQ-047"],
      ["authority", "JACC"],
    ]);
    expect(object.relations.some((relation) => relation.target.id === "PACKAGE-21")).toBe(
      false,
    );
  });

  it("follows the scenario clock: hidden at 1100Z and 1431Z, visible from 1200Z through 1430Z", () => {
    const { object, time } = loadRoz();
    const hidden = (t: number) => {
      time.setCurrentTime(t);
      return object._hidden;
    };
    expect(hidden(T_1100)).toBe(true);
    expect(hidden(T_1200)).toBe(false);
    expect(hidden(T_1300)).toBe(false);
    expect(hidden(T_1430)).toBe(false);
    expect(hidden(T_1431)).toBe(true);
    expect(isAirspaceHiddenAt(projectAirspaceStateAt(object, T_1200), T_1200)).toBe(
      false,
    );
  });

  it("folds status from state[] on the same clock", () => {
    const { object, time } = loadRoz();
    object.state = [
      ...(object.state ?? []),
      { id: "later", t: T_1300, patch: { status: "APPROVED" } },
    ];
    time.setCurrentTime(T_1200);
    expect(object._state?.status).toBe("PLANNED");
    expect(object._hidden).toBe(false);
    time.setCurrentTime(T_1300);
    expect(object._state?.status).toBe("APPROVED");
    time.setCurrentTime(T_1431);
    expect(object._hidden).toBe(true);
    expect(object._state?.status).toBe("APPROVED");
  });

  it("round-trips through the scenario document without derived fields", () => {
    const { store, object } = loadRoz();
    object._hidden = false;
    object._state = {
      t: T_1300,
      status: "PLANNED",
      geometry: object.geometry,
    };
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const serialized = serializeToObject();
    const saved = serialized.operationalObjects?.[0] as AirspaceControlMeasure;
    expect(saved.designator).toBe("ROZ ALFA");
    expect(saved).not.toHaveProperty("_state");
    expect(saved).not.toHaveProperty("_hidden");
    expect(saved.geometry).toEqual(object.geometry);
    expect(Date.parse(String(saved.validFrom))).toBe(T_1200);
    expect(Date.parse(String(saved.validUntil))).toBe(T_1430);

    const restored = useNewScenarioStore(serialized);
    const again = restored.state.operationalObjectMap[ROZ_ID];
    if (again?.kind !== "airspace") throw new Error("ROZ ALFA was not restored");
    expect(again.purpose).toBe("UAV operations");
    expect(again.vertical).toEqual({
      lower: { system: "FL", value: 100 },
      upper: { system: "FL", value: 280 },
    });
    expect(again._hidden).toBe(false);
    expect(restored.state.layerItemMap).toEqual({});
  });
});

describe("PACKAGE-21", () => {
  it("loads as an operational object, not a layer item or a designator key", () => {
    const { store } = loadRoz();
    const object = store.state.operationalObjectMap[PKG_ID];
    expect(object?.kind).toBe("package");
    if (object?.kind !== "package") throw new Error("expected a package");
    expect(object.designator).toBe("PACKAGE-21");
    expect(object.name).toBe("UAV Support Package");
    expect(object.status).toBe("PLANNED");
    expect(object.id).not.toBe(object.designator);
    expect(object).not.toHaveProperty("geometry");
    expect(store.state.layerItemMap).toEqual({});
    expect(object.relations).toEqual(
      expect.arrayContaining([
        { type: "requires", target: { kind: "airspace", id: ROZ_ID } },
      ]),
    );
  });

  it("uses the scenario clock and overlaps ROZ ALFA while the zone is visible", () => {
    const { store, object: roz, time } = loadRoz();
    const pkg = store.state.operationalObjectMap[PKG_ID];
    if (pkg?.kind !== "package") throw new Error("expected a package");
    time.setCurrentTime(T_1100);
    expect(pkg._hidden).toBe(true);
    expect(roz._hidden).toBe(true);
    time.setCurrentTime(T_1200);
    expect(pkg._hidden).toBe(false);
    expect(roz._hidden).toBe(false);
    time.setCurrentTime(T_1300);
    expect(pkg._state?.status).toBe("PLANNED");
    expect(roz._hidden).toBe(false);
    time.setCurrentTime(T_1431);
    expect(roz._hidden).toBe(true);
    expect(pkg._hidden).toBe(false);
    time.setCurrentTime(T_1600);
    expect(pkg._hidden).toBe(false);
    time.setCurrentTime(T_1601);
    expect(pkg._hidden).toBe(true);
  });

  it("saves the canonical requires edge and restores the derived inverse", () => {
    const { store } = loadRoz();
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const serialized = serializeToObject();
    const savedPkg = serialized.operationalObjects?.find((item) => item.id === PKG_ID);
    const savedRoz = serialized.operationalObjects?.find((item) => item.id === ROZ_ID);
    expect(savedPkg?.kind).toBe("package");
    if (savedPkg?.kind !== "package") throw new Error("expected a package");
    expect(savedPkg).not.toHaveProperty("_state");
    expect(savedPkg).not.toHaveProperty("_hidden");
    expect(savedPkg.name).toBe("UAV Support Package");
    expect(savedPkg.relations).toEqual(
      expect.arrayContaining([
        { type: "requires", target: { kind: "airspace", id: ROZ_ID } },
      ]),
    );
    expect(savedRoz?.relations?.some((relation) => relation.type === "required-by")).toBe(
      false,
    );
    expect(savedRoz?.relations?.some((relation) => relation.target.id === PKG_ID)).toBe(
      false,
    );

    const restored = useNewScenarioStore(serialized);
    const pkg = restored.state.operationalObjectMap[PKG_ID];
    const roz = restored.state.operationalObjectMap[ROZ_ID];
    if (pkg?.kind !== "package" || !roz) throw new Error("restore failed");
    const objects = Object.values(restored.state.operationalObjectMap);
    expect(
      presentRelations(pkg, objects).find((row) => row.type === "requires"),
    ).toMatchObject({
      targetId: ROZ_ID,
      label: "ROZ ALFA",
      derived: false,
      navigable: true,
    });
    expect(
      presentRelations(roz, objects).find((row) => row.type === "required-by"),
    ).toMatchObject({
      targetId: PKG_ID,
      label: "PACKAGE-21",
      derived: true,
      navigable: true,
    });
  });
});

describe("MISSION-04 and TARGET-17", () => {
  it("loads mission and target as operational objects without geometry", () => {
    const { store } = loadRoz();
    const mission = store.state.operationalObjectMap[MISSION_ID];
    const target = store.state.operationalObjectMap[TARGET_ID];
    expect(mission?.kind).toBe("mission");
    expect(target?.kind).toBe("target");
    if (mission?.kind !== "mission" || target?.kind !== "target") {
      throw new Error("expected mission and target");
    }
    expect(mission.designator).toBe("MISSION-04");
    expect(mission.name).toBe("Strike mission");
    expect(mission.id).not.toBe(mission.designator);
    expect(mission).not.toHaveProperty("geometry");
    expect(target.designator).toBe("TARGET-17");
    expect(target.name).toBe("Demo target");
    expect(target.id).not.toBe(target.designator);
    expect(target).not.toHaveProperty("geometry");
    expect(store.state.layerItemMap).toEqual({});
    expect(mission.relations).toEqual(
      expect.arrayContaining([
        { type: "executed-by", target: { kind: "package", id: PKG_ID } },
        { type: "targets", target: { kind: "target", id: TARGET_ID } },
      ]),
    );
    expect(target.relations).toEqual([]);
  });

  it("keeps all four objects active at 1300Z", () => {
    const { store, time } = loadRoz();
    time.setCurrentTime(T_1300);
    const hidden = (id: string) => store.state.operationalObjectMap[id]?._hidden;
    expect(hidden(ROZ_ID)).toBe(false);
    expect(hidden(PKG_ID)).toBe(false);
    expect(hidden(MISSION_ID)).toBe(false);
    expect(hidden(TARGET_ID)).toBe(false);
  });

  it("persists mission edges and derives inverses after reload", () => {
    const { store } = loadRoz();
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const serialized = serializeToObject();
    const savedMission = serialized.operationalObjects?.find(
      (item) => item.id === MISSION_ID,
    );
    const savedTarget = serialized.operationalObjects?.find(
      (item) => item.id === TARGET_ID,
    );
    const savedPkg = serialized.operationalObjects?.find((item) => item.id === PKG_ID);
    expect(savedMission?.kind).toBe("mission");
    expect(savedTarget?.kind).toBe("target");
    if (savedMission?.kind !== "mission" || savedTarget?.kind !== "target") {
      throw new Error("expected saved mission and target");
    }
    expect(savedMission).not.toHaveProperty("_state");
    expect(savedMission).not.toHaveProperty("_hidden");
    expect(savedTarget).not.toHaveProperty("_state");
    expect(savedMission.relations).toEqual(
      expect.arrayContaining([
        { type: "executed-by", target: { kind: "package", id: PKG_ID } },
        { type: "targets", target: { kind: "target", id: TARGET_ID } },
      ]),
    );
    expect(savedTarget.relations).toEqual([]);
    expect(savedPkg?.relations).toEqual(
      expect.arrayContaining([
        { type: "requires", target: { kind: "airspace", id: ROZ_ID } },
      ]),
    );
    expect(savedPkg?.relations?.some((relation) => relation.type === "executes")).toBe(
      false,
    );

    const restored = useNewScenarioStore(serialized);
    const objects = Object.values(restored.state.operationalObjectMap);
    const mission = restored.state.operationalObjectMap[MISSION_ID];
    const target = restored.state.operationalObjectMap[TARGET_ID];
    const pkg = restored.state.operationalObjectMap[PKG_ID];
    if (mission?.kind !== "mission" || target?.kind !== "target" || !pkg) {
      throw new Error("restore failed");
    }
    expect(
      presentRelations(mission, objects).find((row) => row.type === "executed-by"),
    ).toMatchObject({
      targetId: PKG_ID,
      label: "PACKAGE-21",
      derived: false,
      navigable: true,
    });
    expect(
      presentRelations(mission, objects).find((row) => row.type === "targets"),
    ).toMatchObject({
      targetId: TARGET_ID,
      label: "TARGET-17",
      derived: false,
      navigable: true,
    });
    expect(
      presentRelations(pkg, objects).find((row) => row.type === "executes"),
    ).toMatchObject({
      targetId: MISSION_ID,
      label: "MISSION-04",
      derived: true,
      navigable: true,
    });
    expect(
      presentRelations(target, objects).find((row) => row.type === "targeted-by"),
    ).toMatchObject({
      targetId: MISSION_ID,
      label: "MISSION-04",
      derived: true,
      navigable: true,
    });
    expect(pkg.relations.some((relation) => relation.type === "executes")).toBe(false);
    expect(target.relations.some((relation) => relation.type === "targeted-by")).toBe(
      false,
    );
  });
});
