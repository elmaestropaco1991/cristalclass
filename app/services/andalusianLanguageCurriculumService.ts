import { ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE } from "../data/andalusianLanguageCurriculum.generated";
import type { CurriculumPack, CurriculumSubject } from "../types/curriculum";
import { SUBJECT_IDS } from "../types/subject";

export const ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES = [1, 2, 3, 4, 5, 6] as const;
export type AndalusianLanguageCurriculumCourse =
  (typeof ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES)[number];

const SOURCE_VERSION = "boja-2023-104-cve-00284747";
const PUBLICATION_INSTANT = "2023-06-02T00:00:00.000Z";

export const ANDALUSIAN_LANGUAGE_CURRICULUM_METADATA = Object.freeze({
  ...ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.source,
  sourceVersion: SOURCE_VERSION,
});

export function isAndalusianLanguageCurriculumCourse(
  value: number
): value is AndalusianLanguageCurriculumCourse {
  return ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES.includes(
    value as AndalusianLanguageCurriculumCourse
  );
}

export function getAndalusianLanguageCurriculumPack(
  course: AndalusianLanguageCurriculumCourse
): CurriculumPack {
  const cycle = course <= 2 ? 1 : course <= 4 ? 2 : 3;
  const criteriaSource = getCriteriaSource(course);
  const knowledgeSource = getKnowledgeSource(cycle);
  const competenceIds = new Map(
    ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.competences.map((competence) => [
      competence.code,
      competenceId(competence.code),
    ])
  );
  const criterionIds = new Map(
    criteriaSource.map((criterion) => [criterion.code, criterionId(course, criterion.code)])
  );
  const knowledgeCriterionIds = new Map<string, string[]>();
  for (const criterion of criteriaSource) {
    const id = criterionIds.get(criterion.code)!;
    for (const knowledgeCode of criterion.knowledgeCodes) {
      const ids = knowledgeCriterionIds.get(knowledgeCode) ?? [];
      if (!ids.includes(id)) ids.push(id);
      knowledgeCriterionIds.set(knowledgeCode, ids);
    }
  }

  const subject: CurriculumSubject = {
    id: SUBJECT_IDS.LANGUAGE,
    externalCode: "LCL",
    legacySubjectId: SUBJECT_IDS.LANGUAGE,
    name: "Lengua Castellana y Literatura",
    specificCompetences: ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.competences.map(
      (competence) => ({
        id: competenceIds.get(competence.code)!,
        externalCode: competence.code,
        sourceVersion: SOURCE_VERSION,
        text: competence.text,
      })
    ),
    criteria: criteriaSource.map((criterion) => ({
      id: criterionIds.get(criterion.code)!,
      externalCode: criterion.code,
      specificCompetenceId: competenceIds.get(criterion.competenceCode)!,
      sourceVersion: SOURCE_VERSION,
      text: criterion.text,
    })),
    basicKnowledge: knowledgeSource.map((knowledge) => ({
      id: knowledgeId(knowledge.code),
      externalCode: knowledge.code,
      sourceVersion: SOURCE_VERSION,
      text: knowledge.text,
      criterionIds: knowledgeCriterionIds.get(knowledge.code) ?? [],
    })),
  };

  return {
    id: `andalusia-primary-language-course-${course}`,
    schemaVersion: 2,
    packageVersion: `${SOURCE_VERSION}-sha256-${ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.source.sha256}`,
    name: `Andalucía · Lengua Castellana y Literatura · ${course}.º de Primaria`,
    region: "Andalucía",
    scope: "Educación Primaria",
    stage: "Educación Primaria",
    course: `${course}.º de Primaria`,
    provenance: {
      kind: "external",
      sourceId: `CVE:${ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.source.cve}`,
      sourceVersion: SOURCE_VERSION,
      label: ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.source.publication,
    },
    createdAt: PUBLICATION_INSTANT,
    updatedAt: PUBLICATION_INSTANT,
    subjects: [subject],
  };
}

export function getAllAndalusianLanguageCurriculumPacks(): readonly CurriculumPack[] {
  return ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES.map(
    getAndalusianLanguageCurriculumPack
  );
}

function competenceId(code: string): string {
  return `andalusia-primary-language-competence-${code}`;
}

function criterionId(course: number, code: string): string {
  return `andalusia-primary-language-course-${course}-criterion-${code}`;
}

function knowledgeId(code: string): string {
  return `andalusia-primary-language-knowledge-${code}`;
}

function getCriteriaSource(course: AndalusianLanguageCurriculumCourse) {
  switch (course) {
    case 1: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["1"];
    case 2: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["2"];
    case 3: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["3"];
    case 4: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["4"];
    case 5: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["5"];
    case 6: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.criteriaByCourse["6"];
  }
}

function getKnowledgeSource(cycle: 1 | 2 | 3) {
  switch (cycle) {
    case 1: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.knowledgeByCycle["1"];
    case 2: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.knowledgeByCycle["2"];
    case 3: return ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE.knowledgeByCycle["3"];
  }
}
