import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useNewScenarioStore } from "@/scenariostore/newScenarioStore";
import { evaluateProposedTot } from "@/scenariostore/operationalChange";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";
import type {
  OperationalAssessment,
  OperationalEffect,
  OperationalEngagement,
  OperationalMission,
  OperationalObject,
  OperationalPackage,
  OperationalSupport,
} from "@/types/operationalModels";
import type { Scenario } from "@/types/scenarioModels";

vi.mock("@/stores/settingsStore", () => ({
  useSymbolSettingsStore: () => ({ symbologyStandard: "2525d" }),
}));

const MISSION_ID = "mS04QvR8sT0uYxZ4aB7cE";
const SEAD_ID = "sE03QvR8sT0uYxZ4aB7cG";
const TLAM_ID = "tL07QvR8sT0uYxZ4aB7cH";
const TANKER_ID = "tK02QvR8sT0uYxZ4aB7cI";
const THREAT_ID = "tA01QvR8sT0uYxZ4aB7cJ";
const ROZ_ID = "7N3kP0wQvR2sT8uYxZ4aB";
const T_1345 = Date.parse("2026-01-15T13:45:00Z");
const T_1415 = Date.parse("2026-01-15T14:15:00Z");
const T_1500 = Date.parse("2026-01-15T15:00:00Z");
const T_1335 = Date.parse("2026-01-15T13:35:00Z");
const T_1355 = Date.parse("2026-01-15T13:55:00Z");
const T_1343 = Date.parse("2026-01-15T13:43:00Z");

function demoObjects() {
  const scenario = JSON.parse(
    readFileSync("public/scenarios/roz-alfa.json", "utf8"),
  ) as Scenario;
  const store = useNewScenarioStore(scenario);
  return store.state.operationalObjectIds.map(
    (id) => store.state.operationalObjectMap[id]!,
  );
}

function mission(relations: OperationalMission["relations"]): OperationalMission {
  return {
    id: "mission-internal",
    kind: "mission",
    designator: "MISSION-X",
    name: "Generic mission",
    tot: T_1345,
    validFrom: 0,
    validUntil: 1,
    status: "PLANNED",
    relations,
  };
}

