import type {
  OperationalClaim,
  OperationalExpectation,
  OperationalObject,
  OperationalObservation,
} from "@/types/operationalModels";
import { MS_PER_DAY } from "@/utils/time";

/**
 * A 24-hour projection of operational objects.
 * It does not store a clock. The caller supplies scenario time separately.
 */

export const TIMELINE_LANE_KINDS = [
  "package",
  "airspace",
  "target",
  "engagement",
  "assessment",
] as const;

export type TimelineIntervalTone = "validity" | "claim" | "confirm";

export interface TimelineInterval {
  id: string;
  start: number;
  end: number;
  tone: TimelineIntervalTone;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
}

export interface TimelineLane {
  objectId: string;
  designator: string;
  kind: string;
  intervals: TimelineInterval[];
  markers: TimelineMarker[];
}

export interface OperationTimelinePlan {
  lanes: TimelineLane[];
}

export interface DaySlice {
  left: number;
  width: number;
}

export function formatScenarioClock(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "--:--:--Z";
  const date = new Date(timestamp);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}Z`;
}

/** UTC midnight of the day that contains `timestamp`. */
export function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** 0000Z is 0. 1200Z is 0.5. 2400Z of this day is the next midnight, fraction 0 there. */
export function nowFraction(timestamp: number): number {
  if (!Number.isFinite(timestamp)) return 0;
  const fraction = (timestamp - utcDayStart(timestamp)) / MS_PER_DAY;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return fraction;
}

export function scenarioTimeFromTimelineFraction(
  dayStart: number,
  fraction: number,
): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return dayStart + Math.round(clamped * MS_PER_DAY);
}

export function hourTicks(
  labelStep = 2,
): { hour: number; fraction: number; label: string }[] {
  const ticks = [];
  for (let hour = 0; hour <= 24; hour += 1) {
    const labeled = hour % labelStep === 0;
    ticks.push({
      hour,
      fraction: hour / 24,
      label: labeled ? String(hour).padStart(2, "0") : "",
    });
  }
  return ticks;
}

/** Clip an interval to one UTC day. The day is always 24 hours, whatever the data contains. */
export function intervalOnDay(
  start: number,
  end: number,
  dayStart: number,
): DaySlice | null {
  const from = Math.max(start, dayStart);
  const to = Math.min(end, dayStart + MS_PER_DAY);
  if (!(to > from)) return null;
  return {
    left: (from - dayStart) / MS_PER_DAY,
    width: (to - from) / MS_PER_DAY,
  };
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validityInterval(object: OperationalObject): TimelineInterval | null {
  const start = asEpoch(object.validFrom);
  const end = asEpoch(object.validUntil);
  if (start == null || end == null || end <= start) return null;
  return { id: `valid:${object.id}`, start, end, tone: "validity" };
}

/**
 * Lanes are derived from operational objects, claims, expectations and observations.
 * Scenario time is not an input. The timeline does not decide what "now" is.
 */
export function buildOperationTimelinePlan(
  objects: readonly OperationalObject[],
  claims: readonly OperationalClaim[] = [],
  expectations: readonly OperationalExpectation[] = [],
  observations: readonly OperationalObservation[] = [],
): OperationTimelinePlan {
  const lanes: TimelineLane[] = [];

  for (const kind of TIMELINE_LANE_KINDS) {
    const ofKind = objects
      .filter((object) => object.kind === kind)
      .sort((a, b) => a.designator.localeCompare(b.designator));
    for (const object of ofKind) {
      const intervals: TimelineInterval[] = [];
      const markers: TimelineMarker[] = [];
      const validity = validityInterval(object);
      if (validity) intervals.push(validity);

      if (object.kind === "package" && object.route) {
        for (const point of object.route) {
          const time = asEpoch(point.t);
          if (time == null) continue;
          markers.push({ id: `route:${object.id}:${time}`, time, label: "route" });
        }
        for (const mission of objects) {
          if (mission.kind !== "mission" || mission.tot == null) continue;
          const executes = mission.relations.some(
            (relation) =>
              relation.type === "executed-by" && relation.target.id === object.id,
          );
          const time = asEpoch(mission.tot);
          if (!executes || time == null) continue;
          markers.push({ id: `tot:${mission.id}:${object.id}`, time, label: "TOT" });
        }
      }

      if (object.kind === "airspace") {
        for (const claim of claims) {
          if (claim.subjectId !== object.id) continue;
          const reported = asEpoch(claim.reportedAt);
          if (reported != null) {
            markers.push({ id: `report:${claim.id}`, time: reported, label: "report" });
          }
          const from = asEpoch(claim.validFrom);
          const until = asEpoch(claim.validUntil);
          if (from != null && until != null && until > from) {
            intervals.push({
              id: `claim:${claim.id}`,
              start: from,
              end: until,
              tone: "claim",
            });
          }
        }
      }

      if (object.kind === "engagement") {
        for (const source of objects) {
          for (const relation of source.relations) {
            if (relation.target.id !== object.id) continue;
            const effectAt = asEpoch(relation.constraint?.effectAt);
            if (effectAt == null) continue;
            markers.push({
              id: `effect:${source.id}:${object.id}`,
              time: effectAt,
              label: "effect",
            });
          }
        }
        for (const expectation of expectations) {
          if (expectation.subjectId !== object.id) continue;
          const expectedAt = asEpoch(expectation.expectedAt);
          const confirmBy = asEpoch(expectation.confirmBy);
          if (expectedAt != null) {
            markers.push({
              id: `expected:${expectation.id}`,
              time: expectedAt,
              label: "expected",
            });
          }
          if (expectedAt != null && confirmBy != null && confirmBy > expectedAt) {
            intervals.push({
              id: `confirm:${expectation.id}`,
              start: expectedAt,
              end: confirmBy,
              tone: "confirm",
            });
          }
        }
        for (const observation of observations) {
          if (observation.subjectId !== object.id) continue;
          const observedAt = asEpoch(observation.observedAt);
          const receivedAt = asEpoch(observation.receivedAt);
          if (observedAt != null) {
            markers.push({
              id: `observed:${observation.id}`,
              time: observedAt,
              label: "observed",
            });
          }
          if (receivedAt != null && receivedAt !== observedAt) {
            markers.push({
              id: `received:${observation.id}`,
              time: receivedAt,
              label: "received",
            });
          }
        }
      }

      markers.sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));
      lanes.push({
        objectId: object.id,
        designator: object.designator,
        kind: object.kind,
        intervals,
        markers,
      });
    }
  }

  return { lanes };
}
