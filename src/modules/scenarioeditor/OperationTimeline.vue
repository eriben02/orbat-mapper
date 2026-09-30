<script setup lang="ts">
import { computed } from "vue";
import { injectStrict } from "@/utils";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import { MS_PER_DAY } from "@/utils/time";
import {
  buildOperationTimelinePlan,
  formatScenarioClock,
  hourTicks,
  intervalOnDay,
  nowFraction,
  scenarioTimeFromTimelineFraction,
  utcDayStart,
  type TimelineMarker,
} from "@/modules/scenarioeditor/operationTimelinePlan";

const {
  store: { state },
  time: { setCurrentTime },
} = injectStrict(activeScenarioKey);
const { selectedOperationalObjectId } = useSelectedItems();

const plan = computed(() =>
  buildOperationTimelinePlan(
    state.operationalObjectIds
      .map((id) => state.operationalObjectMap[id]!)
      .filter(Boolean),
    state.operationalClaims ?? [],
    state.operationalExpectations ?? [],
    state.operationalObservations ?? [],
  ),
);

const dayStart = computed(() => utcDayStart(state.currentTime));
const fraction = computed(() => nowFraction(state.currentTime));
const clock = computed(() => formatScenarioClock(state.currentTime));
const ticks = hourTicks(2);

const toneClass = {
  validity: "bg-slate-500",
  claim: "bg-violet-400",
  confirm: "bg-amber-400",
};

function fractionFromPointer(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return (event.clientX - rect.left) / rect.width;
}

function seek(event: MouseEvent) {
  setCurrentTime(
    scenarioTimeFromTimelineFraction(dayStart.value, fractionFromPointer(event)),
  );
}

function selectLane(objectId: string) {
  selectedOperationalObjectId.value = objectId;
}

function seekMarker(marker: TimelineMarker, objectId: string) {
  setCurrentTime(marker.time);
  selectLane(objectId);
}

function slice(start: number, end: number) {
  return intervalOnDay(start, end, dayStart.value);
}

function intervalStyle(start: number, end: number) {
  const placed = slice(start, end);
  if (!placed) return null;
  return { left: `${placed.left * 100}%`, width: `${placed.width * 100}%` };
}

function markerLeft(time: number) {
  const left = (time - dayStart.value) / MS_PER_DAY;
  if (left < 0 || left > 1) return null;
  return left;
}
</script>

<template>
  <div class="relative border-t border-slate-800 bg-slate-950 text-slate-300">
    <div class="flex h-8">
      <div class="w-40 shrink-0" />
      <div data-timeline-ruler class="relative flex-1 cursor-pointer" @click="seek">
        <span
          v-for="tick in ticks"
          :key="tick.hour"
          class="absolute top-0 h-full border-l border-slate-800"
          :style="{ left: `${tick.fraction * 100}%` }"
        >
          <span
            v-if="tick.label"
            class="absolute top-1 font-mono text-[10px] text-slate-400"
            :class="tick.hour === 24 ? 'right-0' : 'left-0.5'"
          >
            {{ tick.label }}
          </span>
        </span>
      </div>
    </div>

    <div class="max-h-40 overflow-y-auto">
      <div
        v-for="lane in plan.lanes"
        :key="lane.objectId"
        class="flex h-8 border-t border-slate-800"
        :class="selectedOperationalObjectId === lane.objectId ? 'bg-slate-800' : ''"
        :data-lane="lane.objectId"
      >
        <button
          type="button"
          class="w-40 shrink-0 truncate px-2 text-left font-mono text-[11px] text-slate-200 hover:text-white"
          :title="lane.designator"
          @click="selectLane(lane.objectId)"
        >
          {{ lane.designator }}
        </button>
        <div class="relative flex-1 cursor-pointer" @click="seek">
          <template v-for="interval in lane.intervals" :key="interval.id">
            <span
              v-if="intervalStyle(interval.start, interval.end)"
              class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm"
              :class="toneClass[interval.tone]"
              :style="intervalStyle(interval.start, interval.end) ?? undefined"
            />
          </template>
          <template v-for="marker in lane.markers" :key="marker.id">
            <button
              v-if="markerLeft(marker.time) != null"
              type="button"
              class="absolute top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950 bg-slate-100"
              :style="{ left: `${(markerLeft(marker.time) ?? 0) * 100}%` }"
              :title="marker.label"
              @click.stop="seekMarker(marker, lane.objectId)"
            />
          </template>
        </div>
      </div>
    </div>

    <div
      class="pointer-events-none absolute top-0 bottom-0 z-20"
      :style="{ left: `calc(10rem + (100% - 10rem) * ${fraction})` }"
      data-now
    >
      <div class="absolute inset-y-0 w-px bg-amber-300" />
      <span
        class="absolute top-1 -translate-x-1/2 rounded bg-slate-950 px-1 font-mono text-[10px] whitespace-nowrap text-amber-200"
      >
        {{ clock }}
      </span>
    </div>
  </div>
</template>
