import { SUBJECT_CATALOG } from "../data/subjects";
import { actions } from "../data/actions";
import type { Action } from "../types/action";
import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumSubject,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { planCurriculumMigration } from "./curriculumMigrationService";
import {
  changeCurriculumModuleStatus,
  conflictsFromUnknownCurriculumData,
  getEffectiveCriterionRelations,
  validateCurriculumData,
} from "./curriculumValidationService";

export type CurriculumMigrationDeterministicCheck = {
  readonly name: string;
  readonly passed: boolean;
};

const PLANNED_AT = "2026-08-24T10:00:00.000Z";

export function runCurriculumMigrationDeterministicChecks(): readonly CurriculumMigrationDeterministicCheck[] {
  const subject = createValidSubject();
  const action = createLegacyAction();
  const data = createValidData(subject, action.id);
  const planInput = {
    classroomId: "classroom-1",
    plannedAt: PLANNED_AT,
    legacyActions: [action],
    curriculumSubjects: [subject],
  };
  const plan = planCurriculumMigration(planInput);

  return [
    check("a valid neutral curriculum pack passes validation", () =>
      validateCurriculumData(data, [action.id]).valid),
    check("duplicate internal identifiers are rejected", () => {
      const invalid = {
        ...data,
        packs: [{
          ...data.packs[0],
          subjects: [subject, { ...subject }],
        }],
      };
      return validateCurriculumData(invalid, [action.id]).issues
        .some((issue) => issue.code === "duplicate-internal-id");
    }),
    check("knowledge cannot reference a missing criterion", () => {
      const invalidSubject = {
        ...subject,
        basicKnowledge: [{
          ...subject.basicKnowledge[0],
          criterionIds: ["criterion:missing"],
        }],
      };
      const invalid = createValidData(invalidSubject, action.id);
      return validateCurriculumData(invalid, [action.id]).issues
        .some((issue) => issue.code === "missing-criterion-reference");
    }),
    check("an active profile without subjects is rejected", () => {
      const invalid = {
        ...data,
        module: { ...data.module, status: "active" as const },
        profiles: [{ ...data.profiles[0], selectedSubjectIds: [] }],
      };
      return validateCurriculumData(invalid, [action.id]).issues
        .some((issue) => issue.code === "active-module-without-subject");
    }),
    check("an empty curriculum subject is not ready for activation", () => {
      const emptySubject: CurriculumSubject = {
        ...subject,
        id: "curriculum-subject:empty",
        specificCompetences: [],
        criteria: [],
        basicKnowledge: [],
      };
      const onlyEmpty = {
        ...data,
        packs: [{ ...data.packs[0], subjects: [emptySubject] }],
        profiles: [{ ...data.profiles[0], selectedSubjectIds: [emptySubject.id] }],
        actionLinks: [],
      };
      const mixedSelection = {
        ...data,
        packs: [{ ...data.packs[0], subjects: [subject, emptySubject] }],
        profiles: [{
          ...data.profiles[0],
          selectedSubjectIds: [subject.id, emptySubject.id],
        }],
      };
      return validateCurriculumData(onlyEmpty, [action.id]).issues
        .some((issue) => issue.code === "active-module-without-subject")
        && validateCurriculumData(mixedSelection, [action.id]).issues
          .some((issue) => issue.code === "active-module-without-subject");
    }),
    check("deactivation retains packs profiles and links", () => {
      const inactive = changeCurriculumModuleStatus(data, "inactive");
      const configured = changeCurriculumModuleStatus(data, "configured");
      return inactive.module.status === "inactive"
        && inactive.module.activeProfileId === null
        && configured.module.status === "configured"
        && configured.module.activeProfileId === null
        && JSON.stringify(inactive.packs) === JSON.stringify(data.packs)
        && JSON.stringify(inactive.profiles) === JSON.stringify(data.profiles)
        && JSON.stringify(inactive.actionLinks) === JSON.stringify(data.actionLinks)
        && JSON.stringify(configured.packs) === JSON.stringify(data.packs)
        && JSON.stringify(configured.profiles) === JSON.stringify(data.profiles)
        && JSON.stringify(configured.actionLinks) === JSON.stringify(data.actionLinks);
    }),
    check("migration planning does not mutate inputs", () => {
      const snapshot = JSON.stringify(planInput);
      planCurriculumMigration(planInput);
      return JSON.stringify(planInput) === snapshot;
    }),
    check("the same migration inputs produce the same plan", () =>
      JSON.stringify(planCurriculumMigration(planInput))
        === JSON.stringify(planCurriculumMigration(planInput))),
    check("repeated planning never duplicates proposed links", () => {
      const repeatedPlan = planCurriculumMigration({
        ...planInput,
        plannedAt: "2026-08-25T10:00:00.000Z",
      });
      return repeatedPlan.proposedLinks.length === 1
        && new Set(repeatedPlan.proposedLinks.map((link) => link.id)).size === 1
        && repeatedPlan.proposedPack.id === plan.proposedPack.id
        && repeatedPlan.proposedProfile.id === plan.proposedProfile.id
        && repeatedPlan.proposedLinks[0].id === plan.proposedLinks[0].id;
    }),
    check("multiple knowledge routes to one criterion have one effective relation", () => {
      const first = data.actionLinks[0];
      const secondKnowledge = {
        id: "knowledge:music:2",
        text: "Segundo saber válido.",
        criterionIds: [subject.criteria[0].id],
      };
      const subjectWithTwoRoutes = {
        ...subject,
        basicKnowledge: [...subject.basicKnowledge, secondKnowledge],
      };
      const second = { ...first, id: "link-2", basicKnowledgeId: secondKnowledge.id };
      const dataWithTwoRoutes = {
        ...data,
        packs: [{ ...data.packs[0], subjects: [subjectWithTwoRoutes] }],
        actionLinks: [first, second],
      };
      return validateCurriculumData(dataWithTwoRoutes, [action.id]).valid
        && getEffectiveCriterionRelations([first, second]).length === 1;
    }),
    check("incomplete legacy references become explicit conflicts", () => {
      const conflicted = planCurriculumMigration({
        ...planInput,
        legacyActions: [{
          ...action,
          attitudinalCriterionLinks: [{ criterionId: "criterion-without-version" }],
        }],
      });
      return conflicted.conflicts.some((conflict) => conflict.kind === "missing-criterion");
    }),
    check("the seven provisional subject identifiers are preserved", () =>
      JSON.stringify(plan.preservedLegacySubjectIds)
        === JSON.stringify(SUBJECT_CATALOG.map((candidate) => candidate.id))),
    check("migration preview performs no localStorage writes", () =>
      verifyNoLocalStorageWrites(planInput)),
    check("legacy curricular fields remain untouched", () => {
      const snapshot = JSON.stringify({
        subjectId: action.subjectId,
        availableInAllSubjects: action.availableInAllSubjects,
        attitudinalCriterionLinks: action.attitudinalCriterionLinks,
        trackOrdinaryCompliance: action.trackOrdinaryCompliance,
      });
      planCurriculumMigration(planInput);
      return JSON.stringify({
        subjectId: action.subjectId,
        availableInAllSubjects: action.availableInAllSubjects,
        attitudinalCriterionLinks: action.attitudinalCriterionLinks,
        trackOrdinaryCompliance: action.trackOrdinaryCompliance,
      }) === snapshot && plan.application.preservesLegacyActionFields;
    }),
    check("corrupt curriculum data is reported rather than discarded", () => {
      const corrupt = { unexpected: true, nested: { retained: "value" } };
      const conflicts = conflictsFromUnknownCurriculumData([corrupt]);
      return conflicts.length === 1
        && conflicts[0].kind === "invalid-existing-data"
        && conflicts[0].sourceSnapshot?.includes("retained") === true;
    }),
    check("conceptual rollback retains every curriculum configuration", () => {
      const rolledBack = changeCurriculumModuleStatus(data, "inactive");
      const reactivated = {
        ...rolledBack,
        module: {
          ...rolledBack.module,
          status: "active" as const,
          activeProfileId: data.module.activeProfileId,
        },
      };
      return validateCurriculumData(reactivated, [action.id]).valid
        && JSON.stringify(reactivated.packs) === JSON.stringify(data.packs)
        && JSON.stringify(reactivated.actionLinks) === JSON.stringify(data.actionLinks);
    }),
    check("legacy action order does not affect generated identifiers", () => {
      const secondAction = { ...action, id: "legacy-music-action-2", points: 1 };
      const secondSubject: CurriculumSubject = {
        id: "curriculum-subject:mathematics",
        legacySubjectId: "mathematics",
        name: "Matemáticas",
        specificCompetences: [],
        criteria: [],
        basicKnowledge: [],
      };
      const firstOrder = planCurriculumMigration({
        ...planInput,
        legacyActions: [action, secondAction],
        curriculumSubjects: [subject, secondSubject],
      });
      const actionOrderChanged = planCurriculumMigration({
        ...planInput,
        legacyActions: [secondAction, action],
        curriculumSubjects: [subject, secondSubject],
      });
      return firstOrder.id === actionOrderChanged.id
        && firstOrder.sourceFingerprint === actionOrderChanged.sourceFingerprint
        && firstOrder.proposedPack.id === actionOrderChanged.proposedPack.id
        && firstOrder.proposedProfile.id === actionOrderChanged.proposedProfile.id
        && JSON.stringify(firstOrder.proposedLinks.map((link) => link.id))
          === JSON.stringify(actionOrderChanged.proposedLinks.map((link) => link.id));
    }),
    check("pedagogical subject and entity order is preserved and remains identity-significant", () => {
      const secondCompetence = {
        id: "competence:music:2",
        sourceVersion: "legacy-v1",
        text: "Segunda competencia en orden pedagógico.",
      };
      const orderedSubject: CurriculumSubject = {
        ...subject,
        specificCompetences: [secondCompetence, ...subject.specificCompetences!],
        criteria: [...subject.criteria].reverse(),
        basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
          ...knowledge,
          criterionIds: [...knowledge.criterionIds].reverse(),
        })),
      };
      const ordered = planCurriculumMigration({ ...planInput, curriculumSubjects: [orderedSubject] });
      const reordered = planCurriculumMigration({
        ...planInput,
        curriculumSubjects: [{
          ...orderedSubject,
          specificCompetences: [...orderedSubject.specificCompetences!].reverse(),
        }],
      });
      const proposedSubject = ordered.proposedPack.subjects[0];
      return proposedSubject.id === orderedSubject.id
        && JSON.stringify(proposedSubject.specificCompetences?.map((item) => item.id))
          === JSON.stringify(orderedSubject.specificCompetences?.map((item) => item.id))
        && JSON.stringify(proposedSubject.criteria.map((item) => item.id))
          === JSON.stringify(orderedSubject.criteria.map((item) => item.id))
        && JSON.stringify(proposedSubject.basicKnowledge.map((item) => item.id))
          === JSON.stringify(orderedSubject.basicKnowledge.map((item) => item.id))
        && JSON.stringify(proposedSubject.basicKnowledge.map((item) => item.criterionIds))
          === JSON.stringify(orderedSubject.basicKnowledge.map((item) => item.criterionIds))
        && ordered.proposedPack.id !== reordered.proposedPack.id
        && proposedSubject.specificCompetences?.[0].sourceVersion === "legacy-v1";
    }),
    check("different classrooms cannot share a profile identity and empty identity is rejected", () => {
      const otherClassPlan = planCurriculumMigration({ ...planInput, classroomId: "classroom-2" });
      let emptyClassRejected = false;
      try {
        planCurriculumMigration({ ...planInput, classroomId: "   " });
      } catch {
        emptyClassRejected = true;
      }
      return otherClassPlan.proposedProfile.id !== plan.proposedProfile.id
        && otherClassPlan.proposedProfile.classroomId === "classroom-2"
        && emptyClassRejected
        && validateCurriculumData({
          ...data,
          profiles: [{ ...data.profiles[0], classroomId: "classroom-2" }],
        }, [action.id]).issues.some((issue) => issue.code === "profile-classroom-mismatch");
    }),
    check("global availability never invents missing curricular entities", () => {
      const globalAction = {
        ...action,
        subjectId: "general" as const,
        availableInAllSubjects: true,
        attitudinalCriterionLinks: [{
          criterionId: "UNKNOWN-CRITERION",
          catalogVersion: "legacy-v1",
        }],
      };
      const globalPlan = planCurriculumMigration({ ...planInput, legacyActions: [globalAction] });
      return globalPlan.proposedLinks.length === 0
        && globalPlan.conflicts.some((conflict) => conflict.kind === "missing-criterion");
    }),
    check("legacy catalog version must match before resolving a criterion", () => {
      const mismatched = {
        ...action,
        attitudinalCriterionLinks: [{
          criterionId: "MUS-1",
          catalogVersion: "different-version",
        }],
      };
      const mismatchedPlan = planCurriculumMigration({
        ...planInput,
        legacyActions: [mismatched],
      });
      return mismatchedPlan.proposedLinks.length === 0
        && mismatchedPlan.conflicts.some((conflict) => conflict.kind === "missing-criterion");
    }),
    check("one action linked to several criteria retains one effective relation per criterion", () => {
      const secondCriterion = {
        id: "criterion:music:2",
        externalCode: "MUS-2",
        specificCompetenceId: subject.specificCompetences![0].id,
        sourceVersion: "legacy-v1",
        text: "Segundo criterio de prueba.",
      };
      const multiCriterionSubject = {
        ...subject,
        criteria: [...subject.criteria, secondCriterion],
        basicKnowledge: [{
          ...subject.basicKnowledge[0],
          criterionIds: [subject.criteria[0].id, secondCriterion.id],
        }],
      };
      const multiCriterionAction = {
        ...action,
        attitudinalCriterionLinks: [
          ...action.attitudinalCriterionLinks,
          { criterionId: "MUS-2", catalogVersion: "legacy-v1" },
        ],
      };
      const multiCriterionPlan = planCurriculumMigration({
        ...planInput,
        legacyActions: [multiCriterionAction],
        curriculumSubjects: [multiCriterionSubject],
      });
      return multiCriterionPlan.proposedLinks.length === 2
        && getEffectiveCriterionRelations(multiCriterionPlan.proposedLinks).length === 2;
    }),
    check("duplicate legacy action identifiers become explicit conflicts", () => {
      const duplicatePlan = planCurriculumMigration({
        ...planInput,
        legacyActions: [action, { ...action }],
      });
      return duplicatePlan.proposedLinks.length === 0
        && duplicatePlan.conflicts.some((conflict) => conflict.kind === "duplicate-action");
    }),
    check("zero-point actions receive no invented curricular effect", () => {
      const zeroPointPlan = planCurriculumMigration({
        ...planInput,
        legacyActions: [{ ...action, points: 0 }],
      });
      return zeroPointPlan.proposedLinks.length === 0
        && zeroPointPlan.conflicts.some((conflict) => conflict.kind === "corrupt-action");
    }),
    check("links reject knowledge and criteria outside their declared route", () => {
      const wrongKnowledge = {
        ...data,
        actionLinks: [{ ...data.actionLinks[0], basicKnowledgeId: "knowledge:missing" }],
      };
      const wrongCriterion = {
        ...data,
        actionLinks: [{
          ...data.actionLinks[0],
          resolvedCriterionIds: ["criterion:missing"],
        }],
      };
      return validateCurriculumData(wrongKnowledge, [action.id]).issues
        .some((issue) => issue.code === "missing-basic-knowledge-reference")
        && validateCurriculumData(wrongCriterion, [action.id]).issues
          .some((issue) => issue.code === "invalid-resolved-criterion");
    }),
    check("curriculum validators never mutate their input", () => {
      const snapshot = JSON.stringify(data);
      validateCurriculumData(data, [action.id]);
      getEffectiveCriterionRelations(data.actionLinks);
      return JSON.stringify(data) === snapshot;
    }),
    check("manipulated states are rejected without throwing and timestamps are canonical", () => {
      const manipulated = {
        ...data,
        module: { ...data.module, classroomId: null },
      } as unknown as VersionedCurriculumData;
      const nonCanonicalTimestamp = {
        ...data,
        packs: [{ ...data.packs[0], updatedAt: "2026-08-24" }],
      };
      const manipulatedResult = validateCurriculumData(manipulated, [action.id]);
      const timestampResult = validateCurriculumData(nonCanonicalTimestamp, [action.id]);
      return !manipulatedResult.valid
        && manipulatedResult.issues.some((item) => item.code === "invalid-state")
        && !timestampResult.valid
        && timestampResult.issues.some((item) => item.code === "invalid-timestamp");
    }),
    check("legacy subjects remain incomplete without inferred competences", () => {
      const legacySubject: CurriculumSubject = {
        ...subject,
        specificCompetences: undefined,
        criteria: subject.criteria.map((criterion) => ({
          id: criterion.id,
          externalCode: criterion.externalCode,
          sourceVersion: criterion.sourceVersion,
          title: criterion.title,
          text: criterion.text,
        })),
      };
      const snapshot = JSON.stringify(legacySubject);
      const legacyPlan = planCurriculumMigration({
        ...planInput,
        curriculumSubjects: [Object.freeze(legacySubject)],
      });
      return legacyPlan.conflicts.some((item) => item.kind === "missing-specific-competence")
        && legacyPlan.proposedPack.subjects[0].specificCompetences === undefined
        && legacyPlan.proposedPack.subjects[0].criteria[0].specificCompetenceId === undefined
        && JSON.stringify(legacySubject) === snapshot;
    }),
    check("cross-subject competence references and future manual versions are rejected", () => {
      const otherSubject: CurriculumSubject = {
        id: "subject:other",
        name: "Otra",
        specificCompetences: [{ id: "competence:other", text: "Competencia ajena." }],
        criteria: [],
        basicKnowledge: [],
      };
      const crossed = {
        ...data,
        packs: [{
          ...data.packs[0],
          subjects: [{
            ...subject,
            criteria: [{
              ...subject.criteria[0],
              specificCompetenceId: "competence:other",
            }],
          }, otherSubject],
        }],
      };
      const future = {
        ...data,
        packs: [{
          ...data.packs[0],
          packageVersion: "manual-r2",
          provenance: { kind: "manual" as const },
          subjects: [{
            ...subject,
            specificCompetences: subject.specificCompetences!.map((item) => ({
              ...item,
              sourceVersion: "manual-r3",
            })),
            criteria: subject.criteria.map((item) => ({ ...item, sourceVersion: "manual-r2" })),
            basicKnowledge: subject.basicKnowledge.map((item) => ({ ...item, sourceVersion: "manual-r1" })),
          }],
        }],
      };
      return validateCurriculumData(crossed, [action.id]).issues.some((item) =>
        item.code === "cross-subject-specific-competence-reference"
      ) && validateCurriculumData(future, [action.id]).issues.some((item) =>
        item.code === "future-source-version"
      );
    }),
    check("competence code collisions block while repeated text remains an explicit warning", () => {
      const duplicateTextData: VersionedCurriculumData = {
        ...data,
        packs: data.packs.map((pack) => ({
          ...pack,
          subjects: pack.subjects.map((candidate) => ({
            ...candidate,
            specificCompetences: [
              ...candidate.specificCompetences!,
              {
                id: "competence:music:duplicate-text",
                externalCode: "MUS-CE2",
                sourceVersion: "legacy-v1",
                text: candidate.specificCompetences![0].text,
              },
            ],
          })),
        })),
      };
      const duplicateCodeData: VersionedCurriculumData = {
        ...duplicateTextData,
        packs: duplicateTextData.packs.map((pack) => ({
          ...pack,
          subjects: pack.subjects.map((candidate) => ({
            ...candidate,
            specificCompetences: candidate.specificCompetences!.map((item, index) =>
              index === 1
                ? { ...item, externalCode: candidate.specificCompetences![0].externalCode }
                : item
            ),
          })),
        })),
      };
      const textResult = validateCurriculumData(duplicateTextData, [action.id]);
      const codeResult = validateCurriculumData(duplicateCodeData, [action.id]);
      return textResult.valid
        && textResult.issues.some((item) =>
          item.code === "duplicate-specific-competence-text" && item.severity === "warning"
        )
        && !codeResult.valid
        && codeResult.issues.some((item) =>
          item.code === "duplicate-specific-competence-external-code"
          && item.severity === "error"
        );
    }),
    check("the real default action catalog produces no invented curricular links", () => {
      const defaultPlan = planCurriculumMigration({
        classroomId: "classroom-default-check",
        plannedAt: PLANNED_AT,
        legacyActions: actions,
      });
      return defaultPlan.proposedLinks.length === 0
        && defaultPlan.conflicts.length === 0
        && defaultPlan.preservedActionIds.length === actions.length
        && actions.every((candidate) => defaultPlan.preservedActionIds.includes(candidate.id));
    }),
  ];
}

