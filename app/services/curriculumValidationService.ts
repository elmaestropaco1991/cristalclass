import {
  CURRICULUM_LEGACY_SCHEMA_VERSION,
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumMigrationConflict,
  type CurriculumModuleStatus,
  type CurriculumPack,
  type VersionedCurriculumData,
} from "../types/curriculum";

export type CurriculumValidationIssueCode =
  | "duplicate-internal-id"
  | "invalid-internal-id"
  | "external-code-used-as-identity"
  | "invalid-external-code"
  | "duplicate-subject-external-code"
  | "duplicate-specific-competence-external-code"
  | "duplicate-criterion-external-code"
  | "duplicate-basic-knowledge-external-code"
  | "invalid-name"
  | "duplicate-subject-name"
  | "invalid-text"
  | "duplicate-specific-competence-text"
  | "duplicate-criterion-text"
  | "duplicate-basic-knowledge-text"
  | "incompatible-schema-version"
  | "legacy-catalog-incomplete"
  | "missing-specific-competence-collection"
  | "unassigned-specific-competence"
  | "missing-specific-competence-reference"
  | "cross-subject-specific-competence-reference"
  | "duplicate-criterion-reference"
  | "cross-subject-criterion-reference"
  | "invalid-package-version"
  | "invalid-source-version"
  | "future-source-version"
  | "invalid-timestamp"
  | "invalid-state"
  | "missing-criterion-reference"
  | "missing-action-reference"
  | "missing-pack-reference"
  | "missing-profile-reference"
  | "missing-subject-reference"
  | "missing-basic-knowledge-reference"
  | "profile-classroom-mismatch"
  | "duplicate-resolved-criterion"
  | "invalid-resolved-criterion"
  | "active-module-without-subject";

export interface CurriculumValidationIssue {
  readonly code: CurriculumValidationIssueCode;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

export interface CurriculumValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CurriculumValidationIssue[];
}

export function validateCurriculumData(
  data: VersionedCurriculumData,
  knownActionIds: readonly string[]
): CurriculumValidationResult {
  try {
    return validateCurriculumDataUnsafe(data, knownActionIds);
  } catch {
    return {
      valid: false,
      issues: [issue(
        "invalid-state",
        "$",
        "Curriculum data cannot be inspected safely; malformed values, accessors and proxies are rejected."
      )],
    };
  }
}

function validateCurriculumDataUnsafe(
  data: VersionedCurriculumData,
  knownActionIds: readonly string[]
): CurriculumValidationResult {
  try {
    return validateCurriculumDataInternal(data, knownActionIds);
  } catch {
    return {
      valid: false,
      issues: [issue(
        "invalid-state",
        "$",
        "Curriculum data is incomplete or cannot be validated safely."
      )],
    };
  }
}

