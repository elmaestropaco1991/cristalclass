import type {
  CurriculumAssistantState,
  CurriculumAssistantStorageEnvelope,
} from "../types/curriculumAssistant";
import { CURRICULUM_ASSISTANT_SCHEMA_VERSION } from "../types/curriculumAssistant";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import type { CurriculumExclusiveLock } from "./curriculumExclusiveLockService";
import {
  parseCurriculumPackJson,
  scanCurriculumJsonText,
  validateCurriculumPackForJson,
} from "./curriculumPackJsonService";
import { validateCurriculumData } from "./curriculumValidationService";
import { getCurriculumStorageKeys, requireStableCurriculumClassroomId } from "./curriculumStorageService";

const CURRICULUM_ASSISTANT_STORAGE_PREFIX = "cristalclass_curriculum_assistant_v1";
export const CURRICULUM_ASSISTANT_CHECKSUM_PREFIX = "curriculum-assistant-v1:" as const;

/** The assistant and the pre-existing curriculum envelope share this origin budget. */
export const CURRICULUM_ASSISTANT_STORAGE_BUDGET = Object.freeze({
  maxAssistantCodeUnits: 750_000,
  maxCombinedCurriculumCodeUnits: 1_250_000,
  maxDepth: 24,
  maxActionLinks: 20_000,
  maxPendingBasicKnowledge: 1_000,
  maxRetiredIdsPerCollection: 10_000,
} as const);

export const CURRICULUM_ASSISTANT_STORAGE_SEMANTICS = Object.freeze({
  oneVersionedKeyPerClass: true,
  localStorageValueWriteIsSingleKey: true,
  multiKeyTransactionIsAtomic: false,
  optimisticRevisionCheck: true,
  cooperativeWebLockWhenAvailable: true,
  readsWriteNothing: true,
  automaticMigration: false,
  automaticRepair: false,
  automaticDeletion: false,
} as const);

export interface CurriculumAssistantStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type CurriculumAssistantReadResult =
  | { readonly status: "empty" }
  | { readonly status: "valid"; readonly envelope: CurriculumAssistantStorageEnvelope }
  | {
      readonly status:
        | "corrupt"
        | "legacy-review-required"
        | "incompatible-version"
        | "classroom-conflict"
        | "storage-error";
      readonly message: string;
    };

export type CurriculumAssistantWriteResult =
  | { readonly status: "written" | "idempotent"; readonly envelope: CurriculumAssistantStorageEnvelope }
  | {
      readonly status:
        | "revision-conflict"
        | "invalid-state"
        | "size-limit-exceeded"
        | "corrupt-existing"
        | "write-outcome-unknown"
        | "lock-unavailable"
        | "storage-error";
      readonly message: string;
    };

export function getCurriculumAssistantStorageKey(classroomId: string): string {
  return `${CURRICULUM_ASSISTANT_STORAGE_PREFIX}:${encodeURIComponent(
    requireStableCurriculumClassroomId(classroomId)
  )}`;
}

export function calculateCurriculumAssistantChecksum(
  state: CurriculumAssistantState
): `${typeof CURRICULUM_ASSISTANT_CHECKSUM_PREFIX}${string}` {
  return `${CURRICULUM_ASSISTANT_CHECKSUM_PREFIX}${createCurriculumDeterministicFingerprint(state)}`;
}

