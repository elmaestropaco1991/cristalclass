import { SUBJECT_CATALOG } from "../data/subjects";
import type { SubjectDefinition, SubjectId } from "../types/subject";

const SUBJECT_IDS = new Set<string>(SUBJECT_CATALOG.map((subject) => subject.id));

/** Returns a new array so callers cannot reorder the central catalog. */
export function getOrderedSubjectCatalog(): SubjectDefinition[] {
  return [...SUBJECT_CATALOG].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  );
}

export function isSubjectId(value: unknown): value is SubjectId {
  return typeof value === "string" && SUBJECT_IDS.has(value);
}

export function getSubjectDefinition(subjectId: SubjectId): SubjectDefinition {
  const subject = SUBJECT_CATALOG.find((candidate) => candidate.id === subjectId);

  if (!subject) {
    throw new Error("Selecciona una asignatura válida.");
  }

  return subject;
}
