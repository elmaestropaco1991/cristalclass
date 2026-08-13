import type { Evolution } from "../progression/StudentProgression";

export const ITEM_CATEGORIES = [
  "head",
  "face",
  "back",
  "hand",
  "companion",
] as const;

export const ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export interface ItemDefinition {
  id: string;
  displayName: string;
  category: ItemCategory;
  rarity: ItemRarity;
  theme: string;
  assetKey: string;
}

export interface CatalogValidationIssue {
  itemId: string | null;
  code:
    | "DUPLICATE_ID"
    | "EMPTY_ID"
    | "EMPTY_DISPLAY_NAME"
    | "EMPTY_THEME"
    | "EMPTY_ASSET_KEY"
    | "INVALID_CATEGORY"
    | "INVALID_RARITY";
}

export interface CatalogValidationResult {
  isValid: boolean;
  issues: readonly CatalogValidationIssue[];
}

export const CHEST_RARITY_WINDOWS: Readonly<Record<Evolution, readonly ItemRarity[]>> = {
  1: ["common"],
  2: ["common", "uncommon"],
  3: ["uncommon", "rare"],
  4: ["rare", "epic"],
  5: ["epic", "legendary"],
};

export function validateItemCatalog(
  catalog: readonly ItemDefinition[]
): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];
  const ids = new Set<string>();

  for (const item of catalog) {
    const itemId = typeof item.id === "string" && item.id.trim() ? item.id : null;

    if (!itemId) {
      issues.push({ itemId: null, code: "EMPTY_ID" });
    } else if (ids.has(itemId)) {
      issues.push({ itemId, code: "DUPLICATE_ID" });
    } else {
      ids.add(itemId);
    }

    if (!hasText(item.displayName)) {
      issues.push({ itemId, code: "EMPTY_DISPLAY_NAME" });
    }

    if (!hasText(item.theme)) {
      issues.push({ itemId, code: "EMPTY_THEME" });
    }

    if (!hasText(item.assetKey)) {
      issues.push({ itemId, code: "EMPTY_ASSET_KEY" });
    }

    if (!ITEM_CATEGORIES.includes(item.category)) {
      issues.push({ itemId, code: "INVALID_CATEGORY" });
    }

    if (!ITEM_RARITIES.includes(item.rarity)) {
      issues.push({ itemId, code: "INVALID_RARITY" });
    }
  }

  return { isValid: issues.length === 0, issues };
}

export function containsCatalogItem(
  catalog: readonly ItemDefinition[],
  itemId: string
): boolean {
  return catalog.some((item) => item.id === itemId);
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
