import dayjs from "dayjs";
import { nanoid } from "@/utils";
import type {
  AirspaceControlMeasure,
  CurrentAirspaceControlMeasureState,
  CurrentPackageState,
  OperationalObject,
  OperationalPackage,
  OperationalStatePatch,
} from "@/types/operationalModels";

function foldState<TPatch extends OperationalStatePatch>(
  seed: TPatch,
  entries: { t: number; patch: Partial<TPatch> }[] | undefined,
  timestamp: number,
): TPatch & { t: number } {
  let current: TPatch & { t: number } = { ...seed, t: Number.MIN_SAFE_INTEGER };
  for (const entry of entries ?? []) {
    if (entry.t > timestamp) break;
    current = { ...current, ...entry.patch, t: entry.t };
  }
  return current;
}

/**
 * Fold `state[]` the same way layer items do: every entry at or before `timestamp`
 * overlays the previous one. The seed is the object's own fields, so a measure with
 * an empty history still projects.
 */
export function projectAirspaceStateAt(
  object: AirspaceControlMeasure,
  timestamp: number,
): CurrentAirspaceControlMeasureState {
  return foldState(
    {
      designator: object.designator,
      geometry: object.geometry,
      vertical: object.vertical,
      validFrom: object.validFrom,
      validUntil: object.validUntil,
      status: object.status,
      purpose: object.purpose,
    },
    object.state,
    timestamp,
  );
}

export function projectPackageStateAt(
  object: OperationalPackage,
  timestamp: number,
): CurrentPackageState {
  return foldState(
    {
      designator: object.designator,
      name: object.name,
      validFrom: object.validFrom,
      validUntil: object.validUntil,
      status: object.status,
      purpose: object.purpose,
    },
    object.state,
    timestamp,
  );
}

/**
 * Inclusive window. 1200Z and 1430Z are inside; 1100Z and 1431Z are outside.
 * Layer items use exclusive bounds. This is not those bounds.
 * Packages use the same window. There is still one scenario clock.
 */
export function isOperationalObjectHiddenAt(
  projected: { validFrom?: number; validUntil?: number },
  timestamp: number,
): boolean {
  const from = projected.validFrom ?? Number.NEGATIVE_INFINITY;
  const until = projected.validUntil ?? Number.POSITIVE_INFINITY;
  return timestamp < from || timestamp > until;
}

/** v0.1 name. Airspace and packages share the inclusive window. */
export const isAirspaceHiddenAt = isOperationalObjectHiddenAt;

export function applyAirspaceProjection(
  object: AirspaceControlMeasure,
  timestamp: number,
): void {
  const projected = projectAirspaceStateAt(object, timestamp);
  object._state = projected;
  object._hidden = isOperationalObjectHiddenAt(projected, timestamp);
}

export function applyPackageProjection(
  object: OperationalPackage,
  timestamp: number,
): void {
  const projected = projectPackageStateAt(object, timestamp);
  object._state = projected;
  object._hidden = isOperationalObjectHiddenAt(projected, timestamp);
}

export function applyOperationalProjection(
  object: OperationalObject,
  timestamp: number,
): void {
  if (object.kind === "airspace") {
    applyAirspaceProjection(object, timestamp);
    return;
  }
  applyPackageProjection(object, timestamp);
}

export function operationalObjectToInternal<T extends OperationalObject>(object: T): T {
  const state = object.state
    ?.map((entry) => ({
      ...entry,
      id: entry.id || nanoid(),
      t: +dayjs(entry.t),
    }))
    .sort((a, b) => a.t - b.t);
  return {
    ...object,
    validFrom: +dayjs(object.validFrom),
    validUntil: +dayjs(object.validUntil),
    ...(state ? { state } : {}),
  } as T;
}
