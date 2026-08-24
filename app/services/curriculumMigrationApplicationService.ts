import {
  CURRICULUM_SCHEMA_VERSION,
  type CurriculumMigrationConflict,
  type CurriculumMigrationPlan,
  type CurriculumStorageBackup,
  type CurriculumStorageEnvelope,
  type CurriculumStorageOperationKind,
  type CurriculumStorageReviewMetadata,
  type CurriculumStorageTransaction,
  type CurriculumStorageTransactionStage,
  type CurriculumSubject,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { planCurriculumMigration } from "./curriculumMigrationService";
import {
  CURRICULUM_STORAGE_SCHEMA_VERSION,
  calculateCurriculumContentChecksum,
  createCurriculumStorageEnvelope,
  createCurriculumTransactionId,
  getCurriculumBackupStorageKey,
  getCurriculumStorageKeys,
  readCurrentCurriculumState,
  readCurriculumBackup,
  readCurriculumState,
  readCurriculumTransaction,
  requireStableCurriculumClassroomId,
  serializeCurriculumStorageValue,
  validateCurriculumReviewMetadata,
  type CurriculumCurrentReadResult,
  type CurriculumStorageAdapter,
} from "./curriculumStorageService";
import { validateCurriculumData } from "./curriculumValidationService";
import type { CurriculumExclusiveLock } from "./curriculumExclusiveLockService";

export type CurriculumPreviewConflict =
  | { readonly kind: "migration"; readonly conflict: CurriculumMigrationConflict }
  | {
      readonly kind: "existing-entity-conflict" | "invalid-result" | "classroom-conflict";
      readonly entityType?: "pack" | "profile" | "action-link";
      readonly entityId?: string;
      readonly message: string;
    };

export interface CurriculumMigrationPreview {
  readonly classroomId: string;
  readonly plan: CurriculumMigrationPlan;
  readonly expectedRevision: number;
  readonly expectedContentChecksum: string | null;
  readonly targetRevision: number;
  readonly targetData: VersionedCurriculumData;
  readonly knownActionIds: readonly string[];
  readonly conflicts: readonly CurriculumPreviewConflict[];
  readonly duplicatesAvoided: {
    readonly packs: readonly string[];
    readonly profiles: readonly string[];
    readonly actionLinks: readonly string[];
  };
  readonly creates: {
    readonly packs: readonly string[];
    readonly profiles: readonly string[];
    readonly actionLinks: readonly string[];
  };
  readonly hasChanges: boolean;
  readonly canApply: boolean;
  readonly summary: {
    readonly title: string;
    readonly expectedRevision: number;
    readonly targetRevision: number;
    readonly createdEntityCount: number;
    readonly duplicateCount: number;
    readonly conflictCount: number;
    readonly message: string;
  };
}

export interface PreviewCurriculumMigrationInput {
  readonly classroomId: string;
  readonly plannedAt: string;
  readonly legacyActions: readonly unknown[];
  readonly curriculumSubjects: readonly CurriculumSubject[];
  readonly currentEnvelope?: CurriculumStorageEnvelope | null;
  readonly knownActionIds?: readonly string[];
}

export type CurriculumWritePhase =
  | "preparation"
  | "transaction-write"
  | "transaction-verification"
  | "concurrency-verification"
  | "backup-write"
  | "backup-verification"
  | "promotion-write"
  | "promotion-verification"
  | "review-write"
  | "review-verification"
  | "transaction-cleanup";

export type CurriculumApplyResult =
  | {
      readonly status: "applied" | "already-applied";
      readonly envelope: CurriculumStorageEnvelope;
      readonly backupKey: string | null;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "preview-not-applicable"
        | "stale-revision"
        | "pending-transaction"
        | "classroom-conflict"
        | "invalid-current-state"
        | "invalid-result"
        | "exclusive-lock-unavailable";
      readonly message: string;
    }
  | {
      readonly status: "failed";
      readonly phase: CurriculumWritePhase;
      readonly message: string;
      readonly recoveryRequired: boolean;
      readonly transactionId?: string;
    };

export type CurriculumRecoveryInspection =
  | { readonly status: "none" }
  | {
      readonly status: "pending";
      readonly transaction: CurriculumStorageTransaction;
      readonly current: CurriculumCurrentReadResult;
      readonly backupStatus: "missing" | "valid" | "invalid";
    }
  | { readonly status: "invalid"; readonly message: string };

export type CurriculumRecoveryResult =
  | { readonly status: "completed"; readonly envelope: CurriculumStorageEnvelope }
  | { readonly status: "cancelled"; readonly revision: number }
  | { readonly status: "rejected"; readonly message: string }
  | {
      readonly status: "failed";
      readonly phase: CurriculumWritePhase;
      readonly message: string;
      readonly recoveryRequired: boolean;
    };

export interface ApplyCurriculumMigrationInput {
  readonly storage: CurriculumStorageAdapter;
  readonly lock: CurriculumExclusiveLock | null;
  readonly classroomId: string;
  readonly preview: CurriculumMigrationPreview;
  readonly expectedRevision: number;
  readonly writtenAt: string;
}

export function previewCurriculumMigration(
  input: PreviewCurriculumMigrationInput
): CurriculumMigrationPreview {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  const inputSnapshot = JSON.stringify(input);
  const plan = planCurriculumMigration({
    classroomId,
    plannedAt: input.plannedAt,
    legacyActions: input.legacyActions,
    curriculumSubjects: input.curriculumSubjects,
  });
  const knownActionIds = collectKnownActionIds(
    input.legacyActions,
    input.knownActionIds ?? [],
    input.currentEnvelope?.curriculumData.actionLinks.map((link) => link.actionId) ?? []
  );
  const expectedRevision = input.currentEnvelope?.revision ?? 0;
  const conflicts: CurriculumPreviewConflict[] = plan.conflicts.map((conflict) => ({
    kind: "migration",
    conflict,
  }));

  if (input.currentEnvelope && input.currentEnvelope.classroomId !== classroomId) {
    conflicts.push({
      kind: "classroom-conflict",
      message: "The current curriculum envelope belongs to another classroom.",
    });
  }

  const currentData = input.currentEnvelope?.curriculumData ?? createEmptyCurriculumData(classroomId);
  const merged = mergeMigrationPlan(currentData, plan, conflicts);
  const validation = validateSafely(merged.data, knownActionIds);
  if (!validation.valid) {
    conflicts.push({
      kind: "invalid-result",
      message: `The proposed curriculum is invalid: ${validation.issueCodes.join(", ")}.`,
    });
  }

  if (JSON.stringify(input) !== inputSnapshot) {
    throw new Error("Curriculum preview mutated its input.");
  }

  const currentChecksum = input.currentEnvelope?.contentChecksum ?? null;
  const targetChecksum = calculateCurriculumContentChecksum(merged.data);
  const hasChanges = currentChecksum !== targetChecksum;
  const createdEntityCount = merged.creates.packs.length
    + merged.creates.profiles.length
    + merged.creates.actionLinks.length;
  const duplicateCount = merged.duplicates.packs.length
    + merged.duplicates.profiles.length
    + merged.duplicates.actionLinks.length;
  const canApply = conflicts.length === 0 && validation.valid && hasChanges;

  return {
    classroomId,
    plan,
    expectedRevision,
    expectedContentChecksum: input.currentEnvelope?.contentChecksum ?? null,
    targetRevision: expectedRevision + 1,
    targetData: cloneJsonValue(merged.data),
    knownActionIds,
    conflicts,
    duplicatesAvoided: merged.duplicates,
    creates: merged.creates,
    hasChanges,
    canApply,
    summary: {
      title: "Previsualización de migración curricular",
      expectedRevision,
      targetRevision: expectedRevision + 1,
      createdEntityCount,
      duplicateCount,
      conflictCount: conflicts.length,
      message: conflicts.length > 0
        ? "La migración necesita resolver conflictos antes de aplicarse."
        : hasChanges
          ? "La migración está validada y puede aplicarse explícitamente."
          : "La migración no produciría cambios; las entidades ya existen.",
    },
  };
}

export async function applyCurriculumMigration(
  input: ApplyCurriculumMigrationInput
): Promise<CurriculumApplyResult> {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  if (!input.lock) {
    return rejected(
      "exclusive-lock-unavailable",
      "An exclusive curriculum lock is required before writing."
    );
  }
  const locked = await input.lock.runExclusive(
    classroomId,
    () => applyCurriculumMigrationLocked(input, classroomId)
  );
  return locked.status === "acquired"
    ? locked.value
    : rejected("exclusive-lock-unavailable", locked.message);
}

function applyCurriculumMigrationLocked(
  input: ApplyCurriculumMigrationInput,
  classroomId: string
): CurriculumApplyResult {
  if (input.preview.classroomId !== classroomId) {
    return rejected("classroom-conflict", "The preview belongs to another classroom.");
  }
  if (input.preview.conflicts.length > 0 || !validateSafely(
    input.preview.targetData,
    input.preview.knownActionIds
  ).valid) {
    return rejected("preview-not-applicable", "The migration preview has blocking conflicts.");
  }

  const state = readCurriculumState(input.storage, classroomId, input.preview.knownActionIds);
  if (state.status === "pending-transaction") {
    return rejected("pending-transaction", "A curriculum transaction requires explicit recovery.");
  }
  if (state.status === "classroom-conflict") {
    return rejected("classroom-conflict", state.message);
  }
  if (state.status !== "empty" && state.status !== "valid") {
    return rejected("invalid-current-state", state.message);
  }

  if (
    state.status === "valid"
    && state.envelope.contentChecksum
      === calculateCurriculumContentChecksum(input.preview.targetData)
    && state.envelope.lastOperationId === input.preview.plan.id
  ) {
    return { status: "already-applied", envelope: state.envelope, backupKey: null };
  }

  const currentRevision = state.status === "valid" ? state.envelope.revision : 0;
  const currentChecksum = state.status === "valid" ? state.envelope.contentChecksum : null;
  if (
    input.expectedRevision !== input.preview.expectedRevision
    || input.expectedRevision !== currentRevision
    || input.preview.expectedContentChecksum !== currentChecksum
  ) {
    return rejected("stale-revision", "The curriculum revision changed after preview.");
  }
  if (!input.preview.canApply) {
    return rejected("preview-not-applicable", "The migration preview has no applicable changes.");
  }

  return commitCurriculumTransition({
    storage: input.storage,
    classroomId,
    currentEnvelope: state.status === "valid" ? state.envelope : null,
    expectedRevision: currentRevision,
    targetData: input.preview.targetData,
    knownActionIds: input.preview.knownActionIds,
    operationId: input.preview.plan.id,
    operationKind: "migration",
    writtenAt: input.writtenAt,
  });
}

export function inspectPendingCurriculumTransaction(
  storage: CurriculumStorageAdapter,
  classroomId: string,
  knownActionIds: readonly string[]
): CurriculumRecoveryInspection {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const transaction = readCurriculumTransaction(storage, normalized, knownActionIds);
  if (transaction.status === "none") return { status: "none" };
  if (transaction.status !== "valid") return { status: "invalid", message: transaction.message };

  const current = readCurrentCurriculumState(storage, normalized, knownActionIds);
  const backup = readCurriculumBackup(
    storage,
    normalized,
    transaction.transaction.backupKey,
    knownActionIds
  );
  return {
    status: "pending",
    transaction: transaction.transaction,
    current,
    backupStatus: backup.status === "valid"
      ? "valid"
      : backup.status === "missing"
        ? "missing"
        : "invalid",
  };
}

export async function completePendingCurriculumTransaction(input: {
  readonly storage: CurriculumStorageAdapter;
  readonly lock: CurriculumExclusiveLock | null;
  readonly classroomId: string;
  readonly knownActionIds: readonly string[];
  readonly transactionId: string;
  readonly operationId: string;
}): Promise<CurriculumRecoveryResult> {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  if (!input.lock) {
    return { status: "rejected", message: "An exclusive curriculum lock is required." };
  }
  const locked = await input.lock.runExclusive(
    classroomId,
    () => completePendingCurriculumTransactionLocked(input, classroomId)
  );
  return locked.status === "acquired"
    ? locked.value
    : { status: "rejected", message: locked.message };
}

function completePendingCurriculumTransactionLocked(
  input: {
    readonly storage: CurriculumStorageAdapter;
    readonly knownActionIds: readonly string[];
    readonly transactionId: string;
    readonly operationId: string;
  },
  classroomId: string
): CurriculumRecoveryResult {
  const transaction = readCurriculumTransaction(
    input.storage,
    classroomId,
    input.knownActionIds
  );
  if (transaction.status === "none") return { status: "rejected", message: "No transaction is pending." };
  if (transaction.status !== "valid") return { status: "rejected", message: transaction.message };
  if (!matchesTransactionIdentity(transaction.transaction, input.transactionId, input.operationId)) {
    return { status: "rejected", message: "The pending transaction identity changed." };
  }

  const result = continueCurriculumTransaction(
    input.storage,
    transaction.transaction,
    input.knownActionIds
  );
  if (result.status === "applied" || result.status === "already-applied") {
    return { status: "completed", envelope: result.envelope };
  }
  if (result.status === "rejected") {
    return { status: "rejected", message: result.message };
  }
  if (!("phase" in result)) {
    return { status: "completed", envelope: result.envelope };
  }
  return {
    status: "failed",
    phase: result.phase,
    message: result.message,
    recoveryRequired: result.recoveryRequired,
  };
}

export async function cancelPendingCurriculumPreparation(input: {
  readonly storage: CurriculumStorageAdapter;
  readonly lock: CurriculumExclusiveLock | null;
  readonly classroomId: string;
  readonly knownActionIds: readonly string[];
  readonly transactionId: string;
  readonly operationId: string;
}): Promise<CurriculumRecoveryResult> {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  if (!input.lock) {
    return { status: "rejected", message: "An exclusive curriculum lock is required." };
  }
  const locked = await input.lock.runExclusive(
    classroomId,
    () => cancelPendingCurriculumPreparationLocked(input, classroomId)
  );
  return locked.status === "acquired"
    ? locked.value
    : { status: "rejected", message: locked.message };
}

function cancelPendingCurriculumPreparationLocked(
  input: {
    readonly storage: CurriculumStorageAdapter;
    readonly knownActionIds: readonly string[];
    readonly transactionId: string;
    readonly operationId: string;
  },
  classroomId: string
): CurriculumRecoveryResult {
  const transaction = readCurriculumTransaction(
    input.storage,
    classroomId,
    input.knownActionIds
  );
  if (transaction.status === "none") return { status: "rejected", message: "No transaction is pending." };
  if (transaction.status !== "valid") return { status: "rejected", message: transaction.message };
  if (!matchesTransactionIdentity(transaction.transaction, input.transactionId, input.operationId)) {
    return { status: "rejected", message: "The pending transaction identity changed." };
  }

  const current = readCurrentCurriculumState(input.storage, classroomId, input.knownActionIds);
  if (isTargetEnvelope(current, transaction.transaction.targetEnvelope)) {
    return {
      status: "rejected",
      message: "The transaction was already promoted; use explicit rollback instead.",
    };
  }
  if (!matchesExpectedRevision(current, transaction.transaction.expectedRevision)) {
    return { status: "rejected", message: "The current revision changed during preparation." };
  }

  const cleanup = removeOwnedTransactionAndVerify(
    input.storage,
    transaction.transaction,
    input.knownActionIds
  );
  if (cleanup.ok === false) {
    return failed("transaction-cleanup", cleanup.message, true);
  }
  return {
    status: "cancelled",
    revision: transaction.transaction.expectedRevision,
  };
}

export async function rollbackCurriculumBackup(input: {
  readonly storage: CurriculumStorageAdapter;
  readonly lock: CurriculumExclusiveLock | null;
  readonly classroomId: string;
  readonly backupKey: string;
  readonly expectedRevision: number;
  readonly writtenAt: string;
  readonly knownActionIds: readonly string[];
}): Promise<CurriculumApplyResult> {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  if (!input.lock) {
    return rejected(
      "exclusive-lock-unavailable",
      "An exclusive curriculum lock is required before rollback."
    );
  }
  const locked = await input.lock.runExclusive(
    classroomId,
    () => rollbackCurriculumBackupLocked(input, classroomId)
  );
  return locked.status === "acquired"
    ? locked.value
    : rejected("exclusive-lock-unavailable", locked.message);
}

function rollbackCurriculumBackupLocked(
  input: {
    readonly storage: CurriculumStorageAdapter;
    readonly backupKey: string;
    readonly expectedRevision: number;
    readonly writtenAt: string;
    readonly knownActionIds: readonly string[];
  },
  classroomId: string
): CurriculumApplyResult {
  const state = readCurriculumState(input.storage, classroomId, input.knownActionIds);
  if (state.status === "pending-transaction") {
    return rejected("pending-transaction", "A curriculum transaction requires explicit recovery.");
  }
  if (state.status !== "valid") {
    return rejected(
      state.status === "classroom-conflict" ? "classroom-conflict" : "invalid-current-state",
      state.status === "empty" ? "There is no current curriculum to roll back." : state.message
    );
  }
  if (state.envelope.revision !== input.expectedRevision) {
    return rejected("stale-revision", "The curriculum revision changed before rollback.");
  }

  const backup = readCurriculumBackup(
    input.storage,
    classroomId,
    input.backupKey,
    input.knownActionIds
  );
  if (backup.status !== "valid") {
    return rejected(
      backup.status === "classroom-conflict" ? "classroom-conflict" : "invalid-current-state",
      backup.status === "missing" ? "The requested backup does not exist." : backup.message
    );
  }
  if (!backup.backup.previousEnvelope) {
    return rejected("invalid-current-state", "The backup has no previous curriculum state.");
  }
  if (backup.backup.targetRevision > state.envelope.revision) {
    return rejected("stale-revision", "The backup belongs to a future revision.");
  }

  const operationId = `curriculum-rollback:${backup.backup.backupId}:r${input.expectedRevision}`;
  if (
    state.envelope.lastOperationId === operationId
    && state.envelope.contentChecksum === backup.backup.previousEnvelope.contentChecksum
  ) {
    return { status: "already-applied", envelope: state.envelope, backupKey: null };
  }

  return commitCurriculumTransition({
    storage: input.storage,
    classroomId,
    currentEnvelope: state.envelope,
    expectedRevision: input.expectedRevision,
    targetData: backup.backup.previousEnvelope.curriculumData,
    knownActionIds: input.knownActionIds,
    operationId,
    operationKind: "rollback",
    writtenAt: input.writtenAt,
  });
}

function commitCurriculumTransition(input: {
  readonly storage: CurriculumStorageAdapter;
  readonly classroomId: string;
  readonly currentEnvelope: CurriculumStorageEnvelope | null;
  readonly expectedRevision: number;
  readonly targetData: VersionedCurriculumData;
  readonly knownActionIds: readonly string[];
  readonly operationId: string;
  readonly operationKind: CurriculumStorageOperationKind;
  readonly writtenAt: string;
}): CurriculumApplyResult {
  // Storage cannot provide a multi-key atomic transaction. The durable marker is
  // therefore written and verified first, followed by backup, promotion and review.
  // The marker is removed only after every phase verifies successfully, allowing an
  // interrupted operation to be inspected and resumed explicitly by the caller.
  const validation = validateSafely(input.targetData, input.knownActionIds);
  if (!validation.valid) {
    return rejected("invalid-result", `The target curriculum is invalid: ${validation.issueCodes.join(", ")}.`);
  }

  let envelope: CurriculumStorageEnvelope;
  try {
    envelope = createCurriculumStorageEnvelope({
      classroomId: input.classroomId,
      revision: input.expectedRevision + 1,
      curriculumData: input.targetData,
      writtenAt: input.writtenAt,
      operationId: input.operationId,
    });
  } catch (error) {
    return failed("preparation", describeError(error), false);
  }
  const transactionId = createCurriculumTransactionId(
    input.classroomId,
    input.operationId,
    input.expectedRevision,
    envelope.contentChecksum
  );
  const backupKey = getCurriculumBackupStorageKey(
    input.classroomId,
    envelope.revision,
    transactionId
  );
  const transaction: CurriculumStorageTransaction = {
    schemaVersion: CURRICULUM_STORAGE_SCHEMA_VERSION,
    classroomId: input.classroomId,
    transactionId,
    operationId: input.operationId,
    operationKind: input.operationKind,
    expectedRevision: input.expectedRevision,
    targetRevision: envelope.revision,
    targetEnvelope: envelope,
    backupKey,
    preparedAt: envelope.writtenAt,
    stage: "prepared",
  };

  const existingTransaction = readCurriculumTransaction(
    input.storage,
    input.classroomId,
    input.knownActionIds
  );
  if (existingTransaction.status !== "none") {
    return failed(
      "concurrency-verification",
      "Another curriculum transaction already owns the classroom marker.",
      existingTransaction.status === "valid",
      existingTransaction.status === "valid"
        ? existingTransaction.transaction.transactionId
        : undefined
    );
  }

  const transactionWrite = writeAndVerifyTransaction(
    input.storage,
    transaction,
    input.knownActionIds,
    "transaction-write",
    "transaction-verification"
  );
  if (transactionWrite.status === "failed") return transactionWrite;

  const currentAfterPreparation = readCurrentCurriculumState(
    input.storage,
    input.classroomId,
    input.knownActionIds
  );
  if (!matchesExpectedEnvelope(currentAfterPreparation, input.currentEnvelope)) {
    return failed(
      "concurrency-verification",
      "The current curriculum changed while preparing the transaction.",
      true,
      transactionId
    );
  }

  return continueCurriculumTransaction(input.storage, transaction, input.knownActionIds);
}

function continueCurriculumTransaction(
  storage: CurriculumStorageAdapter,
  transaction: CurriculumStorageTransaction,
  knownActionIds: readonly string[]
): CurriculumApplyResult {
  const initialOwnership = verifyOwnedTransaction(storage, transaction, knownActionIds);
  if (initialOwnership.ok === false) {
    return failed(
      "concurrency-verification",
      initialOwnership.message,
      true,
      transaction.transactionId
    );
  }
  let current = readCurrentCurriculumState(storage, transaction.classroomId, knownActionIds);
  let backup = readCurriculumBackup(
    storage,
    transaction.classroomId,
    transaction.backupKey,
    knownActionIds
  );

  if (backup.status !== "valid") {
    if (backup.status !== "missing") {
      return failed("backup-verification", backup.message, true, transaction.transactionId);
    }
    if (!matchesExpectedRevision(current, transaction.expectedRevision)) {
      if (!isTargetEnvelope(current, transaction.targetEnvelope)) {
        return failed(
          "concurrency-verification",
          "The current revision no longer matches the pending transaction.",
          true,
          transaction.transactionId
        );
      }
    } else {
      const backupOwnership = verifyOwnedTransaction(storage, transaction, knownActionIds);
      if (backupOwnership.ok === false) {
        return failed(
          "concurrency-verification",
          backupOwnership.message,
          true,
          transaction.transactionId
        );
      }
      const backupValue: CurriculumStorageBackup = {
        schemaVersion: CURRICULUM_STORAGE_SCHEMA_VERSION,
        classroomId: transaction.classroomId,
        backupId: `curriculum-backup:${transaction.transactionId}`,
        transactionId: transaction.transactionId,
        sourceRevision: transaction.expectedRevision,
        targetRevision: transaction.targetRevision,
        previousEnvelope: current.status === "valid" ? current.envelope : null,
        createdAt: transaction.preparedAt,
      };
      const backupWrite = writeRaw(storage, transaction.backupKey, backupValue);
      if (backupWrite.ok === false) {
        return failed("backup-write", backupWrite.message, true, transaction.transactionId);
      }
      backup = readCurriculumBackup(
        storage,
        transaction.classroomId,
        transaction.backupKey,
        knownActionIds
      );
      if (backup.status !== "valid") {
        return failed(
          "backup-verification",
          backup.status === "missing" ? "The backup disappeared after writing." : backup.message,
          true,
          transaction.transactionId
        );
      }
    }
  }

  const backupStage = persistTransactionStage(storage, transaction, "backup-saved", knownActionIds);
  if (backupStage.status === "failed") return backupStage;

  current = readCurrentCurriculumState(storage, transaction.classroomId, knownActionIds);
  if (!isTargetEnvelope(current, transaction.targetEnvelope)) {
    if (!matchesExpectedRevision(current, transaction.expectedRevision)) {
      return failed(
        "concurrency-verification",
        "The current revision changed before promotion.",
        true,
        transaction.transactionId
      );
    }
    const promotionOwnership = verifyOwnedTransaction(storage, transaction, knownActionIds);
    if (promotionOwnership.ok === false) {
      return failed(
        "concurrency-verification",
        promotionOwnership.message,
        true,
        transaction.transactionId
      );
    }
    const promotionWrite = writeRaw(
      storage,
      getCurriculumStorageKeys(transaction.classroomId).current,
      transaction.targetEnvelope
    );
    if (promotionWrite.ok === false) {
      return failed("promotion-write", promotionWrite.message, true, transaction.transactionId);
    }
    current = readCurrentCurriculumState(storage, transaction.classroomId, knownActionIds);
    if (!isTargetEnvelope(current, transaction.targetEnvelope)) {
      return failed(
        "promotion-verification",
        "The promoted curriculum cannot be verified.",
        true,
        transaction.transactionId
      );
    }
  }

  const promotedStage = persistTransactionStage(storage, transaction, "promoted", knownActionIds);
  if (promotedStage.status === "failed") return promotedStage;

  const review: CurriculumStorageReviewMetadata = {
    schemaVersion: CURRICULUM_STORAGE_SCHEMA_VERSION,
    classroomId: transaction.classroomId,
    revision: transaction.targetRevision,
    operationId: transaction.operationId,
    operationKind: transaction.operationKind,
    contentChecksum: transaction.targetEnvelope.contentChecksum,
    reviewedAt: transaction.targetEnvelope.writtenAt,
  };
  const reviewOwnership = verifyOwnedTransaction(storage, transaction, knownActionIds);
  if (reviewOwnership.ok === false) {
    return failed(
      "concurrency-verification",
      reviewOwnership.message,
      true,
      transaction.transactionId
    );
  }
  const reviewKey = getCurriculumStorageKeys(transaction.classroomId).review;
  const reviewWrite = writeRaw(storage, reviewKey, review);
  if (reviewWrite.ok === false) {
    return failed("review-write", reviewWrite.message, true, transaction.transactionId);
  }
  const reviewStored = readAndParseUnknown(storage, reviewKey);
  if (
    !reviewStored.ok
    || !validateCurriculumReviewMetadata(
      reviewStored.value,
      transaction.classroomId,
      transaction.targetEnvelope
    )
  ) {
    return failed(
      "review-verification",
      reviewStored.ok === true ? "Review metadata is invalid after writing." : reviewStored.message,
      true,
      transaction.transactionId
    );
  }

  const reviewedStage = persistTransactionStage(storage, transaction, "reviewed", knownActionIds);
  if (reviewedStage.status === "failed") return reviewedStage;
  const cleanup = removeOwnedTransactionAndVerify(
    storage,
    transaction,
    knownActionIds
  );
  if (cleanup.ok === false) {
    return failed("transaction-cleanup", cleanup.message, true, transaction.transactionId);
  }

  return {
    status: "applied",
    envelope: transaction.targetEnvelope,
    backupKey: transaction.backupKey,
  };
}

function persistTransactionStage(
  storage: CurriculumStorageAdapter,
  transaction: CurriculumStorageTransaction,
  stage: CurriculumStorageTransactionStage,
  knownActionIds: readonly string[]
): CurriculumApplyResult {
  const ownership = verifyOwnedTransaction(storage, transaction, knownActionIds);
  if (ownership.ok === false) {
    return failed(
      "concurrency-verification",
      ownership.message,
      true,
      transaction.transactionId
    );
  }
  if (transactionStageRank(ownership.transaction.stage) >= transactionStageRank(stage)) {
    return {
      status: "already-applied",
      envelope: transaction.targetEnvelope,
      backupKey: transaction.backupKey,
    };
  }
  const next = { ...transaction, stage };
  return writeAndVerifyTransaction(
    storage,
    next,
    knownActionIds,
    "transaction-write",
    "transaction-verification"
  );
}

function writeAndVerifyTransaction(
  storage: CurriculumStorageAdapter,
  transaction: CurriculumStorageTransaction,
  knownActionIds: readonly string[],
  writePhase: CurriculumWritePhase,
  verificationPhase: CurriculumWritePhase
): CurriculumApplyResult {
  const key = getCurriculumStorageKeys(transaction.classroomId).transaction;
  const written = writeRaw(storage, key, transaction);
  if (written.ok === false) {
    let recoveryRequired = true;
    try {
      recoveryRequired = storage.getItem(key) !== null;
    } catch {
      // Be conservative when storage cannot confirm whether the marker was written.
    }
    return failed(
      writePhase,
      written.message,
      recoveryRequired,
      recoveryRequired ? transaction.transactionId : undefined
    );
  }
  const verified = readCurriculumTransaction(storage, transaction.classroomId, knownActionIds);
  if (
    verified.status !== "valid"
    || verified.transaction.transactionId !== transaction.transactionId
    || verified.transaction.stage !== transaction.stage
  ) {
    return failed(
      verificationPhase,
      verified.status === "valid" ? "Another transaction replaced the prepared state." :
        verified.status === "none" ? "The transaction disappeared after writing." : verified.message,
      true,
      transaction.transactionId
    );
  }
  return {
    status: "already-applied",
    envelope: transaction.targetEnvelope,
    backupKey: transaction.backupKey,
  };
}

function mergeMigrationPlan(
  current: VersionedCurriculumData,
  plan: CurriculumMigrationPlan,
  conflicts: CurriculumPreviewConflict[]
): {
  readonly data: VersionedCurriculumData;
  readonly duplicates: CurriculumMigrationPreview["duplicatesAvoided"];
  readonly creates: CurriculumMigrationPreview["creates"];
} {
  const packs = mergeEntities(current.packs, [plan.proposedPack], "pack", conflicts);
  const profiles = mergeEntities(current.profiles, [plan.proposedProfile], "profile", conflicts);
  const actionLinks = mergeEntities(current.actionLinks, plan.proposedLinks, "action-link", conflicts);

  return {
    data: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      module: cloneJsonValue(current.module),
      packs: packs.values,
      profiles: profiles.values,
      actionLinks: actionLinks.values,
    },
    duplicates: {
      packs: packs.duplicates,
      profiles: profiles.duplicates,
      actionLinks: actionLinks.duplicates,
    },
    creates: {
      packs: packs.created,
      profiles: profiles.created,
      actionLinks: actionLinks.created,
    },
  };
}

