import {
  COIN_STATE_SCHEMA_VERSION,
  DEFAULT_COIN_LIMITS,
  type AdjustCoinBalanceCommand,
  type ApplyCoinActionCommand,
  type ChangeCoinRewardStatusCommand,
  type CoinActionConfiguration,
  type CoinClassState,
  type CoinFailure,
  type CoinIdempotencyRecord,
  type CoinLimits,
  type CoinMovement,
  type CoinOperationKind,
  type CoinOperationReceipt,
  type CoinOperationResult,
  type CoinRedemption,
  type CoinRedemptionReversal,
  type CoinReward,
  type CoinStateCreationResult,
  type CreateCoinRewardCommand,
  type EditCoinRewardCommand,
  type RedeemCoinRewardCommand,
  type RegisterCoinStudentCommand,
  type ReorderCoinRewardsCommand,
  type ReverseCoinRedemptionCommand,
  type SetCoinsEnabledCommand,
} from "./CoinContracts";
import { createCoinOperationFingerprint } from "./CoinIntegrity";
import {
  sealCoinClassState,
  validateCoinClassState,
  validateCoinIsoInstant,
  validateCoinStableId,
} from "./CoinValidation";

interface PreparedOperation {
  readonly status: "ready";
  readonly fingerprint: string;
}

type PreparationResult = PreparedOperation | CoinOperationResult;

export function createCoinClassState(
  classroomId: string,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinStateCreationResult {
  try {
    const idFailure = validateCoinStableId(classroomId, "classroomId", limits);
    if (idFailure) return { status: "rejected", failure: idFailure };
    const sealed = sealCoinClassState({
      schemaVersion: COIN_STATE_SCHEMA_VERSION,
      classroomId,
      settings: {
        enabled: false,
        firstActivatedAt: null,
        updatedAt: null,
        lastOperationId: null,
      },
      balances: [],
      rewards: [],
      redemptions: [],
      redemptionReversals: [],
      movements: [],
      idempotency: [],
      revision: 0,
    }, limits);
    return sealed.status === "valid"
      ? { status: "created", state: sealed.state }
      : { status: "rejected", failure: sealed.failure };
  } catch {
    return {
      status: "rejected",
      failure: failure("unexpected-input", "The initial monetary state could not be created safely."),
    };
  }
}

export function setCoinsEnabled(
  state: CoinClassState,
  command: SetCoinsEnabledCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    if (typeof command.enabled !== "boolean" || !Array.isArray(command.studentIds)) {
      return rejected(state, failure("unexpected-input", "Activation input is invalid."));
    }
    if (command.studentIds.length > limits.maxStudents) {
      return rejected(state, failure("limit-exceeded", "Activation student list exceeds its inspection limit.", "studentIds"));
    }
    const studentIds: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < command.studentIds.length; index += 1) {
      const studentId = command.studentIds[index];
      const idFailure = validateCoinStableId(studentId, `studentIds.${index}`, limits);
      if (idFailure) return rejected(state, { ...idFailure, code: "invalid-student-id" });
      if (seen.has(studentId)) {
        return rejected(state, failure("duplicate-student", "Activation student IDs must be unique.", `studentIds.${index}`));
      }
      seen.add(studentId);
      studentIds.push(studentId);
    }
    const canonicalStudentIds = [...studentIds].sort(compareStableText);
    const preparation = prepareOperation(state, command.operationId, "set-enabled", {
      classroomId: command.classroomId,
      enabled: command.enabled,
      studentIds: canonicalStudentIds,
    });
    if (preparation.status !== "ready") return preparation;

    const existingStudents = new Set(state.balances.map((entry) => entry.studentId));
    const additions = command.enabled
      ? canonicalStudentIds
          .filter((studentId) => !existingStudents.has(studentId))
          .map((studentId) => ({ studentId, balance: 0 }))
      : [];
    if (state.balances.length + additions.length > limits.maxStudents) {
      return recordTerminalRejection(state, "set-enabled", command.operationId, preparation.fingerprint,
        failure("limit-exceeded", "Student balance limit exceeded.", "studentIds"), limits);
    }
    return commitOperation(
      state,
      "set-enabled",
      command.operationId,
      preparation.fingerprint,
      {
        settings: {
          enabled: command.enabled,
          firstActivatedAt: state.settings.firstActivatedAt
            ?? (command.enabled ? command.occurredAt : null),
          updatedAt: command.occurredAt,
          lastOperationId: command.operationId,
        },
        balances: [...state.balances, ...additions],
      },
      limits
    );
  });
}

