import {
  createOpenStudentChest,
  type StudentChestState,
} from "../../application/use-cases/OpenStudentChest";
import { INITIAL_COMPANION_ITEM_ID } from "../data/initialStudentInventory";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import {
  createChestOpeningLifecycle,
  shouldEnableChestRewardControls,
} from "./chestOpeningLifecycleService";

export type ChestOpeningLifecycleCheck = { name: string; passed: boolean };

export async function runChestOpeningLifecycleDeterministicChecks(): Promise<
  readonly ChestOpeningLifecycleCheck[]
> {
  return Promise.all([
    check("finishing the video starts the reveal without finishing the audio", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      return lifecycle.startVisualTransition()
        && lifecycle.getSnapshot().audioExpected
        && !lifecycle.getSnapshot().audioFinished;
    }),
    check("onReveal can only be emitted once", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      return lifecycle.revealReward() && !lifecycle.revealReward();
    }),
    check("the reward can be visible while the audio tail is still active", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      lifecycle.revealReward();
      return lifecycle.getSnapshot().rewardRevealed
        && !lifecycle.getSnapshot().audioFinished;
    }),
    check("reward controls stay blocked until the audiovisual flow finishes", () =>
      !shouldEnableChestRewardControls(true, false)
      && shouldEnableChestRewardControls(true, true)),
    check("the MP3 ending can finish the flow only once", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      lifecycle.markVisualTransitionFinished();
      const ready = lifecycle.markAudioFinished();
      return ready && lifecycle.finish() && !lifecycle.finish();
    }),
    check("muted or failed audio uses the safe visual-only exit", () => {
      const muted = createChestOpeningLifecycle(false);
      const failed = createChestOpeningLifecycle(true);
      return muted.markVisualTransitionFinished()
        && muted.finish()
        && !failed.markVisualTransitionFinished()
        && failed.stopWaitingForAudio()
        && failed.finish();
    }),
    check("a video error cannot permanently block the flow", () => {
      const lifecycle = createChestOpeningLifecycle(false);
      return lifecycle.startVisualTransition()
        && lifecycle.markVisualTransitionFinished()
        && lifecycle.finish();
    }),
    check("skipping cannot duplicate the reveal or completion", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      lifecycle.stopWaitingForAudio();
      return !lifecycle.getSnapshot().audioExpected
        && lifecycle.startVisualTransition()
        && !lifecycle.startVisualTransition()
        && lifecycle.revealReward()
        && !lifecycle.revealReward()
        && lifecycle.markVisualTransitionFinished()
        && lifecycle.finish()
        && !lifecycle.finish();
    }),
    check("cleanup prevents pending callbacks from completing the flow", () => {
      const lifecycle = createChestOpeningLifecycle(true);
      lifecycle.startVisualTransition();
      lifecycle.cleanup();
      return lifecycle.getSnapshot().cleaned
        && !lifecycle.revealReward()
        && !lifecycle.markAudioFinished()
        && !lifecycle.markVisualTransitionFinished()
        && !lifecycle.finish();
    }),
    check("the economic chest reward is persisted exactly once", async () => {
      const reward = fantasyItemCatalog.find(
        (item) => item.id === INITIAL_COMPANION_ITEM_ID
      );
      if (!reward) return false;

      let state: StudentChestState = {
        collection: [],
        chests: [{
          id: "deterministic-chest",
          evolution: 1 as const,
          status: "pending" as const,
          obtainedAt: new Date("2026-01-01T10:00:00.000Z"),
        }],
      };
      let persistenceCount = 0;
      const operation = createOpenStudentChest({
        loadState: () => state,
        persistState: (nextState) => {
          persistenceCount += 1;
          state = {
            collection: nextState.collection.map((item) => ({ ...item })),
            chests: nextState.chests.map((chest) => ({ ...chest })),
          };
        },
        catalog: [reward],
        random: { next: () => 0 },
        now: () => new Date("2026-01-01T10:01:00.000Z"),
        selectReward: () => ({
          status: "selected",
          item: reward,
          selectedRarity: reward.rarity,
          primaryRarity: reward.rarity,
          usedFallback: false,
        }),
      });

      const first = await operation.execute();
      const second = await operation.execute();
      return first.status === "opened"
        && second.status === "no-pending-chest"
        && state.collection.length === 1
        && persistenceCount === 1;
    }),
  ]);
}

async function check(
  name: string,
  predicate: () => boolean | Promise<boolean>
): Promise<ChestOpeningLifecycleCheck> {
  try {
    return { name, passed: await predicate() };
  } catch {
    return { name, passed: false };
  }
}
