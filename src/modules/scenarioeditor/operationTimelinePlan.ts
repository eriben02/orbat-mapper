import type {
  OperationalClaim,
  OperationalExpectation,
  OperationalObject,
  OperationalObservation,
} from "@/types/operationalModels";
import { getClaimsForSubject } from "@/scenariostore/operationalClaims";
import { evaluateExpectations } from "@/scenariostore/operationalExpectations";
import { isDemoOperation } from "@/modules/scenarioeditor/demoMissionView";
import { MS_PER_DAY, MS_PER_HOUR } from "@/utils/time";
import type { ProposedTotView } from "@/modules/scenarioeditor/operationTimelineProposal";

/**
 * Swimlanes for one UTC day.
 * Items are read from operational objects, relations, claims, expectations
 * and observations. Nothing here is written back.
 */

export type TimelineRole =
  "plan" | "claim" | "expectation" | "observation" | "proposed" | "attention";

export interface TimelineItem {
  id: string;
  role: TimelineRole;
  objectId: string | null;
  /** Short text drawn beside a point, or on a claim bar. */
  caption: string;
  start: number;
  /** Null marks a point. A number marks the end of an interval. */
  end: number | null;
  /** False when existing epistemic rules say this is not yet known. */
  visible: boolean;
  /** Where a point caption sits so nearby times stay readable. */
  captionSide?: "above" | "below";
}

export interface TimelineRow {
  id: string;
  objectId: string | null;
  groupId: string;
  groupLabel: string;
  label: string;
  /** True when the existing expectation evaluation says the deadline passed. */
  attention: boolean;
  items: TimelineItem[];
}

export interface TimelineGroup {
  id: string;
  label: string;
  rows: TimelineRow[];
}

export interface OperationTimelinePlan {
  groups: TimelineGroup[];
}

export interface TimeWindow {
  start: number;
  end: number;
}

export interface DaySlice {
  left: number;
  width: number;
}

const GROUP_DEFS = [
  { id: "mission", label: "Mission", kinds: ["mission"] },
  { id: "package", label: "Package", kinds: ["package"] },
  { id: "effects", label: "Effects", kinds: ["effect", "engagement"] },
  { id: "airspace", label: "Airspace", kinds: ["airspace"] },
  { id: "support", label: "Support", kinds: ["support"] },
] as const;

const FOCUS_SPAN = 3 * MS_PER_HOUR;

/** The dedicated day view is only for the air-operations demonstrator. */
export function showOperationalTimeline(scenarioId: string | undefined): boolean {
  return isDemoOperation(scenarioId);
}

