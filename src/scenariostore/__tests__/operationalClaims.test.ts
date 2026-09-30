import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import "@/dayjs";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { useScenarioIO } from "@/scenariostore/io";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";
import { evaluateProposedTot } from "@/scenariostore/operationalChange";
import type { OperationalClaim } from "@/types/operationalModels";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const CLAIM_ID = "cL01QvR8sT0uYxZ4aB7cK";
const T_1310 = Date.parse("2026-01-15T13:10:00Z");
const T_1320 = Date.parse("2026-01-15T13:20:00Z");
const T_1325 = Date.parse("2026-01-15T13:25:00Z");
const T_1330 = Date.parse("2026-01-15T13:30:00Z");
const T_1345 = Date.parse("2026-01-15T13:45:00Z");
const T_1400 = Date.parse("2026-01-15T14:00:00Z");
const T_1410 = Date.parse("2026-01-15T14:10:00Z");
const T_1415 = Date.parse("2026-01-15T14:15:00Z");

function loadDemo() {
  const scenario = JSON.parse(
    readFileSync("public/scenarios/roz-alfa.json", "utf8"),
  ) as Scenario;
  return useNewScenarioStore(scenario);
}

function claim(overrides: Partial<OperationalClaim> = {}): OperationalClaim {
  return {
    id: "claim-a",
    subjectId: ROZ_ID,
    predicate: "availability",
    value: "UNAVAILABLE",
    reportedAt: T_1320,
    validFrom: T_1330,
    validUntil: T_1400,
    source: "AIRSPACE-CELL",
    reason: "ACTIVITY-X",
    authority: "UNKNOWN",
    confidence: "UNKNOWN",
    ...overrides,
  };
}

describe("operational claims", () => {
  it("keeps CLAIM-01 off ROZ ALFA state and distinct in time", () => {
    const store = loadDemo();
    const zone = store.state.operationalObjectMap[ROZ_ID];
    if (zone?.kind !== "airspace") throw new Error("expected ROZ ALFA");
    expect(zone.status).toBe("PLANNED");
    expect(JSON.stringify(zone)).not.toContain("UNAVAILABLE");
    expect(
      zone.state?.some((entry) => JSON.stringify(entry).includes("UNAVAILABLE")),
    ).toBe(false);

    const stored = store.state.operationalClaims[0];
    expect(stored).toMatchObject({
      id: CLAIM_ID,
      subjectId: ROZ_ID,
      predicate: "availability",
      value: "UNAVAILABLE",
      source: "AIRSPACE-CELL",
      reason: "ACTIVITY-X",
      authority: "UNKNOWN",
      confidence: "UNKNOWN",
    });
    expect(stored?.subjectId).not.toBe("ROZ ALFA");
    expect(stored?.reportedAt).toBe(T_1320);
    expect(stored?.validFrom).toBe(T_1330);
    expect(stored?.validUntil).toBe(T_1400);
    expect(stored?.reportedAt).not.toBe(stored?.validFrom);
  });

  it("classifies the claim against the scenario clock", () => {
    const claims = loadDemo().state.operationalClaims;
    const at = (time: number) => getClaimsForSubject(ROZ_ID, claims, time)[0];
    expect(at(T_1310)).toMatchObject({
      known: false,
      currentlyValid: false,
      historical: false,
      futureValid: false,
    });
    expect(at(T_1325)).toMatchObject({
      known: true,
      currentlyValid: false,
      futureValid: true,
      historical: false,
    });
    expect(at(T_1345)).toMatchObject({
      known: true,
      currentlyValid: true,
      futureValid: false,
      historical: false,
    });
    expect(at(T_1410)).toMatchObject({
      known: true,
      currentlyValid: false,
      futureValid: false,
      historical: true,
    });
    expect(getClaimsForSubject(ROZ_ID, claims, T_1410)).toHaveLength(1);
  });

  it("round-trips provenance without adopting the claim as state", () => {
    const store = loadDemo();
    const { serializeToObject } = useScenarioIO(shallowRef(store));
    const serialized = serializeToObject();
    const saved = serialized.operationalClaims?.[0];
    expect(saved).toMatchObject({
      id: CLAIM_ID,
      subjectId: ROZ_ID,
      source: "AIRSPACE-CELL",
      reason: "ACTIVITY-X",
      authority: "UNKNOWN",
      confidence: "UNKNOWN",
      value: "UNAVAILABLE",
    });
    expect(saved?.reportedAt).not.toBe(saved?.validFrom);

    const restored = useNewScenarioStore(serialized);
    const zone = restored.state.operationalObjectMap[ROZ_ID];
    expect(zone?.status).toBe("PLANNED");
    expect(restored.state.operationalClaims[0]?.reason).toBe("ACTIVITY-X");
    expect(restored.state.operationalClaims[0]?.authority).toBe("UNKNOWN");
    zone!.designator = "ROZ RENAMED";
    const view = getClaimsForSubject(ROZ_ID, restored.state.operationalClaims, T_1345)[0];
    expect(view?.subjectId).toBe(ROZ_ID);
    expect(view?.currentlyValid).toBe(true);
  });

  it("keeps contradictory claims without choosing one", () => {
    const store = loadDemo();
    const zone = store.state.operationalObjectMap[ROZ_ID];
    const before = JSON.stringify(zone);
    const both = [
      ...store.state.operationalClaims,
      claim({
        id: "claim-b",
        value: "AVAILABLE",
        source: "OTHER-SOURCE",
        reason: "OTHER-BASIS",
      }),
    ];
    const views = getClaimsForSubject(ROZ_ID, both, T_1345);
    expect(views).toHaveLength(2);
    expect(views.map((item) => item.value).sort()).toEqual(["AVAILABLE", "UNAVAILABLE"]);
    expect(views.every((item) => item.currentlyValid)).toBe(true);
    expect(JSON.stringify(zone)).toBe(before);
    expect(zone?.status).toBe("PLANNED");
  });

  it("tells a TOT evaluation that a claim exists and does not call it a conflict", () => {
    const store = loadDemo();
    const objects = store.state.operationalObjectIds.map(
      (id) => store.state.operationalObjectMap[id]!,
    );
    const covered = evaluateProposedTot(
      MISSION_ID,
      objects,
      T_1345,
      store.state.operationalClaims,
    );
    const claimFinding = covered.findings.find(
      (item) => item.rule === "availability-claim-present",
    );
    expect(claimFinding).toMatchObject({
      status: "CLAIM_PRESENT",
      objectId: ROZ_ID,
      calculated: false,
      review: true,
    });
    expect(claimFinding?.facts).toEqual(
      expect.arrayContaining([
        { key: "value", value: "UNAVAILABLE" },
        { key: "authoritative", value: false },
        { key: "source", value: "AIRSPACE-CELL" },
      ]),
    );
    expect(
      covered.findings.some(
        (item) => item.status === "CONFLICT" && item.objectId === ROZ_ID,
      ),
    ).toBe(false);
    const outside = evaluateProposedTot(
      MISSION_ID,
      objects,
      T_1415,
      store.state.operationalClaims,
    );
    expect(
      outside.findings.some((item) => item.rule === "availability-claim-present"),
    ).toBe(false);
    expect(outside.findings.find((item) => item.objectId === ROZ_ID)?.status).toBe(
      "UNKNOWN",
    );
    expect(store.state.operationalObjectMap[ROZ_ID]?.status).toBe("PLANNED");
  });
});
