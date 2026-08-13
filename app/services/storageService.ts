import type { Chest } from "../types/chest";
import type { Avatar, InventoryItem, Student } from "../types/student";
import {
  DEFAULT_CHEST_PROGRESSION_CONFIG,
  normalizeChestProgress,
} from "../../domain/progression/ChestProgression";
import {
  DEFAULT_PROGRESSION_CONFIG,
  calculateStudentProgression,
} from "../../domain/progression/StudentProgression";
import { normalizeCollection } from "../../domain/collection/Collection";
import { normalizeCharacterEquipment } from "../../domain/collection/CharacterEquipment";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import { isFullBodyAvatarId } from "../data/fullBodyAvatars";
import {
  ensureInitialEquipmentInventory,
  INITIAL_BACK_ITEM_ID,
  INITIAL_COMPANION_ITEM_ID,
} from "../data/initialStudentInventory";

const STORAGE_KEY = "cristalclass_students";
export {
  INITIAL_BACK_ITEM_ID,
  INITIAL_COMPANION_ITEM_ID,
} from "../data/initialStudentInventory";

const DEFAULT_AVATAR: Avatar = {
  id: "explorer01",
  theme: "fantasy",
  level: 1,
  skin: "default",
};

type StoredChest = Omit<Chest, "obtainedAt" | "openedAt" | "evolution"> & {
  obtainedAt: Date | string;
  openedAt?: Date | string;
  evolution?: Chest["evolution"];
};

type StoredInventoryItem = Omit<InventoryItem, "itemId" | "unlockedAt"> & {
  itemId?: string;
  cosmeticId?: string;
  unlockedAt?: Date | string;
};

type StoredStudent = Omit<Student, "avatar" | "inventory" | "chests" | "fechaCreacion" | "highestCrystalTotal" | "chestProgress" | "equipment"> & {
  avatar?: Avatar | string;
  inventory?: StoredInventoryItem[];
  chests?: StoredChest[];
  fechaCreacion?: Date | string;
  highestCrystalTotal?: number;
  chestProgress?: number;
  equipment?: unknown;
};

function isAvatar(value: unknown): value is Avatar {
  return typeof value === "object" && value !== null && "id" in value && "theme" in value;
}

function hydrateStudent({ fullBodyAvatarId, ...student }: StoredStudent): Student {
  const highestCrystalTotal = Math.max(
    0,
    student.cristales,
    student.highestCrystalTotal ?? student.cristales
  );
  const fallbackChestEvolution = calculateStudentProgression({
    crystals: student.cristales,
    highestCrystalTotal,
    config: DEFAULT_PROGRESSION_CONFIG,
  }).evolution;
  const hydratedInventory = hydrateInventory(student.inventory ?? []);
  const hasEarnedInitialDragon = (student.chests ?? []).some(
    (chest) => chest.status === "opened" && chest.rewardId === INITIAL_COMPANION_ITEM_ID
  );
  const inventory = ensureInitialEquipmentInventory(
    hasEarnedInitialDragon
      ? hydratedInventory
      : hydratedInventory.filter((item) => !isLegacyBootstrapDragon(item))
  );
  const storedEquipment = hasEarnedInitialDragon
    ? student.equipment
    : removeLegacyBootstrapDragonEquipment(student.equipment);

  return {
    ...student,
    avatar: isAvatar(student.avatar) ? student.avatar : DEFAULT_AVATAR,
    ...(isFullBodyAvatarId(fullBodyAvatarId) ? { fullBodyAvatarId } : {}),
    inventory,
    equipment: normalizeCharacterEquipment(storedEquipment, {
      catalog: fantasyItemCatalog,
      collection: inventory,
    }),
    chests: (student.chests ?? []).map(({ obtainedAt, openedAt, ...chest }) => ({
      ...chest,
      evolution: chest.evolution ?? fallbackChestEvolution,
      obtainedAt: new Date(obtainedAt),
      ...(openedAt ? { openedAt: new Date(openedAt) } : {}),
    })),
    chestProgress: normalizeChestProgress(
      student.chestProgress,
      DEFAULT_CHEST_PROGRESSION_CONFIG
    ),
    highestCrystalTotal,
    monedas: student.monedas ?? 0,
    fechaCreacion: new Date(student.fechaCreacion ?? Date.now()),
  };
}

function isLegacyBootstrapDragon(item: InventoryItem): boolean {
  return item.itemId === INITIAL_COMPANION_ITEM_ID && item.unlockedAt.getTime() === 0;
}

function removeLegacyBootstrapDragonEquipment(equipment: unknown): unknown {
  if (typeof equipment !== "object" || equipment === null) return equipment;

  const record = equipment as Record<string, unknown>;
  return record.companion === INITIAL_COMPANION_ITEM_ID
    ? { ...record, companion: null }
    : equipment;
}

function hydrateInventory(inventory: readonly StoredInventoryItem[]): InventoryItem[] {
  return normalizeCollection(inventory).map((entry) => {
    const legacyItem = inventory.find(
      (item) => item.itemId === entry.itemId || item.cosmeticId === entry.itemId
    );

    return {
      ...legacyItem,
      id: legacyItem?.id ?? entry.itemId,
      cosmeticId: legacyItem?.cosmeticId ?? entry.itemId,
      itemId: entry.itemId,
      unlockedAt: entry.unlockedAt,
    };
  });
}

export { ensureInitialEquipmentInventory } from "../data/initialStudentInventory";

export function loadStudents(): Student[] | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return null;

  try {
    const storedStudents = JSON.parse(data) as StoredStudent[];
    const students = storedStudents.map(hydrateStudent);
    if (storedStudents.some((student) => !ownsInitialEquipment(student.inventory ?? []))) {
      saveStudents(students);
    }
    return students;
  } catch {
    return null;
  }
}

export function saveStudents(alumnos: Student[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(alumnos)
  );
}

export function clearStudents() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}

function ownsInitialEquipment(inventory: readonly StoredInventoryItem[]): boolean {
  return inventory.some(
    (item) => item.itemId === INITIAL_BACK_ITEM_ID || item.cosmeticId === INITIAL_BACK_ITEM_ID
  );
}
