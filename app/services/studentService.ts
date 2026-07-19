import type { Student } from "../types/student";

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
    },
  ];
}

export function updateStudent(
  alumnos: Student[],
  alumno: Student
): Student[] {
  return alumnos.map((a) =>
    a.id === alumno.id ? alumno : a
  );
}

export function updateCrystals(
  alumnos: Student[],
  alumnoId: string,
  cambio: number
): Student[] {
  return alumnos.map((a) =>
    a.id === alumnoId
      ? {
          ...a,
          cristales: a.cristales + cambio,
        }
      : a
  );
}

export function deleteStudent(
  alumnos: Student[],
  alumnoId: string
): Student[] {
  return alumnos.filter((a) => a.id !== alumnoId);
}