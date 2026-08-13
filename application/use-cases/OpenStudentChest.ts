import {
  collectionContains,
  selectChestReward,
  unlockCollectionItem,
  type ChestRewardSelectionResult,
  type CollectedItem,
  type ItemDefinition,
  type RandomSource,
} from "../../domain";
import type { Evolution } from "../../domain/progression/StudentProgression";

export type StudentChestStatus = "pending" | "closed" | "opened";

export interface StudentChest {
  id: string;
  evolution: Evolution;
  status: StudentChestStatus;
  obtainedAt: Date;
  openedAt?: Date;
  rewardId?: string;
}

export interface StudentChestState {
  collection: readonly CollectedItem[];
  chests: readonly StudentChest[];
}

export interface OpenStudentChestDependencies {
  loadState(): Promise<StudentChestState> | StudentChestState;
  persistState(state: StudentChestState): Promise<void> | void;
  catalog: readonly ItemDefinition[];
  random: RandomSource;
  now(): Date;
  selectReward?(input: {
    chestEvolution: Evolution;
    catalog: readonly ItemDefinition[];
    collection: readonly CollectedItem[];
    random: RandomSource;
  }): ChestRewardSelectionResult;
}

export type OpenStudentChestResult =
  | {
      status: "opened";
      chestId: string;
      itemId: string;
      openedAt: string;
    }
  | {
      status: "no-pending-chest";
    }
  | {
      status: "collection-complete";
      chestId: string;
    }
  | {
      status: "failed";
      reason: string;
    };

export interface OpenStudentChest {
  execute(): Promise<OpenStudentChestResult>;
}

/**
 * Application operation for a single chest. It only invokes persistence after
 * a full replacement state has been calculated and validated in memory.
 */
export function createOpenStudentChest(
  dependencies: OpenStudentChestDependencies
): OpenStudentChest {
  return {
    async execute(): Promise<OpenStudentChestResult> {
      let state: StudentChestState;

      try {
        state = await dependencies.loadState();
      } catch {
        return failed("Unable to load the student chest state.");
      }

      const chest = findOldestPendingChest(state.chests);

      if (!chest) {
        return { status: "no-pending-chest" };
      }

      let rewardSelection: ChestRewardSelectionResult;

      try {
        rewardSelection = (dependencies.selectReward ?? selectChestReward)({
          chestEvolution: chest.evolution,
          catalog: dependencies.catalog,
          collection: state.collection,
          random: dependencies.random,
        });
      } catch {
        return failed("Unable to select a chest reward.");
      }

      if (rewardSelection.status === "collection-complete") {
        return { status: "collection-complete", chestId: chest.id };
      }

      if (!isValidSelectedReward(rewardSelection, dependencies.catalog, state.collection)) {
        return failed("The selected chest reward is invalid or already owned.");
      }

      let openedAt: Date;

      try {
        openedAt = dependencies.now();
      } catch {
        return failed("Unable to create the opening timestamp.");
      }

      if (!isValidDate(openedAt)) {
        return failed("The opening timestamp is invalid.");
      }

      let collectionUpdate;

      try {
        collectionUpdate = unlockCollectionItem({
          collection: state.collection,
          itemId: rewardSelection.item.id,
          unlockedAt: openedAt,
          catalog: dependencies.catalog,
        });
      } catch {
        return failed("Unable to add the selected reward to the collection.");
      }

      if (!collectionUpdate.added) {
        return failed("The selected reward could not be added to the collection.");
      }

      const nextState: StudentChestState = {
        collection: collectionUpdate.collection,
        chests: state.chests.map((currentChest) =>
          currentChest.id === chest.id
            ? {
                ...currentChest,
                status: "opened",
                rewardId: rewardSelection.item.id,
                openedAt: new Date(openedAt.getTime()),
              }
            : currentChest
        ),
      };

      try {
        await dependencies.persistState(nextState);
      } catch {
        return failed("Unable to persist the opened chest state.");
      }

      return {
        status: "opened",
        chestId: chest.id,
        itemId: rewardSelection.item.id,
        openedAt: openedAt.toISOString(),
      };
    },
  };
}

export function findOldestPendingChest(
  chests: readonly StudentChest[]
): StudentChest | undefined {
  return chests.reduce<StudentChest | undefined>((oldest, chest) => {
    if (chest.status !== "pending" && chest.status !== "closed") {
      return oldest;
    }

    if (!oldest || getChestTime(chest) < getChestTime(oldest)) {
      return chest;
    }

    return oldest;
  }, undefined);
}

function isValidSelectedReward(
  selection: Extract<ChestRewardSelectionResult, { status: "selected" }>,
  catalog: readonly ItemDefinition[],
  collection: readonly CollectedItem[]
): boolean {
  const catalogItem = catalog.find((item) => item.id === selection.item.id);

  return Boolean(
    catalogItem &&
      catalogItem.rarity === selection.selectedRarity &&
      catalogItem.id === selection.item.id &&
      !collectionContains(collection, selection.item.id)
  );
}

function getChestTime(chest: StudentChest): number {
  if (!(chest.obtainedAt instanceof Date)) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = chest.obtainedAt.getTime();

  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function failed(reason: string): OpenStudentChestResult {
  return { status: "failed", reason };
}
