export type { Achievement, AchievementStatus } from "./achievement/Achievement";
export type { AggregateReference, DomainAggregate } from "./aggregates/DomainAggregate";
export type { TeacherCommand } from "./commands/TeacherCommand";
export type { Classroom } from "./classroom/Classroom";
export type { Economy } from "./economy/Economy";
export type { DomainEvent } from "./events/DomainEvent";
export type { Inventory, InventoryItem, InventoryItemKind } from "./inventory/Inventory";
export type { Reward, RewardKind, RewardStatus } from "./reward/Reward";
export type { Student, StudentStatus } from "./student/Student";
export type { ActionModule, ActionModuleContext, ActionModuleResult } from "./modules/ActionModule";
export {
  DEFAULT_PROGRESSION_CONFIG,
  applyCrystalChange,
  calculateStudentProgression,
  createProgressionConfig,
  validateProgressionConfig,
} from "./progression/StudentProgression";
export {
  DEFAULT_CHEST_PROGRESSION_CONFIG,
  createChestProgressionConfig,
  normalizeChestProgress,
  processChestProgress,
  validateChestProgressionConfig,
} from "./progression/ChestProgression";
export type {
  CrystalChange,
  CrystalChangeInput,
  Evolution,
  ProgressionConfig,
  StudentProgression,
  StudentProgressionInput,
} from "./progression/StudentProgression";
export type {
  ChestProgressionConfig,
  ChestProgressionInput,
  ChestProgressionResult,
} from "./progression/ChestProgression";
export {
  CHEST_RARITY_WINDOWS,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  containsCatalogItem,
  validateItemCatalog,
} from "./collection/ItemCatalog";
export {
  collectionContains,
  normalizeCollection,
  unlockCollectionItem,
} from "./collection/Collection";
export { selectChestReward } from "./collection/ChestRewardSelection";
export {
  createEmptyCharacterEquipment,
  equipCollectedItem,
  getEquippedItem,
  isEquipableItemCategory,
  normalizeCharacterEquipment,
  unequipItemCategory,
  validateCharacterEquipment,
} from "./collection/CharacterEquipment";
export type {
  CatalogValidationIssue,
  CatalogValidationResult,
  ItemCategory,
  ItemDefinition,
  ItemRarity,
} from "./collection/ItemCatalog";
export type {
  CollectedItem,
  LegacyCollectionEntry,
  UnlockCollectionItemInput,
  UnlockCollectionItemResult,
} from "./collection/Collection";
export type {
  ChestRewardSelectionInput,
  ChestRewardSelectionResult,
  RandomSource,
} from "./collection/ChestRewardSelection";
export type {
  CharacterEquipment,
  EquipCollectedItemDomainResult,
  EquipableItemCategory,
  EquipmentValidationIssue,
  UnequipItemCategoryDomainResult,
} from "./collection/CharacterEquipment";
