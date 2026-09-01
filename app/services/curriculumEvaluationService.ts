import {
  CURRICULUM_EVALUATION_SCHEMA_VERSION,
  type CurriculumEvaluationActionObservation,
  type CurriculumEvaluationObservation,
  type CurriculumEvaluationReversalObservation,
  type CurriculumEvaluationRuleSnapshot,
  type CurriculumEvaluationSession,
  type CurriculumEvaluationState,
  type CurriculumObservableGradeReport,
} from "../types/curriculumEvaluation";
import {
  createCurriculumDeterministicFingerprint,
  serializeCurriculumFingerprintValue,
} from "./curriculumFingerprintService";

export type CurriculumEvaluationChangeResult =
  | { readonly status: "applied" | "idempotent"; readonly state: CurriculumEvaluationState }
  | { readonly status: "rejected"; readonly message: string };

export interface CurriculumEvaluationValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export function createCurriculumEvaluationState(
  classroomId: string,
  occurredAt: string
): CurriculumEvaluationState {
  requireIdentity(classroomId, "classroomId");
  requireCanonicalInstant(occurredAt, "occurredAt");
  return Object.freeze({
    schemaVersion: CURRICULUM_EVALUATION_SCHEMA_VERSION,
    classroomId,
    revision: 0,
    sessions: Object.freeze([]),
    observations: Object.freeze([]),
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

export function appendCurriculumEvaluationSession(
  state: CurriculumEvaluationState,
  session: CurriculumEvaluationSession,
  occurredAt: string
): CurriculumEvaluationChangeResult {
  const stateValidation = validateCurriculumEvaluationState(state);
  if (!stateValidation.valid) return rejected(stateValidation.issues[0]);
  const issue = validateSession(session, state.classroomId);
  if (issue) return rejected(issue);
  if (!isCanonicalInstant(occurredAt)) return rejected("occurredAt must be a canonical ISO instant.");

  const existing = state.sessions.find((candidate) => candidate.id === session.id);
  if (existing) {
    return exact(existing, session)
      ? { status: "idempotent", state }
      : rejected("A different session already uses this identity.");
  }

  return {
    status: "applied",
    state: advanceState(state, {
      sessions: [...state.sessions, copySession(session)],
    }, occurredAt),
  };
}

export function appendCurriculumEvaluationAction(
  state: CurriculumEvaluationState,
  observation: CurriculumEvaluationActionObservation
): CurriculumEvaluationChangeResult {
  const stateValidation = validateCurriculumEvaluationState(state);
  if (!stateValidation.valid) return rejected(stateValidation.issues[0]);
  const existing = state.observations.find((candidate) => candidate.id === observation.id);
  if (existing) {
    return exact(existing, observation)
      ? { status: "idempotent", state }
      : rejected("A different observation already uses this identity.");
  }

  const session = state.sessions.find((candidate) => candidate.id === observation.sessionId);
  const issue = validateActionObservation(observation, state.classroomId, session);
  if (issue) return rejected(issue);

  return {
    status: "applied",
    state: advanceState(state, {
      observations: [...state.observations, copyObservation(observation)],
    }, observation.recordedAt),
  };
}

export function reverseCurriculumEvaluationAction(
  state: CurriculumEvaluationState,
  reversal: CurriculumEvaluationReversalObservation
): CurriculumEvaluationChangeResult {
  const stateValidation = validateCurriculumEvaluationState(state);
  if (!stateValidation.valid) return rejected(stateValidation.issues[0]);
  const existing = state.observations.find((candidate) => candidate.id === reversal.id);
  if (existing) {
    return exact(existing, reversal)
      ? { status: "idempotent", state }
      : rejected("A different observation already uses this identity.");
  }
  const original = state.observations.find(
    (candidate): candidate is CurriculumEvaluationActionObservation =>
      candidate.kind === "action" && candidate.id === reversal.originalObservationId
  );
  if (!original) return rejected("The original action observation does not exist.");
  if (
    reversal.classroomId !== state.classroomId
    || reversal.sessionId !== original.sessionId
    || !isCanonicalInstant(reversal.recordedAt)
    || reversal.recordedAt < original.recordedAt
    || !reversal.reason.trim()
  ) {
    return rejected("The reversal does not match the original observation.");
  }
  if (state.observations.some(
    (candidate) => candidate.kind === "reversal"
      && candidate.originalObservationId === original.id
  )) {
    return rejected("The original observation is already reversed.");
  }

  return {
    status: "applied",
    state: advanceState(state, {
      observations: [...state.observations, copyObservation(reversal)],
    }, reversal.recordedAt),
  };
}

export function calculateCurriculumObservableGrade(
  state: CurriculumEvaluationState,
  studentId: string,
  rule: CurriculumEvaluationRuleSnapshot
): CurriculumObservableGradeReport {
  const fingerprint = createCurriculumEvaluationRuleFingerprint(rule);
  const sessions = state.sessions.filter((session) => {
    if (session.subjectId !== rule.subjectId || !session.presentStudentIds.includes(studentId)) {
      return false;
    }
    const snapshot = session.rules.find((candidate) => candidate.id === rule.id);
    return snapshot !== undefined
      && createCurriculumEvaluationRuleFingerprint(snapshot) === fingerprint;
  });
  const sessionIds = new Set(sessions.map((session) => session.id));
  const reversedIds = new Set(
    state.observations.flatMap((observation) =>
      observation.kind === "reversal" ? [observation.originalObservationId] : []
    )
  );
  const actions = state.observations.filter(
    (observation): observation is CurriculumEvaluationActionObservation =>
      observation.kind === "action"
      && !reversedIds.has(observation.id)
      && observation.studentId === studentId
      && observation.ruleIds.includes(rule.id)
      && sessionIds.has(observation.sessionId)
  );
  const incidentSessionIds = new Set(
    actions.flatMap((observation) => observation.effect === "contrary"
      ? [observation.sessionId]
      : [])
  );
  const validSessionCount = sessions.length;
  const sessionsWithIncidents = incidentSessionIds.size;
  const sessionsWithoutIncidents = validSessionCount - sessionsWithIncidents;
  const proposedGrade = validSessionCount === 0
    ? null
    : roundToOneDecimal((sessionsWithoutIncidents / validSessionCount) * 10);
  const orderedSessions = [...sessions].sort((left, right) =>
    left.openedAt.localeCompare(right.openedAt) || left.id.localeCompare(right.id)
  );

  return Object.freeze({
    studentId,
    subjectId: rule.subjectId,
    ruleId: rule.id,
    ruleSnapshotFingerprint: fingerprint,
    observableActionId: rule.observableActionId,
    observableLabel: rule.observableLabel,
    basicKnowledgeId: rule.basicKnowledgeId,
    criterionIds: Object.freeze([...rule.criterionIds]),
    coverage: "partial" as const,
    proposedGrade,
    validSessionCount,
    sessionsWithoutIncidents,
    sessionsWithIncidents,
    contraryObservationCount: actions.filter((observation) => observation.effect === "contrary").length,
    positiveObservationCount: actions.filter((observation) => observation.effect === "positive").length,
    firstSessionAt: orderedSessions[0]?.openedAt ?? null,
    lastSessionAt: orderedSessions.at(-1)?.closedAt ?? null,
    notices: Object.freeze(createNotices(validSessionCount)),
  });
}

export function createCurriculumEvaluationRuleFingerprint(
  rule: CurriculumEvaluationRuleSnapshot
): string {
  return `curriculum-evaluation-rule-v1:${createCurriculumDeterministicFingerprint({
    id: rule.id,
    subjectId: rule.subjectId,
    basicKnowledgeId: rule.basicKnowledgeId,
    observableActionId: rule.observableActionId,
    observableLabel: rule.observableLabel,
    criterionIds: [...rule.criterionIds],
    contraryActionIds: [...rule.contraryActionIds],
  })}`;
}

export function validateCurriculumEvaluationState(
  value: unknown
): CurriculumEvaluationValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Evaluation state must be an object."] };
  if (value.schemaVersion !== CURRICULUM_EVALUATION_SCHEMA_VERSION) {
    issues.push("Unsupported evaluation schema version.");
  }
  if (!isIdentity(value.classroomId)) issues.push("Invalid classroom identity.");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    issues.push("Invalid evaluation revision.");
  }
  if (!isCanonicalInstant(value.createdAt) || !isCanonicalInstant(value.updatedAt)) {
    issues.push("Invalid evaluation timestamps.");
  }
  if (!Array.isArray(value.sessions) || !Array.isArray(value.observations)) {
    issues.push("Evaluation collections are missing.");
    return { valid: false, issues };
  }

  const classroomId = typeof value.classroomId === "string" ? value.classroomId : "";
  const sessions = value.sessions as unknown[];
  const sessionIds = new Set<string>();
  for (const session of sessions) {
    const issue = validateSession(session, classroomId);
    if (issue) issues.push(issue);
    if (isRecord(session) && typeof session.id === "string") {
      if (sessionIds.has(session.id)) issues.push("Duplicate evaluation session identity.");
      sessionIds.add(session.id);
    }
  }

  const observations = value.observations as unknown[];
  const observationIds = new Set<string>();
  const actions = new Map<string, CurriculumEvaluationActionObservation>();
  for (const observation of observations) {
    if (!isRecord(observation) || !isIdentity(observation.id)) {
      issues.push("Invalid evaluation observation identity.");
      continue;
    }
    if (observationIds.has(observation.id)) issues.push("Duplicate evaluation observation identity.");
    observationIds.add(observation.id);
    if (observation.kind === "action") {
      const session = sessions.find(
        (candidate) => isRecord(candidate) && candidate.id === observation.sessionId
      ) as CurriculumEvaluationSession | undefined;
      const issue = validateActionObservation(
        observation as unknown as CurriculumEvaluationActionObservation,
        classroomId,
        session
      );
      if (issue) issues.push(issue);
      else actions.set(observation.id, observation as unknown as CurriculumEvaluationActionObservation);
    } else if (observation.kind !== "reversal") {
      issues.push("Unknown evaluation observation kind.");
    }
  }
  const reversed = new Set<string>();
  for (const observation of observations) {
    if (!isRecord(observation) || observation.kind !== "reversal") continue;
    const originalId = typeof observation.originalObservationId === "string"
      ? observation.originalObservationId
      : "";
    const original = actions.get(originalId);
    if (
      !original
      || observation.classroomId !== classroomId
      || observation.sessionId !== original.sessionId
      || !isCanonicalInstant(observation.recordedAt)
      || (observation.recordedAt as string) < original.recordedAt
      || typeof observation.reason !== "string"
      || !observation.reason.trim()
      || reversed.has(originalId)
    ) {
      issues.push("Invalid evaluation reversal.");
    }
    reversed.add(originalId);
  }
  return { valid: issues.length === 0, issues };
}

function validateSession(value: unknown, classroomId: string): string | null {
  if (!isRecord(value)) return "Evaluation session must be an object.";
  if (
    !isIdentity(value.id)
    || value.classroomId !== classroomId
    || !isIdentity(value.subjectId)
    || typeof value.localDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate)
    || !isCanonicalInstant(value.openedAt)
    || !isCanonicalInstant(value.closedAt)
    || (value.closedAt as string) <= (value.openedAt as string)
    || !Array.isArray(value.presentStudentIds)
    || !Array.isArray(value.rules)
    || value.rules.length === 0
  ) {
    return "Invalid evaluation session contract.";
  }
  if (!uniqueIdentities(value.presentStudentIds)) return "Invalid or duplicate present student identity.";
  const ruleIds = new Set<string>();
  for (const candidate of value.rules) {
    const issue = validateRule(candidate, value.subjectId as string);
    if (issue) return issue;
    const rule = candidate as CurriculumEvaluationRuleSnapshot;
    if (ruleIds.has(rule.id)) return "Duplicate rule identity in evaluation session.";
    ruleIds.add(rule.id);
  }
  return null;
}

