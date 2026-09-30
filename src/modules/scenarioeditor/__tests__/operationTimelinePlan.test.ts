import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import "@/dayjs";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioTime } from "@/scenariostore/time";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import OperationTimeline from "@/modules/scenarioeditor/OperationTimeline.vue";
import { buildOperationMapPlan } from "@/modules/maplibreview/operationMapPlan";
import { projectPackagePositionAt } from "@/modules/maplibreview/operationMapPlan";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";
import { evaluateExpectations } from "@/scenariostore/operationalExpectations";
import {
  buildOperationTimelinePlan,
  formatScenarioClock,
  hourTicks,
  nowFraction,
  scenarioTimeFromTimelineFraction,
  utcDayStart,
} from "@/modules/scenarioeditor/operationTimelinePlan";
import { MS_PER_DAY } from "@/utils/time";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const PACKAGE_ID = "pK21QvR8sT0uYxZ4aB7cD";
const TARGET_ID = "tG17QvR8sT0uYxZ4aB7cF";
const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const TLAM_ID = "tL07QvR8sT0uYxZ4aB7cH";
const ASSESSMENT_ID = "tA01QvR8sT0uYxZ4aB7cJ";
const T_0600 = Date.parse("2026-01-15T06:00:00Z");
const T_1200 = Date.parse("2026-01-15T12:00:00Z");
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1320 = Date.parse("2026-01-15T13:20:00Z");
const T_1345 = Date.parse("2026-01-15T13:45:00Z");
const T_1347 = Date.parse("2026-01-15T13:47:00Z");
const T_1348 = Date.parse("2026-01-15T13:48:00Z");
const T_1800 = Date.parse("2026-01-15T18:00:00Z");

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

function planOf(store: ReturnType<typeof loadDemo>) {
  return buildOperationTimelinePlan(
    objectsOf(store),
    store.state.operationalClaims,
    store.state.operationalExpectations,
    store.state.operationalObservations,
  );
}

