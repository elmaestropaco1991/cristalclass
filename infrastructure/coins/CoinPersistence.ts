import {
  COIN_STATE_SCHEMA_VERSION,
  DEFAULT_COIN_LIMITS,
  type CoinClassState,
  type CoinLimits,
} from "../../domain/coins/CoinContracts";
import {
  measureCoinJsonText,
  measureCoinSerializedJson,
  resolveCoinLimits,
  type CoinSerializedSize,
} from "../../domain/coins/CoinIntegrity";
import {
  validateCoinClassState,
  validateCoinStableId,
} from "../../domain/coins/CoinValidation";
import { estimateCoinStorageTransitionPeak } from "./CoinStorageBudget";

export const COIN_STORAGE_KEY_VERSION = 1 as const;
const COIN_STORAGE_PREFIX = "cristalclass_coins_v1";

export interface CoinStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type CoinExclusiveLockResult<T> =
  | { readonly status: "acquired"; readonly value: T }
  /** The callback was not invoked. */
  | { readonly status: "unavailable"; readonly message: string };

/**
 * A write lock must coordinate every writer for the same classroom, including other tabs/workers.
 * An in-memory/per-caller lock is insufficient for shared storage. The browser adapter uses one
 * origin-scoped Web Locks name per classroom. The storage adapter itself provides no atomic CAS.
 */
export interface CoinExclusiveLock {
  runExclusive<T>(
    classroomId: string,
    operation: () => T | Promise<T>
  ): Promise<CoinExclusiveLockResult<T>>;
}

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    callback: () => T | Promise<T>
  ): Promise<T>;
}

export type CoinPersistenceFailureCode =
  | "invalid-classroom-id"
  | "invalid-limits"
  | "classroom-conflict"
  | "storage-unavailable"
  | "storage-error"
  | "corrupt"
  | "incompatible-version"
  | "size-limit-exceeded"
  | "transition-peak-exceeded"
  | "invalid-revision"
  | "revision-conflict"
  | "invalid-state-transition"
  | "lock-unavailable"
  | "verification-failed";

export interface CoinPersistenceFailure {
  readonly code: CoinPersistenceFailureCode;
  readonly message: string;
  readonly foundRevision?: number;
  /** Whether this call definitely did not write, or storage must be reread before retrying. */
  readonly storageOutcome: "not-written" | "unknown";
}

export type CoinStorageKeyResult =
  | { readonly status: "valid"; readonly key: string }
  | { readonly status: "rejected"; readonly failure: CoinPersistenceFailure };

export type CoinPersistenceReadResult =
  | { readonly status: "empty"; readonly revision: 0 }
  | {
      readonly status: "valid";
      readonly state: CoinClassState;
      readonly size: CoinSerializedSize;
    }
  | { readonly status: "rejected"; readonly failure: CoinPersistenceFailure };

export type CoinPersistenceWriteResult =
  | {
      readonly status: "written" | "idempotent";
      readonly state: CoinClassState;
      readonly size: CoinSerializedSize;
    }
  | { readonly status: "rejected"; readonly failure: CoinPersistenceFailure };

