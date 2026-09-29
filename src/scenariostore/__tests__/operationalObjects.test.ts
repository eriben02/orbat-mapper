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
import type { AirspaceControlMeasure } from "@/types/operationalModels";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const T_1100 = Date.parse("2026-01-15T11:00:00Z");
const T_1200 = Date.parse("2026-01-15T12:00:00Z");
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1430 = Date.parse("2026-01-15T14:30:00Z");
const T_1431 = Date.parse("2026-01-15T14:31:00Z");

function demoScenario(): Scenario {
  return JSON.parse(
    readFileSync("public/scenarios/roz-alfa.json", "utf8"),
  ) as Scenario;
}

function loadRoz() {
  const store = useNewScenarioStore(demoScenario());
  const object = store.state.operationalObjectMap[ROZ_ID];
  if (!object) throw new Error("ROZ ALFA was not loaded");
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
    expect(object.relations.map((relation) => [relation.type, relation.target.id])).toEqual([
      ["source", "ACMREQ-047"],
      ["authority", "JACC"],
      ["supports", "PACKAGE-21"],
    ]);
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
    expect(isAirspaceHiddenAt(projectAirspaceStateAt(object, T_1200), T_1200)).toBe(false);
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
    expect(again?.purpose).toBe("UAV operations");
    expect(again?.vertical).toEqual({
      lower: { system: "FL", value: 100 },
      upper: { system: "FL", value: 280 },
    });
    expect(again?._hidden).toBe(true);
    expect(restored.state.layerItemMap).toEqual({});
  });
});
