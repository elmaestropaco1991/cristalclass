import {
  CURRICULUM_SCHEMA_VERSION,
  type CurriculumStorageBackup,
  type CurriculumStorageEnvelope,
  type CurriculumStorageReviewMetadata,
  type CurriculumStorageTransaction,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { validateCurriculumData } from "./curriculumValidationService";

export const CURRICULUM_STORAGE_SCHEMA_VERSION = 1 as const;
const CURRICULUM_STORAGE_PREFIX = "cristalclass_curriculum_v1";

export interface CurriculumStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CurriculumStorageKeys {
  readonly current: string;
  readonly transaction: string;
  readonly backupPrefix: string;
  readonly review: string;
}

export type CurriculumStoredValueErrorStatus =
  | "corrupt"
  | "incompatible-version"
  | "classroom-conflict";

type CurriculumStoredValueError<Source extends "current" | "transaction" | "backup"> = {
  readonly status: CurriculumStoredValueErrorStatus;
  readonly source: Source;
  readonly message: string;
  readonly foundSchemaVersion?: number;
  readonly foundClassroomId?: string;
};

export type CurriculumCurrentReadResult =
  | { readonly status: "empty"; readonly revision: 0 }
  | { readonly status: "valid"; readonly envelope: CurriculumStorageEnvelope }
  | CurriculumStoredValueError<"current">;

export type CurriculumStorageReadResult =
  | CurriculumCurrentReadResult
  | CurriculumStoredValueError<"transaction">
  | {
      readonly status: "pending-transaction";
      readonly transaction: CurriculumStorageTransaction;
      readonly current: CurriculumCurrentReadResult;
    };

export type CurriculumTransactionReadResult =
  | { readonly status: "none" }
  | { readonly status: "valid"; readonly transaction: CurriculumStorageTransaction }
  | CurriculumStoredValueError<"transaction">;

export type CurriculumBackupReadResult =
  | { readonly status: "missing" }
  | { readonly status: "valid"; readonly backup: CurriculumStorageBackup }
  | CurriculumStoredValueError<"backup">;

export function requireStableCurriculumClassroomId(classroomId: string): string {
  if (!classroomId.trim()) {
    throw new Error("A stable non-empty classroom identifier is required.");
  }
  return classroomId;
}

export function getCurriculumStorageKeys(classroomId: string): CurriculumStorageKeys {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const base = `${CURRICULUM_STORAGE_PREFIX}:${encodeURIComponent(normalized)}`;
  return {
    current: `${base}:current`,
    transaction: `${base}:transaction`,
    backupPrefix: `${base}:backup`,
    review: `${base}:review`,
  };
}

export function getCurriculumBackupStorageKey(
  classroomId: string,
  targetRevision: number,
  transactionId: string
): string {
  if (!Number.isInteger(targetRevision) || targetRevision < 1) {
    throw new Error("A positive target revision is required for a curriculum backup.");
  }
  if (!transactionId.trim()) throw new Error("A transaction identifier is required.");
  const keys = getCurriculumStorageKeys(classroomId);
  return `${keys.backupPrefix}:r${targetRevision}:${encodeURIComponent(transactionId)}`;
}

export function calculateCurriculumContentChecksum(data: VersionedCurriculumData): string {
  const canonical = canonicalizeCurriculumDataForChecksum(data);
  return `curriculum-content-v1:${deterministicFingerprint(stripInformativeDates(canonical))}`;
}

export function createCurriculumTransactionId(
  classroomId: string,
  operationId: string,
  expectedRevision: number,
  contentChecksum: string
): string {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  if (!operationId.trim()) throw new Error("An operation identifier is required.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("A non-negative expected revision is required.");
  }
  return `curriculum-transaction:${deterministicFingerprint({
    classroomId: normalized,
    operationId,
    expectedRevision,
    contentChecksum,
  })}`;
}

export function createCurriculumStorageEnvelope(input: {
  readonly classroomId: string;
  readonly revision: number;
  readonly curriculumData: VersionedCurriculumData;
  readonly writtenAt: string;
  readonly operationId: string;
}): CurriculumStorageEnvelope {
  const classroomId = requireStableCurriculumClassroomId(input.classroomId);
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error("A positive curriculum revision is required.");
  }
  if (!input.operationId.trim()) throw new Error("An operation identifier is required.");
  const writtenAt = requireIsoInstant(input.writtenAt, "writtenAt");

  return {
    schemaVersion: CURRICULUM_STORAGE_SCHEMA_VERSION,
    classroomId,
    revision: input.revision,
    curriculumData: cloneJsonValue(input.curriculumData),
    writtenAt,
    contentChecksum: calculateCurriculumContentChecksum(input.curriculumData),
    lastOperationId: input.operationId,
  };
}

