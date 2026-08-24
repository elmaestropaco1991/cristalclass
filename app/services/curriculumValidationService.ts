import type {
  ActionCurricularLink,
  CurriculumMigrationConflict,
  CurriculumModuleStatus,
  VersionedCurriculumData,
} from "../types/curriculum";

export type CurriculumValidationIssueCode =
  | "duplicate-internal-id"
  | "external-code-used-as-identity"
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
  const issues: CurriculumValidationIssue[] = [];
  validateGlobalInternalIds(data, issues);
  const actionIds = new Set(knownActionIds);
  const packIds = collectUniqueIds(data.packs, "packs", issues);
  const profileIds = collectUniqueIds(data.profiles, "profiles", issues);
  collectUniqueIds(data.actionLinks, "actionLinks", issues);

  const subjectsByPack = new Map<string, Map<string, {
    criterionIds: Set<string>;
    basicKnowledge: Map<string, Set<string>>;
  }>>();

  data.packs.forEach((pack, packIndex) => {
    if (!packIds.has(pack.id)) return;

    const subjectIds = collectUniqueIds(pack.subjects, `packs[${packIndex}].subjects`, issues);
    const subjects = new Map<string, {
      criterionIds: Set<string>;
      basicKnowledge: Map<string, Set<string>>;
    }>();

    pack.subjects.forEach((subject, subjectIndex) => {
      const subjectPath = `packs[${packIndex}].subjects[${subjectIndex}]`;
      rejectExternalCodeIdentity(subject, subjectPath, issues);
      const criterionIds = collectUniqueIds(subject.criteria, `${subjectPath}.criteria`, issues);
      const basicKnowledgeIds = collectUniqueIds(
        subject.basicKnowledge,
        `${subjectPath}.basicKnowledge`,
        issues
      );
      const basicKnowledge = new Map<string, Set<string>>();

      subject.criteria.forEach((criterion, criterionIndex) => {
        rejectExternalCodeIdentity(
          criterion,
          `${subjectPath}.criteria[${criterionIndex}]`,
          issues
        );
      });
      subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
        const knowledgePath = `${subjectPath}.basicKnowledge[${knowledgeIndex}]`;
        rejectExternalCodeIdentity(knowledge, knowledgePath, issues);
        const references = new Set<string>();

        if (knowledge.criterionIds.length === 0) {
          issues.push(issue(
            "missing-criterion-reference",
            `${knowledgePath}.criterionIds`,
            "Basic knowledge must reference at least one criterion."
          ));
        }

        knowledge.criterionIds.forEach((criterionId, criterionIndex) => {
          if (!criterionIds.has(criterionId)) {
            issues.push(issue(
              "missing-criterion-reference",
              `${knowledgePath}.criterionIds[${criterionIndex}]`,
              `Criterion ${criterionId} does not exist in subject ${subject.id}.`
            ));
          } else {
            references.add(criterionId);
          }
        });
        if (basicKnowledgeIds.has(knowledge.id)) basicKnowledge.set(knowledge.id, references);
      });

      if (subjectIds.has(subject.id)) {
        subjects.set(subject.id, { criterionIds, basicKnowledge });
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
  });

  if (data.module.status === "active") {
    const activeProfile = data.module.activeProfileId
      ? profilesById.get(data.module.activeProfileId)
      : undefined;
    const activePackSubjects = activeProfile?.packId
      ? subjectsByPack.get(activeProfile.packId)
      : undefined;
    const hasValidSubject = activeProfile?.selectedSubjectIds
      .some((subjectId) => activePackSubjects?.has(subjectId)) === true;
    if (!activeProfile || !hasValidSubject) {
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

  return { valid: issues.length === 0, issues };
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
  message: string
): CurriculumValidationIssue {
  return { code, path, message };
}

function safeSnapshot(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return "[unserializable curriculum data]";
  }
}
