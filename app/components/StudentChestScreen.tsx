"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { getDragonChestThumbnail } from "../data/fullBodyAvatars";
import { INITIAL_COMPANION_ITEM_ID } from "../data/initialStudentInventory";
import {
  calculateStudentProgression,
  DEFAULT_PROGRESSION_CONFIG,
} from "../../domain/progression/StudentProgression";
import {
  openOldestPendingChestWithSelectedReward,
} from "../services/openStudentChestService";
import { loadStudents } from "../services/storageService";
import type { Student } from "../types/student";

type Props = {
  student: Student;
  controlsEnabled: boolean;
  onStudentUpdated: (student: Student) => void;
  onClose: () => void;
};

export default function StudentChestScreen({ student, controlsEnabled, onStudentUpdated, onClose }: Props) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState("");
  const openingGuardRef = useRef(false);
  const dragonThumbnail = getDragonChestThumbnail(
    calculateStudentProgression({
      crystals: student.cristales,
      highestCrystalTotal: student.highestCrystalTotal,
      config: DEFAULT_PROGRESSION_CONFIG,
    }).evolution
  );

  const chooseDragon = async () => {
    if (!controlsEnabled || openingGuardRef.current) return;

    openingGuardRef.current = true;
    setIsOpening(true);
    setError("");

    try {
      const result = await openOldestPendingChestWithSelectedReward(
        student.id,
        INITIAL_COMPANION_ITEM_ID
      );

      if (result.status !== "opened") {
        setError(
          result.status === "no-pending-chest"
            ? "Este alumno ya no tiene cofres pendientes."
            : "No se ha podido abrir el cofre."
        );
        return;
      }

      const updatedStudent = loadStudents()?.find((candidate) => candidate.id === student.id);
      if (!updatedStudent) {
        setError("No se ha podido actualizar al alumno.");
        return;
      }

      onStudentUpdated(updatedStudent);
      onClose();
    } catch {
      setError("No se ha podido abrir el cofre.");
    } finally {
      openingGuardRef.current = false;
      setIsOpening(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-4 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chest-title"
      aria-busy={!controlsEnabled}
    >
      <section className="relative w-full max-w-4xl overflow-hidden rounded-[36px] border border-cyan-200/25 bg-[radial-gradient(circle_at_50%_15%,#164d73,#081321_62%)] p-6 shadow-2xl sm:p-10">
        {controlsEnabled && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 min-h-12 rounded-2xl border border-white/30 px-5 text-lg font-black focus-visible:outline-4 focus-visible:outline-cyan-200"
          >
            Volver
          </button>
        )}

        <header className={`${controlsEnabled ? "pr-28" : ""} text-center`}>
          <p className="text-sm font-black uppercase tracking-[.2em] text-amber-200">Cofre conseguido</p>
          <h1 id="chest-title" className="mt-2 text-3xl font-black sm:text-5xl">
            {controlsEnabled ? "Elige tu compañero" : "Tu recompensa está apareciendo"}
          </h1>
          <p className="mt-3 text-lg font-bold text-cyan-100">
            {controlsEnabled
              ? `Se equipará automáticamente junto a ${student.nombre}.`
              : "La magia del cofre todavía se está revelando."}
          </p>
        </header>

        <div className="mx-auto mt-8 grid max-w-md">
          {controlsEnabled ? (
            <button
              type="button"
              onClick={() => void chooseDragon()}
              disabled={isOpening}
              className="group min-h-[28rem] rounded-[32px] border-2 border-cyan-200/50 bg-white/10 p-6 text-center transition hover:border-amber-200 hover:bg-white/15 active:scale-[.98] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-4 focus-visible:outline-amber-200"
            >
              <RewardArtwork dragonThumbnail={dragonThumbnail} />
              <span className="mt-5 block text-2xl font-black">Dragón de cristal</span>
              <span className="mt-2 block text-base font-bold text-cyan-100">
                {isOpening ? "Abriendo cofre…" : "Elegir y equipar"}
              </span>
            </button>
          ) : (
            <div className="min-h-[28rem] rounded-[32px] border-2 border-cyan-200/30 bg-white/10 p-6 text-center">
              <RewardArtwork dragonThumbnail={dragonThumbnail} />
              <span className="mt-5 block text-2xl font-black">Dragón de cristal</span>
            </div>
          )}
        </div>

        <p aria-live="assertive" className="mt-5 min-h-6 text-center font-bold text-rose-200">
          {error}
        </p>
      </section>
    </div>
  );
}

function RewardArtwork({ dragonThumbnail }: { dragonThumbnail: string }) {
  return (
    <span className="mx-auto flex h-72 w-72 max-w-full items-center justify-center rounded-full bg-cyan-100/10 shadow-[0_0_55px_rgba(103,232,249,.22)]">
      <Image
        src={dragonThumbnail}
        alt="Dragón de cristal"
        width={280}
        height={280}
        unoptimized
        className="h-full w-full object-contain"
      />
    </span>
  );
}