export function readCurriculumState(
  storage: CurriculumStorageAdapter,
  classroomId: string,
  knownActionIds: readonly string[]
): CurriculumStorageReadResult {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const transaction = readCurriculumTransaction(storage, normalized, knownActionIds);
  const current = readCurrentCurriculumState(storage, normalized, knownActionIds);

  if (transaction.status === "valid") {
    return { status: "pending-transaction", transaction: transaction.transaction, current };
  }
  if (transaction.status !== "none") return transaction;
  return current;
}

export function readCurrentCurriculumState(
  storage: CurriculumStorageAdapter,
  classroomId: string,
  knownActionIds: readonly string[]
): CurriculumCurrentReadResult {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const key = getCurriculumStorageKeys(normalized).current;
  const stored = safelyRead(storage, key);
  if (stored.status === "error") {
    return { status: "corrupt", source: "current", message: stored.message };
  }
  if (stored.value === null) return { status: "empty", revision: 0 };

  const parsed = parseJson(stored.value, "current");
  if (parsed.status !== "parsed") return parsed;
  return validateEnvelopeValue(parsed.value, normalized, knownActionIds, "current");
}

export function readCurriculumTransaction(
  storage: CurriculumStorageAdapter,
  classroomId: string,
  knownActionIds: readonly string[]
): CurriculumTransactionReadResult {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const key = getCurriculumStorageKeys(normalized).transaction;
  const stored = safelyRead(storage, key);
  if (stored.status === "error") {
    return { status: "corrupt", source: "transaction", message: stored.message };
  }
  if (stored.value === null) return { status: "none" };

  const parsed = parseJson(stored.value, "transaction");
  if (parsed.status !== "parsed") return parsed;
  return validateTransactionValue(parsed.value, normalized, knownActionIds);
}

export function readCurriculumBackup(
  storage: CurriculumStorageAdapter,
  classroomId: string,
  backupKey: string,
  knownActionIds: readonly string[]
): CurriculumBackupReadResult {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  const expectedPrefix = `${getCurriculumStorageKeys(normalized).backupPrefix}:`;
  if (!backupKey.startsWith(expectedPrefix)) {
    return {
      status: "classroom-conflict",
      source: "backup",
      message: "The backup key does not belong to the requested classroom.",
    };
  }

  const stored = safelyRead(storage, backupKey);
  if (stored.status === "error") {
    return { status: "corrupt", source: "backup", message: stored.message };
  }
  if (stored.value === null) return { status: "missing" };
  const parsed = parseJson(stored.value, "backup");
  if (parsed.status !== "parsed") return parsed;
  return validateBackupValue(parsed.value, normalized, knownActionIds, backupKey);
}

export function getBrowserCurriculumStorage(): CurriculumStorageAdapter | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function serializeCurriculumStorageValue(value: unknown): string {
  return JSON.stringify(value);
}

export function validateCurriculumReviewMetadata(
  value: unknown,
  classroomId: string,
  envelope: CurriculumStorageEnvelope
): value is CurriculumStorageReviewMetadata {
  if (!isRecord(value)) return false;
  return value.schemaVersion === CURRICULUM_STORAGE_SCHEMA_VERSION
    && value.classroomId === classroomId
    && value.revision === envelope.revision
    && value.operationId === envelope.lastOperationId
    && (value.operationKind === "migration" || value.operationKind === "rollback")
    && value.contentChecksum === envelope.contentChecksum
    && isIsoInstant(value.reviewedAt);
}

