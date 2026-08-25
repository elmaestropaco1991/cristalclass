import { SUBJECT_CATALOG } from "../data/subjects";
import type { Action } from "../types/action";
import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumMigrationConflict,
  type CurriculumMigrationPlan,
  type CurriculumSubject,
  type EvidenceEffect,
  type RecordingMode,
} from "../types/curriculum";
import {
  createCurriculumDeterministicFingerprint as fingerprintOf,
  serializeCurriculumFingerprintValue as stableSerialize,
} from "./curriculumFingerprintService";

export interface CurriculumMigrationPlanningInput {
  readonly classroomId: string;
  readonly plannedAt: string;
  readonly legacyActions: readonly unknown[];
  readonly curriculumSubjects?: readonly CurriculumSubject[];
}

/**
 * Pure preview of the additive migration. It neither reads nor writes storage and
 * never edits the legacy action objects supplied by the caller.
 */
export function planCurriculumMigration(
  input: CurriculumMigrationPlanningInput
): CurriculumMigrationPlan {
  const classroomId = input.classroomId.trim();
  if (!classroomId) {
    throw new Error("A stable classroom identifier is required for curriculum migration.");
  }
  const plannedAt = normalizeInstant(input.plannedAt);
  const curriculumSubjects = input.curriculumSubjects
    ? canonicalizeSubjects(input.curriculumSubjects)
    : canonicalizeSubjects(createProvisionalSubjects());
  const sourceFingerprint = fingerprintOf({
    classroomId,
    legacyActions: input.legacyActions.map(canonicalLegacyActionSnapshot).sort(),
    curriculumSubjects,
  });
  const packFingerprint = fingerprintOf(curriculumSubjects);
  const packId = `curriculum-pack:legacy-provisional:${packFingerprint}`;
  const profileId = `curriculum-profile:${encodeIdPart(classroomId)}:${packFingerprint}`;
  const proposedPack = {
    id: packId,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: "legacy-provisional-1",
    name: "Catálogo provisional compatible",
    provenance: {
      kind: "legacy-provisional" as const,
      sourceId: "subject-catalog-v1",
      sourceVersion: "1",
    },
    createdAt: plannedAt,
    updatedAt: plannedAt,
    subjects: curriculumSubjects,
  };
  const proposedProfile = {
    id: profileId,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    classroomId,
    packId,
    provenance: {
      kind: "legacy-provisional" as const,
      sourceId: packId,
      sourceVersion: proposedPack.packageVersion,
    },
    status: "inactive" as const,
    selectedSubjectIds: curriculumSubjects.map((subject) => subject.id),
    ordinaryTracking: {
      enabled: false,
      minimumSessionDurationMinutes: 0,
      rules: [],
    },
    createdAt: plannedAt,
    updatedAt: plannedAt,
  };
  const conflicts: CurriculumMigrationConflict[] = [];
  curriculumSubjects.forEach((subject, subjectIndex) => {
    if (!subject.specificCompetences) {
      conflicts.push(conflict(
        "missing-specific-competence",
        subjectIndex,
        "A legacy subject without specific competences requires explicit review.",
        undefined,
        subject.id,
        subject
      ));
      return;
    }
    const competenceIds = new Set(subject.specificCompetences.map((item) => item.id));
    subject.criteria.forEach((criterion) => {
      if (
        typeof criterion.specificCompetenceId !== "string"
        || !competenceIds.has(criterion.specificCompetenceId)
      ) {
        conflicts.push(conflict(
          "missing-specific-competence",
          subjectIndex,
          "A legacy criterion without one valid same-subject competence requires explicit review.",
          undefined,
          criterion.id,
          criterion
        ));
      }
    });
  });
  const proposedLinks = new Map<string, ActionCurricularLink>();
  const preservedActionIds = new Set<string>();
  const duplicateActionSources = collectDuplicateActionSources(input.legacyActions);
  const reportedDuplicateActionIds = new Set<string>();

  input.legacyActions.forEach((candidate, sourceIndex) => {
    const action = readLegacyAction(candidate);
    if (!action) {
      conflicts.push(conflict(
        "corrupt-action",
        sourceIndex,
        "The legacy action is incomplete or corrupt and requires explicit review.",
        undefined,
        undefined,
        candidate
      ));
      return;
    }

    preservedActionIds.add(action.id);
    const duplicateSources = duplicateActionSources.get(action.id);
    if (duplicateSources) {
      if (!reportedDuplicateActionIds.has(action.id)) {
        conflicts.push(conflict(
          "duplicate-action",
          sourceIndex,
          "A duplicate legacy action identifier requires explicit review.",
          action.id,
          undefined,
          duplicateSources
        ));
        reportedDuplicateActionIds.add(action.id);
      }
      return;
    }
    if (
      !action.availableInAllSubjects
      && !curriculumSubjects.some((subject) => subject.legacySubjectId === action.subjectId)
    ) {
      conflicts.push(conflict(
        "unknown-subject",
        sourceIndex,
        "The legacy subject reference is unknown and requires explicit mapping.",
        action.id,
        action.subjectId,
        action
      ));
      return;
    }
    const references = readLegacyCriterionReferences(action.attitudinalCriterionLinks);
    if (references.invalidSnapshots.length > 0) {
      references.invalidSnapshots.forEach((snapshot) => {
        conflicts.push(conflict(
          "missing-criterion",
          sourceIndex,
          "The legacy criterion reference is incomplete and was not migrated.",
          action.id,
          undefined,
          snapshot
        ));
      });
    }

    references.valid.forEach((reference) => {
      const targetSearch = findMigrationTargets(action, reference, curriculumSubjects);
      const candidates = targetSearch.targets;

      if (candidates.length === 0) {
        conflicts.push(conflict(
          targetSearch.criterionFound ? "missing-basic-knowledge" : "missing-criterion",
          sourceIndex,
          targetSearch.criterionFound
            ? "No knowledge route exists for this legacy criterion reference."
            : "The legacy criterion does not exist in the proposed curriculum.",
          action.id,
          reference.criterionId,
          reference
        ));
        return;
      }
      if (candidates.length > 1) {
        conflicts.push(conflict(
          "ambiguous-basic-knowledge",
          sourceIndex,
          "Several knowledge routes match this legacy criterion reference.",
          action.id,
          reference.criterionId,
          reference
        ));
        return;
      }

      const target = candidates[0];
      const effect: EvidenceEffect = action.points < 0 ? "contrary" : "positive";
      const recordingMode: RecordingMode = action.trackOrdinaryCompliance
        ? "ordinary"
        : "manual";
      const key = stableSerialize([
        action.id,
        profileId,
        target.subjectId,
        target.knowledgeId,
        target.criterionId,
      ]);
      if (proposedLinks.has(key)) {
        conflicts.push(conflict(
          "duplicate-link",
          sourceIndex,
          "A repeated legacy route was collapsed into one proposed link.",
          action.id,
          reference.criterionId,
          reference
        ));
        return;
      }

      proposedLinks.set(key, {
        id: `action-curricular-link:${fingerprintOf(key)}`,
        schemaVersion: CURRICULUM_SCHEMA_VERSION,
        actionId: action.id,
        profileId,
        subjectId: target.subjectId,
        basicKnowledgeId: target.knowledgeId,
        resolvedCriterionIds: [target.criterionId],
        effect,
        recordingMode,
        enabled: true,
        createdAt: plannedAt,
        updatedAt: plannedAt,
      });
    });
  });

  const sortedConflicts = [...new Map(conflicts.map((item) => [item.id, item])).values()]
    .sort((left, right) => compareStableText(left.id, right.id));
  const sortedLinks = [...proposedLinks.values()]
    .sort((left, right) => compareStableText(left.id, right.id));

  return {
    id: `curriculum-migration-plan:${sourceFingerprint}`,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    sourceFingerprint,
    proposedPack,
    proposedProfile,
    proposedLinks: sortedLinks,
    conflicts: sortedConflicts,
    preservedActionIds: [...preservedActionIds].sort(),
    preservedLegacySubjectIds: SUBJECT_CATALOG.map((subject) => subject.id),
    application: {
      mode: "explicit-additive",
      preservesLegacyActionFields: true,
      rewritesStorageOnRead: false,
      supportsRollbackWithoutDeletion: true,
      requiresConflictResolution: sortedConflicts.length > 0,
    },
  };
}