function validateCurriculumDataInternal(
  data: VersionedCurriculumData,
  knownActionIds: readonly string[]
): CurriculumValidationResult {
  const issues: CurriculumValidationIssue[] = [];
  if (!hasAggregateShape(data)) {
    return {
      valid: false,
      issues: [issue(
        "invalid-state",
        "$",
        "Curriculum data must contain module, packs, profiles and actionLinks collections."
      )],
    };
  }
  validateAggregateContract(data, issues);
  validateGlobalInternalIds(data, issues);
  const actionIds = new Set(knownActionIds);
  const packIds = collectUniqueIds(data.packs, "packs", issues);
  const profileIds = collectUniqueIds(data.profiles, "profiles", issues);
  collectUniqueIds(data.actionLinks, "actionLinks", issues);

  const subjectsByPack = new Map<string, Map<string, {
    criterionIds: Set<string>;
    basicKnowledge: Map<string, Set<string>>;
    activationReady: boolean;
  }>>();

  data.packs.forEach((pack, packIndex) => {
    if (!packIds.has(pack.id)) return;

    const packPath = `packs[${packIndex}]`;
    validatePackContract(pack, packPath, issues);
    const subjectIds = collectUniqueIds(pack.subjects, `packs[${packIndex}].subjects`, issues);
    validateOptionalExternalCodes(
      pack.subjects,
      `${packPath}.subjects`,
      "duplicate-subject-external-code",
      issues
    );
    validateUniqueTexts(
      pack.subjects,
      "name",
      `${packPath}.subjects`,
      "duplicate-subject-name",
      issues
    );
    const competenceOwners = new Map<string, string>();
    const criterionOwners = new Map<string, string>();
    pack.subjects.forEach((subject) => {
      subject.specificCompetences?.forEach((competence) => {
        if (!competenceOwners.has(competence.id)) competenceOwners.set(competence.id, subject.id);
      });
      subject.criteria.forEach((criterion) => {
        if (!criterionOwners.has(criterion.id)) criterionOwners.set(criterion.id, subject.id);
      });
    });
    const subjects = new Map<string, {
      criterionIds: Set<string>;
      basicKnowledge: Map<string, Set<string>>;
      activationReady: boolean;
    }>();

    pack.subjects.forEach((subject, subjectIndex) => {
      const subjectPath = `packs[${packIndex}].subjects[${subjectIndex}]`;
      validateRequiredId(subject.id, `${subjectPath}.id`, issues);
      validateRequiredText(subject.name, `${subjectPath}.name`, "invalid-name", issues);
      rejectExternalCodeIdentity(subject, subjectPath, issues);
      validateOptionalExternalCode(subject.externalCode, `${subjectPath}.externalCode`, issues);
      const specificCompetences = subject.specificCompetences;
      if (!Array.isArray(specificCompetences)) {
        issues.push(issue(
          "missing-specific-competence-collection",
          `${subjectPath}.specificCompetences`,
          "A legacy subject without a specific competence collection requires explicit review."
        ));
      }
      const competenceIds = collectUniqueIds(
        specificCompetences ?? [],
        `${subjectPath}.specificCompetences`,
        issues
      );
      const criterionIds = collectUniqueIds(subject.criteria, `${subjectPath}.criteria`, issues);
      const basicKnowledgeIds = collectUniqueIds(
        subject.basicKnowledge,
        `${subjectPath}.basicKnowledge`,
        issues
      );
      const basicKnowledge = new Map<string, Set<string>>();

      validateOptionalExternalCodes(
        specificCompetences ?? [],
        `${subjectPath}.specificCompetences`,
        "duplicate-specific-competence-external-code",
        issues
      );
      validateUniqueTexts(
        specificCompetences ?? [],
        "text",
        `${subjectPath}.specificCompetences`,
        "duplicate-specific-competence-text",
        issues
      );
      validateOptionalExternalCodes(
        subject.criteria,
        `${subjectPath}.criteria`,
        "duplicate-criterion-external-code",
        issues
      );
      validateUniqueTexts(
        subject.criteria,
        "text",
        `${subjectPath}.criteria`,
        "duplicate-criterion-text",
        issues
      );
      validateOptionalExternalCodes(
        subject.basicKnowledge,
        `${subjectPath}.basicKnowledge`,
        "duplicate-basic-knowledge-external-code",
        issues
      );
      validateUniqueTexts(
        subject.basicKnowledge,
        "text",
        `${subjectPath}.basicKnowledge`,
        "duplicate-basic-knowledge-text",
        issues
      );

      (specificCompetences ?? []).forEach((competence, competenceIndex) => {
        const competencePath = `${subjectPath}.specificCompetences[${competenceIndex}]`;
        validateRequiredId(competence.id, `${competencePath}.id`, issues);
        rejectExternalCodeIdentity(competence, competencePath, issues);
        validateOptionalExternalCode(competence.externalCode, `${competencePath}.externalCode`, issues);
        validateRequiredText(competence.text, `${competencePath}.text`, "invalid-text", issues);
        const missingCurrentSourceVersion =
          pack.schemaVersion === CURRICULUM_SCHEMA_VERSION
          && (typeof competence.sourceVersion !== "string" || !competence.sourceVersion.trim());
        if (missingCurrentSourceVersion) {
          issues.push(issue(
            "invalid-source-version",
            `${competencePath}.sourceVersion`,
            "A schema-v2 specific competence requires an explicit sourceVersion."
          ));
        } else {
          validateEntitySourceVersion(
            pack,
            competence.sourceVersion,
            `${competencePath}.sourceVersion`,
            issues
          );
        }
      });

      subject.criteria.forEach((criterion, criterionIndex) => {
        const criterionPath = `${subjectPath}.criteria[${criterionIndex}]`;
        validateRequiredId(criterion.id, `${criterionPath}.id`, issues);
        rejectExternalCodeIdentity(
          criterion,
          criterionPath,
          issues
        );
        validateOptionalExternalCode(criterion.externalCode, `${criterionPath}.externalCode`, issues);
        validateRequiredText(criterion.text, `${criterionPath}.text`, "invalid-text", issues);
        if (criterion.title !== undefined) {
          validateRequiredText(criterion.title, `${criterionPath}.title`, "invalid-text", issues);
        }
        validateEntitySourceVersion(pack, criterion.sourceVersion, `${criterionPath}.sourceVersion`, issues);
        if (typeof criterion.specificCompetenceId !== "string" || !criterion.specificCompetenceId.trim()) {
          issues.push(issue(
            "unassigned-specific-competence",
            `${criterionPath}.specificCompetenceId`,
            "A criterion without one specific competence requires explicit review."
          ));
        } else if (!competenceIds.has(criterion.specificCompetenceId)) {
          const owner = competenceOwners.get(criterion.specificCompetenceId);
          issues.push(issue(
            owner && owner !== subject.id
              ? "cross-subject-specific-competence-reference"
              : "missing-specific-competence-reference",
            `${criterionPath}.specificCompetenceId`,
            owner && owner !== subject.id
              ? `Specific competence ${criterion.specificCompetenceId} belongs to subject ${owner}.`
              : `Specific competence ${criterion.specificCompetenceId} does not exist in subject ${subject.id}.`
          ));
        }
      });
      subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
        const knowledgePath = `${subjectPath}.basicKnowledge[${knowledgeIndex}]`;
        validateRequiredId(knowledge.id, `${knowledgePath}.id`, issues);
        rejectExternalCodeIdentity(knowledge, knowledgePath, issues);
        validateOptionalExternalCode(knowledge.externalCode, `${knowledgePath}.externalCode`, issues);
        validateRequiredText(knowledge.text, `${knowledgePath}.text`, "invalid-text", issues);
        validateEntitySourceVersion(pack, knowledge.sourceVersion, `${knowledgePath}.sourceVersion`, issues);
        const references = new Set<string>();

        if (knowledge.criterionIds.length === 0) {
          issues.push(issue(
            "missing-criterion-reference",
            `${knowledgePath}.criterionIds`,
            "Basic knowledge must reference at least one criterion."
          ));
        }

        knowledge.criterionIds.forEach((criterionId, criterionIndex) => {
          const referencePath = `${knowledgePath}.criterionIds[${criterionIndex}]`;
          if (typeof criterionId !== "string" || !criterionId.trim()) {
            issues.push(issue(
              "missing-criterion-reference",
              referencePath,
              "A criterion reference must be a non-empty stable identifier."
            ));
          } else if (references.has(criterionId)) {
            issues.push(issue(
              "duplicate-criterion-reference",
              referencePath,
              `Criterion ${criterionId} is repeated in criterionIds.`
            ));
          } else if (!criterionIds.has(criterionId)) {
            const owner = criterionOwners.get(criterionId);
            issues.push(issue(
              owner && owner !== subject.id
                ? "cross-subject-criterion-reference"
                : "missing-criterion-reference",
              referencePath,
              owner && owner !== subject.id
                ? `Criterion ${criterionId} belongs to subject ${owner}.`
                : `Criterion ${criterionId} does not exist in subject ${subject.id}.`
            ));
          } else {
            references.add(criterionId);
          }
        });
        if (basicKnowledgeIds.has(knowledge.id)) basicKnowledge.set(knowledge.id, references);
      });

      if (subjectIds.has(subject.id)) {
        subjects.set(subject.id, {
          criterionIds,
          basicKnowledge,
          activationReady: Array.isArray(specificCompetences)
            && specificCompetences.length > 0
            && subject.criteria.length > 0
            && subject.basicKnowledge.length > 0
            && subject.criteria.every((criterion) =>
              typeof criterion.specificCompetenceId === "string"
              && competenceIds.has(criterion.specificCompetenceId)
            ),
        });
      }
    });
    subjectsByPack.set(pack.id, subjects);
  });

  const profilesById = new Map(data.profiles.map((profile) => [profile.id, profile]));
  data.profiles.forEach((profile, profileIndex) => {
    if (profile.classroomId !== data.module.classroomId) {
      issues.push(issue(
        "profile-classroom-mismatch",
        `profiles[${profileIndex}].classroomId`,
        "A curriculum profile cannot belong to another classroom."
      ));
    }
    if (profile.packId && !packIds.has(profile.packId)) {
      issues.push(issue(
        "missing-pack-reference",
        `profiles[${profileIndex}].packId`,
        `Pack ${profile.packId} does not exist.`
      ));
    }
    const packSubjects = profile.packId ? subjectsByPack.get(profile.packId) : undefined;
    profile.selectedSubjectIds.forEach((subjectId, subjectIndex) => {
      if (!packSubjects?.has(subjectId)) {
        issues.push(issue(
          "missing-subject-reference",
          `profiles[${profileIndex}].selectedSubjectIds[${subjectIndex}]`,
          `Subject ${subjectId} is not available in profile pack ${profile.packId ?? "manual"}.`
        ));
      }
    });
    profile.ordinaryTracking.rules.forEach((rule, ruleIndex) => {
      const rulePath = `profiles[${profileIndex}].ordinaryTracking.rules[${ruleIndex}]`;
      if (
        typeof rule.id !== "string"
        || !rule.id.trim()
        || typeof rule.enabled !== "boolean"
        || typeof rule.observableActionId !== "string"
        || !rule.observableActionId.trim()
        || !Array.isArray(rule.contraryActionIds)
        || rule.contraryActionIds.length === 0
        || rule.contraryActionIds.some((id) => typeof id !== "string" || !id.trim())
        || new Set(rule.contraryActionIds).size !== rule.contraryActionIds.length
        || rule.contraryActionIds.includes(rule.observableActionId)
      ) {
        issues.push(issue(
          "invalid-state",
          rulePath,
          "Ordinary tracking rule contract is invalid."
        ));
        return;
      }
      const subject = packSubjects?.get(rule.subjectId);
      if (!subject) {
        issues.push(issue(
          "missing-subject-reference",
          `${rulePath}.subjectId`,
          "Ordinary tracking subject does not exist in the profile pack."
        ));
      } else if (!subject.basicKnowledge.has(rule.basicKnowledgeId)) {
        issues.push(issue(
          "missing-basic-knowledge-reference",
          `${rulePath}.basicKnowledgeId`,
          "Ordinary tracking basic knowledge does not exist in the selected subject."
        ));
      }
      [rule.observableActionId, ...rule.contraryActionIds].forEach((actionId) => {
        if (!actionIds.has(actionId)) {
          issues.push(issue(
            "missing-action-reference",
            rulePath,
            `Ordinary tracking action ${actionId} does not exist.`
          ));
        }
      });
    });
  });

  if (data.module.status === "active") {
    const activeProfile = data.module.activeProfileId
      ? profilesById.get(data.module.activeProfileId)
      : undefined;
    const activePackSubjects = activeProfile?.packId
      ? subjectsByPack.get(activeProfile.packId)
      : undefined;
    const allSelectedSubjectsReady = activeProfile !== undefined
      && activeProfile.selectedSubjectIds.length > 0
      && activeProfile.selectedSubjectIds.every(
        (subjectId) => activePackSubjects?.get(subjectId)?.activationReady === true
      );
    if (!activeProfile || !allSelectedSubjectsReady) {
      issues.push(issue(
        "active-module-without-subject",
        "module.activeProfileId",
        "An active curriculum module requires a valid profile with at least one subject."
      ));
    }
  }

  data.actionLinks.forEach((link, linkIndex) => {
    validateActionLink(
      link,
      linkIndex,
      actionIds,
      profileIds,
      profilesById,
      subjectsByPack,
      issues
    );
  });

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
  };
}

