"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import Header from "./components/Header";
import AttendancePanel from "./components/AttendancePanel";
import ClassroomContextNavigation from "./components/ClassroomContextNavigation";
import MenuButton from "./components/MenuButton";
import RandomStudentSelector, {
  type RandomStudentSelectionAnimation,
} from "./components/RandomStudentSelector";
import SideMenu from "./components/SideMenu";
import StudentCard from "./components/StudentCard";
import StudentModal from "./components/StudentModal";
import StudentManager from "./components/StudentManager";
import SoundToggleButton from "./components/SoundToggleButton";

import { useStudents } from "./hooks/useStudents";
import { useMovements } from "./hooks/useMovements";
import { useAttendance } from "./hooks/useAttendance";
import { useRandomStudentSelector } from "./hooks/useRandomStudentSelector";
import { useSoundPreference } from "./hooks/useSoundPreference";
import { useClassroomGuardianScale } from "./hooks/useClassroomGuardianScale";
import { createLegacyApplyStudentAction } from "./services/legacyApplyStudentAction";
import { preloadActionSounds } from "./services/actionSoundService";
import { getLocalDateKey, getUserTimeZone } from "./services/attendanceDateService";
import { resolveClassroomId } from "./services/classroomIdentityService";
import {
  canApplyStudentActionToday,
  executeStudentActionIfPresent,
} from "./services/studentActionAttendanceGuard";
import {
  createRandomSelectionActionCompletionGuard,
  getRandomSelectionModeForAccess,
  resolveRandomSelectionActionFlow,
  selectRandomStudentId,
  shouldStartNextRandomSelection,
} from "./services/randomStudentSelectorService";
import type { ActionType } from "./types/action";
import type {
  RandomSelectionActionFlow,
  RandomStudentSelectionMode,
  StudentModalOrigin,
} from "./types/randomStudentSelector";

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
  const [attendanceTimeZone] = useState(getUserTimeZone);
  const [attendanceLocalDate, setAttendanceLocalDate] = useState(() =>
    getLocalDateKey(new Date(), attendanceTimeZone)
  );
  const attendance = useAttendance(
    classroomId,
    attendanceLocalDate,
    attendanceTimeZone
  );
  const validStudentIds = useMemo(() => alumnos.map((student) => student.id), [alumnos]);
  const presentStudentIds = useMemo(
    () => attendance.isHydrated
      ? alumnos
          .filter((student) => canApplyStudentActionToday(attendance.day, student.id))
          .map((student) => student.id)
      : [],
    [alumnos, attendance.day, attendance.isHydrated]
  );
  const randomSelector = useRandomStudentSelector(
    classroomId,
    validStudentIds,
    presentStudentIds
  );
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
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [selectorMessage, setSelectorMessage] = useState("");
  const [selectionAnimation, setSelectionAnimation] =
    useState<RandomStudentSelectionAnimation | null>(null);
  const selectionAnimationIdRef = useRef(0);
  const modalOriginRef = useRef<StudentModalOrigin>("classroom");
  const postActionFlowRef = useRef<RandomSelectionActionFlow | null>(null);
  const actionCompletionGuardRef = useRef(
    createRandomSelectionActionCompletionGuard()
  );
  const continuousRunningRef = useRef(randomSelector.isContinuousRunning);
  const beginRandomSelectionRef = useRef<(
    mode: RandomStudentSelectionMode
  ) => void>(() => undefined);

  useEffect(() => {
    preloadActionSounds();
  }, []);

  useEffect(() => {
    continuousRunningRef.current = randomSelector.isContinuousRunning;
  }, [randomSelector.isContinuousRunning]);

  useEffect(() => {
    const refreshDate = () => {
      setAttendanceLocalDate(getLocalDateKey(new Date(), attendanceTimeZone));
    };
    const refreshInterval = window.setInterval(refreshDate, 60_000);

    return () => window.clearInterval(refreshInterval);
  }, [attendanceTimeZone]);

  const applyStudentAction = createLegacyApplyStudentAction({
    modificarCristales,
    registrarMovimiento,
  });

  async function ejecutarAccion(actionId: ActionType) {
    if (!seleccionado || !attendance.isHydrated) return false;

    try {
      const guardedResult = await executeStudentActionIfPresent(
        attendance.day,
        seleccionado.id,
        () => applyStudentAction.execute({
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
        })
      );

      const committed = guardedResult.status === "executed"
        && guardedResult.value.status === "committed";
      postActionFlowRef.current = resolveRandomSelectionActionFlow(
        modalOriginRef.current,
        committed,
        continuousRunningRef.current
      );
      return committed;
    } catch {
      return false;
    }
  }

  function beginRandomSelection(
    mode: RandomStudentSelectionMode,
    completedStudentId?: string
  ) {
    setSelectorMessage("");

    if (!attendance.isHydrated || !randomSelector.isHydrated) {
      setSelectorMessage("El selector todavía está preparando la asistencia del aula.");
      setSelectorAbierto(true);
      return;
    }

    const candidateStudentIds = mode === "continuous"
      ? randomSelector.availableStudentIds.filter(
          (studentId) => studentId !== completedStudentId
        )
      : presentStudentIds;

    if (candidateStudentIds.length === 0) {
      if (mode === "continuous") {
        continuousRunningRef.current = false;
        randomSelector.stopContinuousRound();
      }
      setSelectorMessage(
        presentStudentIds.length === 0
          ? "No hay alumnado presente disponible para seleccionar."
          : "Ronda terminada: todo el alumnado presente ha participado."
      );
      setSelectorAbierto(true);
      return;
    }

    const targetStudentId = selectRandomStudentId(candidateStudentIds);
    if (!targetStudentId) {
      setSelectorMessage("No se ha podido realizar la selección. Inténtalo de nuevo.");
      setSelectorAbierto(true);
      return;
    }

    randomSelector.selectMode(mode);
    continuousRunningRef.current = mode === "continuous";
    selectionAnimationIdRef.current += 1;
    setSelectorAbierto(false);
    setSelectionAnimation({
      id: selectionAnimationIdRef.current,
      mode,
      candidateStudentIds,
      targetStudentId,
    });
  }

  useEffect(() => {
    beginRandomSelectionRef.current = beginRandomSelection;
  });

  function completeRandomSelection(animation: RandomStudentSelectionAnimation) {
    setSelectionAnimation(null);
    const student = alumnos.find((candidate) => candidate.id === animation.targetStudentId);
    const remainsPresent = presentStudentIds.includes(animation.targetStudentId);

    if (!student || !remainsPresent) {
      setSelectorMessage("La asistencia ha cambiado. Se realizará otra selección.");
      if (animation.mode === "continuous" && continuousRunningRef.current) {
        beginRandomSelection("continuous");
      } else {
        setSelectorAbierto(true);
      }
      return;
    }

    modalOriginRef.current = animation.mode;
    postActionFlowRef.current = null;
    actionCompletionGuardRef.current.reset();
    setSeleccionado(student);
  }

  function stopRandomRound() {
    const wasAnimating = selectionAnimation?.mode === "continuous";
    continuousRunningRef.current = false;
    randomSelector.stopContinuousRound();
    setSelectionAnimation(null);
    setSelectorMessage("Ronda detenida. Puedes continuarla o reiniciarla cuando quieras.");
    if (wasAnimating) setSelectorAbierto(true);
  }

  function resetRandomRound() {
    continuousRunningRef.current = false;
    randomSelector.resetContinuousRound();
    setSelectionAnimation(null);
    setSelectorMessage("Ronda reiniciada. Todo el alumnado presente vuelve a estar disponible.");
  }

  function openStudentFromClassroom(student: typeof alumnos[number]) {
    modalOriginRef.current = "classroom";
    postActionFlowRef.current = null;
    actionCompletionGuardRef.current.reset();
    setSeleccionado(student);
  }

  function closeStudentModal() {
    const origin = modalOriginRef.current;
    postActionFlowRef.current = null;
    modalOriginRef.current = "classroom";
    setSeleccionado(null);

    if (origin === "continuous") {
      continuousRunningRef.current = false;
      randomSelector.stopContinuousRound();
      setSelectorMessage("Ronda pausada. Puedes continuarla cuando quieras.");
    }
  }

  function handleActionAppliedSuccessfully() {
    if (!seleccionado) return;

    const origin = modalOriginRef.current;
    const completedStudentId = seleccionado.id;
    const expectedFlow = postActionFlowRef.current
      ?? resolveRandomSelectionActionFlow(
        origin,
        true,
        continuousRunningRef.current
      );
    const completedFlow = actionCompletionGuardRef.current.complete(expectedFlow);
    if (completedFlow === "ignored") return;

    const remainingStudentCount = origin === "continuous"
      ? randomSelector.availableStudentIds.filter(
          (studentId) => studentId !== completedStudentId
        ).length
      : 0;

    if (origin === "continuous") {
      randomSelector.recordSelection(completedStudentId);
    }

    postActionFlowRef.current = null;
    modalOriginRef.current = "classroom";
    setSeleccionado(null);

    if (
      continuousRunningRef.current
      && shouldStartNextRandomSelection(completedFlow, remainingStudentCount)
    ) {
      beginRandomSelection("continuous", completedStudentId);
    } else if (origin === "continuous" && remainingStudentCount === 0) {
      continuousRunningRef.current = false;
      randomSelector.stopContinuousRound();
      setSelectorMessage("Ronda terminada: todo el alumnado presente ha participado.");
      setSelectorAbierto(true);
    }
  }

  const selectedStudentIsAbsent = seleccionado
    ? !canApplyStudentActionToday(attendance.day, seleccionado.id)
    : false;

  useEffect(() => {
    if (
      !seleccionado
      || modalOriginRef.current === "classroom"
      || !attendance.isHydrated
      || !selectedStudentIsAbsent
    ) {
      return;
    }

    const shouldContinue = modalOriginRef.current === "continuous"
      && continuousRunningRef.current;
    modalOriginRef.current = "classroom";
    postActionFlowRef.current = null;
    setSeleccionado(null);
    setSelectorMessage("El alumno seleccionado figura ahora como ausente.");
    if (shouldContinue) beginRandomSelectionRef.current("continuous");
  }, [attendance.isHydrated, seleccionado, selectedStudentIsAbsent, setSeleccionado]);

  return (
    <main className="h-dvh overflow-y-auto bg-[#e8f3f6] text-slate-950">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#f7edcf_0%,#eaf6f7_42%,#c6e8ef_100%)]" />
        <div className="absolute -left-36 -top-36 h-[32rem] w-[32rem] rounded-full bg-amber-100/65 blur-3xl" />
        <div className="absolute -bottom-52 -right-32 h-[38rem] w-[38rem] rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.9)_0_1px,transparent_1.5px)] [background-size:42px_42px]" />
      </div>

      <ClassroomContextNavigation
        onOpenAttendance={() => setAsistenciaAbierta(true)}
        onStartRandomSingle={() => beginRandomSelection(
          getRandomSelectionModeForAccess("random")
        )}
        onStartRandomRound={() => beginRandomSelection(
          getRandomSelectionModeForAccess("round")
        )}
      />

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
                  onClick={() => openStudentFromClassroom(alumno)}
                  loadGuardianEagerly={index === 0}
                  guardianScale={guardianScale}
                  isAbsent={!canApplyStudentActionToday(attendance.day, alumno.id)}
                  disabled={!attendance.isHydrated}
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
          key={`${classroomId}:${attendanceLocalDate}`}
          students={alumnos}
          localDate={attendanceLocalDate}
          attendance={attendance}
          onClose={() => setAsistenciaAbierta(false)}
        />
      )}

      <RandomStudentSelector
        noticeOpen={selectorAbierto}
        students={alumnos}
        presentStudentIds={presentStudentIds}
        availableStudentIds={randomSelector.availableStudentIds}
        state={randomSelector.state}
        isHydrated={attendance.isHydrated && randomSelector.isHydrated}
        isContinuousRunning={randomSelector.isContinuousRunning}
        message={selectorMessage}
        animation={selectionAnimation}
        onCloseNotice={() => setSelectorAbierto(false)}
        onContinueContinuous={() => beginRandomSelection("continuous")}
        onStopContinuous={stopRandomRound}
        onResetContinuous={resetRandomRound}
        onAnimationComplete={completeRandomSelection}
      />

      {seleccionado && (
        <StudentModal
          alumno={seleccionado}
          movements={movements}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={setSoundEnabled}
          actionsDisabled={!attendance.isHydrated || selectedStudentIsAbsent}
          studentIsAbsent={selectedStudentIsAbsent}
          onCerrar={closeStudentModal}
          onAccion={ejecutarAccion}
          onActionAppliedSuccessfully={handleActionAppliedSuccessfully}
          onStudentUpdated={guardarAlumno}
        />
      )}
    </main>
  );
}
