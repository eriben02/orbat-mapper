import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { evaluateProposedTot } from "@/scenariostore/operationalChange";
import { buildDemoMissionOverview } from "@/modules/scenarioeditor/demoMissionView";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const PACKAGE_ID = "pK21QvR8sT0uYxZ4aB7cD";
const TARGET_ID = "tG17QvR8sT0uYxZ4aB7cF";
const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const SEAD_ID = "sE03QvR8sT0uYxZ4aB7cG";
const TLAM_ID = "tL07QvR8sT0uYxZ4aB7cH";
const TANKER_ID = "tK02QvR8sT0uYxZ4aB7cI";
const THREAT_ID = "tA01QvR8sT0uYxZ4aB7cJ";
const T_1310 = Date.parse("2026-01-15T13:10:00Z");
const T_1320 = Date.parse("2026-01-15T13:20:00Z");
const T_1415 = Date.parse("2026-01-15T14:15:00Z");

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

describe("demo mission overview", () => {
  it("reads MISSION-04 from the operational object, including its TOT", () => {
    const store = loadDemo();
    const mission = store.state.operationalObjectMap[MISSION_ID];
    const view = buildDemoMissionOverview(
      objectsOf(store),
      store.state.operationalClaims,
      store.state.currentTime,
    );
    expect(mission?.kind).toBe("mission");
    if (mission?.kind !== "mission") return;
    expect(view).toMatchObject({
      missionId: MISSION_ID,
      designator: mission.designator,
      name: mission.name,
      status: mission.status,
      tot: mission.tot,
    });
    expect(view?.target?.id).toBe(TARGET_ID);
    expect(view?.executedBy?.id).toBe(PACKAGE_ID);
    expect(view?.dependencies.map((item) => item.id)).toEqual(
      expect.arrayContaining([SEAD_ID, TLAM_ID, TANKER_ID, ROZ_ID, THREAT_ID]),
    );
  });

  it("derives the time beats from mission, claim and constraint times", () => {
    const store = loadDemo();
    const mission = store.state.operationalObjectMap[MISSION_ID];
    const view = buildDemoMissionOverview(
      objectsOf(store),
      store.state.operationalClaims,
      T_1310,
    );
    if (mission?.kind !== "mission") throw new Error("expected mission");
    const sead = mission.relations?.find(
      (item) => item.type === "depends-on-effect-window",
    );
    const tlam = mission.relations?.find((item) => item.type === "synchronized-with");
    const claim = store.state.operationalClaims[0];
    expect(view?.beats.map((beat) => beat.time)).toEqual(
      expect.arrayContaining([
        mission.tot,
        claim?.reportedAt,
        claim?.validFrom,
        claim?.validUntil,
        sead?.constraint?.validFrom,
        tlam?.constraint?.effectAt,
      ]),
    );
  });

  it("hides the report before it is known and shows it afterwards without changing state", () => {
    const store = loadDemo();
    const zone = store.state.operationalObjectMap[ROZ_ID];
    const before = zone?.status;
    const early = buildDemoMissionOverview(
      objectsOf(store),
      store.state.operationalClaims,
      T_1310,
    );
    expect(early?.reports).toEqual([]);
    const known = buildDemoMissionOverview(
      objectsOf(store),
      store.state.operationalClaims,
      T_1320,
    );
    expect(known?.reports).toHaveLength(1);
    expect(known?.reports[0]).toMatchObject({
      subjectId: ROZ_ID,
      source: "AIRSPACE-CELL",
      value: "UNAVAILABLE",
      authority: "UNKNOWN",
      confidence: "UNKNOWN",
      subjectStatus: "PLANNED",
    });
    expect(zone?.status).toBe(before);
    expect(zone?.status).toBe("PLANNED");
  });

  it("evaluates a proposed TOT with the existing function and leaves the plan", () => {
    const store = loadDemo();
    const objects = objectsOf(store);
    const mission = store.state.operationalObjectMap[MISSION_ID];
    if (mission?.kind !== "mission") throw new Error("expected mission");
    const before = mission.tot;
    const result = evaluateProposedTot(
      MISSION_ID,
      objects,
      T_1415,
      store.state.operationalClaims,
    );
    expect(mission.tot).toBe(before);
    expect(result.current).toBe(before);
    expect(result.proposed).toBe(T_1415);
    expect(result.findings.find((item) => item.objectId === SEAD_ID)?.status).toBe(
      "CONFLICT",
    );
    expect(result.findings.find((item) => item.objectId === TLAM_ID)?.status).toBe(
      "CHANGED",
    );
    expect(result.findings.find((item) => item.objectId === TANKER_ID)?.status).toBe(
      "REVIEW_REQUIRED",
    );
    expect(result.findings.find((item) => item.objectId === THREAT_ID)?.status).toBe(
      "REVIEW_REQUIRED",
    );
    expect(result.findings.find((item) => item.objectId === ROZ_ID)?.status).toBe(
      "UNKNOWN",
    );
  });
});
