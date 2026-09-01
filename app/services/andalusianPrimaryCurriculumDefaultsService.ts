import { PRIMARY_CURRICULUM_ACTION_IDS } from "../data/primaryCurriculumActions";
import type { Action } from "../types/action";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type CurriculumSubject,
  type OrdinaryTrackingRule,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { SUBJECT_IDS } from "../types/subject";
import type { AndalusianPrimaryCurriculumCourse } from "./andalusianPrimaryCurriculumService";
import { applyAndalusianLanguageCurriculumDefaults } from "./andalusianLanguageCurriculumDefaultsService";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import { getEligibleActionsForCurriculumSubject } from "./curriculumAssistantService";
import { validateCurriculumData } from "./curriculumValidationService";

const SOURCE_ID = "CVE:00284747";

type LinkSpec = {
  readonly subjectId: string;
  readonly actionId: string;
  readonly criterionCode: string;
  readonly knowledgeCode: string;
  readonly effect: "positive" | "contrary";
  readonly recordingMode: "manual" | "ordinary";
};

type RuleSpec = {
  readonly subjectId: string;
  readonly knowledgeCode: string;
  readonly observableActionId: string;
  readonly contraryActionId: string;
};

/**
 * Activates the complete official course and adds only the daily observables
 * whose relation was reviewed against the literal BOJA table. Contextual
 * actions remain manual; absence of a press is never treated as an opportunity.
 */
export function applyAndalusianPrimaryCurriculumDefaults(
  state: CurriculumAssistantState,
  course: AndalusianPrimaryCurriculumCourse,
  actionCatalog: readonly Action[],
  occurredAt: string
): CurriculumAssistantState {
  const languagePrepared = applyAndalusianLanguageCurriculumDefaults(
    state,
    course,
    actionCatalog,
    occurredAt
  );
  const pack = languagePrepared.catalog.pack;
  const profile = languagePrepared.profile;
  if (
    !pack
    || !profile
    || pack.provenance.sourceId !== SOURCE_ID
    || pack.course !== `${course}.º de Primaria`
  ) {
    throw new Error("El catálogo no es el paquete oficial completo seleccionado.");
  }

  const { links: specs, rules: ruleSpecs } = createSpecs(pack.subjects, course);
  const addedLinks = specs.map((spec) => resolveLink(pack.subjects, profile.id, spec, actionCatalog, occurredAt));
  const allLinks = [...languagePrepared.actionLinks, ...addedLinks];
  const rules = [
    ...profile.ordinaryTracking.rules,
    ...ruleSpecs.map((spec) => resolveRule(pack.subjects, profile.id, spec)),
  ];
  const nextProfile = {
    ...profile,
    status: "active" as const,
    selectedSubjectIds: pack.subjects.map((subject) => subject.id),
    ordinaryTracking: {
      enabled: true,
      minimumSessionDurationMinutes: 0,
      rules,
    },
    updatedAt: occurredAt,
  };
  const next: CurriculumAssistantState = {
    ...languagePrepared,
    revision: languagePrepared.revision + 1,
    wizardStep: 3,
    trackingEnabled: true,
    profile: nextProfile,
    actionLinks: allLinks,
    updatedAt: occurredAt,
  };
  const aggregate: VersionedCurriculumData = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: next.classroomId,
      status: "active",
      activeProfileId: profile.id,
    },
    packs: [pack],
    profiles: [nextProfile],
    actionLinks: allLinks,
  };
  const validation = validateCurriculumData(aggregate, actionCatalog.map((action) => action.id));
  if (!validation.valid) {
    const firstError = validation.issues.find((issue) => issue.severity === "error")?.message;
    throw new Error(`Las propuestas de Primaria no han superado la validación curricular: ${firstError ?? "error desconocido"}`);
  }
  return deepFreeze(JSON.parse(JSON.stringify(next)) as CurriculumAssistantState);
}

