import {
  COIN_CHECKSUM_VERSION,
  COIN_OPERATION_FINGERPRINT_VERSION,
  COIN_STATE_SCHEMA_VERSION,
  DEFAULT_COIN_LIMITS,
  type CoinClassState,
  type CoinFailure,
  type CoinFailureCode,
  type CoinIdempotencyRecord,
  type CoinLimits,
  type CoinMovement,
  type CoinOperationKind,
  type CoinRedemption,
  type CoinRedemptionReversal,
  type CoinReward,
  type CoinValidationResult,
} from "./CoinContracts";
import {
  calculateCoinStateChecksum,
  measureCoinSerializedJson,
  resolveCoinLimits,
} from "./CoinIntegrity";

const OPERATION_KINDS = new Set<CoinOperationKind>([
  "set-enabled",
  "register-student",
  "apply-action",
  "create-reward",
  "edit-reward",
  "reorder-rewards",
  "archive-reward",
  "restore-reward",
  "redeem-reward",
  "reverse-redemption",
  "administrative-adjustment",
]);

const REWARD_OPERATION_KINDS = new Set<CoinOperationKind>([
  "create-reward",
  "edit-reward",
  "reorder-rewards",
  "archive-reward",
  "restore-reward",
]);

const FAILURE_CODES = new Set<CoinFailureCode>([
  "invalid-state", "invalid-classroom-id", "classroom-conflict", "invalid-operation-id",
  "operation-conflict", "invalid-student-id", "duplicate-student", "student-not-found",
  "coins-disabled", "invalid-date", "invalid-action", "invalid-action-configuration",
  "zero-action-custom-amount", "invalid-reward", "duplicate-reward", "reward-not-found",
  "reward-archived", "reward-already-archived", "reward-already-active", "invalid-reward-order",
  "invalid-redemption", "duplicate-redemption", "insufficient-balance", "redemption-not-found",
  "redemption-already-reversed", "duplicate-reversal", "invalid-adjustment", "invalid-reason",
  "balance-limit-exceeded", "limit-exceeded", "size-limit-exceeded", "unexpected-input",
]);

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function validateCoinStableId(
  value: unknown,
  path: string,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinFailure | null {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > limits.maxIdentifierLength
    || value === "."
    || value === ".."
    || DANGEROUS_KEYS.has(value)
    || !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/.test(value)
  ) {
    return failure(
      path === "classroomId" ? "invalid-classroom-id" : "invalid-operation-id",
      `${path} must be a non-empty ASCII stable identifier without path separators.`,
      path
    );
  }
  return null;
}

export function validateCoinIsoInstant(value: unknown, path: string): CoinFailure | null {
  if (typeof value !== "string") {
    return failure("invalid-date", `${path} must be a canonical ISO instant.`, path);
  }
  try {
    if (new Date(value).toISOString() !== value) {
      return failure("invalid-date", `${path} must be a canonical ISO instant.`, path);
    }
  } catch {
    return failure("invalid-date", `${path} must be a canonical ISO instant.`, path);
  }
  return null;
}

