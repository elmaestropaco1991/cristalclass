import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumCatalogCommand,
  type CurriculumCatalogDependencyContext,
  type CurriculumCatalogEditorState,
  type CurriculumPack,
  type CurriculumProfile,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { validateCurriculumData } from "./curriculumValidationService";
import {
  applyCatalogCommand,
  createEmptyCurriculumCatalogEditorState,
  previewCatalogCommand,
} from "./curriculumCatalogEditorService";

export interface CurriculumCatalogEditorDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const PACK_ID = "manual-pack-1";
const INSTANT = "2026-08-24T10:00:00.000Z";

export function runCurriculumCatalogEditorDeterministicChecks(): readonly CurriculumCatalogEditorDeterministicCheck[] {
  return [
    check("a valid empty manual pack can be created", () => {
      const result = applyCatalogCommand(createEmptyCurriculumCatalogEditorState(), createPackCommand());
      return result.status === "applied"
        && result.pack.id === PACK_ID
        && result.pack.provenance.kind === "manual"
        && result.pack.subjects.length === 0
        && result.state.revision === 1;
    }),
    check("an empty pack name is rejected", () => {
      const preview = previewCatalogCommand(
        createEmptyCurriculumCatalogEditorState(),
        { ...createPackCommand(), name: "   " }
      );
      return !preview.canApply
        && preview.conflicts.some((item) => item.code === "invalid-name");
    }),
    check("adding a subject never mutates the previous pack", () => {
      const created = createPackState();
      const snapshot = JSON.stringify(created);
      const result = applyCatalogCommand(created, addSubjectCommand(created, "subject-music", "Música"));
      return result.status === "applied"
        && JSON.stringify(created) === snapshot
        && created.pack?.subjects.length === 0
        && result.pack.subjects.length === 1;
    }),
    check("equal subject names produce a warning without identity collision", () => {
      const first = addSubject(createPackState(), "subject-music", "Música");
      const preview = previewCatalogCommand(
        first,
        addSubjectCommand(first, "subject-music-2", "música")
      );
      return preview.canApply
        && preview.warnings.some((item) => item.code === "duplicate-subject-name")
        && preview.proposedPack?.subjects.length === 2;
    }),
    check("a duplicate subject ID is rejected", () => {
      const first = addSubject(createPackState(), "subject-music", "Música");
      const preview = previewCatalogCommand(
        first,
        addSubjectCommand(first, "subject-music", "Otra música", "add-duplicate-subject")
      );
      return preview.conflicts.some((item) => item.code === "duplicate-id");
    }),
    check("a valid criterion can be added", () => {
      const state = createSubjectState();
      const result = applyCatalogCommand(state, addCriterionCommand(
        state,
        "subject-music",
        "criterion-1",
        "MUS-1",
        "Participa de forma responsable."
      ));
      return result.status === "applied"
        && result.pack.subjects[0].criteria[0].id === "criterion-1"
        && result.pack.subjects[0].criteria[0].sourceVersion === "manual-r3";
    }),
    check("a repeated external criterion code is blocking", () => {
      const first = addCriterion(createSubjectState(), "criterion-1", "MUS-1", "Primer texto");
      const preview = previewCatalogCommand(first, addCriterionCommand(
        first,
        "subject-music",
        "criterion-2",
        "mus-1",
        "Segundo texto"
      ));
      return preview.conflicts.some((item) => item.code === "duplicate-external-code");
    }),
    check("identical criterion text warns without merging", () => {
      const first = addCriterion(createSubjectState(), "criterion-1", "MUS-1", "Texto repetido");
      const preview = previewCatalogCommand(first, addCriterionCommand(
        first,
        "subject-music",
        "criterion-2",
        "MUS-2",
        " texto repetido "
      ));
      return preview.canApply
        && preview.warnings.some((item) => item.code === "duplicate-criterion-text")
        && preview.proposedPack?.subjects[0].criteria.length === 2;
    }),
    check("basic knowledge can reference several criteria", () => {
      const state = createTwoCriterionState();
      const result = applyCatalogCommand(state, addKnowledgeCommand(
        state,
        "knowledge-1",
        ["criterion-1", "criterion-2"]
      ));
      return result.status === "applied"
        && result.pack.subjects[0].basicKnowledge[0].criterionIds.join(",")
          === "criterion-1,criterion-2"
        && result.pack.subjects[0].basicKnowledge[0].sourceVersion
          === `manual-r${state.revision + 1}`;
    }),
    check("a missing criterion reference is rejected", () => {
      const state = createCriterionState();
      const preview = previewCatalogCommand(
        state,
        addKnowledgeCommand(state, "knowledge-1", ["criterion-missing"])
      );
      return preview.conflicts.some((item) => item.code === "missing-criterion");
    }),
    check("a criterion from another subject is rejected", () => {
      const state = createCrossSubjectCriterionState();
      const preview = previewCatalogCommand(state, {
        ...addKnowledgeCommand(state, "knowledge-1", ["criterion-math"]),
        subjectId: "subject-music",
      });
      return preview.conflicts.some((item) => item.code === "criterion-from-another-subject");
    }),
    check("basic knowledge without relations invents nothing", () => {
      const state = createCriterionState();
      const preview = previewCatalogCommand(state, addKnowledgeCommand(state, "knowledge-1", []));
      return !preview.canApply
        && preview.conflicts.some((item) => item.code === "missing-criterion")
        && state.pack?.subjects[0].basicKnowledge.length === 0;
    }),
    check("valid subject reorder preserves stable identities", () => {
      const state = createTwoSubjectState();
      const beforeIds = state.pack!.subjects.map((subject) => subject.id).sort();
      const result = applyCatalogCommand(state, command(state, {
        type: "reorder-subjects",
        packId: PACK_ID,
        subjectIds: ["subject-math", "subject-music"],
      }));
      return result.status === "applied"
        && result.pack.subjects.map((subject) => subject.id).join(",")
          === "subject-math,subject-music"
        && result.pack.subjects.map((subject) => subject.id).sort().join(",")
          === beforeIds.join(",");
    }),
    check("reorder with an omitted ID is rejected", () => {
      const state = createTwoSubjectState();
      const preview = previewCatalogCommand(state, command(state, {
        type: "reorder-subjects",
        packId: PACK_ID,
        subjectIds: ["subject-music"],
      }));
      return preview.conflicts.some((item) => item.code === "invalid-order");
    }),
    check("reorder with a duplicate ID is rejected", () => {
      const state = createTwoSubjectState();
      const preview = previewCatalogCommand(state, command(state, {
        type: "reorder-subjects",
        packId: PACK_ID,
        subjectIds: ["subject-music", "subject-music"],
      }));
      return preview.conflicts.some((item) => item.code === "invalid-order");
    }),
    check("a stale expected version is rejected", () => {
      const state = createSubjectState();
      const preview = previewCatalogCommand(state, {
        ...addCriterionCommand(state, "subject-music", "criterion-1", "MUS-1", "Texto"),
        expectedVersion: state.revision - 1,
      });
      return preview.conflicts.some((item) => item.code === "stale-version");
    }),
    check("repeating one operation ID with equal content is idempotent", () => {
      const state = createPackState();
      const add = addSubjectCommand(state, "subject-music", "Música", "same-operation");
      const first = applyCatalogCommand(state, add);
      if (first.status !== "applied") return false;
      const second = applyCatalogCommand(first.state, { ...add, occurredAt: "2026-08-25T10:00:00.000Z" });
      return second.status === "idempotent"
        && second.state.revision === first.state.revision
        && second.state.pack === first.state.pack;
    }),
    check("one operation ID with different content conflicts", () => {
      const state = createPackState();
      const add = addSubjectCommand(state, "subject-music", "Música", "collision-operation");
      const first = applyCatalogCommand(state, add);
      if (first.status !== "applied") return false;
      const preview = previewCatalogCommand(first.state, {
        ...add,
        subject: { ...add.subject, name: "Matemáticas" },
      });
      return preview.conflicts.some((item) => item.code === "operation-id-collision");
    }),
    check("preview performs no mutation or storage access", () => {
      const state = createSubjectState();
      const input = addCriterionCommand(state, "subject-music", "criterion-1", "MUS-1", "Texto");
      const snapshot = JSON.stringify({ state, input });
      let writes = 0;
      const globalObject = globalThis as typeof globalThis & { localStorage?: Storage };
      const descriptor = Object.getOwnPropertyDescriptor(globalObject, "localStorage");
      try {
        if (!descriptor || descriptor.configurable) {
          Object.defineProperty(globalObject, "localStorage", {
            configurable: true,
            value: { setItem: () => { writes += 1; } },
          });
        }
        previewCatalogCommand(state, input);
      } finally {
        restoreGlobalProperty(globalObject, "localStorage", descriptor);
      }
      return JSON.stringify({ state, input }) === snapshot && writes === 0;
    }),
    check("apply increments the catalog version exactly once", () => {
      const state = createSubjectState();
      const result = applyCatalogCommand(state, addCriterionCommand(
        state,
        "subject-music",
        "criterion-1",
        "MUS-1",
        "Texto"
      ));
      return result.status === "applied"
        && result.state.revision === state.revision + 1
        && result.pack.packageVersion === `manual-r${state.revision + 1}`
        && result.state.appliedOperations.length === state.appliedOperations.length + 1;
    }),
    check("criterion removal is blocked by dependent basic knowledge", () => {
      const state = createKnowledgeState();
      const preview = previewCatalogCommand(state, command(state, {
        type: "request-remove-criterion",
        packId: PACK_ID,
        subjectId: "subject-music",
        criterionId: "criterion-1",
      }), completeDependencyContext([], []));
      return preview.dependencies.some((item) => item.kind === "knowledge-criterion")
        && preview.conflicts.some((item) => item.code === "dependency-blocking");
    }),
    check("subject removal is blocked by a selecting profile", () => {
      const state = createSubjectState();
      const preview = previewCatalogCommand(
        state,
        command(state, {
          type: "request-remove-subject",
          packId: PACK_ID,
          subjectId: "subject-music",
        }),
        completeDependencyContext([createProfile(false)], [])
      );
      return preview.dependencies.some((item) => item.kind === "profile-subject")
        && !preview.canApply;
    }),
    check("an ActionCurricularLink blocks referenced knowledge removal", () => {
      const state = createKnowledgeState();
      const preview = previewCatalogCommand(
        state,
        command(state, {
          type: "request-remove-basic-knowledge",
          packId: PACK_ID,
          subjectId: "subject-music",
          basicKnowledgeId: "knowledge-1",
        }),
        completeDependencyContext([], [createActionLink()])
      );
      return preview.dependencies.some((item) => item.kind === "action-link-basic-knowledge")
        && preview.conflicts.some((item) => item.code === "dependency-blocking");
    }),
    check("removal without dependencies still requires an archive policy decision", () => {
      const state = createSubjectState();
      const preview = previewCatalogCommand(state, command(state, {
        type: "request-remove-subject",
        packId: PACK_ID,
        subjectId: "subject-music",
      }), completeDependencyContext([], []));
      return preview.dependencies.length === 0
        && preview.conflicts.some((item) => item.code === "decision-required")
        && !preview.canApply;
    }),
    check("the pure editor never reads browser globals", () => verifyNoBrowserGlobalAccess()),
    check("referencing editor functions has no startup side effects", () => {
      const state = createEmptyCurriculumCatalogEditorState();
      const exportsOnly = [previewCatalogCommand, applyCatalogCommand];
      return exportsOnly.length === 2 && state.revision === 0 && state.pack === null;
    }),
    check("object property order does not alter preview or apply", () => {
      const state = createPackState();
      const first = addSubjectCommand(state, "subject-music", "Música", "property-order");
      const second = {
        subject: { name: "Música", id: "subject-music" },
        packId: PACK_ID,
        occurredAt: INSTANT,
        expectedVersion: state.revision,
        operationId: "property-order",
        type: "add-subject",
      } as const;
      const firstPreview = previewCatalogCommand(state, first);
      const secondPreview = previewCatalogCommand(state, second);
      return firstPreview.commandFingerprint === secondPreview.commandFingerprint
        && JSON.stringify(firstPreview.proposedPack) === JSON.stringify(secondPreview.proposedPack)
        && JSON.stringify(applyCatalogCommand(state, first))
          === JSON.stringify(applyCatalogCommand(state, second));
    }),
    check("informative dates do not alter IDs or operation identity", () => {
      const state = createPackState();
      const first = addSubjectCommand(state, "subject-music", "Música", "date-independent");
      const second = { ...first, occurredAt: "2027-01-02T03:04:05.000Z" };
      const firstPreview = previewCatalogCommand(state, first);
      const secondPreview = previewCatalogCommand(state, second);
      return firstPreview.commandFingerprint === secondPreview.commandFingerprint
        && firstPreview.proposedPack?.id === secondPreview.proposedPack?.id
        && firstPreview.proposedPack?.subjects[0].id
          === secondPreview.proposedPack?.subjects[0].id;
    }),
    check("pack metadata can be updated and optional fields cleared", () => {
      const initial = applyCatalogCommand(
        createEmptyCurriculumCatalogEditorState(),
        { ...createPackCommand(), region: "Andalucía" }
      );
      if (initial.status !== "applied") return false;
      const result = applyCatalogCommand(initial.state, command(initial.state, {
        type: "update-pack-metadata",
        packId: PACK_ID,
        name: "Catálogo revisado",
        region: null,
      }));
      return result.status === "applied"
        && result.pack.name === "Catálogo revisado"
        && result.pack.region === undefined;
    }),
    check("subject metadata can be edited without changing identity", () => {
      const state = createSubjectState();
      const result = applyCatalogCommand(state, command(state, {
        type: "update-subject",
        packId: PACK_ID,
        subjectId: "subject-music",
        name: "Educación musical",
        externalCode: "MUS",
      }));
      return result.status === "applied"
        && result.pack.subjects[0].id === "subject-music"
        && result.pack.subjects[0].name === "Educación musical";
    }),
    check("criteria can be edited and reordered pedagogically", () => {
      const state = createTwoCriterionState();
      const edited = applyCatalogCommand(state, command(state, {
        type: "update-criterion",
        packId: PACK_ID,
        subjectId: "subject-music",
        criterionId: "criterion-1",
        text: "Texto actualizado",
        title: "Título",
        externalCode: "MUS-1A",
      }));
      if (edited.status !== "applied") return false;
      const reordered = applyCatalogCommand(edited.state, command(edited.state, {
        type: "reorder-criteria",
        packId: PACK_ID,
        subjectId: "subject-music",
        criterionIds: ["criterion-2", "criterion-1"],
      }));
      return reordered.status === "applied"
        && reordered.pack.subjects[0].criteria.map((item) => item.id).join(",")
          === "criterion-2,criterion-1"
        && reordered.pack.subjects[0].criteria[1].text === "Texto actualizado";
    }),
    check("basic knowledge metadata relations and order can be edited", () => {
      const first = createKnowledgeState();
      const second = addKnowledge(first, "knowledge-2", ["criterion-1"]);
      const edited = applyCatalogCommand(second, command(second, {
        type: "update-basic-knowledge",
        packId: PACK_ID,
        subjectId: "subject-music",
        basicKnowledgeId: "knowledge-1",
        text: "Saber actualizado",
        externalCode: "SAB-1",
      }));
      if (edited.status !== "applied") return false;
      const related = applyCatalogCommand(edited.state, command(edited.state, {
        type: "set-basic-knowledge-criteria",
        packId: PACK_ID,
        subjectId: "subject-music",
        basicKnowledgeId: "knowledge-1",
        criterionIds: ["criterion-2", "criterion-1"],
      }));
      if (related.status !== "applied") return false;
      const reordered = applyCatalogCommand(related.state, command(related.state, {
        type: "reorder-basic-knowledge",
        packId: PACK_ID,
        subjectId: "subject-music",
        basicKnowledgeIds: ["knowledge-2", "knowledge-1"],
      }));
      return reordered.status === "applied"
        && reordered.pack.subjects[0].basicKnowledge.map((item) => item.id).join(",")
          === "knowledge-2,knowledge-1"
        && reordered.pack.subjects[0].basicKnowledge[1].criterionIds.join(",")
          === "criterion-2,criterion-1"
        && edited.pack.subjects[0].basicKnowledge[0].sourceVersion
          === `manual-r${second.revision + 1}`
        && related.pack.subjects[0].basicKnowledge[0].sourceVersion
          === `manual-r${edited.state.revision + 1}`
        && reordered.pack.subjects[0].basicKnowledge[1].sourceVersion
          === related.pack.subjects[0].basicKnowledge[0].sourceVersion;
    }),
    check("ordinary tracking is reported as a removal dependency", () => {
      const state = createKnowledgeState();
      const preview = previewCatalogCommand(
        state,
        command(state, {
          type: "request-remove-basic-knowledge",
          packId: PACK_ID,
          subjectId: "subject-music",
          basicKnowledgeId: "knowledge-1",
        }),
        completeDependencyContext([createProfile(true)], [])
      );
      return preview.dependencies.some(
        (item) => item.kind === "ordinary-tracking-basic-knowledge"
      );
    }),
    check("manual package entity versions follow the complete editing sequence", () =>
      verifyManualVersionSequence()),
    check("an old successful operation retries idempotently after later edits", () =>
      verifyDurableRetryAfterLaterOperations()),
    check("an incomplete dependency context is explicitly blocking", () => {
      const state = createSubjectState();
      const preview = previewCatalogCommand(state, command(state, {
        type: "request-remove-subject",
        packId: PACK_ID,
        subjectId: "subject-music",
      }), {
        inspectedSources: ["profiles"],
        profiles: [],
      });
      return !preview.canApply
        && preview.conflicts.some((item) => item.code === "dependency-context-incomplete")
        && preview.conflicts.some((item) => item.code === "decision-required");
    }),
    check("duplicate dependencies are collapsed with explicit origins", () => {
      const state = createKnowledgeState();
      const link = createActionLink();
      const preview = previewCatalogCommand(state, command(state, {
        type: "request-remove-basic-knowledge",
        packId: PACK_ID,
        subjectId: "subject-music",
        basicKnowledgeId: "knowledge-1",
      }), completeDependencyContext([], [link, link]));
      const matches = preview.dependencies.filter(
        (item) => item.kind === "action-link-basic-knowledge"
      );
      return matches.length === 1
        && matches[0].origin === "action-links"
        && matches[0].sourceId === link.id
        && matches[0].targetId === "knowledge-1";
    }),
    check("deep-frozen inputs support every catalog command without mutation", () =>
      verifyAllCommandsWithDeepFrozenInputs()),
    check("preview collections and nested values are detached from all inputs", () =>
      verifyPreviewOutputIsolation()),
    check("preview and apply agree for every applicable command", () =>
      verifyPreviewApplyEquivalence()),
    check("external codes with surrounding spaces are detected as duplicates", () => {
      const first = addCriterion(createSubjectState(), "criterion-1", "MUS-1", "Primero");
      const preview = previewCatalogCommand(first, addCriterionCommand(
        first,
        "subject-music",
        "criterion-2",
        "  mus-1  ",
        "Segundo"
      ));
      return preview.conflicts.some((item) => item.code === "duplicate-external-code");
    }),
    check("duplicate criterion relations are rejected explicitly", () => {
      const state = createCriterionState();
      const preview = previewCatalogCommand(
        state,
        addKnowledgeCommand(state, "knowledge-1", ["criterion-1", "criterion-1"])
      );
      return !preview.canApply
        && preview.conflicts.some((item) => item.code === "duplicate-id");
    }),
    check("blank stable IDs names and texts are rejected", () => verifyBlankValuesRejected()),
    check("the final applied pack also passes the shared curriculum validator", () => {
      const state = createKnowledgeState();
      return state.pack !== null && validatePackWithSharedService(state.pack);
    }),
    check("manual entity source versions cannot point to a future package revision", () => {
      const state = createCriterionState();
      const subject = state.pack!.subjects[0];
      const invalid: CurriculumCatalogEditorState = {
        ...state,
        pack: {
          ...state.pack!,
          subjects: [{
            ...subject,
            criteria: [{ ...subject.criteria[0], sourceVersion: "manual-r999" }],
          }],
        },
      };
      const preview = previewCatalogCommand(invalid, command(invalid, {
        type: "update-pack-metadata",
        packId: PACK_ID,
        name: "No debe aplicarse",
      }));
      return !preview.canApply
        && preview.conflicts.some((item) =>
          item.path.includes("sourceVersion") && item.code === "invalid-result"
        );
    }),
  ];
}