export function formatScenarioClock(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "--:--:--Z";
  const date = new Date(timestamp);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}Z`;
}

export function formatZuluHour(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  return `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}Z`;
}

/** UTC midnight of the day that contains `timestamp`. */
export function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** 0000Z is 0. 1200Z is 0.5. The next midnight is the following day's 0. */
export function nowFraction(timestamp: number): number {
  if (!Number.isFinite(timestamp)) return 0;
  const fraction = (timestamp - utcDayStart(timestamp)) / MS_PER_DAY;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return fraction;
}

export function scenarioTimeFromTimelineFraction(
  scaleStart: number,
  scaleEnd: number,
  fraction: number,
): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return scaleStart + Math.round(clamped * (scaleEnd - scaleStart));
}

export function hourTicks(step = 3): { hour: number; fraction: number; label: string }[] {
  const ticks = [];
  for (let hour = 0; hour <= 24; hour += 1) {
    ticks.push({
      hour,
      fraction: hour / 24,
      label: hour % step === 0 ? `${String(hour).padStart(2, "0")}Z` : "",
    });
  }
  return ticks;
}

export function fractionOnScale(
  time: number,
  scaleStart: number,
  scaleEnd: number,
): number | null {
  if (!(scaleEnd > scaleStart)) return null;
  const fraction = (time - scaleStart) / (scaleEnd - scaleStart);
  if (fraction < 0 || fraction > 1) return null;
  return fraction;
}

export function intervalOnScale(
  start: number,
  end: number,
  scaleStart: number,
  scaleEnd: number,
): DaySlice | null {
  if (!(scaleEnd > scaleStart)) return null;
  const from = Math.max(start, scaleStart);
  const to = Math.min(end, scaleEnd);
  if (!(to > from)) return null;
  return {
    left: (from - scaleStart) / (scaleEnd - scaleStart),
    width: (to - from) / (scaleEnd - scaleStart),
  };
}

/** Clip an interval to one UTC day. The day is always 24 hours. */
export function intervalOnDay(
  start: number,
  end: number,
  dayStart: number,
): DaySlice | null {
  return intervalOnScale(start, end, dayStart, dayStart + MS_PER_DAY);
}

export function timelineInstants(plan: OperationTimelinePlan): number[] {
  const times: number[] = [];
  for (const group of plan.groups) {
    for (const row of group.rows) {
      for (const item of row.items) {
        times.push(item.start);
        if (item.end != null) times.push(item.end);
      }
    }
  }
  return times;
}

/**
 * Snap the represented instants out to whole hours.
 * A short cluster is widened to three hours so the window stays readable.
 * The result is always inside the same UTC day.
 */
export function focusWindow(times: number[], dayStart: number): TimeWindow {
  const dayEnd = dayStart + MS_PER_DAY;
  const inside = times.filter((time) => time >= dayStart && time <= dayEnd);
  if (!inside.length) return { start: dayStart, end: dayEnd };
  const min = Math.min(...inside);
  const max = Math.max(...inside);
  let start = dayStart + Math.floor((min - dayStart) / MS_PER_HOUR) * MS_PER_HOUR;
  const maxHours = Math.ceil((max - dayStart) / MS_PER_HOUR);
  let end = dayStart + maxHours * MS_PER_HOUR;
  if (end <= start) end = Math.min(dayEnd, start + FOCUS_SPAN);
  if (end - start < FOCUS_SPAN) end = Math.min(dayEnd, start + FOCUS_SPAN);
  if (end <= start) start = Math.max(dayStart, end - FOCUS_SPAN);
  return { start, end };
}

function asEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function point(
  id: string,
  role: TimelineRole,
  objectId: string | null,
  caption: string,
  time: number,
  visible: boolean,
  captionSide?: "above" | "below",
): TimelineItem {
  return {
    id,
    role,
    objectId,
    caption,
    start: time,
    end: null,
    visible,
    ...(captionSide ? { captionSide } : {}),
  };
}

function clockWord(time: number, word: string) {
  const date = new Date(time);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}${mm} ${word}`;
}

function span(
  id: string,
  role: TimelineRole,
  objectId: string | null,
  caption: string,
  start: number,
  end: number,
  visible: boolean,
): TimelineItem | null {
  if (!(end > start)) return null;
  return { id, role, objectId, caption, start, end, visible };
}

function byDesignator(a: OperationalObject, b: OperationalObject) {
  return a.designator.localeCompare(b.designator);
}

function objectsOfKind(objects: readonly OperationalObject[], kinds: readonly string[]) {
  return kinds.flatMap((kind) =>
    objects.filter((object) => object.kind === kind).sort(byDesignator),
  );
}

function constraintWindow(
  objectId: string,
  objects: readonly OperationalObject[],
): { start: number; end: number } | null {
  for (const source of objects) {
    for (const relation of source.relations) {
      if (relation.target.id !== objectId) continue;
      const start = asEpoch(relation.constraint?.validFrom);
      const end = asEpoch(relation.constraint?.validUntil);
      if (start != null && end != null && end > start) return { start, end };
    }
  }
  return null;
}

