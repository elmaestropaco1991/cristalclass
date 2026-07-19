export type ActionType =
  | "correct_answer"
  | "help_classmate"
  | "weekly_challenge"
  | "bring_material"
  | "talking"
  | "disturbing"
  | "disrespect";

export type Action = {
  id: ActionType;

  title: string;

  points: number;

  type: "positive" | "negative";

  icon: string;
};