type LegacyAction = Pick<
  Action,
  "id" | "points" | "subjectId" | "availableInAllSubjects" | "trackOrdinaryCompliance"
> & { readonly attitudinalCriterionLinks: unknown };

type MigrationTarget = {
  readonly subjectId: string;
  readonly knowledgeId: string;
  readonly criterionId: string;
};

function createProvisionalSubjects(): CurriculumSubject[] {
  return SUBJECT_CATALOG.map((subject) => ({
    id: `curriculum-subject:legacy:${subject.id}`,
    legacySubjectId: subject.id,
    name: subject.name,
    specificCompetences: [],
    criteria: [],
    basicKnowledge: [],
  }));
}

function canonicalizeSubjects(subjects: readonly CurriculumSubject[]): CurriculumSubject[] {
  return subjects.map((subject) => {
    const { specificCompetences, ...subjectWithoutCompetences } = subject;
    return {
      ...subjectWithoutCompetences,
      ...(specificCompetences === undefined
      ? {}
      : {
          specificCompetences: specificCompetences.map((competence) => ({
            ...competence,
          })),
        }),
      criteria: subject.criteria.map((criterion) => ({ ...criterion })),
      basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
        ...knowledge,
        criterionIds: [...knowledge.criterionIds],
      })),
    };
  });
}

