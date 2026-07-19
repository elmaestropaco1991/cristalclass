type Props = {
  onClick: () => void;
};

export default function MenuButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 rounded-xl bg-slate-800 text-white text-3xl hover:bg-slate-700 transition"
    >
      ☰
    </button>
  );
}