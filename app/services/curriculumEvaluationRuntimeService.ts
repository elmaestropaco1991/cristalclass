import type { Action } from "../types/action";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import type {
  CurriculumEvaluationActionObservation,
  CurriculumEvaluationRuleSnapshot,
  CurriculumEvaluationState,
} from "../types/curriculumEvaluation";
import {
  appendCurriculumEvaluationAction,
  appendCurriculumEvaluationSession,
  createCurriculumEvaluationRuleFingerprint,
} from "./curriculumEvaluationService";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import { getEffectiveSubject } from "./curriculumAssistantService";

export const CURRICULUM_OPEN_SESSION_SCHEMA_VERSION = 1 as const;
const OPEN_SESSION_STORAGE_PREFIX = "cristalclass_curriculum_open_session_v1";
const OPEN_SESSION_MAX_CODE_UNITS = 250_000;

export interface CurriculumEvaluationOpenSession {
  readonly schemaVersion: typeof CURRICULUM_OPEN_SESSION_SCHEMA_VERSION;
  readonly id: string;
  readonly classroomId: string;
  readonly subjectId: string;
  readonly localDate: string;
  readonly openedAt: string;
  readonly lastActivityAt: string;
  readonly presentStudentIds: readonly string[];
  readonly rules: readonly CurriculumEvaluationRuleSnapshot[];
  readonly observations: readonly CurriculumEvaluationActionObservation[];
}

type OpenSessionEnvelope = {
  readonly schemaVersion: typeof CURRICULUM_OPEN_SESSION_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly session: CurriculumEvaluationOpenSession;
  readonly checksum: string;
};

export type OpenSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type OpenSessionReadResult =
  | { readonly status: "empty" }
  | { readonly status: "valid"; readonly session: CurriculumEvaluationOpenSession }
  | { readonly status: "invalid" | "storage-error"; readonly message: string };

export function createCurriculumEvaluationRuleSnapshots(
  state: CurriculumAssistantState,
  subjectId: string,
  actionCatalog: readonly Action[]
): readonly CurriculumEvaluationRuleSnapshot[] {
  const profile = state.profile;
  const subject = getEffectiveSubject(state, subjectId);
  if (!state.trackingEnabled || !profile || !subject || !profile.ordinaryTracking.enabled) return [];
  return profile.ordinaryTracking.rules.flatMap((rule) => {
    if (!rule.enabled || rule.subjectId !== subject.id) return [];
    const knowledge = subject.basicKnowledge.find((candidate) => candidate.id === rule.basicKnowledgeId);
    const observable = actionCatalog.find((action) =>
      action.id === rule.observableActionId && !action.archived
    );
    const positiveLink = state.actionLinks.find((link) =>
      link.enabled
      && link.profileId === profile.id
      && link.subjectId === subject.id
      && link.basicKnowledgeId === rule.basicKnowledgeId
      && link.actionId === rule.observableActionId
      && link.effect === "positive"
    );
    const contraryActionIds = rule.contraryActionIds.filter((actionId) =>
      actionCatalog.some((action) => action.id === actionId && !action.archived && action.points < 0)
      && state.actionLinks.some((link) =>
        link.enabled
        && link.profileId === profile.id
        && link.subjectId === subject.id
        && link.basicKnowledgeId === rule.basicKnowledgeId
        && link.actionId === actionId
        && link.effect === "contrary"
        && link.recordingMode === "ordinary"
      )
    );
    if (!knowledge || !observable || !positiveLink || contraryActionIds.length === 0) return [];
    return [{
      id: rule.id,
      subjectId: subject.id,
      basicKnowledgeId: knowledge.id,
      observableActionId: observable.id,
      observableLabel: observable.title,
      criterionIds: [...positiveLink.resolvedCriterionIds],
      contraryActionIds,
    } satisfies CurriculumEvaluationRuleSnapshot];
  });
}

