export type MovementType = "positive" | "negative";

export type Movement = {
  id: string;

  studentId: string;

  date: Date;

  points: number;

  title: string;

  description?: string;

  type: MovementType;
};