export function readCurriculumAssistantState(
  storage: CurriculumAssistantStorageAdapter,
  classroomId: string
): CurriculumAssistantReadResult {
  const normalizedClassroomId = requireStableCurriculumClassroomId(classroomId);
  const key = getCurriculumAssistantStorageKey(normalizedClassroomId);
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return { status: "storage-error", message: "No se pudo leer el borrador curricular." };
  }
  if (serialized === null) return { status: "empty" };
  if (serialized.length > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxAssistantCodeUnits) {
    return { status: "corrupt", message: "El borrador supera el tamaño seguro permitido." };
  }
  const scan = scanCurriculumJsonText(
    serialized,
    CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxDepth
  );
  if (scan.depthExceeded || scan.duplicateKeyIssues.length > 0 || scan.unsafeKeyIssues.length > 0) {
    return { status: "corrupt", message: "El borrador tiene una estructura que no es segura." };
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { status: "corrupt", message: "El borrador curricular no contiene JSON válido." };
  }
  if (!isRecord(value)) {
    return { status: "corrupt", message: "El borrador curricular no tiene el formato esperado." };
  }
  if (value.schemaVersion === 0) {
    return {
      status: "legacy-review-required",
      message: "Este borrador antiguo necesita revisión y no se ha modificado.",
    };
  }
  if (value.schemaVersion !== CURRICULUM_ASSISTANT_SCHEMA_VERSION) {
    return {
      status: "incompatible-version",
      message: "La versión del borrador curricular no es compatible.",
    };
  }
  if (!hasExactKeys(
    value,
    ["schemaVersion", "classroomId", "revision", "state", "writtenAt", "checksum"]
  )) {
    return { status: "corrupt", message: "El contenedor del borrador tiene campos inesperados." };
  }
  if (value.classroomId !== normalizedClassroomId) {
    return {
      status: "classroom-conflict",
      message: "El borrador pertenece a otra clase.",
    };
  }
  if (!isRecord(value.state)) {
    return { status: "corrupt", message: "El estado del borrador no está disponible." };
  }
  const state = value.state as unknown as CurriculumAssistantState;
  const validationMessage = validateAssistantStateShape(state, normalizedClassroomId);
  if (validationMessage) return { status: "corrupt", message: validationMessage };
  if (
    value.revision !== state.revision
    || typeof value.writtenAt !== "string"
    || !Number.isFinite(Date.parse(value.writtenAt))
    || value.checksum !== calculateCurriculumAssistantChecksum(state)
  ) {
    return { status: "corrupt", message: "La integridad del borrador curricular no coincide." };
  }
  return {
    status: "valid",
    envelope: deepFreeze({
      schemaVersion: CURRICULUM_ASSISTANT_SCHEMA_VERSION,
      classroomId: normalizedClassroomId,
      revision: state.revision,
      state: cloneJson(state),
      writtenAt: value.writtenAt,
      checksum: value.checksum,
    } as CurriculumAssistantStorageEnvelope),
  };
}

export function writeCurriculumAssistantState(
  storage: CurriculumAssistantStorageAdapter,
  state: CurriculumAssistantState,
  expectedRevision: number,
  writtenAt: string
): CurriculumAssistantWriteResult {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { status: "invalid-state", message: "La revisión esperada no es válida." };
  }
  if (!Number.isFinite(Date.parse(writtenAt))) {
    return { status: "invalid-state", message: "La fecha de guardado no es válida." };
  }
  const normalizedClassroomId = requireStableCurriculumClassroomId(state.classroomId);
  const validationMessage = validateAssistantStateShape(state, normalizedClassroomId);
  if (validationMessage) return { status: "invalid-state", message: validationMessage };
  const current = readCurriculumAssistantState(storage, normalizedClassroomId);
  if (current.status !== "empty" && current.status !== "valid") {
    return {
      status: current.status === "storage-error" ? "storage-error" : "corrupt-existing",
      message: "El estado existente necesita revisión y no se ha sobrescrito.",
    };
  }
  if (current.status === "valid") {
    const nextChecksum = calculateCurriculumAssistantChecksum(state);
    if (
      current.envelope.revision === state.revision
      && current.envelope.checksum === nextChecksum
      && JSON.stringify(current.envelope.state) === JSON.stringify(state)
    ) {
      return { status: "idempotent", envelope: current.envelope };
    }
  }
  const actualRevision = current.status === "valid" ? current.envelope.revision : 0;
  if (actualRevision !== expectedRevision || state.revision !== expectedRevision + 1) {
    return {
      status: "revision-conflict",
      message: "El borrador cambió en otra pestaña. Vuelve a abrirlo antes de guardar.",
    };
  }
  const envelope: CurriculumAssistantStorageEnvelope = {
    schemaVersion: CURRICULUM_ASSISTANT_SCHEMA_VERSION,
    classroomId: normalizedClassroomId,
    revision: state.revision,
    state: cloneJson(state),
    writtenAt: new Date(writtenAt).toISOString(),
    checksum: calculateCurriculumAssistantChecksum(state),
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxAssistantCodeUnits) {
    return {
      status: "size-limit-exceeded",
      message: "El borrador es demasiado grande para guardarlo de forma segura.",
    };
  }
  let existingCurriculumSize = 0;
  try {
    existingCurriculumSize = storage.getItem(
      getCurriculumStorageKeys(normalizedClassroomId).current
    )?.length ?? 0;
  } catch {
    return { status: "storage-error", message: "No se pudo comprobar el espacio curricular." };
  }
  if (
    serialized.length + existingCurriculumSize
    > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxCombinedCurriculumCodeUnits
  ) {
    return {
      status: "size-limit-exceeded",
      message: "El currículo y su borrador superan juntos el presupuesto seguro de esta clase.",
    };
  }
  const assistantKey = getCurriculumAssistantStorageKey(normalizedClassroomId);
  try {
    storage.setItem(assistantKey, serialized);
  } catch {
    const observed = readCurriculumAssistantState(storage, normalizedClassroomId);
    const observedMatch = getMatchingAssistantEnvelope(observed, envelope);
    if (observedMatch) {
      return { status: "written", envelope: observedMatch };
    }
    if (observed.status === "empty" || (
      observed.status === "valid"
      && observed.envelope.revision === actualRevision
    )) {
      return { status: "storage-error", message: "No se escribió el borrador curricular." };
    }
    return {
      status: "write-outcome-unknown",
      message: "No se pudo confirmar si el último guardado terminó. Recarga antes de reintentarlo.",
    };
  }
  const verification = readCurriculumAssistantState(storage, normalizedClassroomId);
  const verifiedEnvelope = getMatchingAssistantEnvelope(verification, envelope);
  if (!verifiedEnvelope) {
    return {
      status: "write-outcome-unknown",
      message: "El guardado ocurrió, pero no se pudo verificar su resultado. Recarga antes de continuar.",
    };
  }
  return { status: "written", envelope: verifiedEnvelope };
}