export function registerCoinStudent(
  state: CoinClassState,
  command: RegisterCoinStudentCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    const studentFailure = validateCoinStableId(command.studentId, "studentId", limits);
    if (studentFailure) return rejected(state, { ...studentFailure, code: "invalid-student-id" });
    const preparation = prepareOperation(state, command.operationId, "register-student", {
      classroomId: command.classroomId,
      studentId: command.studentId,
    });
    if (preparation.status !== "ready") return preparation;
    if (state.balances.some((entry) => entry.studentId === command.studentId)) {
      return recordTerminalRejection(state, "register-student", command.operationId, preparation.fingerprint,
        failure("duplicate-student", "The student already has a monetary balance.", "studentId"), limits);
    }
    if (state.balances.length >= limits.maxStudents) {
      return recordTerminalRejection(state, "register-student", command.operationId, preparation.fingerprint,
        failure("limit-exceeded", "Student balance limit exceeded.", "studentId"), limits);
    }
    return commitOperation(
      state,
      "register-student",
      command.operationId,
      preparation.fingerprint,
      { balances: [...state.balances, { studentId: command.studentId, balance: 0 }] },
      limits,
      command.studentId
    );
  });
}

export function applyCoinAction(
  state: CoinClassState,
  command: ApplyCoinActionCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    for (const [value, path, code] of [
      [command.studentId, "studentId", "invalid-student-id"],
      [command.actionId, "actionId", "invalid-action"],
    ] as const) {
      const idFailure = validateCoinStableId(value, path, limits);
      if (idFailure) return rejected(state, { ...idFailure, code });
    }
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    if (!isSignedAmount(command.crystalAmount, limits)) {
      return rejected(state, failure("invalid-action", "Crystal action amount must be a bounded safe integer.", "crystalAmount"));
    }
    const configuration = normalizeActionConfiguration(
      command.coinConfiguration,
      command.crystalAmount,
      limits
    );
    if (configuration.status === "rejected") return rejected(state, configuration.failure);

    const preparation = prepareOperation(state, command.operationId, "apply-action", {
      classroomId: command.classroomId,
      studentId: command.studentId,
      actionId: command.actionId,
      crystalAmount: command.crystalAmount,
      coinConfiguration: command.coinConfiguration === undefined
        ? { source: "legacy-default" }
        : configuration.configuration,
    });
    if (preparation.status !== "ready") return preparation;

    // Disabled operations are still journaled so reactivation cannot make a retry retroactive.
    if (!state.settings.enabled || configuration.requestedAmount === 0) {
      return commitOperation(
        state,
        "apply-action",
        command.operationId,
        preparation.fingerprint,
        {},
        limits
      );
    }
    const balance = state.balances.find((entry) => entry.studentId === command.studentId);
    if (!balance) return recordTerminalRejection(state, "apply-action", command.operationId, preparation.fingerprint,
      failure("student-not-found", "The student has no monetary balance.", "studentId"), limits);

    if (configuration.requestedAmount > 0) {
      const available = getPositiveCapacity(state, command.studentId, limits);
      if (configuration.requestedAmount > available) {
        return recordTerminalRejection(state, "apply-action", command.operationId, preparation.fingerprint, failure(
          "balance-limit-exceeded",
          "The positive action would exceed the balance capacity reserved for exact refunds.",
          "crystalAmount"
        ), limits);
      }
    }
    const clampedDebit = configuration.requestedAmount < 0
      ? Math.min(Math.abs(configuration.requestedAmount), balance.balance)
      : 0;
    const appliedAmount = configuration.requestedAmount < 0
      ? (clampedDebit === 0 ? 0 : -clampedDebit)
      : configuration.requestedAmount;
    const movementRevision = state.revision + 1;
    const movement: CoinMovement = {
      id: command.operationId,
      classroomId: state.classroomId,
      studentId: command.studentId,
      operationId: command.operationId,
      cause: {
        type: "action",
        actionId: command.actionId,
        configurationMode: configuration.configuration.mode,
        usedLegacyDefault: command.coinConfiguration === undefined,
      },
      requestedAmount: configuration.requestedAmount,
      appliedAmount,
      balanceBefore: balance.balance,
      balanceAfter: balance.balance + appliedAmount,
      occurredAt: command.occurredAt,
      stateRevision: movementRevision,
    };
    return commitOperation(
      state,
      "apply-action",
      command.operationId,
      preparation.fingerprint,
      {
        balances: replaceBalance(state, command.studentId, movement.balanceAfter),
        movements: [...state.movements, movement],
      },
      limits,
      movement.id
    );
  });
}

