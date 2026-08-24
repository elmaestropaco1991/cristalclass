/**
 * Pure storage sizing shared by curriculum producers and the storage protocol.
 *
 * `codeUnits` is JavaScript string length (UTF-16 code units). `utf8Bytes` is the
 * encoded UTF-8 size useful for comparison and telemetry. Neither value is claimed
 * to be a browser's quota accounting unit: localStorage quotas and implementation
 * overhead vary, so callers must be able to lower these budgets for their runtime.
 */
export interface CurriculumSerializedSize {
  readonly codeUnits: number;
  readonly utf8Bytes: number;
}

export interface CurriculumStorageBudgetLimits {
  /** Maximum serialized import state, including its compact journal. */
  readonly maxPersistedStateCodeUnits: number;
  /** Maximum serialized size of one durable journal entry. */
  readonly maxJournalEntryCodeUnits: number;
  /** Maximum serialized size of the complete durable journal. */
  readonly maxJournalCodeUnits: number;
  /** No history is removed automatically when this count is reached. */
  readonly maxJournalEntries: number;
  /** Maximum estimated simultaneous storage values for one transition. */
  readonly maxProtocolPeakCodeUnits: number;
}

export const DEFAULT_CURRICULUM_STORAGE_BUDGET: CurriculumStorageBudgetLimits = Object.freeze({
  maxPersistedStateCodeUnits: 1_250_000,
  maxJournalEntryCodeUnits: 65_536,
  maxJournalCodeUnits: 262_144,
  maxJournalEntries: 500,
  maxProtocolPeakCodeUnits: 4_000_000,
});

/**
 * The active transaction protocol has, at its worst stable point, three full
 * envelopes: promoted current, target embedded in transaction, and previous current
 * embedded in the new backup. Review/transaction/backup metadata add small overhead.
 * Existing historical backups are additional and unbounded because no automatic
 * retention or deletion policy exists yet.
 */
export const CURRICULUM_STORAGE_PROTOCOL_SIZE_SEMANTICS = Object.freeze({
  maximumConcurrentFullEnvelopesPerTransition: 3,
  includesCurrent: true,
  includesTransactionTarget: true,
  includesBackupPrevious: true,
  includesReviewMetadata: true,
  automaticallyDeletesHistoricalBackups: false,
  historicalBackupGrowthIsBounded: false,
  assumesUniversalLocalStorageQuota: false,
} as const);

export interface CurriculumStorageProtocolEstimateInput {
  readonly currentState: unknown | null;
  readonly targetState: unknown;
  /** Previously retained backup values not represented by `currentState`. */
  readonly retainedBackupCodeUnits?: number;
}

export interface CurriculumStorageProtocolEstimate {
  readonly currentState: CurriculumSerializedSize;
  readonly targetState: CurriculumSerializedSize;
  readonly targetEnvelope: CurriculumSerializedSize;
  readonly transaction: CurriculumSerializedSize;
  readonly newBackup: CurriculumSerializedSize;
  readonly review: CurriculumSerializedSize;
  readonly beforePromotion: CurriculumSerializedSize;
  readonly afterPromotion: CurriculumSerializedSize;
  readonly worstCase: CurriculumSerializedSize;
  readonly retainedBackupCodeUnits: number;
  /** Informative ratio; the exact budget decision uses `worstCase.codeUnits`. */
  readonly fullEnvelopeMultiplier: number;
}

export function resolveCurriculumStorageBudget(
  overrides: Partial<CurriculumStorageBudgetLimits> = {}
): CurriculumStorageBudgetLimits {
  const unknownKeys = Object.keys(overrides).filter(
    (key) => !Object.hasOwn(DEFAULT_CURRICULUM_STORAGE_BUDGET, key)
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown curriculum storage budget: ${unknownKeys.join(", ")}.`);
  }
  const resolved = { ...DEFAULT_CURRICULUM_STORAGE_BUDGET, ...overrides };
  Object.entries(resolved).forEach(([key, value]) => {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Curriculum storage budget ${key} must be a positive safe integer.`);
    }
  });
  return Object.freeze(resolved);
}

export function measureCurriculumSerializedJson(value: unknown): CurriculumSerializedSize {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("The value cannot be represented as JSON.");
  }
  return measureCurriculumJsonText(serialized);
}

export function measureCurriculumJsonText(text: string): CurriculumSerializedSize {
  let utf8Bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    if (first <= 0x7f) {
      utf8Bytes += 1;
    } else if (first <= 0x7ff) {
      utf8Bytes += 2;
    } else if (
      first >= 0xd800
      && first <= 0xdbff
      && text.charCodeAt(index + 1) >= 0xdc00
      && text.charCodeAt(index + 1) <= 0xdfff
    ) {
      utf8Bytes += 4;
      index += 1;
    } else {
      utf8Bytes += 3;
    }
  }
  return { codeUnits: text.length, utf8Bytes };
}