function createValidSubject(): CurriculumSubject {
  return {
    id: "curriculum-subject:music",
    externalCode: "MUS",
    legacySubjectId: "music",
    name: "Música",
    specificCompetences: [{
      id: "competence:music:1",
      externalCode: "MUS-CE1",
      sourceVersion: "legacy-v1",
      text: "Competencia musical específica.",
    }],
    criteria: [{
      id: "criterion:music:1",
      externalCode: "MUS-1",
      specificCompetenceId: "competence:music:1",
      sourceVersion: "legacy-v1",
      title: "Criterio musical",
      text: "Texto curricular de prueba.",
    }],
    basicKnowledge: [{
      id: "knowledge:music:1",
      externalCode: "MUS-S1",
      text: "Saber musical de prueba.",
      criterionIds: ["criterion:music:1"],
    }],
  };
}

function createLegacyAction(): Action {
  return {
    id: "legacy-music-action",
    title: "Acción heredada",
    points: -2,
    archived: false,
    quickSlot: null,
    subjectId: "music",
    availableInAllSubjects: false,
    attitudinalCriterionLinks: [{
      criterionId: "MUS-1",
      catalogVersion: "legacy-v1",
    }],
    trackOrdinaryCompliance: false,
  };
}

function createValidData(
  subject: CurriculumSubject,
  actionId: string
): VersionedCurriculumData {
  const link: ActionCurricularLink = {
    id: "link-1",
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    actionId,
    profileId: "profile-1",
    subjectId: subject.id,
    basicKnowledgeId: subject.basicKnowledge[0].id,
    resolvedCriterionIds: [subject.criteria[0].id],
    effect: "contrary",
    recordingMode: "manual",
    enabled: true,
    createdAt: PLANNED_AT,
    updatedAt: PLANNED_AT,
  };

  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "classroom-1",
      status: "active",
      activeProfileId: "profile-1",
    },
    packs: [{
      id: "pack-1",
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      packageVersion: "1.0.0",
      name: "Paquete válido",
      provenance: { kind: "external" },
      createdAt: PLANNED_AT,
      updatedAt: PLANNED_AT,
      subjects: [subject],
    }],
    profiles: [{
      id: "profile-1",
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "classroom-1",
      packId: "pack-1",
      provenance: { kind: "manual" },
      status: "active",
      selectedSubjectIds: [subject.id],
      ordinaryTracking: {
        enabled: false,
        minimumSessionDurationMinutes: 0,
        rules: [],
      },
      createdAt: PLANNED_AT,
      updatedAt: PLANNED_AT,
    }],
    actionLinks: [link],
  };
}

function verifyNoLocalStorageWrites(
  input: Parameters<typeof planCurriculumMigration>[0]
): boolean {
  const globalObject = globalThis as typeof globalThis & { localStorage?: Storage };
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalObject, "localStorage");
  let reads = 0;
  let writes = 0;

  try {
    Object.defineProperty(globalObject, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { reads += 1; return null; },
        setItem: () => { writes += 1; },
      },
    });
    planCurriculumMigration(input);
    return reads === 0 && writes === 0;
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalObject, "localStorage", previousDescriptor);
    } else {
      Reflect.deleteProperty(globalObject, "localStorage");
    }
  }
}

function check(
  name: string,
  predicate: () => boolean
): CurriculumMigrationDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
