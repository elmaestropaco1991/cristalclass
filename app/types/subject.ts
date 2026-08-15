export const SUBJECT_IDS = {
  GENERAL: "general",
  LANGUAGE: "spanish-language",
  MATHEMATICS: "mathematics",
  ENVIRONMENTAL_STUDIES: "environmental-studies",
  ENGLISH: "english",
  MUSIC: "music",
  ART_EDUCATION: "art-education",
} as const;

export type SubjectId = (typeof SUBJECT_IDS)[keyof typeof SUBJECT_IDS];

export type SubjectContextKind = "general" | "academic";

/** Stable, UI-agnostic definition of a subject context. */
export interface SubjectDefinition {
  readonly id: SubjectId;
  readonly name: string;
  readonly shortName: string;
  readonly iconId: string;
  readonly order: number;
  readonly contextKind: SubjectContextKind;
}

export const GENERAL_SUBJECT_ID: SubjectId = SUBJECT_IDS.GENERAL;