function hasAggregateShape(value: unknown): value is VersionedCurriculumData {
  if (!isRecord(value) || !isRecord(value.module)) return false;
  return Array.isArray(value.packs)
    && Array.isArray(value.profiles)
    && Array.isArray(value.actionLinks);
}

function validateAggregateContract(
  data: VersionedCurriculumData,
  issues: CurriculumValidationIssue[]
): void {
  if (data.schemaVersion === CURRICULUM_LEGACY_SCHEMA_VERSION) {
    issues.push(issue(
      "legacy-catalog-incomplete",
      "schemaVersion",
      "Schema-v1 curriculum data requires explicit competence review and migration."
    ));
  } else if (data.schemaVersion !== CURRICULUM_SCHEMA_VERSION) {
    issues.push(issue(
      "incompatible-schema-version",
      "schemaVersion",
      `Curriculum schemaVersion must be ${CURRICULUM_SCHEMA_VERSION}.`
    ));
  }
  if (data.module.schemaVersion !== data.schemaVersion) {
    issues.push(issue(
      "incompatible-schema-version",
      "module.schemaVersion",
      "Module and aggregate schema versions must match."
    ));
  }
  if (!data.module.classroomId.trim()) {
    issues.push(issue("invalid-state", "module.classroomId", "Classroom ID is required."));
  }
  if (
    data.module.status !== "inactive"
    && data.module.status !== "configured"
    && data.module.status !== "active"
  ) {
    issues.push(issue("invalid-state", "module.status", "Module status is invalid."));
  }
  if (data.module.status === "active" && !data.module.activeProfileId) {
    issues.push(issue(
      "active-module-without-subject",
      "module.activeProfileId",
      "An active curriculum module requires an active profile."
    ));
  }
  data.profiles.forEach((profile, profileIndex) => {
    const path = `profiles[${profileIndex}]`;
    if (profile.schemaVersion !== data.schemaVersion) {
      issues.push(issue(
        "incompatible-schema-version",
        `${path}.schemaVersion`,
        "Profile and aggregate schema versions must match."
      ));
    }
    validateRequiredId(profile.id, `${path}.id`, issues);
    validateInstant(profile.createdAt, `${path}.createdAt`, issues);
    validateInstant(profile.updatedAt, `${path}.updatedAt`, issues);
  });
  data.actionLinks.forEach((link, linkIndex) => {
    const path = `actionLinks[${linkIndex}]`;
    if (link.schemaVersion !== data.schemaVersion) {
      issues.push(issue(
        "incompatible-schema-version",
        `${path}.schemaVersion`,
        "Action link and aggregate schema versions must match."
      ));
    }
    validateRequiredId(link.id, `${path}.id`, issues);
    validateInstant(link.createdAt, `${path}.createdAt`, issues);
    validateInstant(link.updatedAt, `${path}.updatedAt`, issues);
  });
}