function createPackCommand(): Extract<CurriculumCatalogCommand, { type: "create-manual-pack" }> {
  return {
    type: "create-manual-pack",
    operationId: "create-pack",
    expectedVersion: 0,
    occurredAt: INSTANT,
    packId: PACK_ID,
    name: "Catálogo manual",
  };
}

function command<T extends Omit<CurriculumCatalogCommand, "operationId" | "expectedVersion" | "occurredAt">>(
  state: CurriculumCatalogEditorState,
  body: T
): T & { readonly operationId: string; readonly expectedVersion: number; readonly occurredAt: string } {
  return {
    ...body,
    operationId: `${body.type}-${state.revision + 1}`,
    expectedVersion: state.revision,
    occurredAt: INSTANT,
  };
}

function addSubjectCommand(
  state: CurriculumCatalogEditorState,
  id: string,
  name: string,
  operationId = `add-${id}`
): Extract<CurriculumCatalogCommand, { type: "add-subject" }> {
  return {
    type: "add-subject",
    operationId,
    expectedVersion: state.revision,
    occurredAt: INSTANT,
    packId: PACK_ID,
    subject: { id, name },
  };
}

function addCriterionCommand(
  state: CurriculumCatalogEditorState,
  subjectId: string,
  id: string,
  externalCode: string,
  text: string
): Extract<CurriculumCatalogCommand, { type: "add-criterion" }> {
  return {
    type: "add-criterion",
    operationId: `add-${id}`,
    expectedVersion: state.revision,
    occurredAt: INSTANT,
    packId: PACK_ID,
    subjectId,
    criterion: { id, externalCode, text },
  };
}

