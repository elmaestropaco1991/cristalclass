import {
  calculateStudentProgression,
  type Evolution,
  type ProgressionConfig,
} from "./StudentProgression";

export interface ChestProgressionConfig {
  readonly interval: number;
}

export interface ChestProgressionInput {
  previousCrystals: number;
  previousHighestCrystalTotal: number;
  appliedChange: number;
  previousChestProgress: number;
  progressionConfig: ProgressionConfig;
  chestConfig: ChestProgressionConfig;
}

export interface ChestProgressionResult {
  previousChestProgress: number;
  chestProgress: number;
  chestEligiblePositiveChange: number;
  negativeBalanceRecoveryChange: number;
  generatedChestEvolutions: readonly Evolution[];
}

export const DEFAULT_CHEST_PROGRESSION_CONFIG = createChestProgressionConfig({
  interval: 10,
});

export function createChestProgressionConfig(
  config: ChestProgressionConfig
): ChestProgressionConfig {
  validateChestProgressionConfig(config);

  return Object.freeze({ interval: config.interval });
}

export function processChestProgress({
  previousCrystals,
  previousHighestCrystalTotal,
  appliedChange,
  previousChestProgress,
  progressionConfig,
  chestConfig,
}: ChestProgressionInput): ChestProgressionResult {
  validateChestProgressionConfig(chestConfig);
  assertFiniteNumber("previousCrystals", previousCrystals);
  assertFiniteNumber("previousHighestCrystalTotal", previousHighestCrystalTotal);
  assertFiniteNumber("appliedChange", appliedChange);

  const normalizedPreviousChestProgress = normalizeChestProgress(
    previousChestProgress,
    chestConfig
  );

  if (appliedChange <= 0) {
    return {
      previousChestProgress: normalizedPreviousChestProgress,
      chestProgress: Math.max(0, normalizedPreviousChestProgress + appliedChange),
      chestEligiblePositiveChange: 0,
      negativeBalanceRecoveryChange: 0,
      generatedChestEvolutions: [],
    };
  }

  const negativeBalanceRecoveryChange = Math.min(
    appliedChange,
    Math.max(0, -previousCrystals)
  );
  const chestEligiblePositiveChange = appliedChange - negativeBalanceRecoveryChange;
  const progressWithEligibleChange =
    normalizedPreviousChestProgress + chestEligiblePositiveChange;
  const chestCount = Math.floor(progressWithEligibleChange / chestConfig.interval);
  const chestProgress = progressWithEligibleChange % chestConfig.interval;

  return {
    previousChestProgress: normalizedPreviousChestProgress,
    chestProgress,
    chestEligiblePositiveChange,
    negativeBalanceRecoveryChange,
    generatedChestEvolutions: createChestEvolutions({
      chestCount,
      previousChestProgress: normalizedPreviousChestProgress,
      previousCrystals,
      previousHighestCrystalTotal,
      negativeBalanceRecoveryChange,
      progressionConfig,
      chestConfig,
    }),
  };
}

export function normalizeChestProgress(
  chestProgress: number | undefined,
  config: ChestProgressionConfig
): number {
  validateChestProgressionConfig(config);

  if (
    chestProgress === undefined ||
    !Number.isFinite(chestProgress) ||
    !Number.isInteger(chestProgress) ||
    chestProgress < 0
  ) {
    return 0;
  }

  return chestProgress % config.interval;
}

export function validateChestProgressionConfig(config: ChestProgressionConfig): void {
  if (!Number.isInteger(config.interval) || config.interval <= 0) {
    throw new RangeError("The chest progression interval must be a positive integer.");
  }
}

function createChestEvolutions({
  chestCount,
  previousChestProgress,
  previousCrystals,
  previousHighestCrystalTotal,
  negativeBalanceRecoveryChange,
  progressionConfig,
  chestConfig,
}: {
  chestCount: number;
  previousChestProgress: number;
  previousCrystals: number;
  previousHighestCrystalTotal: number;
  negativeBalanceRecoveryChange: number;
  progressionConfig: ProgressionConfig;
  chestConfig: ChestProgressionConfig;
}): Evolution[] {
  return Array.from({ length: chestCount }, (_, index) => {
    const eligibleChangeAtChest =
      chestConfig.interval * (index + 1) - previousChestProgress;
    const crystalsAtChest =
      previousCrystals + negativeBalanceRecoveryChange + eligibleChangeAtChest;
    const highestCrystalTotalAtChest = Math.max(
      previousHighestCrystalTotal,
      crystalsAtChest
    );

    return calculateStudentProgression({
      crystals: crystalsAtChest,
      highestCrystalTotal: highestCrystalTotalAtChest,
      config: progressionConfig,
    }).evolution;
  });
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}
