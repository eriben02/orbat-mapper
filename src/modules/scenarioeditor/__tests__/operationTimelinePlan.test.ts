import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import "@/dayjs";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioTime } from "@/scenariostore/time";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import OperationTimeline from "@/modules/scenarioeditor/OperationTimeline.vue";
import { projectPackagePositionAt } from "@/modules/maplibreview/operationMapPlan";
import {
  buildOperationTimelinePlan,
  focusWindow,
  formatScenarioClock,
  hourTicks,
  nowFraction,
  scenarioTimeFromTimelineFraction,
  showOperationalTimeline,
  timelineInstants,
  utcDayStart,
  type OperationTimelinePlan,
  type TimelineItem,
  type TimelineRow,
} from "@/modules/scenarioeditor/operationTimelinePlan";
import { MS_PER_DAY } from "@/utils/time";
import { DEMO_OPERATION_ID } from "@/modules/scenarioeditor/demoMissionView";
import type { Scenario } from "@/types/scenarioModels";
import type { OperationalObject } from "@/types/operationalModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const PACKAGE_ID = "pK21QvR8sT0uYxZ4aB7cD";
const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const SEAD_ID = "sE03QvR8sT0uYxZ4aB7cG";
const TLAM_ID = "tL07QvR8sT0uYxZ4aB7cH";
const TANKER_ID = "tK02QvR8sT0uYxZ4aB7cI";
const T_0600 = Date.parse("2026-01-15T06:00:00Z");
const T_1200 = Date.parse("2026-01-15T12:00:00Z");
const T_1300 = Date.parse("2026-01-15T13:00:00Z");
const T_1320 = Date.parse("2026-01-15T13:20:00Z");
const T_1330 = Date.parse("2026-01-15T13:30:00Z");
const T_1335 = Date.parse("2026-01-15T13:35:00Z");
const T_1343 = Date.parse("2026-01-15T13:43:00Z");
const T_1345 = Date.parse("2026-01-15T13:45:00Z");
const T_1346 = Date.parse("2026-01-15T13:46:00Z");
const T_1347 = Date.parse("2026-01-15T13:47:00Z");
const T_1348 = Date.parse("2026-01-15T13:48:00Z");
const T_1355 = Date.parse("2026-01-15T13:55:00Z");
const T_1400 = Date.parse("2026-01-15T14:00:00Z");
const T_1415 = Date.parse("2026-01-15T14:15:00Z");
const T_1430 = Date.parse("2026-01-15T14:30:00Z");
const T_1500 = Date.parse("2026-01-15T15:00:00Z");
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

function planAt(
  store: ReturnType<typeof loadDemo>,
  time: number,
  proposed: { missionId: string; time: number } | null = null,
) {
  return buildOperationTimelinePlan(
    objectsOf(store),
    store.state.operationalClaims,
    store.state.operationalExpectations,
    store.state.operationalObservations,
    time,
    proposed,
  );
}

function rows(plan: OperationTimelinePlan): TimelineRow[] {
  return plan.groups.flatMap((group) => group.rows);
}

function row(plan: OperationTimelinePlan, objectId: string, groupId?: string) {
  return rows(plan).find(
    (item) => item.objectId === objectId && (groupId == null || item.groupId === groupId),
  );
}

function item(plan: OperationTimelinePlan, id: string): TimelineItem | undefined {
  return rows(plan)
    .flatMap((entry) => entry.items)
    .find((entry) => entry.id === id);
}

