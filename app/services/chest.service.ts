import type { Chest, ChestRarity, ChestSource } from "../types/chest";
import type { InventoryItem, Student } from "../types/student";
import { fantasyCosmetics } from "../themes/fantasy/cosmetics";

export function createChest(
  theme: string,
  rarity: ChestRarity,
  source: ChestSource
): Chest {
  return {
    id: crypto.randomUUID(),
    theme,
    rarity,
    source,
    evolution: 1,
    status: "closed",
    obtainedAt: new Date(),
  };
}

export function giveChest(
  student: Student,
  chest: Chest
): Student {
  return {
    ...student,
    chests: [...student.chests, chest],
  };
}

export function openChest(
  student: Student,
  chestId: string
): Student {
  const chest = student.chests.find(
    (c) => c.id === chestId
  );

  if (!chest || chest.status === "opened" || !chest.rarity || !chest.theme) {
    return student;
  }

  const unlockedIds = student.inventory.map(
    (item) => item.cosmeticId
  );

  const available = fantasyCosmetics.filter(
    (cosmetic) =>
      cosmetic.rarity === chest.rarity &&
      !unlockedIds.includes(cosmetic.id)
  );

  if (available.length === 0) {
    return student;
  }

  const reward =
    available[Math.floor(Math.random() * available.length)];

  const inventoryItem: InventoryItem = {
    id: crypto.randomUUID(),
    theme: chest.theme,
    type: reward.type,
    cosmeticId: reward.id,
    itemId: reward.id,
    unlockedAt: new Date(),
  };

  return {
    ...student,

    inventory: [
      ...student.inventory,
      inventoryItem,
    ],

    chests: student.chests.map((currentChest) =>
      currentChest.id === chest.id
        ? {
            ...currentChest,
            status: "opened",
            openedAt: new Date(),
            rewardId: reward.id,
          }
        : currentChest
    ),
  };
}
