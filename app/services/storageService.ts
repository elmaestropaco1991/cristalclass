import type { Student } from "../types/student";

const STORAGE_KEY = "cristalclass_students";

export function loadStudents(): Student[] | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveStudents(alumnos: Student[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(alumnos)
  );
}

export function clearStudents() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}