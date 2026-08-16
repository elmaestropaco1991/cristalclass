import type { CSSProperties } from "react";
import type { ActionSoundKind } from "../services/actionSoundService";

type Props = {
  kind: ActionSoundKind;
};

const PARTICLES = [
  { x: "25%", delay: "0ms", size: "8px" },
  { x: "36%", delay: "80ms", size: "12px" },
  { x: "48%", delay: "25ms", size: "9px" },
  { x: "60%", delay: "120ms", size: "11px" },
  { x: "72%", delay: "55ms", size: "7px" },
] as const;

export default function ActionConfirmationFeedback({ kind }: Props) {
  const positive = kind === "positive";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-[60] overflow-hidden rounded-[inherit] ${
        positive ? "action-feedback-positive" : "action-feedback-negative"
      }`}
    >
      <span className="sr-only">
        {positive ? "Acción positiva registrada." : "Acción registrada."}
      </span>
      <div
        aria-hidden="true"
        className={`absolute inset-[12%] rounded-full blur-xl ${
          positive
            ? "bg-[radial-gradient(circle,rgba(255,255,255,.85),rgba(72,224,239,.3)_45%,transparent_70%)]"
            : "bg-[radial-gradient(circle,rgba(222,245,255,.7),rgba(55,116,169,.26)_45%,transparent_72%)]"
        }`}
      />
      {PARTICLES.map((particle, index) => (
        <span
          key={`${particle.x}-${index}`}
          aria-hidden="true"
          className={`action-feedback-particle absolute bottom-[28%] rounded-sm rotate-45 ${
            positive ? "bg-cyan-100 shadow-[0_0_12px_#67e8f9]" : "bg-blue-200 shadow-[0_0_10px_#93c5fd]"
          }`}
          style={{
            "--particle-x": particle.x,
            "--particle-delay": particle.delay,
            "--particle-size": particle.size,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