describe("evaluateProposedTot", () => {
  it("does not mutate the current plan", () => {
    const objects = demoObjects();
    const before = JSON.stringify(objects);
    const missionObject = objects.find((item) => item.id === MISSION_ID);
    if (missionObject?.kind !== "mission") throw new Error("expected a mission");
    const result = evaluateProposedTot(MISSION_ID, objects, T_1415);
    expect(missionObject.tot).toBe(T_1345);
    expect(result.current).toBe(T_1345);
    expect(result.proposed).toBe(T_1415);
    expect(result.field).toBe("tot");
    expect(JSON.stringify(objects)).toBe(before);
  });

  it("checks an effect window without reading the object designator", () => {
    const effect: OperationalEffect = {
      id: "effect-internal",
      kind: "effect",
      designator: "EFFECT-X",
      name: "Generic effect",
      validFrom: 0,
      validUntil: 1,
      status: "PLANNED",
      relations: [],
    };
    const subject = mission([
      {
        type: "depends-on-effect-window",
        target: { kind: "effect", id: effect.id },
        constraint: { validFrom: T_1335, validUntil: T_1355 },
      },
    ]);
    effect.designator = "RENAMED";
    const inside = evaluateProposedTot(subject.id, [subject, effect], T_1345);
    const outside = evaluateProposedTot(subject.id, [subject, effect], T_1415);
    expect(inside.findings[0]).toMatchObject({
      status: "SATISFIED",
      objectId: effect.id,
      rule: "effect-window-contains-instant",
      calculated: true,
      relationSourceId: subject.id,
    });
    expect(outside.findings[0]).toMatchObject({
      status: "CONFLICT",
      objectId: effect.id,
      calculated: true,
    });
    expect(outside.findings[0]?.facts).toEqual(
      expect.arrayContaining([
        { key: "windowFrom", value: T_1335 },
        { key: "windowUntil", value: T_1355 },
        { key: "inside", value: false },
      ]),
    );
    expect(subject.tot).toBe(T_1345);
  });

  it("flags synchronization, recalculation, assumptions, and missing data", () => {
    const engagement: OperationalEngagement = {
      id: "engagement-internal",
      kind: "engagement",
      designator: "ENGAGEMENT-X",
      name: "Generic engagement",
      validFrom: 0,
      validUntil: 1,
      status: "PLANNED",
      relations: [],
    };
    const support: OperationalSupport = {
      id: "support-internal",
      kind: "support",
      designator: "SUPPORT-X",
      name: "Generic support",
      validFrom: 0,
      validUntil: 1,
      status: "PLANNED",
      relations: [],
    };
    const assessment: OperationalAssessment = {
      id: "assessment-internal",
      kind: "assessment",
      designator: "ASSESSMENT-X",
      name: "Generic assessment",
      validFrom: 0,
      validUntil: 1,
      status: "PLANNED",
      relations: [],
    };
    const packageObject: OperationalPackage = {
      id: "package-internal",
      kind: "package",
      designator: "PACKAGE-X",
      name: "Generic package",
      validFrom: 0,
      validUntil: 1,
      status: "PLANNED",
      relations: [
        {
          type: "requires-recalculation",
          target: { kind: "support", id: support.id },
          constraint: { unresolvedFactors: ["fuel", "route", "aircraft-performance"] },
        },
      ],
    };
    const subject = mission([
      {
        type: "executed-by",
        target: { kind: "package", id: packageObject.id },
      },
      {
        type: "synchronized-with",
        target: { kind: "engagement", id: engagement.id },
        constraint: { effectAt: T_1343 },
      },
      {
        type: "timing-assumption",
        target: { kind: "assessment", id: assessment.id },
        constraint: { basis: "subject-time" },
      },
      {
        type: "depends-on-effect-window",
        target: { kind: "effect", id: "missing-effect" },
      },
    ]);
    const objects: OperationalObject[] = [
      subject,
      packageObject,
      engagement,
      support,
      assessment,
    ];
    expect(() => evaluateProposedTot(subject.id, objects, T_1415)).not.toThrow();
    const result = evaluateProposedTot(subject.id, objects, T_1415);
    expect(result.findings.find((item) => item.objectId === engagement.id)).toMatchObject(
      {
        status: "CHANGED",
        rule: "synchronization-instant-not-moved",
        calculated: true,
        review: true,
      },
    );
    expect(result.findings.find((item) => item.objectId === support.id)).toMatchObject({
      status: "REVIEW_REQUIRED",
      rule: "insufficient-model-for-recomputation",
      calculated: false,
    });
    expect(
      result.findings
        .find((item) => item.objectId === support.id)
        ?.facts.some((fact) => fact.key === "threatScore"),
    ).toBe(false);
    expect(result.findings.find((item) => item.objectId === assessment.id)).toMatchObject(
      {
        status: "REVIEW_REQUIRED",
        rule: "timing-assumption-not-recomputed",
        calculated: false,
      },
    );
    expect(
      result.findings.find((item) => item.objectId === "missing-effect"),
    ).toMatchObject({
      status: "UNKNOWN",
      rule: "dependency-target-missing",
      calculated: false,
    });
    expect(result.findings.some((item) => item.relationType === "executed-by")).toBe(
      false,
    );
  });

  it("reports the demo proposal from stored ids and does not treat ROZ validity as usability", () => {
    const objects = demoObjects();
    const result = evaluateProposedTot(MISSION_ID, objects, T_1415);
    const byId = (id: string) => result.findings.find((item) => item.objectId === id);
    expect(byId(SEAD_ID)).toMatchObject({
      status: "CONFLICT",
      rule: "effect-window-contains-instant",
      relationSourceId: MISSION_ID,
      objectKind: "effect",
    });
    expect(byId(TLAM_ID)?.facts).toEqual(
      expect.arrayContaining([{ key: "effectAt", value: T_1343 }]),
    );
    expect(byId(TANKER_ID)).toMatchObject({
      status: "REVIEW_REQUIRED",
      relationSourceId: "pK21QvR8sT0uYxZ4aB7cD",
    });
    expect(byId(TANKER_ID)?.facts).toEqual(
      expect.arrayContaining([{ key: "validityCompared", value: false }]),
    );
    expect(byId(THREAT_ID)?.status).toBe("REVIEW_REQUIRED");
    expect(byId(ROZ_ID)).toMatchObject({
      status: "UNKNOWN",
      rule: "requires-does-not-state-usability",
      calculated: false,
    });
    expect(byId(ROZ_ID)?.facts).toEqual(
      expect.arrayContaining([{ key: "proposedInsideValidity", value: true }]),
    );
    const later = evaluateProposedTot(MISSION_ID, objects, T_1500);
    expect(later.findings.find((item) => item.objectId === ROZ_ID)?.status).toBe(
      "UNKNOWN",
    );
    expect(later.findings.find((item) => item.objectId === ROZ_ID)?.facts).toEqual(
      expect.arrayContaining([{ key: "proposedInsideValidity", value: false }]),
    );
    const missionObject = objects.find((item) => item.id === MISSION_ID);
    expect(missionObject && "tot" in missionObject ? missionObject.tot : null).toBe(
      T_1345,
    );
    expect(
      traceOperationalRelations(ROZ_ID, objects).nodes.map((node) => node.id),
    ).toEqual(expect.arrayContaining([ROZ_ID, MISSION_ID]));
  });
});
