import type { CurriculumSubject } from "../types/curriculum";

type Props = {
  subjects: readonly CurriculumSubject[];
  selectedSubjectId: string | null;
  onSelect: (subjectId: string | null) => void;
};

export default function CurriculumSubjectTabs({ subjects, selectedSubjectId, onSelect }: Props) {
  if (subjects.length === 0) return null;
  return (
    <nav aria-label="Asignaturas activas" className="mt-3 overflow-x-auto pb-1">
      <div role="tablist" className="flex min-w-max gap-2 rounded-2xl border border-cyan-900/10 bg-white/65 p-2 shadow-sm">
        <Tab active={selectedSubjectId === null} label="Aula" onClick={() => onSelect(null)} />
        {subjects.map((subject) => (
          <Tab
            key={subject.id}
            active={selectedSubjectId === subject.id}
            label={subject.name}
            onClick={() => onSelect(subject.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="min-h-12 rounded-xl px-5 py-2 text-base font-black text-[#173d70] transition aria-selected:bg-[#173d70] aria-selected:text-white focus-visible:outline-4 focus-visible:outline-cyan-400"
    >
      {label}
    </button>
  );
}
