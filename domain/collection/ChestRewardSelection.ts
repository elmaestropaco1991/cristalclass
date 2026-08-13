import type { CollectedItem } from "./Collection";
import {
  CHEST_RARITY_WINDOWS,
  ITEM_RARITIES,
  validateItemCatalog,
  type ItemCategory,
  type ItemDefinition,
  type ItemRarity,
} from "./ItemCatalog";
import type { Evolution } from "../progression/StudentProgression";

export interface RandomSource {
  next(): number;
}

export interface ChestRewardSelectionInput {
  chestEvolution: Evolution;
  catalog: readonly ItemDefinition[];
  collection: readonly CollectedItem[];
  random: RandomSource;
}

export type ChestRewardSelectionResult =
  | {
      status: "selected";
      item: ItemDefinition;
      selectedRarity: ItemRarity;
      primaryRarity: ItemRarity;
      usedFallback: boolean;
    }
  | {
      status: "collection-complete";
    };

const PRIMARY_RARITY_PROBABILITY = 0.7;

export function selectChestReward({
  chestEvolution,
  catalog,
  collection,
  random,
}: ChestRewardSelectionInput): ChestRewardSelectionResult {
  validateChestEvolution(chestEvolution);
  validateCatalog(catalog);

  const ownedItemIds = new Set(collection.map((item) => item.itemId));
  const availableItems = catalog.filter((item) => !ownedItemIds.has(item.id));

  if (availableItems.length === 0) {
    return { status: "collection-complete" };
  }

  const primaryRarity = selectPrimaryRarity(chestEvolution, random);
  const raritySearchOrder = createRaritySearchOrder(chestEvolution, primaryRarity);
  const categoryCounts = countOwnedCatalogCategories(catalog, ownedItemIds);

  for (const rarity of raritySearchOrder) {
    const item = selectBalancedItem(availableItems, rarity, categoryCounts, random);

    if (item) {
      return {
        status: "selected",
        item,
        selectedRarity: rarity,
        primaryRarity,
        usedFallback: rarity !== primaryRarity,
      };
    }
  }

  return { status: "collection-complete" };
}

function validateChestEvolution(evolution: Evolution): void {
  if (!Number.isInteger(evolution) || evolution < 1 || evolution > 5) {
    throw new RangeError("Chest evolution must be between 1 and 5.");
  }
}

function validateCatalog(catalog: readonly ItemDefinition[]): void {
  const validation = validateItemCatalog(catalog);

  if (!validation.isValid) {
    throw new RangeError("Chest reward selection requires a valid item catalog.");
  }
}

function selectPrimaryRarity(evolution: Evolution, random: RandomSource): ItemRarity {
  const rarityWindow = CHEST_RARITY_WINDOWS[evolution];

  if (rarityWindow.length === 1) {
    return rarityWindow[0];
  }

  const higherRarity = rarityWindow[1];
  const lowerRarity = rarityWindow[0];

  return nextRandom(random) < PRIMARY_RARITY_PROBABILITY
    ? higherRarity
    : lowerRarity;
}

function createRaritySearchOrder(
  evolution: Evolution,
  primaryRarity: ItemRarity
): ItemRarity[] {
  const normalWindow = CHEST_RARITY_WINDOWS[evolution];
  const secondaryRarity = normalWindow.find((rarity) => rarity !== primaryRarity);
  const expandedRarities = ITEM_RARITIES
    .filter((rarity) => !normalWindow.includes(rarity))
    .sort((left, right) => compareRarityDistance(left, right, primaryRarity));

  return [primaryRarity, ...(secondaryRarity ? [secondaryRarity] : []), ...expandedRarities];
}

function compareRarityDistance(
  left: ItemRarity,
  right: ItemRarity,
  primaryRarity: ItemRarity
): number {
  const primaryIndex = ITEM_RARITIES.indexOf(primaryRarity);
  const leftIndex = ITEM_RARITIES.indexOf(left);
  const rightIndex = ITEM_RARITIES.indexOf(right);
  const distanceDifference = Math.abs(leftIndex - primaryIndex) - Math.abs(rightIndex - primaryIndex);

  return distanceDifference || leftIndex - rightIndex;
}

function countOwnedCatalogCategories(
  catalog: readonly ItemDefinition[],
  ownedItemIds: ReadonlySet<string>
): Readonly<Record<ItemCategory, number>> {
  const counts: Record<ItemCategory, number> = {
    head: 0,
    face: 0,
    back: 0,
    hand: 0,
    companion: 0,
  };

  for (const item of catalog) {
    if (ownedItemIds.has(item.id)) {
      counts[item.category] += 1;
    }
  }

  return counts;
}

function selectBalancedItem(
  availableItems: readonly ItemDefinition[],
  rarity: ItemRarity,
  categoryCounts: Readonly<Record<ItemCategory, number>>,
  random: RandomSource
): ItemDefinition | undefined {
  const candidates = availableItems.filter((item) => item.rarity === rarity);

  if (candidates.length === 0) {
    return undefined;
  }

  const lowestCategoryCount = Math.min(
    ...candidates.map((item) => categoryCounts[item.category])
  );
  const balancedCandidates = candidates.filter(
    (item) => categoryCounts[item.category] === lowestCategoryCount
  );

  return balancedCandidates[Math.floor(nextRandom(random) * balancedCandidates.length)];
}

function nextRandom(random: RandomSource): number {
  const value = random.next();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("RandomSource must return a finite value greater than or equal to 0 and less than 1.");
  }

  return value;
}
