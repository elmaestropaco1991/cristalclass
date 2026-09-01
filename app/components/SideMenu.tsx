type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onGestionarAlumnos: () => void;
  onOpenEvaluation: () => void;
  onOpenSettings: () => void;
  guardianScale: number;
  onGuardianScaleChange: (guardianScale: number) => void;
  onGuardianScaleReset: () => void;
};

export default function SideMenu({
  abierto,
  onCerrar,
  onGestionarAlumnos,
  onOpenEvaluation,
  onOpenSettings,
  guardianScale,
  onGuardianScaleChange,
  onGuardianScaleReset,
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

          {/* TODO: Conectar la gestión de clases cuando exista su vista. */}
          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            🏫 Gestionar clases
          </button>

          {/* TODO: Conectar el flujo de recompensas con cofres e inventario. */}
          <button className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg">
            🎁 Recompensas
          </button>

          <button
            onClick={() => {
              onCerrar();
              onOpenEvaluation();
            }}
            className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg font-semibold focus-visible:outline-4 focus-visible:outline-cyan-400"
          >
            📊 Evaluación
          </button>

          <button
            onClick={() => {
              onCerrar();
              onOpenSettings();
            }}
            className="text-left p-4 rounded-xl hover:bg-slate-100 text-lg focus-visible:outline-4 focus-visible:outline-cyan-400"
          >
            ⚙️ Configuración
          </button>

          <section aria-labelledby="classroom-appearance-title" className="mt-3 rounded-2xl border border-cyan-900/10 bg-cyan-50/80 p-4">
            <h3 id="classroom-appearance-title" className="text-base font-black text-[#173d70]">
              Apariencia del aula
            </h3>
            <div className="mt-4 flex items-center justify-between gap-3">
              <label htmlFor="guardian-scale" className="text-sm font-bold text-slate-700">
                Tamaño de los guardianes
              </label>
              <output htmlFor="guardian-scale" className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-cyan-800 shadow-sm">
                {guardianScale}%
              </output>
            </div>
            <input
              id="guardian-scale"
              type="range"
              min="50"
              max="140"
              step="10"
              value={guardianScale}
              onChange={(event) => onGuardianScaleChange(Number(event.target.value))}
              aria-valuetext={`${guardianScale}%`}
              className="mt-3 h-3 w-full cursor-pointer accent-cyan-700"
            />
            <div className="mt-1 flex justify-between text-xs font-bold text-slate-500">
              <span>Vista general</span>
              <span>Grande</span>
            </div>
            <button
              type="button"
              onClick={onGuardianScaleReset}
              disabled={guardianScale === 100}
              className="mt-4 rounded-xl border border-cyan-800/20 bg-white px-3 py-2 text-sm font-black text-[#173d70] transition hover:bg-cyan-100 disabled:cursor-default disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-cyan-500"
            >
              Restablecer
            </button>
          </section>

        </nav>
      </aside>
    </>
  );
}
