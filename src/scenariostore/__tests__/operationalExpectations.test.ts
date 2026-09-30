import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import "@/dayjs";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioIO } from "@/scenariostore/io";
import { evaluateExpectations } from "@/scenariostore/operationalExpectations";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const TLAM_ID = "tL07QvR8sT0uYxZ4aB7cH";
const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const EXPECTATION_ID = "xP01QvR8sT0uYxZ4aB7cL";
const OBSERVATION_ID = "oB01QvR8sT0uYxZ4aB7cM";
const T_1342 = Date.parse("2026-01-15T13:42:00Z");
const T_1343 = Date.parse("2026-01-15T13:43:00Z");
const T_1344 = Date.parse("2026-01-15T13:44:00Z");
const T_1346 = Date.parse("2026-01-15T13:46:00Z");
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

function evaluateAt(store: ReturnType<typeof loadDemo>, time: number) {
  return evaluateExpectations(
    store.state.operationalExpectations,
    store.state.operationalObservations,
    objectsOf(store),
    time,
  )[0];
}

describe("expected versus observed", () => {
  it("keeps the expectation and the observation off object state and off claims", () => {
    const store = loadDemo();
    const engagement = store.state.operationalObjectMap[TLAM_ID];
    const mission = store.state.operationalObjectMap[MISSION_ID];
    expect(engagement?.status).toBe("PLANNED");
    expect(JSON.stringify(engagement)).not.toContain("OCCURRED");
    expect(JSON.stringify(mission)).not.toContain(EXPECTATION_ID);
    expect(
      store.state.operationalClaims.some((claim) => claim.id === OBSERVATION_ID),
    ).toBe(false);
    expect(store.state.operationalExpectations[0]).toMatchObject({
      id: EXPECTATION_ID,
      subjectId: TLAM_ID,
      predicate: "effect",
      expectedValue: "OCCURRED",
      expectedAt: T_1343,
      confirmBy: T_1346,
    });
    expect(store.state.operationalExpectations[0]?.subjectId).not.toBe("TLAM-STRIKE-07");
    expect(store.state.operationalObservations[0]).toMatchObject({
      id: OBSERVATION_ID,
      subjectId: TLAM_ID,
      observedAt: T_1343,
      receivedAt: T_1348,
      source: "ISR-SENSOR-01",
      confidence: "UNKNOWN",
    });
    expect(store.state.operationalObservations[0]?.observedAt).not.toBe(
      store.state.operationalObservations[0]?.receivedAt,
    );
  });

  it("moves from pending to awaiting to not confirmed, then confirms late", () => {
    const store = loadDemo();
    const engagement = store.state.operationalObjectMap[TLAM_ID];
    const mission = store.state.operationalObjectMap[MISSION_ID];
    const before = JSON.stringify({ engagement, mission });

    expect(evaluateAt(store, T_1342)).toMatchObject({
      status: "PENDING",
      rule: "before-expected-time",
      attention: false,
      observationId: null,
    });
    expect(evaluateAt(store, T_1344)).toMatchObject({
      status: "AWAITING_CONFIRMATION",
      rule: "inside-confirmation-window",
      attention: false,
      observationId: null,
    });
    const missed = evaluateAt(store, T_1347);
    expect(missed).toMatchObject({
      status: "NOT_CONFIRMED",
      rule: "confirmation-deadline-passed",
      attention: true,
      observationId: null,
    });
    expect(missed?.status).not.toBe("FAILED");
    expect(missed?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectId: MISSION_ID,
          relationType: "synchronized-with",
        }),
      ]),
    );

    const confirmed = evaluateAt(store, T_1348);
    expect(confirmed).toMatchObject({
      status: "CONFIRMED",
      rule: "confirming-observation-known",
      attention: false,
      observationId: OBSERVATION_ID,
      observationSource: "ISR-SENSOR-01",
      observedAt: T_1343,
      receivedAt: T_1348,
    });
    expect(JSON.stringify({ engagement, mission })).toBe(before);
    expect(engagement?.status).toBe("PLANNED");
    expect(mission?.status).toBe("PLANNED");
    expect(mission && "tot" in mission ? mission.tot : null).toBe(
      Date.parse("2026-01-15T13:45:00Z"),
    );
  });

  it("round-trips event time, arrival time and source, and ignores a renamed designator", () => {
    const store = loadDemo();
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const serialized = serializeToObject();
    const saved = serialized.operationalObservations?.[0];
    expect(saved?.source).toBe("ISR-SENSOR-01");
    expect(saved?.observedAt).not.toBe(saved?.receivedAt);
    expect(saved?.confidence).toBe("UNKNOWN");
    expect(serialized.operationalExpectations?.[0]?.subjectId).toBe(TLAM_ID);

    const restored = useNewScenarioStore(serialized);
    const engagement = restored.state.operationalObjectMap[TLAM_ID];
    engagement!.designator = "TLAM RENAMED";
    const confirmed = evaluateExpectations(
      restored.state.operationalExpectations,
      restored.state.operationalObservations,
      restored.state.operationalObjectIds.map(
        (id) => restored.state.operationalObjectMap[id]!,
      ),
      T_1348,
    )[0];
    expect(confirmed?.subjectId).toBe(TLAM_ID);
    expect(confirmed?.status).toBe("CONFIRMED");
    expect(restored.state.operationalObservations[0]?.observedAt).toBe(T_1343);
    expect(restored.state.operationalObservations[0]?.receivedAt).toBe(T_1348);
  });

  it("does not treat a non-matching observation as failure", () => {
    const store = loadDemo();
    const observations = store.state.operationalObservations.map((observation) => ({
      ...observation,
      value: "OTHER",
    }));
    const result = evaluateExpectations(
      store.state.operationalExpectations,
      observations,
      objectsOf(store),
      T_1348,
    )[0];
    expect(result?.status).toBe("NOT_CONFIRMED");
    expect(result?.observationId).toBeNull();
    expect(store.state.operationalObjectMap[TLAM_ID]?.status).toBe("PLANNED");
  });
});
