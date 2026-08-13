import type { Student } from "../types/student";

type Props = {
  student: Student;
  onClose: () => void;
};

export default function InventoryModal({
  student,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          relative
          w-[1000px]
          h-[700px]
          rounded-[40px]
          bg-[#081321]
          shadow-2xl
          overflow-hidden
        "
      >
        <button
          onClick={onClose}
          className="
            absolute
            top-8
            right-8
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            bg-white/10
            text-3xl
            text-white
            transition
            hover:bg-white/20
          "
        >
          ✕
        </button>

        <div className="p-12">
          <h1 className="text-5xl font-bold text-white">
            Inventario
          </h1>

          <p className="mt-2 text-slate-400">
            {student.nombre}
          </p>

          <div className="mt-10 grid grid-cols-5 gap-6">
            {/* TODO: Permitir abrir cada categoría y equipar los cosméticos desbloqueados. */}
            <CategoryCard
              emoji="🎁"
              title="Cofres"
              count={student.chests.length}
            />

            <CategoryCard
              emoji="🐉"
              title="Mascotas"
              count={
                student.inventory.filter(
                  (i) => i.type === "pet"
                ).length
              }
            />

            <CategoryCard
              emoji="✨"
              title="Auras"
              count={
                student.inventory.filter(
                  (i) => i.type === "aura"
                ).length
              }
            />

            <CategoryCard
              emoji="🌄"
              title="Fondos"
              count={
                student.inventory.filter(
                  (i) => i.type === "background"
                ).length
              }
            />

            <CategoryCard
              emoji="🏅"
              title="Insignias"
              count={
                student.inventory.filter(
                  (i) => i.type === "badge"
                ).length
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type CardProps = {
  emoji: string;
  title: string;
  count: number;
};

function CategoryCard({
  emoji,
  title,
  count,
}: CardProps) {
  return (
    <div
      className="
        rounded-3xl
        border
        border-cyan-300/20
        bg-white/5
        p-6
        transition
        hover:border-cyan-300/40
        hover:bg-white/10
        cursor-pointer
      "
    >
      <div className="text-5xl">{emoji}</div>

      <h2 className="mt-4 text-xl font-bold text-white">
        {title}
      </h2>

      <p className="mt-2 text-3xl font-bold text-cyan-300">
        {count}
      </p>
    </div>
  );
}