describe("operation timeline", () => {
  it("formats the scenario clock in Zulu and places now on a fixed 24-hour scale", () => {
    expect(formatScenarioClock(T_1320)).toBe("13:20:00Z");
    expect(formatScenarioClock(T_1300)).toBe("13:00:00Z");
    expect(formatScenarioClock(T_1347)).toBe("13:47:00Z");
    expect(formatScenarioClock(T_1348)).toBe("13:48:00Z");
    expect(nowFraction(T_1200)).toBe(0.5);
    expect(nowFraction(T_1800)).toBe(0.75);
    expect(nowFraction(T_1320)).toBeCloseTo((13 * 60 + 20) / (24 * 60));
    const labels = hourTicks(2)
      .filter((tick) => tick.label)
      .map((tick) => tick.hour);
    expect(labels).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
    expect(hourTicks(1)).toHaveLength(25);
    expect(utcDayStart(T_1347) + MS_PER_DAY - utcDayStart(T_1347)).toBe(MS_PER_DAY);
  });

  it("seeks any fraction of the same day, including backwards", () => {
    const day = utcDayStart(T_1300);
    expect(scenarioTimeFromTimelineFraction(day, 0.25)).toBe(T_0600);
    expect(scenarioTimeFromTimelineFraction(day, 0.5)).toBe(T_1200);
    expect(scenarioTimeFromTimelineFraction(day, 0.75)).toBe(T_1800);
    expect(scenarioTimeFromTimelineFraction(day, nowFraction(T_1347))).toBe(T_1347);
    expect(scenarioTimeFromTimelineFraction(day, nowFraction(T_1300))).toBe(T_1300);
    const store = loadDemo();
    const pkg = store.state.operationalObjectMap[PACKAGE_ID];
    const route = pkg?.kind === "package" ? (pkg.route ?? []) : [];
    const back = scenarioTimeFromTimelineFraction(day, nowFraction(T_1300));
    expect(projectPackagePositionAt(route, T_1347)).toEqual([15.9, 58.1]);
    expect(projectPackagePositionAt(route, back)).toEqual([13.9, 57.2]);
  });

  it("projects swimlanes from operational objects and ignores how many events exist", () => {
    const store = loadDemo();
    const plan = planOf(store);
    expect(plan.lanes.map((lane) => lane.designator)).toEqual([
      "PACKAGE-21",
      "ROZ ALFA",
      "TARGET-17",
      "TLAM-STRIKE-07",
      "THREAT-ASSESSMENT-01",
    ]);
    expect(plan.lanes.map((lane) => lane.objectId)).toEqual([
      PACKAGE_ID,
      ROZ_ID,
      TARGET_ID,
      TLAM_ID,
      ASSESSMENT_ID,
    ]);
    const pkg = plan.lanes[0]!;
    expect(pkg.markers.map((marker) => marker.label)).toEqual([
      "route",
      "route",
      "route",
      "route",
      "TOT",
    ]);
    expect(pkg.intervals[0]).toMatchObject({ tone: "validity", start: T_1200 });
    const roz = plan.lanes[1]!;
    expect(roz.intervals.map((interval) => interval.tone)).toEqual(["validity", "claim"]);
    expect(roz.markers.map((marker) => marker.label)).toEqual(["report"]);
    const tlam = plan.lanes[3]!;
    expect(tlam.markers.map((marker) => marker.label)).toEqual(
      expect.arrayContaining(["effect", "expected", "observed", "received"]),
    );
    expect(tlam.intervals.map((interval) => interval.tone)).toEqual([
      "validity",
      "confirm",
    ]);
    expect(plan.lanes.map((lane) => lane.designator)).not.toContain("SEAD-03");
    expect(plan.lanes.map((lane) => lane.designator)).not.toContain("MISSION-04");
    const afternoonOnly = buildOperationTimelinePlan([
      {
        ...objectsOf(store)[0]!,
        state: [],
      },
    ]);
    expect(afternoonOnly.lanes).toHaveLength(1);
    const ticks = hourTicks(2);
    expect(ticks[0]?.fraction).toBe(0);
    expect(ticks[ticks.length - 1]?.fraction).toBe(1);
  });

  it("uses the same operational id as the map projection", () => {
    const store = loadDemo();
    const lane = planOf(store).lanes.find((item) => item.objectId === PACKAGE_ID);
    const map = buildOperationMapPlan(objectsOf(store), {
      filterVisible: true,
      selectedIds: new Set([PACKAGE_ID]),
      currentTime: T_1300,
    });
    expect(
      map.features.some((feature) => feature.properties.objectId === lane?.objectId),
    ).toBe(true);
    expect(
      map.features.find((feature) => feature.properties.objectId === PACKAGE_ID)
        ?.properties.selected,
    ).toBe(true);
  });

  it("keeps the existing 1300–1348 behaviour on the same clock", () => {
    const store = loadDemo();
    const objects = objectsOf(store);
    const pkg = store.state.operationalObjectMap[PACKAGE_ID];
    const route = pkg?.kind === "package" ? (pkg.route ?? []) : [];
    expect(
      getClaimsForSubject(ROZ_ID, store.state.operationalClaims, T_1300)[0]?.known,
    ).toBe(false);
    expect(
      getClaimsForSubject(ROZ_ID, store.state.operationalClaims, T_1320)[0]?.known,
    ).toBe(true);
    expect(projectPackagePositionAt(route, T_1320)).toEqual([14.85, 57.65]);
    expect(projectPackagePositionAt(route, T_1345)).toEqual([15.9, 58.1]);
    const at = (time: number) =>
      evaluateExpectations(
        store.state.operationalExpectations,
        store.state.operationalObservations,
        objects,
        time,
      )[0]?.status;
    expect(at(T_1300)).toBe("PENDING");
    expect(at(T_1347)).toBe("NOT_CONFIRMED");
    expect(at(T_1348)).toBe("CONFIRMED");
    expect(planOf(store).lanes.map((lane) => lane.objectId)).toEqual(
      planOf(store).lanes.map((lane) => lane.objectId),
    );
  });

  it("selects the operational object and seeks the scenario clock from the timeline", async () => {
    const store = loadDemo();
    const time = useScenarioTime(store);
    const wrapper = mount(OperationTimeline, {
      global: { provide: { [activeScenarioKey]: { store, time } } },
    });
    expect(wrapper.get("[data-now]").text()).toBe("13:00:00Z");
    await wrapper.get(`[data-lane="${PACKAGE_ID}"] button`).trigger("click");
    expect(useSelectedItems().selectedOperationalObjectId.value).toBe(PACKAGE_ID);

    const ruler = wrapper.get("[data-timeline-ruler]");
    ruler.element.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 240,
        height: 20,
        right: 240,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    await ruler.trigger("click", { clientX: 120 });
    expect(store.state.currentTime).toBe(T_1200);
    expect(wrapper.get("[data-now]").text()).toBe("12:00:00Z");

    time.setCurrentTime(T_1300);
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-now]").text()).toBe("13:00:00Z");
    expect(
      projectPackagePositionAt(
        store.state.operationalObjectMap[PACKAGE_ID]?.kind === "package"
          ? (store.state.operationalObjectMap[PACKAGE_ID].route ?? [])
          : [],
        store.state.currentTime,
      ),
    ).toEqual([13.9, 57.2]);
    useSelectedItems().selectedOperationalObjectId.value = null;
    wrapper.unmount();
  });
});
