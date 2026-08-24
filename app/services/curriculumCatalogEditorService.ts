import {
  CURRICULUM_SCHEMA_VERSION,
  type BasicKnowledge,
  type Criterion,
  type CurriculumCatalogAffectedEntity,
  type CurriculumCatalogApplyResult,
  type CurriculumCatalogChange,
  type CurriculumCatalogCommand,
  type CurriculumCatalogCommandPreview,
  type CurriculumCatalogConflict,
  type CurriculumCatalogDependency,
  type CurriculumCatalogDependencyContext,
  type CurriculumCatalogDependencySource,
  type CurriculumCatalogEditorState,
  type CurriculumCatalogWarning,
  type CurriculumPack,
  type CurriculumSubject,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { validateCurriculumData } from "./curriculumValidationService";
import {
  createCurriculumDeterministicFingerprint,
  serializeCurriculumFingerprintValue,
} from "./curriculumFingerprintService";

const EMPTY_DEPENDENCY_CONTEXT: CurriculumCatalogDependencyContext = {
  inspectedSources: [],
};

export function createEmptyCurriculumCatalogEditorState(): CurriculumCatalogEditorState {
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    revision: 0,
    pack: null,
    appliedOperations: [],
  };
}

export function previewCatalogCommand(
  state: CurriculumCatalogEditorState,
  command: CurriculumCatalogCommand,
  context: CurriculumCatalogDependencyContext = EMPTY_DEPENDENCY_CONTEXT
): CurriculumCatalogCommandPreview {
  const fingerprint = fingerprintCommand(command);
  const base = {
    operationId: command.operationId,
    commandFingerprint: fingerprint,
    expectedVersion: command.expectedVersion,
  };
  const stateConflicts = validateEditorState(state);
  if (stateConflicts.length > 0) {
    return previewResult(base, state.revision, state.pack, [], [], [], [], stateConflicts);
  }

  const operationId = command.operationId.trim();
  if (!operationId) {
    return previewResult(base, state.revision, state.pack, [], [], [], [], [conflict(
      "invalid-operation-id",
      "operationId",
      "A stable operation identifier is required."
    )]);
  }

  const previousOperation = state.appliedOperations.find(
    (operation) => operation.operationId === operationId
  );
  if (previousOperation) {
    if (previousOperation.commandFingerprint === fingerprint) {
      return previewResult(
        base,
        previousOperation.resultingVersion,
        state.pack,
        [],
        [],
        [],
        [],
        [],
        "idempotent"
      );
    }
    return previewResult(base, state.revision, state.pack, [], [], [], [], [conflict(
      "operation-id-collision",
      "operationId",
      "This operation identifier was already used with different content."
    )]);
  }

  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
    return previewResult(base, state.revision, state.pack, [], [], [], [], [conflict(
      "stale-version",
      "expectedVersion",
      "The expected catalog version is invalid."
    )]);
  }
  if (command.expectedVersion !== state.revision) {
    return previewResult(base, state.revision, state.pack, [], [], [], [], [conflict(
      "stale-version",
      "expectedVersion",
      `Expected version ${command.expectedVersion} does not match current version ${state.revision}.`
    )]);
  }

  const occurredAt = normalizeInstant(command.occurredAt);
  if (!occurredAt) {
    return previewResult(base, state.revision, state.pack, [], [], [], [], [conflict(
      "invalid-date",
      "occurredAt",
      "A valid informative operation instant is required."
    )]);
  }

  const proposal = proposeCatalogChange(state, command, context, occurredAt);
  const conflicts = [...proposal.conflicts];
  if (proposal.pack) conflicts.push(...validateManualPack(proposal.pack));
  const warnings = proposal.pack
    ? deduplicateWarnings([...proposal.warnings, ...collectReviewWarnings(proposal.pack)])
    : proposal.warnings;

  return previewResult(
    base,
    state.revision + 1,
    proposal.pack,
    proposal.changes,
    proposal.affectedEntities,
    proposal.dependencies,
    warnings,
    deduplicateConflicts(conflicts)
  );
}

export function applyCatalogCommand(
  state: CurriculumCatalogEditorState,
  command: CurriculumCatalogCommand,
  context: CurriculumCatalogDependencyContext = EMPTY_DEPENDENCY_CONTEXT
): CurriculumCatalogApplyResult {
  const preview = previewCatalogCommand(state, command, context);
  if (preview.status === "idempotent") {
    return { status: "idempotent", state, pack: state.pack, preview };
  }
  if (!preview.canApply || !preview.proposedPack) {
    return {
      status: "rejected",
      reason: preview.conflicts.some((item) => item.code === "invalid-state")
        ? "invalid-state"
        : "blocked",
      state,
      preview,
    };
  }

  const nextState: CurriculumCatalogEditorState = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    revision: preview.resultingVersion,
    pack: cloneJsonValue(preview.proposedPack),
    appliedOperations: [
      ...state.appliedOperations.map(cloneJsonValue),
      {
        operationId: command.operationId.trim(),
        commandFingerprint: preview.commandFingerprint,
        resultingVersion: preview.resultingVersion,
      },
    ],
  };
  const finalConflicts = validateEditorState(nextState);
  if (finalConflicts.length > 0) {
    return {
      status: "rejected",
      reason: "invalid-state",
      state,
      preview: {
        ...preview,
        status: "blocked",
        canApply: false,
        conflicts: finalConflicts,
        summary: createSummary(preview.changes, preview.dependencies, preview.warnings, finalConflicts),
      },
    };
  }

  return {
    status: "applied",
    state: nextState,
    pack: nextState.pack!,
    preview,
  };
}

