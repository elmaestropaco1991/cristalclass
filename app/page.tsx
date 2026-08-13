"use client";

import { useEffect, useState } from "react";

import Header from "./components/Header";
import MenuButton from "./components/MenuButton";
import SideMenu from "./components/SideMenu";
import StudentCard from "./components/StudentCard";
import StudentModal from "./components/StudentModal";
import StudentManager from "./components/StudentManager";
import SoundToggleButton from "./components/SoundToggleButton";

import { useStudents } from "./hooks/useStudents";
import { useMovements } from "./hooks/useMovements";
import { useSoundPreference } from "./hooks/useSoundPreference";
import { createLegacyApplyStudentAction } from "./services/legacyApplyStudentAction";
import { preloadActionSounds } from "./services/actionSoundService";
import type { ActionType } from "./types/action";

export default function Home() {
  const {
    alumnos,
    seleccionado,
    setSeleccionado,
    modificarCristales,
    guardarAlumno,
    eliminarAlumno,
  } = useStudents();

  const { movements, registrarMovimiento } = useMovements();
  const { soundEnabled, toggleSound } = useSoundPreference();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [gestorAlumnosAbierto, setGestorAlumnosAbierto] = useState(false);

  useEffect(() => {
    preloadActionSounds();
  }, []);

  const applyStudentAction = createLegacyApplyStudentAction({
    modificarCristales,
    registrarMovimiento,
  });

  async function ejecutarAccion(actionId: ActionType) {
    if (!seleccionado) return false;

    try {
      const result = await applyStudentAction.execute({
        id: crypto.randomUUID(),
        type: "apply-student-action",
        teacherId: "legacy-local-teacher",
        target: {
          id: seleccionado.id,
          type: "student",
        },
        issuedAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
        payload: { actionId },
        metadata: {
          classroomId: seleccionado.claseId,
        },
      });

      return result.status === "committed";
    } catch {
      return false;
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="flex justify-between items-start mb-8">
        <Header />
        <div className="flex items-center gap-3">
          <SoundToggleButton soundEnabled={soundEnabled} onToggle={toggleSound} />
          <MenuButton onClick={() => setMenuAbierto(true)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {alumnos.map((alumno) => (
          <StudentCard
            key={alumno.id}
            alumno={alumno}
            onClick={() => setSeleccionado(alumno)}
          />
        ))}
      </div>

      <SideMenu
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        onGestionarAlumnos={() => setGestorAlumnosAbierto(true)}
      />

      <StudentManager
        abierto={gestorAlumnosAbierto}
        alumnos={alumnos}
        onCerrar={() => setGestorAlumnosAbierto(false)}
        onGuardarAlumno={guardarAlumno}
        onEliminarAlumno={eliminarAlumno}
      />

      {seleccionado && (
        <StudentModal
          alumno={seleccionado}
          movements={movements}
          soundEnabled={soundEnabled}
          onCerrar={() => setSeleccionado(null)}
          onAccion={ejecutarAccion}
          onStudentUpdated={guardarAlumno}
        />
      )}
    </main>
  );
}