export function getCoinStorageKey(
  classroomId: string,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinStorageKeyResult {
  const resolved = resolveCoinLimits(limits);
  if (resolved.status === "rejected") {
    return {
      status: "rejected",
      failure: persistenceFailure("invalid-limits", resolved.failure.message),
    };
  }
  const idFailure = validateCoinStableId(classroomId, "classroomId", resolved.limits);
  if (idFailure) {
    return {
      status: "rejected",
      failure: persistenceFailure("invalid-classroom-id", idFailure.message),
    };
  }
  return {
    status: "valid",
    key: `${COIN_STORAGE_PREFIX}:${encodeURIComponent(classroomId)}`,
  };
}

export function getCoinLockName(
  classroomId: string,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinStorageKeyResult {
  const key = getCoinStorageKey(classroomId, limits);
  return key.status === "rejected"
    ? key
    : { status: "valid", key: `cristalclass-coins-lock-v1:${encodeURIComponent(classroomId)}` };
}

export function getBrowserCoinStorage(): CoinStorageAdapter | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getBrowserCoinExclusiveLock(
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinExclusiveLock | null {
  try {
    if (typeof navigator === "undefined") return null;
    const manager = (navigator as Navigator & { readonly locks?: BrowserLockManager }).locks;
    if (!manager || typeof manager.request !== "function") return null;
    return {
      async runExclusive<T>(classroomId: string, operation: () => T | Promise<T>) {
        const lockName = getCoinLockName(classroomId, limits);
        if (lockName.status === "rejected") {
          return { status: "unavailable", message: lockName.failure.message };
        }
        try {
          const value = await manager.request(
            lockName.key,
            { mode: "exclusive" },
            operation
          );
          return { status: "acquired" as const, value };
        } catch (error) {
          return {
            status: "unavailable" as const,
            message: error instanceof Error
              ? `The exclusive coin lock failed: ${error.message}`
              : "The exclusive coin lock failed.",
          };
        }
      },
    };
  } catch {
    return null;
  }
}

/** Read-only: never creates, migrates, repairs, promotes or deletes stored data. */
export function readCoinClassState(
  storage: CoinStorageAdapter | null,
  classroomId: string,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinPersistenceReadResult {
  try {
    if (storage === null) {
      return rejectedRead("storage-unavailable", "Coin storage is unavailable in this runtime.");
    }
    const key = getCoinStorageKey(classroomId, limits);
    if (key.status === "rejected") return key;
    let serialized: string | null;
    try {
      serialized = storage.getItem(key.key);
    } catch (error) {
      return rejectedRead("storage-error", describeError(error));
    }
    if (serialized === null) return { status: "empty", revision: 0 };
    const rawSize = measureCoinJsonText(serialized);
    if (
      rawSize.codeUnits > limits.maxPersistedCodeUnits
      || rawSize.utf8Bytes > limits.maxPersistedUtf8Bytes
    ) {
      return rejectedRead("size-limit-exceeded", "Stored monetary data exceeds the configured size budget.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return rejectedRead("corrupt", "Stored monetary JSON is corrupt.");
    }
    if (!isRecord(parsed)) return rejectedRead("corrupt", "Stored monetary data is not an object.");
    if (parsed.schemaVersion !== COIN_STATE_SCHEMA_VERSION) {
      return rejectedRead("incompatible-version", "Stored monetary schema is unsupported.");
    }
    if (parsed.classroomId !== classroomId) {
      return rejectedRead("classroom-conflict", "Stored monetary data belongs to another classroom.");
    }
    const validation = validateCoinClassState(parsed, limits, classroomId);
    if (validation.status === "invalid") {
      return rejectedRead(
        validation.failure.code === "size-limit-exceeded" ? "size-limit-exceeded" : "corrupt",
        validation.failure.message
      );
    }
    return { status: "valid", state: validation.state, size: rawSize };
  } catch {
    return rejectedRead("corrupt", "Stored monetary data could not be inspected safely.");
  }
}

export async function writeCoinClassState(input: {
  readonly storage: CoinStorageAdapter | null;
  readonly lock: CoinExclusiveLock | null;
  readonly classroomId: string;
  readonly expectedRevision: number;
  readonly state: CoinClassState;
  readonly limits?: CoinLimits;
}): Promise<CoinPersistenceWriteResult> {
  const limits = input.limits ?? DEFAULT_COIN_LIMITS;
  if (input.storage === null) {
    return rejectedWrite("storage-unavailable", "Coin storage is unavailable in this runtime.");
  }
  if (input.lock === null) {
    return rejectedWrite("lock-unavailable", "An injected exclusive lock is required before writing coins.");
  }
  if (!Number.isSafeInteger(input.expectedRevision)
    || Object.is(input.expectedRevision, -0)
    || input.expectedRevision < 0) {
    return rejectedWrite("invalid-revision", "expectedRevision must be a non-negative safe integer.");
  }
  const key = getCoinStorageKey(input.classroomId, limits);
  if (key.status === "rejected") return key;
  const validation = validateCoinClassState(input.state, limits, input.classroomId);
  if (validation.status === "invalid") {
    const code: CoinPersistenceFailureCode = validation.failure.code === "classroom-conflict"
      ? "classroom-conflict"
      : validation.failure.code === "size-limit-exceeded"
        ? "size-limit-exceeded"
        : "corrupt";
    return rejectedWrite(
      code,
      validation.failure.message
    );
  }

  let locked: CoinExclusiveLockResult<CoinPersistenceWriteResult>;
  try {
    locked = await input.lock.runExclusive(input.classroomId, () =>
      writeLocked(
        input.storage as CoinStorageAdapter,
        key.key,
        input.classroomId,
        input.expectedRevision,
        validation.state,
        limits
      )
    );
  } catch (error) {
    return rejectedWrite("lock-unavailable", describeError(error), "unknown");
  }
  return locked.status === "acquired"
    ? locked.value
    : rejectedWrite("lock-unavailable", locked.message);
}

function writeLocked(
  storage: CoinStorageAdapter,
  key: string,
  classroomId: string,
  expectedRevision: number,
  next: CoinClassState,
  limits: CoinLimits
): CoinPersistenceWriteResult {
  const current = readCoinClassState(storage, classroomId, limits);
  if (current.status === "rejected") return current;
  if (current.status === "valid"
    && current.state.revision === next.revision
    && current.state.integrity.checksum === next.integrity.checksum) {
    return { status: "idempotent", state: current.state, size: current.size };
  }
  const currentRevision = current.status === "empty" ? 0 : current.state.revision;
  if (currentRevision !== expectedRevision) {
    return {
      status: "rejected",
      failure: {
        code: "revision-conflict",
        message: "The stored monetary revision changed before this write.",
        foundRevision: currentRevision,
        storageOutcome: "not-written",
      },
    };
  }
  const initialStateWrite = current.status === "empty" && next.revision === 0;
  if (!initialStateWrite && next.revision !== expectedRevision + 1) {
    return rejectedWrite(
      "invalid-state-transition",
      "A monetary write must advance exactly one revision."
    );
  }
  const peak = estimateCoinStorageTransitionPeak(
    current.status === "valid" ? current.state : null,
    next
  );
  if (peak.status === "rejected") {
    return rejectedWrite("size-limit-exceeded", peak.message);
  }
  if (
    peak.estimate.readModifySerializePeak.codeUnits > limits.maxTransitionPeakCodeUnits
    || peak.estimate.readModifySerializePeak.utf8Bytes > limits.maxTransitionPeakUtf8Bytes
  ) {
    return rejectedWrite(
      "transition-peak-exceeded",
      "The read-modify-serialize transition exceeds the configured peak budget."
    );
  }
  const measured = measureCoinSerializedJson(next);
  if (measured.status === "rejected") {
    return rejectedWrite("corrupt", measured.failure.message);
  }
  try {
    storage.setItem(key, measured.serialized);
  } catch (error) {
    return rejectedWrite("storage-error", describeError(error), "unknown");
  }
  const verified = readCoinClassState(storage, classroomId, limits);
  if (
    verified.status !== "valid"
    || verified.state.revision !== next.revision
    || verified.state.integrity.checksum !== next.integrity.checksum
  ) {
    return rejectedWrite(
      "verification-failed",
      "The monetary state read after writing does not match the requested state.",
      "unknown"
    );
  }
  return { status: "written", state: verified.state, size: verified.size };
}

function rejectedRead(
  code: CoinPersistenceFailureCode,
  message: string
): CoinPersistenceReadResult {
  return { status: "rejected", failure: persistenceFailure(code, message) };
}

function rejectedWrite(
  code: CoinPersistenceFailureCode,
  message: string,
  storageOutcome: CoinPersistenceFailure["storageOutcome"] = "not-written"
): CoinPersistenceWriteResult {
  return { status: "rejected", failure: persistenceFailure(code, message, storageOutcome) };
}

function persistenceFailure(
  code: CoinPersistenceFailureCode,
  message: string,
  storageOutcome: CoinPersistenceFailure["storageOutcome"] = "not-written"
): CoinPersistenceFailure {
  return { code, message, storageOutcome };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown storage error.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
