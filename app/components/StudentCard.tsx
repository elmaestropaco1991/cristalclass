import Image from "next/image";
import type { Student } from "../types/student";

type Props = {
  alumno: Student;
  onClick: () => void;
};

export default function StudentCard({ alumno, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-lg p-6 hover:scale-105 transition"
    >
      <div className="flex flex-col items-center">
        <Image
          src={alumno.avatar}
          alt={alumno.nombre}
          width={90}
          height={90}
          className="rounded-full border-4 border-blue-500"
        />

        <p className="mt-4 text-xl font-bold">
          {alumno.nombre}
        </p>

        <p className="text-sm text-gray-500">
          {alumno.apellidos}
        </p>

        <p className="text-blue-600 font-bold mt-2">
          💎 {alumno.cristales}
        </p>
      </div>
    </button>
  );
}