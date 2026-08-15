import { SUBJECT_IDS, type SubjectId } from "../types/subject";
import {
  createAction,
  updateActionConfiguration,
} from "./actionCatalogService";
import { hydrateActionCatalog } from "./actionCatalogStorageService";
import { getOrderedSubjectCatalog } from "./subjectCatalogService";

export type ActionContextConfigurationCheck = { name: string; passed: boolean };

export function runActionContextConfigurationDeterministicChecks(): readonly ActionContextConfigurationCheck[] {
  const newAction = createAction([], {
    id: "new-action",
    title: "Nueva acción",
    points: 1,
    iconId: "other-sparkles",
  })[0];
  const trackedNegative = createAction([], {
    id: "tracked-negative",
    title: "Incidencia observable",
    points: -2,
    icon: "🎵",
    iconId: "warnings-alert",
    quickSlot: 3,
    trackOrdinaryCompliance: true,
    attitudinalCriterionLinks: [{ criterionId: "future-criterion", catalogVersion: "future-v1" }],
  })[0];
  const catalog = [
    createAction([], { id: "before", title: "Anterior", points: 1 })[0],
    trackedNegative,
    createAction([], { id: "after", title: "Posterior", points: -1 })[0],
  ];
  const movedToMusic = updateActionConfiguration(catalog, trackedNegative.id, {
    title: trackedNegative.title,
    points: trackedNegative.points,
    iconId: trackedNegative.iconId,
    quickSlot: trackedNegative.quickSlot,
    archived: trackedNegative.archived,
    subjectId: SUBJECT_IDS.MUSIC,
    availableInAllSubjects: true,
    trackOrdinaryCompliance: true,
  });
  const musicAction = movedToMusic.find((action) => action.id === trackedNegative.id)!;
  const convertedToPositive = updateActionConfiguration(movedToMusic, trackedNegative.id, {
    title: musicAction.title,
    points: 2,
    iconId: musicAction.iconId,
    quickSlot: musicAction.quickSlot,
    archived: musicAction.archived,
    subjectId: musicAction.subjectId,
    availableInAllSubjects: musicAction.availableInAllSubjects,
    trackOrdinaryCompliance: true,
  }).find((action) => action.id === trackedNegative.id)!;
  const legacyAction = hydrateActionCatalog([{
    id: "legacy-local-action",
    title: "Acción local heredada",
    points: -1,
    icon: "🎶",
    archived: false,
    quickSlot: null,
  }])[0];
  const persistedOverride = hydrateActionCatalog([{
    id: "talking",
    title: "Nombre personalizado",
    points: -7,
    icon: "🎯",
    iconId: "custom-icon",
    archived: false,
    quickSlot: null,
    subjectId: SUBJECT_IDS.MUSIC,
    availableInAllSubjects: true,
    attitudinalCriterionLinks: [],
    trackOrdinaryCompliance: true,
  }])[0];
  let positiveTrackingRejected = false;
  let invalidSubjectRejectedInSpanish = false;

  try {
    createAction([], {
      id: "invalid-positive",
      title: "Positiva inválida",
      points: 1,
      trackOrdinaryCompliance: true,
    });
  } catch {
    positiveTrackingRejected = true;
  }

  try {
    updateActionConfiguration(catalog, trackedNegative.id, {
      title: trackedNegative.title,
      points: trackedNegative.points,
      iconId: trackedNegative.iconId,
      quickSlot: trackedNegative.quickSlot,
      archived: false,
      subjectId: "invalid-subject" as SubjectId,
      availableInAllSubjects: false,
      trackOrdinaryCompliance: true,
    });
  } catch (error) {
    invalidSubjectRejectedInSpanish = error instanceof Error
      && error.message === "Selecciona una asignatura válida.";
  }

  return [
    check("new actions begin in General", () =>
      newAction.subjectId === SUBJECT_IDS.GENERAL
      && newAction.availableInAllSubjects === false),
    check("editor subject options come from the ordered central catalog", () =>
      getOrderedSubjectCatalog().map((subject) => subject.id).join(",")
      === [
        SUBJECT_IDS.GENERAL,
        SUBJECT_IDS.LANGUAGE,
        SUBJECT_IDS.MATHEMATICS,
        SUBJECT_IDS.ENVIRONMENTAL_STUDIES,
        SUBJECT_IDS.ENGLISH,
        SUBJECT_IDS.MUSIC,
        SUBJECT_IDS.ART_EDUCATION,
      ].join(",")),
    check("editing preserves the selected subject", () =>
      musicAction.subjectId === SUBJECT_IDS.MUSIC),
    check("editing preserves global availability", () =>
      musicAction.availableInAllSubjects === true),
    check("General actions do not become global implicitly", () =>
      newAction.subjectId === SUBJECT_IDS.GENERAL && !newAction.availableInAllSubjects),
    check("ordinary compliance can only be created for negative actions", () =>
      trackedNegative.trackOrdinaryCompliance && positiveTrackingRejected),
    check("changing a tracked negative action to positive disables tracking", () =>
      convertedToPositive.points === 2 && !convertedToPositive.trackOrdinaryCompliance),
    check("a General action moves to Music without changing identity or presentation", () =>
      musicAction.id === trackedNegative.id
      && musicAction.title === trackedNegative.title
      && musicAction.icon === trackedNegative.icon
      && musicAction.iconId === trackedNegative.iconId
      && musicAction.points === trackedNegative.points
      && musicAction.quickSlot === trackedNegative.quickSlot
      && movedToMusic.map((action) => action.id).join(",") === catalog.map((action) => action.id).join(",")
      && musicAction.attitudinalCriterionLinks === trackedNegative.attitudinalCriterionLinks),
    check("legacy local actions still appear as General", () =>
      legacyAction.subjectId === SUBJECT_IDS.GENERAL
      && !legacyAction.availableInAllSubjects),
    check("persisted user values override catalog defaults", () =>
      persistedOverride.title === "Nombre personalizado"
      && persistedOverride.points === -7
      && persistedOverride.icon === "🎯"
      && persistedOverride.iconId === "custom-icon"
      && persistedOverride.subjectId === SUBJECT_IDS.MUSIC
      && persistedOverride.availableInAllSubjects
      && persistedOverride.trackOrdinaryCompliance),
    check("invalid subject configuration returns a comprehensible error", () =>
      invalidSubjectRejectedInSpanish),
    check("editing one context leaves unrelated actions untouched", () =>
      movedToMusic[0] === catalog[0] && movedToMusic[2] === catalog[2]),
  ];
}

function check(name: string, predicate: () => boolean): ActionContextConfigurationCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
