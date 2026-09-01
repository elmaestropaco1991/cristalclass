import { SUBJECT_IDS, type SubjectDefinition } from "../types/subject";

/** Initial subject catalog. Identifiers are persistence keys, not display text. */
export const SUBJECT_CATALOG = Object.freeze([
  subject(SUBJECT_IDS.GENERAL, "General", "General", "subject-general", 0, "general"),
  subject(SUBJECT_IDS.LANGUAGE, "Lengua", "Lengua", "subject-language", 10, "academic"),
  subject(SUBJECT_IDS.MATHEMATICS, "Matemáticas", "Mates", "subject-mathematics", 20, "academic"),
  subject(
    SUBJECT_IDS.ENVIRONMENTAL_STUDIES,
    "Conocimiento del Medio",
    "Conocimiento",
    "subject-environmental-studies",
    30,
    "academic"
  ),
  subject(
    SUBJECT_IDS.PHYSICAL_EDUCATION,
    "Educación Física",
    "E. Física",
    "subject-physical-education",
    40,
    "academic"
  ),
  subject(SUBJECT_IDS.ENGLISH, "Inglés", "Inglés", "subject-english", 50, "academic"),
  subject(
    SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE,
    "2.ª Lengua Extranjera",
    "2.ª Lengua",
    "subject-second-foreign-language",
    60,
    "academic"
  ),
  subject(SUBJECT_IDS.MUSIC, "Música", "Música", "subject-music", 70, "academic"),
  subject(
    SUBJECT_IDS.ART_EDUCATION,
    "Plástica",
    "Plástica",
    "subject-art-education",
    80,
    "academic"
  ),
  subject(
    SUBJECT_IDS.CIVIC_VALUES,
    "Valores Cívicos y Éticos",
    "Valores",
    "subject-civic-values",
    90,
    "academic"
  ),
  subject(
    SUBJECT_IDS.RELIGION,
    "Religión",
    "Religión",
    "subject-religion",
    100,
    "academic"
  ),
  subject(
    SUBJECT_IDS.EDUCATIONAL_ATTENTION,
    "Atención Educativa",
    "Atención",
    "subject-educational-attention",
    110,
    "academic"
  ),
] satisfies readonly SubjectDefinition[]);

function subject(
  id: SubjectDefinition["id"],
  name: string,
  shortName: string,
  iconId: string,
  order: number,
  contextKind: SubjectDefinition["contextKind"]
): Readonly<SubjectDefinition> {
  return Object.freeze({ id, name, shortName, iconId, order, contextKind });
}