function effectTimes(objectId: string, objects: readonly OperationalObject[]): number[] {
  const times: number[] = [];
  for (const source of objects) {
    for (const relation of source.relations) {
      if (relation.target.id !== objectId) continue;
      const effectAt = asEpoch(relation.constraint?.effectAt);
      if (effectAt != null) times.push(effectAt);
    }
  }
  return times;
}

function missionItems(
  mission: OperationalObject,
  proposed: ProposedTotView | null,
): TimelineItem[] {
  if (mission.kind !== "mission") return [];
  const items: TimelineItem[] = [];
  const tot = asEpoch(mission.tot);
  if (tot != null) {
    items.push(point(`tot:${mission.id}`, "plan", mission.id, "TOT", tot, true));
  }
  if (proposed && proposed.missionId === mission.id && proposed.time !== tot) {
    items.push(
      point(
        `proposed:${mission.id}`,
        "proposed",
        mission.id,
        "proposed",
        proposed.time,
        true,
      ),
    );
  }
  return items;
}

function packageItems(pkg: OperationalObject): TimelineItem[] {
  if (pkg.kind !== "package" || !pkg.route?.length) return [];
  const times = pkg.route
    .map((entry) => asEpoch(entry.t))
    .filter((time): time is number => time != null)
    .sort((a, b) => a - b);
  if (!times.length) return [];
  const start = times[0]!;
  const end = times[times.length - 1]!;
  const movement = span(`route:${pkg.id}`, "plan", pkg.id, "", start, end, true);
  return movement
    ? [movement]
    : [point(`route:${pkg.id}`, "plan", pkg.id, "", start, true)];
}

function effectItems(
  object: OperationalObject,
  objects: readonly OperationalObject[],
): TimelineItem[] {
  if (object.kind === "effect") {
    const window = constraintWindow(object.id, objects);
    if (!window) return [];
    const item = span(
      `effect-window:${object.id}`,
      "plan",
      object.id,
      "",
      window.start,
      window.end,
      true,
    );
    return item ? [item] : [];
  }
  if (object.kind === "engagement") {
    return effectTimes(object.id, objects).map((time, index) =>
      point(`effect:${object.id}:${index}`, "plan", object.id, "effect", time, true),
    );
  }
  return [];
}

function airspaceItems(
  object: OperationalObject,
  claims: readonly OperationalClaim[],
  currentTime: number,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const from = asEpoch(object.validFrom);
  const until = asEpoch(object.validUntil);
  if (from != null && until != null) {
    const validity = span(`valid:${object.id}`, "plan", object.id, "", from, until, true);
    if (validity) items.push(validity);
  }
  for (const claim of getClaimsForSubject(object.id, claims, currentTime)) {
    const known = claim.known;
    if (claim.validFrom != null && claim.validUntil != null) {
      const bar = span(
        `claim:${claim.id}`,
        "claim",
        object.id,
        claim.value,
        claim.validFrom,
        claim.validUntil,
        known,
      );
      if (bar) items.push(bar);
    }
    items.push(
      point(
        `report:${claim.id}`,
        "claim",
        object.id,
        "reported",
        claim.reportedAt,
        known,
      ),
    );
  }
  return items;
}

function supportItems(object: OperationalObject): TimelineItem[] {
  const from = asEpoch(object.validFrom);
  const until = asEpoch(object.validUntil);
  if (from == null || until == null) return [];
  const item = span(`support:${object.id}`, "plan", object.id, "", from, until, true);
  return item ? [item] : [];
}

