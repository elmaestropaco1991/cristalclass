export const CURRICULUM_EVALUATION_SCHEMA_VERSION = 1 as const;

export type CurriculumEvaluationCoverage = "partial";
export type CurriculumEvaluationObservationEffect = "positive" | "contrary";

/**
 * Immutable rule material captured when a real subject session closes. Historical
 * reports therefore do not change after an action, criterion or rule is edited.
 */
export interface CurriculumEvaluationRuleSnapshot {
  readonly id: string;
  readonly subjectId: string;
  readonly basicKnowledgeId: string;
  readonly observableActionId: string;
  readonly observableLabel: string;
  readonly criterionIds: readonly string[];
  readonly contraryActionIds: readonly string[];
}

/**
 * One deliberately closed subject session. The caller decides when a session is
 * real; this contract deliberately contains no invented minimum duration.
 */
export interface CurriculumEvaluationSession {
  readonly id: string;
  readonly classroomId: string;
  readonly subjectId: string;
  readonly localDate: string;
  readonly openedAt: string;
  readonly closedAt: string;
  readonly presentStudentIds: readonly string[];
  readonly rules: readonly CurriculumEvaluationRuleSnapshot[];
}

export interface CurriculumEvaluationActionObservation {
  readonly kind: "action";
  readonly id: string;
  readonly classroomId: string;
  readonly sessionId: string;
  readonly studentId: string;
  readonly actionId: string;
  readonly actionTitle: string;
  readonly effect: CurriculumEvaluationObservationEffect;
  readonly ruleIds: readonly string[];
  readonly recordedAt: string;
}

/** Append-only compensation. An observation is never silently deleted. */
export interface CurriculumEvaluationReversalObservation {
  readonly kind: "reversal";
  readonly id: string;
  readonly classroomId: string;
  readonly sessionId: string;
  readonly originalObservationId: string;
  readonly reason: string;
  readonly recordedAt: string;
}

export type CurriculumEvaluationObservation =
  | CurriculumEvaluationActionObservation
  | CurriculumEvaluationReversalObservation;

export interface CurriculumEvaluationState {
  readonly schemaVersion: typeof CURRICULUM_EVALUATION_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly revision: number;
  readonly sessions: readonly CurriculumEvaluationSession[];
  readonly observations: readonly CurriculumEvaluationObservation[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CurriculumEvaluationStorageEnvelope {
  readonly schemaVersion: typeof CURRICULUM_EVALUATION_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly revision: number;
  readonly state: CurriculumEvaluationState;
  readonly writtenAt: string;
  readonly checksum: string;
}

export interface CurriculumObservableGradeReport {
  readonly studentId: string;
  readonly subjectId: string;
  readonly ruleId: string;
  readonly ruleSnapshotFingerprint: string;
  readonly observableActionId: string;
  readonly observableLabel: string;
  readonly basicKnowledgeId: string;
  readonly criterionIds: readonly string[];
  readonly coverage: CurriculumEvaluationCoverage;
  /** Null only when there is no eligible closed session for this student and rule. */
  readonly proposedGrade: number | null;
  readonly validSessionCount: number;
  readonly sessionsWithoutIncidents: number;
  readonly sessionsWithIncidents: number;
  readonly contraryObservationCount: number;
  readonly positiveObservationCount: number;
  readonly firstSessionAt: string | null;
  readonly lastSessionAt: string | null;
  readonly notices: readonly string[];
}
