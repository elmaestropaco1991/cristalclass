import type { Timestamp } from "../../shared/types";

export interface Economy {
  crystals: number;
  coins: number;
  updatedAt: Timestamp;
}
