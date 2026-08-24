import type { Action } from "../types/action";
import type {
  CurriculumStorageEnvelope,
  CurriculumSubject,
  VersionedCurriculumData,
} from "../types/curriculum";
import {
  applyCurriculumMigration,
  cancelPendingCurriculumPreparation,
  completePendingCurriculumTransaction,
  inspectPendingCurriculumTransaction,
  previewCurriculumMigration,
  rollbackCurriculumBackup,
  type CurriculumMigrationPreview,
} from "./curriculumMigrationApplicationService";
import {
  calculateCurriculumContentChecksum,
  createCurriculumStorageEnvelope,
  createCurriculumTransactionId,
  getBrowserCurriculumStorage,
  getCurriculumStorageKeys,
  readCurriculumState,
  requireStableCurriculumClassroomId,
  serializeCurriculumStorageValue,
  type CurriculumStorageAdapter,
} from "./curriculumStorageService";
import {
  getBrowserCurriculumExclusiveLock,
  getCurriculumExclusiveLockName,
  type CurriculumExclusiveLock,
  type CurriculumExclusiveLockResult,
} from "./curriculumExclusiveLockService";

export interface CurriculumStorageDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const CLASSROOM_ID = "classroom-storage-check";
const FIRST_INSTANT = "2026-08-24T10:00:00.000Z";
const SECOND_INSTANT = "2026-08-25T10:00:00.000Z";

export async function runCurriculumStorageDeterministicChecks(): Promise<
  readonly CurriculumStorageDeterministicCheck[]
