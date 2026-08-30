import {
  COIN_STATE_SCHEMA_VERSION,
  DEFAULT_COIN_LIMITS,
  type CoinClassState,
  type CoinIdempotencyRecord,
  type CoinLimits,
  type CoinMovement,
  type CoinRedemption,
  type CoinReward,
} from "../../domain/coins/CoinContracts";
import {
  createCoinClassState,
  createCoinReward,
  setCoinsEnabled,
} from "../../domain/coins/CoinCore";
import {
  createCoinOperationFingerprint,
  measureCoinSerializedJson,
  type CoinSerializedSize,
} from "../../domain/coins/CoinIntegrity";
import { sealCoinClassState, validateCoinClassState } from "../../domain/coins/CoinValidation";
import { estimateCoinStorageTransitionPeak } from "./CoinStorageBudget";

export interface CoinStorageMeasurements {
  readonly smallDisabledState: CoinSerializedSize;
  readonly realisticClass26Students: CoinSerializedSize;
  readonly simulatedFullCourse: CoinSerializedSize & {
    readonly students: number;
    readonly movements: number;
    readonly redemptions: number;
    readonly idempotencyOperations: number;
  };
  readonly simulatedIntensiveCourse: CoinSerializedSize & {
    readonly students: number;
    readonly movements: number;
    readonly redemptions: number;
    readonly idempotencyOperations: number;
    readonly defaultValidationFailure: "size-limit-exceeded";
  };
  readonly nearLimitState: CoinSerializedSize & {
    readonly movements: number;
    readonly budgetCodeUnits: number;
    readonly budgetUtf8Bytes: number;
  };
  readonly fullCourseIdempotencyJournal: CoinSerializedSize & {
    readonly entries: number;
  };
  readonly unicodeRewardSample: CoinSerializedSize;
  readonly fullCourseReadModifySerializePeak: CoinSerializedSize & {
    readonly formula: "2*current + 2*next";
  };
  readonly sharedOriginBudgetPlan: {
    readonly coinCodeUnits: number;
    readonly curriculumCodeUnits: number;
    readonly otherDataReserveCodeUnits: number;
    readonly combinedCodeUnits: number;
  };
}

const CLASSROOM_ID = "storage-measurement-class";
const INSTANT = "2026-08-30T10:00:00.000Z";
let cachedMeasurements: CoinStorageMeasurements | undefined;

export function measureCoinStorageScenarios(): CoinStorageMeasurements {
  if (cachedMeasurements) return cachedMeasurements;
  const small = mustCreateSmall();
  const realistic = createRealisticState();
  const fullCourse = createFullCourseState();
  const intensiveCourse = createIntensiveCourseState();
  const nearLimit = createNearLimitState();
  const unicode = createUnicodeState();
  const smallSize = measuredSize(small);
  const realisticSize = measuredSize(realistic);
  const fullSize = measuredSize(fullCourse);
  const intensiveSize = measuredSize(intensiveCourse);
  const nearLimitSize = measuredSize(nearLimit);
  const journalSize = measuredSize(fullCourse.idempotency);
  const unicodeSize = measuredSize(unicode);
  const peak = estimateCoinStorageTransitionPeak(realistic, fullCourse);
  if (peak.status !== "estimated") throw new Error(peak.message);
  const intensiveDefaultValidation = validateCoinClassState(intensiveCourse);
  if (intensiveDefaultValidation.status !== "invalid"
    || intensiveDefaultValidation.failure.code !== "size-limit-exceeded") {
    throw new Error("The intensive course must be predictably rejected by the default size budget.");
  }
  const curriculumCodeUnits = 1_250_000;
  const otherDataReserveCodeUnits = 1_000_000;
  cachedMeasurements = {
    smallDisabledState: smallSize,
    realisticClass26Students: realisticSize,
    simulatedFullCourse: {
      ...fullSize,
      students: fullCourse.balances.length,
      movements: fullCourse.movements.length,
      redemptions: fullCourse.redemptions.length,
      idempotencyOperations: fullCourse.idempotency.length,
    },
    simulatedIntensiveCourse: {
      ...intensiveSize,
      students: intensiveCourse.balances.length,
      movements: intensiveCourse.movements.length,
      redemptions: intensiveCourse.redemptions.length,
      idempotencyOperations: intensiveCourse.idempotency.length,
      defaultValidationFailure: "size-limit-exceeded",
    },
    nearLimitState: {
      ...nearLimitSize,
      movements: nearLimit.movements.length,
      budgetCodeUnits: DEFAULT_COIN_LIMITS.maxPersistedCodeUnits,
      budgetUtf8Bytes: DEFAULT_COIN_LIMITS.maxPersistedUtf8Bytes,
    },
    fullCourseIdempotencyJournal: {
      ...journalSize,
      entries: fullCourse.idempotency.length,
    },
    unicodeRewardSample: unicodeSize,
    fullCourseReadModifySerializePeak: {
      ...peak.estimate.readModifySerializePeak,
      formula: peak.estimate.formula,
    },
    sharedOriginBudgetPlan: {
      coinCodeUnits: DEFAULT_COIN_LIMITS.maxPersistedCodeUnits,
      curriculumCodeUnits,
      otherDataReserveCodeUnits,
      combinedCodeUnits: DEFAULT_COIN_LIMITS.maxPersistedCodeUnits
        + curriculumCodeUnits
        + otherDataReserveCodeUnits,
    },
  };
  return cachedMeasurements;
}