function addKnowledgeCommand(
  state: CurriculumCatalogEditorState,
  id: string,
  criterionIds: readonly string[]
): Extract<CurriculumCatalogCommand, { type: "add-basic-knowledge" }> {
  return {
    type: "add-basic-knowledge",
    operationId: `add-${id}`,
    expectedVersion: state.revision,
    occurredAt: INSTANT,
    packId: PACK_ID,
    subjectId: "subject-music",
    basicKnowledge: { id, text: `Saber ${id}`, criterionIds },
  };
}

function createPackState(): CurriculumCatalogEditorState {
  return requireApplied(
    applyCatalogCommand(createEmptyCurriculumCatalogEditorState(), createPackCommand())
  );
}

function createSubjectState(): CurriculumCatalogEditorState {
  return addSubject(createPackState(), "subject-music", "Música");
}

function createTwoSubjectState(): CurriculumCatalogEditorState {
  return addSubject(createSubjectState(), "subject-math", "Matemáticas");
}

function createCriterionState(): CurriculumCatalogEditorState {
  return addCriterion(createSubjectState(), "criterion-1", "MUS-1", "Primer criterio");
}

function createTwoCriterionState(): CurriculumCatalogEditorState {
  return addCriterion(createCriterionState(), "criterion-2", "MUS-2", "Segundo criterio");
}

