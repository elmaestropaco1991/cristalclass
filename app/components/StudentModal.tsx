import Image from "next/image";
import ActionButton from "./ActionButton";
import type { Student } from "../types/student";
import { actions } from "../data/actions";

type Props = {
  alumno: Student;
  onCerrar: () => void;
  onAccion: (actionId: string) => void;
};

export default function StudentModal({
  alumno,
  onCerrar,
  onAccion,
}: Props) {
  const positivas = actions.filter(
    (a) => a.type === "positive"
  );

  const negativas = actions.filter(
    (a) => a.type === "negative"
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-3xl p-12 w-[700px] shadow-2xl relative text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCerrar}
          className="absolute top-5 right-5 text-3xl font-bold text-gray-500 hover:text-black"
        >
          ✕
        </button>

        <Image
          src={alumno.avatar}
          alt={alumno.nombre}
          width={300}
          height={300}
          className="rounded-full border-8 border-blue-500 mx-auto"
        />

        <h2 className="text-5xl font-bold mt-8">
          {alumno.nombre}
        </h2>

        <p className="text-xl text-gray-500 mt-2">
          {alumno.apellidos}
        </p>

        <p className="text-4xl font-bold text-blue-600 mt-4 mb-10">
          💎 {alumno.cristales}
        </p>

        <div className="space-y-3">

          {positivas.map((action) => (
            <ActionButton
              key={action.id}
              texto={`${action.icon} ${action.title} (${action.points > 0 ? "+" : ""}${action.points})`}
              color="bg-green-500 hover:bg-green-600"
              onClick={() => onAccion(action.id)}
            />
          ))}

          <div className="h-4" />

          {negativas.map((action) => (
            <ActionButton
              key={action.id}
              texto={`${action.icon} ${action.title} (${action.points})`}
              color="bg-red-500 hover:bg-red-600"
              onClick={() => onAccion(action.id)}
            />
          ))}

        </div>
      </div>
    </div>
  );
}