function mergeEntities<T extends { readonly id: string }>(
  existing: readonly T[],
  proposed: readonly T[],
  entityType: "pack" | "profile" | "action-link",
  conflicts: CurriculumPreviewConflict[]
): { readonly values: readonly T[]; readonly duplicates: readonly string[]; readonly created: readonly string[] } {
  const values = new Map(existing.map((entity) => [entity.id, cloneJsonValue(entity)]));
  const duplicates: string[] = [];
  const created: string[] = [];

  proposed.forEach((entity) => {
    const current = values.get(entity.id);
    if (!current) {
      values.set(entity.id, cloneJsonValue(entity));
      created.push(entity.id);
    } else if (semanticChecksum(current) === semanticChecksum(entity)) {
      duplicates.push(entity.id);
    } else {
      conflicts.push({
        kind: "existing-entity-conflict",
        entityType,
        entityId: entity.id,
        message: `Existing ${entityType} ${entity.id} has different content and was not overwritten.`,
      });
    }
  });

  return {
    values: [...values.values()].sort((left, right) => compareStableText(left.id, right.id)),
    duplicates: [...duplicates].sort(compareStableText),
    created: [...created].sort(compareStableText),
  };
}

function createEmptyCurriculumData(classroomId: string): VersionedCurriculumData {
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId,
      status: "inactive",
      activeProfileId: null,
    },
    packs: [],
    profiles: [],
    actionLinks: [],
  };
}

