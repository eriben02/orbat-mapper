<script setup lang="ts">
import { computed } from "vue";
import "@/dayjs";
import dayjs from "dayjs";
import { injectStrict } from "@/utils";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import type { OperationalRelation, VerticalLimits } from "@/types/operationalModels";
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

const projected = computed(() => object.value?._state);

function formatZulu(timestamp: number | undefined) {
  if (timestamp === undefined) return "";
  return dayjs.utc(timestamp).format("HHmm[Z]");
}

function formatWindow(from: number | undefined, until: number | undefined) {
  return `${formatZulu(from)}–${formatZulu(until)}`;
}

function formatVertical(vertical: VerticalLimits | undefined) {
  if (!vertical) return "";
  return `FL${vertical.lower.value}–FL${vertical.upper.value}`;
}

function relationLabel(relation: OperationalRelation) {
  switch (relation.type) {
    case "source":
      return "Source";
    case "authority":
      return "Authority";
    case "supports":
      return "Supports";
    default:
      return relation.type;
  }
}
</script>

<template>
  <div v-if="object" class="p-4">
    <DetailsPanelHeader density="compact">
      <template #title>
        <PanelTitle>{{ projected?.designator ?? object.designator }}</PanelTitle>
      </template>
      <template #subtitle>{{ object.type }}</template>
    </DetailsPanelHeader>
    <dl class="mt-4 space-y-3">
      <DescriptionItem label="Altitude">
        {{ formatVertical(projected?.vertical ?? object.vertical) }}
      </DescriptionItem>
      <DescriptionItem label="Time">
        {{
          formatWindow(
            projected?.validFrom ?? object.validFrom,
            projected?.validUntil ?? object.validUntil,
          )
        }}
      </DescriptionItem>
      <DescriptionItem label="Status">
        {{ projected?.status ?? object.status }}
      </DescriptionItem>
      <DescriptionItem label="Purpose">
        {{ projected?.purpose ?? object.purpose }}
      </DescriptionItem>
      <DescriptionItem
        v-for="relation in object.relations"
        :key="`${relation.type}:${relation.target.kind}:${relation.target.id}`"
        :label="relationLabel(relation)"
      >
        {{ relation.target.id }}
      </DescriptionItem>
    </dl>
  </div>
</template>
