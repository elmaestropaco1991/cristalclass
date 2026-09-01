import { ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE } from "../data/andalusianPrimaryCurriculum.generated";
import { actions } from "../data/actions";
import { SUBJECT_IDS } from "../types/subject";
import { applyAndalusianPrimaryCurriculumDefaults } from "./andalusianPrimaryCurriculumDefaultsService";
import {
  confirmCurriculumAssistantImport,
  inspectCurriculumSubject,
  previewCurriculumAssistantImport,
} from "./curriculumAssistantService";
import { createCurriculumDeterministicFingerprint } from "./curriculumFingerprintService";
import {
  ANDALUSIAN_PRIMARY_CURRICULUM_COURSES,
  ANDALUSIAN_PRIMARY_CURRICULUM_METADATA,
  getAllAndalusianPrimaryCurriculumPacks,
  getAndalusianPrimaryCurriculumPack,
} from "./andalusianPrimaryCurriculumService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";

export interface AndalusianPrimaryCurriculumDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const EXPECTED_SOURCE_FINGERPRINT = "bg28vmnnexja";

export function runAndalusianPrimaryCurriculumDeterministicChecks():
readonly AndalusianPrimaryCurriculumDeterministicCheck[] {
  const packs = getAllAndalusianPrimaryCurriculumPacks();
  const courseSix = getAndalusianPrimaryCurriculumPack(6);
  return [
    check("the remaining official areas use the same authenticated BOJA disposition", () =>
      ANDALUSIAN_PRIMARY_CURRICULUM_METADATA.cve === "00284747"
      && ANDALUSIAN_PRIMARY_CURRICULUM_METADATA.pdfPages === 208
      && ANDALUSIAN_PRIMARY_CURRICULUM_METADATA.sha256
        === "3ace14f41e8ff7a8aa509049291afc506982fca41ce848e9e2daac08c1ce927e"
    ),
    check("the complete generated Primary source has not changed", () =>
      createCurriculumDeterministicFingerprint(ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE)
        === EXPECTED_SOURCE_FINGERPRINT
    ),
    check("the Values page-break continuation is complete and literal", () => {
      const criterion = courseSix.subjects
        .find((subject) => subject.id === SUBJECT_IDS.CIVIC_VALUES)
        ?.criteria.find((candidate) => candidate.externalCode === "4.1");
      return criterion?.text.endsWith(
        "reflexión individual o dialogada sobre cuestiones éticas y cívicas."
      ) === true
        && !criterion.text.includes("emocio-");
    }),
    check("all six courses are built in pedagogical order", () =>
      packs.length === 6
      && packs.map((pack) => pack.course).join("|")
        === "1.º de Primaria|2.º de Primaria|3.º de Primaria|4.º de Primaria|5.º de Primaria|6.º de Primaria"
    ),
    check("course applicability adds Second Foreign Language and sixth-year Values only where official", () =>
      packs.map((pack) => pack.subjects.length).join(",") === "6,6,6,6,7,8"
      && packs.slice(0, 4).every((pack) =>
        !pack.subjects.some((subject) => subject.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE)
        && !pack.subjects.some((subject) => subject.id === SUBJECT_IDS.CIVIC_VALUES)
      )
      && packs[4].subjects.some((subject) => subject.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE)
      && !packs[4].subjects.some((subject) => subject.id === SUBJECT_IDS.CIVIC_VALUES)
      && courseSix.subjects.some((subject) => subject.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE)
      && courseSix.subjects.some((subject) => subject.id === SUBJECT_IDS.CIVIC_VALUES)
    ),
    check("every official subject preserves complete competences and course criteria", () => {
      const expected = [
        "LCL:10:22", "MAT:8:17", "CMN:9:23", "EFI:5:14",
        "1ª LEX:6:15", "2ª LEX:6:13", "EAR:4:11", "VCE:4:13",
      ];
      return courseSix.subjects.map((subject) =>
        `${subject.externalCode}:${subject.specificCompetences?.length}:${subject.criteria.length}`
      ).join("|") === expected.join("|");
    }),
    check("Education Artística remains one official area for the Music and Plástica contexts", () => {
      const artistic = courseSix.subjects.filter((subject) => subject.externalCode === "EAR");
      return artistic.length === 1
        && artistic[0].id === SUBJECT_IDS.ART_EDUCATION
        && artistic[0].legacySubjectId === SUBJECT_IDS.MUSIC
        && !courseSix.subjects.some((subject) => subject.id === SUBJECT_IDS.MUSIC);
    }),
    check("ordinary Second Foreign Language uses the official first-cycle elements", () => {
      const fifth = packs[4].subjects.find(
        (subject) => subject.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE
      );
      const sixth = packs[5].subjects.find(
        (subject) => subject.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE
      );
      return fifth?.criteria.length === 13
        && fifth.criteria.every((criterion) => criterion.externalCode?.endsWith(".a"))
        && fifth.basicKnowledge.every((knowledge) => knowledge.externalCode?.startsWith("LEX.1."))
        && sixth?.criteria.length === 13
        && sixth.criteria.every((criterion) => criterion.externalCode?.endsWith(".b"))
        && sixth.basicKnowledge.every((knowledge) => knowledge.externalCode?.startsWith("LEX.1."));
    }),
    check("plurilingual Second Foreign Language can use the matching third-cycle elements", () => {
      const subject = getAndalusianPrimaryCurriculumPack(6, {
        secondForeignLanguageMode: "plurilingual",
      }).subjects.find((candidate) => candidate.id === SUBJECT_IDS.SECOND_FOREIGN_LANGUAGE);
      return subject?.criteria.length === 15
        && subject.criteria.every((criterion) => criterion.externalCode?.endsWith(".b"))
        && subject.basicKnowledge.length === 24
        && subject.basicKnowledge.every((knowledge) => knowledge.externalCode?.startsWith("LEX.3."));
    }),
    check("all criterion and knowledge identities remain inside their official subject", () =>
      packs.every((pack) => pack.subjects.every((subject) => {
        const competenceIds = new Set(
          subject.specificCompetences?.map((competence) => competence.id)
        );
        const criterionIds = new Set(subject.criteria.map((criterion) => criterion.id));
        return subject.criteria.every((criterion) =>
          criterion.specificCompetenceId !== undefined
          && competenceIds.has(criterion.specificCompetenceId)
        ) && subject.basicKnowledge.every((knowledge) =>
          knowledge.criterionIds.every((criterionId) => criterionIds.has(criterionId))
        );
      }))
    ),
    check("only the four officially unrelated Mathematics knowledge items remain unlinked", () => {
      const unrelated = new Set<string>();
      packs.forEach((pack) => pack.subjects.forEach((subject) => {
        subject.basicKnowledge.forEach((knowledge) => {
          if (knowledge.criterionIds.length === 0 && knowledge.externalCode) {
            unrelated.add(knowledge.externalCode);
          }
        });
      }));
      return [...unrelated].sort().join("|")
        === ["MAT.2.A.2.6", "MAT.2.F.2.7", "MAT.3.A.4.4", "MAT.3.C.2.2"].join("|");
    }),
    check("printed LEX punctuation anomalies resolve to their referenced canonical codes", () => {
      const anomalies = ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE.source.normalizedCodePunctuation;
      const first = packs[0].subjects.find((subject) => subject.id === SUBJECT_IDS.ENGLISH);
      const sixth = packs[5].subjects.find((subject) => subject.id === SUBJECT_IDS.ENGLISH);
      return anomalies.map((item) => `${item.printed}>${item.resolvedAs}`).join("|")
        === "LEX.1.B1>LEX.1.B.1|LEX.3.A10>LEX.3.A.10"
        && first?.basicKnowledge.some((knowledge) => knowledge.externalCode === "LEX.1.B.1") === true
        && sixth?.basicKnowledge.some((knowledge) => knowledge.externalCode === "LEX.3.A.10") === true;
    }),
    check("the asymmetric official Mathematics criterion table is not completed by invention", () => {
      const third = packs[2].subjects.find((subject) => subject.id === SUBJECT_IDS.MATHEMATICS);
      const fourth = packs[3].subjects.find((subject) => subject.id === SUBJECT_IDS.MATHEMATICS);
      return third?.criteria.some((criterion) => criterion.externalCode === "2.3.a") === false
        && fourth?.criteria.some((criterion) => criterion.externalCode === "2.3.b") === true;
    }),
    check("every complete course pack passes the strict portable JSON parser", () =>
      ANDALUSIAN_PRIMARY_CURRICULUM_COURSES.every((course) =>
        parseCurriculumPackJson(
          serializeCurriculumPackToJson(
            getAndalusianPrimaryCurriculumPack(course),
            "2026-08-31T12:00:00.000Z"
          )
        ).status === "valid"
      )
    ),
    check("the complete pack follows the audited assistant import and all-subject default flow", () => {
      const instant = "2026-08-31T12:00:00.000Z";
      const parsed = parseCurriculumPackJson(
        serializeCurriculumPackToJson(getAndalusianPrimaryCurriculumPack(4), instant)
      );
      if (parsed.status !== "valid") return false;
      const preview = previewCurriculumAssistantImport(
        "primary-complete-check",
        parsed as CurriculumPackJsonValidResult
      );
      const imported = confirmCurriculumAssistantImport(
        "primary-complete-check",
        preview,
        instant
      );
      const prepared = applyAndalusianPrimaryCurriculumDefaults(imported, 4, actions, instant);
      return prepared.catalog.pack?.subjects.length === 6
        && prepared.profile?.selectedSubjectIds.length === 6
        && prepared.actionLinks.length === 21
        && prepared.profile.ordinaryTracking.rules.length === 5;
    }),
    check("officially unrelated Mathematics knowledge is an activation warning, not invented data", () => {
      const instant = "2026-08-31T12:00:00.000Z";
      const parsed = parseCurriculumPackJson(
        serializeCurriculumPackToJson(getAndalusianPrimaryCurriculumPack(4), instant)
      );
      if (parsed.status !== "valid") return false;
      const preview = previewCurriculumAssistantImport(
        "primary-warning-check",
        parsed as CurriculumPackJsonValidResult
      );
      const imported = confirmCurriculumAssistantImport(
        "primary-warning-check",
        preview,
        instant
      );
      const mathematicsId = imported.catalog.pack?.subjects.find(
        (subject) => subject.legacySubjectId === SUBJECT_IDS.MATHEMATICS
      )?.id;
      if (!mathematicsId) return false;
      const inspection = inspectCurriculumSubject(imported, mathematicsId, actions);
      return inspection.canActivate && inspection.warningMessages.length > 0;
    }),
  ];
}

function check(
  name: string,
  operation: () => boolean
): AndalusianPrimaryCurriculumDeterministicCheck {
  try {
    return { name, passed: operation() };
  } catch {
    return { name, passed: false };
  }
}
