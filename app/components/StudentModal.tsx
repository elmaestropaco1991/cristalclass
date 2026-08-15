"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import {
  createActionApplicationGuard,
  shouldCloseAfterActionApplication,
} from "../services/actionApplicationGuard";
import {
  playActionSound,
  prepareActionAudio,
  shouldRequestActionSound,
} from "../services/actionSoundService";
import { getActionCatalog } from "../services/actionService";
import type { Action, ActionType } from "../types/action";
import type { Movement } from "../types/movement";
import type { Student } from "../types/student";
import type { ItemCategory } from "../../domain";
import AdditionalActionsPanel from "./AdditionalActionsPanel";
import ActionOrbit from "./ActionOrbit";
import AvatarArena from "./AvatarArena";
import ChestOpeningVideo, {
  preloadChestOpeningVideo,
  type ChestOpeningVideoHandle,
} from "./ChestOpeningVideo";
import StudentCollectionScreen from "./StudentCollectionScreen";
import StudentChestScreen from "./StudentChestScreen";
import StudentInfo from "./StudentInfo";
import ChestIcon from "./ChestIcon";
import { studentProfileVisuals } from "./studentProfileVisuals";

type Props = {
  alumno: Student;
  movements: readonly Movement[];
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  actionsDisabled: boolean;
  studentIsAbsent: boolean;
  onCerrar: () => void;
  onAccion: (actionId: ActionType) => Promise<boolean>;
  onStudentUpdated: (student: Student) => void;
};

