import type { SubjectId } from "./subject";

export type ActionType = string;

export type QuickActionSlot = 1 | 2 | 3 | 4 | 5 | 6;

export type ActionVariant =
  | "success"
  | "bonus"
  | "reward"
  | "warning"
  | "danger"
  | "severe";

/** Reference only: the official criterion catalog is introduced in a later phase. */
export interface AttitudinalCriterionReference {
  readonly criterionId: string;
  readonly catalogVersion: string;
}

export interface ActionSubjectContext {
  readonly subjectId: SubjectId;
  readonly availableInAllSubjects: boolean;
}

export type Action = {
  id: ActionType;
  title: string;
  points: number;
  icon?: string;
  iconId?: string;
  archived: boolean;
  quickSlot: QuickActionSlot | null;
  subjectId: SubjectId;
  availableInAllSubjects: boolean;
  attitudinalCriterionLinks: readonly AttitudinalCriterionReference[];
  trackOrdinaryCompliance: boolean;

  orbit?: {
    angle: number;
    variant: ActionVariant;
  };
};

export function getActionType(action: Pick<Action, "points">): "positive" | "negative" {
  return action.points >= 0 ? "positive" : "negative";
}
