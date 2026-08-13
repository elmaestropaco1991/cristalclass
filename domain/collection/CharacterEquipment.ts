import { collectionContains, type CollectedItem } from "./Collection";
import {
  ITEM_CATEGORIES,
  type ItemCategory,
  type ItemDefinition,
} from "./ItemCatalog";

export type EquipableItemCategory = ItemCategory;

export interface CharacterEquipment {
  head: string | null;
  face: string | null;
  back: string | null;
  hand: string | null;
  companion: string | null;
}

export interface EquipmentValidationIssue {
  category: EquipableItemCategory;
  itemId: string;
  code: "ITEM_NOT_FOUND" | "ITEM_NOT_COLLECTED" | "CATEGORY_MISMATCH";
}

export type EquipCollectedItemDomainResult =
  | {
      status: "equipped";
      itemId: string;
      category: EquipableItemCategory;
      replacedItemId: string | null;
      equipment: CharacterEquipment;
    }
  | {
      status: "already-equipped";
      itemId: string;
      category: EquipableItemCategory;
      equipment: CharacterEquipment;
    }
  | {
      status: "item-not-collected";
      itemId: string;
      equipment: CharacterEquipment;
    }
  | {
      status: "item-not-found";
      itemId: string;
      equipment: CharacterEquipment;
    }
  | {
      status: "invalid-category";
      itemId: string;
      equipment: CharacterEquipment;
    };

export type UnequipItemCategoryDomainResult =
  | {
      status: "unequipped";
      category: EquipableItemCategory;
      previousItemId: string;
      equipment: CharacterEquipment;
    }
  | {
      status: "already-empty";
      category: EquipableItemCategory;
      equipment: CharacterEquipment;
    }
  | {
      status: "invalid-category";
      equipment: CharacterEquipment;
    };

export function createEmptyCharacterEquipment(): CharacterEquipment {
  return {
    head: null,
    face: null,
    back: null,
    hand: null,
    companion: null,
  };
}

export function normalizeCharacterEquipment(
  value: unknown,
  context?: {
    catalog: readonly ItemDefinition[];
    collection: readonly CollectedItem[];
  }
): CharacterEquipment {
  const source = isRecord(value) ? value : {};

  return ITEM_CATEGORIES.reduce<CharacterEquipment>((equipment, category) => {
    const itemId = source[category];

    equipment[category] = isValidEquipmentItem(itemId, category, context)
      ? itemId
      : null;
    return equipment;
  }, createEmptyCharacterEquipment());
}

export function validateCharacterEquipment(
  equipment: CharacterEquipment,
  catalog: readonly ItemDefinition[],
  collection: readonly CollectedItem[]
): readonly EquipmentValidationIssue[] {
  const normalizedEquipment = normalizeCharacterEquipment(equipment, { catalog, collection });
  const issues: EquipmentValidationIssue[] = [];

  for (const category of ITEM_CATEGORIES) {
    const itemId = normalizedEquipment[category];

    if (!itemId) {
      continue;
    }

    const item = catalog.find((candidate) => candidate.id === itemId);

    if (!item) {
      issues.push({ category, itemId, code: "ITEM_NOT_FOUND" });
    } else if (!collectionContains(collection, itemId)) {
      issues.push({ category, itemId, code: "ITEM_NOT_COLLECTED" });
    } else if (item.category !== category) {
      issues.push({ category, itemId, code: "CATEGORY_MISMATCH" });
    }
  }

  return issues;
}

export function getEquippedItem(
  equipment: CharacterEquipment,
  category: EquipableItemCategory
): string | null {
  return normalizeCharacterEquipment(equipment)[category];
}

export function equipCollectedItem({
  equipment,
  itemId,
  catalog,
  collection,
}: {
  equipment: CharacterEquipment;
  itemId: string;
  catalog: readonly ItemDefinition[];
  collection: readonly CollectedItem[];
}): EquipCollectedItemDomainResult {
  const normalizedEquipment = normalizeCharacterEquipment(equipment, { catalog, collection });
  const item = catalog.find((candidate) => candidate.id === itemId);

  if (!item) {
    return { status: "item-not-found", itemId, equipment: normalizedEquipment };
  }

  if (!isEquipableItemCategory(item.category)) {
    return { status: "invalid-category", itemId, equipment: normalizedEquipment };
  }

  if (!collectionContains(collection, itemId)) {
    return { status: "item-not-collected", itemId, equipment: normalizedEquipment };
  }

  const category = item.category;
  const replacedItemId = normalizedEquipment[category];

  if (replacedItemId === itemId) {
    return {
      status: "already-equipped",
      itemId,
      category,
      equipment: normalizedEquipment,
    };
  }

  return {
    status: "equipped",
    itemId,
    category,
    replacedItemId,
    equipment: { ...normalizedEquipment, [category]: itemId },
  };
}

export function unequipItemCategory(
  equipment: CharacterEquipment,
  category: string
): UnequipItemCategoryDomainResult {
  const normalizedEquipment = normalizeCharacterEquipment(equipment);

  if (!isEquipableItemCategory(category)) {
    return { status: "invalid-category", equipment: normalizedEquipment };
  }

  const previousItemId = normalizedEquipment[category];

  if (!previousItemId) {
    return { status: "already-empty", category, equipment: normalizedEquipment };
  }

  return {
    status: "unequipped",
    category,
    previousItemId,
    equipment: { ...normalizedEquipment, [category]: null },
  };
}

export function isEquipableItemCategory(value: unknown): value is EquipableItemCategory {
  return typeof value === "string" && ITEM_CATEGORIES.includes(value as EquipableItemCategory);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidEquipmentItem(
  itemId: unknown,
  category: EquipableItemCategory,
  context: { catalog: readonly ItemDefinition[]; collection: readonly CollectedItem[] } | undefined
): itemId is string {
  if (typeof itemId !== "string" || !itemId.trim() || !context) {
    return typeof itemId === "string" && itemId.trim().length > 0 && !context;
  }

  const item = context.catalog.find((candidate) => candidate.id === itemId);

  return Boolean(item && item.category === category && collectionContains(context.collection, itemId));
}