function validateRule(value: unknown, subjectId: string): string | null {
  if (!isRecord(value)) return "Evaluation rule snapshot must be an object.";
  if (
    !isIdentity(value.id)
    || value.subjectId !== subjectId
    || !isIdentity(value.basicKnowledgeId)
    || !isIdentity(value.observableActionId)
    || typeof value.observableLabel !== "string"
    || !value.observableLabel.trim()
    || !Array.isArray(value.criterionIds)
    || value.criterionIds.length === 0
    || !uniqueIdentities(value.criterionIds)
    || !Array.isArray(value.contraryActionIds)
    || value.contraryActionIds.length === 0
    || !uniqueIdentities(value.contraryActionIds)
    || value.contraryActionIds.includes(value.observableActionId)
  ) {
    return "Invalid evaluation rule snapshot.";
  }
  return null;
}

function validateActionObservation(
  value: CurriculumEvaluationActionObservation,
  classroomId: string,
  session: CurriculumEvaluationSession | undefined
): string | null {
  if (
    value.kind !== "action"
    || !isIdentity(value.id)
    || value.classroomId !== classroomId
    || !session
    || value.sessionId !== session.id
    || !session.presentStudentIds.includes(value.studentId)
    || !isIdentity(value.actionId)
    || !value.actionTitle.trim()
    || (value.effect !== "positive" && value.effect !== "contrary")
    || !isCanonicalInstant(value.recordedAt)
    || value.recordedAt < session.openedAt
    || value.recordedAt > session.closedAt
    || !uniqueIdentities(value.ruleIds)
    || value.ruleIds.length === 0
  ) {
    return "Invalid curricular action observation.";
  }
  for (const ruleId of value.ruleIds) {
    const rule = session.rules.find((candidate) => candidate.id === ruleId);
    if (!rule) return "Action observation references a rule outside its session snapshot.";
    const expected = value.effect === "contrary"
      ? rule.contraryActionIds.includes(value.actionId)
      : rule.observableActionId === value.actionId;
    if (!expected) return "Action observation effect does not match its rule snapshot.";
  }
  return null;
}

