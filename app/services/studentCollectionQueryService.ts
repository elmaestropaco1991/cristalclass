import {
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  type ItemCategory,
  type ItemDefinition,
  type ItemRarity,
} from "../../domain";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import type { InventoryItem, Student } from "../types/student";
import { loadStudents } from "./storageService";

export type CollectionItemStatus = "equipped" | "collected" | "locked";

export type VisibleCollectedCollectionItem = {
  status: "equipped" | "collected";
  itemId: string;
  displayName: string;
  category: ItemCategory;
  rarity: ItemRarity;
  theme: string;
  assetKey: string;
  unlockedAt: string;
};

export type VisibleLockedCollectionItem = {
  status: "locked";
  itemId: string;
  category: ItemCategory;
};

export type VisibleCollectionItem =
  | VisibleCollectedCollectionItem
  | VisibleLockedCollectionItem;

export type StudentCollectionCategoryView = {
  category: ItemCategory;
  equippedItemId: string | null;
  collectedCount: number;
  totalCount: number;
  items: readonly VisibleCollectionItem[];
};

export type StudentCollectionView = {
  studentId: string;
  studentName: string;
  categories: readonly StudentCollectionCategoryView[];
  collectedCount: number;
  totalCount: number;
};

export type StudentCollectionQueryResult =
  | {
      status: "ready";
      view: StudentCollectionView;
    }
  | {
      status: "student-not-found";
      studentId: string;
    }
  | {
      status: "failed";
      reason: string;
    };

export interface StudentCollectionQueryServiceDependencies {
  loadStudents(): Student[] | null;
  catalog: readonly ItemDefinition[];
}

export interface StudentCollectionQueryService {
  getStudentCollectionView(studentId: string): StudentCollectionQueryResult;
}

export function createStudentCollectionQueryService(
  dependencies: StudentCollectionQueryServiceDependencies
): StudentCollectionQueryService {
  return {
    getStudentCollectionView(studentId) {
      const students = loadCurrentStudents(dependencies);

      if (!students) {
        return { status: "failed", reason: "Unable to load students." };
      }

      const student = students.find((candidate) => candidate.id === studentId);

      if (!student) {
        return { status: "student-not-found", studentId };
      }

      return {
        status: "ready",
        view: buildStudentCollectionView(student, dependencies.catalog),
      };
    },
  };
}

export function getStudentCollectionView(studentId: string): StudentCollectionQueryResult {
  return createProductionService().getStudentCollectionView(studentId);
}

export function buildStudentCollectionView(
  student: Student,
  catalog: readonly ItemDefinition[]
): StudentCollectionView {
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const ownedItems = getKnownOwnedItems(student.inventory, catalogById);
  const equippedItems = getValidEquippedItems(student, catalogById, ownedItems);

  const categories = ITEM_CATEGORIES.map((category) =>
    buildCategoryView(category, catalog, ownedItems, equippedItems)
  );

  return {
    studentId: student.id,
    studentName: [student.nombre, student.apellidos].filter(Boolean).join(" "),
    categories,
    collectedCount: categories.reduce((total, category) => total + category.collectedCount, 0),
    totalCount: categories.reduce((total, category) => total + category.totalCount, 0),
  };
}

function createProductionService(): StudentCollectionQueryService {
  return createStudentCollectionQueryService({
    loadStudents,
    catalog: fantasyItemCatalog,
  });
}

function loadCurrentStudents(
  dependencies: StudentCollectionQueryServiceDependencies
): Student[] | undefined {
  try {
    return dependencies.loadStudents() ?? [];
  } catch {
    return undefined;
  }
}

function getKnownOwnedItems(
  inventory: readonly InventoryItem[],
  catalogById: ReadonlyMap<string, ItemDefinition>
): ReadonlyMap<string, InventoryItem> {
  const ownedItems = new Map<string, InventoryItem>();

  for (const inventoryItem of inventory) {
    if (catalogById.has(inventoryItem.itemId) && !ownedItems.has(inventoryItem.itemId)) {
      ownedItems.set(inventoryItem.itemId, inventoryItem);
    }
  }

  return ownedItems;
}

function getValidEquippedItems(
  student: Student,
  catalogById: ReadonlyMap<string, ItemDefinition>,
  ownedItems: ReadonlyMap<string, InventoryItem>
): ReadonlyMap<ItemCategory, string> {
  const equippedItems = new Map<ItemCategory, string>();

  for (const category of ITEM_CATEGORIES) {
    const itemId = student.equipment?.[category];
    const item = itemId ? catalogById.get(itemId) : undefined;

    if (item && item.category === category && ownedItems.has(item.id)) {
      equippedItems.set(category, item.id);
    }
  }

  return equippedItems;
}

function buildCategoryView(
  category: ItemCategory,
  catalog: readonly ItemDefinition[],
  ownedItems: ReadonlyMap<string, InventoryItem>,
  equippedItems: ReadonlyMap<ItemCategory, string>
): StudentCollectionCategoryView {
  const items = catalog
    .map((item, catalogIndex) => ({ item, catalogIndex }))
    .filter(({ item }) => item.category === category)
    .map(({ item, catalogIndex }) =>
      toVisibleItem(item, catalogIndex, ownedItems, equippedItems.get(category))
    )
    .sort(compareVisibleItems)
    .map(({ visibleItem }) => visibleItem);

  return {
    category,
    equippedItemId: equippedItems.get(category) ?? null,
    collectedCount: items.filter((item) => item.status !== "locked").length,
    totalCount: items.length,
    items,
  };
}

function toVisibleItem(
  item: ItemDefinition,
  catalogIndex: number,
  ownedItems: ReadonlyMap<string, InventoryItem>,
  equippedItemId: string | undefined
): SortableVisibleItem {
  const inventoryItem = ownedItems.get(item.id);

  if (!inventoryItem) {
    return {
      catalogIndex,
      visibleItem: { status: "locked", itemId: item.id, category: item.category },
    };
  }

  return {
    catalogIndex,
    visibleItem: {
      status: equippedItemId === item.id ? "equipped" : "collected",
      itemId: item.id,
      displayName: item.displayName,
      category: item.category,
      rarity: item.rarity,
      theme: item.theme,
      assetKey: item.assetKey,
      unlockedAt: inventoryItem.unlockedAt.toISOString(),
    },
  };
}

type SortableVisibleItem = {
  catalogIndex: number;
  visibleItem: VisibleCollectionItem;
};

function compareVisibleItems(left: SortableVisibleItem, right: SortableVisibleItem): number {
  const statusComparison = statusRank(left.visibleItem.status) - statusRank(right.visibleItem.status);

  if (statusComparison !== 0) {
    return statusComparison;
  }

  if (left.visibleItem.status === "locked" || right.visibleItem.status === "locked") {
    return left.catalogIndex - right.catalogIndex || compareText(left.visibleItem.itemId, right.visibleItem.itemId);
  }

  return (
    rarityRank(left.visibleItem.rarity) - rarityRank(right.visibleItem.rarity) ||
    compareText(left.visibleItem.displayName, right.visibleItem.displayName) ||
    compareText(left.visibleItem.itemId, right.visibleItem.itemId)
  );
}

function statusRank(status: CollectionItemStatus): number {
  return status === "equipped" ? 0 : status === "collected" ? 1 : 2;
}

function rarityRank(rarity: ItemRarity): number {
  return ITEM_RARITIES.indexOf(rarity);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
