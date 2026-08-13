import { containsCatalogItem, type ItemDefinition } from "./ItemCatalog";

export interface CollectedItem {
  itemId: string;
  unlockedAt: Date;
}

export interface LegacyCollectionEntry {
  itemId?: unknown;
  cosmeticId?: unknown;
  unlockedAt?: unknown;
}

export interface UnlockCollectionItemInput {
  collection: readonly CollectedItem[];
  itemId: string;
  unlockedAt: Date;
  catalog: readonly ItemDefinition[];
}

export interface UnlockCollectionItemResult {
  added: boolean;
  alreadyUnlocked: boolean;
  collection: readonly CollectedItem[];
}

export function collectionContains(
  collection: readonly CollectedItem[],
  itemId: string
): boolean {
  return collection.some((item) => item.itemId === itemId);
}

export function unlockCollectionItem({
  collection,
  itemId,
  unlockedAt,
  catalog,
}: UnlockCollectionItemInput): UnlockCollectionItemResult {
  const normalizedCollection = normalizeCollection(collection);

  if (!containsCatalogItem(catalog, itemId)) {
    return {
      added: false,
      alreadyUnlocked: false,
      collection: normalizedCollection,
    };
  }

  if (collectionContains(normalizedCollection, itemId)) {
    return {
      added: false,
      alreadyUnlocked: true,
      collection: normalizedCollection,
    };
  }

  return {
    added: true,
    alreadyUnlocked: false,
    collection: [...normalizedCollection, { itemId, unlockedAt: normalizeDate(unlockedAt) }],
  };
}

export function normalizeCollection(
  collection: readonly LegacyCollectionEntry[]
): CollectedItem[] {
  const entriesByItemId = new Map<string, CollectedItem>();

  for (const entry of collection) {
    const itemId = normalizeItemId(entry.itemId) ?? normalizeItemId(entry.cosmeticId);

    if (!itemId) {
      continue;
    }

    const normalizedEntry = {
      itemId,
      unlockedAt: normalizeDate(entry.unlockedAt),
    };
    const currentEntry = entriesByItemId.get(itemId);

    if (!currentEntry || normalizedEntry.unlockedAt < currentEntry.unlockedAt) {
      entriesByItemId.set(itemId, normalizedEntry);
    }
  }

  return [...entriesByItemId.values()];
}

function normalizeItemId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeDate(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));

  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