export function createCoinReward(
  state: CoinClassState,
  command: CreateCoinRewardCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const normalized = validateRewardCommand(state, command, limits);
    if (normalized.status === "rejected") return normalized.result;
    const preparation = prepareOperation(state, command.operationId, "create-reward", {
      classroomId: command.classroomId,
      rewardId: command.rewardId,
      name: normalized.name,
      description: normalized.description ?? null,
      price: command.price,
    });
    if (preparation.status !== "ready") return preparation;
    if (state.rewards.some((reward) => reward.id === command.rewardId)) {
      return recordTerminalRejection(state, "create-reward", command.operationId, preparation.fingerprint,
        failure("duplicate-reward", "The reward ID already exists.", "rewardId"), limits);
    }
    if (state.rewards.length >= limits.maxRewards) {
      return recordTerminalRejection(state, "create-reward", command.operationId, preparation.fingerprint,
        failure("limit-exceeded", "Reward limit exceeded.", "rewardId"), limits);
    }
    const reward: CoinReward = {
      id: command.rewardId,
      name: normalized.name,
      ...(normalized.description ? { description: normalized.description } : {}),
      price: command.price,
      status: "active",
      order: state.rewards.length,
      revision: 1,
      createdAt: command.occurredAt,
      updatedAt: command.occurredAt,
      lastOperationId: command.operationId,
    };
    return commitOperation(
      state,
      "create-reward",
      command.operationId,
      preparation.fingerprint,
      { rewards: [...state.rewards, reward] },
      limits,
      reward.id
    );
  });
}

export function editCoinReward(
  state: CoinClassState,
  command: EditCoinRewardCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const normalized = validateRewardCommand(state, command, limits);
    if (normalized.status === "rejected") return normalized.result;
    const preparation = prepareOperation(state, command.operationId, "edit-reward", {
      classroomId: command.classroomId,
      rewardId: command.rewardId,
      name: normalized.name,
      description: normalized.description ?? null,
      price: command.price,
    });
    if (preparation.status !== "ready") return preparation;
    const reward = state.rewards.find((entry) => entry.id === command.rewardId);
    if (!reward) return recordTerminalRejection(state, "edit-reward", command.operationId, preparation.fingerprint,
      failure("reward-not-found", "The reward does not exist.", "rewardId"), limits);
    const edited: CoinReward = {
      id: reward.id,
      name: normalized.name,
      ...(normalized.description ? { description: normalized.description } : {}),
      price: command.price,
      status: reward.status,
      order: reward.order,
      revision: reward.revision + 1,
      createdAt: reward.createdAt,
      updatedAt: command.occurredAt,
      lastOperationId: command.operationId,
    };
    return commitOperation(
      state,
      "edit-reward",
      command.operationId,
      preparation.fingerprint,
      { rewards: state.rewards.map((entry) => entry.id === reward.id ? edited : entry) },
      limits,
      reward.id
    );
  });
}

export function reorderCoinRewards(
  state: CoinClassState,
  command: ReorderCoinRewardsCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    if (!Array.isArray(command.orderedRewardIds)) {
      return rejected(state, failure("invalid-reward-order", "Reward order must be an array.", "orderedRewardIds"));
    }
    if (command.orderedRewardIds.length > limits.maxRewards) {
      return rejected(state, failure("limit-exceeded", "Reward order exceeds its inspection limit.", "orderedRewardIds"));
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < command.orderedRewardIds.length; index += 1) {
      const id = command.orderedRewardIds[index];
      const idFailure = validateCoinStableId(id, `orderedRewardIds.${index}`, limits);
      if (idFailure) return rejected(state, { ...idFailure, code: "invalid-reward-order" });
      if (seen.has(id)) return rejected(state, failure("invalid-reward-order", "Reward order contains duplicates.", `orderedRewardIds.${index}`));
      seen.add(id);
      ids.push(id);
    }
    const preparation = prepareOperation(state, command.operationId, "reorder-rewards", {
      classroomId: command.classroomId,
      orderedRewardIds: ids,
    });
    if (preparation.status !== "ready") return preparation;
    if (ids.length !== state.rewards.length
      || state.rewards.some((reward) => !seen.has(reward.id))) {
      return recordTerminalRejection(state, "reorder-rewards", command.operationId, preparation.fingerprint, failure(
        "invalid-reward-order",
        "Reward order must contain every current reward exactly once.",
        "orderedRewardIds"
      ), limits);
    }
    const byId = new Map(state.rewards.map((reward) => [reward.id, reward]));
    const rewards = ids.map((id, order) => {
      const reward = byId.get(id) as CoinReward;
      return reward.order === order
        ? reward
        : {
            ...reward,
            order,
            revision: reward.revision + 1,
            updatedAt: command.occurredAt,
            lastOperationId: command.operationId,
          };
    });
    return commitOperation(
      state,
      "reorder-rewards",
      command.operationId,
      preparation.fingerprint,
      { rewards },
      limits
    );
  });
}

export function archiveCoinReward(
  state: CoinClassState,
  command: ChangeCoinRewardStatusCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return changeRewardStatus(state, command, "archived", "archive-reward", limits);
}

