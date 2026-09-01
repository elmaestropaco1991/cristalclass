import { createEmptyCharacterEquipment } from "../../domain/collection/CharacterEquipment";
import { actions } from "../data/actions";
import type { Student } from "../types/student";
import { SUBJECT_IDS } from "../types/subject";
import { createAction } from "./actionCatalogService";
import { hydrateActionCatalog } from "./actionCatalogStorageService";
import {
  getVisibleActionsForSubject,
  validateOrdinaryComplianceTracking,
} from "./actionSubjectService";
import { createLegacyApplyStudentAction } from "./legacyApplyStudentAction";
import { applyCrystalChangeToStudent } from "./studentService";
import { getOrderedSubjectCatalog, isSubjectId } from "./subjectCatalogService";

export type SubjectActionCatalogCheck = { name: string; passed: boolean };

export async function runSubjectActionCatalogDeterministicChecks(): Promise<
  readonly SubjectActionCatalogCheck[]
> {
  const orderedSubjects = getOrderedSubjectCatalog();
  const legacyAction = {
    id: "legacy-action",
    title: "Acción heredada",
    points: -2,
    icon: "🧱",
    iconId: "legacy-icon",
    archived: false,
    quickSlot: null,
    legacyMetadata: { preserved: true },
  };
  const migrated = hydrateActionCatalog([legacyAction]);
  const migratedAgain = hydrateActionCatalog(migrated);
  const musicAction = createAction([], {
    id: "music-action",
    title: "Acción de Música",
    points: -1,
    subjectId: SUBJECT_IDS.MUSIC,
  })[0];
  const generalAction = createAction([], {
    id: "general-action",
    title: "Acción general",
    points: 1,
  })[0];
  const artAction = createAction([], {
    id: "art-action",
    title: "Acción de Plástica",
    points: 1,
    subjectId: SUBJECT_IDS.ART_EDUCATION,
  })[0];
  const globalAction = createAction([], {
    id: "global-action",
    title: "Acción global",
    points: 1,
    availableInAllSubjects: true,
  })[0];
  const scopedCatalog = [musicAction, artAction, generalAction, globalAction, globalAction];
  let positiveTrackingRejected = false;
  let neutralTrackingRejected = false;

  try {
    createAction([], {
      id: "invalid-positive-tracking",
      title: "Seguimiento positivo inválido",
      points: 1,
      trackOrdinaryCompliance: true,
    });
  } catch {
    positiveTrackingRejected = true;
  }

  try {
    validateOrdinaryComplianceTracking(0, true);
  } catch {
    neutralTrackingRejected = true;
  }

  const checks: SubjectActionCatalogCheck[] = [
    check("subject catalog has unique stable identifiers and order", () => {
      const ids = orderedSubjects.map((subject) => subject.id);
      const orders = orderedSubjects.map((subject) => subject.order);

      return ids.length === 12
        && new Set(ids).size === ids.length
        && ids.every(isSubjectId)
        && orders.every((order, index) => index === 0 || order > orders[index - 1]);
    }),
    check("legacy actions normalize to General", () =>
      migrated[0]?.subjectId === SUBJECT_IDS.GENERAL
      && migrated[0]?.availableInAllSubjects === false
      && migrated[0]?.attitudinalCriterionLinks.length === 0
      && migrated[0]?.trackOrdinaryCompliance === false),
    check("legacy migration preserves name, icon and points", () =>
      migrated[0]?.title === legacyAction.title
      && migrated[0]?.icon === legacyAction.icon
      && migrated[0]?.iconId === legacyAction.iconId
      && migrated[0]?.points === legacyAction.points
      && (migrated[0] as unknown as { legacyMetadata?: { preserved?: boolean } })
        .legacyMetadata?.preserved === true),
    check("legacy migration is idempotent", () =>
      JSON.stringify(migratedAgain) === JSON.stringify(migrated)),
    check("Music actions appear in Music and not Language", () =>
      getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.MUSIC)
        .some((action) => action.id === musicAction.id)
      && !getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.LANGUAGE)
        .some((action) => action.id === musicAction.id)),
    check("the official Artistic context shows Music and Plástica actions together", () =>
      getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.MUSIC)
        .some((action) => action.id === artAction.id)
      && getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.ART_EDUCATION)
        .some((action) => action.id === musicAction.id)
      && !getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.LANGUAGE)
        .some((action) => action.id === artAction.id)),
    check("General actions do not appear in Music by default", () =>
      !getVisibleActionsForSubject(scopedCatalog, SUBJECT_IDS.MUSIC)
        .some((action) => action.id === generalAction.id)),
    check("global actions appear once in General, Language and Music", () =>
      [SUBJECT_IDS.GENERAL, SUBJECT_IDS.LANGUAGE, SUBJECT_IDS.MUSIC]
        .every((subjectId) => getVisibleActionsForSubject(scopedCatalog, subjectId)
          .filter((action) => action.id === globalAction.id).length === 1)),
    check("ordinary compliance rejects positive and neutral actions", () =>
      positiveTrackingRejected && neutralTrackingRejected),
  ];

  checks.push(await checkAsync(
    "ApplyStudentAction keeps crystals, chests and progression behavior",
    verifyExistingActionApplication
  ));

  return checks;
}

