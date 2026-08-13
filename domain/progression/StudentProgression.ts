export type Evolution = 1 | 2 | 3 | 4 | 5;

export interface ProgressionConfig {
  readonly evolutionThresholds: readonly number[];
  readonly minimumCrystals: number;
}

export interface StudentProgressionInput {
  crystals: number;
  highestCrystalTotal: number;
  config: ProgressionConfig;
}

export interface StudentProgression {
  evolution: Evolution;
  currentThreshold: number;
  nextThreshold: number | null;
  crystalsNeededForNextEvolution: number;
  progress: number;
  isMaxEvolution: boolean;
}

export interface CrystalChangeInput {
  crystals: number;
  highestCrystalTotal: number;
  requestedChange: number;
  config: ProgressionConfig;
}

export interface CrystalChange {
  previousCrystals: number;
  requestedChange: number;
  appliedChange: number;
  crystals: number;
  previousHighestCrystalTotal: number;
  highestCrystalTotal: number;
}

const EVOLUTION_COUNT = 5;

export const DEFAULT_PROGRESSION_CONFIG = createProgressionConfig({
  evolutionThresholds: [0, 20, 50, 80, 120],
  minimumCrystals: -10,
});

export function createProgressionConfig(config: ProgressionConfig): ProgressionConfig {
  validateProgressionConfig(config);

  return Object.freeze({
    evolutionThresholds: Object.freeze([...config.evolutionThresholds]),
    minimumCrystals: config.minimumCrystals,
  });
}

export function calculateStudentProgression({
  crystals,
  highestCrystalTotal,
  config,
}: StudentProgressionInput): StudentProgression {
  validateProgressionConfig(config);
  assertFiniteNumber("crystals", crystals);
  assertFiniteNumber("highestCrystalTotal", highestCrystalTotal);

  const normalizedHighestCrystalTotal = Math.max(0, highestCrystalTotal, crystals);
  const evolutionIndex = findEvolutionIndex(
    normalizedHighestCrystalTotal,
    config.evolutionThresholds
  );
  const currentThreshold = config.evolutionThresholds[evolutionIndex];
  const nextThreshold = config.evolutionThresholds[evolutionIndex + 1] ?? null;
  const isMaxEvolution = nextThreshold === null;

  if (isMaxEvolution) {
    return {
      evolution: toEvolution(evolutionIndex),
      currentThreshold,
      nextThreshold: null,
      crystalsNeededForNextEvolution: 0,
      progress: 1,
      isMaxEvolution: true,
    };
  }

  return {
    evolution: toEvolution(evolutionIndex),
    currentThreshold,
    nextThreshold,
    crystalsNeededForNextEvolution: Math.max(0, nextThreshold - crystals),
    progress: clamp((crystals - currentThreshold) / (nextThreshold - currentThreshold), 0, 1),
    isMaxEvolution: false,
  };
}

export function applyCrystalChange({
  crystals,
  highestCrystalTotal,
  requestedChange,
  config,
}: CrystalChangeInput): CrystalChange {
  validateProgressionConfig(config);
  assertFiniteNumber("crystals", crystals);
  assertFiniteNumber("highestCrystalTotal", highestCrystalTotal);
  assertFiniteNumber("requestedChange", requestedChange);

  const previousHighestCrystalTotal = Math.max(0, highestCrystalTotal, crystals);
  const nextCrystals = Math.max(config.minimumCrystals, crystals + requestedChange);

  return {
    previousCrystals: crystals,
    requestedChange,
    appliedChange: nextCrystals - crystals,
    crystals: nextCrystals,
    previousHighestCrystalTotal,
    highestCrystalTotal: Math.max(previousHighestCrystalTotal, nextCrystals),
  };
}

export function validateProgressionConfig(config: ProgressionConfig): void {
  const { evolutionThresholds, minimumCrystals } = config;

  if (evolutionThresholds.length !== EVOLUTION_COUNT) {
    throw new RangeError(`Progression must define exactly ${EVOLUTION_COUNT} evolution thresholds.`);
  }

  if (evolutionThresholds[0] !== 0) {
    throw new RangeError("The first evolution threshold must be 0.");
  }

  if (evolutionThresholds[EVOLUTION_COUNT - 1] !== 120) {
    throw new RangeError("The final evolution threshold must be 120.");
  }

  evolutionThresholds.forEach((threshold, index) => {
    assertFiniteNumber(`evolutionThresholds[${index}]`, threshold);

    if (index > 0 && threshold <= evolutionThresholds[index - 1]) {
      throw new RangeError("Evolution thresholds must be strictly increasing.");
    }
  });

  assertFiniteNumber("minimumCrystals", minimumCrystals);

  if (minimumCrystals > 0) {
    throw new RangeError("The minimum crystal balance must be less than or equal to 0.");
  }
}

function findEvolutionIndex(crystals: number, thresholds: readonly number[]): number {
  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    if (crystals >= thresholds[index]) {
      return index;
    }
  }

  return 0;
}

function toEvolution(index: number): Evolution {
  return (index + 1) as Evolution;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}
