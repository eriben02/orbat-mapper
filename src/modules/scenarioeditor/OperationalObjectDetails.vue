<script setup lang="ts">
import { computed, ref, watch } from "vue";
import "@/dayjs";
import dayjs from "dayjs";
import { injectStrict } from "@/utils";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import {
  presentRelations,
  type PresentedRelation,
} from "@/scenariostore/operationalRelations";
import { traceOperationalRelations } from "@/scenariostore/operationalTrace";
import {
  evaluateProposedTot,
  type EvaluationFinding,
  type EvaluationStatus,
  type ProposedChangeEvaluation,
} from "@/scenariostore/operationalChange";
import DetailsPanelHeader from "@/modules/scenarioeditor/DetailsPanelHeader.vue";
import PanelTitle from "@/modules/scenarioeditor/PanelTitle.vue";
import DescriptionItem from "@/components/DescriptionItem.vue";

const { selectedOperationalObjectId } = useSelectedItems();
const {
  store: { state },
} = injectStrict(activeScenarioKey);

const object = computed(() => {
  const id = selectedOperationalObjectId.value;
  return id ? state.operationalObjectMap[id] : undefined;
});

const title = computed(
  () => object.value?._state?.designator ?? object.value?.designator ?? "",
);

const subtitle = computed(() => {
  const current = object.value;
  if (!current) return "";
  if (current.kind === "airspace") return current.type;
  const labels: Record<string, string> = {
    package: "Package",
    mission: "Mission",
    target: "Target",
    effect: "Effect",
    engagement: "Engagement",
    support: "Support",
    assessment: "Assessment",
  };
  return labels[current.kind] ?? current.kind;
});

const namedName = computed(() => {
  const current = object.value;
  if (!current || current.kind === "airspace") return "";
  return current._state?.name ?? current.name;
});

const altitude = computed(() => {
  const current = object.value;
  if (!current || current.kind !== "airspace") return "";
  const vertical = current._state?.vertical ?? current.vertical;
  return `FL${vertical.lower.value}–FL${vertical.upper.value}`;
});

const timeWindow = computed(() => {
  const current = object.value;
  if (!current) return "";
  const from = current._state?.validFrom ?? current.validFrom;
  const until = current._state?.validUntil ?? current.validUntil;
  return `${formatZulu(from)}–${formatZulu(until)}`;
});

const status = computed(() => object.value?._state?.status ?? object.value?.status ?? "");

const purpose = computed(
  () => object.value?._state?.purpose ?? object.value?.purpose ?? "",
);

const missionTot = computed(() => {
  const current = object.value;
  if (!current || current.kind !== "mission" || current.tot == null) return null;
  return typeof current.tot === "number" ? current.tot : Date.parse(String(current.tot));
});

const proposedTotText = ref("1415Z");
const totEvaluation = ref<ProposedChangeEvaluation | null>(null);

watch(selectedOperationalObjectId, () => {
  totEvaluation.value = null;
});

const attentionFindings = computed(
  () => totEvaluation.value?.findings.filter((item) => item.status !== "SATISFIED") ?? [],
);

const relations = computed(() => {
  const current = object.value;
  if (!current) return [];
  return presentRelations(current, Object.values(state.operationalObjectMap));
});

const relatedRows = computed(() => {
  const current = object.value;
  if (!current) return [];
  // The counter is bumped on every clock projection. Reading it recomputes the path.
  const clock = state.operationalStateCounter;
  const objects = Object.values(state.operationalObjectMap);
  const trace = traceOperationalRelations(current.id, objects, {
    excludeHidden: clock >= 0,
  });
  const bySource = new Map<string, typeof trace.edges>();
  for (const edge of trace.edges) {
    const list = bySource.get(edge.sourceId) ?? [];
    list.push(edge);
    bySource.set(edge.sourceId, list);
  }
  const rows: {
    key: string;
    depth: number;
    relationType: string;
    label: string;
    targetId: string;
    navigable: boolean;
  }[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const edge of bySource.get(id) ?? []) {
      const target = state.operationalObjectMap[edge.targetId];
      rows.push({
        key: `${edge.canonicalSourceId}:${edge.canonicalType}:${edge.targetId}:${edge.derived}`,
        depth: edge.depth,
        relationType: edge.relationType,
        label: target ? (target._state?.designator ?? target.designator) : edge.targetId,
        targetId: edge.targetId,
        navigable: edge.targetExists,
      });
      if (edge.targetExists) walk(edge.targetId);
    }
  };
  walk(trace.startId);
  return rows;
});

