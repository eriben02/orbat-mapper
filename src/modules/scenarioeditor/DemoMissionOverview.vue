<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import "@/dayjs";
import dayjs from "dayjs";
import { injectStrict } from "@/utils";
import { activeScenarioKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import {
  evaluateProposedTot,
  type ProposedChangeEvaluation,
} from "@/scenariostore/operationalChange";
import { buildDemoMissionOverview } from "@/modules/scenarioeditor/demoMissionView";
import {
  evaluationFindingDetail,
  evaluationStatusLabel,
  evaluationStatusTone,
  formatZulu,
} from "@/modules/scenarioeditor/evaluationPresentation";

const {
  store: { state },
  time: { setCurrentTime },
} = injectStrict(activeScenarioKey);
const { selectedOperationalObjectId } = useSelectedItems();

const proposedTotText = ref("1415Z");
const totEvaluation = ref<ProposedChangeEvaluation | null>(null);
const whatIfResult = useTemplateRef("whatIfResult");

const overview = computed(() =>
  buildDemoMissionOverview(
    Object.values(state.operationalObjectMap),
    state.operationalClaims ?? [],
    state.currentTime,
  ),
);

const attention = computed(
  () => totEvaluation.value?.findings.filter((item) => item.status !== "SATISFIED") ?? [],
);

const toneClass: Record<string, string> = {
  conflict: "border-red-700",
  changed: "border-sky-700",
  review: "border-amber-600",
  unknown: "border-slate-400",
  claim: "border-violet-700",
  satisfied: "border-slate-200",
};

function relationLabel(type: string) {
  switch (type) {
    case "requires":
      return "Required";
    case "depends-on-effect-window":
      return "Effect window";
    case "synchronized-with":
      return "Synchronized";
    case "requires-recalculation":
      return "Recalculation";
    case "timing-assumption":
      return "Timing assumption";
    default:
      return type;
  }
}

function openObject(id: string) {
  selectedOperationalObjectId.value = id;
}

function goTo(time: number) {
  setCurrentTime(time);
}

function unknownLabel(value: string) {
  return value === "UNKNOWN" ? "Unknown" : value;
}

function findingName(objectId: string) {
  const object = state.operationalObjectMap[objectId];
  return object?._state?.designator ?? object?.designator ?? objectId;
}

async function evaluateTot() {
  const current = overview.value;
  if (!current?.tot) return;
  const match = proposedTotText.value.trim().match(/^(\d{2})(\d{2})Z?$/i);
  if (!match) return;
  const proposed = +dayjs
    .utc(current.tot)
    .hour(Number(match[1]))
    .minute(Number(match[2]))
    .second(0)
    .millisecond(0);
  totEvaluation.value = evaluateProposedTot(
    current.missionId,
    Object.values(state.operationalObjectMap),
    proposed,
    state.operationalClaims ?? [],
  );
  await nextTick();
  const node = whatIfResult.value;
  const scroller = node?.closest(".overflow-y-auto");
  if (!node || !(scroller instanceof HTMLElement)) return;
  const delta = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += delta;
}
</script>

<template>
  <div v-if="overview" class="space-y-3 p-4 pb-16 text-sm">
    <header>
      <p class="text-muted-foreground text-xs">
        The map draws airspace. This is the operation behind it.
      </p>
      <h2 class="mt-2 text-base font-semibold">{{ overview.designator }}</h2>
      <p>{{ overview.name }}</p>
      <p class="text-muted-foreground mt-1 text-xs">Status {{ overview.status }}</p>
      <p class="mt-2 font-medium">TOT {{ formatZulu(overview.tot) }}</p>
    </header>

    <section
      v-if="overview.reports.length"
      class="rounded border-l-4 border-violet-700 bg-violet-50 p-3 dark:bg-violet-950/30"
    >
      <h3 class="text-sm font-medium">New report</h3>
      <p class="mt-1 text-xs">
        This is a report / claim. It does not change object state.
      </p>
      <div v-for="report in overview.reports" :key="report.id" class="mt-3">
        <p>
          {{ report.source }} reports: {{ report.subjectDesignator }}
          {{ report.value }}
        </p>
        <p class="mt-1">
          {{ formatZulu(report.validFrom) }}–{{ formatZulu(report.validUntil) }}
        </p>
        <p class="text-muted-foreground text-xs">
          Reported {{ formatZulu(report.reportedAt) }}
        </p>
        <p v-if="report.reason" class="mt-1">Reason: {{ report.reason }}</p>
        <p>Authority: {{ unknownLabel(report.authority) }}</p>
        <p>Confidence: {{ unknownLabel(report.confidence) }}</p>
        <p class="mt-2 text-xs">Object state: {{ report.subjectStatus }}</p>
        <button
          type="button"
          class="mt-1 hover:underline"
          @click="openObject(report.subjectId)"
        >
          Inspect {{ report.subjectDesignator }}
        </button>
      </div>
    </section>

    <section v-if="overview.target">
      <h3 class="text-muted-foreground text-xs font-medium">Target</h3>
      <button
        type="button"
        class="mt-1 text-left hover:underline"
        @click="openObject(overview.target.id)"
      >
        {{ overview.target.designator }}
      </button>
    </section>

    <section v-if="overview.executedBy">
      <h3 class="text-muted-foreground text-xs font-medium">Executed by</h3>
      <button
        type="button"
        class="mt-1 text-left hover:underline"
        @click="openObject(overview.executedBy.id)"
      >
        {{ overview.executedBy.designator }}
      </button>
    </section>

    <section class="border-t pt-3">
      <h3 class="text-sm font-medium">What if</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        A proposal does not change the current plan.
      </p>
      <p class="mt-2">Current TOT {{ formatZulu(overview.tot) }}</p>
      <form class="mt-2 flex items-center gap-2" @submit.prevent="evaluateTot">
        <label class="text-xs" for="demo-proposed-tot">Proposed TOT</label>
        <input
          id="demo-proposed-tot"
          v-model="proposedTotText"
          class="w-20 rounded border px-2 py-1"
        />
        <button type="submit" class="rounded border px-2 py-1">Evaluate</button>
      </form>
      <div v-if="totEvaluation" ref="whatIfResult" class="mt-3 space-y-2">
        <p class="font-medium">
          TOT {{ formatZulu(totEvaluation.current) }} →
          {{ formatZulu(totEvaluation.proposed) }}
        </p>
        <p class="text-muted-foreground text-xs">
          The stored TOT is still {{ formatZulu(overview.tot) }}. No decision is
          recommended.
        </p>
        <ul class="space-y-2">
          <li
            v-for="finding in attention"
            :key="finding.relationSourceId + finding.rule + finding.objectId"
            class="border-l-4 pl-2"
            :class="toneClass[evaluationStatusTone(finding.status)]"
          >
            <p class="font-medium">{{ findingName(finding.objectId) }}</p>
            <p>{{ evaluationStatusLabel(finding.status) }}</p>
            <p class="text-muted-foreground text-xs">
              {{ evaluationFindingDetail(finding) }}
            </p>
          </li>
        </ul>
      </div>
    </section>

    <section>
      <h3 class="text-sm font-medium">Dependencies</h3>
      <p class="text-muted-foreground mt-1 text-xs">
        Represented in the plan. Not pass or fail results.
      </p>
      <ul class="mt-2 space-y-1">
        <li v-for="item in overview.dependencies" :key="item.id">
          <button
            type="button"
            class="text-left hover:underline"
            @click="openObject(item.id)"
          >
            {{ item.designator }}
          </button>
          <span class="text-muted-foreground ml-2 text-xs">
            {{ relationLabel(item.relationType) }}
          </span>
        </li>
      </ul>
    </section>

    <section>
      <h3 class="text-sm font-medium">Time</h3>
      <ul class="mt-2 space-y-1">
        <li v-for="beat in overview.beats" :key="beat.id">
          <button
            type="button"
            class="hover:bg-muted w-full rounded px-1 py-0.5 text-left"
            :class="state.currentTime === beat.time ? 'bg-muted font-medium' : ''"
            @click="goTo(beat.time)"
          >
            <span class="tabular-nums">{{ formatZulu(beat.time) }}</span>
            {{ beat.label }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