type Proposal = {
  readonly pack: CurriculumPack | null;
  readonly changes: readonly CurriculumCatalogChange[];
  readonly affectedEntities: readonly CurriculumCatalogAffectedEntity[];
  readonly dependencies: readonly CurriculumCatalogDependency[];
  readonly warnings: readonly CurriculumCatalogWarning[];
  readonly conflicts: readonly CurriculumCatalogConflict[];
};

function proposeCatalogChange(
  state: CurriculumCatalogEditorState,
  command: CurriculumCatalogCommand,
  context: CurriculumCatalogDependencyContext,
  occurredAt: string
): Proposal {
  if (command.type === "create-manual-pack") {
    return proposeCreateManualPack(state, command, occurredAt);
  }
  const packResult = requireCommandPack(state.pack, command.packId);
  if (packResult.conflict) return blockedProposal(state.pack, packResult.conflict);
  const pack = packResult.pack!;
  const nextVersion = state.revision + 1;

  switch (command.type) {
    case "update-pack-metadata": {
      const name = command.name.trim();
      if (!name) return blockedProposal(pack, conflict("invalid-name", "name", "Pack name is required."));
      const updated = finalizePack(updatePackMetadata(pack, command, name), nextVersion, occurredAt);
      return changedProposal(pack, updated, "update", "pack", pack.id);
    }
    case "add-subject": {
      const subject = createSubject(command.subject);
      if (!subject) return blockedProposal(pack, conflict(
        command.subject.id.trim() ? "invalid-name" : "duplicate-id",
        "subject",
        "A subject requires a stable identifier and a name."
      ));
      if (findEntity(pack, subject.id)) {
        return blockedProposal(pack, conflict("duplicate-id", "subject.id", "The identifier is already in use."));
      }
      const updated = finalizePack({ ...pack, subjects: [...pack.subjects, subject] }, nextVersion, occurredAt);
      return changedProposal(pack, updated, "create", "subject", subject.id);
    }
    case "update-subject": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const name = command.name.trim();
      if (!name) return blockedProposal(pack, conflict("invalid-name", "name", "Subject name is required."));
      const nextSubject = updateSubjectMetadata(subject, name, command.externalCode);
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "update", "subject", subject.id);
    }
    case "reorder-subjects": {
      const ordered = reorderExactly(pack.subjects, command.subjectIds);
      if (!ordered) return invalidOrder(pack, "subjectIds");
      const updated = finalizePack({ ...pack, subjects: ordered }, nextVersion, occurredAt);
      return changedProposal(pack, updated, "reorder", "pack", pack.id);
    }
    case "add-criterion": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const criterion = createCriterion(command.criterion, nextVersion);
      if (!criterion) return blockedProposal(pack, conflict(
        command.criterion.id.trim() ? "invalid-text" : "duplicate-id",
        "criterion",
        "A criterion requires a stable identifier and non-empty text."
      ));
      if (findEntity(pack, criterion.id)) {
        return blockedProposal(pack, conflict("duplicate-id", "criterion.id", "The identifier is already in use."));
      }
      const duplicateCode = findDuplicateExternalCode(subject.criteria, criterion.externalCode);
      if (duplicateCode) return duplicateExternalCode(pack, "criterion.externalCode", duplicateCode.id);
      const nextSubject = { ...subject, criteria: [...subject.criteria, criterion] };
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "create", "criterion", criterion.id);
    }
    case "update-criterion": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const criterion = subject.criteria.find((candidate) => candidate.id === command.criterionId);
      if (!criterion) return entityMissing(pack, "criterionId", command.criterionId);
      const text = command.text.trim();
      if (!text) return blockedProposal(pack, conflict("invalid-text", "text", "Criterion text is required."));
      const nextCriterion = updateCriterionMetadata(
        criterion,
        text,
        command.externalCode,
        command.title,
        nextVersion
      );
      const duplicateCode = findDuplicateExternalCode(
        subject.criteria.filter((candidate) => candidate.id !== criterion.id),
        nextCriterion.externalCode
      );
      if (duplicateCode) return duplicateExternalCode(pack, "externalCode", duplicateCode.id);
      const nextSubject = {
        ...subject,
        criteria: subject.criteria.map((candidate) =>
          candidate.id === criterion.id ? nextCriterion : candidate
        ),
      };
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "update", "criterion", criterion.id);
    }
    case "reorder-criteria": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const ordered = reorderExactly(subject.criteria, command.criterionIds);
      if (!ordered) return invalidOrder(pack, "criterionIds");
      const updated = finalizePack(
        replaceSubject(pack, { ...subject, criteria: ordered }),
        nextVersion,
        occurredAt
      );
      return changedProposal(pack, updated, "reorder", "subject", subject.id);
    }
    case "add-basic-knowledge": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const knowledge = createBasicKnowledge(command.basicKnowledge, nextVersion);
      if (!knowledge) return blockedProposal(pack, conflict(
        command.basicKnowledge.id.trim() ? "invalid-text" : "duplicate-id",
        "basicKnowledge",
        "Basic knowledge requires a stable identifier and non-empty text."
      ));
      if (findEntity(pack, knowledge.id)) {
        return blockedProposal(pack, conflict("duplicate-id", "basicKnowledge.id", "The identifier is already in use."));
      }
      const referenceConflicts = validateCriterionReferences(pack, subject, knowledge.criterionIds);
      if (referenceConflicts.length > 0) return blockedProposal(pack, ...referenceConflicts);
      const duplicateCode = findDuplicateExternalCode(subject.basicKnowledge, knowledge.externalCode);
      if (duplicateCode) return duplicateExternalCode(pack, "basicKnowledge.externalCode", duplicateCode.id);
      const nextSubject = {
        ...subject,
        basicKnowledge: [...subject.basicKnowledge, knowledge],
      };
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "create", "basic-knowledge", knowledge.id);
    }
    case "update-basic-knowledge": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const knowledge = subject.basicKnowledge.find(
        (candidate) => candidate.id === command.basicKnowledgeId
      );
      if (!knowledge) return entityMissing(pack, "basicKnowledgeId", command.basicKnowledgeId);
      const text = command.text.trim();
      if (!text) return blockedProposal(pack, conflict("invalid-text", "text", "Basic knowledge text is required."));
      const nextKnowledge = updateBasicKnowledgeMetadata(
        knowledge,
        text,
        command.externalCode,
        nextVersion
      );
      const duplicateCode = findDuplicateExternalCode(
        subject.basicKnowledge.filter((candidate) => candidate.id !== knowledge.id),
        nextKnowledge.externalCode
      );
      if (duplicateCode) return duplicateExternalCode(pack, "externalCode", duplicateCode.id);
      const nextSubject = {
        ...subject,
        basicKnowledge: subject.basicKnowledge.map((candidate) =>
          candidate.id === knowledge.id ? nextKnowledge : candidate
        ),
      };
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "update", "basic-knowledge", knowledge.id);
    }
    case "set-basic-knowledge-criteria": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const knowledge = subject.basicKnowledge.find(
        (candidate) => candidate.id === command.basicKnowledgeId
      );
      if (!knowledge) return entityMissing(pack, "basicKnowledgeId", command.basicKnowledgeId);
      const referenceConflicts = validateCriterionReferences(pack, subject, command.criterionIds);
      if (referenceConflicts.length > 0) return blockedProposal(pack, ...referenceConflicts);
      const nextKnowledge = {
        ...knowledge,
        sourceVersion: formatManualPackageVersion(nextVersion),
        criterionIds: [...command.criterionIds],
      };
      const nextSubject = {
        ...subject,
        basicKnowledge: subject.basicKnowledge.map((candidate) =>
          candidate.id === knowledge.id ? nextKnowledge : candidate
        ),
      };
      const updated = finalizePack(replaceSubject(pack, nextSubject), nextVersion, occurredAt);
      return changedProposal(pack, updated, "update", "basic-knowledge", knowledge.id);
    }
    case "reorder-basic-knowledge": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const ordered = reorderExactly(subject.basicKnowledge, command.basicKnowledgeIds);
      if (!ordered) return invalidOrder(pack, "basicKnowledgeIds");
      const updated = finalizePack(
        replaceSubject(pack, { ...subject, basicKnowledge: ordered }),
        nextVersion,
        occurredAt
      );
      return changedProposal(pack, updated, "reorder", "subject", subject.id);
    }
    case "request-remove-subject": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const dependencies = collectSubjectDependencies(pack, subject, context);
      return removalProposal(pack, "subject", subject.id, dependencies, context);
    }
    case "request-remove-criterion": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const criterion = subject.criteria.find((candidate) => candidate.id === command.criterionId);
      if (!criterion) return entityMissing(pack, "criterionId", command.criterionId);
      const dependencies = collectCriterionDependencies(subject, criterion, context);
      return removalProposal(pack, "criterion", criterion.id, dependencies, context);
    }
    case "request-remove-basic-knowledge": {
      const subject = findSubject(pack, command.subjectId);
      if (!subject) return entityMissing(pack, "subjectId", command.subjectId);
      const knowledge = subject.basicKnowledge.find(
        (candidate) => candidate.id === command.basicKnowledgeId
      );
      if (!knowledge) return entityMissing(pack, "basicKnowledgeId", command.basicKnowledgeId);
      const dependencies = collectBasicKnowledgeDependencies(subject, knowledge, context);
      return removalProposal(pack, "basic-knowledge", knowledge.id, dependencies, context);
    }
  }

  return assertNever(command);
}