function validatePackContract(
  pack: CurriculumPack,
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (pack.schemaVersion === CURRICULUM_LEGACY_SCHEMA_VERSION) {
    issues.push(issue(
      "legacy-catalog-incomplete",
      `${path}.schemaVersion`,
      "A schema-v1 pack is recognized as legacy and requires explicit competence review."
    ));
  } else if (pack.schemaVersion !== CURRICULUM_SCHEMA_VERSION) {
    issues.push(issue(
      "incompatible-schema-version",
      `${path}.schemaVersion`,
      `Pack schemaVersion must be ${CURRICULUM_SCHEMA_VERSION}.`
    ));
  }
  validateRequiredId(pack.id, `${path}.id`, issues);
  validateRequiredText(pack.name, `${path}.name`, "invalid-name", issues);
  validateRequiredText(
    pack.packageVersion,
    `${path}.packageVersion`,
    "invalid-package-version",
    issues
  );
  validateInstant(pack.createdAt, `${path}.createdAt`, issues);
  validateInstant(pack.updatedAt, `${path}.updatedAt`, issues);
  if (pack.provenance.sourceVersion !== undefined && !pack.provenance.sourceVersion.trim()) {
    issues.push(issue(
      "invalid-source-version",
      `${path}.provenance.sourceVersion`,
      "Provenance sourceVersion cannot be empty."
    ));
  }
  if (pack.provenance.kind === "manual" && parseManualRevision(pack.packageVersion) === null) {
    issues.push(issue(
      "invalid-package-version",
      `${path}.packageVersion`,
      "A manual pack packageVersion must use manual-rN."
    ));
  }
}

