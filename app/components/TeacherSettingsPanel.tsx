"use client";

import { useEffect, useRef } from "react";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";

type Props = {
  open: boolean;
  state: CurriculumAssistantState | null;
  storageStatus: string;
  isHydrated: boolean;
  isSaving: boolean;
  message: string;
  onClose: () => void;
  onTrackingChange: (enabled: boolean) => void;
  onOpenAssistant: () => void;
};

export default function TeacherSettingsPanel({
  open,
  state,
  storageStatus,
  isHydrated,
  isSaving,
  message,
  onClose,
  onTrackingChange,
  onOpenAssistant,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const hasBlockingStorage = storageStatus !== "empty" && storageStatus !== "valid";
  const preparedSubjects = state?.catalog.pack?.subjects.length ?? 0;
  const activeSubjects = state?.profile?.selectedSubjectIds.length ?? 0;

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        keepFocusInsideDialog(event, dialogRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-settings-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[#edf7f8] shadow-2xl sm:rounded-[36px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-cyan-900/10 px-5 py-5 sm:px-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-cyan-700">Docente</p>
            <h2 ref={titleRef} tabIndex={-1} id="teacher-settings-title" className="mt-1 text-3xl font-black text-[#173d70] outline-none sm:text-4xl">
              Configuración
            </h2>
          </div>
          <button type="button" onClick={onClose} className="min-h-12 rounded-full bg-white px-5 font-black text-[#173d70] shadow-sm focus-visible:outline-4 focus-visible:outline-cyan-400">
            Cerrar
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-8">
          {message && (
            <p role="alert" className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 font-bold text-rose-900">
              {message}
            </p>
          )}
          <section aria-labelledby="curriculum-setting-title" className="rounded-3xl border border-cyan-900/15 bg-white/80 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <h3 id="curriculum-setting-title" className="text-2xl font-black text-[#173d70]">
                  Activar asignaturas y seguimiento curricular
                </h3>
                <p className="mt-2 text-base font-semibold leading-relaxed text-slate-600">
                  Prepara solo las asignaturas que necesites. Desactivarlo oculta sus pestañas, pero conserva toda la configuración.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state?.trackingEnabled ?? false}
                aria-label="Activar asignaturas y seguimiento curricular"
                disabled={!isHydrated || isSaving || hasBlockingStorage}
                onClick={() => onTrackingChange(!(state?.trackingEnabled ?? false))}
                className="flex min-h-14 min-w-36 shrink-0 items-center justify-center gap-3 rounded-full border-2 border-[#173d70]/20 bg-slate-100 px-4 font-black text-[#173d70] transition aria-checked:border-cyan-700 aria-checked:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400"
              >
                <span aria-hidden="true" className={`h-7 w-12 rounded-full p-1 transition ${state?.trackingEnabled ? "bg-cyan-700" : "bg-slate-400"}`}>
                  <span className={`block h-5 w-5 rounded-full bg-white transition ${state?.trackingEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </span>
                {state?.trackingEnabled ? "Activado" : "Desactivado"}
              </button>
            </div>

            {state && (
              <p className="mt-5 rounded-2xl bg-cyan-50 px-4 py-3 font-bold text-cyan-900">
                {preparedSubjects} {preparedSubjects === 1 ? "asignatura preparada" : "asignaturas preparadas"} · {activeSubjects} {activeSubjects === 1 ? "activa" : "activas"}
              </p>
            )}
            <button
              type="button"
              onClick={onOpenAssistant}
              disabled={!isHydrated || isSaving || hasBlockingStorage}
              className="mt-5 min-h-14 w-full rounded-2xl bg-[#173d70] px-5 py-3 text-xl font-black text-white shadow-lg transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400"
            >
              {state ? "Abrir el asistente curricular" : "Preparar asignaturas"}
            </button>
            {hasBlockingStorage && (
              <p className="mt-4 font-bold text-rose-800">
                El estado guardado necesita revisión. No se sobrescribirá desde esta pantalla.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function keepFocusInsideDialog(event: KeyboardEvent, dialog: HTMLElement) {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  )].filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || !active || !focusable.includes(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
