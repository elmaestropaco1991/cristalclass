import type { Action } from "../types/action";
import { GENERAL_SUBJECT_ID } from "../types/subject";

const GENERAL_ACTION_CONTEXT = {
  subjectId: GENERAL_SUBJECT_ID,
  availableInAllSubjects: false,
  attitudinalCriterionLinks: [],
  trackOrdinaryCompliance: false,
} as const;

export const actions: Action[] = [
  {
    ...GENERAL_ACTION_CONTEXT,
    id: "weekly_challenge",
    title: "Reto semanal",
    points: 5,
    archived: false,
    quickSlot: 1,
    icon: "🏆",
    orbit: {
      angle: -90,
      variant: "reward",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "help_classmate",
    title: "Ayuda a un compañero",
    points: 3,
    archived: false,
    quickSlot: 2,
    icon: "🤝",
    orbit: {
      angle: -150,
      variant: "success",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "correct_answer",
    title: "Acierto",
    points: 1,
    archived: false,
    quickSlot: 3,
    icon: "✅",
    orbit: {
      angle: -30,
      variant: "success",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "bring_material",
    title: "Trae el material",
    points: 1,
    archived: false,
    quickSlot: 4,
    icon: "🎒",
    orbit: {
      angle: 150,
      variant: "bonus",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "talking",
    title: "Habla sin permiso",
    points: -1,
    archived: false,
    quickSlot: 5,
    icon: "💬",
    orbit: {
      angle: 30,
      variant: "warning",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "disturbing",
    title: "Molesta",
    points: -3,
    archived: false,
    quickSlot: 6,
    icon: "🚫",
    orbit: {
      angle: 90,
      variant: "danger",
    },
  },

  {
    ...GENERAL_ACTION_CONTEXT,
    id: "disrespect",
    title: "Falta de respeto",
    points: -5,
    archived: false,
    quickSlot: null,
    icon: "❗",
    orbit: {
      angle: 180,
      variant: "severe",
    },
  },
];
