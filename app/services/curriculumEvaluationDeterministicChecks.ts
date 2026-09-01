import type {
  CurriculumEvaluationActionObservation,
  CurriculumEvaluationReversalObservation,
  CurriculumEvaluationRuleSnapshot,
  CurriculumEvaluationSession,
  CurriculumEvaluationState,
} from "../types/curriculumEvaluation";
import {
  appendCurriculumEvaluationAction,
  appendCurriculumEvaluationSession,
  calculateCurriculumObservableGrade,
  createCurriculumEvaluationState,
  reverseCurriculumEvaluationAction,
  validateCurriculumEvaluationState,
} from "./curriculumEvaluationService";
import {
  getCurriculumEvaluationStorageKey,
  persistCurriculumEvaluationState,
  readCurriculumEvaluationState,
} from "./curriculumEvaluationStorageService";

export interface CurriculumEvaluationDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const CLASSROOM_ID = "classroom-1";
const STUDENT_ID = "student-1";
const RULE: CurriculumEvaluationRuleSnapshot = Object.freeze({
  id: "rule-listening-turns",
  subjectId: "language",
  basicKnowledgeId: "knowledge-interaction",
  observableActionId: "respects-turns",
  observableLabel: "Respeto de los turnos de palabra",
  criterionIds: Object.freeze(["criterion-3.2"]),
  contraryActionIds: Object.freeze(["interrupts"]),
});

