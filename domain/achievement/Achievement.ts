import type { EntityId, Timestamp } from "../../shared/types";

export type AchievementStatus = "locked" | "unlocked";

export interface Achievement {
  id: EntityId;
  definitionId: string;
  status: AchievementStatus;
  progress: number;
  target: number;
  unlockedAt?: Timestamp;
}
