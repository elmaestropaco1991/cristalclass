import { actions } from "../data/actions";
import { LANGUAGE_ACTION_IDS } from "../data/languageActions";
import { PRIMARY_CURRICULUM_ACTION_IDS } from "../data/primaryCurriculumActions";
import { SUBJECT_IDS } from "../types/subject";
import { applyAndalusianPrimaryCurriculumDefaults } from "./andalusianPrimaryCurriculumDefaultsService";
import {
  confirmCurriculumAssistantImport,
  getEligibleActionsForCurriculumSubject,
  previewCurriculumAssistantImport,
} from "./curriculumAssistantService";
import { getAndalusianPrimaryCurriculumPack } from "./andalusianPrimaryCurriculumService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";

export interface AndalusianPrimaryDefaultsCheck {
  readonly name: string;
  readonly passed: boolean;
}

const INSTANT = "2026-09-01T12:00:00.000Z";

export function runAndalusianPrimaryCurriculumDefaultsDeterministicChecks():
readonly AndalusianPrimaryDefaultsCheck[] {
  const prepared = [1, 2, 3, 4, 5, 6].map((course) => prepare(course as 1 | 2 | 3 | 4 | 5 | 6));
  const sixth = prepared[5];
  const courseFour = prepared[3];
  const ordinaryActionIds = new Set<string>([
    LANGUAGE_ACTION_IDS.INTERRUPTS,
    LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION,
    PRIMARY_CURRICULUM_ACTION_IDS.MATH_ABANDONS_AT_FIRST_DIFFICULTY,
    PRIMARY_CURRICULUM_ACTION_IDS.PE_BREAKS_AGREED_GAME_RULE,
    PRIMARY_CURRICULUM_ACTION_IDS.ENGLISH_INTERRUPTS_INTERACTION,
    PRIMARY_CURRICULUM_ACTION_IDS.SECOND_LANGUAGE_INTERRUPTS_INTERACTION,
  ]);
  return [
    check("every applicable official subject starts selected and active", () =>
      prepared.every((state) =>
        state.trackingEnabled
        && state.profile?.status === "active"
        && state.profile.selectedSubjectIds.length === state.catalog.pack?.subjects.length
      )
    ),
    check("curated link and ordinary-rule counts are pinned for all six courses", () =>
      prepared.map((state) => state.actionLinks.length).join(",") === "20,20,21,21,22,26"
      && prepared.map((state) => state.profile?.ordinaryTracking.rules.length).join(",")
        === "5,5,5,5,6,6"
    ),
    check("ordinary inference is restricted to the explicitly reviewed negative actions", () =>
      prepared.every((state) => state.actionLinks.every((link) =>
        link.recordingMode !== "ordinary" || ordinaryActionIds.has(link.actionId)
      ))
    ),
    check("contextual Science safety never treats an unpressed action as evidence", () => {
      const links = courseFour.actionLinks.filter((link) =>
        link.actionId === PRIMARY_CURRICULUM_ACTION_IDS.SCIENCE_USES_INSTRUMENTS_UNSAFELY
        || link.actionId === PRIMARY_CURRICULUM_ACTION_IDS.SCIENCE_USES_INSTRUMENTS_SAFELY
      );
      return links.length === 2 && links.every((link) => link.recordingMode === "manual");
    }),
    check("Mathematics ordinary tracking covers perseverance, not the complete criterion", () => {
      const profile = courseFour.profile;
      const rule = profile?.ordinaryTracking.rules.find((candidate) =>
        candidate.observableActionId === PRIMARY_CURRICULUM_ACTION_IDS.MATH_PERSEVERES_WITH_CHALLENGE
      );
      return rule?.contraryActionIds.join(",")
        === PRIMARY_CURRICULUM_ACTION_IDS.MATH_ABANDONS_AT_FIRST_DIFFICULTY;
    }),
    check("both foreign-language contexts use their own editable actions", () => {
      const ruleIds = sixth.profile?.ordinaryTracking.rules.map((rule) => rule.observableActionId) ?? [];
      return ruleIds.includes(PRIMARY_CURRICULUM_ACTION_IDS.ENGLISH_RESPECTS_TURN_TAKING)
        && ruleIds.includes(PRIMARY_CURRICULUM_ACTION_IDS.SECOND_LANGUAGE_RESPECTS_TURN_TAKING);
    }),
    check("Music and Plástica actions are both eligible for the one official Artistic area", () => {
      const subject = courseFour.catalog.pack?.subjects.find((candidate) => candidate.externalCode === "EAR");
      if (!subject) return false;
      const eligible = getEligibleActionsForCurriculumSubject(actions, subject).map((action) => action.id);
      return eligible.includes(PRIMARY_CURRICULUM_ACTION_IDS.ART_PARTICIPATES_RESPECTFULLY)
        && eligible.includes(PRIMARY_CURRICULUM_ACTION_IDS.MUSIC_PLAYS_FLUTE_WITHOUT_PERMISSION);
    }),
    check("classroom-management actions are preserved without invented curricular links", () =>
      prepared.every((state) => !state.actionLinks.some((link) =>
        link.actionId === PRIMARY_CURRICULUM_ACTION_IDS.MUSIC_PLAYS_FLUTE_WITHOUT_PERMISSION
        || link.actionId === PRIMARY_CURRICULUM_ACTION_IDS.ART_USES_MATERIALS_WITHOUT_PERMISSION
      ))
    ),
    check("Values actions exist only in sixth year and use official VCE relations", () => {
      const valuesIds = new Set<string>([
        PRIMARY_CURRICULUM_ACTION_IDS.VALUES_DIALOGUES_RESPECTFULLY,
        PRIMARY_CURRICULUM_ACTION_IDS.VALUES_LISTENS_WITH_EMPATHY,
        PRIMARY_CURRICULUM_ACTION_IDS.VALUES_PROMOTES_PEACEFUL_COEXISTENCE,
      ]);
      return prepared.slice(0, 5).every((state) =>
        state.actionLinks.every((link) => !valuesIds.has(link.actionId))
      ) && sixth.actionLinks.filter((link) => valuesIds.has(link.actionId)).length === 3;
    }),
    check("Religion and Educational Attention are not fabricated from this Anexo II", () =>
      prepared.every((state) => state.catalog.pack?.subjects.every((subject) =>
        subject.legacySubjectId !== SUBJECT_IDS.RELIGION
        && subject.legacySubjectId !== SUBJECT_IDS.EDUCATIONAL_ATTENTION
      ) === true)
    ),
  ];
}

function prepare(course: 1 | 2 | 3 | 4 | 5 | 6) {
  const parsed = parseCurriculumPackJson(
    serializeCurriculumPackToJson(getAndalusianPrimaryCurriculumPack(course), INSTANT)
  );
  if (parsed.status !== "valid") throw new Error("The generated course pack must be portable.");
  const imported = confirmCurriculumAssistantImport(
    `primary-defaults-${course}`,
    previewCurriculumAssistantImport(
      `primary-defaults-${course}`,
      parsed as CurriculumPackJsonValidResult
    ),
    INSTANT
  );
  return applyAndalusianPrimaryCurriculumDefaults(imported, course, actions, INSTANT);
}

function check(name: string, operation: () => boolean): AndalusianPrimaryDefaultsCheck {
  try {
    return { name, passed: operation() };
  } catch {
    return { name, passed: false };
  }
}