function validateEntitySourceVersion(
  pack: CurriculumPack,
  sourceVersion: string | undefined,
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (pack.provenance.kind !== "manual") {
    if (sourceVersion !== undefined && !sourceVersion.trim()) {
      issues.push(issue("invalid-source-version", path, "sourceVersion cannot be empty."));
    }
    return;
  }

  const packageRevision = parseManualRevision(pack.packageVersion);
  const entityRevision = sourceVersion === undefined ? null : parseManualRevision(sourceVersion);
  if (entityRevision === null) {
    issues.push(issue(
      "invalid-source-version",
      path,
      "A manual entity sourceVersion must use manual-rN."
    ));
  } else if (packageRevision !== null && entityRevision > packageRevision) {
    issues.push(issue(
      "future-source-version",
      path,
      "Entity sourceVersion cannot be newer than its pack packageVersion."
    ));
  }
}

function parseManualRevision(value: string): number | null {
  const match = /^manual-r([1-9][0-9]*)$/.exec(value);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

function validateRequiredId(
  value: string,
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("invalid-internal-id", path, "A non-empty stable identifier is required."));
  }
}

function validateRequiredText(
  value: string,
  path: string,
  code: "invalid-name" | "invalid-text" | "invalid-package-version",
  issues: CurriculumValidationIssue[]
): void {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue(code, path, "A non-empty value is required."));
  }
}