async function verifyExistingActionApplication(): Promise<boolean> {
  let students: Student[] = [createStudent()];
  const recordedMovements: Array<{
    studentId: string;
    actionId: string;
    requestedChange: number;
    appliedChange: number;
  }> = [];
  const applyAction = createLegacyApplyStudentAction({
    modificarCristales(studentId, change) {
      const update = applyCrystalChangeToStudent(students, studentId, change);
      students = update.students;
      return update;
    },
    registrarMovimiento(studentId, actionId, requestedChange, appliedChange) {
      recordedMovements.push({ studentId, actionId, requestedChange, appliedChange });
    },
  });
  const result = await applyAction.execute({
    id: "phase-1-compatibility-command",
    type: "apply-student-action",
    teacherId: "legacy-local-teacher",
    target: { type: "student", id: "student-1" },
    issuedAt: "2026-01-01T10:00:00.000Z",
    idempotencyKey: "phase-1-compatibility-command",
    payload: { actionId: actions[0].id },
    metadata: { classroomId: "classroom-1" },
  });
  const student = students[0];

  return result.status === "committed"
    && student.cristales === 10
    && student.highestCrystalTotal === 10
    && student.chestProgress === 0
    && student.chests.length === 1
    && student.chests[0].status === "pending"
    && recordedMovements.length === 1
    && recordedMovements[0].requestedChange === actions[0].points
    && recordedMovements[0].appliedChange === actions[0].points
    && result.events.filter((event) => event.type === "economy-crystals-changed").length === 1
    && result.events.filter((event) => event.type === "student-chest-obtained").length === 1
    && result.events.filter((event) => event.type === "student-movement-recorded").length === 1;
}

function createStudent(): Student {
  return {
    id: "student-1",
    nombre: "Alumno",
    apellidos: "Prueba",
    avatar: { id: "avatar-1", theme: "default", level: 1, skin: "default" },
    inventory: [],
    equipment: createEmptyCharacterEquipment(),
    chests: [],
    chestProgress: 5,
    claseId: "classroom-1",
    numeroLista: 1,
    cristales: 5,
    highestCrystalTotal: 5,
    monedas: 0,
    activo: true,
    notas: "",
    fechaCreacion: new Date("2026-01-01T09:00:00.000Z"),
  };
}

function check(name: string, predicate: () => boolean): SubjectActionCatalogCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}

async function checkAsync(
  name: string,
  predicate: () => Promise<boolean>
): Promise<SubjectActionCatalogCheck> {
  try {
    return { name, passed: await predicate() };
  } catch {
    return { name, passed: false };
  }
}