export function restoreCoinReward(
  state: CoinClassState,
  command: ChangeCoinRewardStatusCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return changeRewardStatus(state, command, "active", "restore-reward", limits);
}

export function redeemCoinReward(
  state: CoinClassState,
  command: RedeemCoinRewardCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    for (const [value, path, code] of [
      [command.redemptionId, "redemptionId", "invalid-redemption"],
      [command.studentId, "studentId", "invalid-student-id"],
      [command.rewardId, "rewardId", "invalid-reward"],
    ] as const) {
      const idFailure = validateCoinStableId(value, path, limits);
      if (idFailure) return rejected(state, { ...idFailure, code });
    }
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    const reason = normalizeOptionalText(command.reason, limits.maxReasonLength);
    if (reason.status === "rejected") return rejected(state, reason.failure);
    const preparation = prepareOperation(state, command.operationId, "redeem-reward", {
      classroomId: command.classroomId,
      redemptionId: command.redemptionId,
      studentId: command.studentId,
      rewardId: command.rewardId,
      reason: reason.value ?? null,
    });
    if (preparation.status !== "ready") return preparation;
    if (!state.settings.enabled) return recordTerminalRejection(state, "redeem-reward", command.operationId,
      preparation.fingerprint, failure("coins-disabled", "Coins must be enabled to redeem a reward."), limits);
    if (state.redemptions.some((entry) => entry.id === command.redemptionId)) {
      return recordTerminalRejection(state, "redeem-reward", command.operationId, preparation.fingerprint,
        failure("duplicate-redemption", "The redemption ID already exists.", "redemptionId"), limits);
    }
    const balance = state.balances.find((entry) => entry.studentId === command.studentId);
    if (!balance) return recordTerminalRejection(state, "redeem-reward", command.operationId, preparation.fingerprint,
      failure("student-not-found", "The student has no monetary balance.", "studentId"), limits);
    const reward = state.rewards.find((entry) => entry.id === command.rewardId);
    if (!reward) return recordTerminalRejection(state, "redeem-reward", command.operationId, preparation.fingerprint,
      failure("reward-not-found", "The reward does not exist.", "rewardId"), limits);
    if (reward.status !== "active") return recordTerminalRejection(state, "redeem-reward", command.operationId,
      preparation.fingerprint, failure("reward-archived", "Archived rewards cannot be redeemed.", "rewardId"), limits);
    if (balance.balance < reward.price) return recordTerminalRejection(state, "redeem-reward", command.operationId,
      preparation.fingerprint, failure("insufficient-balance", "The student has insufficient coins."), limits);

    const revision = state.revision + 1;
    const movement: CoinMovement = {
      id: command.operationId,
      classroomId: state.classroomId,
      studentId: command.studentId,
      operationId: command.operationId,
      cause: { type: "redemption", redemptionId: command.redemptionId, rewardId: reward.id },
      requestedAmount: -reward.price,
      appliedAmount: -reward.price,
      balanceBefore: balance.balance,
      balanceAfter: balance.balance - reward.price,
      occurredAt: command.occurredAt,
      stateRevision: revision,
    };
    const redemption: CoinRedemption = {
      id: command.redemptionId,
      classroomId: state.classroomId,
      studentId: command.studentId,
      rewardId: reward.id,
      operationId: command.operationId,
      movementId: movement.id,
      rewardNameSnapshot: reward.name,
      rewardPriceSnapshot: reward.price,
      occurredAt: command.occurredAt,
      ...(reason.value ? { reason: reason.value } : {}),
      stateRevision: revision,
    };
    return commitOperation(
      state,
      "redeem-reward",
      command.operationId,
      preparation.fingerprint,
      {
        balances: replaceBalance(state, command.studentId, movement.balanceAfter),
        movements: [...state.movements, movement],
        redemptions: [...state.redemptions, redemption],
      },
      limits,
      redemption.id
    );
  });
}

