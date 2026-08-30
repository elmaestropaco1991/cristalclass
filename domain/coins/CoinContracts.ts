export const COIN_STATE_SCHEMA_VERSION = 1 as const;
export const COIN_CHECKSUM_VERSION = "coin-state-fnv1a64-v1" as const;
export const COIN_OPERATION_FINGERPRINT_VERSION = "coin-operation-fnv1a64-v1" as const;

export interface CoinLimits {
  readonly maxStudents: number;
  readonly maxRewards: number;
  readonly maxMovements: number;
  readonly maxRedemptions: number;
  readonly maxRedemptionReversals: number;
  readonly maxIdempotencyOperations: number;
  readonly maxIdentifierLength: number;
  readonly maxRewardNameLength: number;
  readonly maxRewardDescriptionLength: number;
  readonly maxReasonLength: number;
  readonly maxAmount: number;
  readonly maxBalance: number;
  readonly maxPersistedCodeUnits: number;
  readonly maxPersistedUtf8Bytes: number;
  readonly maxTransitionPeakCodeUnits: number;
  readonly maxTransitionPeakUtf8Bytes: number;
}

export const DEFAULT_COIN_LIMITS: CoinLimits = Object.freeze({
  maxStudents: 120,
  maxRewards: 250,
  maxMovements: 12_000,
  maxRedemptions: 3_000,
  maxRedemptionReversals: 3_000,
  maxIdempotencyOperations: 20_000,
  maxIdentifierLength: 128,
  maxRewardNameLength: 120,
  maxRewardDescriptionLength: 1_000,
  maxReasonLength: 500,
  maxAmount: 100_000,
  maxBalance: 1_000_000_000,
  maxPersistedCodeUnits: 1_000_000,
  maxPersistedUtf8Bytes: 1_500_000,
  maxTransitionPeakCodeUnits: 4_000_000,
  maxTransitionPeakUtf8Bytes: 6_000_000,
});

export type CoinOperationKind =
  | "set-enabled"
  | "register-student"
  | "apply-action"
  | "create-reward"
  | "edit-reward"
  | "reorder-rewards"
  | "archive-reward"
  | "restore-reward"
  | "redeem-reward"
  | "reverse-redemption"
  | "administrative-adjustment";

export interface CoinActivationSettings {
  readonly enabled: boolean;
  readonly firstActivatedAt: string | null;
  readonly updatedAt: string | null;
  readonly lastOperationId: string | null;
}

export interface CoinStudentBalance {
  readonly studentId: string;
  readonly balance: number;
}

export type CoinRewardStatus = "active" | "archived";

export interface CoinReward {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number;
  readonly status: CoinRewardStatus;
  readonly order: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOperationId: string;
}

export type CoinActionConfiguration =
  | { readonly mode: "same-as-crystals" }
  | { readonly mode: "custom"; readonly magnitude: number }
  | { readonly mode: "no-coins" };

export type CoinMovementCause =
  | {
      readonly type: "action";
      readonly actionId: string;
      readonly configurationMode: CoinActionConfiguration["mode"];
      readonly usedLegacyDefault: boolean;
    }
  | {
      readonly type: "redemption";
      readonly redemptionId: string;
      readonly rewardId: string;
    }
  | {
      readonly type: "redemption-reversal";
      readonly reversalId: string;
      readonly redemptionId: string;
      readonly originalMovementId: string;
    }
  | {
      readonly type: "administrative-adjustment";
      readonly reason: string;
    };

export interface CoinMovement {
  /** The caller-provided operationId is also the stable movement identity. */
  readonly id: string;
  readonly classroomId: string;
  readonly studentId: string;
  readonly operationId: string;
  readonly cause: CoinMovementCause;
  readonly requestedAmount: number;
  readonly appliedAmount: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  readonly occurredAt: string;
  readonly stateRevision: number;
}

export interface CoinRedemption {
  readonly id: string;
  readonly classroomId: string;
  readonly studentId: string;
  readonly rewardId: string;
  readonly operationId: string;
  readonly movementId: string;
  readonly rewardNameSnapshot: string;
  readonly rewardPriceSnapshot: number;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly stateRevision: number;
}

export interface CoinRedemptionReversal {
  readonly id: string;
  readonly classroomId: string;
  readonly studentId: string;
  readonly redemptionId: string;
  readonly operationId: string;
  readonly originalMovementId: string;
  readonly compensationMovementId: string;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly stateRevision: number;
}

export interface CoinIdempotencyRecord {
  readonly operationId: string;
  readonly kind: CoinOperationKind;
  readonly fingerprint: string;
  readonly resultingRevision: number;
  /** Terminal domain outcome. Rejected inputs that never reached domain evaluation are not recorded. */
  readonly outcome: "applied" | "rejected";
  readonly failureCode?: CoinFailureCode;
  /** A compact ID only; commands, catalogs, state snapshots and long text are never copied here. */
  readonly resultReference?: string;
}

