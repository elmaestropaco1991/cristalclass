"use client";

import { useEffect, useState, type CSSProperties } from "react";

import Header from "./components/Header";
import AttendancePanel from "./components/AttendancePanel";
import ClassroomContextNavigation from "./components/ClassroomContextNavigation";
import MenuButton from "./components/MenuButton";
import SideMenu from "./components/SideMenu";
import StudentCard from "./components/StudentCard";
import StudentModal from "./components/StudentModal";
import StudentManager from "./components/StudentManager";
import SoundToggleButton from "./components/SoundToggleButton";

import { useStudents } from "./hooks/useStudents";
import { useMovements } from "./hooks/useMovements";
import { useSoundPreference } from "./hooks/useSoundPreference";
import { useClassroomGuardianScale } from "./hooks/useClassroomGuardianScale";
import { createLegacyApplyStudentAction } from "./services/legacyApplyStudentAction";
import { preloadActionSounds } from "./services/actionSoundService";
import { resolveClassroomId } from "./services/classroomIdentityService";
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
  const { soundEnabled, setSoundEnabled, toggleSound } = useSoundPreference();
  const classroomId = resolveClassroomId(alumnos);
  const { guardianScale, setGuardianScale, resetGuardianScale } = useClassroomGuardianScale(
    classroomId
  );
  const guardianScaleStyle = {
    "--guardian-scale": guardianScale / 100,
    "--guardian-scale-mobile": Math.min(guardianScale, 120) / 100,
  } as CSSProperties;
  const isOverviewScale = guardianScale <= 60;

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [gestorAlumnosAbierto, setGestorAlumnosAbierto] = useState(false);
  const [asistenciaAbierta, setAsistenciaAbierta] = useState(false);

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
    <main className="h-dvh overflow-y-auto bg-[#e8f3f6] text-slate-950">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#f7edcf_0%,#eaf6f7_42%,#c6e8ef_100%)]" />
        <div className="absolute -left-36 -top-36 h-[32rem] w-[32rem] rounded-full bg-amber-100/65 blur-3xl" />
        <div className="absolute -bottom-52 -right-32 h-[38rem] w-[38rem] rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.9)_0_1px,transparent_1.5px)] [background-size:42px_42px]" />
      </div>

      <ClassroomContextNavigation onOpenAttendance={() => setAsistenciaAbierta(true)} />

      <div className="relative mx-auto flex min-h-full w-full max-w-[1920px] flex-col px-4 pb-8 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between gap-4 border-b border-cyan-900/10 bg-[#edf7f8]/85 py-3 backdrop-blur-md sm:py-4">
          <Header />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SoundToggleButton soundEnabled={soundEnabled} onToggle={toggleSound} />
            <MenuButton onClick={() => setMenuAbierto(true)} />
          </div>
        </header>

        <section className="pt-4 sm:pt-5" aria-labelledby="classroom-students-title">
          <div className="mb-2 flex items-end justify-between gap-4 sm:mb-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Grupo activo</p>
              <h2 id="classroom-students-title" className="mt-1 text-2xl font-black tracking-tight text-[#173d70] sm:text-3xl">Guardianes del aula</h2>
            </div>
            <p className="rounded-full border border-cyan-200/80 bg-white/70 px-3 py-1.5 text-sm font-black text-cyan-800 shadow-sm">
              {alumnos.length} {alumnos.length === 1 ? "alumno" : "alumnos"}
            </p>
          </div>

          <div className="-m-[calc(.5rem*var(--guardian-scale-mobile))] flex flex-wrap justify-center sm:-m-[calc(.75rem*var(--guardian-scale))] lg:-m-[calc(1rem*var(--guardian-scale))]" style={guardianScaleStyle}>
            {alumnos.map((alumno, index) => (
              <div key={alumno.id} className={`w-1/2 min-w-[calc(9rem*var(--guardian-scale-mobile))] p-[calc(.5rem*var(--guardian-scale-mobile))] sm:w-1/3 sm:min-w-[calc(12rem*var(--guardian-scale))] sm:p-[calc(.75rem*var(--guardian-scale))] lg:w-1/4 lg:min-w-[calc(14rem*var(--guardian-scale))] lg:p-[calc(1rem*var(--guardian-scale))] ${
                isOverviewScale
                  ? "2xl:w-1/8 2xl:min-w-[calc(11rem*var(--guardian-scale))]"
                  : "2xl:w-1/6 2xl:min-w-[calc(15rem*var(--guardian-scale))]"
              }`}>
                <StudentCard
                  alumno={alumno}
                  onClick={() => setSeleccionado(alumno)}
                  loadGuardianEagerly={index === 0}
                  guardianScale={guardianScale}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <SideMenu
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        onGestionarAlumnos={() => setGestorAlumnosAbierto(true)}
        guardianScale={guardianScale}
        onGuardianScaleChange={setGuardianScale}
        onGuardianScaleReset={resetGuardianScale}
      />

      <StudentManager
        abierto={gestorAlumnosAbierto}
        alumnos={alumnos}
        onCerrar={() => setGestorAlumnosAbierto(false)}
        onGuardarAlumno={guardarAlumno}
        onEliminarAlumno={eliminarAlumno}
      />

      {asistenciaAbierta && (
        <AttendancePanel
          key={classroomId}
          classroomId={classroomId}
          students={alumnos}
          onClose={() => setAsistenciaAbierta(false)}
        />
      )}

      {seleccionado && (
        <StudentModal
          alumno={seleccionado}
          movements={movements}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={setSoundEnabled}
          onCerrar={() => setSeleccionado(null)}
          onAccion={ejecutarAccion}
          onStudentUpdated={guardarAlumno}
        />
      )}
    </main>
  );
}