function createKnowledgeState(): CurriculumCatalogEditorState {
  return addKnowledge(createTwoCriterionState(), "knowledge-1", ["criterion-1"]);
}

function createCrossSubjectCriterionState(): CurriculumCatalogEditorState {
  const subjects = createTwoSubjectState();
  const music = addCriterion(subjects, "criterion-music", "MUS-1", "Criterio musical", "subject-music");
  return addCriterion(music, "criterion-math", "MAT-1", "Criterio matemático", "subject-math");
}

function addSubject(
  state: CurriculumCatalogEditorState,
  id: string,
  name: string
): CurriculumCatalogEditorState {
  return requireApplied(applyCatalogCommand(state, addSubjectCommand(state, id, name)));
}

function addCriterion(
  state: CurriculumCatalogEditorState,
  id: string,
  code: string,
  text: string,
  subjectId = "subject-music"
): CurriculumCatalogEditorState {
  return requireApplied(applyCatalogCommand(
    state,
    addCriterionCommand(state, subjectId, id, code, text)
  ));
}

function addKnowledge(
  state: CurriculumCatalogEditorState,
  id: string,
  criterionIds: readonly string[]
): CurriculumCatalogEditorState {
  return requireApplied(applyCatalogCommand(state, addKnowledgeCommand(state, id, criterionIds)));
}