function proposeCreateManualPack(
  state: CurriculumCatalogEditorState,
  command: Extract<CurriculumCatalogCommand, { type: "create-manual-pack" }>,
  occurredAt: string
): Proposal {
  if (state.pack) {
    return blockedProposal(state.pack, conflict(
      "pack-already-exists",
      "packId",
      "A catalog pack already exists in this editor state."
    ));
  }
  const packId = command.packId.trim();
  const name = command.name.trim();
  const conflicts: CurriculumCatalogConflict[] = [];
  if (!packId) conflicts.push(conflict("duplicate-id", "packId", "A stable pack identifier is required."));
  if (!name) conflicts.push(conflict("invalid-name", "name", "Pack name is required."));
  if (conflicts.length > 0) return blockedProposal(null, ...conflicts);

  const pack: CurriculumPack = {
    id: packId,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: formatManualPackageVersion(1),
    name,
    provenance: { kind: "manual" },
    createdAt: occurredAt,
    updatedAt: occurredAt,
    subjects: [],
    ...optionalMetadata("region", command.region),
    ...optionalMetadata("scope", command.scope),
    ...optionalMetadata("stage", command.stage),
    ...optionalMetadata("course", command.course),
  };
  return changedProposal(null, pack, "create", "pack", pack.id);
}

