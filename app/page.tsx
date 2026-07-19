"use client";

import { useState } from "react";

import Header from "./components/Header";
import MenuButton from "./components/MenuButton";
import SideMenu from "./components/SideMenu";
import StudentCard from "./components/StudentCard";
import StudentModal from "./components/StudentModal";
import StudentManager from "./components/StudentManager";

import { useStudents } from "./hooks/useStudents";
import { useMovements } from "./hooks/useMovements";
import { getAction } from "./services/actionService";

export default function Home() {
  const {
    alumnos,
    seleccionado,
    setSeleccionado,
    modificarCristales,
    guardarAlumno,
    eliminarAlumno,
  } = useStudents();

  const { registrarMovimiento } = useMovements();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [gestorAlumnosAbierto, setGestorAlumnosAbierto] = useState(false);

  function ejecutarAccion(actionId: string) {
    if (!seleccionado) return;

    const action = getAction(actionId as any);

    if (!action) return;

    modificarCristales(action.points);
    registrarMovimiento(seleccionado.id, action.id);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="flex justify-between items-start mb-8">
        <Header />
        <MenuButton onClick={() => setMenuAbierto(true)} />
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
          onCerrar={() => setSeleccionado(null)}
          onAccion={ejecutarAccion}
        />
      )}
    </main>
  );
}