export function createFullCourseState(): CoinClassState {
  const studentIds = Array.from({ length: 26 }, (_, index) => `student-${index + 1}`);
  const rewards = createSyntheticRewards(6);
  const journal: CoinIdempotencyRecord[] = [journalEntry("enable-course", "set-enabled", 1)];
  for (const reward of rewards) {
    journal.push(journalEntry(reward.lastOperationId, "create-reward", journal.length + 1, reward.id));
  }
  const balances = new Map(studentIds.map((studentId) => [studentId, 0]));
  const movements: CoinMovement[] = [];
  const redemptions: CoinRedemption[] = [];

  // 36 teaching weeks: one positive action per student and week.
  for (let week = 1; week <= 36; week += 1) {
    for (let student = 1; student <= studentIds.length; student += 1) {
      const studentId = studentIds[student - 1];
      const operationId = `action-w${week}-s${student}`;
      appendSyntheticMovement(journal, movements, balances, {
        operationId,
        studentId,
        requestedAmount: 2,
        appliedAmount: 2,
        cause: {
          type: "action",
          actionId: "weekly-positive-action",
          configurationMode: "same-as-crystals",
          usedLegacyDefault: false,
        },
        kind: "apply-action",
      });
    }
  }

  // One explicit administrative correction per student during the course.
  for (let student = 1; student <= studentIds.length; student += 1) {
    const studentId = studentIds[student - 1];
    appendSyntheticMovement(journal, movements, balances, {
      operationId: `adjust-course-s${student}`,
      studentId,
      requestedAmount: 3,
      appliedAmount: 3,
      cause: { type: "administrative-adjustment", reason: "Corrección anual explícita" },
      kind: "administrative-adjustment",
    });
  }

  // Four immutable redemptions per student at the current five-coin price.
  for (let round = 1; round <= 4; round += 1) {
    for (let student = 1; student <= studentIds.length; student += 1) {
      const studentId = studentIds[student - 1];
      const operationId = `redeem-r${round}-s${student}`;
      const redemptionId = `redemption-r${round}-s${student}`;
      appendSyntheticMovement(journal, movements, balances, {
        operationId,
        studentId,
        requestedAmount: -5,
        appliedAmount: -5,
        cause: { type: "redemption", redemptionId, rewardId: "reward-1" },
        kind: "redeem-reward",
        resultReference: redemptionId,
      });
      redemptions.push({
        id: redemptionId,
        classroomId: CLASSROOM_ID,
        studentId,
        rewardId: "reward-1",
        operationId,
        movementId: operationId,
        rewardNameSnapshot: "Recompensa 1",
        rewardPriceSnapshot: 5,
        occurredAt: INSTANT,
        stateRevision: journal.length,
      });
    }
  }

  return sealSyntheticState(studentIds, rewards, journal, movements, redemptions, balances);
}