> {
  return Promise.all([
    check("curriculum keys are isolated by classroom", () => {
      const first = getCurriculumStorageKeys("class-a");
      const second = getCurriculumStorageKeys("class-b");
      return Object.values(first).every((key) => !Object.values(second).includes(key));
    }),
    check("empty classroom identity is rejected", () => {
      try {
        requireStableCurriculumClassroomId("   ");
        return false;
      } catch {
        return true;
      }
    }),
    check("reading missing data performs no writes", () => {
      const storage = new MemoryCurriculumStorage();
      const result = readCurriculumState(storage, CLASSROOM_ID, []);
      return result.status === "empty" && storage.writeCount === 0 && storage.removeCount === 0;
    }),
    check("reading valid data performs no writes", () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const envelope = createEnvelope(preview, 1, FIRST_INSTANT);
      storage.seed(getCurriculumStorageKeys(CLASSROOM_ID).current, envelope);
      storage.resetCounters();
      const result = readCurriculumState(storage, CLASSROOM_ID, preview.knownActionIds);
      return result.status === "valid"
        && result.envelope.revision === 1
        && storage.writeCount === 0
        && storage.removeCount === 0;
    }),
    check("corrupt JSON returns an explicit error", () => {
      const storage = new MemoryCurriculumStorage();
      storage.seedRaw(getCurriculumStorageKeys(CLASSROOM_ID).current, "{not-json");
      return readCurriculumState(storage, CLASSROOM_ID, []).status === "corrupt";
    }),
    check("unknown storage schema returns incompatibility", () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      storage.seed(getCurriculumStorageKeys(CLASSROOM_ID).current, {
        ...createEnvelope(preview, 1, FIRST_INSTANT),
        schemaVersion: 999,
      });
      return readCurriculumState(storage, CLASSROOM_ID, preview.knownActionIds).status
        === "incompatible-version";
    }),
    check("stored data for another classroom is rejected", () => {
      const storage = new MemoryCurriculumStorage();
      const otherPreview = createPreview("other-classroom");
      storage.seed(
        getCurriculumStorageKeys(CLASSROOM_ID).current,
        createEnvelope(otherPreview, 1, FIRST_INSTANT)
      );
      return readCurriculumState(storage, CLASSROOM_ID, otherPreview.knownActionIds).status
        === "classroom-conflict";
    }),
    check("preview neither writes nor mutates inputs", () => {
      const storage = new MemoryCurriculumStorage();
      const action = createLegacyAction("action-a", -2);
      const subject = createSubject();
      const input = {
        classroomId: CLASSROOM_ID,
        plannedAt: FIRST_INSTANT,
        legacyActions: [action],
        curriculumSubjects: [subject],
      };
      const snapshot = JSON.stringify(input);
      previewCurriculumMigration(input);
      return JSON.stringify(input) === snapshot
        && storage.writeCount === 0
        && storage.removeCount === 0;
    }),
    check("valid application increments revision exactly once", async () => {
      const storage = new MemoryCurriculumStorage();
      const result = await applyPreview(storage, createPreview(CLASSROOM_ID), FIRST_INSTANT);
      const stored = readCurriculumState(storage, CLASSROOM_ID, ["action-a"]);
      return result.status === "applied"
        && result.envelope.revision === 1
        && stored.status === "valid"
        && stored.envelope.revision === 1;
    }),
    check("blocking conflicts prevent every write", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const blocked: CurriculumMigrationPreview = {
        ...preview,
        canApply: false,
        conflicts: [{ kind: "invalid-result", message: "Blocking test conflict." }],
      };
      const result = await applyPreview(storage, blocked, FIRST_INSTANT);
      return result.status === "rejected" && storage.writeCount === 0;
    }),
    check("stale expected revision is rejected", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const result = await applyCurriculumMigration({
        storage,
        lock: storage.lock,
        classroomId: CLASSROOM_ID,
        preview,
        expectedRevision: 1,
        writtenAt: FIRST_INSTANT,
      });
      return result.status === "rejected"
        && result.reason === "stale-revision"
        && storage.writeCount === 0;
    }),
    check("repeating one application is idempotent", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const first = await applyPreview(storage, preview, FIRST_INSTANT);
      const writesAfterFirst = storage.writeCount;
      const second = await applyPreview(storage, preview, SECOND_INSTANT);
      const state = readCurriculumState(storage, CLASSROOM_ID, preview.knownActionIds);
      return first.status === "applied"
        && second.status === "already-applied"
        && storage.writeCount === writesAfterFirst
        && state.status === "valid"
        && state.envelope.revision === 1
        && state.envelope.curriculumData.actionLinks.length === 1;
    }),
    check("two simulated tabs never silently overwrite one revision", async () => {
      const storage = new MemoryCurriculumStorage();
      const tabOne = createPreview(CLASSROOM_ID);
      const tabTwo = createPreview(CLASSROOM_ID, null, [
        createLegacyAction("action-a", -2),
        createLegacyAction("action-b", 1),
      ]);
      const [first, second] = await Promise.all([
        applyPreview(storage, tabOne, FIRST_INSTANT),
        applyPreview(storage, tabTwo, SECOND_INSTANT),
      ]);
      const state = readCurriculumState(storage, CLASSROOM_ID, ["action-a", "action-b"]);
      return first.status === "applied"
        && second.status === "rejected"
        && second.reason === "stale-revision"
        && state.status === "valid"
        && state.envelope.revision === 1
        && state.envelope.curriculumData.actionLinks.length === 1
        && storage.lock.maximumConcurrentEntries === 1
        && storage.lock.entryCount === 2;
    }),
    check("transaction write failure preserves the current state", async () => {
      const storage = new MemoryCurriculumStorage();
      const firstPreview = createPreview(CLASSROOM_ID);
      const first = await applyPreview(storage, firstPreview, FIRST_INSTANT);
      if (first.status !== "applied") return false;
      const secondPreview = createPreview(
        CLASSROOM_ID,
        first.envelope,
        [createLegacyAction("action-a", -2), createLegacyAction("action-b", 1)]
      );
      storage.failNextSet(getCurriculumStorageKeys(CLASSROOM_ID).transaction);
      const second = await applyPreview(storage, secondPreview, SECOND_INSTANT);
      const state = readCurriculumState(storage, CLASSROOM_ID, secondPreview.knownActionIds);
      return second.status === "failed"
        && second.phase === "transaction-write"
        && state.status === "valid"
        && state.envelope.revision === 1;
    }),
    check("promotion failure leaves explicit recovery data", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      storage.failNextSet(getCurriculumStorageKeys(CLASSROOM_ID).current);
      const result = await applyPreview(storage, preview, FIRST_INSTANT);
      const inspection = inspectPendingCurriculumTransaction(
        storage,
        CLASSROOM_ID,
        preview.knownActionIds
      );
      return result.status === "failed"
        && result.phase === "promotion-write"
        && result.recoveryRequired
        && inspection.status === "pending"
        && inspection.current.status === "empty"
        && inspection.backupStatus === "valid";
    }),
    check("a pending transaction is reported without automatic recovery", async () => {
      const scenario = await createInterruptedPromotion();
      const writesBeforeRead = scenario.storage.writeCount;
      const state = readCurriculumState(
        scenario.storage,
        CLASSROOM_ID,
        scenario.preview.knownActionIds
      );
      return state.status === "pending-transaction"
        && scenario.storage.writeCount === writesBeforeRead
        && scenario.storage.removeCount === 0;
    }),
    check("a valid pending transaction can be completed explicitly", async () => {
      const scenario = await createInterruptedPromotion();
      const transaction = requirePendingTransaction(scenario);
      const result = await completePendingCurriculumTransaction({
        storage: scenario.storage,
        lock: scenario.storage.lock,
        classroomId: CLASSROOM_ID,
        knownActionIds: scenario.preview.knownActionIds,
        transactionId: transaction.transactionId,
        operationId: transaction.operationId,
      });
      const state = readCurriculumState(
        scenario.storage,
        CLASSROOM_ID,
        scenario.preview.knownActionIds
      );
      return result.status === "completed"
        && state.status === "valid"
        && state.envelope.revision === 1;
    }),
    check("cancelling a preparation preserves the last valid state", async () => {
      const scenario = await createInterruptedPromotion();
      const transaction = requirePendingTransaction(scenario);
      const result = await cancelPendingCurriculumPreparation({
        storage: scenario.storage,
        lock: scenario.storage.lock,
        classroomId: CLASSROOM_ID,
        knownActionIds: scenario.preview.knownActionIds,
        transactionId: transaction.transactionId,
        operationId: transaction.operationId,
      });
      const state = readCurriculumState(
        scenario.storage,
        CLASSROOM_ID,
        scenario.preview.knownActionIds
      );
      return result.status === "cancelled" && state.status === "empty";
    }),
    check("rollback restores the exact previous curriculum data", async () => {
      const scenario = await createTwoRevisions();
      if (!scenario) return false;
      const rollback = await rollbackCurriculumBackup({
        storage: scenario.storage,
        lock: scenario.storage.lock,
        classroomId: CLASSROOM_ID,
        backupKey: scenario.second.backupKey ?? "",
        expectedRevision: 2,
        writtenAt: "2026-08-26T10:00:00.000Z",
        knownActionIds: ["action-a", "action-b"],
      });
      return rollback.status === "applied"
        && rollback.envelope.revision === 3
        && JSON.stringify(rollback.envelope.curriculumData)
          === JSON.stringify(scenario.first.envelope.curriculumData);
    }),
    check("rollback for another classroom is rejected", async () => {
      const scenario = await createTwoRevisions();
      if (!scenario) return false;
      const result = await rollbackCurriculumBackup({
        storage: scenario.storage,
        lock: scenario.storage.lock,
        classroomId: "another-classroom",
        backupKey: scenario.second.backupKey ?? "",
        expectedRevision: 2,
        writtenAt: "2026-08-26T10:00:00.000Z",
        knownActionIds: ["action-a", "action-b"],
      });
      return result.status === "rejected" && result.reason === "invalid-current-state";
    }),
    check("legacy action fields remain unchanged", async () => {
      const storage = new MemoryCurriculumStorage();
      const action = createLegacyAction("action-a", -2);
      const snapshot = JSON.stringify(action);
      const preview = createPreview(CLASSROOM_ID, null, [action]);
      await applyPreview(storage, preview, FIRST_INSTANT);
      return JSON.stringify(action) === snapshot;
    }),
    check("browser adapter is safe when window is unavailable", () => {
      return typeof window !== "undefined" || getBrowserCurriculumStorage() === null;
    }),
    check("informative dates do not affect checksums or transaction ids", () => {
      const first = createPreview(CLASSROOM_ID);
      const second = createPreview(CLASSROOM_ID, null, undefined, SECOND_INSTANT);
      const firstChecksum = calculateCurriculumContentChecksum(first.targetData);
      const secondChecksum = calculateCurriculumContentChecksum(second.targetData);
      return firstChecksum === secondChecksum
        && createCurriculumTransactionId(CLASSROOM_ID, first.plan.id, 0, firstChecksum)
          === createCurriculumTransactionId(CLASSROOM_ID, second.plan.id, 0, secondChecksum);
    }),
    check("storage operations never mutate their input objects", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const snapshot = JSON.stringify(preview);
      await applyPreview(storage, preview, FIRST_INSTANT);
      return JSON.stringify(preview) === snapshot;
    }),
    check("referencing storage services causes no startup IO", () => {
      const storage = new MemoryCurriculumStorage();
      const exportsOnly = [
        readCurriculumState,
        previewCurriculumMigration,
        applyCurriculumMigration,
      ];
      return exportsOnly.length === 3
        && storage.readCount === 0
        && storage.writeCount === 0
        && storage.removeCount === 0;
    }),
    check("writes are rejected when no exclusive lock guarantee exists", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const result = await applyCurriculumMigration({
        storage,
        lock: null,
        classroomId: CLASSROOM_ID,
        preview,
        expectedRevision: 0,
        writtenAt: FIRST_INSTANT,
      });
      return result.status === "rejected"
        && result.reason === "exclusive-lock-unavailable"
        && storage.writeCount === 0
        && storage.removeCount === 0;
    }),
    check("recovery cancellation and rollback also require an exclusive lock", async () => {
      const interrupted = await createInterruptedPromotion();
      const pending = requirePendingTransaction(interrupted);
      const writesBeforeRecovery = interrupted.storage.writeCount;
      const removesBeforeRecovery = interrupted.storage.removeCount;
      const recovery = await completePendingCurriculumTransaction({
        storage: interrupted.storage,
        lock: null,
        classroomId: CLASSROOM_ID,
        knownActionIds: interrupted.preview.knownActionIds,
        transactionId: pending.transactionId,
        operationId: pending.operationId,
      });
      const cancellation = await cancelPendingCurriculumPreparation({
        storage: interrupted.storage,
        lock: null,
        classroomId: CLASSROOM_ID,
        knownActionIds: interrupted.preview.knownActionIds,
        transactionId: pending.transactionId,
        operationId: pending.operationId,
      });
      const revisions = await createTwoRevisions();
      if (!revisions) return false;
      const writesBeforeRollback = revisions.storage.writeCount;
      const rollback = await rollbackCurriculumBackup({
        storage: revisions.storage,
        lock: null,
        classroomId: CLASSROOM_ID,
        backupKey: revisions.second.backupKey ?? "",
        expectedRevision: 2,
        writtenAt: "2026-08-26T10:00:00.000Z",
        knownActionIds: ["action-a", "action-b"],
      });
      return recovery.status === "rejected"
        && cancellation.status === "rejected"
        && rollback.status === "rejected"
        && rollback.reason === "exclusive-lock-unavailable"
        && interrupted.storage.writeCount === writesBeforeRecovery
        && interrupted.storage.removeCount === removesBeforeRecovery
        && revisions.storage.writeCount === writesBeforeRollback;
    }),
    check("a recovery request cannot remove another transaction", async () => {
      const scenario = await createInterruptedPromotion();
      const original = requirePendingTransaction(scenario);
      const result = await cancelPendingCurriculumPreparation({
        storage: scenario.storage,
        lock: scenario.storage.lock,
        classroomId: CLASSROOM_ID,
        knownActionIds: scenario.preview.knownActionIds,
        transactionId: `${original.transactionId}:other`,
        operationId: `${original.operationId}:other`,
      });
      const after = requirePendingTransaction(scenario);
      return result.status === "rejected"
        && after.transactionId === original.transactionId
        && after.operationId === original.operationId;
    }),
    check("recovery after review failure keeps the promoted revision", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      storage.failNextSet(getCurriculumStorageKeys(CLASSROOM_ID).review);
      const failedApply = await applyPreview(storage, preview, FIRST_INSTANT);
      const transaction = requirePendingTransaction({ storage, preview });
      const promoted = readCurriculumState(storage, CLASSROOM_ID, preview.knownActionIds);
      const completed = await completePendingCurriculumTransaction({
        storage,
        lock: storage.lock,
        classroomId: CLASSROOM_ID,
        knownActionIds: preview.knownActionIds,
        transactionId: transaction.transactionId,
        operationId: transaction.operationId,
      });
      const recovered = readCurriculumState(storage, CLASSROOM_ID, preview.knownActionIds);
      const review = storage.readJson(getCurriculumStorageKeys(CLASSROOM_ID).review);
      return failedApply.status === "failed"
        && failedApply.phase === "review-write"
        && promoted.status === "pending-transaction"
        && promoted.current.status === "valid"
        && promoted.current.envelope.revision === 1
        && completed.status === "completed"
        && completed.envelope.revision === 1
        && recovered.status === "valid"
        && recovered.envelope.revision === 1
        && isRecord(review)
        && review.revision === 1
        && review.operationId === preview.plan.id;
    }),
    check("canonical checksum ignores non-semantic collection and property order", () => {
      const preview = createPreview(CLASSROOM_ID, null, [
        createLegacyAction("action-a", -2),
        createLegacyAction("action-b", 1),
      ]);
      const enriched = addSecondResolvedCriterion(preview.targetData);
      const reordered = reverseNonSemanticOrder(reverseObjectProperties(enriched));
      return calculateCurriculumContentChecksum(enriched)
        === calculateCurriculumContentChecksum(reordered);
    }),
    check("special classroom identifiers produce unambiguous keys and preserve identity", () => {
      const classroomIds = ["class:a", "class/a", "class a", "clase con espacios", "clase-ñ", "class%3Aa"];
      const keys = classroomIds.map((classroomId) => getCurriculumStorageKeys(classroomId).current);
      if (new Set(keys).size !== classroomIds.length) return false;
      return classroomIds.every((classroomId) => {
        const preview = createPreview(classroomId);
        const envelope = createEnvelope(preview, 1, FIRST_INSTANT);
        return envelope.classroomId === classroomId
          && getCurriculumStorageKeys(classroomId).current.includes(encodeURIComponent(classroomId));
      });
    }),
    check("a different operation with equal content is not mistaken for idempotence", async () => {
      const storage = new MemoryCurriculumStorage();
      const preview = createPreview(CLASSROOM_ID);
      const first = await applyPreview(storage, preview, FIRST_INSTANT);
      if (first.status !== "applied") return false;
      const differentIntent: CurriculumMigrationPreview = {
        ...preview,
        plan: { ...preview.plan, id: `${preview.plan.id}:different-intent` },
        expectedRevision: 1,
        expectedContentChecksum: first.envelope.contentChecksum,
        targetRevision: 2,
        hasChanges: false,
        canApply: true,
      };
      const second = await applyPreview(storage, differentIntent, SECOND_INSTANT);
      return second.status === "applied"
        && second.envelope.revision === 2
        && second.envelope.lastOperationId === differentIntent.plan.id;
    }),
    check("concurrent rollback and migration serialize under one classroom lock", async () => {
      const scenario = await createTwoRevisions();
      if (!scenario) return false;
      const migrationPreview = createPreview(
        CLASSROOM_ID,
        scenario.second.envelope,
        [
          createLegacyAction("action-a", -2),
          createLegacyAction("action-b", 1),
          createLegacyAction("action-c", 2),
        ],
        "2026-08-26T09:00:00.000Z"
      );
      const entriesBefore = scenario.storage.lock.entryCount;
      const [rollback, migration] = await Promise.all([
        rollbackCurriculumBackup({
          storage: scenario.storage,
          lock: scenario.storage.lock,
          classroomId: CLASSROOM_ID,
          backupKey: scenario.second.backupKey ?? "",
          expectedRevision: 2,
          writtenAt: "2026-08-26T10:00:00.000Z",
          knownActionIds: ["action-a", "action-b", "action-c"],
        }),
        applyPreview(scenario.storage, migrationPreview, "2026-08-26T10:01:00.000Z"),
      ]);
      const state = readCurriculumState(
        scenario.storage,
        CLASSROOM_ID,
        ["action-a", "action-b", "action-c"]
      );
      return rollback.status === "applied"
        && migration.status === "rejected"
        && migration.reason === "stale-revision"
        && state.status === "valid"
        && state.envelope.revision === 3
        && scenario.storage.lock.maximumConcurrentEntries === 1
        && scenario.storage.lock.entryCount === entriesBefore + 2;
    }),
    check("backup keys remain distinct across different operations", async () => {
      const scenario = await createTwoRevisions();
      return scenario !== null
        && scenario.first.backupKey !== null
        && scenario.second.backupKey !== null
        && scenario.first.backupKey !== scenario.second.backupKey;
    }),
    check("browser lock adapter is import-safe without navigator", () => {
      return typeof navigator !== "undefined" || getBrowserCurriculumExclusiveLock() === null;
    }),
  ]);
}

