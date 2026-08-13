export type AvatarProfession =
  | "warrior"
  | "mage"
  | "archer"
  | "explorer";

export type AvatarRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

export type AvatarDefinition = {
  id: string;
  name: string;
  profession: AvatarProfession;
  rarity: AvatarRarity;
  description: string;
  image: string;
};

export const fantasyAvatars: AvatarDefinition[] = [
  {
    id: "explorer01",
    name: "Explorador",
    profession: "explorer",
    rarity: "common",
    description: "Siempre encuentra el mejor camino para su equipo.",
    image: "/avatars/fantasy/explorer01.png",
  },
  {
    id: "warrior01",
    name: "Guerrero",
    profession: "warrior",
    rarity: "common",
    description: "Protege a sus compañeros incluso en los retos más difíciles.",
    image: "/avatars/fantasy/warrior01.png",
  },
  {
    id: "mage01",
    name: "Mago",
    profession: "mage",
    rarity: "common",
    description: "Aprende rápidamente y utiliza su conocimiento con inteligencia.",
    image: "/avatars/fantasy/mage01.png",
  },
  {
    id: "archer01",
    name: "Arquero",
    profession: "archer",
    rarity: "common",
    description: "Nunca pierde de vista su objetivo.",
    image: "/avatars/fantasy/archer01.png",
  },
];