export function createIntensiveCourseState(): CoinClassState {
  const studentIds = Array.from({ length: 26 }, (_, index) => `student-${index + 1}`);
  const rewards = createSyntheticRewards(6);
  const journal: CoinIdempotencyRecord[] = [journalEntry("enable-intensive", "set-enabled", 1)];
  for (const reward of rewards) {
    journal.push(journalEntry(reward.lastOperationId, "create-reward", journal.length + 1, reward.id));
  }
  const balances = new Map(studentIds.map((studentId) => [studentId, 0]));
  const movements: CoinMovement[] = [];
  const redemptions: CoinRedemption[] = [];

  // 36 weeks, four coin-bearing classroom actions per student and week.
  for (let week = 1; week <= 36; week += 1) {
    for (let occurrence = 1; occurrence <= 4; occurrence += 1) {
      for (let student = 1; student <= studentIds.length; student += 1) {
        const studentId = studentIds[student - 1];
        appendSyntheticMovement(journal, movements, balances, {
          operationId: `intense-w${week}-o${occurrence}-s${student}`,
          studentId,
          requestedAmount: 2,
          appliedAmount: 2,
          cause: {
            type: "action",
            actionId: "intensive-positive-action",
            configurationMode: "same-as-crystals",
            usedLegacyDefault: false,
          },
          kind: "apply-action",
        });
      }
    }
  }

  for (let correction = 1; correction <= 2; correction += 1) {
    for (let student = 1; student <= studentIds.length; student += 1) {
      appendSyntheticMovement(journal, movements, balances, {
        operationId: `intense-adjust-${correction}-s${student}`,
        studentId: studentIds[student - 1],
        requestedAmount: 3,
        appliedAmount: 3,
        cause: { type: "administrative-adjustment", reason: "Corrección intensiva explícita" },
        kind: "administrative-adjustment",
      });
    }
  }

  for (let round = 1; round <= 8; round += 1) {
    for (let student = 1; student <= studentIds.length; student += 1) {
      const studentId = studentIds[student - 1];
      const operationId = `intense-redeem-r${round}-s${student}`;
      const redemptionId = `intense-redemption-r${round}-s${student}`;
      appendSyntheticMovement(journal, movements, balances, {
        operationId,
        studentId,
        requestedAmount: -5,
        appliedAmount: -5,
        cause: { type: "redemption", redemptionId, rewardId: "reward-1" },
        kind: "redeem-reward",
        resultReference: redemptionId,
      });
      redemptions.push({
        id: redemptionId,
        classroomId: CLASSROOM_ID,
        studentId,
        rewardId: "reward-1",
        operationId,
        movementId: operationId,
        rewardNameSnapshot: "Recompensa 1",
        rewardPriceSnapshot: 5,
        occurredAt: INSTANT,
        stateRevision: journal.length,
      });
    }
  }

  const permissiveLimits: CoinLimits = {
    ...DEFAULT_COIN_LIMITS,
    maxPersistedCodeUnits: 4_000_000,
    maxPersistedUtf8Bytes: 5_000_000,
    maxTransitionPeakCodeUnits: 16_000_000,
    maxTransitionPeakUtf8Bytes: 20_000_000,
  };
  return sealSyntheticState(
    studentIds, rewards, journal, movements, redemptions, balances, permissiveLimits
  );
}

export function createNearLimitState(): CoinClassState {
  for (let movementCount = 11_000; movementCount >= 1_000; movementCount -= 250) {
    const studentIds = ["student-near-limit"];
    const journal: CoinIdempotencyRecord[] = [journalEntry("enable-near-limit", "set-enabled", 1)];
    const balances = new Map([[studentIds[0], 0]]);
    const movements: CoinMovement[] = [];
    for (let index = 1; index <= movementCount; index += 1) {
      appendSyntheticMovement(journal, movements, balances, {
        operationId: `near-action-${index}`,
        studentId: studentIds[0],
        requestedAmount: 1,
        appliedAmount: 1,
        cause: {
          type: "action",
          actionId: "near-limit-action",
          configurationMode: "same-as-crystals",
          usedLegacyDefault: false,
        },
        kind: "apply-action",
      });
    }
    const sealed = trySealSyntheticState(studentIds, [], journal, movements, [], balances);
    if (sealed) return sealed;
  }
  throw new Error("A valid near-limit monetary state could not be constructed.");
}

function createRealisticState(): CoinClassState {
  const created = createCoinClassState(CLASSROOM_ID);
  if (created.status !== "created") throw new Error(created.failure.message);
  let result = setCoinsEnabled(created.state, {
    classroomId: CLASSROOM_ID,
    operationId: "enable-realistic",
    enabled: true,
    studentIds: Array.from({ length: 26 }, (_, index) => `student-${index + 1}`),
    occurredAt: INSTANT,
  });
  if (result.status !== "applied") throw new Error("Realistic activation failed.");
  let state = result.state;
  for (let index = 1; index <= 6; index += 1) {
    result = createCoinReward(state, {
      classroomId: CLASSROOM_ID,
      operationId: `create-realistic-reward-${index}`,
      rewardId: `realistic-reward-${index}`,
      name: `Recompensa ${index}`,
      description: "Descripción docente breve",
      price: index * 5,
      occurredAt: INSTANT,
    });
    if (result.status !== "applied") throw new Error("Realistic reward creation failed.");
    state = result.state;
  }
  return state;
}

