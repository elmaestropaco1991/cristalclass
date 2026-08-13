import type { ActionType } from "./action";

export type MovementType = "positive" | "negative";

export type Movement = {
  id: string;

  studentId: string;

  actionId: ActionType | "legacy-unknown";

  date: Date;

  /** Requested at the time the teacher action was applied; null for legacy records. */
  requestedChange: number | null;

  /** Actual crystal balance variation after progression limits are applied. */
  appliedChange: number;

  /** Legacy alias for appliedChange, retained for existing consumers. */
  points: number;

  title: string;

  description?: string;

  type: MovementType;
};