/**
 * Mirrors the value duplication in `curriculumStorageService` without writing or
 * depending on a browser storage global. Identifiers and timestamps are fixed deterministic
 * samples; the estimate includes their real JSON overhead.
 */
export function estimateCurriculumStorageProtocolPeak(
  input: CurriculumStorageProtocolEstimateInput
): CurriculumStorageProtocolEstimate {
  const retainedBackupCodeUnits = input.retainedBackupCodeUnits ?? 0;
  if (!Number.isSafeInteger(retainedBackupCodeUnits) || retainedBackupCodeUnits < 0) {
    throw new Error("retainedBackupCodeUnits must be a non-negative safe integer.");
  }
  const currentStateSize = input.currentState === null
    ? { codeUnits: 0, utf8Bytes: 0 }
    : measureCurriculumSerializedJson(input.currentState);
  const targetStateSize = measureCurriculumSerializedJson(input.targetState);
  const currentEnvelope = input.currentState === null
    ? null
    : createSizingEnvelope(input.currentState, "previous-operation", 1);
  const targetEnvelope = createSizingEnvelope(input.targetState, "target-operation", 2);
  const transaction = {
    schemaVersion: 1,
    classroomId: "curriculum-storage-budget",
    transactionId: "curriculum-transaction:budget",
    operationId: "target-operation",
    operationKind: "migration",
    expectedRevision: currentEnvelope ? 1 : 0,
    targetRevision: 2,
    targetEnvelope,
    backupKey: "cristalclass_curriculum_v1:budget:backup:r2:budget",
    preparedAt: "2026-08-24T00:00:00.000Z",
    stage: "promoted",
  };
  const backup = {
    schemaVersion: 1,
    classroomId: "curriculum-storage-budget",
    backupId: "curriculum-backup:budget",
    transactionId: "curriculum-transaction:budget",
    sourceRevision: currentEnvelope ? 1 : 0,
    targetRevision: 2,
    previousEnvelope: currentEnvelope,
    createdAt: "2026-08-24T00:00:00.000Z",
  };
  const review = {
    schemaVersion: 1,
    classroomId: "curriculum-storage-budget",
    revision: 2,
    operationId: "target-operation",
    operationKind: "migration",
    contentChecksum: "curriculum-content-v1:budget",
    reviewedAt: "2026-08-24T00:00:00.000Z",
  };
  const currentEnvelopeSize = currentEnvelope
    ? measureCurriculumSerializedJson(currentEnvelope)
    : { codeUnits: 0, utf8Bytes: 0 };
  const targetEnvelopeSize = measureCurriculumSerializedJson(targetEnvelope);
  const transactionSize = measureCurriculumSerializedJson(transaction);
  const backupSize = measureCurriculumSerializedJson(backup);
  const reviewSize = measureCurriculumSerializedJson(review);
  const beforePromotion = addSizes(
    currentEnvelopeSize,
    transactionSize,
    backupSize,
    reviewSize,
    { codeUnits: retainedBackupCodeUnits, utf8Bytes: retainedBackupCodeUnits }
  );
  const afterPromotion = addSizes(
    targetEnvelopeSize,
    transactionSize,
    backupSize,
    reviewSize,
    { codeUnits: retainedBackupCodeUnits, utf8Bytes: retainedBackupCodeUnits }
  );
  const worstCase = beforePromotion.codeUnits >= afterPromotion.codeUnits
    ? beforePromotion
    : afterPromotion;
  return {
    currentState: currentStateSize,
    targetState: targetStateSize,
    targetEnvelope: targetEnvelopeSize,
    transaction: transactionSize,
    newBackup: backupSize,
    review: reviewSize,
    beforePromotion,
    afterPromotion,
    worstCase,
    retainedBackupCodeUnits,
    fullEnvelopeMultiplier: worstCase.codeUnits / Math.max(1, targetEnvelopeSize.codeUnits),
  };
}

function createSizingEnvelope(state: unknown, operationId: string, revision: number): object {
  return {
    schemaVersion: 1,
    classroomId: "curriculum-storage-budget",
    revision,
    curriculumData: state,
    writtenAt: "2026-08-24T00:00:00.000Z",
    contentChecksum: "curriculum-content-v1:budget",
    lastOperationId: operationId,
  };
}

function addSizes(...sizes: readonly CurriculumSerializedSize[]): CurriculumSerializedSize {
  return sizes.reduce<CurriculumSerializedSize>((total, size) => ({
    codeUnits: total.codeUnits + size.codeUnits,
    utf8Bytes: total.utf8Bytes + size.utf8Bytes,
  }), { codeUnits: 0, utf8Bytes: 0 });
}
