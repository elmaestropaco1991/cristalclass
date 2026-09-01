import type { Action } from "../types/action";
import { SUBJECT_IDS } from "../types/subject";

export const LANGUAGE_ACTION_IDS = Object.freeze({
  INTERRUPTS: "language_interrupts",
  NOT_ATTENDING_INTERVENTION: "language_not_attending_intervention",
  RESPECTS_TURNS: "language_respects_turns",
  ACTIVE_LISTENING_PARTICIPATION: "language_active_listening_participation",
  RESOLVES_CONFLICT_WITH_DIALOGUE: "language_resolves_conflict_with_dialogue",
} as const);

const LANGUAGE_ACTION_CONTEXT = {
  subjectId: SUBJECT_IDS.LANGUAGE,
  availableInAllSubjects: false,
  attitudinalCriterionLinks: [],
  quickSlot: null,
  archived: false,
} as const;

/**
 * Editable proposals for daily use. Stable identifiers preserve curricular and
 * historical identity when a teacher later changes a title, icon or points.
 */
export const LANGUAGE_ACTIONS: readonly Action[] = Object.freeze([
  {
    ...LANGUAGE_ACTION_CONTEXT,
    id: LANGUAGE_ACTION_IDS.INTERRUPTS,
    title: "Interrumpe mientras otra persona habla",
    points: -1,
    iconId: "participation-speech",
    trackOrdinaryCompliance: true,
  },
  {
    ...LANGUAGE_ACTION_CONTEXT,
    id: LANGUAGE_ACTION_IDS.NOT_ATTENDING_INTERVENTION,
    title: "No atiende durante una intervención",
    points: -1,
    iconId: "warnings-alert",
    trackOrdinaryCompliance: true,
  },
  {
    ...LANGUAGE_ACTION_CONTEXT,
    id: LANGUAGE_ACTION_IDS.RESPECTS_TURNS,
    title: "Participa respetando los turnos de palabra",
    points: 1,
    iconId: "participation-hand",
    trackOrdinaryCompliance: false,
  },
  {
    ...LANGUAGE_ACTION_CONTEXT,
    id: LANGUAGE_ACTION_IDS.ACTIVE_LISTENING_PARTICIPATION,
    title: "Participa demostrando escucha activa",
    points: 1,
    iconId: "participation-speech",
    trackOrdinaryCompliance: false,
  },
  {
    ...LANGUAGE_ACTION_CONTEXT,
    id: LANGUAGE_ACTION_IDS.RESOLVES_CONFLICT_WITH_DIALOGUE,
    title: "Ayuda a resolver un conflicto mediante el diálogo",
    points: 2,
    iconId: "coexistence-handshake",
    trackOrdinaryCompliance: false,
  },
]);
