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
  </div>
</template>