export function sealCoinClassState(
  state: Omit<CoinClassState, "integrity">,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinValidationResult {
  try {
    const resolved = resolveCoinLimits(limits);
    if (resolved.status === "rejected") return { status: "invalid", failure: resolved.failure };
    const shapeFailure = preflightJsonShape(state, resolved.limits);
    if (shapeFailure) return { status: "invalid", failure: shapeFailure };
    const checksum = calculateCoinStateChecksum(state);
    if (checksum.status === "rejected") {
      return { status: "invalid", failure: checksum.failure };
    }
    const sealed: CoinClassState = {
      ...state,
      integrity: {
        version: COIN_CHECKSUM_VERSION,
        checksum: checksum.checksum,
      },
    };
    return validateCoinClassState(sealed, resolved.limits);
  } catch {
    return { status: "invalid", failure: failure("unexpected-input", "The monetary state could not be sealed safely.") };
  }
}

export function validateCoinClassState(
  value: unknown,
  limits: CoinLimits = DEFAULT_COIN_LIMITS,
  expectedClassroomId?: string
): CoinValidationResult {
  try {
    const resolved = resolveCoinLimits(limits);
    if (resolved.status === "rejected") {
      return { status: "invalid", failure: resolved.failure };
    }
    return validateState(value, resolved.limits, expectedClassroomId);
  } catch {
    return {
      status: "invalid",
      failure: failure(
        "unexpected-input",
        "The monetary state could not be inspected safely."
      ),
    };
  }
}

function validateState(
  value: unknown,
  limits: CoinLimits,
  expectedClassroomId?: string
): CoinValidationResult {
  if (!isRecord(value)) return invalid("The monetary state is not an object.");
  const topLevelKeysFailure = requireExactKeys(value, [
    "schemaVersion", "classroomId", "settings", "balances", "rewards", "redemptions",
    "redemptionReversals", "movements", "idempotency", "revision", "integrity",
  ], "state");
  if (topLevelKeysFailure) return { status: "invalid", failure: topLevelKeysFailure };
  if (value.schemaVersion !== COIN_STATE_SCHEMA_VERSION) {
    return invalid("The monetary schema version is unsupported.", "schemaVersion");
  }
  const classroomFailure = validateCoinStableId(value.classroomId, "classroomId", limits);
  if (classroomFailure) return { status: "invalid", failure: classroomFailure };
  if (expectedClassroomId !== undefined && value.classroomId !== expectedClassroomId) {
    return {
      status: "invalid",
      failure: failure(
        "classroom-conflict",
        "The monetary state belongs to another classroom.",
        "classroomId"
      ),
    };
  }
  if (!isNonNegativeSafeInteger(value.revision)) {
    return invalid("The monetary revision is invalid.", "revision");
  }
  if (!isRecord(value.integrity)
    || requireExactKeys(value.integrity, ["version", "checksum"], "integrity")
    || value.integrity.version !== COIN_CHECKSUM_VERSION
    || typeof value.integrity.checksum !== "string") {
    return invalid("The monetary integrity contract is invalid.", "integrity");
  }

  if (!Array.isArray(value.balances)
    || !Array.isArray(value.rewards)
    || !Array.isArray(value.redemptions)
    || !Array.isArray(value.redemptionReversals)
    || !Array.isArray(value.movements)
    || !Array.isArray(value.idempotency)) {
    return invalid("One or more monetary collections are invalid.");
  }
  if (value.balances.length > limits.maxStudents) {
    return limitInvalid("Student balance limit exceeded.", "balances");
  }
  if (value.rewards.length > limits.maxRewards) {
    return limitInvalid("Reward limit exceeded.", "rewards");
  }
  if (value.movements.length > limits.maxMovements) {
    return limitInvalid("Movement limit exceeded.", "movements");
  }
  if (value.redemptions.length > limits.maxRedemptions) {
    return limitInvalid("Redemption limit exceeded.", "redemptions");
  }
  if (value.redemptionReversals.length > limits.maxRedemptionReversals) {
    return limitInvalid("Redemption reversal limit exceeded.", "redemptionReversals");
  }
  if (value.idempotency.length > limits.maxIdempotencyOperations) {
    return limitInvalid("Idempotency journal limit exceeded.", "idempotency");
  }

  const shapeFailure = preflightJsonShape(value, limits);
  if (shapeFailure) return { status: "invalid", failure: shapeFailure };

  const measured = measureCoinSerializedJson(value);
  if (measured.status === "rejected") {
    return { status: "invalid", failure: measured.failure };
  }
  if (
    measured.size.codeUnits > limits.maxPersistedCodeUnits
    || measured.size.utf8Bytes > limits.maxPersistedUtf8Bytes
  ) {
    return {
      status: "invalid",
      failure: failure(
        "size-limit-exceeded",
        "The monetary state exceeds the configured persisted-size budget."
      ),
    };
  }

  const checksum = calculateCoinStateChecksum(value as unknown as CoinClassState);
  if (checksum.status === "rejected") {
    return { status: "invalid", failure: checksum.failure };
  }
  if (checksum.checksum !== value.integrity.checksum) {
    return invalid("The monetary checksum does not match its content.", "integrity.checksum");
  }

  if (!isRecord(value.settings)) return invalid("Activation settings are invalid.", "settings");
  const settingsKeysFailure = requireExactKeys(value.settings,
    ["enabled", "firstActivatedAt", "updatedAt", "lastOperationId"], "settings");
  if (settingsKeysFailure) return { status: "invalid", failure: settingsKeysFailure };
  if (typeof value.settings.enabled !== "boolean") {
    return invalid("The activation flag is invalid.", "settings.enabled");
  }
  if (value.settings.firstActivatedAt !== null) {
    const dateFailure = validateCoinIsoInstant(
      value.settings.firstActivatedAt,
      "settings.firstActivatedAt"
    );
    if (dateFailure) return { status: "invalid", failure: dateFailure };
  }
  if (value.settings.updatedAt !== null) {
    const dateFailure = validateCoinIsoInstant(value.settings.updatedAt, "settings.updatedAt");
    if (dateFailure) return { status: "invalid", failure: dateFailure };
  }
  if (value.settings.enabled && value.settings.firstActivatedAt === null) {
    return invalid("Enabled coins require a first activation instant.", "settings");
  }
  if (
    (value.settings.lastOperationId === null) !== (value.settings.updatedAt === null)
  ) {
    return invalid("Activation metadata is incomplete.", "settings");
  }

  if (value.idempotency.length !== value.revision) {
    return invalid("Every monetary revision requires exactly one journal record.", "idempotency");
  }

  const journalResult = validateJournal(value.idempotency, value.revision as number, limits);
  if (journalResult.failure) return { status: "invalid", failure: journalResult.failure };
  const journal = journalResult.byOperation;

  if (value.settings.lastOperationId !== null) {
    const settingsOperationFailure = validateCoinStableId(
      value.settings.lastOperationId,
      "settings.lastOperationId",
      limits
    );
    if (settingsOperationFailure) return { status: "invalid", failure: settingsOperationFailure };
    const settingsOperation = journal.get(value.settings.lastOperationId as string);
    if (settingsOperation?.kind !== "set-enabled" || settingsOperation.outcome !== "applied") {
      return invalid("Activation metadata does not reference an activation operation.", "settings");
    }
  }

  const balances = new Map<string, number>();
  for (let index = 0; index < value.balances.length; index += 1) {
    const entry = value.balances[index];
    if (!isRecord(entry)) return invalid("A student balance is invalid.", `balances.${index}`);
    const keysFailure = requireExactKeys(entry, ["studentId", "balance"], `balances.${index}`);
    if (keysFailure) return { status: "invalid", failure: keysFailure };
    const idFailure = validateCoinStableId(entry.studentId, `balances.${index}.studentId`, limits);
    if (idFailure) return { status: "invalid", failure: { ...idFailure, code: "invalid-student-id" } };
    if (balances.has(entry.studentId as string)) {
      return invalid("Student balances contain a duplicate.", `balances.${index}.studentId`);
    }
    if (!isBalance(entry.balance, limits)) {
      return invalid("A student balance is outside the allowed range.", `balances.${index}.balance`);
    }
    balances.set(entry.studentId as string, entry.balance as number);
  }

  const rewardsResult = validateRewards(value.rewards, journal, limits, value.revision as number);
  if (rewardsResult.failure) return { status: "invalid", failure: rewardsResult.failure };
  const redemptionsResult = validateRedemptions(
    value.redemptions,
    journal,
    balances,
    rewardsResult.byId,
    limits,
    value.classroomId as string,
    value.revision as number
  );
  if (redemptionsResult.failure) return { status: "invalid", failure: redemptionsResult.failure };
  const reversalsResult = validateReversals(
    value.redemptionReversals,
    journal,
    redemptionsResult.byId,
    limits,
    value.classroomId as string,
    value.revision as number
  );
  if (reversalsResult.failure) return { status: "invalid", failure: reversalsResult.failure };
  const movementsResult = validateMovements(
    value.movements,
    journal,
    balances,
    redemptionsResult.byId,
    reversalsResult.byRedemption,
    limits,
    value.classroomId as string,
    value.revision as number
  );
  if (movementsResult.failure) return { status: "invalid", failure: movementsResult.failure };
  const relationFailure = validateBidirectionalRelations(
    journal,
    balances,
    rewardsResult.byId,
    redemptionsResult.byId,
    reversalsResult.byRedemption,
    reversalsResult.byId,
    movementsResult.byId
  );
  if (relationFailure) return { status: "invalid", failure: relationFailure };

  for (const [studentId, balance] of balances) {
    const refundable = value.redemptions.reduce((total, item) => {
      if (item.studentId !== studentId || reversalsResult.byRedemption.has(item.id)) return total;
      return total + (item.rewardPriceSnapshot as number);
    }, 0);
    if (!Number.isSafeInteger(refundable) || balance + refundable > limits.maxBalance) {
      return invalid(
        "A balance does not reserve enough capacity for exact redemption reversals.",
        `balances.${studentId}`
      );
    }
  }

  return { status: "valid", state: value as unknown as CoinClassState };
}

function validateJournal(
  entries: readonly unknown[],
  revision: number,
  limits: CoinLimits
): { readonly byOperation: Map<string, CoinIdempotencyRecord>; readonly failure?: CoinFailure } {
  const byOperation = new Map<string, CoinIdempotencyRecord>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isRecord(entry)) {
      return { byOperation, failure: failure("invalid-state", "A journal record is invalid.", `idempotency.${index}`) };
    }
    const keysFailure = requireExactKeys(entry,
      ["operationId", "kind", "fingerprint", "resultingRevision", "outcome", "failureCode", "resultReference"],
      `idempotency.${index}`, ["failureCode", "resultReference"]);
    if (keysFailure) return { byOperation, failure: keysFailure };
    const idFailure = validateCoinStableId(entry.operationId, `idempotency.${index}.operationId`, limits);
    if (idFailure) return { byOperation, failure: idFailure };
    if (byOperation.has(entry.operationId as string)) {
      return { byOperation, failure: failure("invalid-state", "Journal operation IDs must be unique.", `idempotency.${index}`) };
    }
    if (!OPERATION_KINDS.has(entry.kind as CoinOperationKind)) {
      return { byOperation, failure: failure("invalid-state", "A journal operation kind is invalid.", `idempotency.${index}.kind`) };
    }
    if (
      typeof entry.fingerprint !== "string"
      || !new RegExp(`^${COIN_OPERATION_FINGERPRINT_VERSION}:[0-9a-f]{16}$`).test(entry.fingerprint)
    ) {
      return { byOperation, failure: failure("invalid-state", "A journal fingerprint is invalid.", `idempotency.${index}.fingerprint`) };
    }
    if (!isPositiveSafeInteger(entry.resultingRevision)
      || entry.resultingRevision !== index + 1
      || entry.resultingRevision > revision) {
      return { byOperation, failure: failure("invalid-state", "Journal revisions are not contiguous.", `idempotency.${index}.resultingRevision`) };
    }
    if (entry.outcome !== "applied" && entry.outcome !== "rejected") {
      return { byOperation, failure: failure("invalid-state", "A journal outcome is invalid.", `idempotency.${index}.outcome`) };
    }
    if (entry.outcome === "rejected") {
      if (!FAILURE_CODES.has(entry.failureCode as CoinFailureCode) || entry.resultReference !== undefined) {
        return { byOperation, failure: failure("invalid-state", "A rejected journal record must contain only a valid failure code.", `idempotency.${index}`) };
      }
    } else if (entry.failureCode !== undefined) {
      return { byOperation, failure: failure("invalid-state", "An applied journal record cannot contain a failure code.", `idempotency.${index}.failureCode`) };
    }
    if (entry.resultReference !== undefined) {
      const refFailure = validateCoinStableId(entry.resultReference, `idempotency.${index}.resultReference`, limits);
      if (refFailure) return { byOperation, failure: refFailure };
    }
    byOperation.set(entry.operationId as string, entry as unknown as CoinIdempotencyRecord);
  }
  return { byOperation };
}

