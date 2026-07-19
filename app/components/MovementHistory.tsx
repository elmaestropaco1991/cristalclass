import type { Movement } from "../types/movement";

type Props = {
  movements: Movement[];
};

export default function MovementHistory({ movements }: Props) {
  if (movements.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-bold mb-2">
          Historial de movimientos
        </h2>

        <p className="text-gray-500">
          Todavía no hay movimientos.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-4 shadow">
      <h2 className="text-lg font-bold mb-4">
        Historial de movimientos
      </h2>

      <div className="space-y-2">
        {[...movements]
          .sort(
            (a, b) =>
              b.date.getTime() - a.date.getTime()
          )
          .map((movement) => (
            <div
              key={movement.id}
              className="flex justify-between border-b pb-2"
            >
              <div>
                <p className="font-medium">
                  {movement.title}
                </p>

                <p className="text-sm text-gray-500">
                  {movement.date.toLocaleString()}
                </p>
              </div>

              <span
                className={
                  movement.points >= 0
                    ? "font-bold text-green-600"
                    : "font-bold text-red-600"
                }
              >
                {movement.points > 0 ? "+" : ""}
                {movement.points}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}