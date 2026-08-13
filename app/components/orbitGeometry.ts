import type { CSSProperties } from "react";

export const ORBIT_RADIUS = 280;

export const ORBIT_POSITIONS = [
  { angle: -90, placement: "top" },
  { angle: -150, placement: "top-left" },
  { angle: -30, placement: "top-right" },
  { angle: 150, placement: "bottom-left" },
  { angle: 30, placement: "bottom-right" },
  { angle: 90, placement: "bottom" },
] as const;

export type OrbitPlacement = (typeof ORBIT_POSITIONS)[number]["placement"];

export function getOrbitAnchorStyle(angle: number, radius = ORBIT_RADIUS): CSSProperties {
  const radians = (angle * Math.PI) / 180;

  return {
    left: "50%",
    top: "50%",
    transform: `translate(${Math.cos(radians) * radius}px, ${Math.sin(radians) * radius}px) translate(-50%, -50%)`,
  };
}