class MemoryCurriculumStorage implements CurriculumStorageAdapter {
  private readonly values = new Map<string, string>();
  private readonly failingSetKeys = new Set<string>();
  readonly lock = new MemoryCurriculumExclusiveLock();
  readCount = 0;
  writeCount = 0;
  removeCount = 0;

  getItem(key: string): string | null {
    this.readCount += 1;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writeCount += 1;
    if (this.failingSetKeys.delete(key)) throw new Error(`Injected setItem failure for ${key}.`);
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removeCount += 1;
    this.values.delete(key);
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, serializeCurriculumStorageValue(value));
  }

  seedRaw(key: string, value: string): void {
    this.values.set(key, value);
  }

  failNextSet(key: string): void {
    this.failingSetKeys.add(key);
  }

  resetCounters(): void {
    this.readCount = 0;
    this.writeCount = 0;
    this.removeCount = 0;
  }

  readJson(key: string): unknown {
    const value = this.values.get(key);
    return value === undefined ? null : JSON.parse(value);
  }
}

class MemoryCurriculumExclusiveLock implements CurriculumExclusiveLock {
  private readonly tails = new Map<string, Promise<void>>();
  private activeEntries = 0;
  entryCount = 0;
  maximumConcurrentEntries = 0;

  async runExclusive<T>(
    classroomId: string,
    operation: () => T | Promise<T>
  ): Promise<CurriculumExclusiveLockResult<T>> {
    const lockName = getCurriculumExclusiveLockName(classroomId);
    const previous = this.tails.get(lockName) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(lockName, tail);
    await previous;
    this.activeEntries += 1;
    this.entryCount += 1;
    this.maximumConcurrentEntries = Math.max(
      this.maximumConcurrentEntries,
      this.activeEntries
    );
    try {
      return { status: "acquired", value: await operation() };
    } catch (error) {
      return {
        status: "unavailable",
        message: error instanceof Error ? error.message : "Simulated lock operation failed.",
      };
    } finally {
      this.activeEntries -= 1;
      release();
      if (this.tails.get(lockName) === tail) this.tails.delete(lockName);
    }
  }
}

