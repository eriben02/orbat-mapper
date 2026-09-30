import { ref } from "vue";

/**
 * The what-if marker the timeline draws.
 * It is presentation state only. It is not written onto the mission.
 */
export interface ProposedTotView {
  missionId: string;
  time: number;
}

export const proposedTotView = ref<ProposedTotView | null>(null);