export function createOpenCurriculumEvaluationSession(input: {
  readonly id: string;
  readonly classroomId: string;
  readonly subjectId: string;
  readonly localDate: string;
  readonly openedAt: string;
  readonly presentStudentIds: readonly string[];
  readonly rules: readonly CurriculumEvaluationRuleSnapshot[];
}): CurriculumEvaluationOpenSession {
  const session: CurriculumEvaluationOpenSession = {
    schemaVersion: CURRICULUM_OPEN_SESSION_SCHEMA_VERSION,
    id: input.id,
    classroomId: input.classroomId,
    subjectId: input.subjectId,
    localDate: input.localDate,
    openedAt: input.openedAt,
    lastActivityAt: input.openedAt,
    presentStudentIds: unique(input.presentStudentIds),
    rules: input.rules.map(copyRule),
    observations: [],
  };
  const issue = validateOpenSession(session);
  if (issue) throw new Error(issue);
  return deepFreeze(session);
}

export function touchOpenCurriculumEvaluationSession(
  session: CurriculumEvaluationOpenSession,
  presentStudentIds: readonly string[],
  occurredAt: string
): CurriculumEvaluationOpenSession {
  if (!isCanonicalInstant(occurredAt) || occurredAt < session.openedAt) return session;
  const next = {
    ...session,
    lastActivityAt: occurredAt > session.lastActivityAt ? occurredAt : session.lastActivityAt,
    presentStudentIds: unique([...session.presentStudentIds, ...presentStudentIds]),
  };
  return deepFreeze(next);
}

export function recordOpenCurriculumEvaluationAction(
  session: CurriculumEvaluationOpenSession,
  input: {
    readonly observationId: string;
    readonly studentId: string;
    readonly actionId: string;
    readonly actionTitle: string;
    readonly recordedAt: string;
  }
): CurriculumEvaluationOpenSession {
  const contraryRuleIds = session.rules.filter((rule) =>
    rule.contraryActionIds.includes(input.actionId)
  ).map((rule) => rule.id);
  const positiveRuleIds = session.rules.filter((rule) =>
    rule.observableActionId === input.actionId
  ).map((rule) => rule.id);
  if (contraryRuleIds.length > 0 && positiveRuleIds.length > 0) {
    throw new Error("Una acción no puede ser positiva y contraria en la misma sesión.");
  }
  const ruleIds = contraryRuleIds.length > 0 ? contraryRuleIds : positiveRuleIds;
  if (ruleIds.length === 0) return session;
  if (
    !input.observationId.trim()
    || !session.presentStudentIds.includes(input.studentId)
    || !input.actionTitle.trim()
    || !isCanonicalInstant(input.recordedAt)
    || input.recordedAt < session.openedAt
    || session.observations.some((observation) => observation.id === input.observationId)
  ) {
    throw new Error("La observación no pertenece a la sesión curricular abierta.");
  }
  const observation: CurriculumEvaluationActionObservation = {
    kind: "action",
    id: input.observationId,
    classroomId: session.classroomId,
    sessionId: session.id,
    studentId: input.studentId,
    actionId: input.actionId,
    actionTitle: input.actionTitle,
    effect: contraryRuleIds.length > 0 ? "contrary" : "positive",
    ruleIds,
    recordedAt: input.recordedAt,
  };
  return deepFreeze({
    ...session,
    lastActivityAt: input.recordedAt > session.lastActivityAt
      ? input.recordedAt
      : session.lastActivityAt,
    observations: [...session.observations, observation],
  });
}

export function appendClosedCurriculumEvaluationSession(
  state: CurriculumEvaluationState,
  open: CurriculumEvaluationOpenSession,
  closedAt: string
): { readonly status: "applied" | "discarded" | "rejected"; readonly states: readonly CurriculumEvaluationState[]; readonly message?: string } {
  if (!isCanonicalInstant(closedAt) || closedAt <= open.openedAt) {
    return { status: "discarded", states: [] };
  }
  const sessionResult = appendCurriculumEvaluationSession(state, {
    id: open.id,
    classroomId: open.classroomId,
    subjectId: open.subjectId,
    localDate: open.localDate,
    openedAt: open.openedAt,
    closedAt,
    presentStudentIds: open.presentStudentIds,
    rules: open.rules,
  }, closedAt);
  if (sessionResult.status === "rejected") {
    return { status: "rejected", states: [], message: sessionResult.message };
  }
  let current = sessionResult.state;
  const states: CurriculumEvaluationState[] = sessionResult.status === "applied" ? [current] : [];
  for (const observation of open.observations) {
    if (observation.recordedAt > closedAt) {
      return { status: "rejected", states: [], message: "Hay una observación posterior al cierre." };
    }
    const result = appendCurriculumEvaluationAction(current, observation);
    if (result.status === "rejected") {
      return { status: "rejected", states: [], message: result.message };
    }
    current = result.state;
    if (result.status === "applied") states.push(current);
  }
  return { status: "applied", states };
}