function validateEnvelopeValue<Source extends "current" | "transaction" | "backup">(
  value: unknown,
  classroomId: string,
  knownActionIds: readonly string[],
  source: Source
): CurriculumStoredValueError<Source> | {
  readonly status: "valid";
  readonly envelope: CurriculumStorageEnvelope;
} {
  if (!isRecord(value)) return corrupt(source, "The curriculum envelope is not an object.");
  if (value.schemaVersion !== CURRICULUM_STORAGE_SCHEMA_VERSION) {
    return incompatible(source, value.schemaVersion);
  }
  if (typeof value.classroomId !== "string" || value.classroomId !== classroomId) {
    return classroomConflict(source, value.classroomId);
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) {
    return corrupt(source, "The curriculum revision is invalid.");
  }
  if (!isIsoInstant(value.writtenAt)) {
    return corrupt(source, "The curriculum writtenAt value is invalid.");
  }
  if (typeof value.contentChecksum !== "string" || !value.contentChecksum) {
    return corrupt(source, "The curriculum checksum is missing.");
  }
  if (typeof value.lastOperationId !== "string" || !value.lastOperationId.trim()) {
    return corrupt(source, "The curriculum operation identifier is missing.");
  }
  if (!isRecord(value.curriculumData)) {
    return corrupt(source, "The curriculum data is invalid.");
  }

  const data = value.curriculumData as unknown as VersionedCurriculumData;
  if (data.schemaVersion !== CURRICULUM_SCHEMA_VERSION) {
    return incompatible(source, data.schemaVersion);
  }
  if (
    !isRecord(data.module)
    || data.module.classroomId !== classroomId
    || !Array.isArray(data.packs)
    || !Array.isArray(data.profiles)
    || !Array.isArray(data.actionLinks)
  ) {
    return corrupt(source, "The curriculum data shape or classroom is invalid.");
  }

  let validation;
  try {
    validation = validateCurriculumData(data, knownActionIds);
  } catch {
    return corrupt(source, "The curriculum data cannot be validated safely.");
  }
  if (!validation.valid) {
    return corrupt(
      source,
      `The curriculum data violates its contract: ${validation.issues.map((issue) => issue.code).join(", ")}.`
    );
  }
  if (calculateCurriculumContentChecksum(data) !== value.contentChecksum) {
    return corrupt(source, "The curriculum checksum does not match its content.");
  }

  return { status: "valid", envelope: value as unknown as CurriculumStorageEnvelope };
}

function validateTransactionValue(
  value: unknown,
  classroomId: string,
  knownActionIds: readonly string[]
): CurriculumTransactionReadResult {
  if (!isRecord(value)) return corrupt("transaction", "The transaction is not an object.");
  if (value.schemaVersion !== CURRICULUM_STORAGE_SCHEMA_VERSION) {
    return incompatible("transaction", value.schemaVersion);
  }
  if (typeof value.classroomId !== "string" || value.classroomId !== classroomId) {
    return classroomConflict("transaction", value.classroomId);
  }
  if (
    typeof value.transactionId !== "string"
    || typeof value.operationId !== "string"
    || (value.operationKind !== "migration" && value.operationKind !== "rollback")
    || !Number.isInteger(value.expectedRevision)
    || (value.expectedRevision as number) < 0
    || value.targetRevision !== (value.expectedRevision as number) + 1
    || !isTransactionStage(value.stage)
    || !isIsoInstant(value.preparedAt)
    || typeof value.backupKey !== "string"
  ) {
    return corrupt("transaction", "The transaction contract is invalid.");
  }

  const target = validateEnvelopeValue(
    value.targetEnvelope,
    classroomId,
    knownActionIds,
    "transaction"
  );
  if (target.status !== "valid") return target;
  if (target.envelope.revision !== value.targetRevision) {
    return corrupt("transaction", "The transaction target revision is inconsistent.");
  }
  const expectedTransactionId = createCurriculumTransactionId(
    classroomId,
    value.operationId,
    value.expectedRevision as number,
    target.envelope.contentChecksum
  );
  const expectedBackupKey = getCurriculumBackupStorageKey(
    classroomId,
    value.targetRevision as number,
    expectedTransactionId
  );
  if (value.transactionId !== expectedTransactionId || value.backupKey !== expectedBackupKey) {
    return corrupt("transaction", "The transaction identity or backup key is invalid.");
  }

  return { status: "valid", transaction: value as unknown as CurriculumStorageTransaction };
}

function validateBackupValue(
  value: unknown,
  classroomId: string,
  knownActionIds: readonly string[],
  backupKey: string
): CurriculumBackupReadResult {
  if (!isRecord(value)) return corrupt("backup", "The backup is not an object.");
  if (value.schemaVersion !== CURRICULUM_STORAGE_SCHEMA_VERSION) {
    return incompatible("backup", value.schemaVersion);
  }
  if (typeof value.classroomId !== "string" || value.classroomId !== classroomId) {
    return classroomConflict("backup", value.classroomId);
  }
  if (
    typeof value.backupId !== "string"
    || typeof value.transactionId !== "string"
    || !Number.isInteger(value.sourceRevision)
    || (value.sourceRevision as number) < 0
    || value.targetRevision !== (value.sourceRevision as number) + 1
    || !isIsoInstant(value.createdAt)
  ) {
    return corrupt("backup", "The backup contract is invalid.");
  }
  if (value.backupId !== `curriculum-backup:${value.transactionId}`) {
    return corrupt("backup", "The backup identifier is invalid.");
  }
  const expectedKey = getCurriculumBackupStorageKey(
    classroomId,
    value.targetRevision as number,
    value.transactionId
  );
  if (expectedKey !== backupKey) {
    return classroomConflict("backup", classroomId);
  }

  if (value.previousEnvelope === null) {
    if (value.sourceRevision !== 0) {
      return corrupt("backup", "A missing previous envelope requires source revision zero.");
    }
  } else {
    const previous = validateEnvelopeValue(
      value.previousEnvelope,
      classroomId,
      knownActionIds,
      "backup"
    );
    if (previous.status !== "valid") return previous;
    if (previous.envelope.revision !== value.sourceRevision) {
      return corrupt("backup", "The backup source revision is inconsistent.");
    }
  }

  return { status: "valid", backup: value as unknown as CurriculumStorageBackup };
}

