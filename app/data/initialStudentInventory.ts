import type { InventoryItem } from "../types/student";

export const INITIAL_COMPANION_ITEM_ID = "green-crystal-dragon";
export const INITIAL_BACK_ITEM_ID = "blue-crystal-aura";

const INITIAL_EQUIPMENT_ITEM_IDS = [
  INITIAL_BACK_ITEM_ID,
] as const;

export function createInitialStudentInventory(): InventoryItem[] {
  return INITIAL_EQUIPMENT_ITEM_IDS.map(createInitialInventoryItem);
}

/** Adds the initial reusable equipment while preserving every existing possession. */
export function ensureInitialEquipmentInventory(
  inventory: readonly InventoryItem[]
): InventoryItem[] {
  return INITIAL_EQUIPMENT_ITEM_IDS.reduce<InventoryItem[]>(
    (nextInventory, itemId) => nextInventory.some((item) => item.itemId === itemId)
      ? nextInventory
      : [...nextInventory, createInitialInventoryItem(itemId)],
    [...inventory]
  );
}

function createInitialInventoryItem(itemId: string): InventoryItem {
  return {
    id: itemId,
    cosmeticId: itemId,
    itemId,
    unlockedAt: new Date(0),
  };
}
