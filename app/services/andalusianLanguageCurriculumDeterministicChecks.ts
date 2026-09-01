import { ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE } from "../data/andalusianLanguageCurriculum.generated";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import {
  ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES,
  ANDALUSIAN_LANGUAGE_CURRICULUM_METADATA,
  getAllAndalusianLanguageCurriculumPacks,
  getAndalusianLanguageCurriculumPack,
} from "./andalusianLanguageCurriculumService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
} from "./curriculumPackJsonService";

export interface AndalusianLanguageCurriculumDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const EXPECTED_SOURCE_FINGERPRINT = "13ll46qs6h6t4";

export function runAndalusianLanguageCurriculumDeterministicChecks():
readonly AndalusianLanguageCurriculumDeterministicCheck[] {
  const packs = getAllAndalusianLanguageCurriculumPacks();
  const subjects = packs.map((pack) => pack.subjects[0]);
  return [
    check("the authenticated BOJA identity and complete SHA-256 are pinned", () =>
      ANDALUSIAN_LANGUAGE_CURRICULUM_METADATA.cve === "00284747"
      && ANDALUSIAN_LANGUAGE_CURRICULUM_METADATA.pdfPages === 208
      && ANDALUSIAN_LANGUAGE_CURRICULUM_METADATA.sha256
        === "3ace14f41e8ff7a8aa509049291afc506982fca41ce848e9e2daac08c1ce927e"
    ),
    check("the complete extracted source has not changed", () =>
      createCurriculumDeterministicFingerprint(ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE)
        === EXPECTED_SOURCE_FINGERPRINT
    ),
    check("all six Primary courses are available in pedagogical order", () =>
      packs.length === 6
      && packs.map((pack) => pack.course).join("|")
        === "1.º de Primaria|2.º de Primaria|3.º de Primaria|4.º de Primaria|5.º de Primaria|6.º de Primaria"
    ),
    check("every course preserves the ten official specific competences", () =>
      subjects.every((subject) => subject.specificCompetences?.length === 10)
      && subjects.every((subject) =>
        subject.specificCompetences?.map((item) => item.externalCode).join(",")
          === "1,2,3,4,5,6,7,8,9,10"
      )
    ),
    check("every course preserves its twenty-two official criteria", () =>
      subjects.every((subject) => subject.criteria.length === 22)
      && subjects.every((subject, index) =>
        subject.criteria.every((criterion) =>
          criterion.externalCode?.endsWith(index % 2 === 0 ? ".a" : ".b")
        )
      )
    ),
    check("cycle knowledge counts are complete and shared only inside their cycle", () =>
      subjects.map((subject) => subject.basicKnowledge.length).join(",")
        === "28,28,30,30,32,32"
    ),
    check("all official identities and external codes are unique inside a pack", () =>
      subjects.every((subject) => {
        const entities = [
          ...(subject.specificCompetences ?? []),
          ...subject.criteria,
          ...subject.basicKnowledge,
        ];
        return new Set(entities.map((item) => item.id)).size === entities.length
          && new Set(subject.criteria.map((item) => item.externalCode)).size
            === subject.criteria.length
          && new Set(subject.basicKnowledge.map((item) => item.externalCode)).size
            === subject.basicKnowledge.length;
      })
    ),
    check("every criterion belongs to one existing competence", () =>
      subjects.every((subject) => {
        const ids = new Set(subject.specificCompetences?.map((item) => item.id));
        return subject.criteria.every((criterion) =>
          criterion.specificCompetenceId !== undefined
          && ids.has(criterion.specificCompetenceId)
        );
      })
    ),
    check("every knowledge item retains at least one official criterion relation", () =>
      subjects.every((subject) => {
        const ids = new Set(subject.criteria.map((criterion) => criterion.id));
        return subject.basicKnowledge.every((knowledge) =>
          knowledge.criterionIds.length > 0
          && knowledge.criterionIds.every((id) => ids.has(id))
        );
      })
    ),
    check("criterion 3.2 progresses through all courses with the official cycle knowledge", () => {
      const expectedKnowledge = [
        "LCL.1.B.3.1", "LCL.1.B.3.1", "LCL.2.B.3.1",
        "LCL.2.B.3.1", "LCL.3.B.3.1", "LCL.3.B.3.1",
      ];
      return subjects.every((subject, index) => {
        const criterion = subject.criteria.find((item) => item.externalCode === `3.2.${index % 2 === 0 ? "a" : "b"}`);
        const knowledge = subject.basicKnowledge.find((item) =>
          item.externalCode === expectedKnowledge[index]
        );
        return criterion !== undefined && knowledge?.criterionIds.includes(criterion.id) === true;
      });
    }),
    check("official typographical anomalies are preserved rather than silently corrected", () =>
      getAndalusianLanguageCurriculumPack(4).subjects[0].basicKnowledge
        .find((item) => item.externalCode === "LCL.2.C.8")?.text.includes("andaluza..") === true
      && getAndalusianLanguageCurriculumPack(6).subjects[0].basicKnowledge
        .find((item) => item.externalCode === "LCL.3.C.9")?.text.includes("andaluzar") === true
    ),
    check("every generated pack passes the strict portable JSON parser", () =>
      ANDALUSIAN_LANGUAGE_CURRICULUM_COURSES.every((course) =>
        parseCurriculumPackJson(
          serializeCurriculumPackToJson(
            getAndalusianLanguageCurriculumPack(course),
            "2026-08-31T12:00:00.000Z"
          )
        ).status === "valid"
      )
    ),
  ];
}

function check(
  name: string,
  operation: () => boolean
): AndalusianLanguageCurriculumDeterministicCheck {
  try {
    return { name, passed: operation() };
  } catch {
    return { name, passed: false };
  }
}
