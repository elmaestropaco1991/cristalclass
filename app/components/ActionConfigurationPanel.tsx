"use client";

import { useEffect, useState } from "react";
import { restoreConfiguredAction } from "../services/actionCatalogConfigurationService";
import { getAdditionalActions, getArchivedActions, getQuickActions } from "../services/actionCatalogService";
import type { Action, QuickActionSlot } from "../types/action";
import ActionEditor from "./ActionEditor";
import ActionIcon from "./ActionIcon";

type Props = {
  catalog: readonly Action[];
  onCatalogChange: (catalog: Action[]) => void;
  onDirtyChange: (isDirty: boolean) => void;
};

export default function ActionConfigurationPanel({ catalog, onCatalogChange, onDirtyChange }: Props) {
  const [editingAction, setEditingAction] = useState<Action | undefined>();
  const [creating, setCreating] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [error, setError] = useState("");
  const quickActions = getQuickActions(catalog);
  const additionalActions = getAdditionalActions(catalog);
  const archivedActions = getArchivedActions(catalog);

  useEffect(() => {
    onDirtyChange(editorDirty);
    return () => onDirtyChange(false);
  }, [editorDirty, onDirtyChange]);

  const closeEditor = () => {
    setEditorDirty(false);
    setCreating(false);
    setEditingAction(undefined);
  };

  if (creating || editingAction) {
    return <ActionEditor action={editingAction} catalog={catalog} onDirtyChange={setEditorDirty} onSaved={(nextCatalog) => { onCatalogChange(nextCatalog); closeEditor(); }} onCancel={closeEditor} />;
  }

  const restore = (action: Action) => {
    try {
      setError("");
      onCatalogChange(restoreConfiguredAction(action.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo restaurar la acción.");
    }
  };

  return (
    <section aria-label="Configuración de acciones" className="space-y-7">
      <p aria-live="assertive" className="text-sm font-semibold text-rose-700">{error}</p>

      <button type="button" onClick={() => setCreating(true)} className="w-full rounded-2xl bg-[#173d70] px-5 py-4 text-xl font-bold text-white shadow-lg focus-visible:outline-4 focus-visible:outline-cyan-400">Nueva acción</button>

      <section aria-labelledby="quick-summary-heading">
        <h3 id="quick-summary-heading" className="mb-3 text-xl font-bold text-[#173d70]">Resumen de acciones rápidas</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([1, 2, 3, 4, 5, 6] as const).map((slot) => {
            const action = quickActions.find((item) => item.quickSlot === slot);
            return <QuickSlotSummary key={slot} slot={slot} action={action} />;
          })}
        </div>
      </section>

      <section aria-labelledby="active-actions-heading" className="space-y-5">
        <h3 id="active-actions-heading" className="text-xl font-bold text-[#173d70]">Acciones activas</h3>
        <ActionList title="Acciones rápidas" actions={quickActions} onEdit={setEditingAction} />
        <ActionList title="Más acciones" actions={additionalActions} onEdit={setEditingAction} emptyMessage="No hay acciones adicionales." />
      </section>

      <details className="rounded-2xl border border-[#316386]/20 bg-white/55 p-4">
        <summary className="cursor-pointer text-xl font-bold text-[#173d70]">Archivadas ({archivedActions.length})</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {archivedActions.length === 0 ? <p className="font-semibold text-[#316386]">No hay acciones archivadas.</p> : archivedActions.map((action) => <div key={action.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"><span className="flex min-w-0 items-center gap-3"><ActionIcon icon={action.icon} iconId={action.iconId} /><span className="min-w-0"><span className="block truncate font-bold text-[#173d70]">{action.title}</span><PointsLabel points={action.points} /></span></span><button type="button" onClick={() => restore(action)} className="shrink-0 rounded-xl bg-cyan-600 px-3 py-2 font-bold text-white focus-visible:outline-4 focus-visible:outline-cyan-400">Restaurar</button></div>)}
        </div>
      </details>
    </section>
  );
}

function QuickSlotSummary({ slot, action }: { slot: QuickActionSlot; action?: Action }) {
  return <div className="min-h-28 rounded-2xl border border-[#316386]/20 bg-white/65 p-4"><p className="text-sm font-bold uppercase tracking-wide text-[#316386]">Posición {slot}</p>{action ? <div className="mt-2 flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50"><ActionIcon icon={action.icon} iconId={action.iconId} /></span><span className="min-w-0"><span className="block truncate font-bold text-[#173d70]">{action.title}</span><PointsLabel points={action.points} /></span></div> : <p className="mt-3 font-semibold text-[#316386]">Vacía</p>}</div>;
}

function ActionList({ title, actions, onEdit, emptyMessage }: { title: string; actions: readonly Action[]; onEdit: (action: Action) => void; emptyMessage?: string }) {
  return <section aria-label={title}><h4 className="mb-3 text-lg font-bold text-[#316386]">{title}</h4><div className="grid gap-3 sm:grid-cols-2">{actions.length === 0 ? <p className="rounded-xl bg-white/55 p-4 font-semibold text-[#316386]">{emptyMessage ?? "No hay acciones rápidas."}</p> : actions.map((action) => <ActionRow key={action.id} action={action} onEdit={() => onEdit(action)} />)}</div></section>;
}

function ActionRow({ action, onEdit }: { action: Action; onEdit: () => void }) {
  const location = action.quickSlot === null ? "Más acciones" : `Rápida · posición ${action.quickSlot}`;
  return <div className="flex min-h-24 items-center gap-3 rounded-2xl border border-[#316386]/20 bg-white p-4 shadow-sm"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-cyan-50"><ActionIcon icon={action.icon} iconId={action.iconId} /></span><span className="min-w-0 flex-1"><span className="block truncate text-lg font-bold text-[#173d70]">{action.title}</span><PointsLabel points={action.points} /><span className="block text-sm font-semibold text-[#316386]">{location}</span></span><button type="button" onClick={onEdit} className="shrink-0 rounded-xl bg-[#173d70] px-3 py-2 font-bold text-white focus-visible:outline-4 focus-visible:outline-cyan-400">Editar</button></div>;
}

function PointsLabel({ points }: { points: number }) {
  return <span className={`block font-bold ${points > 0 ? "text-emerald-700" : "text-rose-700"}`}>{points > 0 ? `+${points}` : points} cristales</span>;
}