function validateRewards(
  entries: readonly unknown[],
  journal: ReadonlyMap<string, CoinIdempotencyRecord>,
  limits: CoinLimits,
  stateRevision: number
): { readonly byId: Map<string, CoinReward>; readonly failure?: CoinFailure } {
  const byId = new Map<string, CoinReward>();
  const orders = new Set<number>();
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    if (!isRecord(item)) return { byId, failure: failure("invalid-state", "A reward is invalid.", `rewards.${index}`) };
    const keysFailure = requireExactKeys(item,
      ["id", "name", "description", "price", "status", "order", "revision", "createdAt", "updatedAt", "lastOperationId"],
      `rewards.${index}`, ["description"]);
    if (keysFailure) return { byId, failure: keysFailure };
    const idFailure = validateCoinStableId(item.id, `rewards.${index}.id`, limits);
    if (idFailure) return { byId, failure: { ...idFailure, code: "invalid-reward" } };
    if (byId.has(item.id as string)) return { byId, failure: failure("invalid-state", "Reward IDs must be unique.", `rewards.${index}.id`) };
    if (!isRequiredText(item.name, limits.maxRewardNameLength)) {
      return { byId, failure: failure("invalid-state", "A reward name is invalid.", `rewards.${index}.name`) };
    }
    if (item.description !== undefined && !isOptionalStoredText(item.description, limits.maxRewardDescriptionLength)) {
      return { byId, failure: failure("invalid-state", "A reward description is invalid.", `rewards.${index}.description`) };
    }
    if (!isPositiveAmount(item.price, limits)) {
      return { byId, failure: failure("invalid-state", "A reward price is invalid.", `rewards.${index}.price`) };
    }
    if (item.status !== "active" && item.status !== "archived") {
      return { byId, failure: failure("invalid-state", "A reward status is invalid.", `rewards.${index}.status`) };
    }
    if (!isNonNegativeSafeInteger(item.order) || (item.order as number) >= entries.length || orders.has(item.order as number)) {
      return { byId, failure: failure("invalid-state", "Reward order must be unique and contiguous.", `rewards.${index}.order`) };
    }
    orders.add(item.order as number);
    if (!isPositiveSafeInteger(item.revision) || (item.revision as number) > stateRevision) {
      return { byId, failure: failure("invalid-state", "A reward revision is invalid.", `rewards.${index}.revision`) };
    }
    const createdFailure = validateCoinIsoInstant(item.createdAt, `rewards.${index}.createdAt`);
    if (createdFailure) return { byId, failure: createdFailure };
    const updatedFailure = validateCoinIsoInstant(item.updatedAt, `rewards.${index}.updatedAt`);
    if (updatedFailure) return { byId, failure: updatedFailure };
    const operationFailure = validateCoinStableId(item.lastOperationId, `rewards.${index}.lastOperationId`, limits);
    if (operationFailure) return { byId, failure: operationFailure };
    const operation = journal.get(item.lastOperationId as string);
    if (!operation
      || operation.outcome !== "applied"
      || !REWARD_OPERATION_KINDS.has(operation.kind)
      || (operation.kind !== "reorder-rewards" && operation.resultReference !== item.id)) {
      return { byId, failure: failure("invalid-state", "Reward metadata does not reference a reward operation.", `rewards.${index}.lastOperationId`) };
    }
    byId.set(item.id as string, item as unknown as CoinReward);
  }
  return { byId };
}

