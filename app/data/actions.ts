import type { Action } from "../types/action";

export const actions: Action[] = [
  {
    id: "correct_answer",
    title: "Acierto",
    points: 1,
    type: "positive",
    icon: "✅",
  },
  {
    id: "help_classmate",
    title: "Ayuda a un compañero",
    points: 3,
    type: "positive",
    icon: "🤝",
  },
  {
    id: "weekly_challenge",
    title: "Reto semanal",
    points: 5,
    type: "positive",
    icon: "🏆",
  },
  {
    id: "bring_material",
    title: "Trae el material",
    points: 1,
    type: "positive",
    icon: "🎒",
  },
  {
    id: "talking",
    title: "Habla sin permiso",
    points: -1,
    type: "negative",
    icon: "💬",
  },
  {
    id: "disturbing",
    title: "Molesta",
    points: -3,
    type: "negative",
    icon: "🚫",
  },
  {
    id: "disrespect",
    title: "Falta de respeto",
    points: -5,
    type: "negative",
    icon: "❗",
  },
];