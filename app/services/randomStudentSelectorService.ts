import {
  RANDOM_STUDENT_SELECTOR_SCHEMA_VERSION,
  type RandomSelectionActionFlow,
  type RandomStudentRoundState,
  type RandomStudentSelectionMode,
  type StudentModalOrigin,
} from "../types/randomStudentSelector";

export type RandomSelectionAnimationPlan = {
  readonly frameDelaysMs: readonly number[];
  readonly selectedHoldMs: number;
};

export type RandomSelectorCandidatePresentation = {
  readonly studentId: string;
  readonly name: string;
  readonly artwork: "equipped-avatar";
};

export type RandomSelectorAccess = "random" | "round";
export type RandomSelectionCompletionResult =
  | RandomSelectionActionFlow
  | "ignored";

export function getRandomSelectionModeForAccess(
  access: RandomSelectorAccess
): RandomStudentSelectionMode {
  return access === "round" ? "continuous" : "single";
}

export function createRandomSelectionActionCompletionGuard() {
  let completed = false;

  return {
    reset() {
      completed = false;
    },
    complete(flow: RandomSelectionActionFlow): RandomSelectionCompletionResult {
      if (completed) return "ignored";
      completed = true;
      return flow;
    },
  };
}

export function shouldStartNextRandomSelection(
  flow: RandomSelectionCompletionResult,
  remainingStudentCount: number
): boolean {
  return flow === "close-and-select-next" && remainingStudentCount > 0;
}

export function createRandomStudentRoundState(
  classroomId: string
): RandomStudentRoundState {
  return {
    schemaVersion: RANDOM_STUDENT_SELECTOR_SCHEMA_VERSION,
    classroomId,
    activeMode: "single",
    selectedStudentIds: [],
    isContinuousRunning: false,
  };
}

export function normalizeRandomStudentRoundState(
  value: unknown,
  classroomId: string,
  validStudentIds: readonly string[]
): RandomStudentRoundState {
  const source = isRecord(value) ? value : {};
  const validIds = new Set(validStudentIds.filter(Boolean));
  const selectedIds = new Set<string>();

  if (Array.isArray(source.selectedStudentIds)) {
    for (const candidate of source.selectedStudentIds) {
      if (typeof candidate !== "string" || !validIds.has(candidate)) continue;
      selectedIds.add(candidate);
    }
  }

  const activeMode: RandomStudentSelectionMode = source.activeMode === "continuous"
    ? "continuous"
    : "single";

  return {
    schemaVersion: RANDOM_STUDENT_SELECTOR_SCHEMA_VERSION,
    classroomId,
    activeMode,
    selectedStudentIds: [...selectedIds],
    isContinuousRunning:
      activeMode === "continuous" && source.isContinuousRunning === true,
  };
}

export function getAvailableStudentIds(
  state: RandomStudentRoundState,
  presentStudentIds: readonly string[]
): string[] {
  const selectedIds = new Set(state.selectedStudentIds);
  return uniqueIds(presentStudentIds).filter((studentId) => !selectedIds.has(studentId));
}

export function setRandomStudentSelectionMode(
  state: RandomStudentRoundState,
  mode: RandomStudentSelectionMode
): RandomStudentRoundState {
  return {
    ...state,
    activeMode: mode,
    isContinuousRunning: mode === "continuous",
  };
}

export function stopContinuousRound(
  state: RandomStudentRoundState
): RandomStudentRoundState {
  if (!state.isContinuousRunning) return state;
  return { ...state, isContinuousRunning: false };
}

export function resetContinuousRound(
  state: RandomStudentRoundState
): RandomStudentRoundState {
  return {
    ...state,
    activeMode: "continuous",
    selectedStudentIds: [],
    isContinuousRunning: false,
  };
}

export function recordRoundSelection(
  state: RandomStudentRoundState,
  studentId: string
): RandomStudentRoundState {
  if (!studentId || state.selectedStudentIds.includes(studentId)) return state;
  return {
    ...state,
    activeMode: "continuous",
    selectedStudentIds: [...state.selectedStudentIds, studentId],
  };
}

export function selectRandomStudentId(
  candidateIds: readonly string[],
  randomSource: () => number = secureRandomFraction
): string | null {
  const candidates = uniqueIds(candidateIds);
  if (candidates.length === 0) return null;

  const randomValue = randomSource();
  const boundedValue = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0;

  return candidates[Math.floor(boundedValue * candidates.length)] ?? null;
}

export function getRandomSelectionAnimationPlan(
  reducedMotion: boolean
): RandomSelectionAnimationPlan {
  return reducedMotion
    ? { frameDelaysMs: [], selectedHoldMs: 220 }
    : {
        frameDelaysMs: [70, 80, 90, 105, 125, 150, 180, 220, 275, 340, 410],
        selectedHoldMs: 520,
      };
}

export function createRandomSelectionPreviewSequence(
  candidateIds: readonly string[],
  targetStudentId: string,
  frameCount: number
): string[] {
  const candidates = uniqueIds(candidateIds);
  if (candidates.length === 0 || frameCount <= 0) return [targetStudentId];

  const sequence = Array.from(
    { length: frameCount },
    (_, index) => candidates[index % candidates.length] ?? targetStudentId
  );
  return [...sequence, targetStudentId];
}

export function getRandomSelectorCandidatePresentation(
  student: { readonly id: string; readonly nombre: string }
): RandomSelectorCandidatePresentation {
  return {
    studentId: student.id,
    name: student.nombre,
    artwork: "equipped-avatar",
  };
}

export function resolveRandomSelectionActionFlow(
  origin: StudentModalOrigin,
  actionCommitted: boolean,
  isContinuousRunning: boolean
): RandomSelectionActionFlow {
  if (!actionCommitted) return "keep-modal-open";
  if (origin === "continuous" && isContinuousRunning) {
    return "close-and-select-next";
  }
  return "close-to-classroom";
}

function secureRandomFraction(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return (value[0] ?? 0) / 0x1_0000_0000;
  }

  return Math.random();
}

function uniqueIds(studentIds: readonly string[]): string[] {
  return [...new Set(studentIds.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