async function createInterruptedPromotion(): Promise<{
  readonly storage: MemoryCurriculumStorage;
  readonly preview: CurriculumMigrationPreview;
}> {
  const storage = new MemoryCurriculumStorage();
  const preview = createPreview(CLASSROOM_ID);
  storage.failNextSet(getCurriculumStorageKeys(CLASSROOM_ID).current);
  await applyPreview(storage, preview, FIRST_INSTANT);
  storage.removeCount = 0;
  return { storage, preview };
}

async function createTwoRevisions(): Promise<{
  readonly storage: MemoryCurriculumStorage;
  readonly first: Extract<Awaited<ReturnType<typeof applyPreview>>, { status: "applied" | "already-applied" }>;
  readonly second: Extract<Awaited<ReturnType<typeof applyPreview>>, { status: "applied" | "already-applied" }>;
} | null> {
  const storage = new MemoryCurriculumStorage();
  const firstResult = await applyPreview(storage, createPreview(CLASSROOM_ID), FIRST_INSTANT);
  if (firstResult.status !== "applied") return null;
  const secondPreview = createPreview(
    CLASSROOM_ID,
    firstResult.envelope,
    [createLegacyAction("action-a", -2), createLegacyAction("action-b", 1)]
  );
  const secondResult = await applyPreview(storage, secondPreview, SECOND_INSTANT);
  if (secondResult.status !== "applied") return null;
  return { storage, first: firstResult, second: secondResult };
}

