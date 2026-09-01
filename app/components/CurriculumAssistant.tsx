"use client";

import { useEffect, useRef, useState } from "react";
import type { Action } from "../types/action";
import type {
  CurriculumAssistantState,
  CurriculumSubjectPreparationInspection,
} from "../types/curriculumAssistant";
import type {
  BasicKnowledge,
  Criterion,
  CurriculumCatalogCommand,
  CurriculumSubject,
  SpecificCompetence,
} from "../types/curriculum";
import {
  addPendingBasicKnowledge,
  applyCurriculumAssistantCatalogCommand,
  archiveCurriculumSubject,
  classifyCurriculumAssistantImportRepeat,
  confirmCurriculumAssistantImport,
  createCurriculumAssistantEntityId,
  createCurriculumAssistantOperationId,
  createLegacyCurriculumAssistantState,
  createManualCurriculumAssistantState,
  getEffectiveSubject,
  getEligibleActionsForCurriculumSubject,
  inspectCurriculumSubject,
  previewCurriculumAssistantImport,
  restoreCurriculumSubject,
  retireCurriculumEntity,
  setBasicKnowledgeAction,
  setBasicKnowledgeCriteria,
  setCurriculumAssistantStep,
  setCurriculumSubjectActivation,
  type CurriculumActionCatalogContext,
  type CurriculumAssistantChangeResult,
  updatePendingBasicKnowledge,
} from "../services/curriculumAssistantService";
import {
  DEFAULT_CURRICULUM_PACK_JSON_LIMITS,
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonLegacyResult,
  type CurriculumPackJsonValidResult,
} from "../services/curriculumPackJsonService";
import type { CurriculumPackImportPreview } from "../services/curriculumPackImportService";
import {
  ANDALUSIAN_PRIMARY_CURRICULUM_COURSES,
  getAndalusianPrimaryCurriculumPack,
  type AndalusianPrimaryCurriculumCourse,
} from "../services/andalusianPrimaryCurriculumService";
import { applyAndalusianLanguageCurriculumDefaults } from "../services/andalusianLanguageCurriculumDefaultsService";
import { getOrderedSubjectCatalog } from "../services/subjectCatalogService";
import ActionIcon from "./ActionIcon";

type Props = {
  open: boolean;
  classroomId: string;
  state: CurriculumAssistantState | null;
  actions: readonly Action[];
  isSaving: boolean;
  storageMessage: string;
  hasPendingSave: boolean;
  canRetryPendingSave: boolean;
  onClose: () => void;
  onCommit: (state: CurriculumAssistantState) => Promise<boolean>;
  onRetryPendingSave: () => Promise<boolean>;
};

type PendingConfirmation = {
  readonly title: string;
  readonly messages: readonly string[];
  readonly confirmLabel: string;
  readonly confirm: () => Promise<void>;
};

type ImportAnalysis =
  | { readonly kind: "valid"; readonly parsed: CurriculumPackJsonValidResult; readonly preview: CurriculumPackImportPreview }
  | { readonly kind: "legacy"; readonly parsed: CurriculumPackJsonLegacyResult; readonly serializedJson: string }
  | { readonly kind: "error"; readonly message: string };

