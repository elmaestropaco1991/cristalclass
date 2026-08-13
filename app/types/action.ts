export type ActionType = string;

export type QuickActionSlot = 1 | 2 | 3 | 4 | 5 | 6;

export type ActionVariant =
  | "success"
  | "bonus"
  | "reward"
  | "warning"
  | "danger"
  | "severe";

export type Action = {
  id: ActionType;
  title: string;
  points: number;
  icon?: string;
  iconId?: string;
  archived: boolean;
  quickSlot: QuickActionSlot | null;

  orbit?: {
    angle: number;
    variant: ActionVariant;
  };
};

export function getActionType(action: Pick<Action, "points">): "positive" | "negative" {
  return action.points >= 0 ? "positive" : "negative";
}
