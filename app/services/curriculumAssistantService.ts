import type { Action } from "../types/action";
import { SUBJECT_IDS } from "../types/subject";
import {
  CURRICULUM_ASSISTANT_SCHEMA_VERSION,
  type CurriculumAssistantLegacyImport,
  type CurriculumAssistantState,
  type CurriculumAssistantStep,
  type CurriculumSubjectPreparationInspection,
  type PendingBasicKnowledgeDraft,
} from "../types/curriculumAssistant";
import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumCatalogCommand,
  type CurriculumPack,
  type CurriculumProfile,
  type CurriculumSubject,
  type VersionedCurriculumData,
} from "../types/curriculum";
import {
  applyCatalogCommand,
  createEmptyCurriculumCatalogEditorState,
} from "./curriculumCatalogEditorService";
import {
  createCurriculumDeterministicFingerprint,
} from "./curriculumFingerprintService";
import {
  applyCurriculumPackImport,
  createEmptyCurriculumPackImportState,
  previewCurriculumPackImport,
  type CurriculumPackImportIdMap,
  type CurriculumPackImportPreview,
} from "./curriculumPackImportService";
import type {
  CurriculumPackJsonLegacyResult,
  CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import { validateCurriculumData } from "./curriculumValidationService";

export const CURRICULUM_ASSISTANT_LIMITS = Object.freeze({
  maxArchivedSubjects: 100,
  maxPendingBasicKnowledge: 1_000,
  maxRetiredEntitiesPerCollection: 10_000,
  maxActionLinks: 20_000,
  maxActionsPerBasicKnowledge: 100,
  maxNameLength: 300,
  maxCodeLength: 120,
  maxTextLength: 12_000,
} as const);

export type CurriculumActionCatalogContext = readonly Action[] | readonly string[];

export type CurriculumAssistantChangeResult =
  | { readonly status: "applied"; readonly state: CurriculumAssistantState }
  | {
      readonly status: "blocked";
      readonly messages: readonly string[];
      readonly dependencies?: readonly string[];
    }
  | {
      readonly status: "requires-deactivation";
      readonly subjectId: string;
      readonly messages: readonly string[];
    };

export type CurriculumAssistantActivationResult =
  | {
      readonly status: "activated" | "deactivated";
      readonly state: CurriculumAssistantState;
      readonly inspection: CurriculumSubjectPreparationInspection;
    }
  | {
      readonly status: "blocked" | "confirmation-required";
      readonly inspection: CurriculumSubjectPreparationInspection;
    };

export function createManualCurriculumAssistantState(
  classroomId: string,
  occurredAt: string
): CurriculumAssistantState {
  requireClassroomId(classroomId);
  requireInstant(occurredAt);
  const catalog = createEmptyCurriculumCatalogEditorState();
  const packId = stableId("pack", classroomId);
  const operationId = stableId("start-manual", classroomId);
  const created = applyCatalogCommand(catalog, {
    type: "create-manual-pack",
    operationId,
    expectedVersion: 0,
    occurredAt,
    packId,
    name: "Currículo de la clase",
  });
  if (created.status !== "applied") {
    throw new Error("No se pudo preparar el borrador curricular manual.");
  }
  const profile = createProfile(classroomId, created.pack, occurredAt);
  return freezeState({
    schemaVersion: CURRICULUM_ASSISTANT_SCHEMA_VERSION,
    classroomId,
    revision: 1,
    trackingEnabled: false,
    wizardStep: 2,
    catalog: created.state,
    profile,
    actionLinks: [],
    archivedSubjectIds: [],
    retiredSpecificCompetenceIds: [],
    retiredCriterionIds: [],
    retiredBasicKnowledgeIds: [],
    pendingBasicKnowledge: [],
    knowledgeCriteriaOverrides: [],
    legacyImport: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

export function createLegacyCurriculumAssistantState(
  classroomId: string,
  parsed: CurriculumPackJsonLegacyResult,
  serializedJson: string,
  occurredAt: string
): CurriculumAssistantState {
  requireClassroomId(classroomId);
  requireInstant(occurredAt);
  const legacyImport: CurriculumAssistantLegacyImport = {
    serializedJson,
    subjectCount: parsed.pack.subjects.length,
    criterionCount: parsed.pack.subjects.reduce(
      (total, subject) => total + subject.criteria.length,
      0
    ),
    basicKnowledgeCount: parsed.pack.subjects.reduce(
      (total, subject) => total + subject.basicKnowledge.length,
      0
    ),
    importedAt: occurredAt,
  };
  return freezeState({
    schemaVersion: CURRICULUM_ASSISTANT_SCHEMA_VERSION,
    classroomId,
    revision: 1,
    trackingEnabled: false,
    wizardStep: 2,
    catalog: createEmptyCurriculumCatalogEditorState(),
    profile: null,
    actionLinks: [],
    archivedSubjectIds: [],
    retiredSpecificCompetenceIds: [],
    retiredCriterionIds: [],
    retiredBasicKnowledgeIds: [],
    pendingBasicKnowledge: [],
    knowledgeCriteriaOverrides: [],
    legacyImport,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

/** Uses the audited import service even for a new class, with an exact injective map. */
export function previewCurriculumAssistantImport(
  classroomId: string,
  parsed: CurriculumPackJsonValidResult
): CurriculumPackImportPreview {
  const empty = createEmptyCurriculumPackImportState();
  const operationId = stableId("import", classroomId, parsed.contentChecksum);
  return previewCurriculumPackImport(
    parsed,
    empty,
    {
      operationId,
      expectedRevision: 0,
      expectedPackageVersion: parsed.pack.packageVersion,
    },
    {
      resolution: {
        kind: "import-as-new",
        idMap: createCurriculumAssistantImportIdMap(
          parsed.pack,
          classroomId,
          parsed.contentChecksum
        ),
      },
    }
  );
}

export function confirmCurriculumAssistantImport(
  classroomId: string,
  preview: CurriculumPackImportPreview,
  occurredAt: string
): CurriculumAssistantState {
  requireInstant(occurredAt);
  const applied = applyCurriculumPackImport(
    createEmptyCurriculumPackImportState(),
    preview,
    {
      operationId: preview.operationId,
      expectedRevision: preview.expectedRevision,
      fingerprint: preview.operationFingerprint,
    }
  );
  if (applied.status !== "applied" || !applied.pack) {
    throw new Error("La importación ya no coincide con la vista previa.");
  }
  const originalSubjectIdByImportedId: Record<string, string> = Object.create(null) as Record<string, string>;
  if (preview.resolution?.kind === "import-as-new") {
    Object.entries(preview.resolution.idMap.subjectIds).forEach(([originalId, importedId]) => {
      originalSubjectIdByImportedId[importedId] = originalId;
    });
  }
  return createEditableStateFromImportedPack(
    classroomId,
    applied.pack,
    originalSubjectIdByImportedId,
    occurredAt
  );
}

export function classifyCurriculumAssistantImportRepeat(
  current: CurriculumAssistantState,
  candidate: CurriculumAssistantState
): "idempotent" | "divergent" {
  if (current.classroomId !== candidate.classroomId) return "divergent";
  if (current.legacyImport || candidate.legacyImport) {
    return current.legacyImport?.serializedJson === candidate.legacyImport?.serializedJson
      ? "idempotent"
      : "divergent";
  }
  const currentFingerprint = current.catalog.appliedOperations.find(
    (operation) => operation.commandFingerprint.startsWith("assistant-import-source-v1:")
  )?.commandFingerprint;
  const candidateFingerprint = candidate.catalog.appliedOperations.find(
    (operation) => operation.commandFingerprint.startsWith("assistant-import-source-v1:")
  )?.commandFingerprint;
  return currentFingerprint && currentFingerprint === candidateFingerprint
    ? "idempotent"
    : "divergent";
}

export function createCurriculumAssistantImportIdMap(
  pack: CurriculumPack,
  classroomId: string,
  checksum: string
): CurriculumPackImportIdMap {
  if (!checksum) throw new Error("La importación no tiene una huella de contenido válida.");
  const sourceIds = [
    pack.id,
    ...pack.subjects.flatMap((subject) => [
      subject.id,
      ...(subject.specificCompetences?.map((competence) => competence.id) ?? []),
      ...subject.criteria.map((criterion) => criterion.id),
      ...subject.basicKnowledge.map((knowledge) => knowledge.id),
    ]),
  ];
  const reservedSourceIds = new Set(sourceIds);
  if (reservedSourceIds.size !== sourceIds.length) {
    throw new Error("La importación contiene identidades duplicadas.");
  }
  const allocated = new Set<string>();
  const next = (kind: string, sourceId: string) => {
    let collision = 0;
    let target: string;
    do {
      target = `assistant-${kind}-${createCurriculumDeterministicFingerprint({
        classroomId,
        sourcePackId: pack.id,
        kind,
        sourceId,
        collision,
      })}`;
      collision += 1;
    } while (allocated.has(target) || reservedSourceIds.has(target));
    allocated.add(target);
    return target;
  };
  const subjectIds: Record<string, string> = Object.create(null) as Record<string, string>;
  const competenceIds: Record<string, string> = Object.create(null) as Record<string, string>;
  const criterionIds: Record<string, string> = Object.create(null) as Record<string, string>;
  const basicKnowledgeIds: Record<string, string> = Object.create(null) as Record<string, string>;
  const compareIds = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const assign = (kind: string, ids: readonly string[], target: Record<string, string>) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      throw new Error("La importación contiene identidades duplicadas.");
    }
    uniqueIds.sort(compareIds).forEach((sourceId) => { target[sourceId] = next(kind, sourceId); });
  };
  assign("subject", pack.subjects.map((subject) => subject.id), subjectIds);
  assign("competence", pack.subjects.flatMap(
    (subject) => subject.specificCompetences?.map((competence) => competence.id) ?? []
  ), competenceIds);
  assign("criterion", pack.subjects.flatMap(
    (subject) => subject.criteria.map((criterion) => criterion.id)
  ), criterionIds);
  assign("knowledge", pack.subjects.flatMap(
    (subject) => subject.basicKnowledge.map((knowledge) => knowledge.id)
  ), basicKnowledgeIds);
  return {
    packId: next("pack", pack.id),
    subjectIds,
    competenceIds,
    criterionIds,
    basicKnowledgeIds,
  };
}

export function setCurriculumAssistantStep(
  state: CurriculumAssistantState,
  wizardStep: CurriculumAssistantStep,
  occurredAt: string
): CurriculumAssistantState {
  if (wizardStep !== 1 && wizardStep !== 2 && wizardStep !== 3) {
    throw new Error("El paso del asistente no es válido.");
  }
  if (state.wizardStep === wizardStep) return state;
  return advanceState(state, { wizardStep }, occurredAt);
}

export function createCurriculumAssistantEntityId(
  state: CurriculumAssistantState,
  kind: "subject" | "competence" | "criterion" | "knowledge",
  subjectId = "root"
): string {
  const pack = state.catalog.pack;
  const currentCount = !pack
    ? 0
    : kind === "subject"
      ? pack.subjects.length
      : kind === "competence"
        ? pack.subjects.reduce(
            (total, subject) => total + (subject.specificCompetences?.length ?? 0),
            0
          )
        : kind === "criterion"
          ? pack.subjects.reduce((total, subject) => total + subject.criteria.length, 0)
          : pack.subjects.reduce(
              (total, subject) => total + subject.basicKnowledge.length,
              state.pendingBasicKnowledge.length
            );
  const ordinal = currentCount + 1;
  const existingIds = new Set<string>([
    ...(pack ? [pack.id] : []),
    ...(state.profile ? [state.profile.id] : []),
    ...state.actionLinks.map((link) => link.id),
    ...state.pendingBasicKnowledge.map((knowledge) => knowledge.id),
    ...(pack?.subjects.flatMap((subject) => [
      subject.id,
      ...(subject.specificCompetences?.map((competence) => competence.id) ?? []),
      ...subject.criteria.map((criterion) => criterion.id),
      ...subject.basicKnowledge.map((knowledge) => knowledge.id),
    ]) ?? []),
  ]);
  let collision = 0;
  let candidate: string;
  do {
    candidate = `assistant-${kind}-${ordinal}-${createCurriculumDeterministicFingerprint({
      classroomId: state.classroomId,
      kind,
      subjectId,
      ordinal,
      catalogRevision: state.catalog.revision,
      collision,
    })}`;
    collision += 1;
  } while (existingIds.has(candidate));
  return candidate;
}

export function createCurriculumAssistantOperationId(
  state: CurriculumAssistantState,
  kind: string,
  entityId: string
): string {
  return `assistant-operation-${createCurriculumDeterministicFingerprint({
    classroomId: state.classroomId,
    stateRevision: state.revision,
    catalogRevision: state.catalog.revision,
    kind,
    entityId,
  })}`;
}

export function applyCurriculumAssistantCatalogCommand(
  state: CurriculumAssistantState,
  command: CurriculumCatalogCommand,
  actionCatalog: CurriculumActionCatalogContext,
  confirmActiveSubjectDeactivation = false
): CurriculumAssistantChangeResult {
  if (!state.catalog.pack || !state.profile) {
    return blocked("Primero prepara un borrador curricular editable.");
  }
  const result = applyCatalogCommand(state.catalog, command, {
    inspectedSources: ["profiles", "action-links", "ordinary-tracking"],
    profiles: [state.profile],
    actionLinks: state.actionLinks,
  });
  if (result.status === "rejected") {
    return {
      status: "blocked",
      messages: teacherMessagesFromCatalogConflicts(result.preview.conflicts),
      dependencies: result.preview.dependencies.map(() => "Este elemento tiene relaciones activas."),
    };
  }
  if (result.status === "idempotent") return { status: "applied", state };

  const touchedSubjectId = subjectIdFromCommand(command);
  let profile = state.profile;
  let trackingEnabled = state.trackingEnabled;
  const provisional = advanceState(state, { catalog: result.state }, command.occurredAt);
  if (touchedSubjectId && profile.selectedSubjectIds.includes(touchedSubjectId)) {
    const inspection = inspectCurriculumSubject(provisional, touchedSubjectId, actionCatalog);
    if (!inspection.canActivate) {
      if (!confirmActiveSubjectDeactivation) {
        return {
          status: "requires-deactivation",
          subjectId: touchedSubjectId,
          messages: inspection.blockingMessages,
        };
      }
      const deactivated = removeActiveSubject(state, touchedSubjectId, command.occurredAt);
      profile = deactivated.profile;
      trackingEnabled = deactivated.trackingEnabled;
    }
  }
  return {
    status: "applied",
    state: advanceState(state, {
      catalog: result.state,
      profile,
      trackingEnabled,
    }, command.occurredAt),
  };
}

export function addPendingBasicKnowledge(
  state: CurriculumAssistantState,
  draft: PendingBasicKnowledgeDraft,
  occurredAt: string,
  actionCatalog: CurriculumActionCatalogContext,
  confirmActiveSubjectDeactivation = false
): CurriculumAssistantChangeResult {
  const text = draft.text.trim();
  const externalCode = draft.externalCode?.trim();
  if (!text || text.length > CURRICULUM_ASSISTANT_LIMITS.maxTextLength) {
    return blocked("Escribe un saber válido.");
  }
  if (externalCode && externalCode.length > CURRICULUM_ASSISTANT_LIMITS.maxCodeLength) {
    return blocked("El código del saber es demasiado largo.");
  }
  if (state.pendingBasicKnowledge.length >= CURRICULUM_ASSISTANT_LIMITS.maxPendingBasicKnowledge) {
    return blocked("El borrador ha alcanzado el límite de saberes pendientes.");
  }
  const subject = state.catalog.pack?.subjects.find((item) => item.id === draft.subjectId);
  if (!subject || hasEntityId(state, draft.id)) return blocked("No se puede añadir este saber.");
  const nextPending = [
    ...state.pendingBasicKnowledge,
    { id: draft.id, subjectId: draft.subjectId, text, ...(externalCode ? { externalCode } : {}) },
  ];
  const next = advanceState(state, { pendingBasicKnowledge: nextPending }, occurredAt);
  if (state.profile?.selectedSubjectIds.includes(draft.subjectId)) {
    const inspection = inspectCurriculumSubject(next, draft.subjectId, actionCatalog);
    if (!inspection.canActivate && !confirmActiveSubjectDeactivation) {
      return {
        status: "requires-deactivation",
        subjectId: draft.subjectId,
        messages: inspection.blockingMessages,
      };
    }
    if (!inspection.canActivate && state.profile) {
      const deactivated = removeActiveSubject(state, draft.subjectId, occurredAt);
      return {
        status: "applied",
        state: advanceState(state, {
          pendingBasicKnowledge: nextPending,
          profile: deactivated.profile,
          trackingEnabled: deactivated.trackingEnabled,
        }, occurredAt),
      };
    }
  }
  return { status: "applied", state: next };
}

export function updatePendingBasicKnowledge(
  state: CurriculumAssistantState,
  basicKnowledgeId: string,
  textValue: string,
  externalCodeValue: string,
  occurredAt: string
): CurriculumAssistantChangeResult {
  const text = textValue.trim();
  const externalCode = externalCodeValue.trim();
  if (!text || text.length > CURRICULUM_ASSISTANT_LIMITS.maxTextLength) {
    return blocked("Escribe un saber válido.");
  }
  if (externalCode.length > CURRICULUM_ASSISTANT_LIMITS.maxCodeLength) {
    return blocked("El código del saber es demasiado largo.");
  }
  if (!state.pendingBasicKnowledge.some((item) => item.id === basicKnowledgeId)) {
    return blocked("El saber pendiente ya no está disponible.");
  }
  return {
    status: "applied",
    state: advanceState(state, {
      pendingBasicKnowledge: state.pendingBasicKnowledge.map((item) =>
        item.id === basicKnowledgeId
          ? { ...item, text, ...(externalCode ? { externalCode } : {}) }
          : item
      ),
    }, occurredAt),
  };
}

export function retireCurriculumEntity(
  state: CurriculumAssistantState,
  subjectId: string,
  entityType: "specific-competence" | "criterion" | "basic-knowledge",
  entityId: string,
  actionCatalog: CurriculumActionCatalogContext,
  occurredAt: string,
  confirmActiveSubjectDeactivation = false
): CurriculumAssistantChangeResult {
  const subject = getEffectiveSubject(state, subjectId);
  if (!subject) return blocked("La asignatura ya no está disponible.");
  const dependencies: string[] = [];
  if (entityType === "specific-competence") {
    subject.criteria.filter((criterion) => criterion.specificCompetenceId === entityId)
      .forEach(() => dependencies.push("Hay criterios dentro de esta competencia."));
  } else if (entityType === "criterion") {
    subject.basicKnowledge.filter((knowledge) => knowledge.criterionIds.includes(entityId))
      .forEach(() => dependencies.push("Hay saberes relacionados con este criterio."));
    state.actionLinks.filter((link) => link.resolvedCriterionIds.includes(entityId))
      .forEach(() => dependencies.push("Hay acciones relacionadas mediante este criterio."));
  } else {
    state.actionLinks.filter((link) => link.basicKnowledgeId === entityId)
      .forEach(() => dependencies.push("Hay acciones relacionadas con este saber."));
  }
  if (dependencies.length > 0) {
    return {
      status: "blocked",
      messages: ["Revisa las dependencias antes de retirar este elemento."],
      dependencies: uniqueStable(dependencies),
    };
  }
  const change = entityType === "specific-competence"
    ? { retiredSpecificCompetenceIds: uniqueStable([...state.retiredSpecificCompetenceIds, entityId]) }
    : entityType === "criterion"
      ? { retiredCriterionIds: uniqueStable([...state.retiredCriterionIds, entityId]) }
      : { retiredBasicKnowledgeIds: uniqueStable([...state.retiredBasicKnowledgeIds, entityId]) };
  const next = advanceState(state, change, occurredAt);
  if (state.profile?.selectedSubjectIds.includes(subjectId)) {
    const inspection = inspectCurriculumSubject(next, subjectId, actionCatalog);
    if (!inspection.canActivate && !confirmActiveSubjectDeactivation) {
      return {
        status: "requires-deactivation",
        subjectId,
        messages: inspection.blockingMessages,
      };
    }
    if (!inspection.canActivate && state.profile) {
      const deactivated = removeActiveSubject(state, subjectId, occurredAt);
      return {
        status: "applied",
        state: advanceState(state, {
          ...change,
          profile: deactivated.profile,
          trackingEnabled: deactivated.trackingEnabled,
        }, occurredAt),
      };
    }
  }
  return { status: "applied", state: next };
}

export function setBasicKnowledgeCriteria(
  state: CurriculumAssistantState,
  subjectId: string,
  basicKnowledgeId: string,
  criterionIds: readonly string[],
  actionCatalog: CurriculumActionCatalogContext,
  occurredAt: string,
  confirmActiveSubjectDeactivation = false
): CurriculumAssistantChangeResult {
  const subject = getEffectiveSubject(state, subjectId);
  if (!subject) return blocked("La asignatura ya no está disponible.");
  const eligibleIds = new Set(subject.criteria.map((criterion) => criterion.id));
  const normalized = uniqueStable(criterionIds);
  if (normalized.some((id) => !eligibleIds.has(id))) {
    return blocked("Revisa esta relación antes de continuar.");
  }
  const pending = state.pendingBasicKnowledge.find((item) => item.id === basicKnowledgeId);
  if (pending) {
    if (pending.subjectId !== subjectId) return blocked("El saber pertenece a otra asignatura.");
    if (normalized.length === 0) return { status: "applied", state };
    const command: CurriculumCatalogCommand = {
      type: "add-basic-knowledge",
      operationId: createCurriculumAssistantOperationId(state, "add-knowledge", basicKnowledgeId),
      expectedVersion: state.catalog.revision,
      occurredAt,
      packId: state.catalog.pack!.id,
      subjectId,
      basicKnowledge: {
        id: pending.id,
        text: pending.text,
        ...(pending.externalCode ? { externalCode: pending.externalCode } : {}),
        criterionIds: normalized,
      },
    };
    const result = applyCurriculumAssistantCatalogCommand(
      state,
      command,
      actionCatalog,
      confirmActiveSubjectDeactivation
    );
    if (result.status !== "applied") return result;
    return {
      status: "applied",
      state: replaceStateAtSameRevision(result.state, {
        pendingBasicKnowledge: result.state.pendingBasicKnowledge.filter(
          (item) => item.id !== basicKnowledgeId
        ),
      }),
    };
  }

  const knowledge = state.catalog.pack?.subjects
    .find((item) => item.id === subjectId)
    ?.basicKnowledge.find((item) => item.id === basicKnowledgeId);
  if (!knowledge) return blocked("El saber ya no está disponible.");
  if (normalized.length === 0) {
    const overrides = [
      ...state.knowledgeCriteriaOverrides.filter(
        (item) => item.basicKnowledgeId !== basicKnowledgeId
      ),
      { basicKnowledgeId, criterionIds: [] },
    ];
    const next = advanceState(state, { knowledgeCriteriaOverrides: overrides }, occurredAt);
    if (state.profile?.selectedSubjectIds.includes(subjectId) && !confirmActiveSubjectDeactivation) {
      return {
        status: "requires-deactivation",
        subjectId,
        messages: ["Este saber todavía no tiene criterios relacionados."],
      };
    }
    return {
      status: "applied",
      state: state.profile?.selectedSubjectIds.includes(subjectId) && state.profile
        ? (() => {
            const deactivated = removeActiveSubject(state, subjectId, occurredAt);
            return advanceState(state, {
              knowledgeCriteriaOverrides: overrides,
              profile: deactivated.profile,
              trackingEnabled: deactivated.trackingEnabled,
            }, occurredAt);
          })()
        : next,
    };
  }
  const command: CurriculumCatalogCommand = {
    type: "set-basic-knowledge-criteria",
    operationId: createCurriculumAssistantOperationId(state, "relate-knowledge", basicKnowledgeId),
    expectedVersion: state.catalog.revision,
    occurredAt,
    packId: state.catalog.pack!.id,
    subjectId,
    basicKnowledgeId,
    criterionIds: normalized,
  };
  const result = applyCurriculumAssistantCatalogCommand(
    state,
    command,
    actionCatalog,
    confirmActiveSubjectDeactivation
  );
  if (result.status !== "applied") return result;
  const actionLinks = result.state.actionLinks.map((link) =>
    link.subjectId === subjectId && link.basicKnowledgeId === basicKnowledgeId
      ? { ...link, resolvedCriterionIds: normalized, updatedAt: occurredAt }
      : link
  );
  return {
    status: "applied",
    state: replaceStateAtSameRevision(result.state, {
      knowledgeCriteriaOverrides: result.state.knowledgeCriteriaOverrides.filter(
        (item) => item.basicKnowledgeId !== basicKnowledgeId
      ),
      actionLinks,
    }),
  };
}

export function setBasicKnowledgeAction(
  state: CurriculumAssistantState,
  subjectId: string,
  basicKnowledgeId: string,
  action: Action,
  selected: boolean,
  occurredAt: string
): CurriculumAssistantChangeResult {
  const subject = getEffectiveSubject(state, subjectId);
  const knowledge = subject?.basicKnowledge.find((item) => item.id === basicKnowledgeId);
  if (!subject || !knowledge) return blocked("El saber ya no está disponible.");
  if (!getEligibleActionsForCurriculumSubject([action], subject).some((item) => item.id === action.id)) {
    return blocked("Esta acción pertenece a otra asignatura.");
  }
  if (knowledge.criterionIds.length === 0) {
    return blocked("Relaciona primero este saber con al menos un criterio.");
  }
  const existing = state.actionLinks.find(
    (link) => link.subjectId === subjectId
      && link.basicKnowledgeId === basicKnowledgeId
      && link.actionId === action.id
  );
  if (!selected && !existing) return { status: "applied", state };
  if (selected && existing) return { status: "applied", state };
  if (
    selected
    && state.actionLinks.filter((link) =>
      link.subjectId === subjectId && link.basicKnowledgeId === basicKnowledgeId
    ).length >= CURRICULUM_ASSISTANT_LIMITS.maxActionsPerBasicKnowledge
  ) return blocked("Este saber ha alcanzado el límite de acciones relacionadas.");
  if (selected && state.actionLinks.length >= CURRICULUM_ASSISTANT_LIMITS.maxActionLinks) {
    return blocked("El borrador ha alcanzado el límite total de relaciones con acciones.");
  }
  const profile = state.profile;
  if (!profile) return blocked("El perfil curricular no está preparado.");
  const actionLinks = selected
    ? [
        ...state.actionLinks,
        {
          id: createActionLinkId(state, profile.id, subjectId, basicKnowledgeId, action.id),
          schemaVersion: CURRICULUM_SCHEMA_VERSION,
          actionId: action.id,
          profileId: profile.id,
          subjectId,
          basicKnowledgeId,
          resolvedCriterionIds: [...knowledge.criterionIds],
          effect: action.points >= 0 ? "positive" : "contrary",
          recordingMode: "manual",
          enabled: true,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        } satisfies ActionCurricularLink,
      ]
    : state.actionLinks.filter((link) => link.id !== existing?.id);
  return { status: "applied", state: advanceState(state, { actionLinks }, occurredAt) };
}

export function archiveCurriculumSubject(
  state: CurriculumAssistantState,
  subjectId: string,
  occurredAt: string,
  confirmDeactivation = false
): CurriculumAssistantChangeResult {
  if (!state.catalog.pack?.subjects.some((subject) => subject.id === subjectId)) {
    return blocked("La asignatura ya no está disponible.");
  }
  if (state.archivedSubjectIds.includes(subjectId)) return { status: "applied", state };
  if (state.archivedSubjectIds.length >= CURRICULUM_ASSISTANT_LIMITS.maxArchivedSubjects) {
    return blocked("Se ha alcanzado el límite de asignaturas archivadas.");
  }
  const active = state.profile?.selectedSubjectIds.includes(subjectId) === true;
  if (active && !confirmDeactivation) {
    return {
      status: "requires-deactivation",
      subjectId,
      messages: ["La asignatura está activa. Se ocultará su pestaña, pero conservará sus datos."],
    };
  }
  const deactivated = active && state.profile
    ? removeActiveSubject(state, subjectId, occurredAt)
    : { profile: state.profile, trackingEnabled: state.trackingEnabled };
  return {
    status: "applied",
    state: advanceState(state, {
      archivedSubjectIds: [...state.archivedSubjectIds, subjectId],
      profile: deactivated.profile,
      trackingEnabled: deactivated.trackingEnabled,
    }, occurredAt),
  };
}

export function restoreCurriculumSubject(
  state: CurriculumAssistantState,
  subjectId: string,
  occurredAt: string
): CurriculumAssistantState {
  if (!state.archivedSubjectIds.includes(subjectId)) return state;
  return advanceState(state, {
    archivedSubjectIds: state.archivedSubjectIds.filter((id) => id !== subjectId),
  }, occurredAt);
}

export function setCurriculumSubjectActivation(
  state: CurriculumAssistantState,
  subjectId: string,
  active: boolean,
  actionCatalog: CurriculumActionCatalogContext,
  occurredAt: string,
  confirmWarnings = false
): CurriculumAssistantActivationResult {
  const inspection = inspectCurriculumSubject(state, subjectId, actionCatalog);
  if (!active) {
    if (!state.profile) return { status: "blocked", inspection };
    if (!state.profile.selectedSubjectIds.includes(subjectId)) {
      return { status: "deactivated", state, inspection };
    }
    const deactivated = removeActiveSubject(state, subjectId, occurredAt);
    return {
      status: "deactivated",
      state: advanceState(state, deactivated, occurredAt),
      inspection,
    };
  }
  if (!inspection.canActivate || !state.profile || state.archivedSubjectIds.includes(subjectId)) {
    return { status: "blocked", inspection };
  }
  if (state.trackingEnabled && state.profile.selectedSubjectIds.includes(subjectId)) {
    return { status: "activated", state, inspection: { ...inspection, status: "active" } };
  }
  if (inspection.warningMessages.length > 0 && !confirmWarnings) {
    return { status: "confirmation-required", inspection };
  }
  const packOrder = state.catalog.pack?.subjects.map((subject) => subject.id) ?? [];
  const selected = new Set([...state.profile.selectedSubjectIds, subjectId]);
  const selectedSubjectIds = packOrder.filter((id) => selected.has(id));
  const profile = updateProfileSubjects(
    state.profile,
    selectedSubjectIds,
    occurredAt,
    true
  );
  return {
    status: "activated",
    state: advanceState(state, { profile, trackingEnabled: true }, occurredAt),
    inspection: { ...inspection, status: "active" },
  };
}

export function setCurriculumTrackingEnabled(
  state: CurriculumAssistantState,
  enabled: boolean,
  occurredAt: string
): CurriculumAssistantChangeResult {
  if (enabled && (!state.profile || state.profile.selectedSubjectIds.length === 0)) {
    return blocked("Activa al menos una asignatura desde el asistente.");
  }
  if (state.trackingEnabled === enabled) return { status: "applied", state };
  return {
    status: "applied",
    state: advanceState(state, {
      trackingEnabled: enabled,
      profile: state.profile
        ? updateProfileSubjects(
            state.profile,
            state.profile.selectedSubjectIds,
            occurredAt,
            enabled
          )
        : null,
    }, occurredAt),
  };
}

export function inspectCurriculumSubject(
  state: CurriculumAssistantState,
  subjectId: string,
  actionCatalog: CurriculumActionCatalogContext
): CurriculumSubjectPreparationInspection {
  const subject = getEffectiveSubject(state, subjectId);
  const active = state.profile?.selectedSubjectIds.includes(subjectId) === true;
  if (!subject || state.archivedSubjectIds.includes(subjectId)) {
    return {
      subjectId,
      status: "needs-review",
      canActivate: false,
      blockingMessages: ["Esta asignatura está retirada de la preparación."],
      warningMessages: [],
      counts: {
        specificCompetences: 0,
        criteria: 0,
        basicKnowledge: 0,
        relatedKnowledge: 0,
        actionLinks: 0,
      },
    };
  }
  const pendingCount = state.pendingBasicKnowledge.filter(
    (knowledge) => knowledge.subjectId === subjectId
      && !state.retiredBasicKnowledgeIds.includes(knowledge.id)
  ).length;
  const blockingMessages: string[] = [];
  if ((subject.specificCompetences?.length ?? 0) === 0) {
    blockingMessages.push("Esta asignatura todavía no tiene competencias específicas.");
  }
  if (subject.criteria.length === 0) blockingMessages.push("Añade al menos un criterio.");
  if (subject.basicKnowledge.length + pendingCount === 0) {
    blockingMessages.push("Añade al menos un saber.");
  }
  if (pendingCount > 0) blockingMessages.push("Relaciona los saberes pendientes con sus criterios.");
  const scopedData = createScopedCurriculumData(state, subject);
  const validation = validateCurriculumData(
    scopedData,
    getKnownActionIds(actionCatalog)
  );
  validation.issues.filter((issue) => issue.severity === "error").forEach((issue) => {
    blockingMessages.push(teacherMessageFromValidationCode(issue.code));
  });
  const warningMessages = validation.issues
    .filter((issue) => issue.severity === "warning")
    .map((issue) => teacherMessageFromValidationCode(issue.code));
  const actionRelationMessages = inspectActionCatalogRelations(state, subject, actionCatalog);
  blockingMessages.push(...actionRelationMessages);
  const uniqueBlocking = uniqueStable(blockingMessages);
  const uniqueWarnings = uniqueStable(warningMessages);
  const hasAnyContent = (subject.specificCompetences?.length ?? 0) > 0
    || subject.criteria.length > 0
    || subject.basicKnowledge.length > 0
    || pendingCount > 0;
  const needsReview = validation.issues.some((issue) => issue.severity === "error")
    || actionRelationMessages.length > 0;
  const canActivate = uniqueBlocking.length === 0;
  return {
    subjectId,
    status: active && canActivate
      ? "active"
      : canActivate
        ? "ready"
        : needsReview
          ? "needs-review"
          : hasAnyContent
            ? "in-progress"
            : "not-started",
    canActivate,
    blockingMessages: uniqueBlocking,
    warningMessages: uniqueWarnings,
    counts: {
      specificCompetences: subject.specificCompetences?.length ?? 0,
      criteria: subject.criteria.length,
      basicKnowledge: subject.basicKnowledge.length + pendingCount,
      relatedKnowledge: subject.basicKnowledge.filter(
        (knowledge) => knowledge.criterionIds.length > 0
      ).length,
      actionLinks: state.actionLinks.filter((link) => link.subjectId === subjectId).length,
    },
  };
}

export function getEffectiveCurriculumPack(state: CurriculumAssistantState): CurriculumPack | null {
  const pack = state.catalog.pack;
  if (!pack) return null;
  return {
    ...pack,
    subjects: pack.subjects.map((subject) => getEffectiveSubject(state, subject.id)!),
  };
}

export function getEffectiveSubject(
  state: CurriculumAssistantState,
  subjectId: string
): CurriculumSubject | null {
  const subject = state.catalog.pack?.subjects.find((candidate) => candidate.id === subjectId);
  if (!subject) return null;
  const retiredCompetences = new Set(state.retiredSpecificCompetenceIds);
  const retiredCriteria = new Set(state.retiredCriterionIds);
  const retiredKnowledge = new Set(state.retiredBasicKnowledgeIds);
  const overrides = new Map(
    state.knowledgeCriteriaOverrides.map((item) => [item.basicKnowledgeId, item.criterionIds])
  );
  return {
    ...subject,
    specificCompetences: (subject.specificCompetences ?? []).filter(
      (competence) => !retiredCompetences.has(competence.id)
    ),
    criteria: subject.criteria.filter((criterion) => !retiredCriteria.has(criterion.id)),
    basicKnowledge: subject.basicKnowledge
      .filter((knowledge) => !retiredKnowledge.has(knowledge.id))
      .map((knowledge) => ({
        ...knowledge,
        criterionIds: [...(overrides.get(knowledge.id) ?? knowledge.criterionIds)],
      })),
  };
}

function getKnownActionIds(actionCatalog: CurriculumActionCatalogContext): string[] {
  if (actionCatalog.every((item) => typeof item === "string")) {
    return uniqueStable(actionCatalog as readonly string[]);
  }
  return uniqueStable((actionCatalog as readonly Action[])
    .filter((action) => !action.archived)
    .map((action) => action.id));
}

function inspectActionCatalogRelations(
  state: CurriculumAssistantState,
  subject: CurriculumSubject,
  actionCatalog: CurriculumActionCatalogContext
): string[] {
  if (actionCatalog.length === 0 || typeof actionCatalog[0] === "string") return [];
  const actions = actionCatalog as readonly Action[];
  const actionsById = new Map<string, Action[]>();
  actions.forEach((action) => {
    actionsById.set(action.id, [...(actionsById.get(action.id) ?? []), action]);
  });
  const relationKeys = new Set<string>();
  const messages: string[] = [];
  state.actionLinks.filter((link) => link.subjectId === subject.id).forEach((link) => {
    const relationKey = `${link.profileId}\u0000${link.subjectId}\u0000${link.basicKnowledgeId}\u0000${link.actionId}`;
    if (relationKeys.has(relationKey)) {
      messages.push("Hay una acción relacionada más de una vez.");
    }
    relationKeys.add(relationKey);
    const matches = actionsById.get(link.actionId) ?? [];
    if (matches.length !== 1 || matches[0].archived || !link.enabled) {
      messages.push("Una acción relacionada ya no está disponible.");
      return;
    }
    const action = matches[0];
    if (!getEligibleActionsForCurriculumSubject([action], subject).some(
      (candidate) => candidate.id === action.id
    )) {
      messages.push("Una acción relacionada ya no pertenece a esta asignatura.");
    }
    const expectedEffect = action.points >= 0 ? "positive" : "contrary";
    if (link.effect !== expectedEffect) {
      messages.push("Revisa el tipo positivo o negativo de una acción relacionada.");
    }
  });
  return uniqueStable(messages);
}

/** Stable catalog order; eligibility is based only on explicit subject identities. */
export function getEligibleActionsForCurriculumSubject(
  catalog: readonly Action[],
  subject: CurriculumSubject
): Action[] {
  const explicitSubjectIds = new Set([
    subject.id,
    ...(subject.legacySubjectId ? [subject.legacySubjectId] : []),
    ...(subject.externalCode === "EAR"
      ? [SUBJECT_IDS.ART_EDUCATION, SUBJECT_IDS.MUSIC]
      : []),
  ]);
  const seen = new Set<string>();
  return catalog.filter((action) => {
    if (action.archived || seen.has(action.id)) return false;
    const eligible = action.availableInAllSubjects || explicitSubjectIds.has(action.subjectId);
    if (eligible) seen.add(action.id);
    return eligible;
  });
}

export function getActiveCurriculumSubjects(
  state: CurriculumAssistantState,
  actionCatalog: CurriculumActionCatalogContext
): CurriculumSubject[] {
  if (!state.trackingEnabled || !state.profile) return [];
  const selected = new Set(state.profile.selectedSubjectIds);
  return (getEffectiveCurriculumPack(state)?.subjects ?? []).filter(
    (subject) => selected.has(subject.id)
      && !state.archivedSubjectIds.includes(subject.id)
      && inspectCurriculumSubject(state, subject.id, actionCatalog).canActivate
  );
}

export function createCurriculumDataFromAssistantState(
  state: CurriculumAssistantState
): VersionedCurriculumData {
  const pack = getEffectiveCurriculumPack(state);
  const profile = state.profile;
  const hasActiveSubjects = Boolean(profile?.selectedSubjectIds.length);
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: state.classroomId,
      status: state.trackingEnabled && hasActiveSubjects
        ? "active"
        : pack
          ? "configured"
          : "inactive",
      activeProfileId: state.trackingEnabled && hasActiveSubjects ? profile?.id ?? null : null,
    },
    packs: pack ? [pack] : [],
    profiles: profile ? [profile] : [],
    actionLinks: [...state.actionLinks],
  };
}

function createScopedCurriculumData(
  state: CurriculumAssistantState,
  subject: CurriculumSubject
): VersionedCurriculumData {
  const pack = state.catalog.pack!;
  const profile = state.profile!;
  const scopedPack: CurriculumPack = { ...pack, subjects: [subject] };
  const scopedProfile: CurriculumProfile = {
    ...profile,
    packId: scopedPack.id,
    status: "active",
    selectedSubjectIds: [subject.id],
    ordinaryTracking: { ...profile.ordinaryTracking, enabled: false, rules: [] },
  };
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: state.classroomId,
      status: "active",
      activeProfileId: scopedProfile.id,
    },
    packs: [scopedPack],
    profiles: [scopedProfile],
    actionLinks: state.actionLinks.filter((link) => link.subjectId === subject.id),
  };
}

function createEditableStateFromImportedPack(
  classroomId: string,
  importedPack: CurriculumPack,
  originalSubjectIdByImportedId: Readonly<Record<string, string>>,
  occurredAt: string
): CurriculumAssistantState {
  const manualVersion = "manual-r1";
  const pack: CurriculumPack = {
    ...importedPack,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: manualVersion,
    provenance: {
      kind: "manual",
      sourceId: importedPack.provenance.sourceId ?? importedPack.id,
      sourceVersion: importedPack.packageVersion,
      label: importedPack.provenance.label ?? "Borrador importado",
    },
    createdAt: occurredAt,
    updatedAt: occurredAt,
    subjects: importedPack.subjects.map((subject) => ({
      ...subject,
      legacySubjectId: subject.legacySubjectId
        ?? originalSubjectIdByImportedId[subject.id],
      specificCompetences: (subject.specificCompetences ?? []).map((competence) => ({
        ...competence,
        sourceVersion: manualVersion,
      })),
      criteria: subject.criteria.map((criterion) => ({
        ...criterion,
        sourceVersion: manualVersion,
      })),
      basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
        ...knowledge,
        sourceVersion: manualVersion,
        criterionIds: [...knowledge.criterionIds],
      })),
    })),
  };
  const importOperationId = stableId("editable-import", classroomId, importedPack.id);
  const importSourceFingerprint = `assistant-import-source-v1:${createCurriculumDeterministicFingerprint(importedPack)}`;
  const catalog = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    revision: 1,
    pack,
    appliedOperations: [{
      operationId: importOperationId,
      commandFingerprint: importSourceFingerprint,
      resultingVersion: 1,
    }],
  };
  return freezeState({
    schemaVersion: CURRICULUM_ASSISTANT_SCHEMA_VERSION,
    classroomId,
    revision: 1,
    trackingEnabled: false,
    wizardStep: 2,
    catalog,
    profile: createProfile(classroomId, pack, occurredAt),
    actionLinks: [],
    archivedSubjectIds: [],
    retiredSpecificCompetenceIds: [],
    retiredCriterionIds: [],
    retiredBasicKnowledgeIds: [],
    pendingBasicKnowledge: [],
    knowledgeCriteriaOverrides: [],
    legacyImport: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

function createProfile(
  classroomId: string,
  pack: CurriculumPack,
  occurredAt: string
): CurriculumProfile {
  return {
    id: stableId("profile", classroomId),
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    classroomId,
    packId: pack.id,
    provenance: { kind: "manual" },
    status: "configured",
    selectedSubjectIds: [],
    ordinaryTracking: { enabled: true, minimumSessionDurationMinutes: 0, rules: [] },
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function updateProfileSubjects(
  profile: CurriculumProfile,
  selectedSubjectIds: readonly string[],
  occurredAt: string,
  trackingEnabled: boolean
): CurriculumProfile {
  return {
    ...profile,
    status: trackingEnabled && selectedSubjectIds.length > 0 ? "active" : "configured",
    selectedSubjectIds: [...selectedSubjectIds],
    updatedAt: occurredAt,
  };
}

function removeActiveSubject(
  state: CurriculumAssistantState,
  subjectId: string,
  occurredAt: string
): { readonly profile: CurriculumProfile; readonly trackingEnabled: boolean } {
  if (!state.profile) throw new Error("El perfil curricular no está preparado.");
  const selectedSubjectIds = state.profile.selectedSubjectIds.filter((id) => id !== subjectId);
  const trackingEnabled = state.trackingEnabled && selectedSubjectIds.length > 0;
  return {
    profile: updateProfileSubjects(
      state.profile,
      selectedSubjectIds,
      occurredAt,
      trackingEnabled
    ),
    trackingEnabled,
  };
}

function subjectIdFromCommand(command: CurriculumCatalogCommand): string | null {
  return "subjectId" in command && typeof command.subjectId === "string"
    ? command.subjectId
    : command.type === "add-subject"
      ? command.subject.id
      : null;
}

function teacherMessagesFromCatalogConflicts(
  conflicts: readonly { readonly code: string }[]
): string[] {
  if (conflicts.length === 0) return ["No se pudo guardar este cambio."];
  return uniqueStable(conflicts.map((conflict) => {
    switch (conflict.code) {
      case "missing-specific-competence": return "Este criterio necesita una competencia.";
      case "specific-competence-from-another-subject":
      case "criterion-from-another-subject": return "La relación pertenece a otra asignatura.";
      case "missing-criterion": return "Relaciona el saber con al menos un criterio.";
      case "duplicate-external-code": return "Ese código ya se utiliza en la asignatura.";
      case "dependency-blocking":
      case "decision-required": return "Revisa las dependencias antes de retirar este elemento.";
      case "stale-version": return "El borrador ha cambiado. Vuelve a intentar la operación.";
      default: return "Revisa los datos de este elemento antes de guardar.";
    }
  }));
}

function teacherMessageFromValidationCode(code: string): string {
  switch (code) {
    case "missing-specific-competence-collection":
    case "unassigned-specific-competence":
    case "missing-specific-competence-reference": return "Este criterio necesita una competencia.";
    case "cross-subject-specific-competence-reference":
    case "cross-subject-criterion-reference": return "Hay una relación con otra asignatura.";
    case "missing-criterion-reference": return "Relaciona cada saber con al menos un criterio.";
    case "missing-action-reference": return "Una acción relacionada ya no está disponible.";
    case "duplicate-subject-name":
    case "duplicate-specific-competence-text":
    case "duplicate-criterion-text":
    case "duplicate-basic-knowledge-text": return "Hay textos repetidos; revísalos si no era intencionado.";
    default: return "Revisa esta relación antes de activar.";
  }
}

function advanceState(
  state: CurriculumAssistantState,
  change: Partial<Omit<CurriculumAssistantState, "schemaVersion" | "classroomId" | "revision" | "createdAt" | "updatedAt">>,
  occurredAt: string
): CurriculumAssistantState {
  requireInstant(occurredAt);
  return freezeState({
    ...state,
    ...change,
    revision: state.revision + 1,
    updatedAt: occurredAt,
  });
}

function replaceStateAtSameRevision(
  state: CurriculumAssistantState,
  change: Partial<Omit<CurriculumAssistantState, "schemaVersion" | "classroomId" | "revision" | "createdAt" | "updatedAt">>
): CurriculumAssistantState {
  return freezeState({ ...state, ...change });
}

function hasEntityId(state: CurriculumAssistantState, id: string): boolean {
  if (!id.trim()) return true;
  const pack = state.catalog.pack;
  return state.profile?.id === id
    || state.actionLinks.some((link) => link.id === id)
    || pack?.id === id
    || pack?.subjects.some((subject) =>
      subject.id === id
      || subject.specificCompetences?.some((item) => item.id === id)
      || subject.criteria.some((item) => item.id === id)
      || subject.basicKnowledge.some((item) => item.id === id)
    ) === true
    || state.pendingBasicKnowledge.some((item) => item.id === id);
}

function createActionLinkId(
  state: CurriculumAssistantState,
  profileId: string,
  subjectId: string,
  basicKnowledgeId: string,
  actionId: string
): string {
  const parts = [profileId, subjectId, basicKnowledgeId, actionId] as const;
  let collision = 0;
  let candidate = stableId("action-link", ...parts);
  while (hasEntityId(state, candidate)) {
    collision += 1;
    candidate = stableId("action-link", ...parts, `collision-${collision}`);
  }
  return candidate;
}

function stableId(kind: string, ...parts: readonly string[]): string {
  return `curriculum-${kind}-${createCurriculumDeterministicFingerprint({ kind, parts })}`;
}

function requireClassroomId(classroomId: string): void {
  if (!classroomId.trim() || classroomId.trim() !== classroomId) {
    throw new Error("Se necesita una clase válida.");
  }
}

function requireInstant(value: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Se necesita una fecha informativa válida.");
  }
}

function blocked(...messages: readonly string[]): CurriculumAssistantChangeResult {
  return { status: "blocked", messages };
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function freezeState(state: CurriculumAssistantState): CurriculumAssistantState {
  return deepFreeze(JSON.parse(JSON.stringify(state)) as CurriculumAssistantState);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