function safelyRead(
  storage: CurriculumStorageAdapter,
  key: string
): { readonly status: "ok"; readonly value: string | null } | {
  readonly status: "error";
  readonly message: string;
} {
  try {
    return { status: "ok", value: storage.getItem(key) };
  } catch (error) {
    return { status: "error", message: describeError(error) };
  }
}

function parseJson<Source extends "current" | "transaction" | "backup">(
  serialized: string,
  source: Source
): { readonly status: "parsed"; readonly value: unknown } | CurriculumStoredValueError<Source> {
  try {
    return { status: "parsed", value: JSON.parse(serialized) };
  } catch {
    return corrupt(source, "Stored curriculum JSON is corrupt.");
  }
}

function corrupt<Source extends "current" | "transaction" | "backup">(
  source: Source,
  message: string
): CurriculumStoredValueError<Source> {
  return { status: "corrupt", source, message };
}

function incompatible<Source extends "current" | "transaction" | "backup">(
  source: Source,
  found: unknown
): CurriculumStoredValueError<Source> {
  return {
    status: "incompatible-version",
    source,
    message: "The stored curriculum schema version is not supported.",
    ...(typeof found === "number" ? { foundSchemaVersion: found } : {}),
  };
}

function classroomConflict<Source extends "current" | "transaction" | "backup">(
  source: Source,
  found: unknown
): CurriculumStoredValueError<Source> {
  return {
    status: "classroom-conflict",
    source,
    message: "Stored curriculum data belongs to another classroom.",
    ...(typeof found === "string" ? { foundClassroomId: found } : {}),
  };
}

function stripInformativeDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInformativeDates);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "createdAt" && key !== "updatedAt" && key !== "writtenAt")
      .sort()
      .map((key) => [key, stripInformativeDates(value[key])])
  );
}

function canonicalizeCurriculumDataForChecksum(
  data: VersionedCurriculumData
): VersionedCurriculumData {
  return {
    ...data,
    packs: [...data.packs]
      .map((pack) => ({
        ...pack,
        // Subject, criterion and knowledge order can be pedagogically meaningful.
        subjects: pack.subjects.map((subject) => ({
          ...subject,
          basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
            ...knowledge,
            criterionIds: [...knowledge.criterionIds].sort(compareStableText),
          })),
        })),
      }))
      .sort(compareEntitiesById),
    profiles: [...data.profiles]
      .map((profile) => ({
        ...profile,
        ordinaryTracking: {
          ...profile.ordinaryTracking,
          rules: [...profile.ordinaryTracking.rules]
            .map((rule) => ({
              ...rule,
              contraryActionIds: [...rule.contraryActionIds].sort(compareStableText),
            }))
            .sort(compareEntitiesById),
        },
      }))
      .sort(compareEntitiesById),
    actionLinks: [...data.actionLinks]
      .map((link) => ({
        ...link,
        resolvedCriterionIds: [...link.resolvedCriterionIds].sort(compareStableText),
      }))
      .sort(compareEntitiesById),
  };
}

function compareEntitiesById(
  left: { readonly id: string },
  right: { readonly id: string }
): number {
  return compareStableText(left.id, right.id);
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deterministicFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  let forwardHash = 2166136261;
  let reverseHash = 3339675911;
  for (let index = 0; index < serialized.length; index += 1) {
    forwardHash ^= serialized.charCodeAt(index);
    forwardHash = Math.imul(forwardHash, 16777619);
    reverseHash ^= serialized.charCodeAt(serialized.length - index - 1);
    reverseHash = Math.imul(reverseHash, 2246822519);
  }
  return `${(forwardHash >>> 0).toString(36)}${(reverseHash >>> 0).toString(36)}`;
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

function requireIsoInstant(value: string, field: string): string {
  if (!isIsoInstant(value)) throw new Error(`A valid ${field} instant is required.`);
  return new Date(value).toISOString();
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isTransactionStage(value: unknown): boolean {
  return value === "prepared"
    || value === "backup-saved"
    || value === "promoted"
    || value === "reviewed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown storage error.";
}
