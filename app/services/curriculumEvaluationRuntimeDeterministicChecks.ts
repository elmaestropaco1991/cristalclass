import { actions } from "../data/actions";
import { PRIMARY_CURRICULUM_ACTION_IDS } from "../data/primaryCurriculumActions";
import { SUBJECT_IDS } from "../types/subject";
import { applyAndalusianPrimaryCurriculumDefaults } from "./andalusianPrimaryCurriculumDefaultsService";
import {
  confirmCurriculumAssistantImport,
  previewCurriculumAssistantImport,
} from "./curriculumAssistantService";
import { getAndalusianPrimaryCurriculumPack } from "./andalusianPrimaryCurriculumService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import {
  appendClosedCurriculumEvaluationSession,
  clearOpenCurriculumEvaluationSession,
  createCurriculumEvaluationRuleSnapshots,
  createOpenCurriculumEvaluationSession,
  persistOpenCurriculumEvaluationSession,
  readOpenCurriculumEvaluationSession,
  recordOpenCurriculumEvaluationAction,
  sameRuleSnapshots,
  touchOpenCurriculumEvaluationSession,
} from "./curriculumEvaluationRuntimeService";
import {
  calculateCurriculumObservableGrade,
  createCurriculumEvaluationState,
} from "./curriculumEvaluationService";

export type CurriculumEvaluationRuntimeCheck = { readonly name: string; readonly passed: boolean };

const CLASSROOM = "runtime-classroom";
const OPENED = "2026-09-01T09:00:00.000Z";

