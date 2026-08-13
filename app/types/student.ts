import type { CollectedItem } from "../../domain/collection/Collection";
import type { CharacterEquipment } from "../../domain/collection/CharacterEquipment";
import type { Chest } from "./chest";

export type Avatar = {
  id: string;
  theme: string;
  /** Legacy display field pending avatar-progression migration; it is not a progression source of truth. */
  level: number;
  skin: string;
};

export type InventoryItemType =
  | "pet"
  | "background"
  | "aura"
  | "skin"
  | "badge";

/** The persisted inventory is the temporary container for the student's collection. */
export type InventoryItem = CollectedItem & {
  /** Compatibility fields used by the current UI and legacy stored records. */
  id?: string;
  theme?: string;
  type?: InventoryItemType;
  cosmeticId?: string;
};

export type Student = {
  id: string;
  nombre: string;
  apellidos: string;
  avatar: Avatar;
  /** Optional full-body avatar used only by the central student profile. */
  fullBodyAvatarId?: string;
  inventory: InventoryItem[];
  /** Active collection items by category; ownership remains in inventory. */
  equipment: CharacterEquipment;
  chests: Chest[];
  /** Internal progress towards the next chest; it is intentionally not displayed. */
  chestProgress: number;
  email?: string;
  claseId: string;
  numeroLista: number;
  cristales: number;
  /** Maximum crystal balance ever reached; it keeps unlocked evolutions permanent. */
  highestCrystalTotal: number;
  monedas: number;
  activo: boolean;
  notas: string;
  fechaCreacion: Date;
};
