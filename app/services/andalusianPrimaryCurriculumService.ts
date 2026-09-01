import { ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE } from "../data/andalusianPrimaryCurriculum.generated";
import type { CurriculumPack, CurriculumSubject } from "../types/curriculum";
import { SUBJECT_IDS } from "../types/subject";
import {
  getAndalusianLanguageCurriculumPack,
  type AndalusianLanguageCurriculumCourse,
} from "./andalusianLanguageCurriculumService";

export const ANDALUSIAN_PRIMARY_CURRICULUM_COURSES = [1, 2, 3, 4, 5, 6] as const;
export type AndalusianPrimaryCurriculumCourse = AndalusianLanguageCurriculumCourse;
export type SecondForeignLanguageCurriculumMode = "standard" | "plurilingual";

export interface AndalusianPrimaryCurriculumOptions {
  /** Ordinary centres use first-cycle LEX elements; plurilingual centres use the matching cycle. */
  readonly secondForeignLanguageMode?: SecondForeignLanguageCurriculumMode;
}

const SOURCE_VERSION = "boja-2023-104-cve-00284747";
const PUBLICATION_INSTANT = "2023-06-02T00:00:00.000Z";

type SourceCriterion = {
  readonly code: string;
  readonly competenceCode: string;
  readonly text: string;
  readonly knowledgeCodes: readonly string[];
};

type SourceArea = {
  readonly code: string;
  readonly name: string;
  readonly competences: readonly {
    readonly code: string;
    readonly text: string;
  }[];
  readonly knowledgeByCycle: Readonly<Record<string, readonly {
    readonly code: string;
    readonly text: string;
  }[]>>;
  readonly criteriaByCourse: Readonly<Record<string, readonly SourceCriterion[]>>;
};

type SubjectDefinition = {
  readonly source: SourceArea;
  readonly id: string;
  readonly name: string;
  readonly externalCode: string;
  readonly legacySubjectId?: string;
  readonly sourceCourse?: number;
  readonly sourceCycle?: number;
  readonly identity: string;
};

export const ANDALUSIAN_PRIMARY_CURRICULUM_METADATA = Object.freeze({
  ...ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.source,
  sourceVersion: SOURCE_VERSION,
});

export function isAndalusianPrimaryCurriculumCourse(
  value: number
): value is AndalusianPrimaryCurriculumCourse {
  return ANDALUSIAN_PRIMARY_CURRICULUM_COURSES.includes(
    value as AndalusianPrimaryCurriculumCourse
  );
}

export function getAndalusianPrimaryCurriculumPack(
  course: AndalusianPrimaryCurriculumCourse,
  options: AndalusianPrimaryCurriculumOptions = {}
): CurriculumPack {
  const secondForeignLanguageMode = options.secondForeignLanguageMode ?? "standard";
  const languageSubject = getAndalusianLanguageCurriculumPack(course).subjects[0];
  const subjects: CurriculumSubject[] = [
    languageSubject,
    createSubject(course, {
      source: area("MAT"),
      id: SUBJECT_IDS.MATHEMATICS,
      name: "Matemáticas",
      externalCode: "MAT",
      legacySubjectId: SUBJECT_IDS.MATHEMATICS,
      identity: "mathematics",
    }),
    createSubject(course, {
      source: area("CMN"),
      id: SUBJECT_IDS.ENVIRONMENTAL_STUDIES,
      name: "Conocimiento del Medio Natural, Social y Cultural",
      externalCode: "CMN",
      legacySubjectId: SUBJECT_IDS.ENVIRONMENTAL_STUDIES,
      identity: "environmental-studies",
    }),
    createSubject(course, {
      source: area("EFI"),
      id: SUBJECT_IDS.PHYSICAL_EDUCATION,
      name: "Educación Física",
      externalCode: "EFI",
      legacySubjectId: SUBJECT_IDS.PHYSICAL_EDUCATION,
      identity: "physical-education",
    }),
    createSubject(course, {
      source: area("LEX"),
      id: SUBJECT_IDS.ENGLISH,
      name: "Primera Lengua Extranjera",
      externalCode: "1ª LEX",
      legacySubjectId: SUBJECT_IDS.ENGLISH,
      identity: "first-foreign-language",
    }),
  ];

  if (course >= 5) {
    const sourceCourse = secondForeignLanguageMode === "standard" ? course - 4 : course;
    const sourceCycle = secondForeignLanguageMode === "standard" ? 1 : 3;
    subjects.push(createSubject(course, {
      source: area("LEX"),
      id: SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE,
      name: "Segunda Lengua Extranjera",
      externalCode: "2ª LEX",
      legacySubjectId: SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE,
      sourceCourse,
      sourceCycle,
      identity: `second-foreign-language-${secondForeignLanguageMode}`,
    }));
  }

  subjects.push(createSubject(course, {
    source: area("EAR"),
    id: SUBJECT_IDS.ART_EDUCATION,
    name: "Educación Artística",
    externalCode: "EAR",
    // One official area serves the two separate daily contexts: Plástica and Música.
    legacySubjectId: SUBJECT_IDS.MUSIC,
    identity: "artistic-education",
  }));

  if (course === 6) {
    subjects.push(createSubject(course, {
      source: area("VCE"),
      id: SUBJECT_IDS.CIVIC_VALUES,
      name: "Educación en Valores Cívicos y Éticos",
      externalCode: "VCE",
      legacySubjectId: SUBJECT_IDS.CIVIC_VALUES,
      sourceCourse: 6,
      sourceCycle: 3,
      identity: "civic-values",
    }));
  }

  const modeSuffix = course >= 5 ? `-${secondForeignLanguageMode}` : "";
  return {
    id: `andalusia-primary-course-${course}${modeSuffix}`,
    schemaVersion: 2,
    packageVersion: `${SOURCE_VERSION}-sha256-${ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.source.sha256}${modeSuffix}`,
    name: `Andalucía · ${course}.º de Educación Primaria`,
    region: "Andalucía",
    scope: "Educación Primaria",
    stage: "Educación Primaria",
    course: `${course}.º de Primaria`,
    provenance: {
      kind: "external",
      sourceId: `CVE:${ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.source.cve}`,
      sourceVersion: SOURCE_VERSION,
      label: ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.source.publication,
    },
    createdAt: PUBLICATION_INSTANT,
    updatedAt: PUBLICATION_INSTANT,
    subjects,
  };
}

