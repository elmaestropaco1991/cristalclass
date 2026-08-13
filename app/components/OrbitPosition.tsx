import type { ReactNode } from "react";
import { getOrbitAnchorStyle, type OrbitPlacement } from "./orbitGeometry";

type Props = {
  angle: number;
  radius: number;
  placement: OrbitPlacement;
  children: ReactNode;
};

export default function OrbitPosition({
  angle,
  radius,
  placement,
  children,
}: Props) {
  const cardPositions: Record<OrbitPlacement, string> = {
    top: "-translate-x-1/2 -translate-y-[calc(100%+16px)]",
    "top-left": "-translate-x-[calc(100%+16px)] -translate-y-1/2",
    "top-right": "translate-x-4 -translate-y-1/2",
    "bottom-left": "-translate-x-[calc(100%+16px)] -translate-y-1/2",
    "bottom-right": "translate-x-4 -translate-y-1/2",
    bottom: "-translate-x-1/2 translate-y-4",
  };

  return (
    <div
      className="absolute"
      style={getOrbitAnchorStyle(angle, radius)}
    >
      <div className={`absolute left-0 top-0 ${cardPositions[placement]}`}>
        {children}
      </div>
    </div>
  );
}
