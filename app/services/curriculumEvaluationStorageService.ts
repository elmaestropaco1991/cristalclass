import {
  CURRICULUM_EVALUATION_SCHEMA_VERSION,
  type CurriculumEvaluationState,
  type CurriculumEvaluationStorageEnvelope,
} from "../types/curriculumEvaluation";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import { validateCurriculumEvaluationState } from "./curriculumEvaluationService";

const STORAGE_PREFIX = "cristalclass_curriculum_evaluation_v1";
export const CURRICULUM_EVALUATION_MAX_CODE_UNITS = 1_000_000;

export type CurriculumEvaluationStorage = Pick<Storage, "getItem" | "setItem">;

export type CurriculumEvaluationReadResult =
  | { readonly status: "empty" }
  | { readonly status: "valid"; readonly envelope: CurriculumEvaluationStorageEnvelope }
  | { readonly status: "invalid" | "storage-error"; readonly message: string };

export type CurriculumEvaluationWriteResult =
  | { readonly status: "written" | "idempotent"; readonly envelope: CurriculumEvaluationStorageEnvelope }
  | {
      readonly status: "revision-conflict" | "invalid-state" | "size-limit-exceeded" | "storage-error";
      readonly message: string;
    };

export function getCurriculumEvaluationStorageKey(classroomId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(classroomId)}`;
}

export function readCurriculumEvaluationState(
  storage: CurriculumEvaluationStorage,
  classroomId: string
): CurriculumEvaluationReadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(getCurriculumEvaluationStorageKey(classroomId));
  } catch {
    return { status: "storage-error", message: "No se pudo leer la evaluación curricular." };
  }
  if (serialized === null) return { status: "empty" };
  if (serialized.length > CURRICULUM_EVALUATION_MAX_CODE_UNITS) {
    return { status: "invalid", message: "La evaluación curricular supera el límite admitido." };
  }
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isRecord(parsed)) throw new Error("La envoltura no es un objeto.");
    const state = parsed.state as unknown;
    const validation = validateCurriculumEvaluationState(state);
    if (
      parsed.schemaVersion !== CURRICULUM_EVALUATION_SCHEMA_VERSION
      || parsed.classroomId !== classroomId
      || !Number.isSafeInteger(parsed.revision)
      || !isCanonicalInstant(parsed.writtenAt)
      || typeof parsed.checksum !== "string"
      || !validation.valid
      || !isRecord(state)
      || state.classroomId !== classroomId
      || state.revision !== parsed.revision
      || parsed.checksum !== createCurriculumEvaluationChecksum(state as unknown as CurriculumEvaluationState)
    ) {
      throw new Error(validation.issues[0] ?? "La integridad no coincide.");
    }
    return { status: "valid", envelope: parsed as unknown as CurriculumEvaluationStorageEnvelope };
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error
        ? `La evaluación curricular guardada no es válida: ${error.message}`
        : "La evaluación curricular guardada no es válida.",
    };
  }
}

export function persistCurriculumEvaluationState(
  storage: CurriculumEvaluationStorage,
  state: CurriculumEvaluationState,
  expectedRevision: number,
  writtenAt: string
): CurriculumEvaluationWriteResult {
  const validation = validateCurriculumEvaluationState(state);
  if (!validation.valid || !isCanonicalInstant(writtenAt)) {
    return {
      status: "invalid-state",
      message: validation.issues[0] ?? "La fecha de escritura no es válida.",
    };
  }
  const current = readCurriculumEvaluationState(storage, state.classroomId);
  if (current.status === "invalid" || current.status === "storage-error") {
    return { status: "storage-error", message: current.message };
  }
  const currentRevision = current.status === "valid" ? current.envelope.revision : 0;
  const currentChecksum = current.status === "valid" ? current.envelope.checksum : null;
  const checksum = createCurriculumEvaluationChecksum(state);
  if (
    current.status === "valid"
    && currentRevision === state.revision
    && currentChecksum === checksum
  ) {
    return { status: "idempotent", envelope: current.envelope };
  }
  if (currentRevision !== expectedRevision || state.revision !== expectedRevision + 1) {
    return {
      status: "revision-conflict",
      message: "La evaluación curricular cambió en otra operación.",
    };
  }

  const envelope: CurriculumEvaluationStorageEnvelope = {
    schemaVersion: CURRICULUM_EVALUATION_SCHEMA_VERSION,
    classroomId: state.classroomId,
    revision: state.revision,
    state,
    writtenAt,
    checksum,
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > CURRICULUM_EVALUATION_MAX_CODE_UNITS) {
    return {
      status: "size-limit-exceeded",
      message: "La evaluación curricular supera el límite de almacenamiento.",
    };
  }
  try {
    storage.setItem(getCurriculumEvaluationStorageKey(state.classroomId), serialized);
  } catch {
    return { status: "storage-error", message: "No se pudo guardar la evaluación curricular." };
  }
  const verified = readCurriculumEvaluationState(storage, state.classroomId);
  if (
    verified.status !== "valid"
    || verified.envelope.revision !== envelope.revision
    || verified.envelope.checksum !== envelope.checksum
  ) {
    return { status: "storage-error", message: "No se pudo verificar la evaluación guardada." };
  }
  return { status: "written", envelope: verified.envelope };
}

export function createCurriculumEvaluationChecksum(state: CurriculumEvaluationState): string {
  return `curriculum-evaluation-v1:${createCurriculumDeterministicFingerprint(state)}`;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