export async function runCurriculumEvaluationDeterministicChecks(): Promise<readonly CurriculumEvaluationDeterministicCheck[]> {
  const twentySessions = addSessions(20);
  const withTwoIncidentSessions = mustApplyAction(
    mustApplyAction(twentySessions, action("incident-1", "session-3", "2026-09-03T09:10:00.000Z")),
    action("incident-2", "session-7", "2026-09-07T09:10:00.000Z")
  );
  const report = calculateCurriculumObservableGrade(withTwoIncidentSessions, STUDENT_ID, RULE);

  return [
    check("evaluation starts empty and valid without manufacturing a grade", () => {
      const state = createCurriculumEvaluationState(CLASSROOM_ID, "2026-09-01T08:00:00.000Z");
      const empty = calculateCurriculumObservableGrade(state, STUDENT_ID, RULE);
      return validateCurriculumEvaluationState(state).valid
        && state.revision === 0
        && empty.proposedGrade === null
        && empty.notices[0].includes("Sin sesiones válidas");
    }),
    check("a deliberately closed short session is accepted without an invented duration threshold", () => {
      const state = createCurriculumEvaluationState(CLASSROOM_ID, "2026-09-01T08:00:00.000Z");
      const result = appendCurriculumEvaluationSession(
        state,
        { ...session(1), closedAt: "2026-09-01T09:00:01.000Z" },
        "2026-09-01T09:00:01.000Z"
      );
      return result.status === "applied";
    }),
    check("one valid session always offers a provisional observable grade", () => {
      const state = addSessions(1);
      const result = calculateCurriculumObservableGrade(state, STUDENT_ID, RULE);
      return result.proposedGrade === 10
        && result.validSessionCount === 1
        && result.coverage === "partial"
        && result.notices.every((notice) => !notice.includes("evidencia suficiente"));
    }),
    check("the agreed descriptive formula yields 9.0 for 18 clean sessions out of 20", () =>
      report.proposedGrade === 9
      && report.validSessionCount === 20
      && report.sessionsWithoutIncidents === 18
      && report.sessionsWithIncidents === 2),
    check("retrospective observations never move the state update timestamp backwards", () =>
      withTwoIncidentSessions.updatedAt === "2026-09-20T10:00:00.000Z"),
    check("several contrary presses in one session affect the session once but remain visible", () => {
      const repeated = mustApplyAction(
        withTwoIncidentSessions,
        action("incident-3", "session-3", "2026-09-03T09:20:00.000Z")
      );
      const result = calculateCurriculumObservableGrade(repeated, STUDENT_ID, RULE);
      return result.proposedGrade === 9
        && result.sessionsWithIncidents === 2
        && result.contraryObservationCount === 3;
    }),
    check("a positive observation is shown separately and never inflates the absence-based grade", () => {
      const positive = mustApplyAction(
        withTwoIncidentSessions,
        action("positive-1", "session-4", "2026-09-04T09:10:00.000Z", "positive")
      );
      const result = calculateCurriculumObservableGrade(positive, STUDENT_ID, RULE);
      return result.proposedGrade === 9 && result.positiveObservationCount === 1;
    }),
    check("an absent student creates no opportunity and cannot receive an action observation", () => {
      const empty = createCurriculumEvaluationState(CLASSROOM_ID, "2026-09-01T08:00:00.000Z");
      const added = mustApplySession(empty, session(1, []));
      const rejected = appendCurriculumEvaluationAction(
        added,
        action("invalid-absent", "session-1", "2026-09-01T09:10:00.000Z")
      );
      const result = calculateCurriculumObservableGrade(added, STUDENT_ID, RULE);
      return rejected.status === "rejected"
        && result.validSessionCount === 0
        && result.proposedGrade === null;
    }),
    check("reversal is append-only and removes the incident from the current calculation", () => {
      const initial = mustApplyAction(
        addSessions(2),
        action("mistake", "session-1", "2026-09-01T09:10:00.000Z")
      );
      const reversed = reverseCurriculumEvaluationAction(initial, reversal("undo-mistake", "mistake"));
      if (reversed.status !== "applied") return false;
      const result = calculateCurriculumObservableGrade(reversed.state, STUDENT_ID, RULE);
      return reversed.state.observations.length === 2
        && result.proposedGrade === 10
        && result.contraryObservationCount === 0;
    }),
    check("a changed rule snapshot does not rewrite the historical grade", () => {
      const state = addSessions(2);
      const changed = { ...RULE, observableLabel: "Nombre nuevo del observable" };
      const oldReport = calculateCurriculumObservableGrade(state, STUDENT_ID, RULE);
      const changedReport = calculateCurriculumObservableGrade(state, STUDENT_ID, changed);
      return oldReport.validSessionCount === 2
        && changedReport.validSessionCount === 0
        && changedReport.proposedGrade === null
        && oldReport.ruleSnapshotFingerprint !== changedReport.ruleSnapshotFingerprint;
    }),
    check("exact retries are idempotent and divergent identity reuse is rejected", () => {
      const initial = createCurriculumEvaluationState(CLASSROOM_ID, "2026-09-01T08:00:00.000Z");
      const first = appendCurriculumEvaluationSession(initial, session(1), "2026-09-01T10:00:00.000Z");
      if (first.status !== "applied") return false;
      const retry = appendCurriculumEvaluationSession(first.state, session(1), "2026-09-01T10:00:01.000Z");
      const divergent = appendCurriculumEvaluationSession(
        first.state,
        { ...session(1), presentStudentIds: [STUDENT_ID, "student-2"] },
        "2026-09-01T10:00:01.000Z"
      );
      return retry.status === "idempotent"
        && retry.state.revision === first.state.revision
        && divergent.status === "rejected";
    }),
    check("persistence round-trips an exact verified state", () => {
      const storage = memoryStorage();
      const state = addSessions(1);
      const written = persistCurriculumEvaluationState(
        storage,
        state,
        0,
        "2026-09-01T10:00:00.000Z"
      );
      const read = readCurriculumEvaluationState(storage, CLASSROOM_ID);
      return written.status === "written"
        && read.status === "valid"
        && read.envelope.checksum === written.envelope.checksum
        && JSON.stringify(read.envelope.state) === JSON.stringify(state);
    }),
    check("a recomputed-looking payload cannot hide checksum tampering", () => {
      const storage = memoryStorage();
      const state = addSessions(1);
      persistCurriculumEvaluationState(storage, state, 0, "2026-09-01T10:00:00.000Z");
      const key = getCurriculumEvaluationStorageKey(CLASSROOM_ID);
      const parsed = JSON.parse(storage.getItem(key)!) as {
        state: { sessions: Array<{ presentStudentIds: string[] }> };
      };
      parsed.state.sessions[0].presentStudentIds.push("student-forged");
      storage.setItem(key, JSON.stringify(parsed));
      return readCurriculumEvaluationState(storage, CLASSROOM_ID).status === "invalid";
    }),
    check("stale writers are rejected without replacing the verified state", () => {
      const storage = memoryStorage();
      const first = addSessions(1);
      persistCurriculumEvaluationState(storage, first, 0, "2026-09-01T10:00:00.000Z");
      const second = mustApplySession(first, session(2));
      const stale = persistCurriculumEvaluationState(
        storage,
        second,
        0,
        "2026-09-02T10:00:00.000Z"
      );
      const read = readCurriculumEvaluationState(storage, CLASSROOM_ID);
      return stale.status === "revision-conflict"
        && read.status === "valid"
        && read.envelope.revision === first.revision;
    }),
  ];
}

