import type { Movement } from "../types/movement";
import type { ActionType } from "../types/action";

const STORAGE_KEY = "cristalclass_movements";

type StoredMovement = Omit<Movement, "date" | "actionId" | "requestedChange" | "appliedChange"> & {
  date: Date | string;
  actionId?: ActionType;
  requestedChange?: number;
  appliedChange?: number;
};

export function loadMovements(): Movement[] | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return null;

  try {
    const movements = JSON.parse(data) as StoredMovement[];

    return movements.map((movement) => ({
      ...movement,
      actionId: movement.actionId ?? "legacy-unknown",
      requestedChange: movement.requestedChange ?? null,
      appliedChange: movement.appliedChange ?? movement.points,
      date: new Date(movement.date),
    }));
  } catch {
    return null;
  }
}

export function saveMovements(movements: Movement[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
}

export function clearMovements() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}