function validateRedemptions(
  entries: readonly unknown[],
  journal: ReadonlyMap<string, CoinIdempotencyRecord>,
  balances: ReadonlyMap<string, number>,
  rewards: ReadonlyMap<string, CoinReward>,
  limits: CoinLimits,
  classroomId: string,
  stateRevision: number
): { readonly byId: Map<string, CoinRedemption>; readonly failure?: CoinFailure } {
  const byId = new Map<string, CoinRedemption>();
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    if (!isRecord(item)) return { byId, failure: failure("invalid-state", "A redemption is invalid.", `redemptions.${index}`) };
    const keysFailure = requireExactKeys(item,
      ["id", "classroomId", "studentId", "rewardId", "operationId", "movementId", "rewardNameSnapshot",
        "rewardPriceSnapshot", "occurredAt", "reason", "stateRevision"],
      `redemptions.${index}`, ["reason"]);
    if (keysFailure) return { byId, failure: keysFailure };
    for (const [field, code] of [["id", "invalid-redemption"], ["studentId", "invalid-student-id"], ["rewardId", "invalid-reward"], ["operationId", "invalid-operation-id"], ["movementId", "invalid-operation-id"]] as const) {
      const idFailure = validateCoinStableId(item[field], `redemptions.${index}.${field}`, limits);
      if (idFailure) return { byId, failure: { ...idFailure, code } };
    }
    if (byId.has(item.id as string)) return { byId, failure: failure("invalid-state", "Redemption IDs must be unique.", `redemptions.${index}.id`) };
    if (item.classroomId !== classroomId
      || !balances.has(item.studentId as string)
      || !rewards.has(item.rewardId as string)) {
      return { byId, failure: failure("invalid-state", "A redemption references another class or an unknown student.", `redemptions.${index}`) };
    }
    const operation = journal.get(item.operationId as string);
    if (item.operationId !== item.movementId
      || operation?.kind !== "redeem-reward"
      || operation.outcome !== "applied"
      || operation.resultReference !== item.id) {
      return { byId, failure: failure("invalid-state", "A redemption operation link is invalid.", `redemptions.${index}`) };
    }
    if (!isRequiredText(item.rewardNameSnapshot, limits.maxRewardNameLength) || !isPositiveAmount(item.rewardPriceSnapshot, limits)) {
      return { byId, failure: failure("invalid-state", "A redemption snapshot is invalid.", `redemptions.${index}`) };
    }
    if (item.reason !== undefined && !isOptionalStoredText(item.reason, limits.maxReasonLength)) {
      return { byId, failure: failure("invalid-state", "A redemption reason is invalid.", `redemptions.${index}.reason`) };
    }
    const dateFailure = validateCoinIsoInstant(item.occurredAt, `redemptions.${index}.occurredAt`);
    if (dateFailure) return { byId, failure: dateFailure };
    if (!isStateRevision(item.stateRevision, stateRevision)) {
      return { byId, failure: failure("invalid-state", "A redemption state revision is invalid.", `redemptions.${index}.stateRevision`) };
    }
    byId.set(item.id as string, item as unknown as CoinRedemption);
  }
  return { byId };
}

