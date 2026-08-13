"use client";

import { useState } from "react";
import Image from "next/image";
import type { Student } from "../types/student";
import { createEmptyCharacterEquipment } from "../../domain/collection/CharacterEquipment";
import { createInitialStudentInventory } from "../data/initialStudentInventory";
import {
  DEFAULT_FULL_BODY_AVATAR_ID,
  FULL_BODY_AVATARS,
  isFullBodyAvatarId,
  type FullBodyAvatarId,
} from "../data/fullBodyAvatars";

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
  if (!abierto) return null;

  return (
    <StudentFormContent
      key={alumno?.id ?? "new-student"}
      titulo={titulo}
      alumno={alumno}
      onCerrar={onCerrar}
      onGuardar={onGuardar}
    />
  );
}

type FormContentProps = Omit<Props, "abierto">;

function StudentFormContent({
  titulo,
  alumno,
  onCerrar,
  onGuardar,
}: FormContentProps) {
  const [nombre, setNombre] = useState(alumno?.nombre ?? "");
  const [apellidos, setApellidos] = useState(alumno?.apellidos ?? "");
  const [fullBodyAvatarId, setFullBodyAvatarId] = useState<FullBodyAvatarId>(
    isFullBodyAvatarId(alumno?.fullBodyAvatarId)
      ? alumno.fullBodyAvatarId
      : DEFAULT_FULL_BODY_AVATAR_ID
  );

  const editando = alumno !== null && alumno !== undefined;

  function guardar() {
    if (!nombre.trim()) return;

    onGuardar({
      id: alumno?.id ?? "",
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      avatar: alumno?.avatar ?? {
        id: "explorer01",
        theme: "fantasy",
        level: 1,
        skin: "default",
      },
      fullBodyAvatarId,
      inventory: alumno?.inventory ?? createInitialStudentInventory(),
      equipment: alumno?.equipment ?? createEmptyCharacterEquipment(),
      chests: alumno?.chests ?? [],
      chestProgress: alumno?.chestProgress ?? 0,
      email: alumno?.email ?? "",
      claseId: alumno?.claseId ?? "",
      numeroLista: alumno?.numeroLista ?? 0,
      cristales: alumno?.cristales ?? 0,
      highestCrystalTotal: alumno?.highestCrystalTotal ?? Math.max(0, alumno?.cristales ?? 0),
      monedas: alumno?.monedas ?? 0,
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

          <fieldset className="mt-6">
            <legend className="mb-3 text-lg font-semibold">Avatar de cuerpo entero</legend>
            <div className="grid grid-cols-2 gap-4">
              {FULL_BODY_AVATARS.map((avatar) => {
                const selected = fullBodyAvatarId === avatar.id;

                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setFullBodyAvatarId(avatar.id)}
                    aria-pressed={selected}
                    className={`rounded-2xl border-2 p-3 text-center transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 shadow-md"
                        : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <Image
                      src={avatar.src}
                      alt=""
                      width={160}
                      height={160}
                      unoptimized
                      className="mx-auto h-32 w-full object-contain object-bottom"
                    />
                    <span className="mt-2 block text-base font-bold">{avatar.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

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