function addSessions(count: number): CurriculumEvaluationState {
  let state = createCurriculumEvaluationState(CLASSROOM_ID, "2026-09-01T08:00:00.000Z");
  for (let index = 1; index <= count; index += 1) state = mustApplySession(state, session(index));
  return state;
}

function session(
  index: number,
  presentStudentIds: readonly string[] = [STUDENT_ID],
  rule: CurriculumEvaluationRuleSnapshot = RULE
): CurriculumEvaluationSession {
  const day = String(index).padStart(2, "0");
  return {
    id: `session-${index}`,
    classroomId: CLASSROOM_ID,
    subjectId: RULE.subjectId,
    localDate: `2026-09-${day}`,
    openedAt: `2026-09-${day}T09:00:00.000Z`,
    closedAt: `2026-09-${day}T10:00:00.000Z`,
    presentStudentIds,
    rules: [rule],
  };
}

function action(
  id: string,
  sessionId: string,
  recordedAt: string,
  effect: CurriculumEvaluationActionObservation["effect"] = "contrary"
): CurriculumEvaluationActionObservation {
  return {
    kind: "action",
    id,
    classroomId: CLASSROOM_ID,
    sessionId,
    studentId: STUDENT_ID,
    actionId: effect === "contrary" ? "interrupts" : "respects-turns",
    actionTitle: effect === "contrary" ? "Interrumpe" : "Respeta los turnos",
    effect,
    ruleIds: [RULE.id],
    recordedAt,
  };
}

function reversal(id: string, originalObservationId: string): CurriculumEvaluationReversalObservation {
  return {
    kind: "reversal",
    id,
    classroomId: CLASSROOM_ID,
    sessionId: "session-1",
    originalObservationId,
    reason: "Corrección docente",
    recordedAt: "2026-09-01T10:30:00.000Z",
  };
}

function mustApplySession(
  state: CurriculumEvaluationState,
  value: CurriculumEvaluationSession
): CurriculumEvaluationState {
  const result = appendCurriculumEvaluationSession(state, value, value.closedAt);
  if (result.status !== "applied") throw new Error(`Session setup failed: ${result.status}`);
  return result.state;
}

function mustApplyAction(
  state: CurriculumEvaluationState,
  value: CurriculumEvaluationActionObservation
): CurriculumEvaluationState {
  const result = appendCurriculumEvaluationAction(state, value);
  if (result.status !== "applied") throw new Error(`Action setup failed: ${result.status}`);
  return result.state;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function check(name: string, run: () => boolean): CurriculumEvaluationDeterministicCheck {
  try {
    return { name, passed: run() };
  } catch {
    return { name, passed: false };
  }
}