export function reverseCoinRedemption(
  state: CoinClassState,
  command: ReverseCoinRedemptionCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    for (const [value, path, code] of [
      [command.reversalId, "reversalId", "invalid-redemption"],
      [command.redemptionId, "redemptionId", "invalid-redemption"],
    ] as const) {
      const idFailure = validateCoinStableId(value, path, limits);
      if (idFailure) return rejected(state, { ...idFailure, code });
    }
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    const reason = normalizeOptionalText(command.reason, limits.maxReasonLength);
    if (reason.status === "rejected") return rejected(state, reason.failure);
    const preparation = prepareOperation(state, command.operationId, "reverse-redemption", {
      classroomId: command.classroomId,
      reversalId: command.reversalId,
      redemptionId: command.redemptionId,
      reason: reason.value ?? null,
    });
    if (preparation.status !== "ready") return preparation;
    if (!state.settings.enabled) return recordTerminalRejection(state, "reverse-redemption", command.operationId,
      preparation.fingerprint, failure("coins-disabled", "Coins must be enabled to reverse a redemption."), limits);
    if (state.redemptionReversals.some((entry) => entry.id === command.reversalId)) {
      return recordTerminalRejection(state, "reverse-redemption", command.operationId, preparation.fingerprint,
        failure("duplicate-reversal", "The reversal ID already exists.", "reversalId"), limits);
    }
    const redemption = state.redemptions.find((entry) => entry.id === command.redemptionId);
    if (!redemption) return recordTerminalRejection(state, "reverse-redemption", command.operationId,
      preparation.fingerprint, failure("redemption-not-found", "The redemption does not exist.", "redemptionId"), limits);
    if (state.redemptionReversals.some((entry) => entry.redemptionId === redemption.id)) {
      return recordTerminalRejection(state, "reverse-redemption", command.operationId, preparation.fingerprint,
        failure("redemption-already-reversed", "The redemption has already been reversed.", "redemptionId"), limits);
    }
    const balance = state.balances.find((entry) => entry.studentId === redemption.studentId);
    if (!balance) return recordTerminalRejection(state, "reverse-redemption", command.operationId,
      preparation.fingerprint, failure("student-not-found", "The redemption student has no monetary balance."), limits);
    const balanceAfter = balance.balance + redemption.rewardPriceSnapshot;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter > limits.maxBalance) {
      return recordTerminalRejection(state, "reverse-redemption", command.operationId, preparation.fingerprint, failure(
        "balance-limit-exceeded",
        "The exact redemption compensation exceeds the configured balance limit."
      ), limits);
    }
    const revision = state.revision + 1;
    const movement: CoinMovement = {
      id: command.operationId,
      classroomId: state.classroomId,
      studentId: redemption.studentId,
      operationId: command.operationId,
      cause: {
        type: "redemption-reversal",
        reversalId: command.reversalId,
        redemptionId: redemption.id,
        originalMovementId: redemption.movementId,
      },
      requestedAmount: redemption.rewardPriceSnapshot,
      appliedAmount: redemption.rewardPriceSnapshot,
      balanceBefore: balance.balance,
      balanceAfter,
      occurredAt: command.occurredAt,
      stateRevision: revision,
    };
    const reversal: CoinRedemptionReversal = {
      id: command.reversalId,
      classroomId: state.classroomId,
      studentId: redemption.studentId,
      redemptionId: redemption.id,
      operationId: command.operationId,
      originalMovementId: redemption.movementId,
      compensationMovementId: movement.id,
      occurredAt: command.occurredAt,
      ...(reason.value ? { reason: reason.value } : {}),
      stateRevision: revision,
    };
    return commitOperation(
      state,
      "reverse-redemption",
      command.operationId,
      preparation.fingerprint,
      {
        balances: replaceBalance(state, redemption.studentId, balanceAfter),
        movements: [...state.movements, movement],
        redemptionReversals: [...state.redemptionReversals, reversal],
      },
      limits,
      reversal.id
    );
  });
}

export function adjustCoinBalance(
  state: CoinClassState,
  command: AdjustCoinBalanceCommand,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    const studentFailure = validateCoinStableId(command.studentId, "studentId", limits);
    if (studentFailure) return rejected(state, { ...studentFailure, code: "invalid-student-id" });
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    if (!isSignedAmount(command.requestedAmount, limits) || command.requestedAmount === 0) {
      return rejected(state, failure("invalid-adjustment", "An adjustment must be a non-zero bounded safe integer.", "requestedAmount"));
    }
    const reason = normalizeRequiredText(command.reason, limits.maxReasonLength, "reason");
    if (reason.status === "rejected") return rejected(state, reason.failure);
    const preparation = prepareOperation(state, command.operationId, "administrative-adjustment", {
      classroomId: command.classroomId,
      studentId: command.studentId,
      requestedAmount: command.requestedAmount,
      reason: reason.value,
    });
    if (preparation.status !== "ready") return preparation;
    if (!state.settings.enabled) return recordTerminalRejection(state, "administrative-adjustment", command.operationId,
      preparation.fingerprint, failure("coins-disabled", "Coins must be enabled for administrative adjustments."), limits);
    const balance = state.balances.find((entry) => entry.studentId === command.studentId);
    if (!balance) return recordTerminalRejection(state, "administrative-adjustment", command.operationId,
      preparation.fingerprint, failure("student-not-found", "The student has no monetary balance.", "studentId"), limits);
    if (command.requestedAmount > getPositiveCapacity(state, command.studentId, limits)) {
      return recordTerminalRejection(state, "administrative-adjustment", command.operationId, preparation.fingerprint, failure(
        "balance-limit-exceeded",
        "The adjustment would exceed the balance capacity reserved for exact refunds.",
        "requestedAmount"
      ), limits);
    }
    const clampedDebit = command.requestedAmount < 0
      ? Math.min(Math.abs(command.requestedAmount), balance.balance)
      : 0;
    const appliedAmount = command.requestedAmount < 0
      ? (clampedDebit === 0 ? 0 : -clampedDebit)
      : command.requestedAmount;
    const movement: CoinMovement = {
      id: command.operationId,
      classroomId: state.classroomId,
      studentId: command.studentId,
      operationId: command.operationId,
      cause: { type: "administrative-adjustment", reason: reason.value },
      requestedAmount: command.requestedAmount,
      appliedAmount,
      balanceBefore: balance.balance,
      balanceAfter: balance.balance + appliedAmount,
      occurredAt: command.occurredAt,
      stateRevision: state.revision + 1,
    };
    return commitOperation(
      state,
      "administrative-adjustment",
      command.operationId,
      preparation.fingerprint,
      {
        balances: replaceBalance(state, command.studentId, movement.balanceAfter),
        movements: [...state.movements, movement],
      },
      limits,
      movement.id
    );
  });
}

