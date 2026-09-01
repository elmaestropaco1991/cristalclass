import { LANGUAGE_ACTION_IDS } from "../data/languageActions";
import type { Action } from "../types/action";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import {
  CURRICULUM_SCHEMA_VERSION,
  type ActionCurricularLink,
  type OrdinaryTrackingRule,
  type VersionedCurriculumData,
} from "../types/curriculum";
import { SUBJECT_IDS } from "../types/subject";
import type { AndalusianLanguageCurriculumCourse } from "./andalusianLanguageCurriculumService";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import { validateCurriculumData } from "./curriculumValidationService";

const SOURCE_ID = "CVE:00284747";

type CuratedLink = {
  readonly actionId: string;
  readonly criterionCode: string;
  readonly knowledgeCode: string;
  readonly effect: "positive" | "contrary";
  readonly recordingMode: "manual" | "ordinary";
};

/**
 * Adds CristalClass's reviewed observables to a freshly imported official pack.
 * It refuses to merge into an edited draft so existing teacher decisions are
 * never silently replaced.
 */
export function applyAndalusianLanguageCurriculumDefaults(
  state: CurriculumAssistantState,
  course: AndalusianLanguageCurriculumCourse,
  actionCatalog: readonly Action[],
  occurredAt: string
): CurriculumAssistantState {
  const pack = state.catalog.pack;
  const profile = state.profile;
  const subject = pack?.subjects.find(
    (candidate) => candidate.legacySubjectId === SUBJECT_IDS.LANGUAGE
  );
  if (
    !pack
    || pack.provenance.sourceId !== SOURCE_ID
    || pack.course !== `${course}.º de Primaria`
    || !profile
    || !subject
  ) {
    throw new Error("El catálogo no es el paquete oficial de Lengua seleccionado.");
  }
  if (
    state.actionLinks.length > 0
    || profile.ordinaryTracking.rules.length > 0
    || profile.selectedSubjectIds.length > 0
  ) {
    throw new Error("El borrador ya contiene decisiones y no se ha sobrescrito.");
  }

  const requiredActions = getRequiredActions(actionCatalog);
  const criterion32 = course % 2 === 1 ? "3.2.a" : "3.2.b";
  const criterion102 = course % 2 === 1 ? "10.2.a" : "10.2.b";
  const cycle = course <= 2 ? 1 : course <= 4 ? 2 : 3;
  const interactionKnowledgeCode = `LCL.${cycle}.B.3.1`;
  const curatedLinks: readonly CuratedLink[] = [
    {
      actionId: LANGUAGE_ACTION_IDS.INTERRUPTS,
      criterionCode: criterion32,
      knowledgeCode: interactionKnowledgeCode,
      effect: "contrary",
      recordingMode: "ordinary",
    },
    {
      actionId: LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION,
      criterionCode: criterion32,
      knowledgeCode: interactionKnowledgeCode,
      effect: "contrary",
      recordingMode: "ordinary",
    },
    {
      actionId: LANGUAGE_ACTION_IDS.RESPECTS_TURNS,
      criterionCode: criterion32,
      knowledgeCode: interactionKnowledgeCode,
      effect: "positive",
      recordingMode: "manual",
    },
    {
      actionId: LANGUAGE_ACTION_IDS.ACTIVE_LISTENING_PARTICIPATION,
      criterionCode: criterion32,
      knowledgeCode: interactionKnowledgeCode,
      effect: "positive",
      recordingMode: "manual",
    },
    {
      actionId: LANGUAGE_ACTION_IDS.RESOLVES_CONFLICT_WITH_DIALOGUE,
      criterionCode: criterion102,
      knowledgeCode: interactionKnowledgeCode,
      effect: "positive",
      recordingMode: "manual",
    },
  ];
  const actionLinks = curatedLinks.map((link) => {
    const knowledge = subject.basicKnowledge.find(
      (candidate) => candidate.externalCode === link.knowledgeCode
    );
    const criterion = subject.criteria.find(
      (candidate) => candidate.externalCode === link.criterionCode
    );
    if (!knowledge || !criterion || !knowledge.criterionIds.includes(criterion.id)) {
      throw new Error(
        `La relación oficial ${link.knowledgeCode} → ${link.criterionCode} no está disponible.`
      );
    }
    return {
      id: stableId("link", profile.id, subject.id, knowledge.id, link.actionId),
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      actionId: link.actionId,
      profileId: profile.id,
      subjectId: subject.id,
      basicKnowledgeId: knowledge.id,
      resolvedCriterionIds: [criterion.id],
      effect: link.effect,
      recordingMode: link.recordingMode,
      enabled: true,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    } satisfies ActionCurricularLink;
  });
  const interactionKnowledgeId = actionLinks[0].basicKnowledgeId;
  const rules: readonly OrdinaryTrackingRule[] = [
    {
      id: stableId("rule-turns", profile.id, subject.id, interactionKnowledgeId),
      subjectId: subject.id,
      basicKnowledgeId: interactionKnowledgeId,
      observableActionId: LANGUAGE_ACTION_IDS.RESPECTS_TURNS,
      contraryActionIds: [LANGUAGE_ACTION_IDS.INTERRUPTS],
      enabled: true,
    },
    {
      id: stableId("rule-attention", profile.id, subject.id, interactionKnowledgeId),
      subjectId: subject.id,
      basicKnowledgeId: interactionKnowledgeId,
      observableActionId: LANGUAGE_ACTION_IDS.ACTIVE_LISTENING_PARTICIPATION,
      contraryActionIds: [LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION],
      enabled: true,
    },
  ];
  const nextProfile = {
    ...profile,
    status: "active" as const,
    selectedSubjectIds: [subject.id],
    ordinaryTracking: {
      enabled: true,
      minimumSessionDurationMinutes: 0,
      rules,
    },
    updatedAt: occurredAt,
  };
  const next: CurriculumAssistantState = {
    ...state,
    revision: state.revision + 1,
    trackingEnabled: true,
    wizardStep: 3,
    profile: nextProfile,
    actionLinks,
    updatedAt: occurredAt,
  };
  const aggregate: VersionedCurriculumData = {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: state.classroomId,
      status: "active",
      activeProfileId: profile.id,
    },
    packs: [pack],
    profiles: [nextProfile],
    actionLinks,
  };
  const validation = validateCurriculumData(
    aggregate,
    requiredActions.map((action) => action.id)
  );
  if (!validation.valid) {
    throw new Error("Las propuestas de Lengua no han superado la validación curricular.");
  }
  return deepFreeze(JSON.parse(JSON.stringify(next)) as CurriculumAssistantState);
}

function getRequiredActions(catalog: readonly Action[]): Action[] {
  const ids = Object.values(LANGUAGE_ACTION_IDS);
  return ids.map((id) => {
    const matches = catalog.filter((action) => action.id === id && !action.archived);
    if (matches.length !== 1) {
      throw new Error("Falta una propuesta de observación de Lengua.");
    }
    const action = matches[0];
    if (action.subjectId !== SUBJECT_IDS.LANGUAGE) {
      throw new Error("Una propuesta de Lengua pertenece a otra asignatura.");
    }
    const shouldBeNegative = id === LANGUAGE_ACTION_IDS.INTERRUPTS
      || id === LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION;
    if ((shouldBeNegative && action.points >= 0) || (!shouldBeNegative && action.points <= 0)) {
      throw new Error("Revisa el tipo positivo o negativo de una propuesta de Lengua.");
    }
    return action;
  });
}

function stableId(kind: string, ...parts: readonly string[]): string {
  return `curriculum-language-default-${createCurriculumDeterministicFingerprint({ kind, parts })}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
