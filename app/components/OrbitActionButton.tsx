import type { CSSProperties } from "react";
import type { OrbitPlacement } from "./orbitGeometry";
import ActionIcon from "./ActionIcon";
import { studentProfileVisuals } from "./studentProfileVisuals";

type Props = {
  icon?: string;
  iconId?: string;
  title: string;
  points: number;
  placement: OrbitPlacement;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
};

export default function OrbitActionButton({
  icon,
  iconId,
  title,
  points,
  placement,
  onClick,
  disabled = false,
  className = "",
  style,
}: Props) {
  const formattedPoints = points > 0 ? `+${points}` : `${points}`;
  const extendsLeft = placement === "top-left" || placement === "bottom-left";
  const visualStyle = points > 0
    ? studentProfileVisuals.positiveAction
    : studentProfileVisuals.negativeAction;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`relative isolate h-24 w-72 overflow-hidden rounded-full border-2 bg-gradient-to-br px-3 text-white transition duration-200 active:scale-[.98] motion-reduce:transition-none ${visualStyle} ${className}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
        <span className={`relative z-10 flex h-full items-center gap-3 ${extendsLeft ? "flex-row-reverse" : ""}`}>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/75 bg-gradient-to-br from-white/45 via-white/20 to-sky-950/10 shadow-[inset_0_2px_5px_rgba(255,255,255,.55),inset_0_-4px_8px_rgba(10,55,95,.16),0_3px_7px_rgba(0,0,0,.17)]">
          <ActionIcon icon={icon} iconId={iconId} />
        </span>
        <span className={`flex min-w-0 flex-1 flex-col leading-tight ${extendsLeft ? "items-end text-right" : "items-start text-left"}`}>
          <span className="text-[24px] font-bold leading-tight text-white">{title}</span>
          <span className="mt-1 text-[15px] font-semibold leading-none text-white/90">{formattedPoints}</span>
        </span>
      </span>
    </button>
  );
}
