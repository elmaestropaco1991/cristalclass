type Props = {
  onOpenAttendance: () => void;
};

export default function ClassroomContextNavigation({ onOpenAttendance }: Props) {
  return (
    <nav aria-label="Contextos del aula">
      <div className="fixed left-0 top-28 z-30 hidden overflow-hidden rounded-r-2xl sm:block">
        <AttendanceButton onOpenAttendance={onOpenAttendance} />
      </div>
      <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-full sm:hidden">
        <AttendanceButton onOpenAttendance={onOpenAttendance} />
      </div>
    </nav>
  );
}

function AttendanceButton({ onOpenAttendance }: Props) {
  return (
    <button
      type="button"
      onClick={onOpenAttendance}
      aria-haspopup="dialog"
      className="flex min-h-12 items-center justify-center gap-2 bg-[#173d70] px-4 py-3 font-black text-white shadow-lg transition hover:bg-[#21548f] active:scale-[.98] motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-cyan-300"
    >
      <span aria-hidden="true" className="text-xl">📋</span>
      <span>Asistencia</span>
    </button>
  );
}
