import dayjs from "dayjs";
import { nanoid } from "@/utils";
import type {
  AirspaceControlMeasure,
  AirspaceControlMeasureState,
  CurrentAirspaceControlMeasureState,
} from "@/types/operationalModels";

/**
 * Fold `state[]` the same way layer items do: every entry at or before `timestamp`
 * overlays the previous one. The seed is the object's own fields, so a measure with
 * an empty history still projects.
 */
export function projectAirspaceStateAt(
  object: AirspaceControlMeasure,
  timestamp: number,
): CurrentAirspaceControlMeasureState {
  let current: CurrentAirspaceControlMeasureState = {
    t: Number.MIN_SAFE_INTEGER,
    designator: object.designator,
    geometry: object.geometry,
    vertical: object.vertical,
    validFrom: object.validFrom,
    validUntil: object.validUntil,
    status: object.status,
    purpose: object.purpose,
  };
  const entries = object.state ?? [];
  for (const entry of entries) {
    if (entry.t > timestamp) break;
    current = {
      ...current,
      ...entry.patch,
      t: entry.t,
    };
  }
  return current;
}

/**
 * Inclusive window. 1200Z and 1430Z are inside; 1100Z and 1431Z are outside.
 * Layer items use exclusive bounds. This is not those bounds.
 */
export function isAirspaceHiddenAt(
  projected: Pick<CurrentAirspaceControlMeasureState, "validFrom" | "validUntil">,
  timestamp: number,
): boolean {
  const from = projected.validFrom ?? Number.NEGATIVE_INFINITY;
  const until = projected.validUntil ?? Number.POSITIVE_INFINITY;
  return timestamp < from || timestamp > until;
}

export function applyAirspaceProjection(
  object: AirspaceControlMeasure,
  timestamp: number,
): void {
  const projected = projectAirspaceStateAt(object, timestamp);
  object._state = projected;
  object._hidden = isAirspaceHiddenAt(projected, timestamp);
}

export function operationalObjectToInternal(
  object: AirspaceControlMeasure,
): AirspaceControlMeasure {
  const state = object.state
    ?.map(
      (entry): AirspaceControlMeasureState => ({
        ...entry,
        id: entry.id || nanoid(),
        t: +dayjs(entry.t),
      }),
    )
    .sort((a, b) => a.t - b.t);
  return {
    ...object,
    validFrom: +dayjs(object.validFrom),
    validUntil: +dayjs(object.validUntil),
    ...(state ? { state } : {}),
  };
}