function validateOptionalExternalCode(
  value: string | undefined,
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim())) {
    issues.push(issue("invalid-external-code", path, "An external code cannot be empty."));
  }
}

function validateOptionalExternalCodes<T extends { readonly externalCode?: string }>(
  values: readonly T[],
  path: string,
  code:
    | "duplicate-subject-external-code"
    | "duplicate-specific-competence-external-code"
    | "duplicate-criterion-external-code"
    | "duplicate-basic-knowledge-external-code",
  issues: CurriculumValidationIssue[]
): void {
  const firstIndexByCode = new Map<string, number>();
  values.forEach((value, index) => {
    if (typeof value.externalCode !== "string" || !value.externalCode.trim()) return;
    const comparisonCode = normalizeComparableText(value.externalCode);
    const previousIndex = firstIndexByCode.get(comparisonCode);
    if (previousIndex !== undefined) {
      issues.push(issue(
        code,
        `${path}[${index}].externalCode`,
        `External code ${value.externalCode} is already used at ${path}[${previousIndex}].`
      ));
    } else {
      firstIndexByCode.set(comparisonCode, index);
    }
  });
}

function validateUniqueTexts<
  Key extends "name" | "text",
  Value extends Readonly<Record<Key, string>>,
>(
  values: readonly Value[],
  key: Key,
  path: string,
  code:
    | "duplicate-subject-name"
    | "duplicate-specific-competence-text"
    | "duplicate-criterion-text"
    | "duplicate-basic-knowledge-text",
  issues: CurriculumValidationIssue[]
): void {
  const firstIndexByText = new Map<string, number>();
  values.forEach((value, index) => {
    const text = value[key];
    if (typeof text !== "string" || !text.trim()) return;
    const comparisonText = normalizeComparableText(text);
    const previousIndex = firstIndexByText.get(comparisonText);
    if (previousIndex !== undefined) {
      issues.push(issue(
        code,
        `${path}[${index}].${key}`,
        `Value duplicates ${path}[${previousIndex}].${key}.`,
        "warning"
      ));
    } else {
      firstIndexByText.set(comparisonText, index);
    }
  });
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase();
}

