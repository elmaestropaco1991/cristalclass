"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRandomSelectionPreviewSequence,
  getRandomSelectionAnimationPlan,
  getRandomSelectorCandidatePresentation,
} from "../services/randomStudentSelectorService";
import {
  playRandomSelectorSound,
  stopRandomSelectorSounds,
} from "../services/randomStudentSelectorSoundService";
import type { Student } from "../types/student";
import type {
  RandomStudentRoundState,
  RandomStudentSelectionMode,
} from "../types/randomStudentSelector";
import EquippedAvatar from "./EquippedAvatar";

export type RandomStudentSelectionAnimation = {
  readonly id: number;
  readonly mode: RandomStudentSelectionMode;
  readonly candidateStudentIds: readonly string[];
  readonly targetStudentId: string;
};

type Props = {
  noticeOpen: boolean;
  students: readonly Student[];
  presentStudentIds: readonly string[];
  availableStudentIds: readonly string[];
  state: RandomStudentRoundState;
  isHydrated: boolean;
  isContinuousRunning: boolean;
  roundControlsVisible: boolean;
  soundEnabled: boolean;
  message: string;
  animation: RandomStudentSelectionAnimation | null;
  onCloseNotice: () => void;
  onContinueContinuous: () => void;
  onStopContinuous: () => void;
  onCloseContinuousRound: () => void;
  onResetContinuous: () => void;
  onAnimationComplete: (animation: RandomStudentSelectionAnimation) => void;
};

export default function RandomStudentSelector({
  noticeOpen,
  students,
  presentStudentIds,
  availableStudentIds,
  state,
  isHydrated,
  isContinuousRunning,
  roundControlsVisible,
  soundEnabled,
  message,
  animation,
  onCloseNotice,
  onContinueContinuous,
  onStopContinuous,
  onCloseContinuousRound,
  onResetContinuous,
  onAnimationComplete,
}: Props) {
  const isRoundContext = state.activeMode === "continuous";
  const isRoundComplete = presentStudentIds.length > 0
    && availableStudentIds.length === 0
    && state.selectedStudentIds.length > 0;

  return (
    <>
      {noticeOpen && (
        <SelectorNotice
          message={message}
          isRoundContext={isRoundContext}
          isRoundRunning={isContinuousRunning}
          isRoundComplete={isRoundComplete}
          canContinue={isHydrated && availableStudentIds.length > 0}
          onClose={onCloseNotice}
          onContinue={onContinueContinuous}
          onStop={onStopContinuous}
          onCloseRound={onCloseContinuousRound}
          onReset={onResetContinuous}
        />
      )}

      {animation && (
        <SelectionAnimation
          key={animation.id}
          animation={animation}
          students={students}
          soundEnabled={soundEnabled}
          onComplete={onAnimationComplete}
          onStopContinuous={onStopContinuous}
          onCloseContinuousRound={onCloseContinuousRound}
        />
      )}

      {isRoundContext && roundControlsVisible && !noticeOpen && !animation && (
        <RoundControls
          isRunning={isContinuousRunning}
          isComplete={isRoundComplete}
          canContinue={isHydrated && availableStudentIds.length > 0}
          hasPreviousSelections={state.selectedStudentIds.length > 0}
          onContinue={onContinueContinuous}
          onStop={onStopContinuous}
          onCloseRound={onCloseContinuousRound}
          onReset={onResetContinuous}
        />
      )}
    </>
  );
}

