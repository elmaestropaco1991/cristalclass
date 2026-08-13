export type ActionIconCategory =
  | "learning"
  | "participation"
  | "effort"
  | "coexistence"
  | "organization"
  | "creativity";

export type ActionIconDefinition = {
  iconId: string;
  glyph: string;
  label: string;
  category: ActionIconCategory;
};

export const actionIconCategories: Readonly<Record<ActionIconCategory, string>> = {
  learning: "Aprendizaje",
  participation: "Participación",
  effort: "Esfuerzo",
  coexistence: "Convivencia",
  organization: "Organización",
  creativity: "Creatividad",
};

/** Stable, local icon catalog. Legacy emoji and image paths remain ActionIcon fallbacks. */
export const actionIcons: readonly ActionIconDefinition[] = [
  { iconId: "learning-book", glyph: "📘", label: "Libro", category: "learning" },
  { iconId: "learning-star", glyph: "⭐", label: "Estrella", category: "learning" },
  { iconId: "learning-bulb", glyph: "💡", label: "Idea aprendida", category: "learning" },
  { iconId: "learning-magnifier", glyph: "🔎", label: "Investigar", category: "learning" },
  { iconId: "participation-hand", glyph: "🙋", label: "Mano levantada", category: "participation" },
  { iconId: "participation-speech", glyph: "💬", label: "Participación oral", category: "participation" },
  { iconId: "participation-applause", glyph: "👏", label: "Aplauso", category: "participation" },
  { iconId: "participation-microphone", glyph: "🎤", label: "Exposición", category: "participation" },
  { iconId: "work-target", glyph: "🎯", label: "Objetivo", category: "effort" },
  { iconId: "work-check", glyph: "✅", label: "Tarea completada", category: "effort" },
  { iconId: "effort-medal", glyph: "🏅", label: "Medalla", category: "effort" },
  { iconId: "effort-rocket", glyph: "🚀", label: "Progreso", category: "effort" },
  { iconId: "effort-mountain", glyph: "⛰️", label: "Superación", category: "effort" },
  { iconId: "coexistence-handshake", glyph: "🤝", label: "Cooperación", category: "coexistence" },
  { iconId: "coexistence-heart", glyph: "💚", label: "Respeto", category: "coexistence" },
  { iconId: "coexistence-group", glyph: "🧑‍🤝‍🧑", label: "Compañerismo", category: "coexistence" },
  { iconId: "coexistence-peace", glyph: "☮️", label: "Paz", category: "coexistence" },
  { iconId: "materials-backpack", glyph: "🎒", label: "Mochila", category: "organization" },
  { iconId: "materials-pencil", glyph: "✏️", label: "Lápiz", category: "organization" },
  { iconId: "organization-calendar", glyph: "📅", label: "Calendario", category: "organization" },
  { iconId: "organization-clock", glyph: "⏰", label: "Puntualidad", category: "organization" },
  { iconId: "creativity-palette", glyph: "🎨", label: "Paleta", category: "creativity" },
  { iconId: "creativity-camera", glyph: "📷", label: "Cámara", category: "creativity" },
  { iconId: "creativity-lightning", glyph: "⚡", label: "Chispa creativa", category: "creativity" },
  { iconId: "other-sparkles", glyph: "✨", label: "Destellos", category: "creativity" },
  { iconId: "emotions-smile", glyph: "😊", label: "Sonrisa", category: "coexistence" },
  { iconId: "emotions-calm", glyph: "🌈", label: "Calma", category: "coexistence" },
  { iconId: "warnings-stop", glyph: "🛑", label: "Alto", category: "effort" },
  { iconId: "warnings-alert", glyph: "⚠️", label: "Advertencia", category: "effort" },
  { iconId: "other-trophy", glyph: "🏆", label: "Trofeo", category: "effort" },
];

export function getActionIcon(iconId: string | undefined): ActionIconDefinition | undefined {
  return actionIcons.find((icon) => icon.iconId === iconId);
}
