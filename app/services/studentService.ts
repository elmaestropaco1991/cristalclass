import type { Student } from "../types/student";
import type { Chest } from "../types/chest";
import {
  DEFAULT_PROGRESSION_CONFIG,
  applyCrystalChange,
  type CrystalChange,
} from "../../domain/progression/StudentProgression";
import {
  DEFAULT_CHEST_PROGRESSION_CONFIG,
  processChestProgress,
} from "../../domain/progression/ChestProgression";

export function addStudent(
  alumnos: Student[],
  alumno: Student
): Student[] {
  return [
    ...alumnos,
    {
      ...alumno,
      id: crypto.randomUUID(),
      fechaCreacion: new Date(),
      activo: true,
      highestCrystalTotal: Math.max(0, alumno.cristales),
      chestProgress: 0,
    },
  ];
}

export function updateStudent(
  alumnos: Student[],
  alumno: Student
): Student[] {
  return alumnos.map((a) =>
    a.id === alumno.id
      ? {
          ...alumno,
          highestCrystalTotal: Math.max(
            0,
            a.highestCrystalTotal,
            alumno.highestCrystalTotal,
            alumno.cristales
          ),
        }
      : a
  );
}

export interface CrystalUpdate {
  students: Student[];
  change?: CrystalChange;
  generatedChests: readonly Chest[];
}

export function applyCrystalChangeToStudent(
  alumnos: Student[],
  alumnoId: string,
  cambio: number
): CrystalUpdate {
  const student = alumnos.find((a) => a.id === alumnoId);

  if (!student) {
    return { students: alumnos, generatedChests: [] };
  }

  const change = applyCrystalChange({
    crystals: student.cristales,
    highestCrystalTotal: student.highestCrystalTotal,
    requestedChange: cambio,
    config: DEFAULT_PROGRESSION_CONFIG,
  });
  const chestProgression = processChestProgress({
    previousCrystals: change.previousCrystals,
    previousHighestCrystalTotal: change.previousHighestCrystalTotal,
    appliedChange: change.appliedChange,
    previousChestProgress: student.chestProgress,
    progressionConfig: DEFAULT_PROGRESSION_CONFIG,
    chestConfig: DEFAULT_CHEST_PROGRESSION_CONFIG,
  });
  const generatedChests: Chest[] = chestProgression.generatedChestEvolutions.map(
    (evolution) => ({
      id: crypto.randomUUID(),
      evolution,
      status: "pending",
      obtainedAt: new Date(),
    })
  );

  return {
    students: alumnos.map((a) =>
      a.id === alumnoId
        ? {
            ...a,
            cristales: change.crystals,
            highestCrystalTotal: change.highestCrystalTotal,
            chestProgress: chestProgression.chestProgress,
            chests: [...a.chests, ...generatedChests],
          }
        : a
    ),
    change,
    generatedChests,
  };
}

export function deleteStudent(
  alumnos: Student[],
  alumnoId: string
): Student[] {
  return alumnos.filter((a) => a.id !== alumnoId);
}