function validateEditorState(state: CurriculumCatalogEditorState): CurriculumCatalogConflict[] {
  const conflicts: CurriculumCatalogConflict[] = [];
  if (
    state.schemaVersion !== CURRICULUM_SCHEMA_VERSION
    || !Number.isInteger(state.revision)
    || state.revision < 0
    || !Array.isArray(state.appliedOperations)
  ) {
    return [conflict("invalid-state", "state", "The catalog editor state is invalid.")];
  }
  if ((state.revision === 0) !== (state.pack === null)) {
    conflicts.push(conflict(
      "invalid-state",
      "state.pack",
      "Version zero requires no pack, and a versioned state requires a pack."
    ));
  }
  if (
    state.pack
    && state.pack.packageVersion !== formatManualPackageVersion(state.revision)
  ) {
    conflicts.push(conflict(
      "invalid-state",
      "state.pack.packageVersion",
      "Pack content version does not match the editor revision."
    ));
  }
  if (state.appliedOperations.length !== state.revision) {
    conflicts.push(conflict(
      "invalid-state",
      "state.appliedOperations",
      "Every applied revision requires exactly one operation record."
    ));
  }
  const operationIds = new Set<string>();
  state.appliedOperations.forEach((operation, index) => {
    if (
      !operation.operationId.trim()
      || operationIds.has(operation.operationId)
      || !operation.commandFingerprint
      || !Number.isInteger(operation.resultingVersion)
      || operation.resultingVersion < 1
      || operation.resultingVersion > state.revision
    ) {
      conflicts.push(conflict(
        "invalid-state",
        `appliedOperations[${index}]`,
        "Applied operation history is invalid."
      ));
    }
    operationIds.add(operation.operationId);
  });
  if (state.pack) conflicts.push(...validateManualPack(state.pack));
  return deduplicateConflicts(conflicts);
}

function validateManualPack(pack: CurriculumPack): CurriculumCatalogConflict[] {
  const conflicts: CurriculumCatalogConflict[] = [];
  const packageRevision = parseManualPackageVersion(pack.packageVersion);
  if (!pack.id.trim()) conflicts.push(conflict("invalid-result", "pack.id", "Pack ID is required."));
  if (!pack.name.trim()) conflicts.push(conflict("invalid-name", "pack.name", "Pack name is required."));
  if (pack.schemaVersion !== CURRICULUM_SCHEMA_VERSION || pack.provenance.kind !== "manual") {
    conflicts.push(conflict(
      "invalid-result",
      "pack",
      "The manual catalog pack has an incompatible schema or provenance."
    ));
  }
  if (!normalizeInstant(pack.createdAt) || !normalizeInstant(pack.updatedAt)) {
    conflicts.push(conflict("invalid-date", "pack", "Pack dates must be valid instants."));
  }
  pack.subjects.forEach((subject, subjectIndex) => {
    if (!subject.id.trim()) conflicts.push(conflict("duplicate-id", `subjects[${subjectIndex}].id`, "Subject ID is required."));
    if (!subject.name.trim()) conflicts.push(conflict("invalid-name", `subjects[${subjectIndex}].name`, "Subject name is required."));
    conflicts.push(...duplicateExternalCodeConflicts(subject.criteria, `subjects[${subjectIndex}].criteria`));
    conflicts.push(...duplicateExternalCodeConflicts(subject.basicKnowledge, `subjects[${subjectIndex}].basicKnowledge`));
    subject.criteria.forEach((criterion, criterionIndex) => {
      if (!criterion.text.trim()) conflicts.push(conflict("invalid-text", `subjects[${subjectIndex}].criteria[${criterionIndex}].text`, "Criterion text is required."));
      if (!isValidManualEntitySourceVersion(criterion.sourceVersion, packageRevision)) {
        conflicts.push(conflict(
          "invalid-result",
          `subjects[${subjectIndex}].criteria[${criterionIndex}].sourceVersion`,
          "Manual criterion source version must identify an existing revision of this pack."
        ));
      }
    });
    subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
      if (!knowledge.text.trim()) conflicts.push(conflict("invalid-text", `subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].text`, "Basic knowledge text is required."));
      if (!isValidManualEntitySourceVersion(knowledge.sourceVersion, packageRevision)) {
        conflicts.push(conflict(
          "invalid-result",
          `subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].sourceVersion`,
          "Manual basic knowledge source version must identify an existing revision of this pack."
        ));
      }
      conflicts.push(...validateCriterionReferences(pack, subject, knowledge.criterionIds).map((item) => ({
        ...item,
        path: `subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].${item.path}`,
      })));
    });
  });

  const validationData: VersionedCurriculumData = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "curriculum-catalog-editor-validation",
      status: "inactive",
      activeProfileId: null,
    },
    packs: [pack],
    profiles: [],
    actionLinks: [],
  };
  const validation = validateCurriculumData(validationData, []);
  validation.issues.forEach((item) => conflicts.push(conflict(
    "invalid-result",
    item.path,
    item.message
  )));
  return deduplicateConflicts(conflicts);
}

function validateCriterionReferences(
  pack: CurriculumPack,
  subject: CurriculumSubject,
  criterionIds: readonly string[]
): CurriculumCatalogConflict[] {
  if (criterionIds.length === 0) {
    return [conflict(
      "missing-criterion",
      "criterionIds",
      "Basic knowledge must reference at least one explicit criterion."
    )];
  }
  const conflicts: CurriculumCatalogConflict[] = [];
  const seen = new Set<string>();
  criterionIds.forEach((criterionId, index) => {
    if (seen.has(criterionId)) {
      conflicts.push(conflict(
        "duplicate-id",
        `criterionIds[${index}]`,
        `Criterion ${criterionId} is duplicated in the relation.`
      ));
    } else if (!subject.criteria.some((criterion) => criterion.id === criterionId)) {
      const otherSubject = pack.subjects.find((candidate) =>
        candidate.id !== subject.id
        && candidate.criteria.some((criterion) => criterion.id === criterionId)
      );
      conflicts.push(conflict(
        otherSubject ? "criterion-from-another-subject" : "missing-criterion",
        `criterionIds[${index}]`,
        otherSubject
          ? `Criterion ${criterionId} belongs to subject ${otherSubject.id}.`
          : `Criterion ${criterionId} does not exist.`
      ));
    }
    seen.add(criterionId);
  });
  return conflicts;
}

