export const DEFAULT_CLASSROOM_ID = "4o-primaria-a";

/**
 * Uses the first persisted class identifier when available. Legacy local data has
 * empty claseId values, so the existing classroom-preference fallback stays the
 * deterministic identity until the project has a reliable class entity.
 */
export function resolveClassroomId(students: readonly { claseId: string }[]): string {
  const classroomId = students.find((student) => student.claseId.trim())?.claseId.trim();
  return classroomId || DEFAULT_CLASSROOM_ID;
}