function validateReversals(
  entries: readonly unknown[],
  journal: ReadonlyMap<string, CoinIdempotencyRecord>,
  redemptions: ReadonlyMap<string, CoinRedemption>,
  limits: CoinLimits,
  classroomId: string,
  stateRevision: number
): {
  readonly byRedemption: Map<string, CoinRedemptionReversal>;
  readonly byId: Map<string, CoinRedemptionReversal>;
  readonly failure?: CoinFailure;
} {
  const byRedemption = new Map<string, CoinRedemptionReversal>();
  const byId = new Map<string, CoinRedemptionReversal>();
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    if (!isRecord(item)) return { byRedemption, byId, failure: failure("invalid-state", "A redemption reversal is invalid.", `redemptionReversals.${index}`) };
    const keysFailure = requireExactKeys(item,
      ["id", "classroomId", "studentId", "redemptionId", "operationId", "originalMovementId",
        "compensationMovementId", "occurredAt", "reason", "stateRevision"],
      `redemptionReversals.${index}`, ["reason"]);
    if (keysFailure) return { byRedemption, byId, failure: keysFailure };
    for (const field of ["id", "studentId", "redemptionId", "operationId", "originalMovementId", "compensationMovementId"] as const) {
      const idFailure = validateCoinStableId(item[field], `redemptionReversals.${index}.${field}`, limits);
      if (idFailure) return { byRedemption, byId, failure: idFailure };
    }
    if (byId.has(item.id as string) || byRedemption.has(item.redemptionId as string)) {
      return { byRedemption, byId, failure: failure("invalid-state", "A redemption may have only one uniquely identified reversal.", `redemptionReversals.${index}`) };
    }
    const redemption = redemptions.get(item.redemptionId as string);
    if (!redemption || item.classroomId !== classroomId || item.studentId !== redemption.studentId) {
      return { byRedemption, byId, failure: failure("invalid-state", "A reversal does not match its redemption.", `redemptionReversals.${index}`) };
    }
    if (
      item.originalMovementId !== redemption.movementId
      || item.operationId !== item.compensationMovementId
      || journal.get(item.operationId as string)?.kind !== "reverse-redemption"
      || journal.get(item.operationId as string)?.outcome !== "applied"
      || journal.get(item.operationId as string)?.resultReference !== item.id
    ) {
      return { byRedemption, byId, failure: failure("invalid-state", "A reversal movement link is invalid.", `redemptionReversals.${index}`) };
    }
    if (item.reason !== undefined && !isOptionalStoredText(item.reason, limits.maxReasonLength)) {
      return { byRedemption, byId, failure: failure("invalid-state", "A reversal reason is invalid.", `redemptionReversals.${index}.reason`) };
    }
    const dateFailure = validateCoinIsoInstant(item.occurredAt, `redemptionReversals.${index}.occurredAt`);
    if (dateFailure) return { byRedemption, byId, failure: dateFailure };
    if (!isStateRevision(item.stateRevision, stateRevision)) {
      return { byRedemption, byId, failure: failure("invalid-state", "A reversal state revision is invalid.", `redemptionReversals.${index}.stateRevision`) };
    }
    const reversal = item as unknown as CoinRedemptionReversal;
    byId.set(reversal.id, reversal);
    byRedemption.set(reversal.redemptionId, reversal);
  }
  return { byRedemption, byId };
}

