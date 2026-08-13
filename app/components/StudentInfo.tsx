type Props = {
  nombre: string;
  cristales: number;
};

export default function StudentInfo({ nombre, cristales }: Props) {
  return (
    <div className="absolute left-[4.5%] top-[5%] z-20 text-[#173d70]">
      <h2 className="text-[clamp(1.2rem,2.4vw,2.5rem)] font-bold leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(255,255,255,.45)]">
        {nombre}
      </h2>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/90 bg-gradient-to-br from-[#fffdf5] to-[#e8f5fb] px-3 py-1 shadow-[0_4px_10px_rgba(23,61,112,.16)]">
        <span className="text-[clamp(.9rem,1.6vw,1.6rem)] leading-none">💎</span>
        <span className="text-[clamp(1rem,1.75vw,1.8rem)] font-bold leading-none">{cristales}</span>
      </div>
    </div>
  );
}
