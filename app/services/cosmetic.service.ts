import { fantasyCosmetics } from "../themes/fantasy/cosmetics";
import type { CosmeticDefinition } from "../themes/fantasy/cosmetics";

export function getCosmetic(
  theme: string,
  cosmeticId: string
): CosmeticDefinition | undefined {
  switch (theme) {
    case "fantasy":
      return fantasyCosmetics.find(
        (cosmetic) => cosmetic.id === cosmeticId
      );

    default:
      return undefined;
  }
}

export function getCosmeticName(
  theme: string,
  cosmeticId: string
) {
  return getCosmetic(theme, cosmeticId)?.name ?? "Desconocido";
}

export function getCosmeticImage(
  theme: string,
  cosmeticId: string
) {
  return getCosmetic(theme, cosmeticId)?.image ?? "";
}

export function getCosmeticRarity(
  theme: string,
  cosmeticId: string
) {
  return getCosmetic(theme, cosmeticId)?.rarity ?? "common";
}

export function getCosmeticType(
  theme: string,
  cosmeticId: string
) {
  return getCosmetic(theme, cosmeticId)?.type;
}

export function getCosmeticDescription(
  theme: string,
  cosmeticId: string
) {
  return getCosmetic(theme, cosmeticId)?.description ?? "";
}