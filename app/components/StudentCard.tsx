import type { CSSProperties } from "react";
import Image from "next/image";
import type { Student } from "../types/student";
import EquippedAvatar from "./EquippedAvatar";

type Props = {
  alumno: Student;
  onClick: () => void;
  loadGuardianEagerly?: boolean;
  guardianScale: number;
};

export default function StudentCard({
  alumno,
  onClick,
  loadGuardianEagerly = false,
  guardianScale,
}: Props) {
  const pendingChestCount = alumno.chests.filter(
    (chest) => chest.status === "pending" || chest.status === "closed"
  ).length;
  const appearanceStyle = {
    "--guardian-scale": guardianScale / 100,
    "--guardian-scale-mobile": Math.min(guardianScale, 120) / 100,
    "--pending-chest-size": `${guardianScale <= 100
       ? 10 + guardianScale * 0.07
       : 9.5 + guardianScale * 0.075}px`,
  } as CSSProperties;
  const isOverviewScale = guardianScale <= 60;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir ficha de ${alumno.nombre} ${alumno.apellidos}`}
      style={appearanceStyle}
      className="group relative flex h-[calc(15rem*var(--guardian-scale-mobile))] w-full flex-col items-center justify-end rounded-[2rem] text-center transition duration-200 motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-700 focus-visible:outline-offset-2 sm:h-[calc(15rem*var(--guardian-scale))] 2xl:h-[calc(17rem*var(--guardian-scale))]"
    >
      <div aria-hidden="true" className="absolute inset-1 rounded-[1.7rem] bg-white/25 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
      <div aria-hidden="true" className="absolute left-1/2 top-4 h-[calc(10rem*var(--guardian-scale-mobile))] w-[calc(10rem*var(--guardian-scale-mobile))] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.78),rgba(142,232,244,.26)_48%,transparent_72%)] opacity-75 blur-md sm:h-[calc(10rem*var(--guardian-scale))] sm:w-[calc(10rem*var(--guardian-scale))] 2xl:top-5 2xl:h-[calc(13rem*var(--guardian-scale))] 2xl:w-[calc(13rem*var(--guardian-scale))]" />
      <div aria-hidden="true" className="absolute left-1/2 top-5 h-[calc(8rem*var(--guardian-scale-mobile))] w-[calc(8rem*var(--guardian-scale-mobile))] -translate-x-1/2 opacity-45 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.95)_0_1px,transparent_1.6px)] [background-size:24px_24px] sm:h-[calc(8rem*var(--guardian-scale))] sm:w-[calc(8rem*var(--guardian-scale))] 2xl:top-8 2xl:h-[calc(11rem*var(--guardian-scale))] 2xl:w-[calc(11rem*var(--guardian-scale))]" />

      <div className="relative z-10 h-[calc(11rem*var(--guardian-scale-mobile))] w-full shrink-0 sm:h-[calc(11rem*var(--guardian-scale))] 2xl:h-[calc(13rem*var(--guardian-scale))]">
        <div aria-hidden="true" className="absolute bottom-1 left-1/2 h-7 w-[62%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(26,92,111,.34),rgba(26,92,111,0)_72%)] blur-md" />
        <div className="absolute bottom-1 left-1/2 h-[calc(11rem*var(--guardian-scale-mobile))] w-full max-w-[calc(11rem*var(--guardian-scale-mobile))] -translate-x-1/2 sm:h-[calc(11rem*var(--guardian-scale))] sm:max-w-[calc(11rem*var(--guardian-scale))] 2xl:h-[calc(13rem*var(--guardian-scale))] 2xl:max-w-[calc(13rem*var(--guardian-scale))]">
          <EquippedAvatar
            student={alumno}
            className="h-full w-full transition duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 motion-reduce:transition-none"
            avatarClassName="drop-shadow-[0_16px_14px_rgba(21,76,98,.28)]"
            imageLoading={loadGuardianEagerly ? "eager" : undefined}
          />

        </div>
      </div>

      <div className="relative z-20 mt-auto flex flex-col items-center pb-2.5">
        <p className={`truncate font-black tracking-tight text-[#173d70] ${
          isOverviewScale ? "text-base" : "text-xl"
        }`}>
          {alumno.nombre}
        </p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <p className={`inline-flex items-center gap-1 rounded-full border border-cyan-200/80 bg-cyan-50 font-black text-cyan-800 ${
            isOverviewScale ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          }`}>
            <span aria-hidden="true">💎</span>
            {alumno.cristales}
          </p>
          {pendingChestCount > 0 && (
            <span
              role="img"
              aria-label="Tiene cofres pendientes"
              className="pointer-events-none flex h-[var(--pending-chest-size)] w-[var(--pending-chest-size)] items-center justify-center"
              style={{ background: "transparent", border: 0, boxShadow: "none", outline: "none" }}
            >
              <Image
                src="/assets/chests/cristalclass-chest-ui-icon.png"
                alt=""
                aria-hidden="true"
                width={20}
                height={20}
                sizes="20px"
                unoptimized
                className="h-full w-full object-contain"
                style={{ background: "transparent", border: 0, boxShadow: "none", filter: "none", outline: "none" }}
              />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
