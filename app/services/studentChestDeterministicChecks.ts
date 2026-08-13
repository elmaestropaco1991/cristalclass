import {
  calculateStudentProgression,
  DEFAULT_PROGRESSION_CONFIG,
  type Evolution,
} from "../../domain/progression/StudentProgression";
import {
  getDragonChestThumbnail,
  HUMAN_BOY_DRAGON_ASSETS,
} from "../data/fullBodyAvatars";

export type StudentChestCheck = { name: string; passed: boolean };

export function runStudentChestDeterministicChecks(): readonly StudentChestCheck[] {
  return [
    check("dragon chest thumbnail follows the permanent guardian evolution", () => {
      const cases: readonly [number, number, Evolution, string][] = [
        [0, 0, 1, HUMAN_BOY_DRAGON_ASSETS[0]],
        [20, 20, 2, HUMAN_BOY_DRAGON_ASSETS[0]],
        [50, 50, 3, HUMAN_BOY_DRAGON_ASSETS[1]],
        [80, 80, 4, HUMAN_BOY_DRAGON_ASSETS[2]],
        [-10, 120, 5, HUMAN_BOY_DRAGON_ASSETS[2]],
      ];

      return cases.every(([crystals, highestCrystalTotal, expectedEvolution, expectedThumbnail]) => {
        const progression = calculateStudentProgression({
          crystals,
          highestCrystalTotal,
          config: DEFAULT_PROGRESSION_CONFIG,
        });

        return progression.evolution === expectedEvolution
          && getDragonChestThumbnail(progression.evolution) === expectedThumbnail;
      });
    }),
  ];
}

function check(name: string, predicate: () => boolean): StudentChestCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