function collectKnownActionIds(...collections: readonly (readonly unknown[])[]): string[] {
  const ids = new Set<string>();
  collections.flat().forEach((value) => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
    if (isRecord(value) && typeof value.id === "string" && value.id.trim()) ids.add(value.id.trim());
  });
  return [...ids].sort(compareStableText);
}

function validateSafely(
  data: VersionedCurriculumData,
  knownActionIds: readonly string[]
): { readonly valid: boolean; readonly issueCodes: readonly string[] } {
  try {
    const result = validateCurriculumData(data, knownActionIds);
    return { valid: result.valid, issueCodes: result.issues.map((issue) => issue.code) };
  } catch {
    return { valid: false, issueCodes: ["unsafe-curriculum-shape"] };
  }
}

function matchesExpectedEnvelope(
  current: CurriculumCurrentReadResult,
  expected: CurriculumStorageEnvelope | null
): boolean {
  return expected
    ? current.status === "valid"
      && current.envelope.revision === expected.revision
      && current.envelope.contentChecksum === expected.contentChecksum
      && current.envelope.lastOperationId === expected.lastOperationId
    : current.status === "empty";
}

function matchesExpectedRevision(
  current: CurriculumCurrentReadResult,
  expectedRevision: number
): boolean {
  return expectedRevision === 0
    ? current.status === "empty"
    : current.status === "valid" && current.envelope.revision === expectedRevision;
}