function requireApplied(result: ReturnType<typeof applyCatalogCommand>): CurriculumCatalogEditorState {
  if (result.status !== "applied") throw new Error("Expected the catalog command to apply.");
  return result.state;
}

function createProfile(withOrdinaryRule: boolean): CurriculumProfile {
  return {
    id: "profile-1",
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    classroomId: "classroom-1",
    packId: PACK_ID,
    provenance: { kind: "manual" },
    status: "configured",
    selectedSubjectIds: ["subject-music"],
    ordinaryTracking: {
      enabled: withOrdinaryRule,
      minimumSessionDurationMinutes: 10,
      rules: withOrdinaryRule ? [{
        id: "ordinary-rule-1",
        subjectId: "subject-music",
        basicKnowledgeId: "knowledge-1",
        observableActionId: "action-positive",
        contraryActionIds: ["action-negative"],
        enabled: true,
      }] : [],
    },
    createdAt: INSTANT,
    updatedAt: INSTANT,
  };
}

function createActionLink(): ActionCurricularLink {
  return {
    id: "link-1",
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    actionId: "action-1",
    profileId: "profile-1",
    subjectId: "subject-music",
    basicKnowledgeId: "knowledge-1",
    resolvedCriterionIds: ["criterion-1"],
    effect: "positive",
    recordingMode: "manual",
    enabled: true,
    createdAt: INSTANT,
    updatedAt: INSTANT,
  };
}