describe("operational day timeline", () => {
  it("frames one UTC day from 0000Z to 2400Z", () => {
    expect(formatScenarioClock(T_1320)).toBe("13:20:00Z");
    expect(nowFraction(T_1200)).toBe(0.5);
    expect(nowFraction(T_1800)).toBe(0.75);
    const labels = hourTicks()
      .filter((tick) => tick.label)
      .map((tick) => tick.label);
    expect(labels).toEqual([
      "00Z",
      "03Z",
      "06Z",
      "09Z",
      "12Z",
      "15Z",
      "18Z",
      "21Z",
      "24Z",
    ]);
    expect(hourTicks()).toHaveLength(25);
    const day = utcDayStart(T_1300);
    expect(day + MS_PER_DAY - day).toBe(MS_PER_DAY);
    expect(scenarioTimeFromTimelineFraction(day, day + MS_PER_DAY, 0.25)).toBe(T_0600);
    expect(scenarioTimeFromTimelineFraction(day, day + MS_PER_DAY, 0.5)).toBe(T_1200);
    expect(
      scenarioTimeFromTimelineFraction(day, day + MS_PER_DAY, nowFraction(T_1300)),
    ).toBe(T_1300);
  });

  it("projects mission, package, effects, airspace, support and expectations from the model", () => {
    const store = loadDemo();
    const plan = planAt(store, T_1300);
    expect(plan.groups.map((group) => group.id)).toEqual([
      "mission",
      "package",
      "effects",
      "airspace",
      "support",
      "expectations",
    ]);
    expect(item(plan, `tot:${MISSION_ID}`)).toMatchObject({
      role: "plan",
      objectId: MISSION_ID,
      start: T_1345,
      end: null,
    });
    expect(item(plan, `route:${PACKAGE_ID}`)).toMatchObject({
      role: "plan",
      objectId: PACKAGE_ID,
      start: T_1300,
      end: T_1345,
    });
    expect(item(plan, `effect-window:${SEAD_ID}`)).toMatchObject({
      role: "plan",
      objectId: SEAD_ID,
      start: T_1335,
      end: T_1355,
    });
    expect(item(plan, "effect:tL07QvR8sT0uYxZ4aB7cH:0")).toMatchObject({
      role: "plan",
      objectId: TLAM_ID,
      start: T_1343,
    });
    expect(item(plan, `support:${TANKER_ID}`)?.start).toBe(
      Date.parse("2026-01-15T12:50:00Z"),
    );
    expect(item(plan, `valid:${ROZ_ID}`)).toMatchObject({
      role: "plan",
      start: T_1200,
      end: T_1430,
    });
    const focus = focusWindow(timelineInstants(plan), utcDayStart(T_1300));
    expect(focus).toEqual({ start: T_1200, end: T_1500 });
    expect(focus.end - focus.start).toBeLessThan(MS_PER_DAY);
  });

  it("keeps the ROZ claim separate from ROZ validity and hides it until it is known", () => {
    const store = loadDemo();
    const before = planAt(store, T_1300);
    const claim = item(before, "claim:cL01QvR8sT0uYxZ4aB7cK");
    expect(claim).toMatchObject({
      role: "claim",
      objectId: ROZ_ID,
      caption: "UNAVAILABLE",
      start: T_1330,
      end: T_1400,
      visible: false,
    });
    expect(item(before, `valid:${ROZ_ID}`)?.role).toBe("plan");
    expect(item(before, `valid:${ROZ_ID}`)?.id).not.toBe(claim?.id);
    const known = planAt(store, T_1320);
    expect(item(known, "claim:cL01QvR8sT0uYxZ4aB7cK")?.visible).toBe(true);
    expect(item(known, "report:cL01QvR8sT0uYxZ4aB7cK")).toMatchObject({
      start: T_1320,
      visible: true,
      role: "claim",
    });
  });

  it("keeps expected, confirm-by, observed and received as different times", () => {
    const store = loadDemo();
    const pending = planAt(store, T_1347);
    const expectation = row(pending, TLAM_ID, "expectations");
    expect(expectation?.attention).toBe(true);
    expect(item(pending, "expected:xP01QvR8sT0uYxZ4aB7cL")?.start).toBe(T_1343);
    expect(item(pending, "confirm:xP01QvR8sT0uYxZ4aB7cL")?.start).toBe(T_1346);
    expect(item(pending, "observed:oB01QvR8sT0uYxZ4aB7cM")).toMatchObject({
      start: T_1343,
      visible: false,
      role: "observation",
    });
    expect(item(pending, "received:oB01QvR8sT0uYxZ4aB7cM")).toMatchObject({
      start: T_1348,
      visible: false,
      role: "observation",
    });
    const arrived = planAt(store, T_1348);
    expect(row(arrived, TLAM_ID, "expectations")?.attention).toBe(false);
    expect(item(arrived, "observed:oB01QvR8sT0uYxZ4aB7cM")?.visible).toBe(true);
    expect(item(arrived, "received:oB01QvR8sT0uYxZ4aB7cM")?.visible).toBe(true);
    expect(item(arrived, "observed:oB01QvR8sT0uYxZ4aB7cM")?.start).not.toBe(
      item(arrived, "received:oB01QvR8sT0uYxZ4aB7cM")?.start,
    );
  });

  it("does not mutate the model and keeps a proposed TOT hypothetical", () => {
    const store = loadDemo();
    const objects = objectsOf(store);
    const mission = objects.find(
      (object) => object.id === MISSION_ID,
    ) as OperationalObject & {
      tot?: number;
    };
    const totBefore = mission.tot;
    const snapshot = JSON.stringify(objects);
    const plan = planAt(store, T_1300, { missionId: MISSION_ID, time: T_1415 });
    expect(JSON.stringify(objectsOf(store))).toBe(snapshot);
    expect(mission.tot).toBe(totBefore);
    expect(item(plan, `tot:${MISSION_ID}`)?.start).toBe(T_1345);
    expect(item(plan, `proposed:${MISSION_ID}`)).toMatchObject({
      role: "proposed",
      start: T_1415,
      objectId: MISSION_ID,
    });
    expect(item(plan, `effect-window:${SEAD_ID}`)?.end).toBe(T_1355);
    expect(T_1415).toBeGreaterThan(T_1355);
  });

  it("uses stable operational ids and leaves other scenarios on the generic timeline", () => {
    const store = loadDemo();
    const plan = planAt(store, T_1320);
    const ids = rows(plan)
      .map((entry) => entry.objectId)
      .filter((id): id is string => id != null);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => store.state.operationalObjectMap[id] != null)).toBe(true);
    expect(row(plan, PACKAGE_ID)?.objectId).toBe(PACKAGE_ID);
    expect(showOperationalTimeline(DEMO_OPERATION_ID)).toBe(true);
    expect(showOperationalTimeline("falklands")).toBe(false);
    expect(showOperationalTimeline(undefined)).toBe(false);
    expect(store.state.id).toBe(DEMO_OPERATION_ID);
  });

  it("seeks the one scenario clock and selects the operational object", async () => {
    const store = loadDemo();
    const time = useScenarioTime(store);
    const wrapper = mount(OperationTimeline, {
      global: { provide: { [activeScenarioKey]: { store, time } } },
    });
    expect(wrapper.get("[data-now]").text()).toBe("13:00:00Z");
    await wrapper.get(`[data-object="${PACKAGE_ID}"] button`).trigger("click");
    expect(useSelectedItems().selectedOperationalObjectId.value).toBe(PACKAGE_ID);

    await wrapper.get("button").trigger("click");
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
    expect(formatScenarioClock(store.state.currentTime)).toBe("12:00:00Z");

    time.setCurrentTime(T_1300);
    await wrapper.vm.$nextTick();
    const pkg = store.state.operationalObjectMap[PACKAGE_ID];
    const route = pkg?.kind === "package" ? (pkg.route ?? []) : [];
    expect(projectPackagePositionAt(route, store.state.currentTime)).toEqual([
      13.9, 57.2,
    ]);
    time.setCurrentTime(T_1347);
    await wrapper.vm.$nextTick();
    expect(projectPackagePositionAt(route, store.state.currentTime)).toEqual([
      15.9, 58.1,
    ]);
    time.setCurrentTime(T_1300);
    expect(projectPackagePositionAt(route, T_1300)).toEqual([13.9, 57.2]);
    useSelectedItems().selectedOperationalObjectId.value = null;
    wrapper.unmount();
  });
});
