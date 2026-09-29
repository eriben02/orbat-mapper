import type { Polygon } from "geojson";
import type { EntityId, ScenarioTime } from "@/types/base";

/**
 * First member of a future operational-object union.
 * The map never stores this. It only receives a projection.
 */
export type OperationalObjectKind = "airspace";

/**
 * One field for v0.1. Authorization (PLANNED/APPROVED) and epistemic status
 * (REPORTED/OBSERVED/INFERRED) are different axes; they stay one field until a
 * second axis is actually stored.
 */
export type AirspaceOperationalStatus =
  | "PLANNED"
  | "APPROVED"
  | "REPORTED"
  | "OBSERVED"
  | "INFERRED";

export interface FlightLevelLimit {
  system: "FL";
  value: number;
}

export interface VerticalLimits {
  lower: FlightLevelLimit;
  upper: FlightLevelLimit;
}

/** A pointer at something that may not be an object in this scenario yet. */
export interface OperationalRelation {
  type: string;
  target: {
    kind: string;
    id: string;
  };
}

export interface AirspaceControlMeasureStatePatch {
  designator?: string;
  geometry?: Polygon;
  vertical?: VerticalLimits;
  validFrom?: ScenarioTime;
  validUntil?: ScenarioTime;
  status?: AirspaceOperationalStatus;
  purpose?: string;
}

export interface AirspaceControlMeasureState {
  id: string;
  t: ScenarioTime;
  patch: AirspaceControlMeasureStatePatch;
}

/** Derived. Never serialized. */
export interface CurrentAirspaceControlMeasureState extends AirspaceControlMeasureStatePatch {
  t: ScenarioTime;
}

export interface AirspaceControlMeasure {
  id: EntityId;
  kind: "airspace";
  /** Human name. Not the primary key. */
  designator: string;
  /** Doctrinal measure type, e.g. "ROZ". Not a tactical-graphic kind. */
  type: string;
  geometry: Polygon;
  vertical: VerticalLimits;
  validFrom: ScenarioTime;
  validUntil: ScenarioTime;
  status: AirspaceOperationalStatus;
  purpose?: string;
  relations: OperationalRelation[];
  state?: AirspaceControlMeasureState[];
  _state?: CurrentAirspaceControlMeasureState | null;
  _hidden?: boolean;
}

export type OperationalObject = AirspaceControlMeasure;