function createSpecs(
  subjects: readonly CurriculumSubject[],
  course: AndalusianPrimaryCurriculumCourse
): { readonly links: readonly LinkSpec[]; readonly rules: readonly RuleSpec[] } {
  const suffix = course % 2 === 1 ? "a" : "b";
  const cycle = course <= 2 ? 1 : course <= 4 ? 2 : 3;
  const links: LinkSpec[] = [];
  const rules: RuleSpec[] = [];
  const addPair = (
    subjectId: string,
    knowledgeCode: string,
    criterionCode: string,
    contraryActionId: string,
    observableActionId: string
  ) => {
    links.push(
      { subjectId, actionId: contraryActionId, criterionCode, knowledgeCode, effect: "contrary", recordingMode: "ordinary" },
      { subjectId, actionId: observableActionId, criterionCode, knowledgeCode, effect: "positive", recordingMode: "manual" }
    );
    rules.push({ subjectId, knowledgeCode, observableActionId, contraryActionId });
  };

  const mathKnowledge = cycle === 1 ? "MAT.1.F.1.4" : `MAT.${cycle}.F.1.2`;
  addPair(
    SUBJECT_IDS.MATHEMATICS,
    mathKnowledge,
    `7.2.${suffix}`,
    PRIMARY_CURRICULUM_ACTION_IDS.MATH_ABANDONS_AT_FIRST_DIFFICULTY,
    PRIMARY_CURRICULUM_ACTION_IDS.MATH_PERSEVERES_WITH_CHALLENGE
  );
  links.push(
    manual(SUBJECT_IDS.MATHEMATICS, PRIMARY_CURRICULUM_ACTION_IDS.MATH_VALUES_ERROR, `7.2.${suffix}`, mathKnowledge),
    manual(
      SUBJECT_IDS.MATHEMATICS,
      PRIMARY_CURRICULUM_ACTION_IDS.MATH_FULFILLS_TEAM_ROLE,
      `8.2.${suffix}`,
      cycle === 1 ? "MAT.1.F.2.4" : cycle === 2 ? "MAT.2.F.2.5" : "MAT.3.F.2.4"
    )
  );

  const scienceKnowledge = `CMN.${cycle}.A.1.2`;
  links.push(
    { subjectId: SUBJECT_IDS.ENVIRONMENTAL_STUDIES, actionId: PRIMARY_CURRICULUM_ACTION_IDS.SCIENCE_USES_INSTRUMENTS_UNSAFELY, criterionCode: `2.3.${suffix}`, knowledgeCode: scienceKnowledge, effect: "contrary", recordingMode: "manual" },
    manual(SUBJECT_IDS.ENVIRONMENTAL_STUDIES, PRIMARY_CURRICULUM_ACTION_IDS.SCIENCE_USES_INSTRUMENTS_SAFELY, `2.3.${suffix}`, scienceKnowledge),
    manual(SUBJECT_IDS.ENVIRONMENTAL_STUDIES, PRIMARY_CURRICULUM_ACTION_IDS.SCIENCE_REACHES_DIALOGUE_AGREEMENTS, `9.1.${suffix}`, `CMN.${cycle}.C.3.2`)
  );

  const peSocialKnowledge = cycle === 1 ? "EFI.1.D.3" : `EFI.${cycle}.D.2`;
  addPair(
    SUBJECT_IDS.PHYSICAL_EDUCATION,
    peSocialKnowledge,
    `3.2.${suffix}`,
    PRIMARY_CURRICULUM_ACTION_IDS.PE_BREAKS_AGREED_GAME_RULE,
    PRIMARY_CURRICULUM_ACTION_IDS.PE_RESPECTS_RULES_AND_FAIR_PLAY
  );
  links.push(manual(
    SUBJECT_IDS.PHYSICAL_EDUCATION,
    PRIMARY_CURRICULUM_ACTION_IDS.PE_RESOLVES_CONFLICT_WITH_DIALOGUE,
    `3.3.${suffix}`,
    peSocialKnowledge
  ));
  if (course === 3 || course === 4 || course === 6) {
    links.push(manual(
      SUBJECT_IDS.PHYSICAL_EDUCATION,
      PRIMARY_CURRICULUM_ACTION_IDS.PE_SHOWS_EFFORT_AND_PERSEVERANCE,
      `3.1.${suffix}`,
      `EFI.${cycle}.D.1`
    ));
  }

  addForeignLanguageSpecs(
    subjects,
    SUBJECT_IDS.ENGLISH,
    suffix,
    PRIMARY_CURRICULUM_ACTION_IDS.ENGLISH_INTERRUPTS_INTERACTION,
    PRIMARY_CURRICULUM_ACTION_IDS.ENGLISH_RESPECTS_TURN_TAKING,
    links,
    rules
  );
  if (findSubject(subjects, SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE)) {
    addForeignLanguageSpecs(
      subjects,
      SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE,
      suffix,
      PRIMARY_CURRICULUM_ACTION_IDS.SECOND_LANGUAGE_INTERRUPTS_INTERACTION,
      PRIMARY_CURRICULUM_ACTION_IDS.SECOND_LANGUAGE_RESPECTS_TURN_TAKING,
      links,
      rules
    );
  }

  const artKnowledge = `EAR.${cycle}.B.1`;
  links.push(
    manual(SUBJECT_IDS.ART_EDUCATION, PRIMARY_CURRICULUM_ACTION_IDS.ART_PARTICIPATES_RESPECTFULLY, `4.2.${suffix}`, artKnowledge),
    manual(SUBJECT_IDS.ART_EDUCATION, PRIMARY_CURRICULUM_ACTION_IDS.ART_FULFILLS_SHARED_ROLE, `4.1.${suffix}`, artKnowledge),
    manual(SUBJECT_IDS.ART_EDUCATION, PRIMARY_CURRICULUM_ACTION_IDS.ART_VALUES_OTHERS_WORK, `4.3.${suffix}`, artKnowledge)
  );

  if (findSubject(subjects, SUBJECT_IDS.CIVIC_VALUES)) {
    links.push(
      manual(SUBJECT_IDS.CIVIC_VALUES, PRIMARY_CURRICULUM_ACTION_IDS.VALUES_DIALOGUES_RESPECTFULLY, "1.3", "VCE.3.A.6"),
      manual(SUBJECT_IDS.CIVIC_VALUES, PRIMARY_CURRICULUM_ACTION_IDS.VALUES_LISTENS_WITH_EMPATHY, "2.6", "VCE.3.B.1"),
      manual(SUBJECT_IDS.CIVIC_VALUES, PRIMARY_CURRICULUM_ACTION_IDS.VALUES_PROMOTES_PEACEFUL_COEXISTENCE, "2.1", "VCE.3.B.4")
    );
  }
  return { links, rules };
}