function advanceState(
  state: CurriculumEvaluationState,
  changes: Partial<Pick<CurriculumEvaluationState, "sessions" | "observations">>,
  occurredAt: string
): CurriculumEvaluationState {
  return Object.freeze({
    ...state,
    ...changes,
    revision: state.revision + 1,
    updatedAt: occurredAt > state.updatedAt ? occurredAt : state.updatedAt,
  });
}

function copySession(session: CurriculumEvaluationSession): CurriculumEvaluationSession {
  return Object.freeze({
    ...session,
    presentStudentIds: Object.freeze([...session.presentStudentIds]),
    rules: Object.freeze(session.rules.map((rule) => Object.freeze({
      ...rule,
      criterionIds: Object.freeze([...rule.criterionIds]),
      contraryActionIds: Object.freeze([...rule.contraryActionIds]),
    }))),
  });
}

function copyObservation<T extends CurriculumEvaluationObservation>(observation: T): T {
  return Object.freeze({
    ...observation,
    ...(observation.kind === "action"
      ? { ruleIds: Object.freeze([...observation.ruleIds]) }
      : {}),
  }) as unknown as T;
}

function createNotices(validSessionCount: number): string[] {
  if (validSessionCount === 0) {
    return ["Sin sesiones válidas: todavía no puede calcularse una nota."];
  }
  return [
    `Nota provisional basada en ${validSessionCount} ${validSessionCount === 1 ? "sesión válida" : "sesiones válidas"}.`,
    "La nota corresponde al observable y cubre solo una parte del criterio curricular.",
    "Una sesión sin incidencias registradas no demuestra por sí sola el dominio completo del criterio.",
    "Las observaciones positivas se muestran aparte y no elevan artificialmente la nota.",
  ];
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function exact(left: unknown, right: unknown): boolean {
  return serializeCurriculumFingerprintValue(left) === serializeCurriculumFingerprintValue(right);
}

function rejected(message = "Invalid curriculum evaluation state."): CurriculumEvaluationChangeResult {
  return { status: "rejected", message };
}

function uniqueIdentities(value: readonly unknown[]): value is readonly string[] {
  return value.every(isIdentity) && new Set(value).size === value.length;
}

function requireIdentity(value: string, field: string): void {
  if (!isIdentity(value)) throw new Error(`${field} must be a non-empty identity.`);
}

function requireCanonicalInstant(value: string, field: string): void {
  if (!isCanonicalInstant(value)) throw new Error(`${field} must be a canonical ISO instant.`);
}

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 300;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
