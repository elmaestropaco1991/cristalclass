import type { Action } from "../types/action";

export const actions: Action[] = [
  {
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
