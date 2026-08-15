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
  subject(SUBJECT_IDS.ENGLISH, "Inglés", "Inglés", "subject-english", 40, "academic"),
  subject(SUBJECT_IDS.MUSIC, "Música", "Música", "subject-music", 50, "academic"),
  subject(
    SUBJECT_IDS.ART_EDUCATION,
    "Educación Artística",
    "Artística",
    "subject-art-education",
    60,
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
