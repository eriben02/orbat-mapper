import type { Polygon } from "geojson";
import type { EntityId, ScenarioTime } from "@/types/base";

/**
 * Discriminated by `kind`. Add a member here for the next domain object.
 * Do not collapse these into one object of optional fields.
 */
export type OperationalObjectKind =
  | "airspace"
  | "package"
  | "mission"
  | "target"
  | "effect"
  | "engagement"
  | "support"
  | "assessment";

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
  /**
   * Structured facts for a dependency. Absent on a purely structural edge.
   * Times are not availability rules unless a rule says it reads them.
   */
  constraint?: {
    validFrom?: ScenarioTime;
    validUntil?: ScenarioTime;
    effectAt?: ScenarioTime;
    /** Named gaps. Not values, and not a feasibility result. */
    unresolvedFactors?: string[];
    basis?: string;
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
  /** Time on target in the current plan. A proposal must not write this. */
  tot?: ScenarioTime;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalTarget extends OperationalObjectBase {
  kind: "target";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalEffect extends OperationalObjectBase {
  kind: "effect";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalEngagement extends OperationalObjectBase {
  kind: "engagement";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalSupport extends OperationalObjectBase {
  kind: "support";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

export interface OperationalAssessment extends OperationalObjectBase {
  kind: "assessment";
  name: string;
  state?: PackageState[];
  _state?: CurrentPackageState | null;
}

/** Named objects share `name` and have no geometry in this experiment. */
export type NamedOperationalObject =
  | OperationalPackage
  | OperationalMission
  | OperationalTarget
  | OperationalEffect
  | OperationalEngagement
  | OperationalSupport
  | OperationalAssessment;

export type OperationalObject = AirspaceControlMeasure | NamedOperationalObject;

/**
 * A source assertion about an operational object.
 * It is not object state and must not be written back onto the subject.
 * `UNKNOWN` is stored explicitly when authority or confidence is not represented.
 */
export interface OperationalClaim {
  id: EntityId;
  /** Stable id of the operational object. Never a designator. */
  subjectId: EntityId;
  predicate: string;
  value: string;
  /** When the source made the report. Not the asserted window. */
  reportedAt: ScenarioTime;
  /** When the assertion is claimed to apply. Optional. */
  validFrom?: ScenarioTime;
  validUntil?: ScenarioTime;
  source: string;
  reason?: string;
  authority: string;
  confidence: string;
}

/**
 * What the plan says should happen.
 * Status is not stored. It is derived from the clock and known observations.
 */
export interface OperationalExpectation {
  id: EntityId;
  /** Stable id of the operational object. Never a designator. */
  subjectId: EntityId;
  predicate: string;
  expectedValue: string;
  expectedAt: ScenarioTime;
  /** Inclusive deadline for a confirming observation to be known. */
  confirmBy: ScenarioTime;
  basis?: string;
}

/**
 * Represented evidence about what happened.
 * Not a claim, and not object state.
 * `observedAt` is the event time. `receivedAt` is when the information arrived.
 */
export interface OperationalObservation {
  id: EntityId;
  subjectId: EntityId;
  predicate: string;
  value: string;
  observedAt: ScenarioTime;
  receivedAt: ScenarioTime;
  source: string;
  confidence: string;
  basis?: string;
}
