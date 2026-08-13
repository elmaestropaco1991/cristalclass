import type { CSSProperties } from "react";
import type { ActionVariant } from "../types/action";

type Props = {
  icon: string;
  title: string;
  points: number;
  variant: ActionVariant;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

const variants: Record<ActionVariant, string> = {
  success: "bg-green-500 hover:bg-green-600",
  reward: "bg-yellow-500 hover:bg-yellow-600",
  bonus: "bg-blue-500 hover:bg-blue-600",
  warning: "bg-red-500 hover:bg-red-600",
  danger: "bg-red-700 hover:bg-red-800",
  severe: "bg-black hover:bg-neutral-900",
};

export default function OrbitActionButton({
  icon,
  title,
  points,
  variant,
  onClick,
  className = "",
  style,
}: Props) {
  const formattedPoints = points > 0 ? `+${points}` : `${points}`;

  return (
    <button
      onClick={onClick}
      style={style}
      className={`
        absolute
        w-44
        h-24
        rounded-full
        ${variants[variant]}
        shadow-2xl
        border-2
        border-white/20
        flex
        items-center
        px-3
        gap-3
        transition-all
        duration-200
        hover:scale-105
        active:scale-95
        ${className}
      `}
    >
      <div
        className="
          w-14
          h-14
          rounded-full
          bg-white
          flex
          items-center
          justify-center
          shadow-lg
          flex-shrink-0
        "
      >
        <span className="text-3xl">{icon}</span>
      </div>

      <div className="flex flex-col items-start leading-none">
        <span className="text-xl font-black text-white">
          {formattedPoints}
        </span>

        <span className="mt-1 text-sm font-bold text-white/95">
          {title}
        </span>
      </div>
    </button>
  );
}