function completeDependencyContext(
  profiles: readonly CurriculumProfile[],
  actionLinks: readonly ActionCurricularLink[]
): CurriculumCatalogDependencyContext {
  return {
    inspectedSources: ["profiles", "action-links", "ordinary-tracking"],
    profiles,
    actionLinks,
  };
}

function verifyManualVersionSequence(): boolean {
  const created = applyCatalogCommand(
    createEmptyCurriculumCatalogEditorState(),
    createPackCommand()
  );
  if (created.status !== "applied") return false;
  const withSubject = applyCatalogCommand(
    created.state,
    addSubjectCommand(created.state, "subject-music", "Música")
  );
  if (withSubject.status !== "applied") return false;
  const withA = applyCatalogCommand(withSubject.state, addCriterionCommand(
    withSubject.state,
    "subject-music",
    "criterion-a",
    "MUS-A",
    "Texto A"
  ));
  if (withA.status !== "applied") return false;
  const criterionASnapshot = JSON.stringify(withA.pack.subjects[0].criteria[0]);
  const withB = applyCatalogCommand(withA.state, addCriterionCommand(
    withA.state,
    "subject-music",
    "criterion-b",
    "MUS-B",
    "Texto B"
  ));
  if (withB.status !== "applied") return false;
  const renamed = applyCatalogCommand(withB.state, command(withB.state, {
    type: "update-pack-metadata",
    packId: PACK_ID,
    name: "Catálogo manual renombrado",
  }));
  if (renamed.status !== "applied") return false;
  const editedB = applyCatalogCommand(renamed.state, command(renamed.state, {
    type: "update-criterion",
    packId: PACK_ID,
    subjectId: "subject-music",
    criterionId: "criterion-b",
    text: "Texto B actualizado",
  }));
  if (editedB.status !== "applied") return false;

  const packs = [created.pack, withSubject.pack, withA.pack, withB.pack, renamed.pack, editedB.pack];
  const finalCriteria = editedB.pack.subjects[0].criteria;
  return packs.every((pack, index) =>
      pack.packageVersion === `manual-r${index + 1}`
      && validatePackWithSharedService(pack)
    )
    && withA.pack.subjects[0].criteria[0].sourceVersion === "manual-r3"
    && withB.pack.subjects[0].criteria[0].sourceVersion === "manual-r3"
    && withB.pack.subjects[0].criteria[1].sourceVersion === "manual-r4"
    && renamed.pack.subjects[0].criteria[0].sourceVersion === "manual-r3"
    && renamed.pack.subjects[0].criteria[1].sourceVersion === "manual-r4"
    && finalCriteria[0].sourceVersion === "manual-r3"
    && finalCriteria[1].sourceVersion === "manual-r6"
    && JSON.stringify(finalCriteria[0]) === criterionASnapshot
    && editedB.state.revision === 6;
}