function collectReviewWarnings(pack: CurriculumPack): CurriculumCatalogWarning[] {
  const warnings: CurriculumCatalogWarning[] = [];
  pack.subjects.forEach((subject, subjectIndex) => {
    pack.subjects.slice(0, subjectIndex).forEach((previous) => {
      if (normalizeComparableText(previous.name) === normalizeComparableText(subject.name)) {
        warnings.push(warning(
          "duplicate-subject-name",
          `subjects[${subjectIndex}].name`,
          `Subject ${subject.id} shares its name with ${previous.id}; their IDs remain distinct.`
        ));
      }
    });
    collectDuplicateTextWarnings(
      subject.criteria,
      "duplicate-criterion-text",
      `subjects[${subjectIndex}].criteria`,
      warnings
    );
    collectDuplicateTextWarnings(
      subject.basicKnowledge,
      "duplicate-basic-knowledge-text",
      `subjects[${subjectIndex}].basicKnowledge`,
      warnings
    );
  });
  return warnings;
}

function collectDuplicateTextWarnings(
  values: readonly { readonly id: string; readonly text: string }[],
  code: "duplicate-criterion-text" | "duplicate-basic-knowledge-text",
  path: string,
  warnings: CurriculumCatalogWarning[]
): void {
  values.forEach((value, index) => {
    const previous = values.slice(0, index).find((candidate) =>
      normalizeComparableText(candidate.text) === normalizeComparableText(value.text)
    );
    if (previous) warnings.push(warning(
      code,
      `${path}[${index}].text`,
      `${value.id} repeats the text of ${previous.id}; no automatic merge was performed.`
    ));
  });
}

function collectSubjectDependencies(
  pack: CurriculumPack,
  subject: CurriculumSubject,
  context: CurriculumCatalogDependencyContext
): CurriculumCatalogDependency[] {
  const dependencies: CurriculumCatalogDependency[] = [];
  subject.criteria.forEach((criterion, index) => dependencies.push(dependency(
    "contained-criterion",
    criterion.id,
    subject.id,
    `subjects.${subject.id}.criteria[${index}]`,
    "The subject contains this criterion."
  )));
  subject.basicKnowledge.forEach((knowledge, index) => dependencies.push(dependency(
    "contained-basic-knowledge",
    knowledge.id,
    subject.id,
    `subjects.${subject.id}.basicKnowledge[${index}]`,
    "The subject contains this basic knowledge."
  )));
  (context.profiles ?? []).forEach((profile) => {
    if (profile.packId === pack.id && profile.selectedSubjectIds.includes(subject.id)) {
      dependencies.push(dependency(
        "profile-subject",
        profile.id,
        subject.id,
        `profiles.${profile.id}.selectedSubjectIds`,
        "A curriculum profile selects this subject."
      ));
    }
    profile.ordinaryTracking.rules.forEach((rule) => {
      if (rule.subjectId === subject.id) dependencies.push(dependency(
        "ordinary-tracking-subject",
        rule.id,
        subject.id,
        `profiles.${profile.id}.ordinaryTracking.rules.${rule.id}`,
        "An ordinary tracking rule references this subject."
      ));
    });
  });
  (context.actionLinks ?? []).forEach((link) => {
    if (link.subjectId === subject.id) dependencies.push(dependency(
      "action-link-subject",
      link.id,
      subject.id,
      `actionLinks.${link.id}.subjectId`,
      "An action curricular link references this subject."
    ));
  });
  return deduplicateDependencies(dependencies);
}

function collectCriterionDependencies(
  subject: CurriculumSubject,
  criterion: Criterion,
  context: CurriculumCatalogDependencyContext
): CurriculumCatalogDependency[] {
  const dependencies: CurriculumCatalogDependency[] = [];
  subject.basicKnowledge.forEach((knowledge) => {
    if (knowledge.criterionIds.includes(criterion.id)) dependencies.push(dependency(
      "knowledge-criterion",
      knowledge.id,
      criterion.id,
      `subjects.${subject.id}.basicKnowledge.${knowledge.id}.criterionIds`,
      "Basic knowledge references this criterion."
    ));
  });
  (context.actionLinks ?? []).forEach((link) => {
    if (link.subjectId === subject.id && link.resolvedCriterionIds.includes(criterion.id)) {
      dependencies.push(dependency(
        "action-link-criterion",
        link.id,
        criterion.id,
        `actionLinks.${link.id}.resolvedCriterionIds`,
        "An action curricular link resolves this criterion."
      ));
    }
  });
  return deduplicateDependencies(dependencies);
}

function collectBasicKnowledgeDependencies(
  subject: CurriculumSubject,
  knowledge: BasicKnowledge,
  context: CurriculumCatalogDependencyContext
): CurriculumCatalogDependency[] {
  const dependencies: CurriculumCatalogDependency[] = [];
  (context.actionLinks ?? []).forEach((link) => {
    if (link.subjectId === subject.id && link.basicKnowledgeId === knowledge.id) {
      dependencies.push(dependency(
        "action-link-basic-knowledge",
        link.id,
        knowledge.id,
        `actionLinks.${link.id}.basicKnowledgeId`,
        "An action curricular link references this basic knowledge."
      ));
    }
  });
  (context.profiles ?? []).forEach((profile) => {
    profile.ordinaryTracking.rules.forEach((rule) => {
      if (rule.subjectId === subject.id && rule.basicKnowledgeId === knowledge.id) {
        dependencies.push(dependency(
          "ordinary-tracking-basic-knowledge",
          rule.id,
          knowledge.id,
          `profiles.${profile.id}.ordinaryTracking.rules.${rule.id}`,
          "An ordinary tracking rule references this basic knowledge."
        ));
      }
    });
  });
  return deduplicateDependencies(dependencies);
}