function addForeignLanguageSpecs(
  subjects: readonly CurriculumSubject[],
  subjectId: string,
  suffix: "a" | "b",
  contraryActionId: string,
  observableActionId: string,
  links: LinkSpec[],
  rules: RuleSpec[]
): void {
  const subject = requireSubject(subjects, subjectId);
  const criterionCode = `3.1.${suffix}`;
  const criterion = subject.criteria.find((candidate) => candidate.externalCode === criterionCode);
  const knowledge = subject.basicKnowledge.find((candidate) =>
    (candidate.externalCode?.endsWith(".A.9") || candidate.externalCode?.endsWith(".A.10"))
    && criterion !== undefined
    && candidate.criterionIds.includes(criterion.id)
  );
  if (!knowledge?.externalCode) throw new Error("Faltan las convenciones conversacionales oficiales.");
  links.push(
    { subjectId, actionId: contraryActionId, criterionCode, knowledgeCode: knowledge.externalCode, effect: "contrary", recordingMode: "ordinary" },
    manual(subjectId, observableActionId, criterionCode, knowledge.externalCode)
  );
  rules.push({ subjectId, knowledgeCode: knowledge.externalCode, observableActionId, contraryActionId });
}

function manual(
  subjectId: string,
  actionId: string,
  criterionCode: string,
  knowledgeCode: string
): LinkSpec {
  return { subjectId, actionId, criterionCode, knowledgeCode, effect: "positive", recordingMode: "manual" };
}

function resolveLink(
  subjects: readonly CurriculumSubject[],
  profileId: string,
  spec: LinkSpec,
  actionCatalog: readonly Action[],
  occurredAt: string
): ActionCurricularLink {
  const subject = requireSubject(subjects, spec.subjectId);
  const action = actionCatalog.find((candidate) => candidate.id === spec.actionId && !candidate.archived);
  const knowledge = subject.basicKnowledge.find((candidate) => candidate.externalCode === spec.knowledgeCode);
  const criterion = subject.criteria.find((candidate) => candidate.externalCode === spec.criterionCode);
  if (!action || !getEligibleActionsForCurriculumSubject([action], subject).length) {
    throw new Error(`Falta la propuesta editable ${spec.actionId} en ${subject.name}.`);
  }
  if (!knowledge || !criterion || !knowledge.criterionIds.includes(criterion.id)) {
    throw new Error(`La relación oficial ${spec.knowledgeCode} → ${spec.criterionCode} no está disponible.`);
  }
  return {
    id: stableId("link", profileId, subject.id, knowledge.id, action.id),
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    actionId: action.id,
    profileId,
    subjectId: subject.id,
    basicKnowledgeId: knowledge.id,
    resolvedCriterionIds: [criterion.id],
    effect: spec.effect,
    recordingMode: spec.recordingMode,
    enabled: true,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function resolveRule(
  subjects: readonly CurriculumSubject[],
  profileId: string,
  spec: RuleSpec
): OrdinaryTrackingRule {
  const subject = requireSubject(subjects, spec.subjectId);
  const knowledge = subject.basicKnowledge.find((candidate) => candidate.externalCode === spec.knowledgeCode);
  if (!knowledge) throw new Error(`No existe el saber ${spec.knowledgeCode}.`);
  return {
    id: stableId("rule", profileId, subject.id, knowledge.id, spec.observableActionId),
    subjectId: subject.id,
    basicKnowledgeId: knowledge.id,
    observableActionId: spec.observableActionId,
    contraryActionIds: [spec.contraryActionId],
    enabled: true,
  };
}

function requireSubject(subjects: readonly CurriculumSubject[], subjectId: string): CurriculumSubject {
  const subject = findSubject(subjects, subjectId);
  if (!subject) throw new Error(`Falta la asignatura oficial ${subjectId}.`);
  return subject;
}

function findSubject(
  subjects: readonly CurriculumSubject[],
  subjectId: string
): CurriculumSubject | undefined {
  return subjects.find((candidate) =>
    candidate.id === subjectId
    || candidate.legacySubjectId === subjectId
    || (subjectId === SUBJECT_IDS.ART_EDUCATION && candidate.externalCode === "EAR")
  );
}

function stableId(kind: string, ...parts: readonly string[]): string {
  return `curriculum-primary-default-${createCurriculumDeterministicFingerprint({ kind, parts })}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
