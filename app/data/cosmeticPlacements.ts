export type CosmeticPlacementAnchor = "bottom-right" | "center";

export type CosmeticPlacement = {
  anchor: CosmeticPlacementAnchor;
  x: string;
  y: string;
  width: string;
  zIndex: number;
};

export type CosmeticPlacementConfiguration = {
  fallback: CosmeticPlacement;
  /** Reserved for opt-in adjustments when a future avatar genuinely needs one. */
  byFullBodyAvatarId?: Readonly<Record<string, Partial<CosmeticPlacement>>>;
};

export type CosmeticPreview = {
  containerSize: string;
  imageScale: string;
  padding: string;
};

const globalCosmeticPlacement: CosmeticPlacement = {
  anchor: "bottom-right",
  x: "3%",
  y: "7%",
  width: "30%",
  zIndex: 30,
};

export const cosmeticPlacementsByItemId: Readonly<Record<string, CosmeticPlacementConfiguration>> = {
  "green-crystal-dragon": {
    fallback: {
      anchor: "bottom-right",
      x: "6%",
      y: "8%",
      width: "30%",
      zIndex: 30,
    },
  },
  "blue-crystal-aura": {
    fallback: {
      anchor: "center",
      x: "50%",
      y: "48%",
      width: "88%",
      zIndex: 5,
    },
  },
};

export function getCosmeticPlacement(
  itemId: string,
  fullBodyAvatarId?: string
): CosmeticPlacement {
  const configuration = cosmeticPlacementsByItemId[itemId];
  const avatarAdjustment = fullBodyAvatarId
    ? configuration?.byFullBodyAvatarId?.[fullBodyAvatarId]
    : undefined;

  return {
    ...globalCosmeticPlacement,
    ...configuration?.fallback,
    ...avatarAdjustment,
  };
}

const globalCosmeticPreview: CosmeticPreview = {
  containerSize: "6rem",
  imageScale: "100%",
  padding: "0.5rem",
};

export type CosmeticPreviewConfiguration = {
  card?: Partial<CosmeticPreview>;
};

export const cosmeticPreviewsByItemId: Readonly<Record<string, CosmeticPreviewConfiguration>> = {
  "green-crystal-dragon": {
    card: {
      containerSize: "clamp(11.875rem, 14vw, 13.125rem)",
      imageScale: "125%",
      padding: "0",
    },
  },
  "blue-crystal-aura": {
    card: {
      containerSize: "clamp(11.875rem, 14vw, 13.125rem)",
      imageScale: "110%",
      padding: "0",
    },
  },
};

export function getCosmeticPreview(itemId: string, isCardPreview: boolean): CosmeticPreview {
  return {
    ...globalCosmeticPreview,
    ...(isCardPreview ? cosmeticPreviewsByItemId[itemId]?.card : undefined),
  };
}
