import type { Avatar } from "../types/student";
import { getAvatarDefinition } from "../themes/registry";

export function getAvatar(avatar: Avatar) {
  return getAvatarDefinition(
    avatar.theme,
    avatar.id
  );
}

export function getAvatarName(avatar: Avatar) {
  return getAvatar(avatar)?.name ?? "Desconocido";
}

export function getAvatarProfession(avatar: Avatar) {
  return getAvatar(avatar)?.profession ?? "unknown";
}

export function getAvatarRarity(avatar: Avatar) {
  return getAvatar(avatar)?.rarity ?? "common";
}

export function getAvatarDescription(avatar: Avatar) {
  return getAvatar(avatar)?.description ?? "";
}

export function getAvatarImage(avatar: Avatar) {
  return getAvatar(avatar)?.image ?? "";
}