function expectationRows(
  objects: readonly OperationalObject[],
  expectations: readonly OperationalExpectation[],
  observations: readonly OperationalObservation[],
  currentTime: number,
): TimelineRow[] {
  const evaluations = evaluateExpectations(
    expectations,
    observations,
    objects,
    currentTime,
  );
  return evaluations.flatMap((evaluation) => {
    const items: TimelineItem[] = [];
    if (evaluation.expectedAt != null) {
      items.push(
        point(
          `expected:${evaluation.expectationId}`,
          "expectation",
          evaluation.subjectId,
          clockWord(evaluation.expectedAt, "expected"),
          evaluation.expectedAt,
          true,
          "above",
        ),
      );
    }
    if (evaluation.confirmBy != null) {
      items.push(
        point(
          `confirm:${evaluation.expectationId}`,
          "expectation",
          evaluation.subjectId,
          clockWord(evaluation.confirmBy, "confirm"),
          evaluation.confirmBy,
          true,
          "below",
        ),
      );
    }
    const observed: TimelineItem[] = [];
    for (const observation of observations) {
      if (observation.subjectId !== evaluation.subjectId) continue;
      if (observation.predicate !== evaluation.predicate) continue;
      const observedAt = asEpoch(observation.observedAt);
      const receivedAt = asEpoch(observation.receivedAt);
      const visible = receivedAt != null && receivedAt <= currentTime;
      if (observedAt != null) {
        observed.push(
          point(
            `observed:${observation.id}`,
            "observation",
            evaluation.subjectId,
            clockWord(observedAt, "observed"),
            observedAt,
            visible,
            "above",
          ),
        );
      }
      if (receivedAt != null && receivedAt !== observedAt) {
        observed.push(
          point(
            `received:${observation.id}`,
            "observation",
            evaluation.subjectId,
            clockWord(receivedAt, "received"),
            receivedAt,
            visible,
            "below",
          ),
        );
      }
    }
    const built: TimelineRow[] = [];
    if (items.length) {
      built.push({
        id: `expectation:${evaluation.expectationId}`,
        objectId: evaluation.subjectId,
        groupId: "expectations",
        groupLabel: "Expect",
        label: "expected",
        attention: evaluation.attention,
        items,
      });
    }
    if (observed.length) {
      built.push({
        id: `observation:${evaluation.expectationId}`,
        objectId: evaluation.subjectId,
        groupId: "expectations",
        groupLabel: "Expect",
        label: "observed",
        attention: false,
        items: observed,
      });
    }
    return built;
  });
}

function rowFor(
  groupId: string,
  groupLabel: string,
  object: OperationalObject,
  items: TimelineItem[],
): TimelineRow | null {
  if (!items.length) return null;
  return {
    id: `${groupId}:${object.id}`,
    objectId: object.id,
    groupId,
    groupLabel,
    label: object.designator,
    attention: false,
    items,
  };
}

/**
 * One projection of the operational model for a single Zulu day.
 * `currentTime` only decides which claims and observations are already known.
 * It does not move plan times, and it does not write state.
 */
export function buildOperationTimelinePlan(
  objects: readonly OperationalObject[],
  claims: readonly OperationalClaim[] = [],
  expectations: readonly OperationalExpectation[] = [],
  observations: readonly OperationalObservation[] = [],
  currentTime = 0,
  proposed: ProposedTotView | null = null,
): OperationTimelinePlan {
  const groups: TimelineGroup[] = [];
  for (const group of GROUP_DEFS) {
    const rows: TimelineRow[] = [];
    for (const object of objectsOfKind(objects, group.kinds)) {
      let items: TimelineItem[] = [];
      if (group.id === "mission") items = missionItems(object, proposed);
      else if (group.id === "package") items = packageItems(object);
      else if (group.id === "effects") items = effectItems(object, objects);
      else if (group.id === "airspace")
        items = airspaceItems(object, claims, currentTime);
      else if (group.id === "support") items = supportItems(object);
      const row = rowFor(group.id, group.label, object, items);
      if (row) rows.push(row);
    }
    if (rows.length) groups.push({ id: group.id, label: group.label, rows });
  }
  const expectation = expectationRows(objects, expectations, observations, currentTime);
  if (expectation.length) {
    groups.push({ id: "expectations", label: "Expect", rows: expectation });
  }
  return { groups };
}
