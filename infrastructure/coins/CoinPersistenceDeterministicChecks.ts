import type { CoinClassState, CoinOperationResult } from "../../domain/coins/CoinContracts";
import { DEFAULT_COIN_LIMITS } from "../../domain/coins/CoinContracts";
import {
  createCoinClassState,
  setCoinsEnabled,
} from "../../domain/coins/CoinCore";
import {
  getBrowserCoinExclusiveLock,
  getBrowserCoinStorage,
  getCoinLockName,
  getCoinStorageKey,
  readCoinClassState,
  writeCoinClassState,
  type CoinExclusiveLock,
  type CoinExclusiveLockResult,
  type CoinStorageAdapter,
} from "./CoinPersistence";
import { measureCoinStorageScenarios } from "./CoinStorageScenarios";

export interface CoinPersistenceDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const CLASSROOM_ID = "classroom-persistence";
const INSTANT = "2026-08-30T10:00:00.000Z";

export async function runCoinPersistenceDeterministicChecks(): Promise<
  readonly CoinPersistenceDeterministicCheck[]
> {
  const checks = await Promise.all([
    check("coin persistence: missing read performs no writes", () => {
      const storage = new MemoryCoinStorage();
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "empty" && storage.writeCount === 0;
    }),
    check("coin persistence: valid read performs no writes", async () => {
      const storage = new MemoryCoinStorage();
      const state = initialState();
      const written = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state,
      });
      if (written.status !== "written") return false;
      storage.resetCounters();
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "valid" && storage.writeCount === 0;
    }),
    check("coin persistence: corrupt JSON returns typed corruption", () => {
      const storage = new MemoryCoinStorage();
      storage.seedRaw(keyFor(CLASSROOM_ID), "{not-json");
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected" && result.failure.code === "corrupt";
    }),
    check("coin persistence: wrong checksum is rejected", () => {
      const storage = new MemoryCoinStorage();
      storage.seed(keyFor(CLASSROOM_ID), {
        ...initialState(),
        integrity: { ...initialState().integrity, checksum: "coin-state-fnv1a64-v1:wrong" },
      });
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected" && result.failure.code === "corrupt";
    }),
    check("coin persistence: manipulated balance is rejected", () => {
      const state = enabledState();
      const storage = new MemoryCoinStorage();
      storage.seed(keyFor(CLASSROOM_ID), {
        ...state,
        balances: [{ ...state.balances[0], balance: 999 }],
      });
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected" && result.failure.code === "corrupt";
    }),
    check("coin persistence: unsupported schema is not migrated or rewritten", () => {
      const storage = new MemoryCoinStorage();
      storage.seedRaw(keyFor(CLASSROOM_ID), JSON.stringify({
        ...initialState(),
        schemaVersion: 999,
      }));
      storage.resetCounters();
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected"
        && result.failure.code === "incompatible-version"
        && storage.writeCount === 0;
    }),
    check("coin persistence: SSR adapters are unavailable without writing", () => {
      if (typeof window !== "undefined" || typeof navigator !== "undefined") return true;
      const read = readCoinClassState(getBrowserCoinStorage(), CLASSROOM_ID);
      return getBrowserCoinStorage() === null
        && getBrowserCoinExclusiveLock() === null
        && read.status === "rejected"
        && read.failure.code === "storage-unavailable";
    }),
    check("coin persistence: denied browser storage and lock access degrades to unavailable", () => {
      const storageSafe = withThrowingGlobalProperty("window", () => getBrowserCoinStorage() === null);
      const lockSafe = withThrowingGlobalProperty("navigator", () => getBrowserCoinExclusiveLock() === null);
      return storageSafe && lockSafe;
    }),
    check("coin persistence: dangerous classroom IDs are rejected", () => {
      return ["", "   ", "..", "class/other", "class\\other", "constructor", "prototype", "__proto__"]
        .every((id) => getCoinStorageKey(id).status === "rejected");
    }),
    check("coin persistence: versioned encoded keys isolate classrooms", () => {
      const first = getCoinStorageKey("class:a");
      const second = getCoinStorageKey("class-b");
      return first.status === "valid"
        && second.status === "valid"
        && first.key !== second.key
        && first.key.includes("v1")
        && first.key.includes("class%3Aa");
    }),
    check("coin persistence: lock names are stable per class and distinct across classes", () => {
      const first = getCoinLockName("class:a");
      const same = getCoinLockName("class:a");
      const other = getCoinLockName("class-b");
      return first.status === "valid" && same.status === "valid" && other.status === "valid"
        && first.key === same.key && first.key !== other.key && first.key.includes("class%3Aa");
    }),
    check("coin persistence: optimistic revision accepts exact next revision", async () => {
      const storage = new MemoryCoinStorage();
      const lock = new SerialCoinLock();
      const initial = initialState();
      const first = await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: initial });
      if (first.status !== "written") return false;
      const enabled = mustApply(setCoinsEnabled(initial, enableCommand("enable-write", ["student-1"])));
      const second = await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: enabled });
      return second.status === "written" && second.state.revision === 1;
    }),
    check("coin persistence: stale optimistic revision is detected", async () => {
      const storage = new MemoryCoinStorage();
      const lock = new SerialCoinLock();
      const initial = initialState();
      await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: initial });
      const enabled = mustApply(setCoinsEnabled(initial, enableCommand("enable-stale", ["student-1"])));
      await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: enabled });
      const other = mustApply(setCoinsEnabled(initial, enableCommand("enable-other", ["student-2"])));
      const stale = await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: other });
      return stale.status === "rejected"
        && stale.failure.code === "revision-conflict"
        && stale.failure.foundRevision === 1
        && stale.failure.storageOutcome === "not-written";
    }),
    check("coin persistence: two writers serialize and one detects conflict", async () => {
      const storage = new MemoryCoinStorage();
      const lock = new SerialCoinLock();
      const initial = initialState();
      await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: initial });
      const firstCandidate = mustApply(setCoinsEnabled(initial, enableCommand("writer-a", ["student-1"])));
      const secondCandidate = mustApply(setCoinsEnabled(initial, enableCommand("writer-b", ["student-2"])));
      const results = await Promise.all([
        writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: firstCandidate }),
        writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: secondCandidate }),
      ]);
      return results.filter((item) => item.status === "written").length === 1
        && results.filter((item) => item.status === "rejected" && item.failure.code === "revision-conflict").length === 1
        && lock.maximumActive === 1;
    }),
    check("coin persistence: injected lock enforces mutual exclusion", async () => {
      const lock = new SerialCoinLock();
      let releaseFirst: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const first = lock.runExclusive(CLASSROOM_ID, async () => {
        await gate;
        return "first";
      });
      const second = lock.runExclusive(CLASSROOM_ID, async () => "second");
      await Promise.resolve();
      releaseFirst?.();
      await Promise.all([first, second]);
      return lock.maximumActive === 1;
    }),
    check("coin persistence: one shared lock coordinates independent service calls", async () => {
      const storage = new MemoryCoinStorage();
      const sharedLock = new SerialCoinLock();
      const initial = initialState();
      await writeCoinClassState({ storage, lock: sharedLock, classroomId: CLASSROOM_ID, expectedRevision: 0, state: initial });
      const candidates = [
        mustApply(setCoinsEnabled(initial, enableCommand("shared-service-a", ["student-a"]))),
        mustApply(setCoinsEnabled(initial, enableCommand("shared-service-b", ["student-b"]))),
      ];
      const results = await Promise.all(candidates.map((state) => writeCoinClassState({
        storage, lock: sharedLock, classroomId: CLASSROOM_ID, expectedRevision: 0, state,
      })));
      return sharedLock.maximumActive === 1
        && results.filter((result) => result.status === "written").length === 1
        && results.filter((result) => result.status === "rejected").length === 1;
    }),
    check("coin persistence: distinct lock instances do not provide cross-context exclusion", async () => {
      const firstLock = new SerialCoinLock();
      const secondLock = new SerialCoinLock();
      let active = 0;
      let maximumActive = 0;
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const operation = async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await gate;
        active -= 1;
      };
      const first = firstLock.runExclusive(CLASSROOM_ID, operation);
      const second = secondLock.runExclusive(CLASSROOM_ID, operation);
      await Promise.resolve();
      await Promise.resolve();
      release?.();
      await Promise.all([first, second]);
      return maximumActive === 2;
    }),
    check("coin persistence: a class-aware lock permits different classrooms in parallel", async () => {
      const lock = new PerClassCoinLock();
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const first = lock.runExclusive("class-a", async () => { await gate; });
      const second = lock.runExclusive("class-b", async () => { await gate; });
      await Promise.resolve();
      await Promise.resolve();
      release?.();
      await Promise.all([first, second]);
      return lock.maximumActive === 2;
    }),
    check("coin persistence: post-write verification detects tampering", async () => {
      const storage = new TamperingCoinStorage();
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state: initialState(),
      });
      return result.status === "rejected"
        && result.failure.code === "verification-failed"
        && result.failure.storageOutcome === "unknown";
    }),
    check("coin persistence: identical persisted write is idempotent", async () => {
      const storage = new MemoryCoinStorage();
      const lock = new SerialCoinLock();
      const state = initialState();
      const first = await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state });
      const retry = await writeCoinClassState({ storage, lock, classroomId: CLASSROOM_ID, expectedRevision: 0, state });
      return first.status === "written" && retry.status === "idempotent" && storage.writeCount === 1;
    }),
    check("coin persistence: a write touches exactly one classroom key", async () => {
      const storage = new MemoryCoinStorage();
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state: initialState(),
      });
      return result.status === "written"
        && storage.writtenKeys.length === 1
        && storage.writtenKeys[0] === keyFor(CLASSROOM_ID);
    }),
    check("coin persistence: storage read exceptions become typed results", () => {
      const storage: CoinStorageAdapter = {
        getItem() { throw new Error("read failed"); },
        setItem() { throw new Error("unused"); },
      };
      const result = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected" && result.failure.code === "storage-error";
    }),
    check("coin persistence: storage write exceptions become typed results", async () => {
      const storage: CoinStorageAdapter = {
        getItem() { return null; },
        setItem() { throw new Error("write failed"); },
      };
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state: initialState(),
      });
      return result.status === "rejected"
        && result.failure.code === "storage-error"
        && result.failure.storageOutcome === "unknown";
    }),
    check("coin persistence: a throw-before-write adapter leaves its previous value readable", async () => {
      const storage = new ThrowBeforeWriteCoinStorage();
      const previous = initialState();
      storage.seed(keyFor(CLASSROOM_ID), previous);
      const next = mustApply(setCoinsEnabled(previous, enableCommand("enable-after-previous", ["student-1"])));
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state: next,
      });
      const reread = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected"
        && result.failure.code === "storage-error"
        && result.failure.storageOutcome === "unknown"
        && reread.status === "valid"
        && reread.state.revision === 0
        && reread.state.integrity.checksum === previous.integrity.checksum;
    }),
    check("coin persistence: a write-then-throw adapter exposes unknown storage outcome", async () => {
      const storage = new WriteThenThrowCoinStorage();
      const state = initialState();
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state,
      });
      const reread = readCoinClassState(storage, CLASSROOM_ID);
      return result.status === "rejected"
        && result.failure.code === "storage-error"
        && result.failure.storageOutcome === "unknown"
        && reread.status === "valid"
        && reread.state.integrity.checksum === state.integrity.checksum;
    }),
    check("coin persistence: write without lock is rejected", async () => {
      const result = await writeCoinClassState({
        storage: new MemoryCoinStorage(),
        lock: null,
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state: initialState(),
      });
      return result.status === "rejected"
        && result.failure.code === "lock-unavailable"
        && result.failure.storageOutcome === "not-written";
    }),
    check("coin persistence: negative-zero expected revision is rejected before writing", async () => {
      const storage = new MemoryCoinStorage();
      const result = await writeCoinClassState({
        storage,
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: -0,
        state: initialState(),
      });
      return result.status === "rejected"
        && result.failure.code === "invalid-revision"
        && result.failure.storageOutcome === "not-written"
        && storage.writeCount === 0;
    }),
    check("coin persistence: oversized raw data is rejected before parsing", () => {
      const storage = new MemoryCoinStorage();
      storage.seedRaw(keyFor(CLASSROOM_ID), "x".repeat(101));
      const limits = {
        ...DEFAULT_COIN_LIMITS,
        maxPersistedCodeUnits: 100,
        maxPersistedUtf8Bytes: 100,
      };
      const result = readCoinClassState(storage, CLASSROOM_ID, limits);
      return result.status === "rejected" && result.failure.code === "size-limit-exceeded";
    }),
    check("coin persistence: frozen state can be written without mutation", async () => {
      const state = deepFreeze(initialState());
      const checksum = state.integrity.checksum;
      const result = await writeCoinClassState({
        storage: new MemoryCoinStorage(),
        lock: new SerialCoinLock(),
        classroomId: CLASSROOM_ID,
        expectedRevision: 0,
        state,
      });
      return result.status === "written" && state.integrity.checksum === checksum;
    }),
  ]);

  const measurements = measureCoinStorageScenarios();
  checks.push(
    synchronousCheck("coin budget: realistic 26-student state exceeds small state", () =>
      measurements.realisticClass26Students.codeUnits > measurements.smallDisabledState.codeUnits),
    synchronousCheck("coin budget: full simulated course stays inside persisted budget", () =>
      measurements.simulatedFullCourse.codeUnits <= DEFAULT_COIN_LIMITS.maxPersistedCodeUnits
      && measurements.simulatedFullCourse.utf8Bytes <= DEFAULT_COIN_LIMITS.maxPersistedUtf8Bytes
      && measurements.simulatedFullCourse.students === 26
      && measurements.simulatedFullCourse.movements >= 1_000),
    synchronousCheck("coin budget: intensive course is measured and default size limit prevails predictably", () =>
      measurements.simulatedIntensiveCourse.movements === 4_004
      && measurements.simulatedIntensiveCourse.codeUnits > DEFAULT_COIN_LIMITS.maxPersistedCodeUnits
      && measurements.simulatedIntensiveCourse.defaultValidationFailure === "size-limit-exceeded"
      && measurements.simulatedIntensiveCourse.movements < DEFAULT_COIN_LIMITS.maxMovements),
    synchronousCheck("coin budget: near-limit state approaches configured code-unit budget", () =>
      measurements.nearLimitState.codeUnits >= DEFAULT_COIN_LIMITS.maxPersistedCodeUnits * 0.75
      && measurements.nearLimitState.codeUnits <= DEFAULT_COIN_LIMITS.maxPersistedCodeUnits),
    synchronousCheck("coin budget: idempotency journal retains every simulated operation", () =>
      measurements.fullCourseIdempotencyJournal.entries
        === measurements.simulatedFullCourse.idempotencyOperations),
    synchronousCheck("coin budget: UTF-8 measurement distinguishes Unicode from code units", () =>
      measurements.unicodeRewardSample.utf8Bytes > measurements.unicodeRewardSample.codeUnits),
    synchronousCheck("coin budget: read-modify-serialize peak uses documented bounded formula", () =>
      measurements.fullCourseReadModifySerializePeak.formula === "2*current + 2*next"
      && measurements.fullCourseReadModifySerializePeak.codeUnits
        <= DEFAULT_COIN_LIMITS.maxTransitionPeakCodeUnits
      && measurements.fullCourseReadModifySerializePeak.utf8Bytes
        <= DEFAULT_COIN_LIMITS.maxTransitionPeakUtf8Bytes),
    synchronousCheck("coin budget: shared-origin plan reserves space beyond coins and curriculum", () =>
      measurements.sharedOriginBudgetPlan.coinCodeUnits === DEFAULT_COIN_LIMITS.maxPersistedCodeUnits
      && measurements.sharedOriginBudgetPlan.combinedCodeUnits
        === measurements.sharedOriginBudgetPlan.coinCodeUnits
          + measurements.sharedOriginBudgetPlan.curriculumCodeUnits
          + measurements.sharedOriginBudgetPlan.otherDataReserveCodeUnits)
  );
  return checks;
}