function removalProposal(
  pack: CurriculumPack,
  entityType: "subject" | "criterion" | "basic-knowledge",
  entityId: string,
  dependencies: readonly CurriculumCatalogDependency[],
  context: CurriculumCatalogDependencyContext
): Proposal {
  const contextConflicts = validateDependencyContext(context);
  const conflicts = dependencies.length > 0
    ? [conflict(
        "dependency-blocking",
        entityId,
        `Removal is blocked by ${dependencies.length} explicit dependencies.`
      )]
    : [];
  conflicts.push(...contextConflicts);
  conflicts.push(conflict(
    "decision-required",
    entityId,
    "Archiving versus permanent deletion is not decided; destructive application is outside this phase."
  ));
  return {
    pack,
    changes: [{
      kind: "request-removal",
      entityType,
      entityId,
      before: findEntity(pack, entityId)?.value ?? null,
      after: null,
    }],
    affectedEntities: [{ entityType, entityId }],
    dependencies,
    warnings: [],
    conflicts,
  };
}

function validateDependencyContext(
  context: CurriculumCatalogDependencyContext
): CurriculumCatalogConflict[] {
  const inspected = new Set(context.inspectedSources);
  const missing: CurriculumCatalogDependencySource[] = [];
  if (!inspected.has("profiles") || !Array.isArray(context.profiles)) {
    missing.push("profiles");
  }
  if (!inspected.has("action-links") || !Array.isArray(context.actionLinks)) {
    missing.push("action-links");
  }
  if (!inspected.has("ordinary-tracking") || !Array.isArray(context.profiles)) {
    missing.push("ordinary-tracking");
  }
  return missing.length === 0
    ? []
    : [conflict(
        "dependency-context-incomplete",
        "dependencyContext.inspectedSources",
        `Removal dependencies are unknown because these sources were not fully inspected: ${missing.join(", ")}.`
      )];
}

function changedProposal(
  beforePack: CurriculumPack | null,
  afterPack: CurriculumPack,
  kind: "create" | "update" | "reorder",
  entityType: "pack" | "subject" | "criterion" | "basic-knowledge",
  entityId: string
): Proposal {
  const before = beforePack ? findEntity(beforePack, entityId)?.value ?? beforePack : null;
  const after = findEntity(afterPack, entityId)?.value ?? afterPack;
  const warnings: CurriculumCatalogWarning[] = semanticSerialize(before) === semanticSerialize(after)
    ? [warning("no-content-change", entityId, "The command produces no entity content change beyond catalog metadata.")]
    : [];
  return {
    pack: afterPack,
    changes: [{ kind, entityType, entityId, before, after }],
    affectedEntities: [{ entityType, entityId }],
    dependencies: [],
    warnings,
    conflicts: [],
  };
}

function blockedProposal(
  pack: CurriculumPack | null,
  ...conflicts: CurriculumCatalogConflict[]
): Proposal {
  return {
    pack,
    changes: [],
    affectedEntities: [],
    dependencies: [],
    warnings: [],
    conflicts,
  };
}

function requireCommandPack(
  pack: CurriculumPack | null,
  packId: string
): { readonly pack: CurriculumPack | null; readonly conflict?: CurriculumCatalogConflict } {
  if (!pack) return {
    pack: null,
    conflict: conflict("pack-not-found", "packId", "No manual catalog pack exists yet."),
  };
  if (pack.id !== packId) return {
    pack,
    conflict: conflict("pack-id-mismatch", "packId", "The command targets another catalog pack."),
  };
  return { pack };
}

function createSubject(input: { readonly id: string; readonly name: string; readonly externalCode?: string }): CurriculumSubject | null {
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    criteria: [],
    basicKnowledge: [],
    ...optionalValue("externalCode", input.externalCode),
  };
}

function createCriterion(
  input: { readonly id: string; readonly externalCode?: string; readonly title?: string; readonly text: string },
  version: number
): Criterion | null {
  const id = input.id.trim();
  const text = input.text.trim();
  if (!id || !text) return null;
  return {
    id,
    text,
    sourceVersion: formatManualPackageVersion(version),
    ...optionalValue("externalCode", input.externalCode),
    ...optionalValue("title", input.title),
  };
}

function createBasicKnowledge(input: {
  readonly id: string;
  readonly externalCode?: string;
  readonly text: string;
  readonly criterionIds: readonly string[];
}, version: number): BasicKnowledge | null {
  const id = input.id.trim();
  const text = input.text.trim();
  if (!id || !text) return null;
  return {
    id,
    text,
    sourceVersion: formatManualPackageVersion(version),
    criterionIds: [...input.criterionIds],
    ...optionalValue("externalCode", input.externalCode),
  };
}

function finalizePack(pack: CurriculumPack, version: number, occurredAt: string): CurriculumPack {
  return {
    ...pack,
    packageVersion: formatManualPackageVersion(version),
    updatedAt: occurredAt,
    subjects: pack.subjects.map((subject) => ({
      ...subject,
      criteria: subject.criteria.map((criterion) => ({ ...criterion })),
      basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
        ...knowledge,
        criterionIds: [...knowledge.criterionIds],
      })),
    })),
  };
}