export function getOpenCurriculumEvaluationSessionStorageKey(classroomId: string): string {
  return `${OPEN_SESSION_STORAGE_PREFIX}:${encodeURIComponent(classroomId)}`;
}

export function persistOpenCurriculumEvaluationSession(
  storage: OpenSessionStorage,
  session: CurriculumEvaluationOpenSession
): boolean {
  const issue = validateOpenSession(session);
  if (issue) return false;
  const envelope: OpenSessionEnvelope = {
    schemaVersion: CURRICULUM_OPEN_SESSION_SCHEMA_VERSION,
    classroomId: session.classroomId,
    session,
    checksum: openSessionChecksum(session),
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > OPEN_SESSION_MAX_CODE_UNITS) return false;
  try {
    storage.setItem(getOpenCurriculumEvaluationSessionStorageKey(session.classroomId), serialized);
    return readOpenCurriculumEvaluationSession(storage, session.classroomId).status === "valid";
  } catch {
    return false;
  }
}

export function readOpenCurriculumEvaluationSession(
  storage: OpenSessionStorage,
  classroomId: string
): OpenSessionReadResult {
  try {
    const serialized = storage.getItem(getOpenCurriculumEvaluationSessionStorageKey(classroomId));
    if (serialized === null) return { status: "empty" };
    if (serialized.length > OPEN_SESSION_MAX_CODE_UNITS) throw new Error("La sesión supera el límite.");
    const parsed = JSON.parse(serialized) as OpenSessionEnvelope;
    const issue = validateOpenSession(parsed?.session);
    if (
      parsed?.schemaVersion !== CURRICULUM_OPEN_SESSION_SCHEMA_VERSION
      || parsed.classroomId !== classroomId
      || issue
      || parsed.checksum !== openSessionChecksum(parsed.session)
    ) throw new Error(issue ?? "La integridad no coincide.");
    return { status: "valid", session: deepFreeze(parsed.session) };
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : "La sesión abierta no es válida.",
    };
  }
}

export function clearOpenCurriculumEvaluationSession(
  storage: OpenSessionStorage,
  classroomId: string
): boolean {
  try {
    storage.removeItem(getOpenCurriculumEvaluationSessionStorageKey(classroomId));
    return storage.getItem(getOpenCurriculumEvaluationSessionStorageKey(classroomId)) === null;
  } catch {
    return false;
  }
}

export function sameRuleSnapshots(
  left: readonly CurriculumEvaluationRuleSnapshot[],
  right: readonly CurriculumEvaluationRuleSnapshot[]
): boolean {
  return left.length === right.length && left.every((rule, index) =>
    createCurriculumEvaluationRuleFingerprint(rule)
      === createCurriculumEvaluationRuleFingerprint(right[index])
  );
}

function validateOpenSession(value: unknown): string | null {
  if (!isRecord(value)) return "La sesión abierta no es un objeto.";
  if (
    value.schemaVersion !== CURRICULUM_OPEN_SESSION_SCHEMA_VERSION
    || !isIdentity(value.id)
    || !isIdentity(value.classroomId)
    || !isIdentity(value.subjectId)
    || typeof value.localDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate)
    || !isCanonicalInstant(value.openedAt)
    || !isCanonicalInstant(value.lastActivityAt)
    || value.lastActivityAt < value.openedAt
    || !Array.isArray(value.presentStudentIds)
    || !value.presentStudentIds.every(isIdentity)
    || new Set(value.presentStudentIds).size !== value.presentStudentIds.length
    || !Array.isArray(value.rules)
    || value.rules.length === 0
    || !Array.isArray(value.observations)
  ) return "El contrato de la sesión abierta no es válido.";
  return null;
}

function openSessionChecksum(session: CurriculumEvaluationOpenSession): string {
  return `curriculum-open-session-v1:${createCurriculumDeterministicFingerprint(session)}`;
}

function copyRule(rule: CurriculumEvaluationRuleSnapshot): CurriculumEvaluationRuleSnapshot {
  return {
    ...rule,
    criterionIds: [...rule.criterionIds],
    contraryActionIds: [...rule.contraryActionIds],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
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

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