export function getCoinBalance(state: CoinClassState, studentId: string): number | undefined {
  return state.balances.find((entry) => entry.studentId === studentId)?.balance;
}

function changeRewardStatus(
  state: CoinClassState,
  command: ChangeCoinRewardStatusCommand,
  status: CoinReward["status"],
  kind: "archive-reward" | "restore-reward",
  limits: CoinLimits
): CoinOperationResult {
  return safelyOperate(state, () => {
    const commonFailure = validateCommonCommand(state, command, limits);
    if (commonFailure) return rejected(state, commonFailure);
    const idFailure = validateCoinStableId(command.rewardId, "rewardId", limits);
    if (idFailure) return rejected(state, { ...idFailure, code: "invalid-reward" });
    const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
    if (dateFailure) return rejected(state, dateFailure);
    const preparation = prepareOperation(state, command.operationId, kind, {
      classroomId: command.classroomId,
      rewardId: command.rewardId,
    });
    if (preparation.status !== "ready") return preparation;
    const reward = state.rewards.find((entry) => entry.id === command.rewardId);
    if (!reward) return recordTerminalRejection(state, kind, command.operationId, preparation.fingerprint,
      failure("reward-not-found", "The reward does not exist.", "rewardId"), limits);
    if (reward.status === status) {
      return recordTerminalRejection(state, kind, command.operationId, preparation.fingerprint, failure(
        status === "archived" ? "reward-already-archived" : "reward-already-active",
        status === "archived" ? "The reward is already archived." : "The reward is already active.",
        "rewardId"
      ), limits);
    }
    const changed: CoinReward = {
      ...reward,
      status,
      revision: reward.revision + 1,
      updatedAt: command.occurredAt,
      lastOperationId: command.operationId,
    };
    return commitOperation(
      state,
      kind,
      command.operationId,
      preparation.fingerprint,
      { rewards: state.rewards.map((entry) => entry.id === reward.id ? changed : entry) },
      limits,
      reward.id
    );
  });
}

function validateRewardCommand(
  state: CoinClassState,
  command: CreateCoinRewardCommand | EditCoinRewardCommand,
  limits: CoinLimits
):
  | { readonly status: "valid"; readonly name: string; readonly description?: string }
  | { readonly status: "rejected"; readonly result: CoinOperationResult } {
  const commonFailure = validateCommonCommand(state, command, limits);
  if (commonFailure) return { status: "rejected", result: rejected(state, commonFailure) };
  const idFailure = validateCoinStableId(command.rewardId, "rewardId", limits);
  if (idFailure) return { status: "rejected", result: rejected(state, { ...idFailure, code: "invalid-reward" }) };
  const dateFailure = validateCoinIsoInstant(command.occurredAt, "occurredAt");
  if (dateFailure) return { status: "rejected", result: rejected(state, dateFailure) };
  const name = normalizeRequiredText(command.name, limits.maxRewardNameLength, "name");
  if (name.status === "rejected") return { status: "rejected", result: rejected(state, { ...name.failure, code: "invalid-reward" }) };
  const description = normalizeOptionalText(command.description, limits.maxRewardDescriptionLength);
  if (description.status === "rejected") return { status: "rejected", result: rejected(state, { ...description.failure, code: "invalid-reward", path: "description" }) };
  if (!Number.isSafeInteger(command.price) || command.price <= 0 || command.price > limits.maxAmount) {
    return { status: "rejected", result: rejected(state, failure("invalid-reward", "Reward price must be a strictly positive bounded safe integer.", "price")) };
  }
  return { status: "valid", name: name.value, ...(description.value ? { description: description.value } : {}) };
}