function verifyDurableRetryAfterLaterOperations(): boolean {
  const state = createPackState();
  const original = addSubjectCommand(
    state,
    "subject-music",
    "Música",
    "durable-operation"
  );
  const first = applyCatalogCommand(state, original);
  if (first.status !== "applied") return false;
  const later = applyCatalogCommand(first.state, command(first.state, {
    type: "update-subject",
    packId: PACK_ID,
    subjectId: "subject-music",
    name: "Educación musical",
  }));
  if (later.status !== "applied") return false;
  const serializedState = JSON.parse(JSON.stringify(later.state)) as CurriculumCatalogEditorState;
  const retry = applyCatalogCommand(serializedState, {
    ...original,
    occurredAt: "2028-01-01T00:00:00.000Z",
  });
  return retry.status === "idempotent"
    && retry.state.revision === later.state.revision
    && retry.state.pack?.subjects[0].name === "Educación musical"
    && retry.state.appliedOperations.length === later.state.appliedOperations.length
    && retry.state.appliedOperations.some((item) =>
      item.operationId === "durable-operation" && item.commandFingerprint.length > 0
    );
}

function verifyAllCommandsWithDeepFrozenInputs(): boolean {
  const result = exerciseApplicableCommands(true);
  if (!result.passed || !result.state.pack) return false;
  const context = deepFreeze(completeDependencyContext([], []));
  const removals: CurriculumCatalogCommand[] = [
    command(result.state, {
      type: "request-remove-subject",
      packId: PACK_ID,
      subjectId: "subject-math",
    }),
    command(result.state, {
      type: "request-remove-criterion",
      packId: PACK_ID,
      subjectId: "subject-music",
      criterionId: "criterion-1",
    }),
    command(result.state, {
      type: "request-remove-basic-knowledge",
      packId: PACK_ID,
      subjectId: "subject-music",
      basicKnowledgeId: "knowledge-1",
    }),
  ];
  const state = deepFreeze(result.state);
  const snapshot = JSON.stringify({ state, context, removals });
  const rejected = removals.every((removal) => {
    const frozenCommand = deepFreeze(removal);
    const preview = previewCatalogCommand(state, frozenCommand, context);
    const applied = applyCatalogCommand(state, frozenCommand, context);
    return !preview.canApply && applied.status === "rejected";
  });
  return rejected && JSON.stringify({ state, context, removals }) === snapshot;
}

function verifyPreviewApplyEquivalence(): boolean {
  return exerciseApplicableCommands(false).passed;
}

function verifyPreviewOutputIsolation(): boolean {
  const state = createSubjectState();
  const input = addCriterionCommand(
    state,
    "subject-music",
    "criterion-1",
    "MUS-1",
    "Texto"
  );
  const preview = previewCatalogCommand(state, input);
  if (!preview.proposedPack || preview.changes.length === 0) return false;
  const originalSnapshot = JSON.stringify({ state, input });
  const mutablePack = preview.proposedPack as unknown as {
    subjects: Array<{ criteria: Array<{ text: string }> }>;
  };
  const mutableChanges = preview.changes as unknown as Array<{ after: unknown }>;
  mutablePack.subjects[0].criteria[0].text = "Alterado fuera";
  mutableChanges[0].after = { changed: true };
  (preview.warnings as unknown as Array<unknown>).push({ external: true });
  return JSON.stringify({ state, input }) === originalSnapshot
    && state.pack?.subjects[0].criteria.length === 0;
}

