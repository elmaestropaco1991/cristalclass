import { getOrbitAnchorStyle, ORBIT_POSITIONS } from "./orbitGeometry";

export default function OrbitRing() {
  return (
    <>
      <div className="absolute h-[560px] w-[560px] rounded-full border-2 border-white/90 shadow-[0_0_18px_rgba(255,255,255,.9),0_0_42px_rgba(78,188,231,.32),inset_0_0_16px_rgba(255,255,255,.4)]" />
      <div className="absolute h-[610px] w-[610px] rounded-full border border-sky-100/45 [background-image:repeating-conic-gradient(from_0deg,rgba(255,255,255,.28)_0deg_1deg,transparent_1deg_8deg)] opacity-50" />
      <div className="absolute h-[510px] w-[510px] rounded-full border border-cyan-50/80 shadow-[inset_0_0_22px_rgba(190,242,255,.32)]" />

      {ORBIT_POSITIONS.map((position) => (
        <div
          key={position.angle}
          className="absolute h-6 w-6 rounded-full border-4 border-white bg-gradient-to-br from-white via-cyan-50 to-sky-200 shadow-[0_0_10px_rgba(255,255,255,.95),0_0_20px_rgba(79,198,241,.62),inset_0_1px_2px_rgba(255,255,255,.95)]"
          style={getOrbitAnchorStyle(position.angle)}
        />
      ))}
    </>
  );
}