function SelectorNotice({
  message,
  isRoundContext,
  isRoundRunning,
  isRoundComplete,
  canContinue,
  onClose,
  onContinue,
  onStop,
  onCloseRound,
  onReset,
}: {
  message: string;
  isRoundContext: boolean;
  isRoundRunning: boolean;
  isRoundComplete: boolean;
  canContinue: boolean;
  onClose: () => void;
  onContinue: () => void;
  onStop: () => void;
  onCloseRound: () => void;
  onReset: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="random-selector-notice-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(145deg,#fff8df,#e4f7f8_52%,#bce7ee)] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">
              Participación en clase
            </p>
            <h2
              ref={titleRef}
              id="random-selector-notice-title"
              tabIndex={-1}
              className="mt-1 text-2xl font-black text-[#173d70] outline-none sm:text-3xl"
            >
              {isRoundContext ? "Ronda aleatoria" : "Selección al azar"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar aviso del selector"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-900/20 bg-white/80 text-2xl font-black text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400"
          >
            ×
          </button>
        </div>
        <p role="status" className="mt-5 rounded-2xl bg-white/65 px-4 py-4 font-bold text-[#173d70]">
          {message || (isRoundComplete
            ? "Ronda terminada: todo el alumnado presente ha participado."
            : "El selector está preparado.")}
        </p>
        {isRoundContext && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {isRoundRunning ? (
              <button type="button" onClick={onStop} className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 font-black text-slate-950 focus-visible:outline-4 focus-visible:outline-amber-200">
                Detener ronda
              </button>
            ) : !isRoundComplete && (
              <button type="button" disabled={!canContinue} onClick={onContinue} className="min-h-11 rounded-xl bg-[#173d70] px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-cyan-300">
                Continuar ronda
              </button>
            )}
            <button type="button" onClick={onReset} className="min-h-11 rounded-xl border border-cyan-900/20 bg-white/85 px-4 py-2 font-black text-[#173d70] focus-visible:outline-4 focus-visible:outline-cyan-400">
              Reiniciar ronda
            </button>
            <button type="button" onClick={onCloseRound} className="min-h-11 rounded-xl border border-cyan-900/25 bg-[#173d70] px-4 py-2 font-black text-white focus-visible:outline-4 focus-visible:outline-cyan-300">
              Cerrar ronda
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function RoundControls({
  isRunning,
  isComplete,
  canContinue,
  hasPreviousSelections,
  onContinue,
  onStop,
  onCloseRound,
  onReset,
}: {
  isRunning: boolean;
  isComplete: boolean;
  canContinue: boolean;
  hasPreviousSelections: boolean;
  onContinue: () => void;
  onStop: () => void;
  onCloseRound: () => void;
  onReset: () => void;
}) {
  return (
    <aside
      aria-label="Controles de la ronda aleatoria"
      className="fixed left-1/2 top-[max(.75rem,env(safe-area-inset-top))] z-[80] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-[#173d70]/95 p-1.5 pl-3 text-white shadow-xl backdrop-blur"
    >
      <span className="truncate text-sm font-black">
        {isComplete ? "Ronda terminada" : isRunning ? "Ronda en curso" : "Ronda pausada"}
      </span>
      {isRunning ? (
        <button type="button" onClick={onStop} className="min-h-10 rounded-full bg-amber-400 px-3 py-2 text-sm font-black text-slate-950 focus-visible:outline-4 focus-visible:outline-cyan-300">
          Detener
        </button>
      ) : !isComplete && (
        <button type="button" disabled={!canContinue} onClick={onContinue} className="min-h-10 rounded-full bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-45 focus-visible:outline-4 focus-visible:outline-cyan-200">
          {hasPreviousSelections ? "Continuar" : "Comenzar"}
        </button>
      )}
      <button type="button" onClick={onReset} className="min-h-10 rounded-full bg-white/15 px-3 py-2 text-sm font-black text-white focus-visible:outline-4 focus-visible:outline-cyan-300">
        Reiniciar
      </button>
      <button type="button" onClick={onCloseRound} className="min-h-10 rounded-full border border-white/35 bg-slate-950/35 px-3 py-2 text-sm font-black text-white focus-visible:outline-4 focus-visible:outline-cyan-300">
        Cerrar ronda
      </button>
    </aside>
  );
}

function SelectionAnimation({
  animation,
  students,
  soundEnabled,
  onComplete,
  onStopContinuous,
  onCloseContinuousRound,
}: {
  animation: RandomStudentSelectionAnimation;
  students: readonly Student[];
  soundEnabled: boolean;
  onComplete: (animation: RandomStudentSelectionAnimation) => void;
  onStopContinuous: () => void;
  onCloseContinuousRound: () => void;
}) {
  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );
  const [previewStudentId, setPreviewStudentId] = useState(animation.targetStudentId);
  const [frameIndex, setFrameIndex] = useState(0);
  const [selected, setSelected] = useState(false);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan = getRandomSelectionAnimationPlan(reducedMotion);
    const sequence = createRandomSelectionPreviewSequence(
      animation.candidateStudentIds,
      animation.targetStudentId,
      plan.frameDelaysMs.length
    );
    let frame = 0;
    let timer: number | null = null;

    const revealSelected = () => {
      setPreviewStudentId(animation.targetStudentId);
      setFrameIndex((current) => current + 1);
      setSelected(true);
      playRandomSelectorSound("selected", soundEnabled);
      timer = window.setTimeout(
        () => completeRef.current(animation),
        plan.selectedHoldMs
      );
    };

    const showFrame = () => {
      if (frame >= plan.frameDelaysMs.length) {
        revealSelected();
        return;
      }

      setPreviewStudentId(sequence[frame] ?? animation.targetStudentId);
      setFrameIndex(frame);
      playRandomSelectorSound(
        "tick",
        soundEnabled,
        frame / Math.max(plan.frameDelaysMs.length - 1, 1)
      );
      timer = window.setTimeout(() => {
        frame += 1;
        showFrame();
      }, plan.frameDelaysMs[frame]);
    };

    if (reducedMotion) revealSelected();
    else showFrame();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      stopRandomSelectorSounds();
    };
  }, [animation, soundEnabled]);

  const previewStudent = studentMap.get(previewStudentId)
    ?? studentMap.get(animation.targetStudentId);
  const presentation = previewStudent
    ? getRandomSelectorCandidatePresentation(previewStudent)
    : null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#fef8d8_0%,#bdebf1_42%,#173d70_100%)] p-3 sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.95)_0_2px,transparent_2.5px)] [background-size:38px_38px]" />
      <p className="sr-only" aria-live="polite">
        {selected && presentation
          ? `Alumno seleccionado: ${presentation.name}`
          : "Seleccionando alumnado presente al azar."}
      </p>

      {previewStudent && presentation && (
        <div
          key={`${animation.id}-${frameIndex}-${previewStudent.id}`}
          aria-hidden="true"
          className={`relative flex w-full max-w-2xl flex-col items-center text-center ${
            selected ? "selector-winner-glow" : "selector-candidate-enter"
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[.24em] text-cyan-950/70 sm:text-sm">
            {animation.mode === "continuous" ? "Ronda" : "Azar"}
          </p>
          <div className="relative mt-1 h-[min(42vh,20rem)] w-full max-w-[24rem] sm:mt-3 sm:h-[min(48vh,24rem)]">
            <div className="absolute inset-[8%] rounded-full bg-white/45 blur-2xl" />
            <EquippedAvatar
              student={previewStudent}
              className="h-full w-full"
              avatarClassName="drop-shadow-[0_22px_18px_rgba(13,64,93,.34)]"
              imageLoading="eager"
            />
          </div>
          <p className="mt-1 max-w-full break-words px-2 text-4xl font-black leading-none tracking-tight text-[#173d70] drop-shadow-[0_2px_0_rgba(255,255,255,.7)] sm:text-6xl lg:text-7xl">
            {presentation.name}
          </p>
        </div>
      )}

      {animation.mode === "continuous" && (
        <div className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))] flex flex-wrap justify-end gap-2 sm:right-6 sm:top-[max(1.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onStopContinuous}
            className="min-h-11 rounded-full border-2 border-white/80 bg-amber-500 px-4 py-2 font-black text-slate-950 shadow-lg focus-visible:outline-4 focus-visible:outline-cyan-300 sm:px-5"
          >
            Detener ronda
          </button>
          <button
            type="button"
            onClick={onCloseContinuousRound}
            className="min-h-11 rounded-full border-2 border-white/80 bg-[#173d70] px-4 py-2 font-black text-white shadow-lg focus-visible:outline-4 focus-visible:outline-cyan-300 sm:px-5"
          >
            Cerrar ronda
          </button>
        </div>
      )}
    </div>
  );
}
