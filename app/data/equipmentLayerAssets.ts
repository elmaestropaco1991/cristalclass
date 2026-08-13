export type EquipmentLayerAssets = {
  back?: string;
  front?: string;
};

/** Temporary visual mapping for equipment whose artwork is split around the avatar. */
export const equipmentLayerAssetsByItemId: Readonly<Record<string, EquipmentLayerAssets>> = {
  "backpack-adventurer": {
    back: "/avatars/equipment/back/mochila-aventurera-back.png",
    front: "/avatars/equipment/front/mochila-aventurera-front.png",
  },
};