function replaceSubject(pack: CurriculumPack, subject: CurriculumSubject): CurriculumPack {
  return {
    ...pack,
    subjects: pack.subjects.map((candidate) => candidate.id === subject.id ? subject : candidate),
  };
}

function updatePackMetadata(
  pack: CurriculumPack,
  command: Extract<CurriculumCatalogCommand, { type: "update-pack-metadata" }>,
  name: string
): CurriculumPack {
  const base = withoutOptionalKeys(pack, ["region", "scope", "stage", "course"]);
  return {
    ...base,
    name,
    ...optionalMetadata("region", command.region),
    ...optionalMetadata("scope", command.scope),
    ...optionalMetadata("stage", command.stage),
    ...optionalMetadata("course", command.course),
  };
}

function updateSubjectMetadata(
  subject: CurriculumSubject,
  name: string,
  externalCode: string | null | undefined
): CurriculumSubject {
  const base = withoutOptionalKeys(subject, ["externalCode"]);
  return { ...base, name, ...optionalValue("externalCode", externalCode) };
}

function updateCriterionMetadata(
  criterion: Criterion,
  text: string,
  externalCode: string | null | undefined,
  title: string | null | undefined,
  version: number
): Criterion {
  const base = withoutOptionalKeys(criterion, ["externalCode", "title"]);
  return {
    ...base,
    text,
    sourceVersion: formatManualPackageVersion(version),
    ...optionalValue("externalCode", externalCode),
    ...optionalValue("title", title),
  };
}

function updateBasicKnowledgeMetadata(
  knowledge: BasicKnowledge,
  text: string,
  externalCode: string | null | undefined,
  version: number
): BasicKnowledge {
  const base = withoutOptionalKeys(knowledge, ["externalCode"]);
  return {
    ...base,
    text,
    sourceVersion: formatManualPackageVersion(version),
    ...optionalValue("externalCode", externalCode),
  };
}

function reorderExactly<T extends { readonly id: string }>(
  values: readonly T[],
  orderedIds: readonly string[]
): readonly T[] | null {
  if (
    orderedIds.length !== values.length
    || new Set(orderedIds).size !== orderedIds.length
  ) return null;
  const byId = new Map(values.map((value) => [value.id, value]));
  if (orderedIds.some((id) => !byId.has(id))) return null;
  return orderedIds.map((id) => byId.get(id)!);
}

function findSubject(pack: CurriculumPack, subjectId: string): CurriculumSubject | undefined {
  return pack.subjects.find((subject) => subject.id === subjectId);
}

function findEntity(pack: CurriculumPack, id: string): {
  readonly type: "pack" | "subject" | "criterion" | "basic-knowledge";
  readonly value: CurriculumPack | CurriculumSubject | Criterion | BasicKnowledge;
} | null {
  if (pack.id === id) return { type: "pack", value: pack };
  for (const subject of pack.subjects) {
    if (subject.id === id) return { type: "subject", value: subject };
    const criterion = subject.criteria.find((candidate) => candidate.id === id);
    if (criterion) return { type: "criterion", value: criterion };
    const knowledge = subject.basicKnowledge.find((candidate) => candidate.id === id);
    if (knowledge) return { type: "basic-knowledge", value: knowledge };
  }
  return null;
}

function findDuplicateExternalCode<T extends { readonly id: string; readonly externalCode?: string }>(
  values: readonly T[],
  externalCode: string | undefined
): T | undefined {
  if (!externalCode) return undefined;
  const normalized = normalizeComparableText(externalCode);
  return values.find((value) =>
    value.externalCode !== undefined
    && normalizeComparableText(value.externalCode) === normalized
  );
}

function duplicateExternalCodeConflicts(
  values: readonly { readonly id: string; readonly externalCode?: string }[],
  path: string
): CurriculumCatalogConflict[] {
  const conflicts: CurriculumCatalogConflict[] = [];
  values.forEach((value, index) => {
    const duplicate = findDuplicateExternalCode(values.slice(0, index), value.externalCode);
    if (duplicate) conflicts.push(conflict(
      "duplicate-external-code",
      `${path}[${index}].externalCode`,
      `External code is already used by ${duplicate.id}.`
    ));
  });
  return conflicts;
}

function previewResult(
  base: {
    readonly operationId: string;
    readonly commandFingerprint: string;
    readonly expectedVersion: number;
  },
  resultingVersion: number,
  proposedPack: CurriculumPack | null,
  changes: readonly CurriculumCatalogChange[],
  affectedEntities: readonly CurriculumCatalogAffectedEntity[],
  dependencies: readonly CurriculumCatalogDependency[],
  warnings: readonly CurriculumCatalogWarning[],
  conflicts: readonly CurriculumCatalogConflict[],
  forcedStatus?: "idempotent"
): CurriculumCatalogCommandPreview {
  const status = forcedStatus ?? (conflicts.length > 0 ? "blocked" : "applicable");
  return {
    ...base,
    status,
    resultingVersion,
    proposedPack: proposedPack ? cloneJsonValue(proposedPack) : null,
    changes: changes.map(cloneJsonValue),
    affectedEntities: affectedEntities.map(cloneJsonValue),
    dependencies: dependencies.map(cloneJsonValue),
    warnings: warnings.map(cloneJsonValue),
    conflicts: conflicts.map(cloneJsonValue),
    canApply: status === "applicable" || status === "idempotent",
    summary: createSummary(changes, dependencies, warnings, conflicts, status),
  };
}

