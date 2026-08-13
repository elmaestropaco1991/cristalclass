"use client";

import { useEffect, useRef, useState } from "react";
import { getAdditionalActions } from "../services/actionCatalogService";
import { orderAdditionalActions } from "../services/additionalActionOrderService";
import {
  leaveAdditionalActionsMode,
  openActionConfiguration,
  type AdditionalActionsPanelMode,
} from "../services/additionalActionsPanelMode";
import type { Action, ActionType } from "../types/action";
import type { Movement } from "../types/movement";
import type { Student } from "../types/student";
import ActionConfigurationPanel from "./ActionConfigurationPanel";
import ActionIcon from "./ActionIcon";
import { studentProfileVisuals } from "./studentProfileVisuals";

type Props = {
  student: Student;
  movements: readonly Movement[];
  catalog: readonly Action[];
  isApplyingAction: boolean;
  actionError: boolean;
  onApplyAction: (actionId: ActionType) => Promise<boolean>;
  onCatalogChange: (catalog: Action[]) => void;
  onBack: () => void;
};

export default function AdditionalActionsPanel({
  student,
  movements,
  catalog,
  isApplyingAction,
  actionError,
  onApplyAction,
  onCatalogChange,
  onBack,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<AdditionalActionsPanelMode>("operational");
  const [configurationHasUnsavedChanges, setConfigurationHasUnsavedChanges] = useState(false);
  const [confirmConfigurationDiscard, setConfirmConfigurationDiscard] = useState(false);
  const additionalActions = orderAdditionalActions(getAdditionalActions(catalog), movements);
  const positiveActions = additionalActions.filter((action) => action.points > 0);
  const negativeActions = additionalActions.filter((action) => action.points < 0);

  useEffect(() => {
    titleRef.current?.focus();
  }, [mode]);

  const returnFromCurrentMode = () => {
    if (leaveAdditionalActionsMode(mode) === "operational") {
      if (configurationHasUnsavedChanges) {
        setConfirmConfigurationDiscard(true);
        return;
      }
      setMode("operational");
      return;
    }

    onBack();
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isApplyingAction) return;
      if (leaveAdditionalActionsMode(mode) === "operational") {
        if (configurationHasUnsavedChanges) {
          setConfirmConfigurationDiscard(true);
          return;
        }
        setMode("operational");
      } else {
        onBack();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [configurationHasUnsavedChanges, isApplyingAction, mode, onBack]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => {
        if (!isApplyingAction) returnFromCurrentMode();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="additional-actions-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/40 bg-[#e7f4f6] shadow-2xl sm:rounded-[40px]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sky-900/15 bg-[#e7f4f6]/95 px-5 py-5 backdrop-blur sm:px-8">
          <div>
            {mode === "operational" && <p className="text-sm font-bold uppercase tracking-[.16em] text-[#316386]">{student.nombre}</p>}
            <h2 ref={titleRef} id="additional-actions-title" tabIndex={-1} className="mt-1 text-3xl font-bold text-[#173d70] outline-none sm:text-4xl">
              {mode === "operational" ? "Más acciones" : "Configurar"}
            </h2>
            {mode === "operational" && <p className="mt-1 text-lg font-semibold text-[#316386]">Cristales: {student.cristales}</p>}
            {mode === "configuration" && <p className="mt-1 text-base font-semibold text-[#316386]">Estas acciones se usarán con toda la clase.</p>}
          </div>
          <div className="flex items-center gap-2">
            {mode === "operational" && (
              <button
                type="button"
                onClick={() => setMode(openActionConfiguration())}
                disabled={isApplyingAction}
                aria-label="Configurar"
                className="flex h-11 items-center gap-1.5 rounded-full border border-[#173d70]/20 bg-white px-3 text-base font-bold text-[#173d70] shadow-sm transition active:scale-[.98] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400"
              >
                <span aria-hidden="true" className="text-xl">⚙</span>
                Configurar
              </button>
            )}
            <button
              type="button"
              onClick={returnFromCurrentMode}
              disabled={isApplyingAction}
              aria-label={mode === "operational" ? "Volver a la ficha del alumno" : "Volver a Más acciones"}
              className="rounded-full border border-[#173d70]/20 bg-white px-4 py-2 text-base font-bold text-[#173d70] shadow-sm transition active:scale-[.98] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400"
            >
              Volver
            </button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          <p aria-live="assertive" className="sr-only">{actionError ? "No se pudo aplicar la acción." : ""}</p>
          <p aria-live="polite" className="sr-only">{isApplyingAction ? "Aplicando acción." : ""}</p>

          {mode === "configuration" ? (
            <>
              {confirmConfigurationDiscard && <div className="mb-5 rounded-2xl border border-[#316386]/25 bg-white p-4 text-[#173d70]"><p className="font-bold">Hay cambios sin guardar. ¿Quieres descartarlos y volver a Más acciones?</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => { setConfigurationHasUnsavedChanges(false); setConfirmConfigurationDiscard(false); setMode("operational"); }} className="rounded-xl bg-[#173d70] px-4 py-2 font-bold text-white focus-visible:outline-4 focus-visible:outline-cyan-400">Descartar cambios</button><button type="button" onClick={() => setConfirmConfigurationDiscard(false)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400">Seguir editando</button></div></div>}
              <ActionConfigurationPanel catalog={catalog} onCatalogChange={onCatalogChange} onDirtyChange={setConfigurationHasUnsavedChanges} />
            </>
          ) : additionalActions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#316386]/35 bg-white/60 px-6 py-10 text-center text-xl font-bold text-[#316386]">
              No hay más acciones configuradas.
            </p>
          ) : (
            <div className="space-y-7">
              <ActionSection title="Acciones positivas" actions={positiveActions} studentName={student.nombre} isApplyingAction={isApplyingAction} onApplyAction={onApplyAction} />
              <ActionSection title="Acciones negativas" actions={negativeActions} studentName={student.nombre} isApplyingAction={isApplyingAction} onApplyAction={onApplyAction} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type ActionSectionProps = {
  title: string;
  actions: readonly Action[];
  studentName: string;
  isApplyingAction: boolean;
  onApplyAction: (actionId: ActionType) => Promise<boolean>;
};

function ActionSection({ title, actions, studentName, isApplyingAction, onApplyAction }: ActionSectionProps) {
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby={`${title}-heading`}>
      <h3 id={`${title}-heading`} className="mb-3 text-xl font-bold text-[#173d70] sm:text-2xl">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => <AdditionalActionButton key={action.id} action={action} studentName={studentName} disabled={isApplyingAction} onApply={() => onApplyAction(action.id)} />)}
      </div>
    </section>
  );
}

function AdditionalActionButton({ action, studentName, disabled, onApply }: { action: Action; studentName: string; disabled: boolean; onApply: () => Promise<boolean> }) {
  const isPositive = action.points > 0;
  const formattedPoints = isPositive ? `+${action.points}` : `${action.points}`;
  const visualStyle = isPositive ? studentProfileVisuals.positiveAction : studentProfileVisuals.negativeAction;

  return (
    <button type="button" onClick={onApply} disabled={disabled} aria-label={`Aplicar ${action.title}, ${formattedPoints} cristales a ${studentName}`} className={`flex min-h-24 items-center gap-4 rounded-3xl border-2 bg-gradient-to-br px-5 py-4 text-left text-white shadow-lg transition active:scale-[.98] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-400 ${visualStyle}`}>
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/75 bg-white/25 shadow-[inset_0_2px_5px_rgba(255,255,255,.55)]"><ActionIcon icon={action.icon} iconId={action.iconId} /></span>
      <span className="min-w-0 flex-1"><span className="block text-xl font-bold leading-tight sm:text-2xl">{action.title}</span><span className="mt-1 block text-base font-semibold text-white/90">{formattedPoints} cristales</span></span>
    </button>
  );
}
