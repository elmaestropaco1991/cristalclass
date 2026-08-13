import type { ItemDefinition } from "../../../domain/collection/ItemCatalog";

export type CosmeticType =
  | "pet"
  | "background"
  | "aura"
  | "skin"
  | "badge";

export type CosmeticRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

export type CosmeticDefinition = {
  id: string;

  name: string;

  type: CosmeticType;

  rarity: CosmeticRarity;

  image: string;

  description: string;
};

export const fantasyCosmetics: CosmeticDefinition[] = [
  {
    id: "pet_slime_blue",
    name: "Slime Azul",
    type: "pet",
    rarity: "common",
    image: "/cosmetics/fantasy/pets/slime_blue.png",
    description: "Un pequeño compañero siempre sonriente.",
  },

  {
    id: "pet_fox",
    name: "Zorro del Bosque",
    type: "pet",
    rarity: "rare",
    image: "/cosmetics/fantasy/pets/fox.png",
    description: "Ágil y muy curioso.",
  },

  {
    id: "aura_stars",
    name: "Aura Estelar",
    type: "aura",
    rarity: "epic",
    image: "/cosmetics/fantasy/auras/stars.png",
    description: "Pequeñas estrellas rodean al avatar.",
  },

  {
    id: "background_forest",
    name: "Bosque Encantado",
    type: "background",
    rarity: "common",
    image: "/cosmetics/fantasy/backgrounds/forest.png",
    description: "Un bosque lleno de magia.",
  },

  {
    id: "badge_founder",
    name: "Pionero",
    type: "badge",
    rarity: "legendary",
    image: "/cosmetics/fantasy/badges/founder.png",
    description: "Insignia exclusiva para los primeros aventureros.",
  },
];

/** Small compatible catalog derived exclusively from existing pet cosmetics. */
export const fantasyItemCatalog: readonly ItemDefinition[] = [
  ...fantasyCosmetics.flatMap(
    (cosmetic) =>
      cosmetic.type === "pet"
        ? [{
            id: cosmetic.id,
            displayName: cosmetic.name,
            category: "companion" as const,
            rarity: cosmetic.rarity,
            theme: "fantasy",
            assetKey: cosmetic.image,
          }]
        : []
  ),
  {
    id: "green-crystal-dragon",
    displayName: "Dragón de cristal",
    category: "companion",
    rarity: "common",
    theme: "fantasy",
    assetKey: "/companions/dragon/base.png",
  },
  {
    id: "blue-crystal-aura",
    displayName: "Aura de cristales",
    category: "back",
    rarity: "rare",
    theme: "fantasy",
    assetKey: "/avatars/equipment/back/aura-cristales-azules.png",
  },
  {
    id: "backpack-adventurer",
    displayName: "Mochila aventurera",
    category: "back",
    rarity: "common",
    theme: "fantasy",
    assetKey: "/avatars/equipment/back/mochila-aventurera-back.png",
  },
];
