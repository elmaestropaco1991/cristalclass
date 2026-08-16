import type { RandomStudentRoundState } from "../types/randomStudentSelector";
import {
  createRandomStudentRoundState,
  normalizeRandomStudentRoundState,
} from "./randomStudentSelectorService";

const STORAGE_PREFIX = "cristalclass_random_student_selector_v1";
type SelectorStorage = Pick<Storage, "getItem" | "setItem">;

export function getRandomStudentSelectorStorageKey(classroomId: string): string {
  return `${STORAGE_PREFIX}_${encodeURIComponent(classroomId)}`;
}

export function loadRandomStudentRoundState(
  classroomId: string,
  validStudentIds: readonly string[],
  storage: SelectorStorage | null = getBrowserStorage()
): RandomStudentRoundState {
  const fallback = createRandomStudentRoundState(classroomId);
  if (!storage) return fallback;

  const stored = storage.getItem(getRandomStudentSelectorStorageKey(classroomId));
  if (!stored) return fallback;

  try {
    return normalizeRandomStudentRoundState(
      JSON.parse(stored),
      classroomId,
      validStudentIds
    );
  } catch {
    return fallback;
  }
}

export function saveRandomStudentRoundState(
  state: RandomStudentRoundState,
  storage: SelectorStorage | null = getBrowserStorage()
): void {
  if (!storage) return;
  storage.setItem(getRandomStudentSelectorStorageKey(state.classroomId), JSON.stringify(state));
}

function getBrowserStorage(): SelectorStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
