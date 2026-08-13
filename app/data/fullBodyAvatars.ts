import type { Evolution } from "../../domain/progression/StudentProgression";
import { INITIAL_COMPANION_ITEM_ID } from "./initialStudentInventory";

export const FULL_BODY_AVATARS = [
  {
    id: "boy-01",
    src: "/guardians/human-boy/base.png",
    label: "Guardián humano",
  },
  {
    id: "girl-01",
    src: "/avatars/avatar-girl-01.png",
    label: "Avatar 2",
  },
] as const;

export type FullBodyAvatarId = (typeof FULL_BODY_AVATARS)[number]["id"];

export const DEFAULT_FULL_BODY_AVATAR_ID: FullBodyAvatarId = "boy-01";

export function isFullBodyAvatarId(value: unknown): value is FullBodyAvatarId {
  return FULL_BODY_AVATARS.some((avatar) => avatar.id === value);
}

export function getFullBodyAvatar(value: unknown) {
  return (
    FULL_BODY_AVATARS.find((avatar) => avatar.id === value) ??
    FULL_BODY_AVATARS.find((avatar) => avatar.id === DEFAULT_FULL_BODY_AVATAR_ID)!
  );
}

export const HUMAN_BOY_GUARDIAN_ASSETS = [
  "/guardians/human-boy/base.png",
  "/guardians/human-boy/evolution-1.png",
  "/guardians/human-boy/evolution-2.png",
  "/guardians/human-boy/evolution-3.png",
] as const;

export const HUMAN_BOY_DRAGON_ASSETS = [
  "/companions/dragon/base.png",
  "/companions/dragon/evolution-1.png",
  "/companions/dragon/evolution-2.png",
] as const;

const HUMAN_BOY_DRAGON_CHEST_THUMBNAIL_INDEX: Record<Evolution, 0 | 1 | 2> = {
  1: 0,
  2: 0,
  3: 1,
  4: 2,
  5: 2,
};

export function getDragonChestThumbnail(evolution: Evolution): string {
  return HUMAN_BOY_DRAGON_ASSETS[HUMAN_BOY_DRAGON_CHEST_THUMBNAIL_INDEX[evolution]];
}

export function getCollectionArtworkAssetKey(
  itemId: string,
  assetKey: string,
  dragonThumbnail: string
): string {
  return itemId === INITIAL_COMPANION_ITEM_ID ? dragonThumbnail : assetKey;
}

const HUMAN_BOY_PROGRESSION: Record<Evolution, { src: string; visualScale: number }> = {
  1: { src: HUMAN_BOY_GUARDIAN_ASSETS[0], visualScale: 1 },
  2: { src: HUMAN_BOY_GUARDIAN_ASSETS[1], visualScale: 1 },
  3: { src: HUMAN_BOY_GUARDIAN_ASSETS[2], visualScale: 1 },
  4: { src: HUMAN_BOY_GUARDIAN_ASSETS[3], visualScale: 1 },
  5: { src: HUMAN_BOY_GUARDIAN_ASSETS[3], visualScale: 1 },
};

const HUMAN_BOY_DRAGON_PROGRESSION: Record<Evolution, { src: string; visualScale: number }> = {
  1: { src: HUMAN_BOY_GUARDIAN_ASSETS[0], visualScale: 1 },
  2: { src: "/guardian-lines/human-boy-dragon/evolution-1.png", visualScale: 1 },
  3: { src: "/guardian-lines/human-boy-dragon/evolution-2.png", visualScale: 1 },
  4: { src: "/guardian-lines/human-boy-dragon/evolution-3.png", visualScale: 1 },
  5: { src: "/guardian-lines/human-boy-dragon/resonance.png", visualScale: 1.25 },
};

export function getProgressionFullBodyAvatar(
  value: unknown,
  evolution: Evolution,
  hasSelectedDragon = false
) {
  const avatar = getFullBodyAvatar(value);

  if (avatar.id !== "boy-01") return { ...avatar, visualScale: 1 };

  const presentation = hasSelectedDragon
    ? HUMAN_BOY_DRAGON_PROGRESSION[evolution]
    : HUMAN_BOY_PROGRESSION[evolution];

  return {
    ...avatar,
    ...presentation,
  };
}