export function getAllAndalusianPrimaryCurriculumPacks(): readonly CurriculumPack[] {
  return ANDALUSIAN_PRIMARY_CURRICULUM_COURSES.map((course) =>
    getAndalusianPrimaryCurriculumPack(course)
  );
}

function createSubject(
  requestedCourse: AndalusianPrimaryCurriculumCourse,
  definition: SubjectDefinition
): CurriculumSubject {
  const sourceCourse = definition.sourceCourse ?? requestedCourse;
  const sourceCycle = definition.sourceCycle ?? cycleForCourse(sourceCourse);
  const criteriaSource = definition.source.criteriaByCourse[String(sourceCourse)];
  const knowledgeSource = definition.source.knowledgeByCycle[String(sourceCycle)];
  if (!criteriaSource || !knowledgeSource) {
    throw new Error(`El currículo ${definition.externalCode} no está disponible para este curso.`);
  }
  const competenceIds = new Map(
    definition.source.competences.map((competence) => [
      competence.code,
      entityId(definition.identity, "competence", competence.code),
    ])
  );
  const criterionIds = new Map(
    criteriaSource.map((criterion) => [
      criterion.code,
      entityId(definition.identity, `course-${requestedCourse}-criterion`, criterion.code),
    ])
  );
  const knowledgeCriterionIds = new Map<string, string[]>();
  criteriaSource.forEach((criterion) => {
    const criterionId = criterionIds.get(criterion.code)!;
    criterion.knowledgeCodes.forEach((knowledgeCode) => {
      const ids = knowledgeCriterionIds.get(knowledgeCode) ?? [];
      if (!ids.includes(criterionId)) ids.push(criterionId);
      knowledgeCriterionIds.set(knowledgeCode, ids);
    });
  });

  return {
    id: definition.id,
    externalCode: definition.externalCode,
    legacySubjectId: definition.legacySubjectId,
    name: definition.name,
    specificCompetences: definition.source.competences.map((competence) => ({
      id: competenceIds.get(competence.code)!,
      externalCode: competence.code,
      sourceVersion: SOURCE_VERSION,
      text: competence.text,
    })),
    criteria: criteriaSource.map((criterion) => ({
      id: criterionIds.get(criterion.code)!,
      externalCode: criterion.code,
      specificCompetenceId: competenceIds.get(criterion.competenceCode)!,
      sourceVersion: SOURCE_VERSION,
      text: criterion.text,
    })),
    basicKnowledge: knowledgeSource.map((knowledge) => ({
      id: entityId(definition.identity, "knowledge", knowledge.code),
      externalCode: knowledge.code,
      sourceVersion: SOURCE_VERSION,
      text: knowledge.text,
      criterionIds: knowledgeCriterionIds.get(knowledge.code) ?? [],
    })),
  };
}

function area(code: keyof typeof ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.areas): SourceArea {
  return ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.areas[code] as unknown as SourceArea;
}

function cycleForCourse(course: number): 1 | 2 | 3 {
  return course <= 2 ? 1 : course <= 4 ? 2 : 3;
}

function entityId(identity: string, kind: string, code: string): string {
  return `andalusia-primary-${identity}-${kind}-${code}`;
}
