import type { Movement } from "../types/movement";

export function addMovement(
  movements: Movement[],
  movement: Omit<Movement, "id" | "date">
): Movement[] {
  return [
    ...movements,
    {
      ...movement,
      id: crypto.randomUUID(),
      date: new Date(),
    },
  ];
}

export function getStudentMovements(
  movements: Movement[],
  studentId: string
): Movement[] {
  return movements.filter(
    (movement) => movement.studentId === studentId
  );
}

export function deleteMovement(
  movements: Movement[],
  movementId: string
): Movement[] {
  return movements.filter(
    (movement) => movement.id !== movementId
  );
}