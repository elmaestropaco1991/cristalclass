"use client";

import { useEffect, useState } from "react";
import type { Student } from "../types/student";

type Props = {
  abierto: boolean;
  titulo: string;
  alumno?: Student | null;
  onCerrar: () => void;
  onGuardar: (alumno: Student) => void;
};

export default function StudentForm({
  abierto,
  titulo,
  alumno,
  onCerrar,
  onGuardar,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");

  useEffect(() => {
    setNombre(alumno?.nombre ?? "");
    setApellidos(alumno?.apellidos ?? "");
  }, [alumno, abierto]);

  if (!abierto) return null;

  const editando = alumno !== null && alumno !== undefined;

  function guardar() {
    if (!nombre.trim()) return;

    onGuardar({
      id: alumno?.id ?? "",
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      avatar: alumno?.avatar ?? "/Avatar/Ana.png.jpg",
      email: alumno?.email ?? "",
      claseId: alumno?.claseId ?? "",
      numeroLista: alumno?.numeroLista ?? 0,
      cristales: alumno?.cristales ?? 0,
      activo: alumno?.activo ?? true,
      notas: alumno?.notas ?? "",
      fechaCreacion: alumno?.fechaCreacion ?? new Date(),
    });

    onCerrar();
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[60]"
        onClick={onCerrar}
      />

      <div className="fixed inset-0 flex items-center justify-center z-[61]">
        <div className="bg-white rounded-3xl shadow-2xl w-[550px] p-8">
          <h2 className="text-3xl font-bold mb-6">
            {titulo}
          </h2>

          <label className="block mb-2 font-semibold">
            Nombre
          </label>

          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border rounded-xl p-3 text-lg mb-5"
            placeholder="Nombre"
          />

          <label className="block mb-2 font-semibold">
            Apellidos
          </label>

          <input
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            className="w-full border rounded-xl p-3 text-lg"
            placeholder="Apellidos"
          />

          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onCerrar}
              className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300"
            >
              Cancelar
            </button>

            <button
              onClick={guardar}
              className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            >
              {editando ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}