function exerciseApplicableCommands(freezeInputs: boolean): {
  readonly passed: boolean;
  readonly state: CurriculumCatalogEditorState;
} {
  let state = createEmptyCurriculumCatalogEditorState();
  const factories: Array<(current: CurriculumCatalogEditorState) => CurriculumCatalogCommand> = [
    () => createPackCommand(),
    (current) => addSubjectCommand(current, "subject-music", "Música"),
    (current) => command(current, {
      type: "update-pack-metadata",
      packId: PACK_ID,
      name: "Catálogo actualizado",
      region: "España",
    }),
    (current) => command(current, {
      type: "update-subject",
      packId: PACK_ID,
      subjectId: "subject-music",
      name: "Educación musical",
      externalCode: "MUS",
    }),
    (current) => addCriterionCommand(current, "subject-music", "criterion-1", "MUS-1", "Texto 1"),
    (current) => addCriterionCommand(current, "subject-music", "criterion-2", "MUS-2", "Texto 2"),
    (current) => command(current, {
      type: "reorder-criteria",
      packId: PACK_ID,
      subjectId: "subject-music",
      criterionIds: ["criterion-2", "criterion-1"],
    }),
    (current) => addKnowledgeCommand(current, "knowledge-1", ["criterion-1"]),
    (current) => addKnowledgeCommand(current, "knowledge-2", ["criterion-2"]),
    (current) => command(current, {
      type: "update-criterion",
      packId: PACK_ID,
      subjectId: "subject-music",
      criterionId: "criterion-1",
      text: "Texto 1 actualizado",
      title: "Título 1",
    }),
    (current) => command(current, {
      type: "update-basic-knowledge",
      packId: PACK_ID,
      subjectId: "subject-music",
      basicKnowledgeId: "knowledge-1",
      text: "Saber 1 actualizado",
    }),
    (current) => command(current, {
      type: "set-basic-knowledge-criteria",
      packId: PACK_ID,
      subjectId: "subject-music",
      basicKnowledgeId: "knowledge-1",
      criterionIds: ["criterion-1", "criterion-2"],
    }),
    (current) => command(current, {
      type: "reorder-basic-knowledge",
      packId: PACK_ID,
      subjectId: "subject-music",
      basicKnowledgeIds: ["knowledge-2", "knowledge-1"],
    }),
    (current) => addSubjectCommand(current, "subject-math", "Matemáticas"),
    (current) => command(current, {
      type: "reorder-subjects",
      packId: PACK_ID,
      subjectIds: ["subject-math", "subject-music"],
    }),
  ];

  for (const factory of factories) {
    const commandInput = factory(state);
    const stateSnapshot = JSON.stringify(state);
    const commandSnapshot = JSON.stringify(commandInput);
    const inputState = freezeInputs ? deepFreeze(state) : state;
    const inputCommand = freezeInputs ? deepFreeze(commandInput) : commandInput;
    const preview = previewCatalogCommand(inputState, inputCommand);
    const applied = applyCatalogCommand(inputState, inputCommand);
    if (
      !preview.canApply
      || applied.status !== "applied"
      || JSON.stringify(preview.proposedPack) !== JSON.stringify(applied.pack)
      || JSON.stringify(preview.affectedEntities) !== JSON.stringify(applied.preview.affectedEntities)
      || JSON.stringify(preview.conflicts) !== JSON.stringify(applied.preview.conflicts)
      || JSON.stringify(state) !== stateSnapshot
      || JSON.stringify(commandInput) !== commandSnapshot
    ) {
      return { passed: false, state };
    }
    state = applied.state;
  }
  return { passed: true, state };
}

function verifyBlankValuesRejected(): boolean {
  const empty = createEmptyCurriculumCatalogEditorState();
  const blankPackId = previewCatalogCommand(empty, { ...createPackCommand(), packId: "   " });
  const blankName = previewCatalogCommand(empty, { ...createPackCommand(), name: "   " });
  const pack = createPackState();
  const blankSubject = previewCatalogCommand(pack, addSubjectCommand(
    pack,
    "   ",
    "   ",
    "blank-subject"
  ));
  const subject = createSubjectState();
  const blankCriterion = previewCatalogCommand(subject, addCriterionCommand(
    subject,
    "subject-music",
    "   ",
    "MUS-X",
    "   "
  ));
  const criterion = createCriterionState();
  const blankKnowledge = previewCatalogCommand(criterion, addKnowledgeCommand(
    criterion,
    "   ",
    ["criterion-1"]
  ));
  return [blankPackId, blankName, blankSubject, blankCriterion, blankKnowledge]
    .every((preview) => !preview.canApply);
}

function validatePackWithSharedService(pack: CurriculumPack): boolean {
  const data: VersionedCurriculumData = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "catalog-editor-test-class",
      status: "inactive",
      activeProfileId: null,
    },
    packs: [pack],
    profiles: [],
    actionLinks: [],
  };
  return validateCurriculumData(data, []).valid;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}

function verifyNoBrowserGlobalAccess(): boolean {
  const globalObject = globalThis as typeof globalThis & Record<string, unknown>;
  const names = ["window", "localStorage", "navigator"] as const;
  const descriptors = new Map(names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalObject, name),
  ]));
  let accesses = 0;
  try {
    names.forEach((name) => {
      const descriptor = descriptors.get(name);
      if (descriptor && !descriptor.configurable) return;
      Object.defineProperty(globalObject, name, {
        configurable: true,
        get: () => { accesses += 1; return undefined; },
      });
    });
    const state = createPackState();
    previewCatalogCommand(state, addSubjectCommand(state, "subject-test", "Prueba"));
    return accesses === 0;
  } finally {
    names.forEach((name) => restoreGlobalProperty(
      globalObject,
      name,
      descriptors.get(name)
    ));
  }
}

function restoreGlobalProperty(
  target: object,
  name: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

function check(
  name: string,
  predicate: () => boolean
): CurriculumCatalogEditorDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
