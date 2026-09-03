"use client";

import { useMemo, useState } from "react";
import { moveConfiguredQuickSlot } from "../services/actionCatalogConfigurationService";
import { getQuickActions } from "../services/actionCatalogService";
import { getSubjectDefinition } from "../services/subjectCatalogService";
import type { Action, QuickActionSlot } from "../types/action";
import type { SubjectId } from "../types/subject";
import ActionIcon from "./ActionIcon";

type Props = {
  activeSubjectId: SubjectId;
  operationalCatalog: readonly Action[];
  onCatalogChange: (catalog: Action[]) => void;
  onClose: () => void;
};

const slots = [1, 2, 3, 4, 5, 6] as const;

export default function QuickActionsEditor({
  activeSubjectId,
  operationalCatalog,
  onCatalogChange,
  onClose,
}: Props) {
  const [editingSlot, setEditingSlot] = useState<QuickActionSlot | null>(null);
  const [error, setError] = useState("");
  const subject = getSubjectDefinition(activeSubjectId);
  const quickActions = getQuickActions(operationalCatalog);
  const subjectCandidates = useMemo(
    () => operationalCatalog
      .filter((action) => !action.archived && action.subjectId === activeSubjectId)
      .sort((left, right) => {
        if (left.points >= 0 && right.points < 0) return -1;
        if (left.points < 0 && right.points >= 0) return 1;
        return left.title.localeCompare(right.title, "es");
      }),
    [activeSubjectId, operationalCatalog]
  );

  const chooseAction = (action: Action, slot: QuickActionSlot) => {
    try {
      setError("");
      const nextCatalog = moveConfiguredQuickSlot(action.id, slot);
      onCatalogChange(nextCatalog);
      setEditingSlot(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cambiar la acción rápida.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-actions-editor-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/55 bg-[#edf7f8] shadow-2xl sm:rounded-[40px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-cyan-900/10 bg-[#edf7f8]/95 px-5 py-5 backdrop-blur sm:px-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[.14em] text-cyan-700">{subject.name}</p>
            <h2 id="quick-actions-editor-title" className="mt-1 text-3xl font-black text-[#173d70] sm:text-4xl">
              Acciones rápidas
            </h2>
            <p className="mt-1 font-semibold text-[#316386]">Elige qué seis acciones aparecen alrededor del guardián.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#173d70]/15 bg-white px-4 py-2 font-black text-[#173d70] shadow-sm focus-visible:outline-4 focus-visible:outline-cyan-400"
          >
            Hecho
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 font-bold text-rose-800">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => {
              const action = quickActions.find((item) => item.quickSlot === slot);
              return (
                <article key={slot} className="rounded-2xl border border-[#316386]/20 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[.12em] text-[#316386]">Posición {slot}</p>
                  {action ? (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-50">
                        <ActionIcon icon={action.icon} iconId={action.iconId} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black leading-tight text-[#173d70]">{action.title}</span>
                        <span className={`mt-1 block font-black ${action.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {action.points > 0 ? `+${action.points}` : action.points} cristales
                        </span>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-4 font-semibold text-[#316386]">Posición vacía</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingSlot(slot)}
                    className="mt-4 w-full rounded-xl bg-[#173d70] px-4 py-2.5 font-black text-white shadow-sm focus-visible:outline-4 focus-visible:outline-cyan-400"
                  >
                    Cambiar
                  </button>
                </article>
              );
            })}
          </div>

          {editingSlot !== null && (
            <section className="mt-6 rounded-3xl border border-[#316386]/20 bg-white/75 p-4 sm:p-5" aria-labelledby="quick-candidates-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[.12em] text-cyan-700">Posición {editingSlot}</p>
                  <h3 id="quick-candidates-title" className="text-2xl font-black text-[#173d70]">Elige una acción</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="rounded-xl bg-slate-100 px-3 py-2 font-bold text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400"
                >
                  Cancelar
                </button>
              </div>

              {subjectCandidates.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-[#316386]/30 px-4 py-6 text-center font-semibold text-[#316386]">
                  No hay acciones configuradas para esta asignatura todavía.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {subjectCandidates.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => chooseAction(action, editingSlot)}
                      className="flex min-h-20 items-center gap-3 rounded-2xl border border-[#316386]/20 bg-white p-3 text-left shadow-sm transition active:scale-[.99] focus-visible:outline-4 focus-visible:outline-cyan-400"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50">
                        <ActionIcon icon={action.icon} iconId={action.iconId} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-[#173d70]">{action.title}</span>
                        <span className={`block text-sm font-black ${action.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {action.points > 0 ? `+${action.points}` : action.points} cristales
                        </span>
                      </span>
                      {action.quickSlot !== null && (
                        <span className="shrink-0 rounded-full bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-800">
                          Rápida {action.quickSlot}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