export async function persistCurriculumAssistantState(
  storage: CurriculumAssistantStorageAdapter,
  lock: CurriculumExclusiveLock | null,
  state: CurriculumAssistantState,
  expectedRevision: number,
  writtenAt: string
): Promise<CurriculumAssistantWriteResult> {
  if (!lock) return writeCurriculumAssistantState(storage, state, expectedRevision, writtenAt);
  try {
    const locked = await lock.runExclusive(state.classroomId, () =>
      writeCurriculumAssistantState(storage, state, expectedRevision, writtenAt)
    );
    return locked.status === "acquired"
      ? locked.value
      : { status: "lock-unavailable", message: "No se pudo reservar el borrador para guardar." };
  } catch {
    return { status: "lock-unavailable", message: "No se pudo reservar el borrador para guardar." };
  }
}

export function getBrowserCurriculumAssistantStorage(): CurriculumAssistantStorageAdapter | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validateAssistantStateShape(
  state: CurriculumAssistantState,
  classroomId: string
): string | null {
  if (
    !isRecord(state)
    || state.schemaVersion !== CURRICULUM_ASSISTANT_SCHEMA_VERSION
    || state.classroomId !== classroomId
    || !Number.isSafeInteger(state.revision)
    || state.revision < 1
    || typeof state.trackingEnabled !== "boolean"
    || (state.wizardStep !== 1 && state.wizardStep !== 2 && state.wizardStep !== 3)
    || !isRecord(state.catalog)
    || !Array.isArray(state.actionLinks)
    || !Array.isArray(state.archivedSubjectIds)
    || !Array.isArray(state.retiredSpecificCompetenceIds)
    || !Array.isArray(state.retiredCriterionIds)
    || !Array.isArray(state.retiredBasicKnowledgeIds)
    || !Array.isArray(state.pendingBasicKnowledge)
    || !Array.isArray(state.knowledgeCriteriaOverrides)
    || typeof state.createdAt !== "string"
    || typeof state.updatedAt !== "string"
    || !Number.isFinite(Date.parse(state.createdAt))
    || !Number.isFinite(Date.parse(state.updatedAt))
  ) return "El contrato del borrador curricular no es válido.";
  if (!hasExactKeys(state as unknown as Record<string, unknown>, [
    "schemaVersion",
    "classroomId",
    "revision",
    "trackingEnabled",
    "wizardStep",
    "catalog",
    "profile",
    "actionLinks",
    "archivedSubjectIds",
    "retiredSpecificCompetenceIds",
    "retiredCriterionIds",
    "retiredBasicKnowledgeIds",
    "pendingBasicKnowledge",
    "knowledgeCriteriaOverrides",
    "legacyImport",
    "createdAt",
    "updatedAt",
  ])) return "El borrador curricular contiene campos inesperados.";
  if (
    state.actionLinks.length > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxActionLinks
    || state.archivedSubjectIds.length > 100
    || state.pendingBasicKnowledge.length
      > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxPendingBasicKnowledge
    || state.retiredSpecificCompetenceIds.length
      > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxRetiredIdsPerCollection
    || state.retiredCriterionIds.length
      > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxRetiredIdsPerCollection
    || state.retiredBasicKnowledgeIds.length
      > CURRICULUM_ASSISTANT_STORAGE_BUDGET.maxRetiredIdsPerCollection
  ) return "El borrador supera sus límites de entidades o relaciones.";
  const stringCollections = [
    state.archivedSubjectIds,
    state.retiredSpecificCompetenceIds,
    state.retiredCriterionIds,
    state.retiredBasicKnowledgeIds,
  ];
  if (stringCollections.some((collection) =>
    collection.some((id) => typeof id !== "string" || !id.trim())
    || new Set(collection).size !== collection.length
  )) return "El borrador contiene referencias retiradas duplicadas o inválidas.";
  if (
    state.catalog.schemaVersion !== 2
    || !Number.isSafeInteger(state.catalog.revision)
    || !Array.isArray(state.catalog.appliedOperations)
    || state.catalog.appliedOperations.length !== state.catalog.revision
    || ((state.catalog.revision === 0) !== (state.catalog.pack === null))
  ) return "El estado del editor curricular no es coherente.";
  if (!hasExactKeys(state.catalog as unknown as Record<string, unknown>, [
    "schemaVersion", "revision", "pack", "appliedOperations",
  ])) return "El editor curricular contiene campos inesperados.";
  const operationIds = new Set<string>();
  for (const operation of state.catalog.appliedOperations) {
    if (
      !isRecord(operation)
      || !hasExactKeys(operation, [
        "operationId", "commandFingerprint", "resultingVersion",
      ])
      || typeof operation.operationId !== "string"
      || !operation.operationId.trim()
      || operationIds.has(operation.operationId)
      || typeof operation.commandFingerprint !== "string"
      || !operation.commandFingerprint
      || typeof operation.resultingVersion !== "number"
      || !Number.isSafeInteger(operation.resultingVersion)
      || operation.resultingVersion < 1
      || operation.resultingVersion > state.catalog.revision
    ) return "El diario compacto del editor curricular no es válido.";
    operationIds.add(operation.operationId);
  }
  const subjectIds = new Set<string>();
  const competenceIds = new Set<string>();
  const criterionIds = new Set<string>();
  const basicKnowledgeIds = new Set<string>();
  const catalogEntityIds = new Set<string>();
  const pendingDraftIds = new Set(state.pendingBasicKnowledge.map((pending) => pending.id));
  if (state.catalog.pack) {
    const validation = validateCurriculumPackForJson(state.catalog.pack);
    if (!validation.valid) return "El catálogo base del borrador no supera la validación v2.";
    catalogEntityIds.add(state.catalog.pack.id);
    state.catalog.pack.subjects.forEach((subject) => {
      subjectIds.add(subject.id);
      catalogEntityIds.add(subject.id);
      subject.specificCompetences?.forEach((competence) => {
        competenceIds.add(competence.id);
        catalogEntityIds.add(competence.id);
      });
      subject.criteria.forEach((criterion) => {
        criterionIds.add(criterion.id);
        catalogEntityIds.add(criterion.id);
      });
      subject.basicKnowledge.forEach((knowledge) => {
        basicKnowledgeIds.add(knowledge.id);
        catalogEntityIds.add(knowledge.id);
      });
    });
    if (
      state.archivedSubjectIds.some((id) => !subjectIds.has(id))
      || state.retiredSpecificCompetenceIds.some((id) => !competenceIds.has(id))
      || state.retiredCriterionIds.some((id) => !criterionIds.has(id))
      || state.retiredBasicKnowledgeIds.some((id) =>
        !basicKnowledgeIds.has(id) && !pendingDraftIds.has(id)
      )
    ) return "El borrador contiene referencias retiradas que ya no pertenecen al catálogo.";
    if (!state.profile || state.profile.packId !== state.catalog.pack.id) {
      return "El perfil curricular no coincide con su catálogo.";
    }
  } else if (state.profile !== null) {
    return "Existe un perfil curricular sin catálogo.";
  }
  if (state.profile && state.profile.classroomId !== classroomId) {
    return "El perfil curricular pertenece a otra clase.";
  }
  if (state.profile) {
    if (
      !hasExactKeys(state.profile as unknown as Record<string, unknown>, [
        "id", "schemaVersion", "classroomId", "packId", "provenance", "status",
        "selectedSubjectIds", "ordinaryTracking", "createdAt", "updatedAt",
      ])
      || state.profile.schemaVersion !== 2
      || typeof state.profile.id !== "string"
      || !state.profile.id.trim()
      || (state.profile.status !== "configured" && state.profile.status !== "active")
      || !isValidProvenance(state.profile.provenance)
      || !isRecord(state.profile.ordinaryTracking)
      || !hasExactKeys(state.profile.ordinaryTracking, [
        "enabled", "minimumSessionDurationMinutes", "rules",
      ])
      || typeof state.profile.ordinaryTracking.enabled !== "boolean"
      || !Number.isFinite(state.profile.ordinaryTracking.minimumSessionDurationMinutes)
      || state.profile.ordinaryTracking.minimumSessionDurationMinutes < 0
      || !Array.isArray(state.profile.ordinaryTracking.rules)
      || state.profile.ordinaryTracking.rules.length > 0
      || !Array.isArray(state.profile.selectedSubjectIds)
      || state.profile.selectedSubjectIds.some((id) => typeof id !== "string" || !id.trim())
      || new Set(state.profile.selectedSubjectIds).size !== state.profile.selectedSubjectIds.length
      || typeof state.profile.createdAt !== "string"
      || typeof state.profile.updatedAt !== "string"
      || !Number.isFinite(Date.parse(state.profile.createdAt))
      || !Number.isFinite(Date.parse(state.profile.updatedAt))
    ) return "El perfil curricular no tiene una estructura válida.";
    if (
      state.profile.selectedSubjectIds.some((id) => state.archivedSubjectIds.includes(id))
      || (state.trackingEnabled
        && (state.profile.status !== "active" || state.profile.selectedSubjectIds.length === 0))
      || (!state.trackingEnabled && state.profile.status !== "configured")
    ) return "La activación curricular no coincide con la preparación guardada.";
  }
  const pendingIds = new Set<string>();
  for (const pending of state.pendingBasicKnowledge) {
    if (
      !isRecord(pending)
      || !hasOnlyKeys(pending, ["id", "subjectId", "externalCode", "text"], ["id", "subjectId", "text"])
      || typeof pending.id !== "string"
      || !pending.id.trim()
      || pendingIds.has(pending.id)
      || catalogEntityIds.has(pending.id)
      || typeof pending.subjectId !== "string"
      || !pending.subjectId.trim()
      || !subjectIds.has(pending.subjectId)
      || typeof pending.text !== "string"
      || !pending.text.trim()
      || pending.text.length > 12_000
      || (pending.externalCode !== undefined
        && (typeof pending.externalCode !== "string" || pending.externalCode.length > 120))
    ) return "El borrador contiene saberes pendientes inválidos.";
    pendingIds.add(pending.id);
  }
  const overriddenKnowledgeIds = new Set<string>();
  for (const override of state.knowledgeCriteriaOverrides) {
    if (
      !isRecord(override)
      || !hasExactKeys(override, ["basicKnowledgeId", "criterionIds"])
      || typeof override.basicKnowledgeId !== "string"
      || !override.basicKnowledgeId.trim()
      || overriddenKnowledgeIds.has(override.basicKnowledgeId)
      || !basicKnowledgeIds.has(override.basicKnowledgeId)
      || !Array.isArray(override.criterionIds)
      || override.criterionIds.length !== 0
      || override.criterionIds.some((id) => typeof id !== "string" || !id.trim())
      || new Set(override.criterionIds).size !== override.criterionIds.length
    ) return "El borrador contiene relaciones de saberes inválidas.";
    overriddenKnowledgeIds.add(override.basicKnowledgeId);
  }
  if (state.legacyImport) {
    if (
      !isRecord(state.legacyImport)
      || !hasExactKeys(state.legacyImport, [
        "serializedJson", "subjectCount", "criterionCount", "basicKnowledgeCount", "importedAt",
      ])
      || state.catalog.pack !== null
      || typeof state.legacyImport.serializedJson !== "string"
      || !Number.isSafeInteger(state.legacyImport.subjectCount)
      || !Number.isSafeInteger(state.legacyImport.criterionCount)
      || !Number.isSafeInteger(state.legacyImport.basicKnowledgeCount)
      || !Number.isFinite(Date.parse(state.legacyImport.importedAt))
    ) {
      return "El borrador legacy no está aislado correctamente.";
    }
    const parsed = parseCurriculumPackJson(state.legacyImport.serializedJson);
    if (parsed.status !== "legacy-incomplete") {
      return "El archivo legacy conservado ya no supera su comprobación de integridad.";
    }
  }
  const linkIds = new Set<string>();
  const relationKeys = new Set<string>();
  for (const link of state.actionLinks) {
    const relationKey = `${link.profileId}\u0000${link.subjectId}\u0000${link.basicKnowledgeId}\u0000${link.actionId}`;
    if (
      !isRecord(link)
      || !hasExactKeys(link, [
        "id", "schemaVersion", "actionId", "profileId", "subjectId",
        "basicKnowledgeId", "resolvedCriterionIds", "effect", "recordingMode",
        "enabled", "createdAt", "updatedAt",
      ])
      || typeof link.id !== "string"
      || !link.id.trim()
      || linkIds.has(link.id)
      || link.schemaVersion !== 2
      || typeof link.actionId !== "string"
      || !link.actionId.trim()
      || typeof link.profileId !== "string"
      || !link.profileId.trim()
      || link.profileId !== state.profile?.id
      || typeof link.subjectId !== "string"
      || !link.subjectId.trim()
      || typeof link.basicKnowledgeId !== "string"
      || !link.basicKnowledgeId.trim()
      || !Array.isArray(link.resolvedCriterionIds)
      || link.resolvedCriterionIds.length === 0
      || link.resolvedCriterionIds.some((id) => typeof id !== "string" || !id.trim())
      || new Set(link.resolvedCriterionIds).size !== link.resolvedCriterionIds.length
      || (link.effect !== "positive" && link.effect !== "contrary")
      || link.recordingMode !== "manual"
      || typeof link.enabled !== "boolean"
      || typeof link.createdAt !== "string"
      || typeof link.updatedAt !== "string"
      || !Number.isFinite(Date.parse(link.createdAt))
      || !Number.isFinite(Date.parse(link.updatedAt))
      || relationKeys.has(relationKey)
    ) return "El borrador contiene relaciones con acciones inválidas.";
    linkIds.add(link.id);
    relationKeys.add(relationKey);
  }
  if (state.catalog.pack && state.profile) {
    const aggregateValidation = validateCurriculumData({
      schemaVersion: 2,
      module: {
        schemaVersion: 2,
        classroomId,
        status: state.trackingEnabled && state.profile.selectedSubjectIds.length > 0
          ? "active"
          : "configured",
        activeProfileId: state.trackingEnabled && state.profile.selectedSubjectIds.length > 0
          ? state.profile.id
          : null,
      },
      packs: [state.catalog.pack],
      profiles: [state.profile],
      actionLinks: state.actionLinks,
    }, state.actionLinks.map((link) => link.actionId));
    if (!aggregateValidation.valid) {
      return "El borrador contiene referencias curriculares rotas o cruzadas.";
    }
  }
  return null;
}

function getMatchingAssistantEnvelope(
  result: CurriculumAssistantReadResult,
  expected: CurriculumAssistantStorageEnvelope
): CurriculumAssistantStorageEnvelope | null {
  return (result.status === "valid"
    && result.envelope.revision === expected.revision
    && result.envelope.checksum === expected.checksum
    && JSON.stringify(result.envelope.state) === JSON.stringify(expected.state))
    ? result.envelope
    : null;
}

function isValidProvenance(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(
    value,
    ["kind", "sourceId", "sourceVersion", "label"],
    ["kind"]
  )) return false;
  if (!["manual", "imported", "external", "shared", "legacy-provisional"].includes(
    String(value.kind)
  )) return false;
  return [value.sourceId, value.sourceVersion, value.label].every(
    (item) => item === undefined || (typeof item === "string" && Boolean(item.trim()))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasOnlyKeys(value, keys, keys);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return actual.every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