function validateMovements(
  entries: readonly unknown[],
  journal: ReadonlyMap<string, CoinIdempotencyRecord>,
  balances: ReadonlyMap<string, number>,
  redemptions: ReadonlyMap<string, CoinRedemption>,
  reversals: ReadonlyMap<string, CoinRedemptionReversal>,
  limits: CoinLimits,
  classroomId: string,
  stateRevision: number
): { readonly byId: Map<string, CoinMovement>; readonly failure?: CoinFailure } {
  const running = new Map([...balances.keys()].map((studentId) => [studentId, 0]));
  const byId = new Map<string, CoinMovement>();
  let previousStateRevision = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    if (!isRecord(item)) return { byId, failure: failure("invalid-state", "A movement is invalid.", `movements.${index}`) };
    const keysFailure = requireExactKeys(item,
      ["id", "classroomId", "studentId", "operationId", "cause", "requestedAmount", "appliedAmount",
        "balanceBefore", "balanceAfter", "occurredAt", "stateRevision"], `movements.${index}`);
    if (keysFailure) return { byId, failure: keysFailure };
    for (const field of ["id", "studentId", "operationId"] as const) {
      const idFailure = validateCoinStableId(item[field], `movements.${index}.${field}`, limits);
      if (idFailure) return { byId, failure: idFailure };
    }
    if (item.id !== item.operationId || byId.has(item.id as string)) {
      return { byId, failure: failure("invalid-state", "Movement IDs must be unique operation IDs.", `movements.${index}.id`) };
    }
    if (item.classroomId !== classroomId || !running.has(item.studentId as string)) {
      return { byId, failure: failure("invalid-state", "A movement references another class or an unknown student.", `movements.${index}`) };
    }
    if (!isSignedAmount(item.requestedAmount, limits)
      || !isSignedAmount(item.appliedAmount, limits)
      || !isBalance(item.balanceBefore, limits)
      || !isBalance(item.balanceAfter, limits)
      || item.balanceAfter !== (item.balanceBefore as number) + (item.appliedAmount as number)
      || Math.abs(item.appliedAmount as number) > Math.abs(item.requestedAmount as number)
      || ((item.requestedAmount as number) > 0 && (item.appliedAmount as number) < 0)
      || ((item.requestedAmount as number) < 0 && (item.appliedAmount as number) > 0)) {
      return { byId, failure: failure("invalid-state", "A movement amount or balance equation is invalid.", `movements.${index}`) };
    }
    if (running.get(item.studentId as string) !== item.balanceBefore) {
      return { byId, failure: failure("invalid-state", "Movement history is not contiguous for its student.", `movements.${index}.balanceBefore`) };
    }
    if (!isStateRevision(item.stateRevision, stateRevision) || (item.stateRevision as number) <= previousStateRevision) {
      return { byId, failure: failure("invalid-state", "Movement state revisions must be strictly increasing.", `movements.${index}.stateRevision`) };
    }
    const dateFailure = validateCoinIsoInstant(item.occurredAt, `movements.${index}.occurredAt`);
    if (dateFailure) return { byId, failure: dateFailure };
    if (!isRecord(item.cause)) return { byId, failure: failure("invalid-state", "A movement cause is invalid.", `movements.${index}.cause`) };
    const operation = journal.get(item.operationId as string);
    const causeFailure = validateMovementCause(
      item as unknown as CoinMovement,
      operation,
      redemptions,
      reversals,
      limits,
      index
    );
    if (causeFailure) return { byId, failure: causeFailure };
    byId.set(item.id as string, item as unknown as CoinMovement);
    previousStateRevision = item.stateRevision as number;
    running.set(item.studentId as string, item.balanceAfter as number);
  }
  for (const [studentId, expected] of balances) {
    if (running.get(studentId) !== expected) {
      return { byId, failure: failure("invalid-state", "Stored balances do not match movement history.", `balances.${studentId}`) };
    }
  }
  return { byId };
}

function validateMovementCause(
  movement: CoinMovement,
  operation: CoinIdempotencyRecord | undefined,
  redemptions: ReadonlyMap<string, CoinRedemption>,
  reversals: ReadonlyMap<string, CoinRedemptionReversal>,
  limits: CoinLimits,
  index: number
): CoinFailure | null {
  const cause = movement.cause;
  if (cause.type === "action") {
    const keysFailure = requireExactKeys(cause,
      ["type", "actionId", "configurationMode", "usedLegacyDefault"], `movements.${index}.cause`);
    if (keysFailure) return keysFailure;
    const idFailure = validateCoinStableId(cause.actionId, `movements.${index}.cause.actionId`, limits);
    if (idFailure) return idFailure;
    if (operation?.kind !== "apply-action"
      || operation.outcome !== "applied"
      || !["same-as-crystals", "custom"].includes(cause.configurationMode)
      || typeof cause.usedLegacyDefault !== "boolean"
      || movement.requestedAmount === 0
      || (movement.requestedAmount > 0 && movement.appliedAmount !== movement.requestedAmount)) {
      return failure("invalid-state", "An action movement cause is invalid.", `movements.${index}.cause`);
    }
    return null;
  }
  if (cause.type === "redemption") {
    const keysFailure = requireExactKeys(cause,
      ["type", "redemptionId", "rewardId"], `movements.${index}.cause`);
    if (keysFailure) return keysFailure;
    const redemption = redemptions.get(cause.redemptionId);
    if (
      operation?.kind !== "redeem-reward"
      || operation.outcome !== "applied"
      || !redemption
      || redemption.movementId !== movement.id
      || redemption.rewardId !== cause.rewardId
      || movement.requestedAmount !== -redemption.rewardPriceSnapshot
      || movement.appliedAmount !== movement.requestedAmount
    ) {
      return failure("invalid-state", "A redemption movement cause is invalid.", `movements.${index}.cause`);
    }
    return null;
  }
  if (cause.type === "redemption-reversal") {
    const keysFailure = requireExactKeys(cause,
      ["type", "reversalId", "redemptionId", "originalMovementId"], `movements.${index}.cause`);
    if (keysFailure) return keysFailure;
    const reversal = reversals.get(cause.redemptionId);
    const redemption = redemptions.get(cause.redemptionId);
    if (
      operation?.kind !== "reverse-redemption"
      || operation.outcome !== "applied"
      || !reversal
      || !redemption
      || reversal.id !== cause.reversalId
      || reversal.compensationMovementId !== movement.id
      || cause.originalMovementId !== redemption.movementId
      || movement.requestedAmount !== redemption.rewardPriceSnapshot
      || movement.appliedAmount !== movement.requestedAmount
    ) {
      return failure("invalid-state", "A reversal movement cause is invalid.", `movements.${index}.cause`);
    }
    return null;
  }
  if (cause.type === "administrative-adjustment") {
    const keysFailure = requireExactKeys(cause,
      ["type", "reason"], `movements.${index}.cause`);
    if (keysFailure) return keysFailure;
    if (operation?.kind !== "administrative-adjustment"
      || operation.outcome !== "applied"
      || !isRequiredText(cause.reason, limits.maxReasonLength)
      || movement.requestedAmount === 0
      || (movement.requestedAmount > 0 && movement.appliedAmount !== movement.requestedAmount)) {
      return failure("invalid-state", "An administrative adjustment cause is invalid.", `movements.${index}.cause`);
    }
    return null;
  }
  return failure("invalid-state", "The movement cause type is unsupported.", `movements.${index}.cause`);
}

