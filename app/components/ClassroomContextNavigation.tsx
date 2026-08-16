type Props = {
  onOpenAttendance: () => void;
  onStartRandomSingle: () => void;
  onStartRandomRound: () => void;
};

export default function ClassroomContextNavigation({
  onOpenAttendance,
  onStartRandomSingle,
  onStartRandomRound,
}: Props) {
  return (
    <nav aria-label="Contextos del aula">
      <div className="fixed left-0 top-28 z-30 hidden flex-col gap-2 sm:flex">
        <AttendanceButton onOpenAttendance={onOpenAttendance} />
        <RandomSelectorButtons
          onStartRandomSingle={onStartRandomSingle}
          onStartRandomRound={onStartRandomRound}
        />
      </div>
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-2 sm:hidden">
        <AttendanceButton onOpenAttendance={onOpenAttendance} />
        <RandomSelectorButtons
          onStartRandomSingle={onStartRandomSingle}
          onStartRandomRound={onStartRandomRound}
        />
      </div>
    </nav>
  );
}

function AttendanceButton({ onOpenAttendance }: Pick<Props, "onOpenAttendance">) {
  return (
    <button
      type="button"
      onClick={onOpenAttendance}
      aria-haspopup="dialog"
      className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-r-2xl bg-[#173d70] px-4 py-3 font-black text-white shadow-lg transition hover:bg-[#21548f] active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-300 max-sm:rounded-full max-sm:px-3"
    >
      <span aria-hidden="true" className="text-xl">📋</span>
      <span>Asistencia</span>
    </button>
  );
}

function RandomSelectorButtons({
  onStartRandomSingle,
  onStartRandomRound,
}: Pick<Props, "onStartRandomSingle" | "onStartRandomRound">) {
  return (
    <div className="flex items-center gap-1.5 sm:flex-col sm:items-stretch sm:gap-1">
      <button
        type="button"
        onClick={onStartRandomSingle}
        aria-label="Elegir un alumno al azar"
        className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-r-2xl bg-cyan-600 px-5 py-3 font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-400 active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-300 max-sm:rounded-full max-sm:px-4"
      >
        <span aria-hidden="true" className="text-xl">🎯</span>
        <span>Azar</span>
      </button>
      <button
        type="button"
        onClick={onStartRandomRound}
        aria-label="Iniciar o continuar una ronda aleatoria"
        className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-r-xl border border-cyan-100/70 bg-[#173d70]/90 px-3 py-2 text-sm font-black text-white shadow-md transition hover:bg-[#21548f] active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-300 max-sm:min-h-12 max-sm:rounded-full max-sm:px-3"
      >
        <span aria-hidden="true">↻</span>
        <span>Ronda</span>
      </button>
    </div>
  );
}
