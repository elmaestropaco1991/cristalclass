import { useEffect, useState } from "react";

import type { Student } from "../types/student";
import { initialStudents } from "../data/students";

import {
  addStudent,
  updateStudent,
  applyCrystalChangeToStudent,
  deleteStudent,
} from "../services/studentService";
import type { CrystalUpdate } from "../services/studentService";

import {
  loadStudents,
  saveStudents,
} from "../services/storageService";

export function useStudents() {
  const [alumnos, setAlumnos] = useState<Student[]>(initialStudents);
  const [seleccionado, setSeleccionado] = useState<Student | null>(null);
  const [hasHydratedStudents, setHasHydratedStudents] = useState(false);

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      const storedStudents = loadStudents();
      if (storedStudents) setAlumnos(storedStudents);
      setHasHydratedStudents(true);
    });

    return () => cancelAnimationFrame(hydrationFrame);
  }, []);

  useEffect(() => {
    if (!hasHydratedStudents) return;
    saveStudents(alumnos);
  }, [alumnos, hasHydratedStudents]);

  function modificarCristales(
    alumnoId: string,
    cambio: number
  ): CrystalUpdate | undefined {
    const { students: nuevos, change, generatedChests } = applyCrystalChangeToStudent(
      alumnos,
      alumnoId,
      cambio
    );

    if (!change) return undefined;

    saveStudents(nuevos);
    setAlumnos(nuevos);

    const actualizado = nuevos.find(
      (a) => a.id === alumnoId
    );

    if (actualizado && seleccionado?.id === alumnoId) {
      setSeleccionado(actualizado);
    }

    return { students: nuevos, change, generatedChests };
  }

  function guardarAlumno(alumno: Student) {
    if (alumno.id) {
      setAlumnos((prev) => updateStudent(prev, alumno));
      if (seleccionado?.id === alumno.id) setSeleccionado(alumno);
    } else {
      setAlumnos((prev) => addStudent(prev, alumno));
    }
  }

  function eliminarAlumno(id: string) {
    setAlumnos((prev) => deleteStudent(prev, id));

    if (seleccionado?.id === id) {
      setSeleccionado(null);
    }
  }

  return {
    alumnos,
    seleccionado,
    setSeleccionado,
    modificarCristales,
    guardarAlumno,
    eliminarAlumno,
  };
}
