"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAttendance } from "../hooks/useAttendance";
import {
  formatAttendanceDate,
  formatAttendanceTime,
  getLocalDateKey,
  getLocalTimeInputValue,
  getUserTimeZone,
  localTimeToInstant,
} from "../services/attendanceDateService";
import {
  getAttendanceSummary,
  getStudentAttendance,
} from "../services/attendanceService";
import type { ResolvedStudentAttendance } from "../types/attendance";
import type { Student } from "../types/student";

type Props = {
  classroomId: string;
  students: readonly Student[];
  onClose: () => void;
};

export default function AttendancePanel({ classroomId, students, onClose }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [timeZone] = useState(getUserTimeZone);
  const [localDate, setLocalDate] = useState(() => getLocalDateKey(new Date(), timeZone));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [arrivalDrafts, setArrivalDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const activeStudents = useMemo(
    () => students.filter((student) => student.activo),
    [students]
  );
  const {
    day,
    isHydrated,
    markAbsent,
    markArrived,
    correctToPresent,
    correctArrival,
  } = useAttendance(classroomId, localDate, timeZone);
  const studentIds = useMemo(
    () => activeStudents.map((student) => student.id),
    [activeStudents]
  );
  const summary = getAttendanceSummary(day, studentIds);

  useEffect(() => {
    titleRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const dateRefresh = window.setInterval(() => {
      setLocalDate((current) => {
        const next = getLocalDateKey(new Date(), timeZone);
        if (next !== current) {
          setSelectedIds(new Set());
          setArrivalDrafts({});
          setError("");
        }
        return next;
      });
    }, 60_000);

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearInterval(dateRefresh);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, timeZone]);

  const toggleSelected = (studentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const activeStudentIds = new Set(studentIds);
  const selectedStudentIds = [...selectedIds].filter((studentId) =>
    activeStudentIds.has(studentId)
  );
  const selectedCount = selectedStudentIds.length;
  const applyToSelection = (operation: (studentIds: readonly string[]) => void) => {
    if (!isHydrated || selectedStudentIds.length === 0) return;
    setError("");
    operation(selectedStudentIds);
    setSelectedIds(new Set());
  };

  const saveArrivalCorrection = (studentId: string, currentArrivalAt: string) => {
    try {
      setError("");
      const localTime = arrivalDrafts[studentId] ?? getLocalTimeInputValue(currentArrivalAt);
      correctArrival(studentId, localTimeToInstant(localDate, localTime));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo corregir la hora.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="attendance-title" className="mx-auto min-h-full w-full max-w-7xl rounded-[28px] border border-white/50 bg-[#e8f4f5] shadow-2xl sm:min-h-0 sm:rounded-[38px]">
        <header className="sticky top-0 z-20 flex flex-wrap items-start justify-between gap-4 rounded-t-[28px] border-b border-cyan-900/10 bg-[#edf8f9]/95 px-5 py-4 backdrop-blur sm:rounded-t-[38px] sm:px-8 sm:py-6">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-cyan-700">Registro diario</p>
            <h2 ref={titleRef} id="attendance-title" tabIndex={-1} className="mt-1 text-3xl font-black text-[#173d70] outline-none sm:text-4xl">Asistencia</h2>
            <p className="mt-1 text-base font-bold capitalize text-[#316386] sm:text-lg">{formatAttendanceDate(localDate)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar asistencia" className="rounded-full border border-[#173d70]/20 bg-white px-4 py-2 text-lg font-black text-[#173d70] shadow-sm transition hover:bg-cyan-50 focus-visible:outline-4 focus-visible:outline-cyan-400">Cerrar</button>
        </header>

        <div className="space-y-5 px-4 py-5 sm:px-8 sm:py-7">
          <div aria-live="polite" className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
            <SummaryCard icon="✓" label="Presentes" value={summary.present} tone="emerald" />
            <SummaryCard icon="✕" label="Ausentes" value={summary.absent} tone="rose" />
            <SummaryCard icon="◷" label="Retrasos" value={summary.late} tone="amber" />
          </div>

          <section aria-label="Acciones para la selección" className="sticky top-[106px] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-900/10 bg-white/95 p-3 shadow-md backdrop-blur sm:top-[132px] sm:gap-3 sm:p-4">
            <p className="mr-auto min-w-full font-black text-[#173d70] sm:min-w-0">
              {selectedCount} {selectedCount === 1 ? "alumno seleccionado" : "alumnos seleccionados"}
            </p>
            <button type="button" disabled={!isHydrated || selectedCount === 0} onClick={() => applyToSelection(markAbsent)} className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-rose-300">Marcar ausente</button>
            <button type="button" disabled={!isHydrated || selectedCount === 0} onClick={() => applyToSelection(correctToPresent)} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-emerald-300">Marcar presente</button>
            <button type="button" disabled={selectedCount === 0} onClick={() => setSelectedIds(new Set())} className="min-h-11 rounded-xl border border-cyan-900/20 bg-white px-4 py-2 font-black text-[#173d70] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-cyan-400">Limpiar selección</button>
          </section>

          <p aria-live="assertive" className="min-h-5 text-sm font-bold text-rose-700">{error}</p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeStudents.map((student) => {
              const attendance = getStudentAttendance(day, student.id);
              return (
                <StudentAttendanceCard
                  key={student.id}
                  student={student}
                  attendance={attendance}
                  selected={selectedIds.has(student.id)}
                  disabled={!isHydrated}
                  arrivalDraft={arrivalDrafts[student.id]}
                  onToggleSelected={() => toggleSelected(student.id)}
                  onArrived={() => { setError(""); markArrived(student.id); }}
                  onCorrectPresent={() => { setError(""); correctToPresent([student.id]); }}
                  onArrivalDraftChange={(value) => setArrivalDrafts((current) => ({ ...current, [student.id]: value }))}
                  onSaveArrival={(arrivalAt) => saveArrivalCorrection(student.id, arrivalAt)}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function StudentAttendanceCard({
  student,
  attendance,
  selected,
  disabled,
  arrivalDraft,
  onToggleSelected,
  onArrived,
  onCorrectPresent,
  onArrivalDraftChange,
  onSaveArrival,
}: {
  student: Student;
  attendance: ResolvedStudentAttendance;
  selected: boolean;
  disabled: boolean;
  arrivalDraft?: string;
  onToggleSelected: () => void;
  onArrived: () => void;
  onCorrectPresent: () => void;
  onArrivalDraftChange: (value: string) => void;
  onSaveArrival: (arrivalAt: string) => void;
}) {
  const isAbsent = attendance.currentStatus === "absent";
  const isLate = attendance.dailyResult === "late";
  const status = isAbsent
    ? { icon: "✕", label: "Ausente", className: "bg-rose-100 text-rose-800" }
    : isLate
      ? { icon: "◷", label: "Retraso", className: "bg-amber-100 text-amber-900" }
      : { icon: "✓", label: "Presente", className: "bg-emerald-100 text-emerald-800" };

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm transition ${selected ? "border-cyan-600 ring-4 ring-cyan-100" : "border-cyan-900/10"}`}>
      <div className="flex items-start gap-3">
        <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-cyan-50">
          <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggleSelected} aria-label={`Seleccionar a ${student.nombre} ${student.apellidos}`} className="h-5 w-5 accent-cyan-700 focus-visible:outline-4 focus-visible:outline-cyan-400" />
        </label>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-black text-[#173d70]">{student.nombre}</h3>
          <p className="truncate text-sm font-semibold text-[#54718a]">{student.apellidos}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-black ${status.className}`}>
          <span aria-hidden="true">{status.icon}</span>{status.label}
        </span>
      </div>

      {isLate && attendance.arrivalAt && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-amber-950">
          <p className="font-black">Llegada: {formatAttendanceTime(attendance.arrivalAt)}</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-sm font-bold">Corregir hora
              <input type="time" value={arrivalDraft ?? getLocalTimeInputValue(attendance.arrivalAt)} disabled={disabled} onChange={(event) => onArrivalDraftChange(event.target.value)} className="mt-1 block min-h-11 rounded-lg border border-amber-400 bg-white px-3 font-bold focus-visible:outline-4 focus-visible:outline-amber-300" />
            </label>
            <button type="button" disabled={disabled} onClick={() => onSaveArrival(attendance.arrivalAt!)} className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 font-black text-white focus-visible:outline-4 focus-visible:outline-amber-300">Guardar hora</button>
          </div>
        </div>
      )}

      {(isAbsent || isLate) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isAbsent && <button type="button" disabled={disabled} onClick={onArrived} className="min-h-11 flex-1 rounded-xl bg-cyan-700 px-3 py-2 font-black text-white focus-visible:outline-4 focus-visible:outline-cyan-300">Ha llegado ahora</button>}
          <button type="button" disabled={disabled} onClick={onCorrectPresent} className="min-h-11 flex-1 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-2 font-black text-emerald-800 focus-visible:outline-4 focus-visible:outline-emerald-300">Marcar presente</button>
        </div>
      )}
    </article>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: "emerald" | "rose" | "amber" }) {
  const styles = {
    emerald: "bg-emerald-100 text-emerald-900",
    rose: "bg-rose-100 text-rose-900",
    amber: "bg-amber-100 text-amber-950",
  };

  return <div className={`rounded-2xl px-3 py-3 text-center sm:px-5 ${styles[tone]}`}><p className="text-sm font-black"><span aria-hidden="true">{icon}</span> {label}</p><p className="text-2xl font-black sm:text-3xl">{value}</p></div>;
}
