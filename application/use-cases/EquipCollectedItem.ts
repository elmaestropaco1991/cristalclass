import {
  equipCollectedItem,
  type CharacterEquipment,
  type CollectedItem,
  type EquipableItemCategory,
  type ItemDefinition,
} from "../../domain";

export interface StudentEquipmentState {
  collection: readonly CollectedItem[];
  equipment: CharacterEquipment;
}

export interface EquipCollectedItemDependencies {
  loadState(): Promise<StudentEquipmentState> | StudentEquipmentState;
  persistState(state: StudentEquipmentState): Promise<void> | void;
  catalog: readonly ItemDefinition[];
}

export type EquipCollectedItemResult =
  | {
      status: "equipped";
      itemId: string;
      category: EquipableItemCategory;
      replacedItemId: string | null;
    }
  | {
      status: "already-equipped";
      itemId: string;
      category: EquipableItemCategory;
    }
  | {
      status: "item-not-collected";
      itemId: string;
    }
  | {
      status: "item-not-found";
      itemId: string;
    }
  | {
      status: "invalid-category";
      itemId: string;
    }
  | {
      status: "failed";
      reason: string;
    };

export interface EquipCollectedItem {
  execute(itemId: string): Promise<EquipCollectedItemResult>;
}

export function createEquipCollectedItem(
  dependencies: EquipCollectedItemDependencies
): EquipCollectedItem {
  return {
    async execute(itemId): Promise<EquipCollectedItemResult> {
      let state: StudentEquipmentState;

      try {
        state = await dependencies.loadState();
      } catch {
        return failed("Unable to load the student equipment state.");
      }

      const result = equipCollectedItem({
        equipment: state.equipment,
        itemId,
        catalog: dependencies.catalog,
        collection: state.collection,
      });

      if (result.status !== "equipped") {
        return result;
      }

      try {
        await dependencies.persistState({
          collection: state.collection,
          equipment: result.equipment,
        });
      } catch {
        return failed("Unable to persist the equipped item.");
      }

      return result;
    },
  };
}

function failed(reason: string): EquipCollectedItemResult {
  return { status: "failed", reason };
}
