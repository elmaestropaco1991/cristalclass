import type { EntityId, Timestamp } from "../../shared/types";

export type RewardKind = "chest" | "cosmetic" | "currency" | "badge";
export type RewardStatus = "pending" | "granted" | "claimed" | "expired";

export interface Reward {
  id: EntityId;
  definitionId: string;
  kind: RewardKind;
  status: RewardStatus;
  grantedAt: Timestamp;
  claimedAt?: Timestamp;
}
