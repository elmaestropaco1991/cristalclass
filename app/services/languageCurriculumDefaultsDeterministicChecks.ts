import { actions } from "../data/actions";
import { LANGUAGE_ACTION_IDS } from "../data/languageActions";
import { SUBJECT_IDS } from "../types/subject";
import {
  ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES,
  getAndalusianLanguageCurriculumPack,
  type AndalusianLanguageCurriculumCourse,
} from "./andalusianLanguageCurriculumService";
import { applyAndalusianLanguageCurriculumDefaults } from "./andalusianLanguageCurriculumDefaultsService";
import {
  confirmCurriculumAssistantImport,
  createCurriculumDataFromAssistantState,
  previewCurriculumAssistantImport,
} from "./curriculumAssistantService";
import {
  readCurriculumAssistantState,
  writeCurriculumAssistantState,
  type CurriculumAssistantStorageAdapter,
} from "./curriculumAssistantStorageService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import { validateCurriculumData } from "./curriculumValidationService";
import { hydrateActionCatalog } from "./actionCatalogStorageService";
import { getVisibleActionsForSubject } from "./actionSubjectService";

const CLASSROOM_ID = "language-defaults-check";
const INSTANT = "2026-08-31T12:00:00.000Z";

export type LanguageCurriculumDefaultsCheck = { name: string; passed: boolean };

export function runLanguageCurriculumDefaultsDeterministicChecks(): readonly LanguageCurriculumDefaultsCheck[] {
  const prepared = ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES.map(prepareCourse);
  const fourth = prepared[3];
  const fourthSubject = fourth.catalog.pack!.subjects[0];
  const criterionCodeById = new Map(
    fourthSubject.criteria.map((criterion) => [criterion.id, criterion.externalCode])
  );
  const linkByActionId = new Map(fourth.actionLinks.map((link) => [link.actionId, link]));
  const renamed = hydrateActionCatalog([{
    ...actions.find((action) => action.id === LANGUAGE_ACTION_IDS.INTERRUPTS)!,
    title: "Interrumpe",
    points: -3,
  }]);
  const rehydrated = hydrateActionCatalog(renamed);
  const storage = memoryStorage();
  const normalizedForFirstWrite = { ...fourth, revision: 1 };
  const written = writeCurriculumAssistantState(storage, normalizedForFirstWrite, 0, INSTANT);
  const reopened = readCurriculumAssistantState(storage, CLASSROOM_ID);

  return [
    check("all six official courses activate Language with the reviewed defaults", () =>
      prepared.every((state) => state.trackingEnabled
        && state.profile?.status === "active"
        && state.profile.selectedSubjectIds.length === 1
        && state.actionLinks.length === 5
        && state.profile.ordinaryTracking.rules.length === 2)),
    check("ordinary grading begins with the first valid session and no invented duration", () =>
      prepared.every((state) =>
        state.profile?.ordinaryTracking.enabled === true
        && state.profile.ordinaryTracking.minimumSessionDurationMinutes === 0)),
    check("turn and attention rules use different positive and contrary observations", () => {
      const rules = fourth.profile!.ordinaryTracking.rules;
      return rules[0].observableActionId === LANGUAGE_ACTION_IDS.RESPECTS_TURNS
        && rules[0].contraryActionIds.join() === LANGUAGE_ACTION_IDS.INTERRUPTS
        && rules[1].observableActionId === LANGUAGE_ACTION_IDS.ACTIVE_LISTENING_PARTICIPATION
        && rules[1].contraryActionIds.join() === LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION;
    }),
    check("daily observables resolve only the exact 3.2 criterion subset", () => [
      LANGUAGE_ACTION_IDS.INTERRUPTS,
      LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION,
      LANGUAGE_ACTION_IDS.RESPECTS_TURNS,
      LANGUAGE_ACTION_IDS.ACTIVE_LISTENING_PARTICIPATION,
    ].every((actionId) => {
      const link = linkByActionId.get(actionId);
      return link?.resolvedCriterionIds.length === 1
        && criterionCodeById.get(link.resolvedCriterionIds[0]) === "3.2.b";
    })),
    check("dialogue conflict observation resolves only criterion 10.2", () => {
      const link = linkByActionId.get(LANGUAGE_ACTION_IDS.RESOLVES_CONFLICT_WITH_DIALOGUE);
      return link?.resolvedCriterionIds.length === 1
        && criterionCodeById.get(link.resolvedCriterionIds[0]) === "10.2.b";
    }),
    check("ordinary links are limited to the two negative absence-of-incident measures", () =>
      fourth.actionLinks.filter((link) => link.recordingMode === "ordinary")
        .map((link) => link.actionId).sort().join("|")
      === [
        LANGUAGE_ACTION_IDS.INTERRUPTS,
        LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION,
      ].sort().join("|")),
    check("prepared aggregate passes full curriculum validation", () =>
      validateCurriculumData(
        createCurriculumDataFromAssistantState(fourth),
        actions.map((action) => action.id)
      ).valid),
    check("assistant storage accepts and reopens ordinary rules exactly", () =>
      written.status === "written"
      && reopened.status === "valid"
      && JSON.stringify(reopened.envelope.state) === JSON.stringify(normalizedForFirstWrite)),
    check("additive action migration preserves teacher edits and adds each proposal once", () =>
      renamed.find((action) => action.id === LANGUAGE_ACTION_IDS.INTERRUPTS)?.title === "Interrumpe"
      && renamed.find((action) => action.id === LANGUAGE_ACTION_IDS.INTERRUPTS)?.points === -3
      && Object.values(LANGUAGE_ACTION_IDS).every((id) =>
        renamed.filter((action) => action.id === id).length === 1)
      && JSON.stringify(rehydrated) === JSON.stringify(renamed)),
    check("Language proposals appear in Language and never leak into the Aula context", () =>
      Object.values(LANGUAGE_ACTION_IDS).every((id) =>
        getVisibleActionsForSubject(renamed, SUBJECT_IDS.LANGUAGE)
          .some((action) => action.id === id)
        && !getVisibleActionsForSubject(renamed, SUBJECT_IDS.GENERAL)
          .some((action) => action.id === id))),
  ];
}

function prepareCourse(course: AndalusianLanguageCurriculumCourse) {
  const pack = getAndalusianLanguageCurriculumPack(course);
  const parsed = parseCurriculumPackJson(
    serializeCurriculumPackToJson(pack, INSTANT, { exporterVersion: "checks" })
  );
  if (parsed.status !== "valid") throw new Error("Official pack did not parse.");
  const preview = previewCurriculumAssistantImport(CLASSROOM_ID, parsed as CurriculumPackJsonValidResult);
  const imported = confirmCurriculumAssistantImport(CLASSROOM_ID, preview, INSTANT);
  return applyAndalusianLanguageCurriculumDefaults(imported, course, actions, INSTANT);
}

function memoryStorage(): CurriculumAssistantStorageAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function check(name: string, predicate: () => boolean): LanguageCurriculumDefaultsCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
