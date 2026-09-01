"use client";

import { useMemo, useState } from "react";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import type { CurriculumEvaluationRuleSnapshot, CurriculumEvaluationState } from "../types/curriculumEvaluation";
import type { Student } from "../types/student";
import {
  calculateCurriculumObservableGrade,
  createCurriculumEvaluationRuleFingerprint,
} from "../services/curriculumEvaluationService";
import { getEffectiveCurriculumPack } from "../services/curriculumAssistantService";
import type { CurriculumEvaluationOpenSession } from "../services/curriculumEvaluationRuntimeService";

type Props = {
  students: readonly Student[];
  curriculumState: CurriculumAssistantState | null;
  evaluationState: CurriculumEvaluationState | null;
  openSession: CurriculumEvaluationOpenSession | null;
  message: string;
  onClose: () => void;
};

export default function CurriculumEvaluationPanel({
  students,
  curriculumState,
  evaluationState,
  openSession,
  message,
  onClose,
}: Props) {
  const pack = curriculumState ? getEffectiveCurriculumPack(curriculumState) : null;
  const snapshots = useMemo(
    () => uniqueHistoricalRules(evaluationState),
    [evaluationState]
  );
  const subjectIds = useMemo(
    () => [...new Set(snapshots.map((rule) => rule.subjectId))],
    [snapshots]
  );
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjectIds[0] ?? "");
  const effectiveStudentId = students.some((student) => student.id === selectedStudentId)
    ? selectedStudentId
    : students[0]?.id ?? "";
  const effectiveSubjectId = subjectIds.includes(selectedSubjectId)
    ? selectedSubjectId
    : subjectIds[0] ?? "";
  const subject = pack?.subjects.find((candidate) => candidate.id === effectiveSubjectId);
  const reports = snapshots
    .filter((rule) => rule.subjectId === effectiveSubjectId)
    .map((rule) => ({
      rule,
      report: evaluationState && effectiveStudentId
        ? calculateCurriculumObservableGrade(evaluationState, effectiveStudentId, rule)
        : null,
    }));

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="evaluation-title" className="mx-auto min-h-[calc(100dvh-1.5rem)] max-w-6xl rounded-3xl bg-[#f5fbfc] p-4 shadow-2xl sm:min-h-0 sm:p-7">
        <header className="flex items-start justify-between gap-4 border-b border-cyan-900/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-cyan-700">Observación cotidiana</p>
            <h2 id="evaluation-title" className="mt-1 text-3xl font-black text-[#173d70]">Evaluación curricular</h2>
            <p className="mt-2 max-w-3xl font-semibold text-slate-600">Las cifras son propuestas sobre aspectos observables. Nunca sustituyen la valoración completa del criterio.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar evaluación" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-3xl text-[#173d70] shadow focus-visible:outline-4 focus-visible:outline-cyan-400">×</button>
        </header>

        {message && <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 font-bold text-amber-950">{message}</p>}
        {openSession && (
          <p className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 font-bold text-cyan-950">
            Hay una sesión en curso. Se incorporará a las notas al cambiar de asignatura o volver a Aula.
          </p>
        )}

        {snapshots.length === 0 ? (
          <div className="mt-8 rounded-3xl border-2 border-dashed border-cyan-200 bg-white p-8 text-center">
            <p className="text-2xl font-black text-[#173d70]">Todavía no hay sesiones cerradas</p>
            <p className="mt-2 font-semibold text-slate-600">Selecciona una asignatura durante la clase y cambia después a otra o a Aula. No hace falta configurar nada más.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[17rem_1fr]">
            <aside className="space-y-5">
              <label className="block font-black text-[#173d70]">Alumno
                <select value={effectiveStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-cyan-900/20 bg-white px-3 font-bold">
                  {students.map((student) => <option key={student.id} value={student.id}>{student.nombre}</option>)}
                </select>
              </label>
              <nav aria-label="Asignaturas con datos" className="space-y-2">
                <p className="font-black text-[#173d70]">Asignatura</p>
                {subjectIds.map((subjectId) => {
                  const item = pack?.subjects.find((candidate) => candidate.id === subjectId);
                  return <button key={subjectId} type="button" aria-pressed={subjectId === effectiveSubjectId} onClick={() => setSelectedSubjectId(subjectId)} className="min-h-12 w-full rounded-xl border border-cyan-900/10 bg-white px-3 text-left font-black text-[#173d70] aria-pressed:bg-[#173d70] aria-pressed:text-white focus-visible:outline-4 focus-visible:outline-cyan-400">{item?.name ?? "Asignatura archivada"}</button>;
                })}
              </nav>
            </aside>

            <main>
              <h3 className="text-2xl font-black text-[#173d70]">{subject?.name ?? "Asignatura"}</h3>
              <div className="mt-4 grid gap-4">
                {reports.map(({ rule, report }) => {
                  if (!report) return null;
                  const criterionCodes = rule.criterionIds.map((criterionId) =>
                    subject?.criteria.find((criterion) => criterion.id === criterionId)?.externalCode
                  ).filter(Boolean).join(", ");
                  return (
                    <article key={createCurriculumEvaluationRuleFingerprint(rule)} className="rounded-3xl border border-cyan-900/10 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black uppercase tracking-wide text-cyan-700">{criterionCodes ? `Criterio ${criterionCodes}` : "Criterio histórico"} · cobertura parcial</p>
                          <h4 className="mt-1 text-xl font-black text-[#173d70]">{rule.observableLabel}</h4>
                        </div>
                        <div className="rounded-2xl bg-[#173d70] px-5 py-3 text-center text-white">
                          <span className="block text-xs font-black uppercase tracking-wide">Nota propuesta</span>
                          <span className="block text-3xl font-black">{report.proposedGrade?.toFixed(1) ?? "—"}</span>
                        </div>
                      </div>
                      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
                        <Metric label="Sesiones" value={report.validSessionCount} />
                        <Metric label="Sin incidencias" value={report.sessionsWithoutIncidents} />
                        <Metric label="Con incidencias" value={report.sessionsWithIncidents} />
                        <Metric label="Positivos" value={report.positiveObservationCount} />
                      </dl>
                      <ul className="mt-5 space-y-1.5 text-sm font-semibold text-slate-600">
                        {report.notices.map((notice) => <li key={notice}>• {notice}</li>)}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </main>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-cyan-50 p-3"><dt className="text-xs font-black uppercase tracking-wide text-cyan-800">{label}</dt><dd className="mt-1 text-2xl font-black text-[#173d70]">{value}</dd></div>;
}

function uniqueHistoricalRules(
  state: CurriculumEvaluationState | null
): CurriculumEvaluationRuleSnapshot[] {
  if (!state) return [];
  const seen = new Set<string>();
  return state.sessions.flatMap((session) => session.rules).filter((rule) => {
    const fingerprint = createCurriculumEvaluationRuleFingerprint(rule);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
