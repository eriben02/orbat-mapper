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
  getClaimsForSubject,
  type SubjectClaim,
} from "@/scenariostore/operationalClaims";
import {
  evaluateProposedTot,
  type EvaluationFinding,
  type ProposedChangeEvaluation,
} from "@/scenariostore/operationalChange";
import DetailsPanelHeader from "@/modules/scenarioeditor/DetailsPanelHeader.vue";
import {
  evaluationFindingDetail,
  evaluationStatusLabel,
  formatZulu,
} from "@/modules/scenarioeditor/evaluationPresentation";
import {
  buildDemoMissionOverview,
  isDemoOperation,
} from "@/modules/scenarioeditor/demoMissionView";
import { proposedTotView } from "@/modules/scenarioeditor/operationTimelineProposal";
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

const knownClaims = computed(() => {
  const current = object.value;
  if (!current) return [];
  return getClaimsForSubject(
    current.id,
    state.operationalClaims ?? [],
    state.currentTime,
  ).filter((claim) => claim.known);
});

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

const missionHome = computed(() => {
  if (!isDemoOperation(state.id)) return null;
  return buildDemoMissionOverview(
    Object.values(state.operationalObjectMap),
    state.operationalClaims ?? [],
    state.currentTime,
  );
});

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

function findingLabel(finding: EvaluationFinding) {
  const target = state.operationalObjectMap[finding.objectId];
  return target?._state?.designator ?? target?.designator ?? finding.objectId;
}

function returnToMission() {
  selectedOperationalObjectId.value = null;
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
    state.operationalClaims ?? [],
  );
  proposedTotView.value = { missionId: current.id, time: proposed };
}

function claimTiming(claim: SubjectClaim) {
  if (claim.currentlyValid) {
    return "Asserted for the current time. This is a claim, not object state.";
  }
  if (claim.futureValid) {
    return "Reported. The asserted window has not started. This is a claim, not object state.";
  }
  if (claim.historical) {
    return "Historical. The asserted window has ended. The claim is kept. This is not object state.";
  }
  return "This is a claim, not object state.";
}

function unknownLabel(value: string) {
  return value === "UNKNOWN" ? "Unknown" : value;
}

function predicateLabel(predicate: string) {
  if (!predicate) return predicate;
  return predicate.charAt(0).toUpperCase() + predicate.slice(1);
}
</script>

<template>
  <div v-if="object" class="p-4">
    <button
      v-if="missionHome && missionHome.missionId !== object.id"
      type="button"
      class="mb-3 text-sm hover:underline"
      @click="returnToMission"
    >
      ← {{ missionHome.designator }}
    </button>
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
    <section v-if="knownClaims.length" class="mt-6">
      <h3 class="text-sm font-medium">Claims / Reports</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        What a source says. Not the object's state.
      </p>
      <div v-for="claim in knownClaims" :key="claim.id" class="mt-3">
        <p class="text-muted-foreground text-xs">{{ claimTiming(claim) }}</p>
        <dl class="mt-2 space-y-3">
          <DescriptionItem :label="predicateLabel(claim.predicate)">
            {{ claim.value }}
          </DescriptionItem>
          <DescriptionItem label="Valid">
            {{ formatZulu(claim.validFrom ?? undefined) }}–{{
              formatZulu(claim.validUntil ?? undefined)
            }}
          </DescriptionItem>
          <DescriptionItem label="Reported">
            {{ formatZulu(claim.reportedAt) }}
          </DescriptionItem>
          <DescriptionItem label="Source">{{ claim.source }}</DescriptionItem>
          <DescriptionItem v-if="claim.reason" label="Reason">
            {{ claim.reason }}
          </DescriptionItem>
          <DescriptionItem label="Authority">
            {{ unknownLabel(claim.authority) }}
          </DescriptionItem>
          <DescriptionItem label="Confidence">
            {{ unknownLabel(claim.confidence) }}
          </DescriptionItem>
        </dl>
      </div>
    </section>
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
          <li
            v-for="finding in attentionFindings"
            :key="finding.relationSourceId + finding.rule + finding.objectId"
          >
            <p class="text-sm font-medium">{{ findingLabel(finding) }}</p>
            <p class="text-sm">{{ evaluationStatusLabel(finding.status) }}</p>
            <p class="text-muted-foreground text-xs">
              {{ evaluationFindingDetail(finding) }}
            </p>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