export default function StudentModal({ alumno, movements, soundEnabled, onSoundEnabledChange, actionsDisabled, studentIsAbsent, onCerrar, onAccion, onStudentUpdated }: Props) {
  const [additionalActionsOpen, setAdditionalActionsOpen] = useState(false);
  const [coleccionAbierta, setColeccionAbierta] = useState(false);
  const [cofreAbierto, setCofreAbierto] = useState(false);
  const [chestOpeningVideoOpen, setChestOpeningVideoOpen] = useState(false);
  const [chestFlowActive, setChestFlowActive] = useState(false);
  const [lastCollectionCategory, setLastCollectionCategory] = useState<ItemCategory | null>(null);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [actionCatalog, setActionCatalog] = useState<Action[]>(() => getActionCatalog());
  const actionGuardRef = useRef(createActionApplicationGuard());
  const pendingChestCount = alumno.chests.filter(
    (chest) => chest.status === "pending" || chest.status === "closed"
  ).length;
  const chestFlowGuardRef = useRef(false);
  const chestOpeningVideoRef = useRef<ChestOpeningVideoHandle>(null);

  useEffect(() => {
    if (pendingChestCount > 0) preloadChestOpeningVideo();
  }, [pendingChestCount]);

  const handleClose = () => {
    if (!actionGuardRef.current.isProcessing) onCerrar();
  };

  const startChestOpening = () => {
    if (chestFlowGuardRef.current || !chestOpeningVideoRef.current) return;

    chestFlowGuardRef.current = true;
    flushSync(() => {
      setChestFlowActive(true);
      setChestOpeningVideoOpen(true);
    });
    chestOpeningVideoRef.current.startPlayback();
  };

  const closeChestScreen = () => {
    setCofreAbierto(false);
    setChestFlowActive(false);
    chestFlowGuardRef.current = false;
  };

  const handleAction = async (actionId: ActionType): Promise<boolean> => {
    if (actionsDisabled || actionGuardRef.current.isProcessing) return false;

    const actionPoints = actionCatalog.find((action) => action.id === actionId)?.points ?? 0;
    if (soundEnabled && actionPoints !== 0) prepareActionAudio();

    setIsApplyingAction(true);
    setActionError(false);
    const outcome = await actionGuardRef.current.run(() => onAccion(actionId));

    if (shouldCloseAfterActionApplication(outcome)) {
      if (shouldRequestActionSound(actionPoints, soundEnabled, true)) {
        playActionSound(actionPoints);
      }
      onCerrar();
      return true;
    }

    if (outcome === "failed") setActionError(true);
    setIsApplyingAction(false);
    return false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:p-6"
      onClick={handleClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${alumno.nombre}`}
        onClick={(event) => event.stopPropagation()}
        style={{ fontFamily: '"Trebuchet MS", "Avenir Next", Arial, sans-serif' }}
        className="relative h-[min(94vh,1125px)] w-auto max-w-[96vw] aspect-[4/3] overflow-hidden rounded-[32px] bg-[#c8e7ee] shadow-2xl sm:rounded-[48px]"
      >
        <StudentBackdrop />

        <StudentInfo nombre={alumno.nombre} cristales={alumno.cristales} />

        <span aria-live="assertive" className="sr-only">
          {actionError ? "No se pudo aplicar la acción." : ""}
        </span>
        <span aria-live="polite" className="sr-only">
          {studentIsAbsent ? "Alumno ausente. Las acciones de cristales están deshabilitadas." : ""}
        </span>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar ficha del alumno"
          className="absolute right-[4.5%] top-[5%] z-30 flex h-[clamp(3.3rem,5vw,5rem)] w-[clamp(3.3rem,5vw,5rem)] items-center justify-center rounded-full border border-white/95 bg-gradient-to-br from-[#fffdf5] to-[#e8f5fb] text-[clamp(2.5rem,4.15vw,4.15rem)] font-light leading-none text-[#173d70] shadow-[0_5px_12px_rgba(23,61,112,.2),inset_0_1px_2px_rgba(255,255,255,.9)] transition active:scale-[.97] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-400"
        >
          ×
        </button>

        {pendingChestCount > 0 && !chestFlowActive && (
          <button
            type="button"
            onClick={startChestOpening}
            aria-label={`Abrir cofre de ${alumno.nombre}`}
            className="absolute bottom-[13%] left-[4.5%] z-30 flex items-center gap-2.5 text-left text-[#173d70] transition active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-400"
          >
            <span className={`relative flex h-[clamp(2.45rem,3.8vw,3.7rem)] w-[clamp(2.45rem,3.8vw,3.7rem)] shrink-0 items-center justify-center rounded-full border-2 ${studentProfileVisuals.magicControl}`}>
              <Image
                src="/assets/chests/cristalclass-chest-ui-icon.png"
                alt=""
                aria-hidden="true"
                width={28}
                height={28}
                sizes="28px"
                unoptimized
                className="h-[clamp(1.5rem,2.1vw,1.75rem)] w-[clamp(1.5rem,2.1vw,1.75rem)] object-contain"
                style={{ background: "transparent", border: 0, boxShadow: "none", filter: "none", outline: "none" }}
              />
              <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-300 px-1 text-sm font-black text-slate-950">
                {pendingChestCount}
              </span>
            </span>
            <span className="text-[clamp(.8rem,1.25vw,1.35rem)] font-black">Abrir cofre</span>
          </button>
        )}

        <div className="absolute left-1/2 top-[52%] h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 scale-[0.58] sm:scale-[0.7] lg:scale-[0.76] xl:scale-[0.8] 2xl:top-[47%] 2xl:scale-100">
          <AvatarArena student={alumno} />
          <ActionOrbit onAccion={handleAction} disabled={isApplyingAction || actionsDisabled} actions={actionCatalog} />
        </div>

        <button
          type="button"
          onClick={() => setColeccionAbierta(true)}
          aria-label={`Abrir colección de ${alumno.nombre}`}
          className="absolute bottom-[5%] left-[4.5%] z-30 flex items-center gap-2.5 text-left text-[#173d70] transition active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-400"
        >
          <span className={`flex h-[clamp(2.45rem,3.8vw,3.7rem)] w-[clamp(2.45rem,3.8vw,3.7rem)] shrink-0 items-center justify-center rounded-full border-2 ${studentProfileVisuals.magicControl}`}>
            <ChestIcon />
          </span>
          <span className="text-[clamp(.75rem,1.2vw,1.28rem)] font-bold">
            Colección
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActionError(false);
            setAdditionalActionsOpen(true);
          }}
          aria-label={`Abrir más acciones de ${alumno.nombre}`}
          className="absolute bottom-[5%] right-[4.5%] z-30 flex items-center gap-2.5 text-right text-[#173d70] transition active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-400"
        >
          <span className="text-[clamp(.75rem,1.2vw,1.28rem)] font-bold">Más acciones</span>
          <span className={`flex h-[clamp(2.45rem,3.8vw,3.7rem)] w-[clamp(2.45rem,3.8vw,3.7rem)] items-center justify-center rounded-full border-2 text-[clamp(1.6rem,3.2vw,3rem)] font-bold leading-none text-white ${studentProfileVisuals.magicControl}`}>
            +
          </span>
        </button>

        {additionalActionsOpen && (
          <AdditionalActionsPanel
            student={alumno}
            movements={movements}
            catalog={actionCatalog}
            isApplyingAction={isApplyingAction}
            actionError={actionError}
            actionsDisabled={actionsDisabled}
            studentIsAbsent={studentIsAbsent}
            onApplyAction={handleAction}
            onCatalogChange={setActionCatalog}
            onBack={() => setAdditionalActionsOpen(false)}
          />
        )}

        {coleccionAbierta && (
          <StudentCollectionScreen
            student={alumno}
            initialCategory={lastCollectionCategory ?? undefined}
            onCategoryChange={setLastCollectionCategory}
            onStudentUpdated={onStudentUpdated}
            onClose={() => setColeccionAbierta(false)}
          />
        )}

        {cofreAbierto && (
          <StudentChestScreen
            student={alumno}
            onStudentUpdated={onStudentUpdated}
            onClose={closeChestScreen}
          />
        )}
      </section>

      {pendingChestCount > 0 && (
        <ChestOpeningVideo
          ref={chestOpeningVideoRef}
          isOpen={chestOpeningVideoOpen}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={onSoundEnabledChange}
          onReveal={() => setCofreAbierto(true)}
          onFinished={() => setChestOpeningVideoOpen(false)}
        />
      )}
    </div>
  );
}

function StudentBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#f7e8c6_0%,#e7edf0_34%,#bfe8ef_67%,#8bc4dd_100%)]" />
      <div className="absolute -left-[10%] -top-[21%] h-[82%] w-[46%] rotate-[18deg] bg-[linear-gradient(112deg,rgba(255,243,194,.66),rgba(255,220,132,.2)_42%,transparent_70%)] opacity-75" />
      <div className="absolute -left-[18%] -top-[30%] h-[70%] w-[58%] rounded-full bg-amber-100/80 blur-3xl" />
      <div className="absolute left-1/2 top-[43%] h-[55%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-3xl" />
      <div className="absolute -bottom-[24%] -left-[7%] h-[45%] w-[50%] rounded-full bg-sky-700/25 blur-3xl" />
      <div className="absolute -bottom-[26%] -right-[10%] h-[48%] w-[55%] rounded-full bg-cyan-700/25 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.26] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1.5px)] [background-size:52px_52px]" />
      <div className="absolute inset-0 opacity-[0.13] [background-image:radial-gradient(circle_at_18%_72%,rgba(255,255,255,.95)_0_1px,transparent_1.5px),radial-gradient(circle_at_82%_24%,rgba(125,216,241,.9)_0_1px,transparent_1.5px)] [background-size:76px_76px,112px_112px]" />
      <div className="absolute inset-0 opacity-[0.3] [background-image:radial-gradient(circle_at_12%_16%,rgba(255,236,155,.95)_0_1px,transparent_1.8px),radial-gradient(circle_at_30%_28%,rgba(255,247,208,.9)_0_1px,transparent_1.7px),radial-gradient(circle_at_46%_13%,rgba(255,223,130,.8)_0_1px,transparent_1.8px)] [background-size:108px_108px,146px_146px,174px_174px]" />
      <div className="absolute left-1/2 top-[48%] h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 [background-image:repeating-conic-gradient(from_18deg,rgba(255,255,255,.22)_0deg_1deg,transparent_1deg_16deg)] opacity-40" />
      <div className="absolute bottom-0 left-0 h-[23%] w-[30%] rounded-tr-[100%] bg-gradient-to-tr from-slate-700/20 via-cyan-500/10 to-transparent blur-2xl" />
      <div className="absolute bottom-0 right-0 h-[23%] w-[30%] rounded-tl-[100%] bg-gradient-to-tl from-slate-700/20 via-cyan-500/10 to-transparent blur-2xl" />
    </div>
  );
}