function normalizeActionConfiguration(
  value: CoinActionConfiguration | undefined,
  crystalAmount: number,
  limits: CoinLimits
):
  | {
      readonly status: "valid";
      readonly configuration: CoinActionConfiguration;
      readonly requestedAmount: number;
    }
  | { readonly status: "rejected"; readonly failure: CoinFailure } {
  if (value === undefined || value.mode === "same-as-crystals") {
    return {
      status: "valid",
      configuration: { mode: "same-as-crystals" },
      requestedAmount: crystalAmount,
    };
  }
  if (value.mode === "no-coins") {
    return { status: "valid", configuration: { mode: "no-coins" }, requestedAmount: 0 };
  }
  if (value.mode !== "custom"
    || !Number.isSafeInteger(value.magnitude)
    || value.magnitude <= 0
    || value.magnitude > limits.maxAmount) {
    return {
      status: "rejected",
      failure: failure(
        "invalid-action-configuration",
        "A custom coin magnitude must be a strictly positive bounded safe integer; the action supplies its sign.",
        "coinConfiguration"
      ),
    };
  }
  if (crystalAmount === 0) {
    return {
      status: "rejected",
      failure: failure(
        "zero-action-custom-amount",
        "A zero-value action cannot produce a custom monetary effect.",
        "coinConfiguration"
      ),
    };
  }
  return {
    status: "valid",
    configuration: { mode: "custom", magnitude: value.magnitude },
    requestedAmount: crystalAmount > 0 ? value.magnitude : -value.magnitude,
  };
}

function prepareOperation(
  state: CoinClassState,
  operationId: string,
  kind: CoinOperationKind,
  material: unknown
): PreparationResult {
  const fingerprint = createCoinOperationFingerprint({ kind, material });
  if (fingerprint.status === "rejected") return rejected(state, fingerprint.failure);
  const existing = state.idempotency.find((entry) => entry.operationId === operationId);
  if (!existing) return { status: "ready", fingerprint: fingerprint.checksum };
  if (existing.kind !== kind || existing.fingerprint !== fingerprint.checksum) {
    return rejected(state, failure(
      "operation-conflict",
      "The operationId was already used with materially different input.",
      "operationId"
    ));
  }
  return {
    status: "idempotent",
    state,
    receipt: receiptFromJournal(existing),
  };
}

function commitOperation(
  state: CoinClassState,
  kind: CoinOperationKind,
  operationId: string,
  fingerprint: string,
  changes: Partial<Omit<CoinClassState, "schemaVersion" | "classroomId" | "revision" | "integrity" | "idempotency">>,
  limits: CoinLimits,
  resultReference?: string
): CoinOperationResult {
  if (state.idempotency.length >= limits.maxIdempotencyOperations) {
    return rejected(state, failure("limit-exceeded", "Idempotency journal limit exceeded."));
  }
  const revision = state.revision + 1;
  const record: CoinIdempotencyRecord = {
    operationId,
    kind,
    fingerprint,
    resultingRevision: revision,
    outcome: "applied",
    ...(resultReference ? { resultReference } : {}),
  };
  const sealed = sealCoinClassState({
    schemaVersion: COIN_STATE_SCHEMA_VERSION,
    classroomId: state.classroomId,
    settings: changes.settings ?? state.settings,
    balances: changes.balances ?? state.balances,
    rewards: changes.rewards ?? state.rewards,
    redemptions: changes.redemptions ?? state.redemptions,
    redemptionReversals: changes.redemptionReversals ?? state.redemptionReversals,
    movements: changes.movements ?? state.movements,
    idempotency: [...state.idempotency, record],
    revision,
  }, limits);
  if (sealed.status === "invalid") {
    return recordTerminalRejection(state, kind, operationId, fingerprint, sealed.failure, limits);
  }
  return {
    status: "applied",
    state: sealed.state,
    receipt: receiptFromJournal(record),
  };
}

function recordTerminalRejection(
  state: CoinClassState,
  kind: CoinOperationKind,
  operationId: string,
  fingerprint: string,
  reason: CoinFailure,
  limits: CoinLimits
): CoinOperationResult {
  if (state.idempotency.length >= limits.maxIdempotencyOperations) {
    return rejected(state, {
      ...reason,
      message: `${reason.message} The rejection could not be journaled because the idempotency limit is full.`,
    });
  }
  const revision = state.revision + 1;
  const record: CoinIdempotencyRecord = {
    operationId,
    kind,
    fingerprint,
    resultingRevision: revision,
    outcome: "rejected",
    failureCode: reason.code,
  };
  const sealed = sealCoinClassState({
    schemaVersion: COIN_STATE_SCHEMA_VERSION,
    classroomId: state.classroomId,
    settings: state.settings,
    balances: state.balances,
    rewards: state.rewards,
    redemptions: state.redemptions,
    redemptionReversals: state.redemptionReversals,
    movements: state.movements,
    idempotency: [...state.idempotency, record],
    revision,
  }, limits);
  if (sealed.status === "invalid") {
    return rejected(state, {
      ...reason,
      message: `${reason.message} The rejection could not be journaled: ${sealed.failure.message}`,
    });
  }
  return {
    status: "rejected",
    state: sealed.state,
    failure: reason,
    recorded: true,
    receipt: receiptFromJournal(record),
  };
}

