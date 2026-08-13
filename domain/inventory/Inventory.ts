import type { EntityId, Timestamp } from "../../shared/types";

export type InventoryItemKind =
  | "pet"
  | "background"
  | "aura"
  | "skin"
  | "badge";

export interface InventoryItem {
  id: EntityId;
  definitionId: string;
  themeId: string;
  kind: InventoryItemKind;
  acquiredAt: Timestamp;
}

export interface Inventory {
  items: readonly InventoryItem[];
  updatedAt: Timestamp;
}
