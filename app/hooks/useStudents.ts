import { useEffect, useState } from "react";

import type { Student } from "../types/student";
import { initialStudents } from "../data/students";

import {
  addStudent,
  updateStudent,
  updateCrystals,
  deleteStudent,
} from "../services/studentService";

import {
  loadStudents,
  saveStudents,
} from "../services/storageService";

export function useStudents() {
  const [alumnos, setAlumnos] = useState<Student[]>([]);
  const [seleccionado, setSeleccionado] = useState<Student | null>(null);

  useEffect(() => {
    const almacenados = loadStudents();

    if (almacenados) {
      setAlumnos(almacenados);
    } else {
      setAlumnos(initialStudents);
    }
  }, []);

  useEffect(() => {
    if (alumnos.length > 0) {
      saveStudents(alumnos);
    }
  }, [alumnos]);

  function modificarCristales(cambio: number) {
    if (!seleccionado) return;

    const nuevos = updateCrystals(
      alumnos,
      seleccionado.id,
      cambio
    );

    setAlumnos(nuevos);

    const actualizado = nuevos.find(
      (a) => a.id === seleccionado.id
    );

    if (actualizado) {
      setSeleccionado(actualizado);
    }
  }

  function guardarAlumno(alumno: Student) {
    if (alumno.id) {
      setAlumnos((prev) => updateStudent(prev, alumno));
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