function validateCommonCommand(
  state: CoinClassState,
  command: { readonly classroomId: string; readonly operationId: string },
  limits: CoinLimits
): CoinFailure | null {
  const stateValidation = validateCoinClassState(state, limits);
  if (stateValidation.status === "invalid") return stateValidation.failure;
  const classroomFailure = validateCoinStableId(command.classroomId, "classroomId", limits);
  if (classroomFailure) return classroomFailure;
  if (command.classroomId !== state.classroomId) {
    return failure("classroom-conflict", "The command belongs to another classroom.", "classroomId");
  }
  const operationFailure = validateCoinStableId(command.operationId, "operationId", limits);
  if (operationFailure) return operationFailure;
  return null;
}

function getPositiveCapacity(
  state: CoinClassState,
  studentId: string,
  limits: CoinLimits
): number {
  const balance = state.balances.find((entry) => entry.studentId === studentId)?.balance ?? 0;
  const reversed = new Set(state.redemptionReversals.map((entry) => entry.redemptionId));
  const refundable = state.redemptions.reduce((total, redemption) =>
    redemption.studentId === studentId && !reversed.has(redemption.id)
      ? total + redemption.rewardPriceSnapshot
      : total, 0);
  return limits.maxBalance - balance - refundable;
}

function replaceBalance(
  state: CoinClassState,
  studentId: string,
  balance: number
): CoinClassState["balances"] {
  return state.balances.map((entry) =>
    entry.studentId === studentId ? { ...entry, balance } : entry
  );
}

function normalizeRequiredText(
  value: unknown,
  maxLength: number,
  path: string
): { readonly status: "valid"; readonly value: string } | {
  readonly status: "rejected";
  readonly failure: CoinFailure;
} {
  if (typeof value !== "string") {
    return { status: "rejected", failure: failure("invalid-reason", `${path} must be text.`, path) };
  }
  if (value.length > maxLength + 2_048) {
    return {
      status: "rejected",
      failure: failure("invalid-reason", `${path} exceeds its safe inspection bound.`, path),
    };
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    return {
      status: "rejected",
      failure: failure("invalid-reason", `${path} must be non-empty and at most ${maxLength} code units.`, path),
    };
  }
  return { status: "valid", value: normalized };
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number
): { readonly status: "valid"; readonly value?: string } | {
  readonly status: "rejected";
  readonly failure: CoinFailure;
} {
  if (value === undefined) return { status: "valid" };
  if (typeof value !== "string") {
    return { status: "rejected", failure: failure("invalid-reason", "Optional text must be a string.") };
  }
  if (value.length > maxLength + 2_048) {
    return { status: "rejected", failure: failure("invalid-reason", "Optional text exceeds its safe inspection bound.") };
  }
  const normalized = value.trim();
  if (!normalized) return { status: "valid" };
  if (normalized.length > maxLength) {
    return { status: "rejected", failure: failure("invalid-reason", `Optional text exceeds ${maxLength} code units.`) };
  }
  return { status: "valid", value: normalized };
}

function receiptFromJournal(entry: CoinIdempotencyRecord): CoinOperationReceipt {
  return {
    operationId: entry.operationId,
    kind: entry.kind,
    resultingRevision: entry.resultingRevision,
    outcome: entry.outcome,
    ...(entry.failureCode ? { failureCode: entry.failureCode } : {}),
    ...(entry.resultReference ? { resultReference: entry.resultReference } : {}),
  };
}

function safelyOperate(
  state: CoinClassState,
  operation: () => CoinOperationResult
): CoinOperationResult {
  try {
    return operation();
  } catch {
    return rejected(state, failure(
      "unexpected-input",
      "The monetary operation could not inspect its input safely."
    ));
  }
}

function rejected(state: CoinClassState, reason: CoinFailure): CoinOperationResult {
  return { status: "rejected", state, failure: reason, recorded: false };
}

function failure(
  code: CoinFailure["code"],
  message: string,
  path?: string
): CoinFailure {
  return { code, message, ...(path ? { path } : {}) };
}

function isSignedAmount(value: unknown, limits: CoinLimits): value is number {
  return Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && Math.abs(value as number) <= limits.maxAmount;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
