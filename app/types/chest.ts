import type { Evolution } from "../../domain/progression/StudentProgression";

export type ChestRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

export type ChestStatus =
  | "pending"
  /** Legacy value kept while prior chest records remain supported. */
  | "closed"
  | "opened";

export type ChestSource =
  | "milestone"
  | "teacher"
  | "event"
  | "achievement"
  | "ai";

export type Chest = {
  /**
   * Identificador único.
   */
  id: string;

  /** Evolution permanently fixed when the chest was obtained. */
  evolution: Evolution;

  /**
   * State. Newly generated chests use "pending".
   */
  status: ChestStatus;

  /**
   * Fecha de obtención.
   */
  obtainedAt: Date;

  /** Legacy fields retained for old stored chests; new pending chests do not use them. */
  theme?: string;
  rarity?: ChestRarity;
  source?: ChestSource;

  /**
   * Legacy opening data, outside the scope of CC-003.
   */
  openedAt?: Date;

  /**
   * Cosmético obtenido.
   */
  rewardId?: string;
};