function formatZulu(timestamp: number | undefined) {
  if (timestamp === undefined) return "";
  return dayjs.utc(timestamp).format("HHmm[Z]");
}

function relationLabel(type: string) {
  switch (type) {
    case "required-by":
      return "Required by";
    case "requires":
      return "Requires";
    case "executed-by":
      return "Executed by";
    case "executes":
      return "Executes";
    case "targets":
      return "Targets";
    case "targeted-by":
      return "Targeted by";
    case "source":
      return "Source";
    case "authority":
      return "Authority";
    case "supports":
      return "Supports";
    case "depends-on-effect-window":
      return "Effect window";
    case "synchronized-with":
      return "Synchronized with";
    case "requires-recalculation":
      return "Recalculation";
    case "timing-assumption":
      return "Timing assumption";
    default:
      return type;
  }
}

function openRelation(relation: PresentedRelation) {
  if (!relation.navigable) return;
  selectedOperationalObjectId.value = relation.targetId;
}

function openRelated(targetId: string, navigable: boolean) {
  if (!navigable) return;
  selectedOperationalObjectId.value = targetId;
}

function factValue(finding: EvaluationFinding, key: string) {
  return finding.facts.find((item) => item.key === key)?.value;
}

function statusLabel(status: EvaluationStatus) {
  switch (status) {
    case "CONFLICT":
      return "Conflict";
    case "CHANGED":
      return "Changed";
    case "REVIEW_REQUIRED":
      return "Review required";
    case "UNKNOWN":
      return "Unknown";
    default:
      return "Satisfied";
  }
}

function findingLabel(finding: EvaluationFinding) {
  const target = state.operationalObjectMap[finding.objectId];
  return target?._state?.designator ?? target?.designator ?? finding.objectId;
}

function findingDetail(finding: EvaluationFinding) {
  const proposed = formatZulu(factValue(finding, "proposed") as number);
  const from = formatZulu(factValue(finding, "windowFrom") as number);
  const until = formatZulu(factValue(finding, "windowUntil") as number);
  switch (finding.rule) {
    case "effect-window-contains-instant":
      return finding.status === "CONFLICT"
        ? `${proposed} is outside effect window ${from}–${until}`
        : `${proposed} is inside effect window ${from}–${until}`;
    case "effect-window-missing":
      return "Effect window is not represented.";
    case "dependency-target-missing":
      return "The dependency target is not in the scenario.";
    case "synchronization-instant-not-moved":
      return `Represented effect at ${formatZulu(factValue(finding, "effectAt") as number)} is unchanged. Synchronization must be reviewed.`;
    case "insufficient-model-for-recomputation": {
      const factors = finding.facts
        .filter((item) => item.key === "unresolvedFactor")
        .map((item) => item.value)
        .join(", ");
      return factors
        ? `Feasibility cannot be calculated. Missing: ${factors}.`
        : "Feasibility cannot be calculated from the current model.";
    }
    case "timing-assumption-not-recomputed":
      return "The assessment is tied to the original timing. The model cannot calculate the effect of the change.";
    case "requires-does-not-state-usability": {
      const validityFrom = formatZulu(factValue(finding, "validityFrom") as number);
      const validityUntil = formatZulu(factValue(finding, "validityUntil") as number);
      const inside = factValue(finding, "proposedInsideValidity");
      if (inside === true) {
        return `Proposed time is inside the represented validity window ${validityFrom}–${validityUntil}. Usability for the mission is not represented.`;
      }
      if (inside === false) {
        return `Proposed time is outside the represented validity window ${validityFrom}–${validityUntil}. Usability for the mission is not represented.`;
      }
      return "No time constraint is represented for this requirement.";
    }
    default:
      return finding.rule;
  }
}