function validateInstant(
  value: string,
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (typeof value !== "string") {
    issues.push(issue("invalid-timestamp", path, "A valid timestamp is required."));
    return;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    issues.push(issue(
      "invalid-timestamp",
      path,
      "A canonical ISO-8601 UTC instant is required."
    ));
  }
}

/** Returns a new aggregate and intentionally retains every configured entity. */
export function changeCurriculumModuleStatus(
  data: VersionedCurriculumData,
  status: CurriculumModuleStatus
): VersionedCurriculumData {
  return {
    ...data,
    module: {
      ...data.module,
      status,
      activeProfileId: status === "active" ? data.module.activeProfileId : null,
    },
    packs: [...data.packs],
    profiles: [...data.profiles],
    actionLinks: [...data.actionLinks],
  };
}

/** Collapses technical route duplication without adding or changing curricular meaning. */
export function getEffectiveCriterionRelations(
  links: readonly ActionCurricularLink[]
): readonly string[] {
  const keys = new Set<string>();

  links.forEach((link) => {
    link.resolvedCriterionIds.forEach((criterionId) => {
      keys.add([link.profileId, link.actionId, link.subjectId, criterionId].join("::"));
    });
  });

  return [...keys].sort();
}

export function conflictsFromUnknownCurriculumData(
  values: readonly unknown[]
): readonly CurriculumMigrationConflict[] {
  return values.map((value, index) => ({
    id: `invalid-existing-data:${index}`,
    kind: "invalid-existing-data",
    sourceIndex: index,
    message: "Unknown curriculum data requires explicit review and was not discarded.",
    sourceSnapshot: safeSnapshot(value),
  }));
}

function validateActionLink(
  link: ActionCurricularLink,
  linkIndex: number,
  actionIds: Set<string>,
  profileIds: Set<string>,
  profilesById: Map<string, VersionedCurriculumData["profiles"][number]>,
  subjectsByPack: Map<string, Map<string, {
    criterionIds: Set<string>;
    basicKnowledge: Map<string, Set<string>>;
    activationReady: boolean;
  }>>,
  issues: CurriculumValidationIssue[]
): void {
  const path = `actionLinks[${linkIndex}]`;
  if (!actionIds.has(link.actionId)) {
    issues.push(issue("missing-action-reference", `${path}.actionId`, "Action does not exist."));
  }
  if (!profileIds.has(link.profileId)) {
    issues.push(issue("missing-profile-reference", `${path}.profileId`, "Profile does not exist."));
    return;
  }

  const profile = profilesById.get(link.profileId)!;
  const subject = profile.packId
    ? subjectsByPack.get(profile.packId)?.get(link.subjectId)
    : undefined;
  if (!subject) {
    issues.push(issue("missing-subject-reference", `${path}.subjectId`, "Subject does not exist."));
    return;
  }
  const criterionIds = subject.basicKnowledge.get(link.basicKnowledgeId);
  if (!criterionIds) {
    issues.push(issue(
      "missing-basic-knowledge-reference",
      `${path}.basicKnowledgeId`,
      "Basic knowledge does not exist in the selected subject."
    ));
    return;
  }

  const seen = new Set<string>();
  if (link.resolvedCriterionIds.length === 0) {
    issues.push(issue(
      "invalid-resolved-criterion",
      `${path}.resolvedCriterionIds`,
      "A curricular link must resolve at least one criterion."
    ));
  }
  link.resolvedCriterionIds.forEach((criterionId, criterionIndex) => {
    if (seen.has(criterionId)) {
      issues.push(issue(
        "duplicate-resolved-criterion",
        `${path}.resolvedCriterionIds[${criterionIndex}]`,
        "Resolved criterion identifiers must be deduplicated."
      ));
    } else if (!criterionIds.has(criterionId)) {
      issues.push(issue(
        "invalid-resolved-criterion",
        `${path}.resolvedCriterionIds[${criterionIndex}]`,
        "Resolved criterion is not linked by the selected basic knowledge."
      ));
    }
    seen.add(criterionId);
  });
}