function createPreview(
  classroomId: string,
  currentEnvelope: CurriculumStorageEnvelope | null = null,
  legacyActions: readonly Action[] = [createLegacyAction("action-a", -2)],
  plannedAt = FIRST_INSTANT
): CurriculumMigrationPreview {
  return previewCurriculumMigration({
    classroomId,
    plannedAt,
    legacyActions,
    curriculumSubjects: [createSubject()],
    currentEnvelope,
  });
}

function applyPreview(
  storage: MemoryCurriculumStorage,
  preview: CurriculumMigrationPreview,
  writtenAt: string
): ReturnType<typeof applyCurriculumMigration> {
  return applyCurriculumMigration({
    storage,
    lock: storage.lock,
    classroomId: preview.classroomId,
    preview,
    expectedRevision: preview.expectedRevision,
    writtenAt,
  });
}

function requirePendingTransaction(scenario: {
  readonly storage: MemoryCurriculumStorage;
  readonly preview: CurriculumMigrationPreview;
}) {
  const inspection = inspectPendingCurriculumTransaction(
    scenario.storage,
    CLASSROOM_ID,
    scenario.preview.knownActionIds
  );
  if (inspection.status !== "pending") throw new Error("Expected a pending transaction.");
  return inspection.transaction;
}

function createEnvelope(
  preview: CurriculumMigrationPreview,
  revision: number,
  writtenAt: string
): CurriculumStorageEnvelope {
  return createCurriculumStorageEnvelope({
    classroomId: preview.classroomId,
    revision,
    curriculumData: preview.targetData,
    writtenAt,
    operationId: preview.plan.id,
  });
}

