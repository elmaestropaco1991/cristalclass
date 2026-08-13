import {
  createEmptyCharacterEquipment,
  type ItemDefinition,
} from "../../domain";
import {
  cosmeticPlacementsByItemId,
  cosmeticPreviewsByItemId,
  getCosmeticPlacement,
} from "../data/cosmeticPlacements";
import {
  INITIAL_BACK_ITEM_ID,
  INITIAL_COMPANION_ITEM_ID,
} from "../data/initialStudentInventory";
import { initialStudents } from "../data/students";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import { ensureInitialEquipmentInventory } from "./storageService";
import { buildStudentCollectionView } from "./studentCollectionQueryService";
import { createStudentEquipmentService } from "./studentEquipmentService";
import type { Student } from "../types/student";

export type StudentEquipmentCheck = { name: string; passed: boolean };

const AURA_ASSET = "/avatars/equipment/back/aura-cristales-azules.png";
const BACKPACK_ITEM_ID = "backpack-adventurer";

export async function runStudentEquipmentDeterministicChecks(): Promise<readonly StudentEquipmentCheck[]> {
  const aura = fantasyItemCatalog.find((item) => item.id === INITIAL_BACK_ITEM_ID);
  const dragon = fantasyItemCatalog.find((item) => item.id === INITIAL_COMPANION_ITEM_ID);
  const originalInventory = [
    { itemId: "head-a", unlockedAt: new Date(0) },
    { itemId: BACKPACK_ITEM_ID, unlockedAt: new Date(0) },
  ];
  const hydratedInventory = ensureInitialEquipmentInventory(originalInventory);
  const repeatedlyHydratedInventory = ensureInitialEquipmentInventory(hydratedInventory);
  const noBackpackMigration = ensureInitialEquipmentInventory([{ itemId: "head-a", unlockedAt: new Date(0) }]);
  let students: Student[] = [{
    ...studentWith("head-a", BACKPACK_ITEM_ID, INITIAL_BACK_ITEM_ID, INITIAL_COMPANION_ITEM_ID),
    equipment: { ...createEmptyCharacterEquipment(), head: "head-a", back: BACKPACK_ITEM_ID, companion: INITIAL_COMPANION_ITEM_ID },
  }];
  let saveCount = 0;
  const service = createStudentEquipmentService({
    catalog: [item("head-a", "Sombrero azul", "head"), aura!, dragon!, fantasyItemCatalog.find((item) => item.id === BACKPACK_ITEM_ID)!],
    loadStudents: () => students,
    saveStudents: (nextStudents) => {
      students = nextStudents;
      saveCount += 1;
    },
  });
  const unownedResult = await createStudentEquipmentService({
    catalog: [aura!],
    loadStudents: () => [studentWith()],
    saveStudents: () => undefined,
  }).equipCollectedItemForStudent("student-1", INITIAL_BACK_ITEM_ID);
  const equipAura = await service.equipCollectedItemForStudent("student-1", INITIAL_BACK_ITEM_ID);
  const equipmentAfterAura = students[0].equipment;
  const unequipAura = await service.unequipItemCategoryForStudent("student-1", "back");
  const backCollection = buildStudentCollectionView(
    studentWith(INITIAL_BACK_ITEM_ID),
    fantasyItemCatalog
  ).categories.find((category) => category.category === "back");
  const auraPlacement = getCosmeticPlacement(INITIAL_BACK_ITEM_ID);

  return [
    check("the aura exists in the catalog", () => aura?.id === INITIAL_BACK_ITEM_ID),
    check("the aura category is back", () => aura?.category === "back"),
    check("the aura rarity is rare", () => aura?.rarity === "rare"),
    check("the aura asset route is correct", () => aura?.assetKey === AURA_ASSET),
    check("new students receive the aura exactly once", () => initialStudents.every((student) => student.inventory.filter((entry) => entry.itemId === INITIAL_BACK_ITEM_ID).length === 1)),
    check("new students do not receive the dragon automatically", () => initialStudents.every((student) => !student.inventory.some((entry) => entry.itemId === INITIAL_COMPANION_ITEM_ID))),
    check("hydration adds the aura exactly once", () => hydratedInventory.filter((entry) => entry.itemId === INITIAL_BACK_ITEM_ID).length === 1 && repeatedlyHydratedInventory.length === hydratedInventory.length),
    check("the aura is never equipped automatically", () => initialStudents.every((student) => student.equipment.back === null)),
    check("the back collection query returns the aura", () => backCollection?.collectedCount === 1 && backCollection.items.some((item) => item.itemId === INITIAL_BACK_ITEM_ID && item.status === "collected")),
    check("the aura can only be equipped when owned", () => unownedResult.status === "item-not-collected"),
    check("equipping updates equipment.back", () => equipAura.status === "equipped" && equipmentAfterAura.back === INITIAL_BACK_ITEM_ID),
    check("unequipping clears equipment.back", () => unequipAura.status === "unequipped" && students[0].equipment.back === null),
    check("the aura replaces another back item", () => equipAura.status === "equipped" && equipAura.replacedItemId === BACKPACK_ITEM_ID),
    check("equipping the aura preserves equipment.companion", () => equipmentAfterAura.companion === INITIAL_COMPANION_ITEM_ID && students[0].equipment.companion === INITIAL_COMPANION_ITEM_ID),
    check("aura and dragon can be equipped together", () => equipmentAfterAura.back === INITIAL_BACK_ITEM_ID && equipmentAfterAura.companion === INITIAL_COMPANION_ITEM_ID),
    check("the aura placement has a global fallback", () => cosmeticPlacementsByItemId[INITIAL_BACK_ITEM_ID]?.fallback !== undefined && auraPlacement.anchor === "center" && auraPlacement.width === "88%"),
    check("the aura preview has reusable configuration", () => cosmeticPreviewsByItemId[INITIAL_BACK_ITEM_ID]?.card?.containerSize !== undefined),
    check("the backpack is not added automatically", () => !noBackpackMigration.some((entry) => entry.itemId === BACKPACK_ITEM_ID)),
    check("existing backpack possessions are preserved", () => hydratedInventory.some((entry) => entry.itemId === BACKPACK_ITEM_ID)),
    check("hydration preserves all existing possessions", () => originalInventory.every((entry) => hydratedInventory.some((item) => item.itemId === entry.itemId))),
    check("equipment updates persist", () => saveCount === 2),
  ];
}

function item(id: string, displayName: string, category: ItemDefinition["category"]): ItemDefinition {
  return { id, displayName, category, rarity: "common", theme: "test", assetKey: "/test.png" };
}

function studentWith(...itemIds: string[]): Student {
  return {
    id: "student-1", nombre: "Alumno", apellidos: "Prueba", avatar: { id: "test", theme: "test", level: 1, skin: "default" },
    inventory: itemIds.map((itemId) => ({ itemId, unlockedAt: new Date(0) })), equipment: createEmptyCharacterEquipment(),
    chests: [], chestProgress: 0, claseId: "class-1", numeroLista: 1, cristales: 0, highestCrystalTotal: 0,
    monedas: 0, activo: true, notas: "", fechaCreacion: new Date(0),
  };
}

function check(name: string, predicate: () => boolean): StudentEquipmentCheck {
  try { return { name, passed: predicate() }; } catch { return { name, passed: false }; }
}