function validateBidirectionalRelations(
  journal: ReadonlyMap<string, CoinIdempotencyRecord>,
  balances: ReadonlyMap<string, number>,
  rewards: ReadonlyMap<string, CoinReward>,
  redemptions: ReadonlyMap<string, CoinRedemption>,
  reversalsByRedemption: ReadonlyMap<string, CoinRedemptionReversal>,
  reversalsById: ReadonlyMap<string, CoinRedemptionReversal>,
  movements: ReadonlyMap<string, CoinMovement>
): CoinFailure | null {
  for (const redemption of redemptions.values()) {
    const movement = movements.get(redemption.movementId);
    if (!rewards.has(redemption.rewardId)
      || !movement
      || movement.studentId !== redemption.studentId
      || movement.occurredAt !== redemption.occurredAt
      || movement.stateRevision !== redemption.stateRevision
      || movement.cause.type !== "redemption"
      || movement.cause.redemptionId !== redemption.id
      || movement.cause.rewardId !== redemption.rewardId) {
      return failure("invalid-state", "A redemption is not backed by its exact reward and movement.", `redemptions.${redemption.id}`);
    }
  }

  for (const reversal of reversalsById.values()) {
    const redemption = redemptions.get(reversal.redemptionId);
    const original = movements.get(reversal.originalMovementId);
    const compensation = movements.get(reversal.compensationMovementId);
    if (!redemption
      || !original
      || !compensation
      || original.id !== redemption.movementId
      || compensation.studentId !== reversal.studentId
      || compensation.occurredAt !== reversal.occurredAt
      || compensation.stateRevision !== reversal.stateRevision
      || compensation.cause.type !== "redemption-reversal"
      || compensation.cause.reversalId !== reversal.id
      || compensation.cause.redemptionId !== reversal.redemptionId
      || compensation.cause.originalMovementId !== original.id) {
      return failure("invalid-state", "A reversal is not backed by its exact original and compensation movements.", `redemptionReversals.${reversal.id}`);
    }
  }

  for (const record of journal.values()) {
    if (record.outcome === "rejected") continue;
    const reference = record.resultReference;
    const operationRevisionMatches = (entity: { readonly stateRevision: number } | undefined) =>
      entity?.stateRevision === record.resultingRevision;
    if (record.kind === "set-enabled" || record.kind === "reorder-rewards") {
      if (reference !== undefined) {
        return failure("invalid-state", "This operation kind cannot reference a result entity.", `idempotency.${record.operationId}.resultReference`);
      }
      continue;
    }
    if (record.kind === "register-student") {
      if (reference === undefined || !balances.has(reference)) {
        return failure("invalid-state", "A registration result does not reference its student balance.", `idempotency.${record.operationId}.resultReference`);
      }
      continue;
    }
    if (record.kind === "apply-action" || record.kind === "administrative-adjustment") {
      const movement = reference === undefined ? undefined : movements.get(reference);
      if (record.kind === "administrative-adjustment"
        ? (!movement || !operationRevisionMatches(movement))
        : (reference !== undefined && (!movement || !operationRevisionMatches(movement)))) {
        return failure("invalid-state", "A movement operation result reference is invalid.", `idempotency.${record.operationId}.resultReference`);
      }
      if (movement && movement.operationId !== record.operationId) {
        return failure("invalid-state", "A movement result belongs to another operation.", `idempotency.${record.operationId}.resultReference`);
      }
      continue;
    }
    if (REWARD_OPERATION_KINDS.has(record.kind)) {
      if (reference === undefined || !rewards.has(reference)) {
        return failure("invalid-state", "A reward operation result reference is invalid.", `idempotency.${record.operationId}.resultReference`);
      }
      continue;
    }
    if (record.kind === "redeem-reward") {
      const redemption = reference === undefined ? undefined : redemptions.get(reference);
      if (!redemption || redemption.operationId !== record.operationId || !operationRevisionMatches(redemption)) {
        return failure("invalid-state", "A redemption result reference is invalid.", `idempotency.${record.operationId}.resultReference`);
      }
      continue;
    }
    if (record.kind === "reverse-redemption") {
      const reversal = reference === undefined ? undefined : reversalsById.get(reference);
      if (!reversal || reversal.operationId !== record.operationId || !operationRevisionMatches(reversal)) {
        return failure("invalid-state", "A reversal result reference is invalid.", `idempotency.${record.operationId}.resultReference`);
      }
    }
  }

  for (const [redemptionId] of reversalsByRedemption) {
    if (!redemptions.has(redemptionId)) {
      return failure("invalid-state", "A reversal references a missing redemption.", `redemptionReversals.${redemptionId}`);
    }
  }
  return null;
}