function evaluateTot() {
  const current = object.value;
  if (!current || current.kind !== "mission" || missionTot.value == null) return;
  const match = proposedTotText.value.trim().match(/^(\d{2})(\d{2})Z?$/i);
  if (!match) return;
  const proposed = +dayjs
    .utc(missionTot.value)
    .hour(Number(match[1]))
    .minute(Number(match[2]))
    .second(0)
    .millisecond(0);
  totEvaluation.value = evaluateProposedTot(
    current.id,
    Object.values(state.operationalObjectMap),
    proposed,
  );
}
</script>

<template>
  <div v-if="object" class="p-4">
    <DetailsPanelHeader density="compact">
      <template #title>
        <PanelTitle>{{ title }}</PanelTitle>
      </template>
      <template #subtitle>{{ subtitle }}</template>
    </DetailsPanelHeader>
    <dl class="mt-4 space-y-3">
      <DescriptionItem v-if="object.kind !== 'airspace'" label="Name">
        {{ namedName }}
      </DescriptionItem>
      <DescriptionItem v-if="object.kind === 'airspace'" label="Altitude">
        {{ altitude }}
      </DescriptionItem>
      <DescriptionItem label="Time">{{ timeWindow }}</DescriptionItem>
      <DescriptionItem label="Status">{{ status }}</DescriptionItem>
      <DescriptionItem v-if="purpose" label="Purpose">{{ purpose }}</DescriptionItem>
      <DescriptionItem
        v-for="relation in relations"
        :key="relation.key"
        :label="relationLabel(relation.type)"
      >
        <button
          v-if="relation.navigable"
          type="button"
          class="text-left hover:underline"
          @click="openRelation(relation)"
        >
          {{ relation.label }}
        </button>
        <template v-else>{{ relation.label }}</template>
      </DescriptionItem>
    </dl>
    <section v-if="relatedRows.length" class="mt-6">
      <h3 class="text-sm font-medium">Related operation</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        Calculated from stored relationships. A path is not an operational conclusion.
      </p>
      <p class="mt-3 text-sm">{{ title }}</p>
      <ul class="mt-1">
        <li
          v-for="row in relatedRows"
          :key="row.key"
          class="text-sm leading-6"
          :style="{ paddingLeft: `${(row.depth - 1) * 12}px` }"
        >
          <span class="text-muted-foreground"
            >└─ {{ relationLabel(row.relationType) }} →
          </span>
          <button
            v-if="row.navigable"
            type="button"
            class="text-left hover:underline"
            @click="openRelated(row.targetId, row.navigable)"
          >
            {{ row.label }}
          </button>
          <template v-else>{{ row.label }}</template>
        </li>
      </ul>
    </section>
    <section v-if="missionTot !== null" class="mt-6">
      <h3 class="text-sm font-medium">Proposed TOT</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        A proposal does not change the current plan.
      </p>
      <dl class="mt-3">
        <DescriptionItem label="Current TOT">{{
          formatZulu(missionTot)
        }}</DescriptionItem>
      </dl>
      <form class="mt-3 flex items-center gap-2" @submit.prevent="evaluateTot">
        <label class="text-sm" for="proposed-tot">Proposed TOT</label>
        <input
          id="proposed-tot"
          v-model="proposedTotText"
          class="w-24 rounded border px-2 py-1 text-sm"
        />
        <button type="submit" class="rounded border px-2 py-1 text-sm">Evaluate</button>
      </form>
      <div v-if="totEvaluation" class="mt-4">
        <p class="text-sm">
          TOT {{ formatZulu(totEvaluation.current ?? undefined) }} →
          {{ formatZulu(totEvaluation.proposed) }}
        </p>
        <h4 class="mt-3 text-sm font-medium">Dependencies requiring attention</h4>
        <ul class="mt-2 space-y-3">
          <li v-for="finding in attentionFindings" :key="finding.objectId + finding.rule">
            <p class="text-sm font-medium">{{ findingLabel(finding) }}</p>
            <p class="text-sm">{{ statusLabel(finding.status) }}</p>
            <p class="text-muted-foreground text-xs">{{ findingDetail(finding) }}</p>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