function collectUniqueIds(
  values: readonly { readonly id: string }[],
  path: string,
  issues: CurriculumValidationIssue[]
): Set<string> {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      issues.push(issue(
        "duplicate-internal-id",
        `${path}[${index}].id`,
        `Internal identifier ${value.id} is duplicated.`
      ));
    }
    ids.add(value.id);
  });
  return ids;
}

function validateGlobalInternalIds(
  data: VersionedCurriculumData,
  issues: CurriculumValidationIssue[]
): void {
  const pathsById = new Map<string, string>();
  const register = (id: string, path: string) => {
    const previousPath = pathsById.get(id);
    if (previousPath) {
      issues.push(issue(
        "duplicate-internal-id",
        path,
        `Internal identifier ${id} is already used at ${previousPath}.`
      ));
    } else {
      pathsById.set(id, path);
    }
  };

  data.packs.forEach((pack, packIndex) => {
    register(pack.id, `packs[${packIndex}].id`);
    pack.subjects.forEach((subject, subjectIndex) => {
      const subjectPath = `packs[${packIndex}].subjects[${subjectIndex}]`;
      register(subject.id, `${subjectPath}.id`);
      subject.specificCompetences?.forEach((competence, competenceIndex) => {
        register(competence.id, `${subjectPath}.specificCompetences[${competenceIndex}].id`);
      });
      subject.criteria.forEach((criterion, criterionIndex) => {
        register(criterion.id, `${subjectPath}.criteria[${criterionIndex}].id`);
      });
      subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
        register(knowledge.id, `${subjectPath}.basicKnowledge[${knowledgeIndex}].id`);
      });
    });
  });
  data.profiles.forEach((profile, profileIndex) => {
    register(profile.id, `profiles[${profileIndex}].id`);
    profile.ordinaryTracking.rules.forEach((rule, ruleIndex) => {
      register(rule.id, `profiles[${profileIndex}].ordinaryTracking.rules[${ruleIndex}].id`);
    });
  });
  data.actionLinks.forEach((link, linkIndex) => {
    register(link.id, `actionLinks[${linkIndex}].id`);
  });
}

function rejectExternalCodeIdentity(
  value: { readonly id: string; readonly externalCode?: string },
  path: string,
  issues: CurriculumValidationIssue[]
): void {
  if (value.externalCode && value.externalCode === value.id) {
    issues.push(issue(
      "external-code-used-as-identity",
      `${path}.externalCode`,
      "External codes cannot be used as the stable internal identity."
    ));
  }
}

function issue(
  code: CurriculumValidationIssueCode,
  path: string,
  message: string,
  severity: CurriculumValidationIssue["severity"] = "error"
): CurriculumValidationIssue {
  return { code, severity, path, message };
}

function safeSnapshot(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return "[unserializable curriculum data]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