class MemoryCoinStorage implements CoinStorageAdapter {
  protected readonly values = new Map<string, string>();
  writeCount = 0;
  readonly writtenKeys: string[] = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writeCount += 1;
    this.writtenKeys.push(key);
    this.values.set(key, value);
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, JSON.stringify(value));
  }

  seedRaw(key: string, value: string): void {
    this.values.set(key, value);
  }

  resetCounters(): void {
    this.writeCount = 0;
    this.writtenKeys.length = 0;
  }
}

class TamperingCoinStorage extends MemoryCoinStorage {
  override setItem(key: string, value: string): void {
    const parsed = JSON.parse(value) as CoinClassState;
    super.setItem(key, JSON.stringify({
      ...parsed,
      revision: parsed.revision + 1,
    }));
  }
}

class WriteThenThrowCoinStorage extends MemoryCoinStorage {
  override setItem(key: string, value: string): void {
    super.setItem(key, value);
    throw new Error("adapter threw after mutating storage");
  }
}

class ThrowBeforeWriteCoinStorage extends MemoryCoinStorage {
  override setItem(): void {
    throw new Error("adapter threw before mutating storage");
  }
}

class SerialCoinLock implements CoinExclusiveLock {
  private tail: Promise<void> = Promise.resolve();
  private active = 0;
  maximumActive = 0;