export default function CurriculumAssistant({
  open,
  classroomId,
  state,
  actions,
  isSaving,
  storageMessage,
  hasPendingSave,
  canRetryPendingSave,
  onClose,
  onCommit,
  onRetryPendingSave,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const saveInFlightRef = useRef(false);
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string | null>(null);
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null);
  const [localMessage, setLocalMessage] = useState("");
  const [localMessageIsError, setLocalMessageIsError] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const actionCatalog: CurriculumActionCatalogContext = actions;
  const step = state?.wizardStep ?? 1;

  const requestClose = () => {
    if (!saveInFlightRef.current && !isSaving) onClose();
  };

  const showConfirmation = (confirmation: PendingConfirmation) => {
    confirmationReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setPendingConfirmation(confirmation);
  };

  const closeConfirmation = () => {
    setPendingConfirmation(null);
    const returnTarget = confirmationReturnFocusRef.current;
    confirmationReturnFocusRef.current = null;
    requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else titleRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingConfirmation && !isSaving && !saveInFlightRef.current) onClose();
      if (event.key === "Tab" && dialogRef.current) {
        keepFocusInsideAssistant(event, dialogRef.current);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSaving, onClose, open, pendingConfirmation]);

  if (!open) return null;

  const availableSubjects = state?.catalog.pack?.subjects.filter(
    (subject) => !state.archivedSubjectIds.includes(subject.id)
  ) ?? [];
  const effectiveSelectedSubjectId = selectedSubjectId
    && availableSubjects.some((subject) => subject.id === selectedSubjectId)
    ? selectedSubjectId
    : availableSubjects[0]?.id ?? null;

  const save = async (nextState: CurriculumAssistantState) => {
    if (saveInFlightRef.current) {
      setLocalMessage("Espera a que termine el guardado anterior.");
      setLocalMessageIsError(true);
      return false;
    }
    saveInFlightRef.current = true;
    try {
      const saved = await onCommit(nextState);
      if (saved) {
        setLocalMessage("Guardado");
        setLocalMessageIsError(false);
      }
      return saved;
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const runChange = async (
    change: (confirmDeactivation: boolean, occurredAt: string) => CurriculumAssistantChangeResult
  ): Promise<boolean> => {
    const occurredAt = new Date().toISOString();
    const first = change(false, occurredAt);
    if (first.status === "applied") {
      return save(first.state);
    }
    if (first.status === "requires-deactivation") {
      showConfirmation({
        title: "La asignatura dejará de estar activa",
        messages: first.messages,
        confirmLabel: "Desactivar y continuar",
        confirm: async () => {
          const confirmed = change(true, occurredAt);
          if (confirmed.status === "applied") {
            const saved = await save(confirmed.state);
            if (saved) closeConfirmation();
          } else {
            setLocalMessage(messagesFromChange(confirmed).join(" "));
            setLocalMessageIsError(true);
          }
        },
      });
      return false;
    }
    setLocalMessage([...first.messages, ...(first.dependencies ?? [])].join(" "));
    setLocalMessageIsError(true);
    return false;
  };

  const goToStep = async (nextStep: 1 | 2 | 3) => {
    setEditingSubjectId(null);
    setSelectedKnowledgeId(null);
    if (!state) return;
    await save(setCurriculumAssistantStep(state, nextStep, new Date().toISOString()));
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 p-0 backdrop-blur-sm sm:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="curriculum-assistant-title" aria-busy={isSaving} className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden bg-[#edf7f8] shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-[36px] sm:border sm:border-white/60">
        <header className="shrink-0 border-b border-cyan-900/10 bg-[#edf7f8]/95 px-4 py-4 backdrop-blur sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">Configuración docente</p>
              <h2 ref={titleRef} tabIndex={-1} id="curriculum-assistant-title" className="mt-1 text-2xl font-black tracking-tight text-[#173d70] outline-none sm:text-4xl">
                Asistente curricular
              </h2>
            </div>
            <button type="button" onClick={requestClose} disabled={isSaving} className="min-h-12 rounded-full bg-white px-4 font-black text-[#173d70] shadow-sm disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">
              Cerrar
            </button>
          </div>
          <Progress step={step} />
          {(storageMessage || localMessage) && (
            <p role={storageMessage || localMessageIsError ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-2 text-sm font-bold ${storageMessage || localMessageIsError ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"}`}>
              {storageMessage || localMessage}
            </p>
          )}
          {hasPendingSave && (
            <button type="button" disabled={isSaving || !canRetryPendingSave} onClick={async () => { const saved = await onRetryPendingSave(); if (saved) { setLocalMessage("Guardado"); setLocalMessageIsError(false); } }} className="mt-3 min-h-12 rounded-xl bg-[#173d70] px-4 font-black text-white disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">
              Reintentar guardado
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
          {pendingConfirmation && (
            <ConfirmationPanel confirmation={pendingConfirmation} isSaving={isSaving} onCancel={closeConfirmation} />
          )}
          <fieldset disabled={isSaving || Boolean(pendingConfirmation) || (hasPendingSave && !canRetryPendingSave)} className="contents">
          {step === 1 && (
            <StartStep
              classroomId={classroomId}
              state={state}
              actionCatalog={actions}
              analysis={importAnalysis}
              isSaving={isSaving}
              onAnalysis={setImportAnalysis}
              onMessage={(message, isError = true) => { setLocalMessage(message); setLocalMessageIsError(Boolean(message) && isError); }}
              onClose={requestClose}
              onCommit={save}
              onContinue={() => goToStep(state?.wizardStep === 3 ? 3 : 2)}
            />
          )}
          {step === 2 && state && (
            editingSubjectId ? (
              <SubjectEditor
                state={state}
                subjectId={editingSubjectId}
                knownActionIds={actionCatalog}
                onBack={() => setEditingSubjectId(null)}
                runChange={runChange}
              />
            ) : (
              <SubjectsStep
                state={state}
                knownActionIds={actionCatalog}
                onOpenSubject={setEditingSubjectId}
                onBack={() => goToStep(1)}
                onContinue={() => goToStep(3)}
                runChange={runChange}
              />
            )
          )}
          {step === 3 && state && (
            <RelationsStep
              state={state}
              actions={actions}
              knownActionIds={actionCatalog}
              selectedSubjectId={effectiveSelectedSubjectId}
              selectedKnowledgeId={selectedKnowledgeId}
              onSelectSubject={(id) => { setSelectedSubjectId(id); setSelectedKnowledgeId(null); }}
              onSelectKnowledge={setSelectedKnowledgeId}
              onBack={() => goToStep(2)}
              onCommit={save}
              runChange={runChange}
              onConfirmation={(confirmation) => confirmation ? showConfirmation(confirmation) : closeConfirmation()}
              onMessage={(message) => { setLocalMessage(message); setLocalMessageIsError(Boolean(message)); }}
            />
          )}
          </fieldset>
        </div>
      </section>
    </div>
  );
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Cómo quieres empezar", "Prepara tus asignaturas", "Relaciona y activa"];
  return (
    <ol aria-label="Progreso del asistente" className="mt-4 grid grid-cols-3 gap-2">
      {labels.map((label, index) => {
        const number = index + 1;
        const current = number === step;
        const completed = number < step;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className={`rounded-xl border px-2 py-2 text-center text-xs font-black sm:px-4 sm:text-base ${current ? "border-cyan-700 bg-cyan-100 text-[#173d70]" : completed ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white/60 text-slate-500"}`}>
            <span aria-hidden="true">{completed ? "✓" : number}</span>
            <span className="ml-1 hidden sm:inline">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StartStep({
  classroomId,
  state,
  actionCatalog,
  analysis,
  isSaving,
  onAnalysis,
  onMessage,
  onClose,
  onCommit,
  onContinue,
}: {
  classroomId: string;
  state: CurriculumAssistantState | null;
  actionCatalog: readonly Action[];
  analysis: ImportAnalysis | null;
  isSaving: boolean;
  onAnalysis: (analysis: ImportAnalysis | null) => void;
  onMessage: (message: string, isError?: boolean) => void;
  onClose: () => void;
  onCommit: (state: CurriculumAssistantState) => Promise<boolean>;
  onContinue: () => void;
}) {
  const [officialCourse, setOfficialCourse] = useState<AndalusianPrimaryCurriculumCourse | "">("");
  const prepared = state?.catalog.pack?.subjects.filter(
    (subject) => !state.archivedSubjectIds.includes(subject.id)
  ).length ?? state?.legacyImport?.subjectCount ?? 0;
  const pending = state?.catalog.pack?.subjects.filter((subject) =>
    !state.archivedSubjectIds.includes(subject.id)
    && !state.profile?.selectedSubjectIds.includes(subject.id)
  ).length ?? state?.legacyImport?.subjectCount ?? 0;

  const analyzeFile = async (file: File | undefined) => {
    onAnalysis(null);
    onMessage("", false);
    if (!file) return;
    if (file.size === 0) {
      onAnalysis({ kind: "error", message: "El archivo está vacío." });
      return;
    }
    if (file.size > DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxJsonTextLength) {
      onAnalysis({ kind: "error", message: "El archivo supera el tamaño máximo permitido." });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      onAnalysis({ kind: "error", message: "El archivo debe tener extensión .json." });
      return;
    }
    if (file.type
      && file.type !== "application/json"
      && file.type !== "text/json"
      && file.type !== "application/octet-stream"
      && file.type !== "text/plain") {
      onAnalysis({ kind: "error", message: "Selecciona un archivo JSON curricular." });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      onAnalysis({ kind: "error", message: "No se pudo leer el archivo seleccionado." });
      return;
    }
    const parsed = parseCurriculumPackJson(text);
    if (parsed.status === "valid") {
      const preview = previewCurriculumAssistantImport(classroomId, parsed);
      onAnalysis(preview.canApply
        ? { kind: "valid", parsed, preview }
        : { kind: "error", message: "El archivo necesita resolver bloqueos antes de importarlo." });
    } else if (parsed.status === "legacy-incomplete") {
      onAnalysis({ kind: "legacy", parsed, serializedJson: text });
    } else {
      onAnalysis({ kind: "error", message: importErrorMessage(parsed.status) });
    }
  };

  const confirmImport = async () => {
    if (!analysis || analysis.kind === "error") return;
    const occurredAt = new Date().toISOString();
    try {
      const next = analysis.kind === "valid"
        ? confirmCurriculumAssistantImport(classroomId, analysis.preview, occurredAt)
        : createLegacyCurriculumAssistantState(
            classroomId,
            analysis.parsed,
            analysis.serializedJson,
            occurredAt
          );
      if (state) {
        if (classifyCurriculumAssistantImportRepeat(state, next) === "idempotent") {
          onMessage("Este archivo ya está incorporado. El borrador actual se conserva sin cambios.", false);
        } else {
          onMessage("El archivo es distinto del origen del borrador actual. No se ha sobrescrito nada.");
        }
        return;
      }
      await onCommit(next);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo confirmar la importación.");
    }
  };

  const loadOfficialPrimaryPack = async () => {
    if (officialCourse === "") return;
    onAnalysis(null);
    onMessage("", false);
    const occurredAt = new Date().toISOString();
    try {
      const pack = getAndalusianPrimaryCurriculumPack(officialCourse);
      const parsed = parseCurriculumPackJson(
        serializeCurriculumPackToJson(pack, occurredAt, { exporterVersion: "cristalclass-bundled-v1" })
      );
      if (parsed.status !== "valid") {
        throw new Error("El catálogo oficial incluido no ha superado su verificación interna.");
      }
      const preview = previewCurriculumAssistantImport(classroomId, parsed);
      if (!preview.canApply) {
        throw new Error("El catálogo oficial necesita resolver un bloqueo antes de incorporarse.");
      }
      const imported = confirmCurriculumAssistantImport(classroomId, preview, occurredAt);
      if (state) {
        if (classifyCurriculumAssistantImportRepeat(state, imported) === "idempotent") {
          onMessage("Este currículo completo ya está incorporado. El borrador actual se conserva.", false);
        } else {
          onMessage("Ya existe otro borrador. No se ha sobrescrito con el catálogo oficial.", true);
        }
        return;
      }
      const next = applyAndalusianLanguageCurriculumDefaults(
        imported,
        officialCourse,
        actionCatalog,
        occurredAt
      );
      const committed = await onCommit(next);
      if (!committed) {
        onMessage("El catálogo sigue preparado, pero no se pudo confirmar su guardado.", true);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo cargar el catálogo oficial.", true);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h3 className="text-3xl font-black text-[#173d70]">¿Cómo quieres empezar?</h3>
      <p className="mt-2 text-lg font-semibold text-slate-600">
        Prepara solamente las asignaturas que quieras utilizar. Puedes terminar las demás más adelante.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {state && (
          <OptionCard icon="↻" title="Continuar configuración" primary onClick={onContinue}>
            <p>{prepared} preparadas · {pending} pendientes</p>
            <p className="mt-1 text-sm">Último cambio: {formatInformativeDate(state.updatedAt)}</p>
          </OptionCard>
        )}
        <section className="rounded-3xl border-2 border-cyan-700 bg-cyan-50 p-5 shadow-sm">
          <div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl">🏛️</span><h4 className="text-2xl font-black text-[#173d70]">Andalucía · Primaria oficial</h4></div>
          <p className="mt-2 font-semibold text-slate-600">Incluye todas las áreas oficiales aplicables al curso, con sus competencias, criterios, saberes y relaciones. Las propuestas revisadas de Lengua quedan activas.</p>
          <label className="mt-4 block text-lg font-black text-[#173d70]">Curso
            <select value={officialCourse} disabled={isSaving || state !== null} onChange={(event) => setOfficialCourse(event.target.value === "" ? "" : Number(event.target.value) as AndalusianPrimaryCurriculumCourse)} className="mt-2 w-full rounded-xl border border-cyan-800/30 bg-white px-4 py-3 text-lg font-bold outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-200 disabled:opacity-55">
              <option value="">Selecciona el curso</option>
              {ANDALUSIAN_PRIMARY_CURRICULUM_COURSES.map((course) => <option key={course} value={course}>{course}.º de Primaria</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void loadOfficialPrimaryPack()} disabled={officialCourse === "" || isSaving || state !== null} className="mt-4 min-h-12 w-full rounded-xl bg-[#173d70] px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-cyan-400">
            Preparar currículo completo
          </button>
          <p className="mt-3 text-sm font-semibold text-cyan-900">Fuente verificada: Orden de 30 de mayo de 2023 · BOJA 104 · CVE 00284747.</p>
        </section>
        <section className="rounded-3xl border border-cyan-900/15 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl">⇧</span><h4 className="text-2xl font-black text-[#173d70]">Importar un archivo curricular</h4></div>
          <p className="mt-2 font-semibold text-slate-600">Se analizará antes de guardar. Nada cambia hasta que confirmes.</p>
          <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cyan-700 bg-cyan-50 px-4 text-lg font-black text-[#173d70] focus-within:outline-4 focus-within:outline-cyan-400">
            Seleccionar JSON
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void analyzeFile(file); }} />
          </label>
          {analysis && <ImportPreview analysis={analysis} />}
          {analysis && analysis.kind !== "error" && (
            <button type="button" onClick={confirmImport} disabled={isSaving} className="mt-4 min-h-12 w-full rounded-xl bg-[#173d70] px-4 font-black text-white disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-400">
              {state ? "Comprobar contra el borrador" : analysis.kind === "legacy" ? "Guardar como pendiente de revisión" : "Confirmar nuevo borrador"}
            </button>
          )}
        </section>
        <OptionCard
          icon="＋"
          title="Empezar manualmente"
          onClick={async () => {
            if (state) { onContinue(); return; }
            await onCommit(createManualCurriculumAssistantState(classroomId, new Date().toISOString()));
          }}
        >
          Crea un borrador vacío y añade solo lo que vayas a usar.
        </OptionCard>
        <OptionCard icon="×" title="Ahora no" onClick={onClose}>
          Cierra el asistente sin activar asignaturas. Tu borrador, si existe, se conserva.
        </OptionCard>
      </div>
    </div>
  );
}

function ImportPreview({ analysis }: { analysis: ImportAnalysis }) {
  if (analysis.kind === "error") return <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 font-bold text-rose-900">{analysis.message}</p>;
  if (analysis.kind === "legacy") {
    return (
      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
        <p className="font-black">Archivo antiguo: necesita revisión</p>
        <p className="mt-1 font-semibold">{analysis.parsed.pack.subjects.length} asignaturas · {analysis.parsed.pack.subjects.reduce((total, subject) => total + subject.criteria.length, 0)} criterios · {analysis.parsed.pack.subjects.reduce((total, subject) => total + subject.basicKnowledge.length, 0)} saberes</p>
        <p className="mt-1 text-sm font-semibold">No se crearán competencias ni relaciones automáticamente.</p>
      </div>
    );
  }
  const { counts } = analysis.preview;
  return (
    <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950">
      <p className="font-black">Archivo válido y listo para confirmar</p>
      <p className="mt-1 font-semibold">{counts.subjects} asignaturas · {counts.specificCompetences} competencias · {counts.criteria} criterios · {counts.basicKnowledge} saberes</p>
      {analysis.preview.warnings.length > 0 && <p className="mt-1 text-sm font-bold">{analysis.preview.warnings.length} avisos para revisar.</p>}
    </div>
  );
}

function OptionCard({ icon, title, children, onClick, primary = false }: { icon: string; title: string; children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-48 rounded-3xl border p-5 text-left shadow-sm transition active:scale-[.99] focus-visible:outline-4 focus-visible:outline-cyan-400 ${primary ? "border-cyan-700 bg-cyan-100" : "border-cyan-900/15 bg-white/80"}`}>
      <span aria-hidden="true" className="text-4xl">{icon}</span>
      <span className="mt-3 block text-2xl font-black text-[#173d70]">{title}</span>
      <span className="mt-2 block font-semibold leading-relaxed text-slate-600">{children}</span>
    </button>
  );
}

function SubjectsStep({ state, knownActionIds, onOpenSubject, onBack, onContinue, runChange }: {
  state: CurriculumAssistantState;
  knownActionIds: CurriculumActionCatalogContext;
  onOpenSubject: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
  runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [actionSubjectId, setActionSubjectId] = useState("");
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const pack = state.catalog.pack;
  if (state.legacyImport) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <h3 className="text-3xl font-black">Este archivo necesita revisión</h3>
        <p className="mt-3 text-lg font-semibold">El catálogo antiguo se ha conservado sin cambios. No se han inventado competencias ni asignaciones de criterios.</p>
        <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 font-bold">{state.legacyImport.subjectCount} asignaturas · {state.legacyImport.criterionCount} criterios · {state.legacyImport.basicKnowledgeCount} saberes</p>
        <button type="button" onClick={onBack} className="mt-5 min-h-12 rounded-xl bg-[#173d70] px-5 font-black text-white focus-visible:outline-4 focus-visible:outline-cyan-400">Volver</button>
      </div>
    );
  }
  if (!pack) return null;
  const visible = pack.subjects.filter((subject) => !state.archivedSubjectIds.includes(subject.id));
  const archived = pack.subjects.filter((subject) => state.archivedSubjectIds.includes(subject.id));

  const addSubject = async () => {
    if (!name.trim()) return;
    const id = actionSubjectId || createCurriculumAssistantEntityId(state, "subject");
    const saved = await runChange((confirm, occurredAt) => applyCurriculumAssistantCatalogCommand(state, {
      type: "add-subject",
      operationId: createCurriculumAssistantOperationId(state, "add-subject", id),
      expectedVersion: state.catalog.revision,
      occurredAt,
      packId: pack.id,
      subject: { id, name: name.trim(), ...(code.trim() ? { externalCode: code.trim() } : {}) },
    }, knownActionIds, confirm));
    if (saved) {
      setName(""); setCode(""); setActionSubjectId(""); setAdding(false);
    }
  };

  const moveSubject = (subjectId: string, direction: -1 | 1) => {
    const visibleIds = visible.map((subject) => subject.id);
    const index = visibleIds.indexOf(subjectId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= visibleIds.length) return;
    [visibleIds[index], visibleIds[target]] = [visibleIds[target], visibleIds[index]];
    let visibleIndex = 0;
    const ids = pack.subjects.map((subject) => state.archivedSubjectIds.includes(subject.id)
      ? subject.id
      : visibleIds[visibleIndex++]);
    void runChange((confirm, occurredAt) => applyCurriculumAssistantCatalogCommand(state, {
      type: "reorder-subjects",
      operationId: createCurriculumAssistantOperationId(state, "reorder-subjects", subjectId),
      expectedVersion: state.catalog.revision,
      occurredAt,
      packId: pack.id,
      subjectIds: ids,
    }, knownActionIds, confirm));
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="text-3xl font-black text-[#173d70]">Prepara tus asignaturas</h3><p className="mt-2 font-semibold text-slate-600">Abre una asignatura y completa solo lo necesario. Los cambios se guardan al confirmarlos.</p></div>
        <button type="button" onClick={() => setAdding(true)} className="min-h-14 rounded-2xl bg-cyan-600 px-5 text-lg font-black text-slate-950 shadow-md focus-visible:outline-4 focus-visible:outline-cyan-400">＋ Añadir asignatura</button>
      </div>
      {adding && (
        <div className="mt-5 grid gap-3 rounded-2xl border border-cyan-300 bg-white p-4 lg:grid-cols-[1fr_12rem_16rem_auto]">
          <Field label="Nombre"><input autoFocus value={name} maxLength={300} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field>
          <Field label="Código opcional"><input value={code} maxLength={120} onChange={(event) => setCode(event.target.value)} className={inputClass} /></Field>
          <Field label="Acciones propias opcionales"><select value={actionSubjectId} onChange={(event) => setActionSubjectId(event.target.value)} className={inputClass}><option value="">Solo acciones globales</option>{getOrderedSubjectCatalog().filter((option) => option.contextKind === "academic" && !pack.subjects.some((subject) => subject.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Field>
          <div className="flex items-end gap-2"><button type="button" onClick={addSubject} disabled={!name.trim()} className={primarySmall}>Añadir</button><button type="button" onClick={() => setAdding(false)} className={secondarySmall}>Cancelar</button></div>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="mt-6 rounded-3xl border-2 border-dashed border-cyan-900/20 bg-white/60 px-6 py-12 text-center"><p className="text-2xl font-black text-[#173d70]">Todavía no hay asignaturas</p><p className="mt-2 font-semibold text-slate-600">Añade la primera cuando quieras empezar.</p></div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {visible.map((subject) => {
            const inspection = inspectCurriculumSubject(state, subject.id, knownActionIds);
            const visibleIndex = visible.findIndex((item) => item.id === subject.id);
            return (
              <article key={subject.id} className="rounded-3xl border border-cyan-900/15 bg-white/85 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><h4 className="text-2xl font-black text-[#173d70]">{subject.name}</h4>{subject.externalCode && <p className="mt-1 font-bold text-slate-500">{subject.externalCode}</p>}</div><StatusBadge inspection={inspection} /></div>
                <p className="mt-4 font-semibold text-slate-600">{inspection.counts.specificCompetences} competencias · {inspection.counts.criteria} criterios · {inspection.counts.basicKnowledge} saberes</p>
                {inspection.blockingMessages[0] && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">{inspection.blockingMessages[0]}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpenSubject(subject.id)} className={primarySmall}>Abrir asignatura</button>
                  <button type="button" aria-label={`Subir ${subject.name}`} disabled={visibleIndex === 0} onClick={() => moveSubject(subject.id, -1)} className={secondarySmall}>↑</button>
                  <button type="button" aria-label={`Bajar ${subject.name}`} disabled={visibleIndex === visible.length - 1} onClick={() => moveSubject(subject.id, 1)} className={secondarySmall}>↓</button>
                  <button type="button" onClick={() => setArchiveId(subject.id)} className="min-h-11 rounded-xl border border-amber-400 bg-amber-50 px-3 font-black text-amber-900 focus-visible:outline-4 focus-visible:outline-cyan-400">Retirar</button>
                </div>
                {archiveId === subject.id && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-amber-950"><p className="font-bold">Se conservarán el catálogo y sus relaciones.</p><div className="mt-3 flex gap-2"><button type="button" onClick={async () => { const saved = await runChange((confirm, occurredAt) => archiveCurriculumSubject(state, subject.id, occurredAt, confirm)); if (saved) setArchiveId(null); }} className={primarySmall}>Confirmar retirada</button><button type="button" onClick={() => setArchiveId(null)} className={secondarySmall}>Cancelar</button></div></div>}
              </article>
            );
          })}
        </div>
      )}
      {archived.length > 0 && <details className="mt-6 rounded-2xl border border-cyan-900/15 bg-white/70 p-4"><summary className="cursor-pointer text-lg font-black text-[#173d70]">Retiradas de la preparación ({archived.length})</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{archived.map((subject) => <div key={subject.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"><span className="font-bold text-[#173d70]">{subject.name}</span><button type="button" onClick={() => void runChange((_confirm, occurredAt) => ({ status: "applied", state: restoreCurriculumSubject(state, subject.id, occurredAt) }))} className={secondarySmall}>Recuperar</button></div>)}</div></details>}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={onBack} className={secondaryLarge}>Volver</button><button type="button" onClick={onContinue} disabled={visible.length === 0} className={primaryLarge}>Continuar: relaciona y activa</button></div>
    </div>
  );
}

function SubjectEditor({ state, subjectId, knownActionIds, onBack, runChange }: {
  state: CurriculumAssistantState;
  subjectId: string;
  knownActionIds: CurriculumActionCatalogContext;
  onBack: () => void;
  runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean>;
}) {
  const subject = state.catalog.pack?.subjects.find((item) => item.id === subjectId);
  const [subjectName, setSubjectName] = useState(subject?.name ?? "");
  const [subjectCode, setSubjectCode] = useState(subject?.externalCode ?? "");
  const [competenceText, setCompetenceText] = useState("");
  const [competenceCode, setCompetenceCode] = useState("");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeCode, setKnowledgeCode] = useState("");
  const pack = state.catalog.pack;
  if (!subject || !pack) return <p>La asignatura ya no está disponible.</p>;
  const effective = getEffectiveSubject(state, subjectId)!;
  const competences = effective.specificCompetences ?? [];
  const pendingKnowledge = state.pendingBasicKnowledge.filter((item) =>
    item.subjectId === subjectId && !state.retiredBasicKnowledgeIds.includes(item.id)
  );

  const applyCommand = (command: CurriculumCatalogCommand) =>
    runChange((confirm) => applyCurriculumAssistantCatalogCommand(
      state,
      command,
      knownActionIds,
      confirm
    ));
  const move = (kind: "competence" | "criterion" | "knowledge", id: string, direction: -1 | 1) => {
    const source = kind === "competence"
      ? [...(subject.specificCompetences ?? [])]
      : kind === "criterion" ? [...subject.criteria] : [...subject.basicKnowledge];
    const index = source.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= source.length) return;
    [source[index], source[target]] = [source[target], source[index]];
    const occurredAt = new Date().toISOString();
    const base = {
      operationId: createCurriculumAssistantOperationId(state, `reorder-${kind}`, id),
      expectedVersion: state.catalog.revision,
      occurredAt,
      packId: pack.id,
      subjectId,
    };
    const command: CurriculumCatalogCommand = kind === "competence"
      ? { ...base, type: "reorder-specific-competences", specificCompetenceIds: source.map((item) => item.id) }
      : kind === "criterion"
        ? { ...base, type: "reorder-criteria", criterionIds: source.map((item) => item.id) }
        : { ...base, type: "reorder-basic-knowledge", basicKnowledgeIds: source.map((item) => item.id) };
    void applyCommand(command);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={onBack} className={secondarySmall}>← Volver a asignaturas</button>
      <h3 className="mt-4 text-3xl font-black text-[#173d70]">{subject.name}</h3>
      <p className="mt-2 font-semibold text-slate-600">Completa el contenido en este orden. Puedes volver sin perder cambios confirmados.</p>

      <EditorSection number="1" title="Nombre y código">
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem_auto]">
          <Field label="Nombre"><input value={subjectName} maxLength={300} onChange={(event) => setSubjectName(event.target.value)} className={inputClass} /></Field>
          <Field label="Código opcional"><input value={subjectCode} maxLength={120} onChange={(event) => setSubjectCode(event.target.value)} className={inputClass} /></Field>
          <div className="flex items-end"><button type="button" disabled={!subjectName.trim()} onClick={() => void applyCommand({ type: "update-subject", operationId: createCurriculumAssistantOperationId(state, "update-subject", subject.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId, name: subjectName, externalCode: subjectCode || null })} className={primarySmall}>Guardar</button></div>
        </div>
      </EditorSection>

      <EditorSection number="2" title="Competencias específicas">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto]"><Field label="Código opcional"><input value={competenceCode} maxLength={120} onChange={(event) => setCompetenceCode(event.target.value)} className={inputClass} /></Field><Field label="Texto"><textarea value={competenceText} maxLength={12000} rows={2} onChange={(event) => setCompetenceText(event.target.value)} className={inputClass} /></Field><div className="flex items-end"><button type="button" disabled={!competenceText.trim()} onClick={async () => { const id = createCurriculumAssistantEntityId(state, "competence", subjectId); const saved = await applyCommand({ type: "add-specific-competence", operationId: createCurriculumAssistantOperationId(state, "add-competence", id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId, specificCompetence: { id, text: competenceText, ...(competenceCode.trim() ? { externalCode: competenceCode.trim() } : {}) } }); if (saved) { setCompetenceText(""); setCompetenceCode(""); } }} className={primarySmall}>Añadir</button></div></div>
        <div className="mt-4 space-y-4">
          {competences.length === 0 && <EmptyText>Esta asignatura todavía no tiene competencias específicas.</EmptyText>}
          {competences.map((competence, index) => (
            <CompetenceCard key={competence.id} competence={competence} criteria={effective.criteria.filter((criterion) => criterion.specificCompetenceId === competence.id)} state={state} subject={subject} knownActionIds={knownActionIds} onCommand={applyCommand} onMove={(direction) => move("competence", competence.id, direction)} canMoveUp={index > 0} canMoveDown={index < competences.length - 1} runChange={runChange} />
          ))}
        </div>
      </EditorSection>

      <EditorSection number="3" title="Criterios de cada competencia">
        <p className="font-semibold text-slate-600">Los criterios se crean dentro de su competencia. Puedes moverlos a otra competencia de esta misma asignatura.</p>
        {effective.criteria.length === 0 && <div className="mt-3"><EmptyText>Añade al menos un criterio desde una competencia.</EmptyText></div>}
        {effective.criteria.length > 1 && <p className="mt-3 text-sm font-bold text-cyan-800">Usa ↑ y ↓ en cada criterio para conservar el orden pedagógico.</p>}
      </EditorSection>

      <EditorSection number="4" title="Saberes">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto]"><Field label="Código opcional"><input value={knowledgeCode} maxLength={120} onChange={(event) => setKnowledgeCode(event.target.value)} className={inputClass} /></Field><Field label="Texto"><textarea value={knowledgeText} maxLength={12000} rows={2} onChange={(event) => setKnowledgeText(event.target.value)} className={inputClass} /></Field><div className="flex items-end"><button type="button" disabled={!knowledgeText.trim()} onClick={async () => { const id = createCurriculumAssistantEntityId(state, "knowledge", subjectId); const saved = await runChange((confirm, occurredAt) => addPendingBasicKnowledge(state, { id, subjectId, text: knowledgeText, ...(knowledgeCode.trim() ? { externalCode: knowledgeCode.trim() } : {}) }, occurredAt, knownActionIds, confirm)); if (saved) { setKnowledgeText(""); setKnowledgeCode(""); } }} className={primarySmall}>Añadir</button></div></div>
        <div className="mt-4 space-y-3">
          {effective.basicKnowledge.map((knowledge, index) => <KnowledgeEditorRow key={knowledge.id} knowledge={knowledge} state={state} subject={subject} pending={false} onCommand={applyCommand} onMove={(direction) => move("knowledge", knowledge.id, direction)} canMoveUp={index > 0} canMoveDown={index < effective.basicKnowledge.length - 1} knownActionIds={knownActionIds} runChange={runChange} />)}
          {pendingKnowledge.map((knowledge) => <KnowledgeEditorRow key={knowledge.id} knowledge={{ ...knowledge, criterionIds: [] }} state={state} subject={subject} pending onCommand={applyCommand} onMove={() => undefined} canMoveUp={false} canMoveDown={false} knownActionIds={knownActionIds} runChange={runChange} />)}
          {effective.basicKnowledge.length + pendingKnowledge.length === 0 && <EmptyText>Añade al menos un saber.</EmptyText>}
        </div>
      </EditorSection>
      <button type="button" onClick={onBack} className={`${primaryLarge} mt-6 w-full`}>Guardar y volver a la lista</button>
    </div>
  );
}

function CompetenceCard({ competence, criteria, state, subject, knownActionIds, onCommand, onMove, canMoveUp, canMoveDown, runChange }: {
  competence: SpecificCompetence; criteria: readonly Criterion[]; state: CurriculumAssistantState; subject: CurriculumSubject; knownActionIds: CurriculumActionCatalogContext; onCommand: (command: CurriculumCatalogCommand) => Promise<boolean>; onMove: (direction: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean; runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean>;
}) {
  const [text, setText] = useState(competence.text);
  const [code, setCode] = useState(competence.externalCode ?? "");
  const [criterionText, setCriterionText] = useState("");
  const [criterionCode, setCriterionCode] = useState("");
  const pack = state.catalog.pack!;
  const addCriterion = async () => {
    const id = createCurriculumAssistantEntityId(state, "criterion", subject.id);
    const saved = await onCommand({
      type: "add-criterion",
      operationId: createCurriculumAssistantOperationId(state, "add-criterion", id),
      expectedVersion: state.catalog.revision,
      occurredAt: new Date().toISOString(),
      packId: pack.id,
      subjectId: subject.id,
      criterion: {
        id,
        specificCompetenceId: competence.id,
        text: criterionText,
        ...(criterionCode.trim() ? { externalCode: criterionCode.trim() } : {}),
      },
    });
    if (saved) { setCriterionText(""); setCriterionCode(""); }
  };
  return (
    <article className="rounded-2xl border border-cyan-900/15 bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[11rem_1fr_auto]">
        <Field label="Código"><input value={code} maxLength={120} onChange={(event) => setCode(event.target.value)} className={inputClass} /></Field>
        <Field label="Competencia"><textarea value={text} maxLength={12000} rows={2} onChange={(event) => setText(event.target.value)} className={inputClass} /></Field>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={() => void onCommand({ type: "update-specific-competence", operationId: createCurriculumAssistantOperationId(state, "update-competence", competence.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId: subject.id, specificCompetenceId: competence.id, externalCode: code || null, text })} className={primarySmall}>Guardar</button>
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className={secondarySmall}>↑</button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className={secondarySmall}>↓</button>
          <button type="button" onClick={() => void runChange((confirm, occurredAt) => retireCurriculumEntity(state, subject.id, "specific-competence", competence.id, knownActionIds, occurredAt, confirm))} className={dangerSmall}>Retirar</button>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-cyan-50/80 p-3">
        <h5 className="font-black text-[#173d70]">Criterios de esta competencia</h5>
        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <Field label="Código opcional"><input value={criterionCode} maxLength={120} onChange={(event) => setCriterionCode(event.target.value)} className={inputClass} /></Field>
          <Field label="Texto"><textarea value={criterionText} maxLength={12000} rows={2} onChange={(event) => setCriterionText(event.target.value)} className={inputClass} /></Field>
          <div className="flex items-end"><button type="button" disabled={!criterionText.trim()} onClick={addCriterion} className={primarySmall}>Añadir</button></div>
        </div>
        <div className="mt-3 space-y-2">
          {criteria.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} orderedCriteria={criteria} competences={subject.specificCompetences ?? []} state={state} subject={subject} knownActionIds={knownActionIds} onCommand={onCommand} runChange={runChange} />)}
          {criteria.length === 0 && <p className="font-semibold text-slate-500">Todavía no hay criterios en esta competencia.</p>}
        </div>
      </div>
    </article>
  );
}

function CriterionRow({ criterion, orderedCriteria, competences, state, subject, knownActionIds, onCommand, runChange }: { criterion: Criterion; orderedCriteria: readonly Criterion[]; competences: readonly SpecificCompetence[]; state: CurriculumAssistantState; subject: CurriculumSubject; knownActionIds: CurriculumActionCatalogContext; onCommand: (command: CurriculumCatalogCommand) => Promise<boolean>; runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean> }) {
  const [text, setText] = useState(criterion.text); const [code, setCode] = useState(criterion.externalCode ?? ""); const pack = state.catalog.pack!;
  const criterionIndex = orderedCriteria.findIndex((item) => item.id === criterion.id);
  const moveCriterion = (direction: -1 | 1) => {
    const groupedIds = orderedCriteria.map((item) => item.id);
    const target = criterionIndex + direction;
    if (criterionIndex < 0 || target < 0 || target >= groupedIds.length) return;
    [groupedIds[criterionIndex], groupedIds[target]] = [groupedIds[target], groupedIds[criterionIndex]];
    const visibleGroupIds = new Set(orderedCriteria.map((item) => item.id));
    let groupedIndex = 0;
    const ids = subject.criteria.map((item) => visibleGroupIds.has(item.id)
      ? groupedIds[groupedIndex++]
      : item.id);
    void onCommand({ type: "reorder-criteria", operationId: createCurriculumAssistantOperationId(state, "reorder-criteria", criterion.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId: subject.id, criterionIds: ids });
  };
  return <div className="rounded-xl border border-cyan-900/10 bg-white p-3"><div className="grid gap-2 lg:grid-cols-[9rem_1fr_13rem_auto]"><input aria-label="Código del criterio" value={code} maxLength={120} onChange={(event) => setCode(event.target.value)} className={inputClass} /><textarea aria-label="Texto del criterio" value={text} maxLength={12000} rows={2} onChange={(event) => setText(event.target.value)} className={inputClass} /><select aria-label="Competencia del criterio" value={criterion.specificCompetenceId} onChange={(event) => void onCommand({ type: "set-criterion-specific-competence", operationId: createCurriculumAssistantOperationId(state, "move-criterion", criterion.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId: subject.id, criterionId: criterion.id, specificCompetenceId: event.target.value })} className={inputClass}>{competences.map((competence) => <option key={competence.id} value={competence.id}>{competence.externalCode || competence.text.slice(0, 35)}</option>)}</select><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void onCommand({ type: "update-criterion", operationId: createCurriculumAssistantOperationId(state, "update-criterion", criterion.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId: subject.id, criterionId: criterion.id, externalCode: code || null, text })} className={primarySmall}>Guardar</button><button type="button" aria-label="Subir criterio" disabled={criterionIndex <= 0} onClick={() => moveCriterion(-1)} className={secondarySmall}>↑</button><button type="button" aria-label="Bajar criterio" disabled={criterionIndex < 0 || criterionIndex >= orderedCriteria.length - 1} onClick={() => moveCriterion(1)} className={secondarySmall}>↓</button><button type="button" onClick={() => void runChange((confirm, occurredAt) => retireCurriculumEntity(state, subject.id, "criterion", criterion.id, knownActionIds, occurredAt, confirm))} className={dangerSmall}>Retirar</button></div></div></div>;
}

function KnowledgeEditorRow({ knowledge, state, subject, pending, onCommand, onMove, canMoveUp, canMoveDown, knownActionIds, runChange }: { knowledge: BasicKnowledge; state: CurriculumAssistantState; subject: CurriculumSubject; pending: boolean; onCommand: (command: CurriculumCatalogCommand) => Promise<boolean>; onMove: (direction: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean; knownActionIds: CurriculumActionCatalogContext; runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean> }) {
  const [text, setText] = useState(knowledge.text); const [code, setCode] = useState(knowledge.externalCode ?? ""); const pack = state.catalog.pack!;
  return <div className="rounded-xl border border-cyan-900/10 bg-white p-3"><div className="grid gap-2 lg:grid-cols-[10rem_1fr_auto]"><input aria-label="Código del saber" value={code} maxLength={120} onChange={(event) => setCode(event.target.value)} className={inputClass} /><textarea aria-label="Texto del saber" value={text} maxLength={12000} rows={2} onChange={(event) => setText(event.target.value)} className={inputClass} /><div className="flex flex-wrap gap-2"><button type="button" onClick={() => pending ? void runChange((_confirm, occurredAt) => updatePendingBasicKnowledge(state, knowledge.id, text, code, occurredAt)) : void onCommand({ type: "update-basic-knowledge", operationId: createCurriculumAssistantOperationId(state, "update-knowledge", knowledge.id), expectedVersion: state.catalog.revision, occurredAt: new Date().toISOString(), packId: pack.id, subjectId: subject.id, basicKnowledgeId: knowledge.id, externalCode: code || null, text })} className={primarySmall}>Guardar</button>{!pending && <><button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className={secondarySmall}>↑</button><button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className={secondarySmall}>↓</button></>}<button type="button" onClick={() => void runChange((confirm, occurredAt) => retireCurriculumEntity(state, subject.id, "basic-knowledge", knowledge.id, knownActionIds, occurredAt, confirm))} className={dangerSmall}>Retirar</button></div></div><p className={`mt-2 text-sm font-bold ${knowledge.criterionIds.length > 0 ? "text-emerald-800" : "text-amber-800"}`}>{knowledge.criterionIds.length > 0 ? `${knowledge.criterionIds.length} criterios relacionados` : "Pendiente de relacionar en el paso 3"}</p></div>;
}

function RelationsStep({ state, actions, knownActionIds, selectedSubjectId, selectedKnowledgeId, onSelectSubject, onSelectKnowledge, onBack, onCommit, runChange, onConfirmation, onMessage }: { state: CurriculumAssistantState; actions: readonly Action[]; knownActionIds: CurriculumActionCatalogContext; selectedSubjectId: string | null; selectedKnowledgeId: string | null; onSelectSubject: (id: string) => void; onSelectKnowledge: (id: string) => void; onBack: () => void; onCommit: (state: CurriculumAssistantState) => Promise<boolean>; runChange: (change: (confirm: boolean, occurredAt: string) => CurriculumAssistantChangeResult) => Promise<boolean>; onConfirmation: (confirmation: PendingConfirmation | null) => void; onMessage: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const subjects = state.catalog.pack?.subjects.filter((subject) => !state.archivedSubjectIds.includes(subject.id)) ?? [];
  const subject = selectedSubjectId ? getEffectiveSubject(state, selectedSubjectId) : null;
  const pending = state.pendingBasicKnowledge.filter((item) => item.subjectId === selectedSubjectId && !state.retiredBasicKnowledgeIds.includes(item.id));
  const knowledgeItems: BasicKnowledge[] = subject ? [...subject.basicKnowledge, ...pending.map((item) => ({ ...item, criterionIds: [] }))] : [];
  const filteredKnowledge = knowledgeItems.filter((knowledge) => knowledge.text.toLowerCase().includes(search.trim().toLowerCase()));
  const knowledge = knowledgeItems.find((item) => item.id === selectedKnowledgeId) ?? null;
  const eligibleActions = subject ? getEligibleActionsForCurriculumSubject(actions, subject) : [];
  const inspection = subject ? inspectCurriculumSubject(state, subject.id, knownActionIds) : null;

  const toggleCriterion = (criterionId: string) => {
    if (!subject || !knowledge) return;
    const selected = knowledge.criterionIds.includes(criterionId)
      ? knowledge.criterionIds.filter((id) => id !== criterionId)
      : [...knowledge.criterionIds, criterionId];
    void runChange((confirm, occurredAt) => setBasicKnowledgeCriteria(state, subject.id, knowledge.id, selected, knownActionIds, occurredAt, confirm));
  };
  const activate = async () => {
    if (!subject) return;
    const occurredAt = new Date().toISOString();
    const result = setCurriculumSubjectActivation(state, subject.id, true, knownActionIds, occurredAt, false);
    if (result.status === "activated") { await onCommit(result.state); return; }
    if (result.status === "confirmation-required") {
      onConfirmation({ title: "La asignatura tiene avisos", messages: result.inspection.warningMessages, confirmLabel: "Activar de todos modos", confirm: async () => { const confirmed = setCurriculumSubjectActivation(state, subject.id, true, knownActionIds, occurredAt, true); if (confirmed.status === "activated" && await onCommit(confirmed.state)) onConfirmation(null); } });
    } else onMessage(result.inspection.blockingMessages.join(" "));
  };

  return <div className="mx-auto max-w-[1350px]"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-3xl font-black text-[#173d70]">Relaciona y activa</h3><p className="mt-2 font-semibold text-slate-600">Elige una asignatura, revisa cada saber y actívala cuando esté completa.</p></div><button type="button" onClick={onBack} className={secondaryLarge}>Volver</button></div><div className="mt-6 grid gap-4 xl:grid-cols-[16rem_20rem_1fr]"><aside className="rounded-2xl border border-cyan-900/15 bg-white/80 p-3"><h4 className="px-2 text-lg font-black text-[#173d70]">1. Asignatura</h4><div className="mt-3 space-y-2">{subjects.map((item) => <button key={item.id} type="button" aria-pressed={item.id === selectedSubjectId} onClick={() => onSelectSubject(item.id)} className={selectorButton}>{item.name}</button>)}</div></aside><aside className="rounded-2xl border border-cyan-900/15 bg-white/80 p-3"><h4 className="px-2 text-lg font-black text-[#173d70]">2. Saber</h4>{knowledgeItems.length > 8 && <input type="search" aria-label="Buscar saber" placeholder="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} mt-3`} />}<div className="mt-3 max-h-[58dvh] space-y-2 overflow-y-auto">{filteredKnowledge.map((item) => { const actionCount = state.actionLinks.filter((link) => link.basicKnowledgeId === item.id).length; return <button key={item.id} type="button" aria-pressed={item.id === selectedKnowledgeId} onClick={() => onSelectKnowledge(item.id)} className={`${selectorButton} text-left`}><span className="block line-clamp-3">{item.text}</span><span className="mt-1 block text-xs opacity-75">{item.criterionIds.length} criterios · {actionCount} acciones</span></button>; })}{knowledgeItems.length === 0 && <EmptyText>Añade saberes en el paso anterior.</EmptyText>}</div></aside><main className="rounded-2xl border border-cyan-900/15 bg-white/80 p-4 sm:p-5">{!knowledge || !subject ? <EmptyText>Elige un saber para revisar sus relaciones.</EmptyText> : <><p className="text-sm font-black uppercase tracking-wide text-cyan-700">{subject.name}</p><h4 className="mt-1 text-2xl font-black text-[#173d70]">{knowledge.text}</h4><section className="mt-5" aria-labelledby="criteria-for-knowledge"><h5 id="criteria-for-knowledge" className="text-xl font-black text-[#173d70]">3. Criterios del saber</h5><p className="mt-1 font-semibold text-slate-600">Pulsa para marcar o desmarcar. Solo aparecen criterios de esta asignatura.</p><div className="mt-4 space-y-4">{(subject.specificCompetences ?? []).map((competence) => { const criteria = subject.criteria.filter((criterion) => criterion.specificCompetenceId === competence.id); if (criteria.length === 0) return null; return <section key={competence.id} className="rounded-xl bg-cyan-50 p-3"><h6 className="font-black text-[#173d70]">{competence.externalCode ? `${competence.externalCode} · ` : ""}{competence.text}</h6><div className="mt-2 grid gap-2">{criteria.map((criterion) => <button key={criterion.id} type="button" aria-pressed={knowledge.criterionIds.includes(criterion.id)} onClick={() => toggleCriterion(criterion.id)} className="min-h-12 rounded-xl border border-cyan-900/15 bg-white px-4 py-3 text-left font-bold text-[#173d70] aria-pressed:border-emerald-600 aria-pressed:bg-emerald-100 focus-visible:outline-4 focus-visible:outline-cyan-400"><span aria-hidden="true">{knowledge.criterionIds.includes(criterion.id) ? "☑" : "☐"}</span> {criterion.externalCode ? `${criterion.externalCode} · ` : ""}{criterion.text}</button>)}</div></section>; })}</div>{knowledge.criterionIds.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 font-black text-amber-900">Pendiente: selecciona al menos un criterio.</p>}</section><section className="mt-6 border-t border-cyan-900/10 pt-5" aria-labelledby="actions-for-knowledge"><h5 id="actions-for-knowledge" className="text-xl font-black text-[#173d70]">4. Acciones observables</h5><p className="mt-1 font-semibold text-slate-600">Estas relaciones preparan la elegibilidad futura; no crean evidencias ni notas.</p>{knowledge.criterionIds.length === 0 ? <p className="mt-3 font-bold text-slate-500">Relaciona primero el saber con criterios.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{eligibleActions.map((action) => { const selected = state.actionLinks.some((link) => link.subjectId === subject.id && link.basicKnowledgeId === knowledge.id && link.actionId === action.id); return <button key={action.id} type="button" aria-pressed={selected} onClick={() => void runChange((_confirm, occurredAt) => setBasicKnowledgeAction(state, subject.id, knowledge.id, action, !selected, occurredAt))} className={`flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left font-black focus-visible:outline-4 focus-visible:outline-cyan-400 ${selected ? "border-cyan-700 bg-cyan-100" : "border-slate-200 bg-white"}`}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><ActionIcon icon={action.icon} iconId={action.iconId} /></span><span><span className="block text-[#173d70]">{action.title}</span><span className={`text-sm ${action.points >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{action.points >= 0 ? "Positiva" : "Negativa"}</span></span></button>; })}{eligibleActions.length === 0 && <p className="font-bold text-slate-500">No hay acciones propias o globales disponibles.</p>}</div>}</section></>}</main></div>{subject && inspection && <ActivationSummary state={state} subject={subject} inspection={inspection} onActivate={activate} onDeactivate={async () => { const result = setCurriculumSubjectActivation(state, subject.id, false, knownActionIds, new Date().toISOString()); if (result.status === "deactivated") await onCommit(result.state); }} />}</div>;
}

function ActivationSummary({ state, subject, inspection, onActivate, onDeactivate }: { state: CurriculumAssistantState; subject: CurriculumSubject; inspection: CurriculumSubjectPreparationInspection; onActivate: () => void; onDeactivate: () => void }) {
  const active = state.profile?.selectedSubjectIds.includes(subject.id) === true;
  return <section className="mt-5 rounded-3xl border border-cyan-900/15 bg-white/85 p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="text-2xl font-black text-[#173d70]">{inspection.canActivate ? `${subject.name} está lista para activar.` : `${subject.name} necesita ${inspection.blockingMessages.length} revisiones.`}</h4>{!inspection.canActivate && <p className="mt-2 font-semibold text-slate-600">{inspection.blockingMessages[0]} Puedes terminarla más adelante.</p>}{active && !state.trackingEnabled && <p className="mt-2 font-bold text-amber-800">Configurada como activa; el seguimiento general está pausado.</p>}</div>{active ? <button type="button" onClick={onDeactivate} className={dangerLarge}>Desactivar asignatura</button> : <button type="button" disabled={!inspection.canActivate} onClick={onActivate} className={primaryLarge}>Activar asignatura</button>}</div></section>;
}

function StatusBadge({ inspection }: { inspection: CurriculumSubjectPreparationInspection }) {
  const labels = { "not-started": "Sin empezar", "in-progress": "En preparación", "needs-review": "Necesita revisión", ready: "Lista para activar", active: "Activa" } as const;
  const icons = { "not-started": "○", "in-progress": "◐", "needs-review": "!", ready: "✓", active: "●" } as const;
  return <span className="shrink-0 rounded-full border border-cyan-900/15 bg-cyan-50 px-3 py-1.5 text-sm font-black text-[#173d70]"><span aria-hidden="true">{icons[inspection.status]}</span> {labels[inspection.status]}</span>;
}

function EditorSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="mt-6 rounded-3xl border border-cyan-900/15 bg-white/80 p-4 shadow-sm sm:p-6"><h4 className="mb-4 flex items-center gap-3 text-2xl font-black text-[#173d70]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-600 text-slate-950">{number}</span>{title}</h4>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block font-black text-[#173d70]">{label}{children}</label>; }
function EmptyText({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border-2 border-dashed border-cyan-900/15 bg-white/60 px-4 py-7 text-center font-bold text-slate-500">{children}</p>; }
function ConfirmationPanel({ confirmation, isSaving, onCancel }: { confirmation: PendingConfirmation; isSaving: boolean; onCancel: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section role="alert" aria-labelledby="assistant-confirmation-title" className="sticky top-0 z-20 mx-auto mb-5 max-w-4xl rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950 shadow-lg"><h3 ref={titleRef} tabIndex={-1} id="assistant-confirmation-title" className="text-xl font-black outline-none">{confirmation.title}</h3>{confirmation.messages.map((message) => <p key={message} className="mt-2 font-semibold">{message}</p>)}<div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={isSaving} onClick={() => void confirmation.confirm()} className={dangerLarge}>{confirmation.confirmLabel}</button><button type="button" disabled={isSaving} onClick={onCancel} className={secondaryLarge}>Seguir revisando</button></div></section>;
}

function keepFocusInsideAssistant(event: KeyboardEvent, dialog: HTMLElement) {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])"
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

function importErrorMessage(status: string): string { switch (status) { case "checksum-mismatch": return "El archivo no supera la comprobación de integridad."; case "limits-exceeded": return "El archivo supera los límites seguros."; case "broken-references": return "El archivo contiene relaciones rotas o cruzadas."; case "unsupported-schema-version": return "La versión del archivo no es compatible."; case "duplicate-keys": case "unsafe-structure": return "El archivo contiene una estructura insegura."; case "malformed-json": return "El JSON no está bien formado."; default: return "El archivo no cumple el contrato curricular de CristalClass."; } }
function messagesFromChange(result: CurriculumAssistantChangeResult): readonly string[] { return result.status === "applied" ? [] : result.messages; }
function formatInformativeDate(value: string): string { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "sin fecha" : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }

const inputClass = "mt-1.5 w-full rounded-xl border border-cyan-900/20 bg-white px-3 py-3 font-semibold text-slate-900 outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-200";
const primarySmall = "min-h-11 rounded-xl bg-[#173d70] px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-4 focus-visible:outline-cyan-400";
const secondarySmall = "min-h-11 rounded-xl border border-cyan-900/15 bg-white px-3 py-2 font-black text-[#173d70] disabled:opacity-35 focus-visible:outline-4 focus-visible:outline-cyan-400";
const dangerSmall = "min-h-11 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 font-black text-amber-900 focus-visible:outline-4 focus-visible:outline-cyan-400";
const primaryLarge = "min-h-14 rounded-2xl bg-[#173d70] px-6 py-3 text-lg font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-4 focus-visible:outline-cyan-400";
const secondaryLarge = "min-h-14 rounded-2xl border border-cyan-900/15 bg-white px-6 py-3 text-lg font-black text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400";
const dangerLarge = "min-h-14 rounded-2xl border border-amber-500 bg-amber-100 px-6 py-3 text-lg font-black text-amber-950 focus-visible:outline-4 focus-visible:outline-cyan-400";
const selectorButton = "w-full min-h-12 rounded-xl border border-cyan-900/10 bg-white px-3 py-3 font-black text-[#173d70] aria-pressed:border-cyan-700 aria-pressed:bg-cyan-100 focus-visible:outline-4 focus-visible:outline-cyan-400";
