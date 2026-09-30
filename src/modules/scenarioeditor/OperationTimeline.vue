<script setup lang="ts">
import { computed, ref } from "vue";
import { injectStrict } from "@/utils";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import { MS_PER_DAY, MS_PER_HOUR } from "@/utils/time";
import { proposedTotView } from "@/modules/scenarioeditor/operationTimelineProposal";
import {
  buildOperationTimelinePlan,
  focusWindow,
  formatScenarioClock,
  formatZuluHour,
  fractionOnScale,
  hourTicks,
  intervalOnScale,
  scenarioTimeFromTimelineFraction,
  timelineInstants,
  utcDayStart,
  type TimelineItem,
} from "@/modules/scenarioeditor/operationTimelinePlan";

const {
  store: { state },
  time: { setCurrentTime },
} = injectStrict(activeScenarioKey);
const { selectedOperationalObjectId } = useSelectedItems();

const mode = ref<"day" | "focus">("focus");

const plan = computed(() =>
  buildOperationTimelinePlan(
    state.operationalObjectIds
      .map((id) => state.operationalObjectMap[id]!)
      .filter(Boolean),
    state.operationalClaims ?? [],
    state.operationalExpectations ?? [],
    state.operationalObservations ?? [],
    state.currentTime,
    proposedTotView.value,
  ),
);

const dayStart = computed(() => utcDayStart(state.currentTime));
const dayEnd = computed(() => dayStart.value + MS_PER_DAY);
const focused = computed(() => focusWindow(timelineInstants(plan.value), dayStart.value));
const scaleStart = computed(() =>
  mode.value === "day" ? dayStart.value : focused.value.start,
);
const scaleEnd = computed(() =>
  mode.value === "day" ? dayEnd.value : focused.value.end,
);
const clock = computed(() => formatScenarioClock(state.currentTime));
const nowOnDay = computed(() =>
  fractionOnScale(state.currentTime, dayStart.value, dayEnd.value),
);
const nowOnScale = computed(() =>
  fractionOnScale(state.currentTime, scaleStart.value, scaleEnd.value),
);
const focusBand = computed(() =>
  intervalOnScale(focused.value.start, focused.value.end, dayStart.value, dayEnd.value),
);
const dayLabels = hourTicks(6);
const scaleLabels = computed(() => {
  const span = scaleEnd.value - scaleStart.value;
  const ticks = [];
  for (let hour = 0; hour <= 24; hour += 1) {
    const time = dayStart.value + hour * MS_PER_HOUR;
    const fraction = fractionOnScale(time, scaleStart.value, scaleEnd.value);
    if (fraction == null) continue;
    const major = span >= MS_PER_DAY - 1 ? hour % 3 === 0 : true;
    ticks.push({
      hour,
      fraction,
      label: major ? `${String(hour).padStart(2, "0")}Z` : "",
    });
  }
  return ticks;
});

const barClass: Record<string, string> = {
  plan: "h-1.5 bg-slate-400",
  claim: "h-3 border border-dashed border-violet-300 bg-violet-400/15",
  expectation: "h-px bg-amber-300",
  observation: "h-1.5 bg-teal-300",
  proposed: "h-1.5 border border-dashed border-sky-300",
  attention: "h-1.5 bg-amber-400/50",
};

const pointClass: Record<string, string> = {
  plan: "h-2 w-2 bg-slate-100",
  claim: "h-1.5 w-1.5 bg-violet-300",
  expectation: "h-2 w-2 border border-amber-300 bg-slate-950",
  observation: "h-2 w-2 bg-teal-300",
  proposed: "h-2.5 w-2.5 border border-dashed border-sky-300 bg-slate-950",
  attention: "h-2 w-2 bg-amber-300",
};

function fractionFromPointer(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return (event.clientX - rect.left) / rect.width;
}

function seekScale(event: MouseEvent) {
  setCurrentTime(
    scenarioTimeFromTimelineFraction(
      scaleStart.value,
      scaleEnd.value,
      fractionFromPointer(event),
    ),
  );
}

function seekDay(event: MouseEvent) {
  setCurrentTime(
    scenarioTimeFromTimelineFraction(
      dayStart.value,
      dayEnd.value,
      fractionFromPointer(event),
    ),
  );
}

function selectObject(objectId: string | null) {
  if (!objectId) return;
  selectedOperationalObjectId.value = objectId;
}

function activate(item: TimelineItem) {
  selectObject(item.objectId);
  setCurrentTime(item.start);
}

function barStyle(item: TimelineItem) {
  if (item.end == null) return null;
  const placed = intervalOnScale(item.start, item.end, scaleStart.value, scaleEnd.value);
  if (!placed) return null;
  return { left: `${placed.left * 100}%`, width: `${placed.width * 100}%` };
}

function pointLeft(item: TimelineItem) {
  if (item.end != null) return null;
  return fractionOnScale(item.start, scaleStart.value, scaleEnd.value);
}
</script>