export interface CoinStateIntegrity {
  readonly version: typeof COIN_CHECKSUM_VERSION;
  readonly checksum: string;
}

/** The sole monetary source of truth for one classroom. */
export interface CoinClassState {
  readonly schemaVersion: typeof COIN_STATE_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly settings: CoinActivationSettings;
  readonly balances: readonly CoinStudentBalance[];
  readonly rewards: readonly CoinReward[];
  readonly redemptions: readonly CoinRedemption[];
  readonly redemptionReversals: readonly CoinRedemptionReversal[];
  readonly movements: readonly CoinMovement[];
  readonly idempotency: readonly CoinIdempotencyRecord[];
  readonly revision: number;
  readonly integrity: CoinStateIntegrity;
}

export type CoinFailureCode =
  | "invalid-state"
  | "invalid-classroom-id"
  | "classroom-conflict"
  | "invalid-operation-id"
  | "operation-conflict"
  | "invalid-student-id"
  | "duplicate-student"
  | "student-not-found"
  | "coins-disabled"
  | "invalid-date"
  | "invalid-action"
  | "invalid-action-configuration"
  | "zero-action-custom-amount"
  | "invalid-reward"
  | "duplicate-reward"
  | "reward-not-found"
  | "reward-archived"
  | "reward-already-archived"
  | "reward-already-active"
  | "invalid-reward-order"
  | "invalid-redemption"
  | "duplicate-redemption"
  | "insufficient-balance"
  | "redemption-not-found"
  | "redemption-already-reversed"
  | "duplicate-reversal"
  | "invalid-adjustment"
  | "invalid-reason"
  | "balance-limit-exceeded"
  | "limit-exceeded"
  | "size-limit-exceeded"
  | "unexpected-input";

export interface CoinFailure {
  readonly code: CoinFailureCode;
  readonly message: string;
  readonly path?: string;
}

export type CoinValidationResult =
  | { readonly status: "valid"; readonly state: CoinClassState }
  | { readonly status: "invalid"; readonly failure: CoinFailure };

export type CoinStateCreationResult =
  | { readonly status: "created"; readonly state: CoinClassState }
  | { readonly status: "rejected"; readonly failure: CoinFailure };

export interface CoinOperationReceipt {
  readonly operationId: string;
  readonly kind: CoinOperationKind;
  readonly resultingRevision: number;
  readonly outcome: "applied" | "rejected";
  readonly failureCode?: CoinFailureCode;
  readonly resultReference?: string;
}

export type CoinOperationResult =
  | {
      readonly status: "applied";
      readonly state: CoinClassState;
      readonly receipt: CoinOperationReceipt;
    }
  | {
      readonly status: "idempotent";
      readonly state: CoinClassState;
      readonly receipt: CoinOperationReceipt;
    }
  | {
      readonly status: "rejected";
      readonly state: CoinClassState;
      readonly failure: CoinFailure;
      /** True only when this terminal domain rejection was durably journaled in `state`. */
      readonly recorded: boolean;
      readonly receipt?: CoinOperationReceipt;
    };

export interface SetCoinsEnabledCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly enabled: boolean;
  /** Current students to initialize at zero if they do not yet exist. */
  readonly studentIds: readonly string[];
  readonly occurredAt: string;
}

export interface RegisterCoinStudentCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly studentId: string;
}

export interface ApplyCoinActionCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly studentId: string;
  readonly actionId: string;
  /** Signed crystal request; its sign is the only source of the monetary direction. */
  readonly crystalAmount: number;
  /** Missing means legacy "same-as-crystals" without rewriting the action. */
  readonly coinConfiguration?: CoinActionConfiguration;
  readonly occurredAt: string;
}

export interface CreateCoinRewardCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly rewardId: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number;
  readonly occurredAt: string;
}

export interface EditCoinRewardCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly rewardId: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number;
  readonly occurredAt: string;
}

export interface ReorderCoinRewardsCommand {
  readonly classroomId: string;
  readonly operationId: string;
  /** Exact complete order, including archived rewards. */
  readonly orderedRewardIds: readonly string[];
  readonly occurredAt: string;
}

export interface ChangeCoinRewardStatusCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly rewardId: string;
  readonly occurredAt: string;
}

export interface RedeemCoinRewardCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly redemptionId: string;
  readonly studentId: string;
  readonly rewardId: string;
  readonly occurredAt: string;
  readonly reason?: string;
}

export interface ReverseCoinRedemptionCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly reversalId: string;
  readonly redemptionId: string;
  readonly occurredAt: string;
  readonly reason?: string;
}

export interface AdjustCoinBalanceCommand {
  readonly classroomId: string;
  readonly operationId: string;
  readonly studentId: string;
  readonly requestedAmount: number;
  readonly reason: string;
  readonly occurredAt: string;
}
