type Props = {
  texto: string;
  color: string;
  onClick?: () => void;
};

export default function ActionButton({
  texto,
  color,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl py-5 text-2xl font-bold text-white transition hover:scale-105 ${color}`}
    >
      {texto}
    </button>
  );
}