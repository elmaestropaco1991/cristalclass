import type { Achievement } from "../achievement/Achievement";
import type { Economy } from "../economy/Economy";
import type { Inventory } from "../inventory/Inventory";
import type { Reward } from "../reward/Reward";
import type { EntityId, Timestamp } from "../../shared/types";

export type StudentStatus = "active" | "inactive";

/** Estado canónico futuro del agregado alumno. No sustituye aún al modelo de app/types. */
export interface Student {
  id: EntityId;
  classroomId: EntityId;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  economy: Economy;
  inventory: Inventory;
  achievements: readonly Achievement[];
  rewards: readonly Reward[];
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
