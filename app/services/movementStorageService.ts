import type { Movement } from "../types/movement";

const STORAGE_KEY = "cristalclass_movements";

export function loadMovements(): Movement[] | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return null;

  const movements = JSON.parse(data) as Movement[];

  return movements.map((movement) => ({
    ...movement,
    date: new Date(movement.date),
  }));
}

export function saveMovements(movements: Movement[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
}

export function clearMovements() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}