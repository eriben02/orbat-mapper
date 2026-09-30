<script setup lang="ts">
import { computed } from "vue";
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
  if (current.kind === "package") return "Package";
  if (current.kind === "mission") return "Mission";
  return "Target";
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
  </div>
</template>