function readLegacyAction(value: unknown): LegacyAction | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (
    !id
    || typeof value.points !== "number"
    || !Number.isInteger(value.points)
    || value.points === 0
    || Math.abs(value.points) > 99
    || (value.trackOrdinaryCompliance === true && value.points >= 0)
  ) return null;

  return {
    id,
    points: value.points,
    subjectId: typeof value.subjectId === "string" ? value.subjectId as Action["subjectId"] : "general",
    availableInAllSubjects: value.availableInAllSubjects === true,
    attitudinalCriterionLinks: value.attitudinalCriterionLinks,
    trackOrdinaryCompliance: value.trackOrdinaryCompliance === true,
  };
}

function collectDuplicateActionSources(
  values: readonly unknown[]
): ReadonlyMap<string, readonly string[]> {
  const sourcesById = new Map<string, string[]>();

  values.forEach((value) => {
    const action = readLegacyAction(value);
    if (!action) return;
    const sources = sourcesById.get(action.id) ?? [];
    sources.push(stableSerialize(value));
    sourcesById.set(action.id, sources);
  });

  return new Map(
    [...sourcesById]
      .filter(([, sources]) => sources.length > 1)
      .map(([actionId, sources]) => [actionId, [...sources].sort()])
  );
}

function readLegacyCriterionReferences(value: unknown): {
  readonly valid: readonly { readonly criterionId: string; readonly catalogVersion: string }[];
  readonly invalidSnapshots: readonly unknown[];
} {
  if (value === undefined) return { valid: [], invalidSnapshots: [] };
  if (!Array.isArray(value)) return { valid: [], invalidSnapshots: [value] };
  const valid: Array<{ criterionId: string; catalogVersion: string }> = [];
  const invalidSnapshots: unknown[] = [];

  value.forEach((candidate) => {
    if (!isRecord(candidate)) {
      invalidSnapshots.push(candidate);
      return;
    }
    const criterionId = typeof candidate.criterionId === "string"
      ? candidate.criterionId.trim()
      : "";
    const catalogVersion = typeof candidate.catalogVersion === "string"
      ? candidate.catalogVersion.trim()
      : "";
    if (!criterionId || !catalogVersion) {
      invalidSnapshots.push(candidate);
    } else {
      valid.push({ criterionId, catalogVersion });
    }
  });

  return { valid, invalidSnapshots };
}

function findMigrationTargets(
  action: LegacyAction,
  reference: { readonly criterionId: string; readonly catalogVersion: string },
  subjects: readonly CurriculumSubject[]
): { readonly criterionFound: boolean; readonly targets: readonly MigrationTarget[] } {
  const scopedSubjects = action.availableInAllSubjects
    ? subjects
    : subjects.filter((subject) => subject.legacySubjectId === action.subjectId);
  let criterionFound = false;

  const targets = scopedSubjects.flatMap((subject) => {
    const criterion = subject.criteria.find((candidate) =>
      (candidate.id === reference.criterionId || candidate.externalCode === reference.criterionId)
      && candidate.sourceVersion === reference.catalogVersion
    );
    if (!criterion) return [];
    criterionFound = true;

    return subject.basicKnowledge
      .filter((knowledge) => knowledge.criterionIds.includes(criterion.id))
      .map((knowledge) => ({
        subjectId: subject.id,
        knowledgeId: knowledge.id,
        criterionId: criterion.id,
      }));
  });

  return { criterionFound, targets };
}

function conflict(
  kind: CurriculumMigrationConflict["kind"],
  sourceIndex: number,
  message: string,
  actionId?: string,
  referenceId?: string,
  source?: unknown
): CurriculumMigrationConflict {
  const identity = fingerprintOf({ kind, actionId, referenceId, source });
  return {
    id: `${kind}:${identity}`,
    kind,
    sourceIndex,
    ...(actionId ? { actionId } : {}),
    ...(referenceId ? { referenceId } : {}),
    message,
    ...(source === undefined ? {} : { sourceSnapshot: safeSnapshot(source) }),
  };
}

function normalizeInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A valid planning instant is required.");
  }
  return parsed.toISOString();
}

function canonicalLegacyActionSnapshot(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.attitudinalCriterionLinks)) {
    return stableSerialize(value);
  }

  return stableSerialize({
    ...value,
    attitudinalCriterionLinks: value.attitudinalCriterionLinks
      .map((reference) => stableSerialize(reference))
      .sort(),
  });
}

function safeSnapshot(value: unknown): string {
  try {
    return stableSerialize(value);
  } catch {
    return '"[unserializable legacy data]"';
  }
}

function encodeIdPart(value: string): string {
  return encodeURIComponent(value || "unidentified-classroom");
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
