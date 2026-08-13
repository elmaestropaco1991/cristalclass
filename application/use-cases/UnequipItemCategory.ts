import {
  unequipItemCategory,
  type CharacterEquipment,
  type CollectedItem,
  type EquipableItemCategory,
} from "../../domain";

export interface UnequipItemCategoryDependencies {
  loadState(): Promise<{ collection: readonly CollectedItem[]; equipment: CharacterEquipment }> | { collection: readonly CollectedItem[]; equipment: CharacterEquipment };
  persistState(state: { collection: readonly CollectedItem[]; equipment: CharacterEquipment }): Promise<void> | void;
}

export type UnequipItemCategoryResult =
  | {
      status: "unequipped";
      category: EquipableItemCategory;
      previousItemId: string;
    }
  | {
      status: "already-empty";
      category: EquipableItemCategory;
    }
  | {
      status: "failed";
      reason: string;
    };

export interface UnequipItemCategory {
  execute(category: string): Promise<UnequipItemCategoryResult>;
}

export function createUnequipItemCategory(
  dependencies: UnequipItemCategoryDependencies
): UnequipItemCategory {
  return {
    async execute(category): Promise<UnequipItemCategoryResult> {
      let state: { collection: readonly CollectedItem[]; equipment: CharacterEquipment };

      try {
        state = await dependencies.loadState();
      } catch {
        return failed("Unable to load the student equipment state.");
      }

      const result = unequipItemCategory(state.equipment, category);

      if (result.status === "invalid-category") {
        return failed("The item category is invalid.");
      }

      if (result.status === "already-empty") {
        return result;
      }

      try {
        await dependencies.persistState({
          collection: state.collection,
          equipment: result.equipment,
        });
      } catch {
        return failed("Unable to persist the equipment state.");
      }

      return result;
    },
  };
}

function failed(reason: string): UnequipItemCategoryResult {
  return { status: "failed", reason };
}
