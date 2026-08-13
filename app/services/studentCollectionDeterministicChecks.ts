import {
  calculateStudentProgression,
  DEFAULT_PROGRESSION_CONFIG,
  type Evolution,
} from "../../domain/progression/StudentProgression";
import {
  getCollectionArtworkAssetKey,
  getDragonChestThumbnail,
  HUMAN_BOY_DRAGON_ASSETS,
} from "../data/fullBodyAvatars";
import { INITIAL_COMPANION_ITEM_ID } from "../data/initialStudentInventory";

export type StudentCollectionCheck = { name: string; passed: boolean };

export function runStudentCollectionDeterministicChecks(): readonly StudentCollectionCheck[] {
  return [
    check("dragon collection previews follow the permanent guardian evolution", () => {
      const cases: readonly [number, number, Evolution, string][] = [
        [0, 0, 1, HUMAN_BOY_DRAGON_ASSETS[0]],
        [20, 20, 2, HUMAN_BOY_DRAGON_ASSETS[0]],
        [50, 50, 3, HUMAN_BOY_DRAGON_ASSETS[1]],
        [80, 80, 4, HUMAN_BOY_DRAGON_ASSETS[2]],
        [-10, 120, 5, HUMAN_BOY_DRAGON_ASSETS[2]],
      ];

      return cases.every(([crystals, highestCrystalTotal, expectedEvolution, expectedAssetKey]) => {
        const progression = calculateStudentProgression({
          crystals,
          highestCrystalTotal,
          config: DEFAULT_PROGRESSION_CONFIG,
        });
        const dragonThumbnail = getDragonChestThumbnail(progression.evolution);

        return progression.evolution === expectedEvolution
          && getCollectionArtworkAssetKey(
            INITIAL_COMPANION_ITEM_ID,
            HUMAN_BOY_DRAGON_ASSETS[0],
            dragonThumbnail
          ) === expectedAssetKey
          && getCollectionArtworkAssetKey("other-item", "/other-item.png", dragonThumbnail) === "/other-item.png";
      });
    }),
  ];
}

function check(name: string, predicate: () => boolean): StudentCollectionCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
