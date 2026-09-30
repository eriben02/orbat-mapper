import type { Polygon } from "geojson";
import type { EntityId, ScenarioTime } from "@/types/base";

/**
 * Discriminated by `kind`. Add a member here for the next domain object.
 * Do not collapse these into one object of optional fields.
 */
export type OperationalObjectKind = "airspace" | "package" | "mission" | "target";

/**
 * One field for now. Authorization (PLANNED/APPROVED) and epistemic status
 * (REPORTED/OBSERVED/INFERRED) are different axes; they stay one field until a
 * second axis is actually stored.
 */
export type OperationalStatus =
  "PLANNED" | "APPROVED" | "REPORTED" | "OBSERVED" | "INFERRED";

/** @deprecated Use OperationalStatus. Kept so v0.1 imports still typecheck. */
export type AirspaceOperationalStatus = OperationalStatus;

export interface FlightLevelLimit {
  system: "FL";
  value: number;
}

export interface VerticalLimits {
  lower: FlightLevelLimit;
  upper: FlightLevelLimit;
}

/**
 * One stored edge. `target.id` is a stable id, never a designator.
 * The inverse is not stored. See `presentRelations`.
 * `target.kind` may name an operational object or an external referent
 * (an ACMREQ, an authority) that is not in this scenario.
 */
export interface OperationalRelation {
  type: string;
  target: {
    kind: string;
    id: string;
  };
}

/** Fields every operational object can change through `state[]`. */
export interface OperationalStatePatch {
  designator?: string;
  status?: OperationalStatus;
  purpose?: string;
  validFrom?: ScenarioTime;
  validUntil?: ScenarioTime;
}

export interface OperationalObjectState<
  TPatch extends OperationalStatePatch = OperationalStatePatch,
> {
  id: string;
  t: ScenarioTime;
  patch: TPatch;
}

interface OperationalObjectBase {
  id: EntityId;
  /** Human name. Not the primary key. */
  designator: string;
  status: OperationalStatus;
  purpose?: string;
  validFrom: ScenarioTime;
  validUntil: ScenarioTime;
  /** Canonical edges only. Inverse edges are derived. */
  relations: OperationalRelation[];
  _hidden?: boolean;
}

export interface AirspaceStatePatch extends OperationalStatePatch {
  geometry?: Polygon;
  vertical?: VerticalLimits;
}

export type AirspaceControlMeasureState = OperationalObjectState<AirspaceStatePatch>;
export type CurrentAirspaceControlMeasureState = AirspaceStatePatch & { t: ScenarioTime };

export interface AirspaceControlMeasure extends OperationalObjectBase {
  kind: "airspace";
  /** Doctrinal measure type, e.g. "ROZ". Not a tactical-graphic kind. */
  type: string;
  geometry: Polygon;
  vertical: VerticalLimits;
  state?: AirspaceControlMeasureState[];
  _state?: CurrentAirspaceControlMeasureState | null;
}

export interface PackageStatePatch extends OperationalStatePatch {
  name?: string;
}

export type PackageState = OperationalObjectState<PackageStatePatch>;
export type CurrentPackageState = PackageStatePatch & { t: ScenarioTime };

export interface OperationalPackage extends OperationalObjectBase {
  kind: "package";
  /** Human description. Not the primary key, and not copied onto relations. */
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalMission extends OperationalObjectBase {
  kind: "mission";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalTarget extends OperationalObjectBase {
  kind: "target";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

/** Named objects share `name` and have no geometry in this experiment. */
export type NamedOperationalObject =
  OperationalPackage | OperationalMission | OperationalTarget;

export type OperationalObject = AirspaceControlMeasure | NamedOperationalObject;
