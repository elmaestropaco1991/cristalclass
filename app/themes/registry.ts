import { fantasyAvatars, type AvatarDefinition } from "./fantasy/avatars";

const themes: Record<string, AvatarDefinition[]> = {
  fantasy: fantasyAvatars,
};

export function getAvatarDefinition(theme: string, id: string) {
  const avatars = themes[theme];

  if (!avatars) {
    return undefined;
  }

  return avatars.find((avatar) => avatar.id === id);
}