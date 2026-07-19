type Props = {
  onClick: () => void;
};

export default function AddStudentButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl w-16 h-16 text-4xl font-bold shadow-lg transition hover:scale-105"
    >
      +
    </button>
  );
}