export function runCurriculumEvaluationRuntimeDeterministicChecks():
readonly CurriculumEvaluationRuntimeCheck[] {
  const prepared = prepareCourseFour();
  const pack = prepared.catalog.pack!;
  const snapshotsByLegacySubject = new Map(pack.subjects.map((subject) => [
    subject.legacySubjectId,
    createCurriculumEvaluationRuleSnapshots(prepared, subject.id, actions),
  ]));
  const math = snapshotsByLegacySubject.get(SUBJECT_IDS.MATHEMATICS)!;
  const base = createOpenCurriculumEvaluationSession({
    id: "session-math-1",
    classroomId: CLASSROOM,
    subjectId: math[0].subjectId,
    localDate: "2026-09-01",
    openedAt: OPENED,
    presentStudentIds: ["student-1", "student-2"],
    rules: math,
  });
  const incident = recordOpenCurriculumEvaluationAction(base, {
    observationId: "observation-1",
    studentId: "student-1",
    actionId: PRIMARY_CURRICULUM_ACTION_IDS.MATH_ABANDONS_AT_FIRST_DIFFICULTY,
    actionTitle: "Abandona la tarea ante la primera dificultad",
    recordedAt: "2026-09-01T09:15:00.000Z",
  });
  const positive = recordOpenCurriculumEvaluationAction(incident, {
    observationId: "observation-2",
    studentId: "student-2",
    actionId: PRIMARY_CURRICULUM_ACTION_IDS.MATH_PERSEVERES_WITH_CHALLENGE,
    actionTitle: "Persevera ante un reto matemático",
    recordedAt: "2026-09-01T09:20:00.000Z",
  });
  const initial = createCurriculumEvaluationState(CLASSROOM, "2026-09-01T08:00:00.000Z");
  const closed = appendClosedCurriculumEvaluationSession(
    initial,
    touchOpenCurriculumEvaluationSession(positive, ["student-1", "student-2"], "2026-09-01T10:00:00.000Z"),
    "2026-09-01T10:00:00.000Z"
  );
  const finalState = closed.states.at(-1) ?? initial;

  return [
    check("runtime builds only the reviewed ordinary rules for each subject", () =>
      snapshotsByLegacySubject.get(SUBJECT_IDS.LANGUAGE)?.length === 2
      && snapshotsByLegacySubject.get(SUBJECT_IDS.MATHEMATICS)?.length === 1
      && snapshotsByLegacySubject.get(SUBJECT_IDS.ENVIRONMENTAL_STUDIES)?.length === 0
      && snapshotsByLegacySubject.get(SUBJECT_IDS.PHYSICAL_EDUCATION)?.length === 1
      && snapshotsByLegacySubject.get(SUBJECT_IDS.ENGLISH)?.length === 1
      && snapshotsByLegacySubject.get(SUBJECT_IDS.MUSIC)?.length === 0
    ),
    check("an open session snapshots its rules and present students", () =>
      base.rules.length === 1
      && base.presentStudentIds.join(",") === "student-1,student-2"
      && Object.isFrozen(base)
      && Object.isFrozen(base.rules)
    ),
    check("unrelated actions never become curricular observations", () =>
      recordOpenCurriculumEvaluationAction(base, {
        observationId: "unrelated",
        studentId: "student-1",
        actionId: "disturbing",
        actionTitle: "Molesta",
        recordedAt: "2026-09-01T09:10:00.000Z",
      }) === base
    ),
    check("negative and positive presses retain their exact effects", () =>
      positive.observations.length === 2
      && positive.observations[0].effect === "contrary"
      && positive.observations[1].effect === "positive"
    ),
    check("a student outside the attendance snapshot cannot receive evidence", () => {
      try {
        recordOpenCurriculumEvaluationAction(base, {
          observationId: "absent",
          studentId: "student-absent",
          actionId: PRIMARY_CURRICULUM_ACTION_IDS.MATH_ABANDONS_AT_FIRST_DIFFICULTY,
          actionTitle: "Abandona",
          recordedAt: "2026-09-01T09:10:00.000Z",
        });
        return false;
      } catch {
        return true;
      }
    }),
    check("closing emits one persistable revision per append-only change", () =>
      closed.status === "applied"
      && closed.states.length === 3
      && closed.states.map((state) => state.revision).join(",") === "1,2,3"
    ),
    check("the closed session always offers a warned grade for each observed aspect", () => {
      const first = calculateCurriculumObservableGrade(finalState, "student-1", math[0]);
      const second = calculateCurriculumObservableGrade(finalState, "student-2", math[0]);
      return first.proposedGrade === 0
        && first.sessionsWithIncidents === 1
        && second.proposedGrade === 10
        && second.positiveObservationCount === 1
        && second.notices.some((notice) => notice.includes("cubre solo una parte"));
    }),
    check("a zero-duration tab change is discarded instead of manufacturing a session", () =>
      appendClosedCurriculumEvaluationSession(initial, base, OPENED).status === "discarded"
    ),
    check("open-session persistence verifies checksums and detects tampering", () => {
      const storage = memoryStorage();
      if (!persistOpenCurriculumEvaluationSession(storage, positive)) return false;
      const key = [...storage.values.keys()][0];
      const parsed = JSON.parse(storage.getItem(key)!) as { session: { subjectId: string } };
      parsed.session.subjectId = "forged";
      storage.setItem(key, JSON.stringify(parsed));
      return readOpenCurriculumEvaluationSession(storage, CLASSROOM).status === "invalid";
    }),
    check("open-session cleanup is explicit and rule comparisons are fingerprinted", () => {
      const storage = memoryStorage();
      persistOpenCurriculumEvaluationSession(storage, base);
      return sameRuleSnapshots(base.rules, math)
        && clearOpenCurriculumEvaluationSession(storage, CLASSROOM)
        && readOpenCurriculumEvaluationSession(storage, CLASSROOM).status === "empty";
    }),
  ];
}

function prepareCourseFour() {
  const parsed = parseCurriculumPackJson(serializeCurriculumPackToJson(
    getAndalusianPrimaryCurriculumPack(4),
    "2026-09-01T08:00:00.000Z"
  ));
  if (parsed.status !== "valid") throw new Error("Pack inválido.");
  const imported = confirmCurriculumAssistantImport(
    CLASSROOM,
    previewCurriculumAssistantImport(CLASSROOM, parsed as CurriculumPackJsonValidResult),
    "2026-09-01T08:00:00.000Z"
  );
  return applyAndalusianPrimaryCurriculumDefaults(
    imported,
    4,
    actions,
    "2026-09-01T08:00:00.000Z"
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function check(name: string, run: () => boolean): CurriculumEvaluationRuntimeCheck {
  try {
    return { name, passed: run() };
  } catch {
    return { name, passed: false };
  }
}
