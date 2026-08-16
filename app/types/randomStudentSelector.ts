export const RANDOM_STUDENT_SELECTOR_SCHEMA_VERSION = 1 as const;

export type RandomStudentSelectionMode = "single" | "continuous";
export type StudentModalOrigin = "classroom" | RandomStudentSelectionMode;

export interface RandomStudentRoundState {
  readonly schemaVersion: typeof RANDOM_STUDENT_SELECTOR_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly activeMode: RandomStudentSelectionMode;
  readonly selectedStudentIds: readonly string[];
  readonly isContinuousRunning: boolean;
}

export type RandomSelectionActionFlow =
  | "keep-modal-open"
  | "close-to-classroom"
  | "close-and-select-next";