function createSummary(
  changes: readonly CurriculumCatalogChange[],
  dependencies: readonly CurriculumCatalogDependency[],
  warnings: readonly CurriculumCatalogWarning[],
  conflicts: readonly CurriculumCatalogConflict[],
  status: "applicable" | "blocked" | "idempotent" = conflicts.length > 0
    ? "blocked"
    : "applicable"
) {
  return {
    title: "Previsualización del catálogo curricular",
    message: status === "idempotent"
      ? "La operación ya estaba aplicada; no se creará una nueva versión."
      : status === "blocked"
        ? "La operación necesita resolver conflictos antes de aplicarse."
        : "La operación puede aplicarse como una nueva versión del catálogo.",
    changeCount: changes.length,
    dependencyCount: dependencies.length,
    warningCount: warnings.length,
    conflictCount: conflicts.length,
  };
}

function entityMissing(pack: CurriculumPack, path: string, id: string): Proposal {
  return blockedProposal(pack, conflict("entity-not-found", path, `Entity ${id} does not exist.`));
}

function invalidOrder(pack: CurriculumPack, path: string): Proposal {
  return blockedProposal(pack, conflict(
    "invalid-order",
    path,
    "A reorder command must contain every existing identifier exactly once."
  ));
}

function duplicateExternalCode(pack: CurriculumPack, path: string, duplicateId: string): Proposal {
  return blockedProposal(pack, conflict(
    "duplicate-external-code",
    path,
    `External code is already used by ${duplicateId}.`
  ));
}

function optionalValue<Key extends string>(
  key: Key,
  value: string | null | undefined
): { readonly [Property in Key]?: string } {
  const normalized = value?.trim();
  return normalized ? { [key]: normalized } as { readonly [Property in Key]?: string } : {};
}

function withoutOptionalKeys<T extends object>(
  value: T,
  keys: readonly (keyof T)[]
): T {
  const result = { ...value };
  keys.forEach((key) => { delete result[key]; });
  return result;
}

function optionalMetadata<Key extends "region" | "scope" | "stage" | "course">(
  key: Key,
  value: string | null | undefined
): { readonly [Property in Key]?: string } {
  return optionalValue(key, value);
}

function formatManualPackageVersion(version: number): string {
  return `manual-r${version}`;
}

function parseManualPackageVersion(value: string): number | null {
  const match = /^manual-r([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

function isValidManualEntitySourceVersion(
  value: string | undefined,
  packageRevision: number | null
): boolean {
  const entityRevision = value ? parseManualPackageVersion(value) : null;
  return entityRevision !== null
    && packageRevision !== null
    && entityRevision <= packageRevision;
}

function fingerprintCommand(command: CurriculumCatalogCommand): string {
  const identity = Object.fromEntries(
    Object.entries(command).filter(([key]) => key !== "occurredAt")
  );
  return `catalog-command-v1:${createCurriculumDeterministicFingerprint({
    ...identity,
    operationId: command.operationId.trim(),
  })}`;
}

function semanticSerialize(value: unknown): string {
  return serializeCurriculumFingerprintValue(stripInformativeMetadata(value));
}

function stripInformativeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInformativeMetadata);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "updatedAt" && key !== "packageVersion" && key !== "sourceVersion")
      .sort(compareStableText)
      .map((key) => [key, stripInformativeMetadata(value[key])])
  );
}

function normalizeInstant(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase();
}

function conflict(
  code: CurriculumCatalogConflict["code"],
  path: string,
  message: string
): CurriculumCatalogConflict {
  return { code, path, message };
}

function warning(
  code: CurriculumCatalogWarning["code"],
  path: string,
  message: string
): CurriculumCatalogWarning {
  return { code, path, message };
}

function dependency(
  kind: CurriculumCatalogDependency["kind"],
  sourceId: string,
  targetId: string,
  path: string,
  message: string
): CurriculumCatalogDependency {
  return {
    kind,
    origin: dependencyOrigin(kind),
    sourceId,
    targetId,
    path,
    message,
  };
}

function dependencyOrigin(
  kind: CurriculumCatalogDependency["kind"]
): CurriculumCatalogDependency["origin"] {
  switch (kind) {
    case "contained-criterion":
    case "contained-basic-knowledge":
    case "knowledge-criterion":
      return "catalog";
    case "profile-subject":
      return "profiles";
    case "action-link-subject":
    case "action-link-criterion":
    case "action-link-basic-knowledge":
      return "action-links";
    case "ordinary-tracking-subject":
    case "ordinary-tracking-basic-knowledge":
      return "ordinary-tracking";
  }
  return assertNever(kind);
}

function sortDependencies(
  dependencies: readonly CurriculumCatalogDependency[]
): CurriculumCatalogDependency[] {
  return [...dependencies].sort((left, right) => compareStableText(
    `${left.kind}:${left.sourceId}:${left.targetId}:${left.path}`,
    `${right.kind}:${right.sourceId}:${right.targetId}:${right.path}`
  ));
}

function deduplicateDependencies(
  dependencies: readonly CurriculumCatalogDependency[]
): CurriculumCatalogDependency[] {
  const unique = new Map(dependencies.map((item) => [
    `${item.kind}:${item.origin}:${item.sourceId}:${item.targetId}:${item.path}`,
    item,
  ]));
  return sortDependencies([...unique.values()]);
}

function deduplicateConflicts(
  conflicts: readonly CurriculumCatalogConflict[]
): CurriculumCatalogConflict[] {
  return [...new Map(conflicts.map((item) => [`${item.code}:${item.path}:${item.message}`, item])).values()];
}

function deduplicateWarnings(
  warnings: readonly CurriculumCatalogWarning[]
): CurriculumCatalogWarning[] {
  return [...new Map(warnings.map((item) => [`${item.code}:${item.path}:${item.message}`, item])).values()];
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported curriculum catalog command: ${String(value)}`);
}