function requireExactKeys(
  value: object,
  allowedKeys: readonly string[],
  path: string,
  optionalKeys: readonly string[] = []
): CoinFailure | null {
  const allowed = new Set(allowedKeys);
  const optional = new Set(optionalKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return failure("invalid-state", "Unexpected monetary state field.", `${path}.${key}`);
    }
  }
  for (const key of allowed) {
    if (!optional.has(key) && !Object.prototype.hasOwnProperty.call(value, key)) {
      return failure("invalid-state", "A required monetary state field is missing.", `${path}.${key}`);
    }
  }
  return null;
}

function preflightJsonShape(value: unknown, limits: CoinLimits): CoinFailure | null {
  const maxNodes = Math.min(500_000, Math.max(10_000, limits.maxPersistedCodeUnits));
  const stack: Array<{ readonly value: unknown; readonly depth: number; readonly path: string }> = [
    { value, depth: 0, path: "state" },
  ];
  let nodes = 0;
  let inspectedCodeUnits = 0;
  while (stack.length > 0) {
    const current = stack.pop() as { readonly value: unknown; readonly depth: number; readonly path: string };
    nodes += 1;
    if (nodes > maxNodes) {
      return failure("size-limit-exceeded", "The monetary state is too structurally large to inspect safely.", current.path);
    }
    if (current.depth > 24) {
      return failure("invalid-state", "The monetary state exceeds the maximum nesting depth.", current.path);
    }
    const item = current.value;
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "string") {
      inspectedCodeUnits += item.length;
      if (inspectedCodeUnits > limits.maxPersistedCodeUnits) {
        return failure("size-limit-exceeded", "The monetary state contains more text than the persisted-size budget.", current.path);
      }
      continue;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return failure("invalid-state", "Non-finite numbers are not valid monetary state.", current.path);
      continue;
    }
    if (typeof item !== "object") {
      return failure("invalid-state", "The monetary state contains a non-JSON value.", current.path);
    }
    const array = Array.isArray(item);
    if (array && item.length > maxNodes) {
      return failure("size-limit-exceeded", "A monetary array is too large to inspect safely.", current.path);
    }
    if (!array) {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        return failure("invalid-state", "Monetary objects must have a plain prototype.", current.path);
      }
    }
    const keys = Reflect.ownKeys(item);
    if (array && keys.filter((key) => key !== "length").length !== item.length) {
      return failure("invalid-state", "Sparse or decorated arrays are not valid monetary state.", current.path);
    }
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string" || DANGEROUS_KEYS.has(key)) {
        return failure("invalid-state", "The monetary state contains a forbidden field.", `${current.path}.${String(key)}`);
      }
      inspectedCodeUnits += key.length;
      if (inspectedCodeUnits > limits.maxPersistedCodeUnits) {
        return failure("size-limit-exceeded", "The monetary state is too large to inspect safely.", current.path);
      }
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return failure("invalid-state", "Accessor or hidden properties are not valid monetary state.", `${current.path}.${key}`);
      }
      stack.push({ value: descriptor.value, depth: current.depth + 1, path: `${current.path}.${key}` });
    }
  }
  return null;
}

function isRequiredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && value.trim() === value;
}

function isOptionalStoredText(value: unknown, maxLength: number): value is string {
  return isRequiredText(value, maxLength);
}

function isPositiveAmount(value: unknown, limits: CoinLimits): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= limits.maxAmount;
}

function isSignedAmount(value: unknown, limits: CoinLimits): value is number {
  return Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && Math.abs(value as number) <= limits.maxAmount;
}

function isBalance(value: unknown, limits: CoinLimits): value is number {
  return isNonNegativeSafeInteger(value) && (value as number) <= limits.maxBalance;
}

function isStateRevision(value: unknown, revision: number): value is number {
  return isPositiveSafeInteger(value) && (value as number) <= revision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0) && (value as number) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function invalid(message: string, path?: string): CoinValidationResult {
  return { status: "invalid", failure: failure("invalid-state", message, path) };
}

function limitInvalid(message: string, path: string): CoinValidationResult {
  return { status: "invalid", failure: failure("limit-exceeded", message, path) };
}

function failure(
  code: CoinFailure["code"],
  message: string,
  path?: string
): CoinFailure {
  return { code, message, ...(path ? { path } : {}) };
}