function isTargetEnvelope(
  current: CurriculumCurrentReadResult,
  target: CurriculumStorageEnvelope
): boolean {
  return current.status === "valid"
    && current.envelope.revision === target.revision
    && current.envelope.contentChecksum === target.contentChecksum
    && current.envelope.lastOperationId === target.lastOperationId;
}

function writeRaw(
  storage: CurriculumStorageAdapter,
  key: string,
  value: unknown
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    storage.setItem(key, serializeCurriculumStorageValue(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

function verifyOwnedTransaction(
  storage: CurriculumStorageAdapter,
  expected: CurriculumStorageTransaction,
  knownActionIds: readonly string[]
): { readonly ok: true; readonly transaction: CurriculumStorageTransaction } | {
  readonly ok: false;
  readonly message: string;
} {
  const stored = readCurriculumTransaction(storage, expected.classroomId, knownActionIds);
  if (stored.status !== "valid") {
    return {
      ok: false,
      message: stored.status === "none"
        ? "The owned curriculum transaction marker is missing."
        : stored.message,
    };
  }
  if (!matchesTransactionIdentity(stored.transaction, expected.transactionId, expected.operationId)) {
    return { ok: false, message: "Another operation replaced the curriculum transaction marker." };
  }
  if (
    stored.transaction.targetEnvelope.contentChecksum
      !== expected.targetEnvelope.contentChecksum
    || stored.transaction.expectedRevision !== expected.expectedRevision
    || stored.transaction.targetRevision !== expected.targetRevision
  ) {
    return { ok: false, message: "The owned curriculum transaction content changed." };
  }
  return { ok: true, transaction: stored.transaction };
}

function transactionStageRank(stage: CurriculumStorageTransactionStage): number {
  switch (stage) {
    case "prepared": return 0;
    case "backup-saved": return 1;
    case "promoted": return 2;
    case "reviewed": return 3;
  }
}

function matchesTransactionIdentity(
  transaction: CurriculumStorageTransaction,
  transactionId: string,
  operationId: string
): boolean {
  return transaction.transactionId === transactionId
    && transaction.operationId === operationId;
}

function removeOwnedTransactionAndVerify(
  storage: CurriculumStorageAdapter,
  transaction: CurriculumStorageTransaction,
  knownActionIds: readonly string[]
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const ownership = verifyOwnedTransaction(storage, transaction, knownActionIds);
  if (ownership.ok === false) return ownership;
  return removeAndVerify(storage, getCurriculumStorageKeys(transaction.classroomId).transaction);
}

function removeAndVerify(
  storage: CurriculumStorageAdapter,
  key: string
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null
      ? { ok: true }
      : { ok: false, message: "The storage key still exists after removal." };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

function readAndParseUnknown(
  storage: CurriculumStorageAdapter,
  key: string
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string } {
  try {
    const serialized = storage.getItem(key);
    if (serialized === null) return { ok: false, message: "The stored value is missing." };
    return { ok: true, value: JSON.parse(serialized) };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

function semanticChecksum(value: unknown): string {
  return stableSerialize(stripInformativeDates(value));
}

function stripInformativeDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInformativeDates);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "createdAt" && key !== "updatedAt" && key !== "writtenAt")
      .sort()
      .map((key) => {
        const stripped = stripInformativeDates(value[key]);
        const canonical = (
          key === "criterionIds"
          || key === "resolvedCriterionIds"
          || key === "contraryActionIds"
        ) && Array.isArray(stripped)
          ? [...stripped].sort((left, right) => compareStableText(String(left), String(right)))
          : stripped;
        return [key, canonical];
      })
  );
}

function stableSerialize(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (seen.has(value)) return '"[circular]"';
  seen.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map((item) => stableSerialize(item, seen)).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
        `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key], seen)}`
      ).join(",")}}`;
  seen.delete(value);
  return serialized;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rejected(
  reason: Extract<CurriculumApplyResult, { status: "rejected" }>["reason"],
  message: string
): Extract<CurriculumApplyResult, { status: "rejected" }> {
  return { status: "rejected", reason, message };
}

function failed(
  phase: CurriculumWritePhase,
  message: string,
  recoveryRequired: boolean,
  transactionId?: string
): Extract<CurriculumApplyResult, { status: "failed" }> {
  return {
    status: "failed",
    phase,
    message,
    recoveryRequired,
    ...(transactionId ? { transactionId } : {}),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown storage error.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
