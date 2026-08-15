"use client";

import { useEffect, useRef, useState } from "react";
import { actionIconCategories, actionIcons, getActionIcon } from "../data/actionIcons";
import {
  archiveConfiguredAction,
  createConfiguredAction,
  saveConfiguredAction,
} from "../services/actionCatalogConfigurationService";
import type { Action, QuickActionSlot } from "../types/action";
import { GENERAL_SUBJECT_ID } from "../types/subject";
import ActionIcon from "./ActionIcon";

type Props = {
  action?: Action;
  catalog: readonly Action[];
  onSaved: (catalog: Action[]) => void;
  onCancel: () => void;
  onDirtyChange: (isDirty: boolean) => void;
};

const locations: readonly { value: QuickActionSlot | null; label: string }[] = [
  { value: null, label: "Más acciones" },
  { value: 1, label: "Posición rápida 1" },
  { value: 2, label: "Posición rápida 2" },
  { value: 3, label: "Posición rápida 3" },
  { value: 4, label: "Posición rápida 4" },
  { value: 5, label: "Posición rápida 5" },
  { value: 6, label: "Posición rápida 6" },
];

export default function ActionEditor({ action, catalog, onSaved, onCancel, onDirtyChange }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [title, setTitle] = useState(action?.title ?? "");
  const [kind, setKind] = useState<"positive" | "negative">(action && action.points < 0 ? "negative" : "positive");
  const [amount, setAmount] = useState(String(Math.abs(action?.points ?? 1)));
  const [quickSlot, setQuickSlot] = useState<QuickActionSlot | null>(action?.quickSlot ?? null);
  const [iconId, setIconId] = useState(action?.iconId ?? "other-sparkles");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const selectedIcon = getActionIcon(iconId);
  const parsedAmount = Number(amount);
  const points = kind === "positive" ? parsedAmount : -parsedAmount;
  const validationError = getValidationError(title, parsedAmount);
  const slotOccupant = quickSlot === null
    ? undefined
    : catalog.find((item) => item.id !== action?.id && !item.archived && item.quickSlot === quickSlot);
  const [initialSnapshot] = useState(() => serializeDraft({
    title: action?.title ?? "",
    kind: action && action.points < 0 ? "negative" : "positive",
    amount: String(Math.abs(action?.points ?? 1)),
    quickSlot: action?.quickSlot ?? null,
    iconId: action?.iconId ?? "other-sparkles",
  }));
  const isDirty = initialSnapshot !== serializeDraft({ title, kind, amount, quickSlot, iconId });

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const canSave = !validationError && !isSaving;

  const save = () => {
    if (!canSave) {
      setError(validationError ?? "No se pudo guardar la acción.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const nextCatalog = action
        ? saveConfiguredAction(action.id, {
            title,
            points,
            iconId,
            quickSlot,
            archived: false,
            subjectId: action.subjectId ?? GENERAL_SUBJECT_ID,
            availableInAllSubjects: action.availableInAllSubjects ?? false,
            trackOrdinaryCompliance: action.points < 0
              ? action.trackOrdinaryCompliance ?? false
              : false,
          })
        : createConfiguredAction({ id: crypto.randomUUID(), title, points, iconId, quickSlot });

      onDirtyChange(false);
      onSaved(nextCatalog);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar la acción.");
      setIsSaving(false);
    }
  };

  const archive = () => {
    if (!action || isSaving) return;

    setError("");
    setIsSaving(true);
    try {
      onDirtyChange(false);
      onSaved(archiveConfiguredAction(action.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo archivar la acción.");
      setIsSaving(false);
    }
  };

  const requestCancel = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onCancel();
    }
  };

  return (
    <section aria-labelledby="action-editor-title" className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h3 ref={titleRef} id="action-editor-title" tabIndex={-1} className="text-2xl font-bold text-[#173d70] outline-none sm:text-3xl">
          {action ? "Editar acción" : "Nueva acción"}
        </h3>
        <button type="button" onClick={requestCancel} disabled={isSaving} className="rounded-full bg-white px-4 py-2 font-bold text-[#173d70] shadow-sm disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">Cancelar</button>
      </div>

      <p aria-live="assertive" className="text-sm font-semibold text-rose-700">{error || validationError}</p>
      <p aria-live="polite" className="sr-only">{isSaving ? "Guardando acción." : ""}</p>

      <ActionPreview iconId={iconId} icon={action?.icon} title={title || "Nombre de la acción"} points={Number.isFinite(points) ? points : 0} />

      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <div>
          <button type="button" onClick={() => setIconPickerOpen((open) => !open)} aria-label="Elegir icono de la acción" className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-[#316386]/25 bg-white shadow-sm focus-visible:outline-4 focus-visible:outline-cyan-400">
            <ActionIcon iconId={iconId} icon={action?.icon} />
          </button>
          <p className="mt-2 text-center text-sm font-bold text-[#316386]">{selectedIcon?.label ?? "Icono"}</p>
        </div>
        <label className="block text-lg font-bold text-[#173d70]">Nombre
          <input value={title} onChange={(event) => setTitle(event.target.value)} required disabled={isSaving} className="mt-2 w-full rounded-xl border border-[#316386]/30 bg-white px-4 py-3 text-lg font-semibold outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-200 disabled:opacity-60" />
        </label>
      </div>

      {iconPickerOpen && <IconPicker selectedIconId={iconId} onSelect={(nextIconId) => { setIconId(nextIconId); setIconPickerOpen(false); }} />}

      <fieldset className="grid gap-4 rounded-2xl bg-white/60 p-4 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold text-[#173d70]">Valor</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de acción">
          {(["positive", "negative"] as const).map((option) => <button key={option} type="button" disabled={isSaving} onClick={() => setKind(option)} aria-pressed={kind === option} className={`rounded-xl px-4 py-3 font-bold disabled:opacity-60 focus-visible:outline-4 focus-visible:outline-cyan-400 ${kind === option ? "bg-[#173d70] text-white" : "bg-white text-[#173d70]"}`}>{option === "positive" ? "Positiva" : "Negativa"}</button>)}
        </div>
        <label className="text-lg font-bold text-[#173d70]">Magnitud
          <input type="number" min="1" max="99" step="1" inputMode="numeric" value={amount} disabled={isSaving} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-[#316386]/30 bg-white px-4 py-3 text-lg font-semibold outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-200 disabled:opacity-60" />
        </label>
      </fieldset>

      <label className="block text-lg font-bold text-[#173d70]">Ubicación
        <select value={quickSlot ?? "additional"} disabled={isSaving} onChange={(event) => setQuickSlot(event.target.value === "additional" ? null : Number(event.target.value) as QuickActionSlot)} className="mt-2 w-full rounded-xl border border-[#316386]/30 bg-white px-4 py-3 text-lg font-semibold outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-200 disabled:opacity-60">
          {locations.map((location) => <option key={location.value ?? "additional"} value={location.value ?? "additional"}>{location.label}</option>)}
        </select>
      </label>

      <QuickSlotPreview selectedSlot={quickSlot} />
      {slotOccupant && <p className="rounded-xl bg-amber-100 px-4 py-3 font-semibold text-amber-900">Al guardar, {slotOccupant.title} pasará a Más acciones.</p>}

      {action && <button type="button" disabled={isSaving} onClick={() => setConfirmArchive(true)} className="rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 font-bold text-amber-800 disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">Archivar</button>}

      {confirmArchive && <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-[#704b08]">
        <p className="font-bold">¿Archivar esta acción? Dejará de estar disponible para aplicar puntos, pero conservará su historial.</p>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={archive} disabled={isSaving} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">Sí, archivar</button><button type="button" onClick={() => setConfirmArchive(false)} disabled={isSaving} className="rounded-xl bg-white px-4 py-2 font-bold text-[#704b08] disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">Cancelar</button></div>
      </div>}

      {confirmDiscard && <div className="rounded-2xl border border-[#316386]/25 bg-white p-4 text-[#173d70]"><p className="font-bold">Hay cambios sin guardar. ¿Quieres descartarlos?</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => { onDirtyChange(false); onCancel(); }} className="rounded-xl bg-[#173d70] px-4 py-2 font-bold text-white focus-visible:outline-4 focus-visible:outline-cyan-400">Descartar cambios</button><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400">Seguir editando</button></div></div>}

      <button type="button" onClick={save} disabled={!canSave} className="w-full rounded-2xl bg-[#173d70] px-5 py-4 text-xl font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">{isSaving ? "Guardando…" : "Guardar cambios"}</button>
    </section>
  );
}

function IconPicker({ selectedIconId, onSelect }: { selectedIconId: string; onSelect: (iconId: string) => void }) {
  return <div aria-label="Catálogo de iconos" className="rounded-2xl border border-[#316386]/20 bg-white/75 p-4"><div className="space-y-4">{Object.entries(actionIconCategories).map(([category, label]) => <section key={category} aria-labelledby={`icon-category-${category}`}><h4 id={`icon-category-${category}`} className="mb-2 text-sm font-bold uppercase tracking-wide text-[#316386]">{label}</h4><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{actionIcons.filter((icon) => icon.category === category).map((icon) => <button key={icon.iconId} type="button" onClick={() => onSelect(icon.iconId)} aria-label={`Elegir icono ${icon.label}`} aria-pressed={icon.iconId === selectedIconId} className="flex min-h-16 flex-col items-center justify-center rounded-xl border border-[#316386]/15 bg-[#f6fcfd] p-2 text-2xl aria-pressed:border-cyan-600 aria-pressed:bg-cyan-100 focus-visible:outline-4 focus-visible:outline-cyan-400"><span aria-hidden="true">{icon.glyph}</span><span className="sr-only">{icon.label}</span></button>)}</div></section>)}</div></div>;
}

function ActionPreview({ iconId, icon, title, points }: { iconId: string; icon?: string; title: string; points: number }) {
  const positive = points >= 0;
  const formattedPoints = positive ? `+${points}` : String(points);
  return <div aria-label="Vista previa de la acción" className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 ${positive ? "border-emerald-300 bg-emerald-100 text-emerald-950" : "border-rose-300 bg-rose-100 text-rose-950"}`}><span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70"><ActionIcon iconId={iconId} icon={icon} /></span><span><span className="block text-sm font-bold uppercase tracking-wide">Vista previa</span><span className="block text-xl font-bold">{title}</span><span className="font-semibold">{formattedPoints} cristales · {positive ? "Positiva" : "Negativa"}</span></span></div>;
}

function QuickSlotPreview({ selectedSlot }: { selectedSlot: QuickActionSlot | null }) {
  return <div aria-label="Vista previa de posiciones rápidas" className="grid grid-cols-3 gap-2 rounded-2xl border border-dashed border-[#316386]/35 bg-white/50 p-4 text-center text-sm font-bold text-[#316386]">{([1, 2, 3, 4, 5, 6] as const).map((slot) => <span key={slot} className={`rounded-lg px-2 py-3 ${slot === selectedSlot ? "bg-cyan-600 text-white" : "bg-white"}`}>Posición {slot}</span>)}{selectedSlot === null && <span className="col-span-3 rounded-lg bg-[#173d70] px-2 py-3 text-white">Más acciones</span>}</div>;
}

function getValidationError(title: string, amount: number): string | null {
  if (!title.trim()) return "El nombre es obligatorio.";
  if (!Number.isInteger(amount) || amount < 1 || amount > 99) return "La magnitud debe ser un número entero entre 1 y 99.";
  return null;
}

function serializeDraft(value: object): string {
  return JSON.stringify(value);
}