function createUnicodeState(): CoinClassState {
  const created = createCoinClassState("clase-unicode");
  if (created.status !== "created") throw new Error(created.failure.message);
  const enabled = setCoinsEnabled(created.state, {
    classroomId: "clase-unicode",
    operationId: "enable-unicode",
    enabled: true,
    studentIds: ["student-unicode"],
    occurredAt: INSTANT,
  });
  if (enabled.status !== "applied") throw new Error("Unicode activation failed.");
  const reward = createCoinReward(enabled.state, {
    classroomId: "clase-unicode",
    operationId: "reward-unicode",
    rewardId: "reward-unicode",
    name: "Día sin deberes 🎉",
    description: "Descripción con tildes, eñe y emoji 🪙",
    price: 10,
    occurredAt: INSTANT,
  });
  if (reward.status !== "applied") throw new Error("Unicode reward failed.");
  return reward.state;
}

function createSyntheticRewards(count: number): CoinReward[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `reward-${index + 1}`,
    name: `Recompensa ${index + 1}`,
    description: "Descripción docente breve",
    price: (index + 1) * 5,
    status: "active" as const,
    order: index,
    revision: 1,
    createdAt: INSTANT,
    updatedAt: INSTANT,
    lastOperationId: `create-course-reward-${index + 1}`,
  }));
}

function appendSyntheticMovement(
  journal: CoinIdempotencyRecord[],
  movements: CoinMovement[],
  balances: Map<string, number>,
  input: {
    readonly operationId: string;
    readonly studentId: string;
    readonly requestedAmount: number;
    readonly appliedAmount: number;
    readonly cause: CoinMovement["cause"];
    readonly kind: CoinIdempotencyRecord["kind"];
    readonly resultReference?: string;
  }
): void {
  const before = balances.get(input.studentId);
  if (before === undefined) throw new Error("Synthetic student is missing.");
  const revision = journal.length + 1;
  movements.push({
    id: input.operationId,
    classroomId: CLASSROOM_ID,
    studentId: input.studentId,
    operationId: input.operationId,
    cause: input.cause,
    requestedAmount: input.requestedAmount,
    appliedAmount: input.appliedAmount,
    balanceBefore: before,
    balanceAfter: before + input.appliedAmount,
    occurredAt: INSTANT,
    stateRevision: revision,
  });
  balances.set(input.studentId, before + input.appliedAmount);
  journal.push(journalEntry(
    input.operationId,
    input.kind,
    revision,
    input.resultReference ?? input.operationId
  ));
}

function journalEntry(
  operationId: string,
  kind: CoinIdempotencyRecord["kind"],
  resultingRevision: number,
  resultReference?: string
): CoinIdempotencyRecord {
  const fingerprint = createCoinOperationFingerprint({ simulation: operationId, kind });
  if (fingerprint.status !== "calculated") throw new Error(fingerprint.failure.message);
  return {
    operationId,
    kind,
    fingerprint: fingerprint.checksum,
    resultingRevision,
    outcome: "applied",
    ...(resultReference ? { resultReference } : {}),
  };
}

function sealSyntheticState(
  studentIds: readonly string[],
  rewards: readonly CoinReward[],
  journal: readonly CoinIdempotencyRecord[],
  movements: readonly CoinMovement[],
  redemptions: readonly CoinRedemption[],
  balances: ReadonlyMap<string, number>,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinClassState {
  const sealed = trySealSyntheticState(
    studentIds,
    rewards,
    journal,
    movements,
    redemptions,
    balances,
    limits
  );
  if (!sealed) throw new Error("Synthetic monetary state is invalid or over budget.");
  return sealed;
}

function trySealSyntheticState(
  studentIds: readonly string[],
  rewards: readonly CoinReward[],
  journal: readonly CoinIdempotencyRecord[],
  movements: readonly CoinMovement[],
  redemptions: readonly CoinRedemption[],
  balances: ReadonlyMap<string, number>,
  limits: CoinLimits = DEFAULT_COIN_LIMITS
): CoinClassState | null {
  const sealed = sealCoinClassState({
    schemaVersion: COIN_STATE_SCHEMA_VERSION,
    classroomId: CLASSROOM_ID,
    settings: {
      enabled: true,
      firstActivatedAt: INSTANT,
      updatedAt: INSTANT,
      lastOperationId: journal[0].operationId,
    },
    balances: studentIds.map((studentId) => ({
      studentId,
      balance: balances.get(studentId) ?? 0,
    })),
    rewards,
    redemptions,
    redemptionReversals: [],
    movements,
    idempotency: journal,
    revision: journal.length,
  }, limits);
  return sealed.status === "valid" ? sealed.state : null;
}

function mustCreateSmall(): CoinClassState {
  const created = createCoinClassState(CLASSROOM_ID);
  if (created.status !== "created") throw new Error(created.failure.message);
  return created.state;
}

function measuredSize(value: unknown): CoinSerializedSize {
  const measured = measureCoinSerializedJson(value);
  if (measured.status !== "measured") throw new Error(measured.failure.message);
  return measured.size;
}
