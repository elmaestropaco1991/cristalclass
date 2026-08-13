type Props = {
  soundEnabled: boolean;
  onToggle: () => void;
};

export default function SoundToggleButton({ soundEnabled, onToggle }: Props) {
  const label = soundEnabled ? "Silenciar sonidos" : "Activar sonidos";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={soundEnabled}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition active:scale-[.97] focus-visible:outline-4 focus-visible:outline-cyan-400"
    >
      {soundEnabled ? <SpeakerIcon /> : <MutedSpeakerIcon />}
    </button>
  );
}

function SpeakerIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" /></svg>;
}

function MutedSpeakerIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="m16 10 5 5m0-5-5 5" /></svg>;
}