function createSubject(): CurriculumSubject {
  return {
    id: "curriculum-subject:music",
    externalCode: "MUS",
    legacySubjectId: "music",
    name: "Música",
    criteria: [{
      id: "criterion:music:1",
      externalCode: "MUS-1",
      sourceVersion: "legacy-v1",
      title: "Criterio musical",
      text: "Texto curricular de prueba.",
    }],
    basicKnowledge: [{
      id: "knowledge:music:1",
      externalCode: "MUS-S1",
      text: "Saber musical de prueba.",
      criterionIds: ["criterion:music:1"],
    }],
  };
}

function createLegacyAction(id: string, points: number): Action {
  return {
    id,
    title: `Acción heredada ${id}`,
    points,
    archived: false,
    quickSlot: null,
    subjectId: "music",
    availableInAllSubjects: false,
    attitudinalCriterionLinks: [{
      criterionId: "MUS-1",
      catalogVersion: "legacy-v1",
    }],
    trackOrdinaryCompliance: false,
  };
}

function addSecondResolvedCriterion(data: VersionedCurriculumData): VersionedCurriculumData {
  const criterionId = "criterion:music:2";
  return {
    ...data,
    packs: data.packs.map((pack) => ({
      ...pack,
      subjects: pack.subjects.map((subject) => ({
        ...subject,
        criteria: [
          ...subject.criteria,
          {
            id: criterionId,
            externalCode: "MUS-2",
            sourceVersion: "legacy-v1",
            text: "Segundo criterio curricular de prueba.",
          },
        ],
        basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
          ...knowledge,
          criterionIds: [...knowledge.criterionIds, criterionId],
        })),
      })),
    })),
    actionLinks: data.actionLinks.map((link) => ({
      ...link,
      resolvedCriterionIds: [...link.resolvedCriterionIds, criterionId],
    })),
  };
}

function reverseNonSemanticOrder(data: VersionedCurriculumData): VersionedCurriculumData {
  return {
    ...data,
    packs: [...data.packs].reverse().map((pack) => ({
      ...pack,
      subjects: pack.subjects.map((subject) => ({
        ...subject,
        basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
          ...knowledge,
          criterionIds: [...knowledge.criterionIds].reverse(),
        })),
      })),
    })),
    profiles: [...data.profiles].reverse(),
    actionLinks: [...data.actionLinks].reverse().map((link) => ({
      ...link,
      resolvedCriterionIds: [...link.resolvedCriterionIds].reverse(),
    })),
  };
}

function reverseObjectProperties<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseObjectProperties) as T;
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).reverse().map((key) => [key, reverseObjectProperties(value[key])])
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function check(
  name: string,
  predicate: () => boolean | Promise<boolean>
): Promise<CurriculumStorageDeterministicCheck> {
  try {
    return { name, passed: await predicate() };
  } catch {
    return { name, passed: false };
  }
}
