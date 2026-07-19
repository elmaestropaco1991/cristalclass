"use client";

import { useState } from "react";
import StudentForm from "./StudentForm";
import type { Student } from "../types/student";

type Props = {
  abierto: boolean;
  alumnos: Student[];
  onCerrar: () => void;
  onGuardarAlumno: (alumno: Student) => void;
  onEliminarAlumno: (id: string) => void;
};

export default function StudentManager({
  abierto,
  alumnos,
  onCerrar,
  onGuardarAlumno,
  onEliminarAlumno,
}: Props) {
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [alumnoEditando, setAlumnoEditando] = useState<Student | null>(null);

  if (!abierto) return null;

  function nuevoAlumno() {
    setAlumnoEditando(null);
    setFormularioAbierto(true);
  }

  function editarAlumno(alumno: Student) {
    setAlumnoEditando(alumno);
    setFormularioAbierto(true);
  }

  function cerrarFormulario() {
    setFormularioAbierto(false);
    setAlumnoEditando(null);
  }

  function eliminarAlumno(id: string) {
    if (!confirm("¿Seguro que deseas eliminar este alumno?")) {
      return;
    }

    onEliminarAlumno(id);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onCerrar}
      />

      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl shadow-2xl w-[800px] max-h-[90vh] overflow-auto">
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-3xl font-bold">
              👥 Gestionar alumnos
            </h2>

            <button
              onClick={onCerrar}
              className="text-3xl hover:text-red-500"
            >
              ✕
            </button>
          </div>

          <div className="p-6">
            <button
              onClick={nuevoAlumno}
              className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 mb-6"
            >
              ➕ Añadir alumno
            </button>

            <div className="border rounded-2xl overflow-hidden">
              {alumnos.map((alumno) => (
                <div
                  key={alumno.id}
                  className="flex justify-between items-center p-4 border-b last:border-b-0 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={alumno.avatar}
                      alt={alumno.nombre}
                      className="w-12 h-12 rounded-full object-cover"
                    />

                    <div>
                      <p className="font-bold text-lg">
                        {alumno.nombre} {alumno.apellidos}
                      </p>

                      <p className="text-blue-600">
                        💎 {alumno.cristales}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => editarAlumno(alumno)}
                      className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600"
                    >
                      ✏️
                    </button>

                    <button
                      onClick={() => eliminarAlumno(alumno.id)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <StudentForm
        abierto={formularioAbierto}
        titulo={alumnoEditando ? "Editar alumno" : "Nuevo alumno"}
        alumno={alumnoEditando}
        onCerrar={cerrarFormulario}
        onGuardar={onGuardarAlumno}
      />
    </>
  );
}