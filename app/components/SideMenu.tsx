type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onGestionarAlumnos: () => void;
};

export default function SideMenu({
  abierto,
  onCerrar,
  onGestionarAlumnos,
}: Props) {
  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onCerrar}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transition-transform duration-300 ${
          abierto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Menú</h2>

          <button
            onClick={onCerrar}
            className="text-3xl hover:text-red-500"
          >
            ✕
          </button>
        </div>

        <nav className="p-4 flex flex-col gap-3">

          <button
            onClick={() => {
              onCerrar();
              onGestionarAlumnos();
            }}
            className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg font-semibold"
          >
            👥 Gestionar alumnos
          </button>

          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            🏫 Gestionar clases
          </button>

          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            🎁 Recompensas
          </button>

          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            📊 Estadísticas
          </button>

          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            ⚙️ Configuración
          </button>

        </nav>
      </aside>
    </>
  );
}