  async runExclusive<T>(
    _classroomId: string,
    operation: () => T | Promise<T>
  ): Promise<CoinExclusiveLockResult<T>> {
    let release: (() => void) | undefined;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      return { status: "acquired", value: await operation() };
    } finally {
      this.active -= 1;
      release?.();
    }
  }
}

class PerClassCoinLock implements CoinExclusiveLock {
  private readonly tails = new Map<string, Promise<void>>();
  private active = 0;
  maximumActive = 0;

  async runExclusive<T>(
    classroomId: string,
    operation: () => T | Promise<T>
  ): Promise<CoinExclusiveLockResult<T>> {
    let release: (() => void) | undefined;
    const previous = this.tails.get(classroomId) ?? Promise.resolve();
    this.tails.set(classroomId, new Promise<void>((resolve) => { release = resolve; }));
    await previous;
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      return { status: "acquired", value: await operation() };
    } finally {
      this.active -= 1;
      release?.();
    }
  }
}

function initialState(): CoinClassState {
  const created = createCoinClassState(CLASSROOM_ID);
  if (created.status !== "created") throw new Error(created.failure.message);
  return created.state;
}

function enabledState(): CoinClassState {
  return mustApply(setCoinsEnabled(initialState(), enableCommand("enable-persistence", ["student-1"])));
}

function enableCommand(operationId: string, studentIds: readonly string[]) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    enabled: true,
    studentIds,
    occurredAt: INSTANT,
  } as const;
}

function mustApply(result: CoinOperationResult): CoinClassState {
  if (result.status !== "applied") throw new Error("Expected applied monetary operation.");
  return result.state;
}

function keyFor(classroomId: string): string {
  const result = getCoinStorageKey(classroomId);
  if (result.status !== "valid") throw new Error(result.failure.message);
  return result.key;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

async function check(
  name: string,
  predicate: () => boolean | Promise<boolean>
): Promise<CoinPersistenceDeterministicCheck> {
  try {
    return { name, passed: await predicate() };
  } catch {
    return { name, passed: false };
  }
}

function synchronousCheck(
  name: string,
  predicate: () => boolean
): CoinPersistenceDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}

function withThrowingGlobalProperty(name: "window" | "navigator", predicate: () => boolean): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (descriptor && !descriptor.configurable) return true;
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new Error(`${name} access denied`); },
    });
    return predicate();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