<template>
  <div class="border-t border-slate-800 bg-slate-950 text-slate-300">
    <div class="flex h-7 items-center gap-2 px-2">
      <button
        type="button"
        class="rounded px-1.5 py-0.5 font-mono text-[10px]"
        :class="mode === 'day' ? 'bg-slate-100 text-slate-950' : 'text-slate-400'"
        @click="mode = 'day'"
      >
        Full day
      </button>
      <button
        type="button"
        class="rounded px-1.5 py-0.5 font-mono text-[10px]"
        :class="mode === 'focus' ? 'bg-slate-100 text-slate-950' : 'text-slate-400'"
        @click="mode = 'focus'"
      >
        Focus
      </button>
      <span class="font-mono text-[10px] text-slate-500">
        {{ formatZuluHour(focused.start) }}–{{ formatZuluHour(focused.end) }}
      </span>
      <span class="ml-auto flex items-center gap-2 font-mono text-[10px] text-slate-500">
        <span class="inline-block h-1.5 w-3 bg-slate-400" /> plan
        <span class="inline-block h-2 w-3 border border-dashed border-violet-300" /> claim
        <span class="inline-block h-2 w-2 rounded-full border border-amber-300" />
        expected <span class="inline-block h-2 w-2 bg-teal-300" /> observed
        <span class="inline-block h-2 w-2 border border-dashed border-sky-300" /> proposed
      </span>
    </div>

    <div class="flex h-5">
      <div class="w-44 shrink-0" />
      <div data-day-strip class="relative flex-1 cursor-pointer" @click="seekDay">
        <span
          v-if="focusBand"
          class="absolute inset-y-1 bg-slate-800"
          :style="{
            left: `${focusBand.left * 100}%`,
            width: `${focusBand.width * 100}%`,
          }"
        />
        <span
          v-for="tick in dayLabels"
          :key="tick.hour"
          class="absolute top-0 font-mono text-[9px] text-slate-500"
          :class="tick.hour === 24 ? 'right-0' : ''"
          :style="tick.hour === 24 ? undefined : { left: `${tick.fraction * 100}%` }"
        >
          {{ tick.label }}
        </span>
        <span
          v-if="nowOnDay != null"
          class="absolute inset-y-0 w-px bg-amber-300"
          :style="{ left: `${nowOnDay * 100}%` }"
        />
      </div>
    </div>

    <div class="relative">
      <div class="flex h-6">
        <div class="w-44 shrink-0" />
        <div
          data-timeline-ruler
          class="relative flex-1 cursor-pointer"
          @click="seekScale"
        >
          <span
            v-for="tick in scaleLabels"
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

      <div class="max-h-64 overflow-y-auto">
        <template v-for="group in plan.groups" :key="group.id">
          <div
            v-for="(row, index) in group.rows"
            :key="row.id"
            class="flex border-t border-slate-800"
            :class="[
              row.groupId === 'expectations' ? 'h-9' : 'h-7',
              selectedOperationalObjectId === row.objectId ? 'bg-slate-800' : '',
            ]"
            :data-row="row.id"
            :data-object="row.objectId ?? undefined"
            :data-attention="row.attention ? 'true' : 'false'"
          >
            <button
              type="button"
              class="flex w-44 shrink-0 items-center gap-1 truncate px-2 text-left"
              @click="selectObject(row.objectId)"
            >
              <span
                class="w-14 shrink-0 font-mono text-[9px] tracking-wide text-slate-500 uppercase"
              >
                {{ index === 0 ? row.groupLabel : "" }}
              </span>
              <span class="truncate font-mono text-[11px] text-slate-200">{{
                row.label
              }}</span>
              <span v-if="row.attention" class="shrink-0 text-[9px] text-amber-300"
                >Attention</span
              >
            </button>
            <div class="relative flex-1 cursor-pointer" @click="seekScale">
              <template v-for="item in row.items" :key="item.id">
                <button
                  v-if="item.visible && item.end != null && barStyle(item)"
                  type="button"
                  class="absolute top-1/2 -translate-y-1/2"
                  :class="barClass[item.role]"
                  :style="barStyle(item) ?? undefined"
                  :title="item.caption || row.label"
                  :data-item="item.id"
                  @click.stop="selectObject(item.objectId)"
                >
                  <span
                    v-if="item.caption"
                    class="absolute top-1/2 left-full ml-1 -translate-y-1/2 font-mono text-[9px] whitespace-nowrap text-violet-200"
                  >
                    {{ item.caption }}
                  </span>
                </button>
                <button
                  v-else-if="item.visible && pointLeft(item) != null"
                  type="button"
                  class="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  :class="pointClass[item.role]"
                  :style="{ left: `${(pointLeft(item) ?? 0) * 100}%` }"
                  :title="item.caption"
                  :data-item="item.id"
                  @click.stop="activate(item)"
                >
                  <span
                    v-if="item.caption"
                    class="absolute font-mono text-[9px] whitespace-nowrap text-slate-300"
                    :class="
                      item.captionSide === 'above'
                        ? 'bottom-2.5 left-1/2 -translate-x-1/2'
                        : item.captionSide === 'below'
                          ? 'top-2.5 left-1/2 -translate-x-1/2'
                          : 'top-1/2 left-3 -translate-y-1/2'
                    "
                  >
                    {{ item.caption }}
                  </span>
                </button>
              </template>
            </div>
          </div>
        </template>
      </div>

      <div
        v-if="nowOnScale != null"
        class="pointer-events-none absolute top-0 bottom-0 z-20"
        :style="{ left: `calc(11rem + (100% - 11rem) * ${nowOnScale})` }"
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
  </div>
</template>
