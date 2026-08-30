import type {
  ApplyCoinActionCommand,
  CoinClassState,
  CoinOperationResult,
  CreateCoinRewardCommand,
} from "./CoinContracts";
import { DEFAULT_COIN_LIMITS } from "./CoinContracts";
import {
  adjustCoinBalance,
  applyCoinAction,
  archiveCoinReward,
  createCoinClassState,
  createCoinReward,
  editCoinReward,
  getCoinBalance,
  redeemCoinReward,
  registerCoinStudent,
  reorderCoinRewards,
  restoreCoinReward,
  reverseCoinRedemption,
  setCoinsEnabled,
} from "./CoinCore";
import { calculateCoinStateChecksum, createCoinOperationFingerprint } from "./CoinIntegrity";
import { validateCoinClassState, sealCoinClassState } from "./CoinValidation";

export interface CoinCoreDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const CLASSROOM_ID = "classroom-coins";
const STUDENT_ID = "student-1";
const SECOND_STUDENT_ID = "student-2";
const FIRST_INSTANT = "2026-08-30T10:00:00.000Z";
const SECOND_INSTANT = "2026-08-30T11:00:00.000Z";
const THIRD_INSTANT = "2026-08-30T12:00:00.000Z";

export function runCoinCoreDeterministicChecks(): readonly CoinCoreDeterministicCheck[] {
  return [
    check("coins: initial classroom state is disabled", () => {
      const state = disabledState();
      return !state.settings.enabled
        && state.settings.firstActivatedAt === null
        && state.balances.length === 0
        && state.revision === 0;
    }),
    check("coins: first activation initializes every supplied student at zero", () => {
      const state = enabledState([STUDENT_ID, SECOND_STUDENT_ID]);
      return state.settings.enabled
        && state.balances.length === 2
        && state.balances.every((entry) => entry.balance === 0);
    }),
    check("coins: activation ignores crystal data and performs no conversion", () => {
      const command = {
        ...enableCommand("enable-no-conversion", [STUDENT_ID]),
        crystalsByStudent: { [STUDENT_ID]: 9_999 },
      };
      const result = setCoinsEnabled(disabledState(), command);
      return result.status === "applied" && getCoinBalance(result.state, STUDENT_ID) === 0;
    }),
    check("coins: activation ignores historical action lists", () => {
      const command = {
        ...enableCommand("enable-no-history", [STUDENT_ID]),
        historicalActionIds: ["old-action-1", "old-action-2"],
      };
      const result = setCoinsEnabled(disabledState(), command);
      return result.status === "applied"
        && result.state.movements.length === 0
        && getCoinBalance(result.state, STUDENT_ID) === 0;
    }),
    check("coins: a later student is registered at zero", () => {
      const result = registerCoinStudent(enabledState(), {
        classroomId: CLASSROOM_ID,
        operationId: "register-later-student",
        studentId: SECOND_STUDENT_ID,
      });
      return result.status === "applied" && getCoinBalance(result.state, SECOND_STUDENT_ID) === 0;
    }),
    check("coins: identical student registration retry is idempotent", () => {
      const command = {
        classroomId: CLASSROOM_ID,
        operationId: "register-student-retry",
        studentId: SECOND_STUDENT_ID,
      } as const;
      const first = registerCoinStudent(enabledState(), command);
      if (first.status !== "applied") return false;
      const retry = registerCoinStudent(first.state, command);
      return retry.status === "idempotent"
        && retry.receipt.resultReference === SECOND_STUDENT_ID
        && retry.state.balances.filter((entry) => entry.studentId === SECOND_STUDENT_ID).length === 1;
    }),
    check("coins: divergent student registration reuse conflicts", () => {
      const first = registerCoinStudent(enabledState(), {
        classroomId: CLASSROOM_ID,
        operationId: "register-student-divergent",
        studentId: SECOND_STUDENT_ID,
      });
      if (first.status !== "applied") return false;
      const retry = registerCoinStudent(first.state, {
        classroomId: CLASSROOM_ID,
        operationId: "register-student-divergent",
        studentId: "student-3",
      });
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: identical activation retry is idempotent", () => {
      const first = setCoinsEnabled(disabledState(), enableCommand("enable-retry", [STUDENT_ID]));
      if (first.status !== "applied") return false;
      const retry = setCoinsEnabled(first.state, {
        ...enableCommand("enable-retry", [STUDENT_ID]),
        occurredAt: SECOND_INSTANT,
      });
      return retry.status === "idempotent"
        && retry.state === first.state
        && retry.state.settings.firstActivatedAt === FIRST_INSTANT;
    }),
    check("coins: activation student order is not monetary fingerprint material", () => {
      const first = setCoinsEnabled(disabledState(), enableCommand(
        "enable-order-insensitive", [STUDENT_ID, SECOND_STUDENT_ID]
      ));
      if (first.status !== "applied") return false;
      const retry = setCoinsEnabled(first.state, enableCommand(
        "enable-order-insensitive", [SECOND_STUDENT_ID, STUDENT_ID]
      ));
      return retry.status === "idempotent" && retry.receipt.outcome === "applied";
    }),
    check("coins: activation rejects duplicate, empty, dangerous and overlong student IDs", () => {
      const invalidLists = [
        [STUDENT_ID, STUDENT_ID],
        [""],
        ["constructor"],
        ["s".repeat(DEFAULT_COIN_LIMITS.maxIdentifierLength + 1)],
        Array.from({ length: DEFAULT_COIN_LIMITS.maxStudents + 1 }, (_, index) => `student-${index}`),
      ];
      return invalidLists.every((studentIds, index) => {
        const result = setCoinsEnabled(disabledState(), enableCommand(`invalid-students-${index}`, studentIds));
        return result.status === "rejected" && !result.recorded;
      });
    }),
    check("coins: materially different activation reuse conflicts", () => {
      const first = setCoinsEnabled(disabledState(), enableCommand(
        "enable-divergent-students", [STUDENT_ID]
      ));
      if (first.status !== "applied") return false;
      const retry = setCoinsEnabled(first.state, enableCommand(
        "enable-divergent-students", [STUDENT_ID, SECOND_STUDENT_ID]
      ));
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: disabling preserves settings, balances, catalog and history", () => {
      const before = stateWithRewardAndBalance();
      const disabled = setCoinsEnabled(before, {
        classroomId: CLASSROOM_ID,
        operationId: "disable-preserve",
        enabled: false,
        studentIds: [],
        occurredAt: SECOND_INSTANT,
      });
      return disabled.status === "applied"
        && !disabled.state.settings.enabled
        && disabled.state.settings.firstActivatedAt === before.settings.firstActivatedAt
        && disabled.state.balances[0].balance === before.balances[0].balance
        && disabled.state.rewards[0].id === before.rewards[0].id
        && disabled.state.movements.length === before.movements.length;
    }),
    check("coins: reactivation continues from preserved state", () => {
      const before = stateWithRewardAndBalance();
      const disabled = mustApply(setCoinsEnabled(before, {
        classroomId: CLASSROOM_ID,
        operationId: "disable-reactivate",
        enabled: false,
        studentIds: [],
        occurredAt: SECOND_INSTANT,
      }));
      const reactivated = setCoinsEnabled(disabled, {
        classroomId: CLASSROOM_ID,
        operationId: "reactivate-preserved",
        enabled: true,
        studentIds: [STUDENT_ID],
        occurredAt: THIRD_INSTANT,
      });
      return reactivated.status === "applied"
        && reactivated.state.settings.enabled
        && getCoinBalance(reactivated.state, STUDENT_ID) === getCoinBalance(before, STUDENT_ID)
        && reactivated.state.movements.length === before.movements.length;
    }),
    check("coins: default action mirrors the signed crystal amount", () => {
      const result = applyCoinAction(enabledState(), actionCommand("action-default", 3));
      const movement = result.status === "applied" ? result.state.movements[0] : undefined;
      return movement?.requestedAmount === 3
        && movement.appliedAmount === 3
        && movement.cause.type === "action"
        && movement.cause.configurationMode === "same-as-crystals";
    }),
    check("coins: custom magnitude derives the positive action sign", () => {
      const result = applyCoinAction(enabledState(), {
        ...actionCommand("action-custom-positive", 1),
        coinConfiguration: { mode: "custom", magnitude: 7 },
      });
      return result.status === "applied" && result.state.movements[0].appliedAmount === 7;
    }),
    check("coins: custom magnitude derives the negative action sign", () => {
      const funded = fundedState(10);
      const result = applyCoinAction(funded, {
        ...actionCommand("action-custom-negative", -1),
        coinConfiguration: { mode: "custom", magnitude: 4 },
      });
      return result.status === "applied" && lastMovement(result.state).appliedAmount === -4;
    }),
    check("coins: no-coins action creates no movement", () => {
      const state = enabledState();
      const result = applyCoinAction(state, {
        ...actionCommand("action-no-coins", 5),
        coinConfiguration: { mode: "no-coins" },
      });
      return result.status === "applied"
        && result.state.movements.length === state.movements.length
        && result.state.revision === state.revision + 1;
    }),
    check("coins: contradictory signed custom magnitude is rejected", () => {
      const command = {
        ...actionCommand("action-bad-sign", 1),
        coinConfiguration: { mode: "custom", magnitude: -2 },
      } as unknown as ApplyCoinActionCommand;
      const result = applyCoinAction(enabledState(), command);
      return result.status === "rejected"
        && result.failure.code === "invalid-action-configuration";
    }),
    check("coins: zero action cannot imply a custom monetary effect", () => {
      const result = applyCoinAction(enabledState(), {
        ...actionCommand("action-zero-custom", 0),
        coinConfiguration: { mode: "custom", magnitude: 2 },
      });
      return result.status === "rejected" && result.failure.code === "zero-action-custom-amount";
    }),
    check("coins: zero default action is journaled without movement", () => {
      const state = enabledState();
      const result = applyCoinAction(state, actionCommand("action-zero-default", 0));
      return result.status === "applied"
        && result.state.movements.length === state.movements.length
        && result.state.idempotency.at(-1)?.operationId === "action-zero-default";
    }),
    check("coins: negative action clamps at zero and records requested versus applied", () => {
      const result = applyCoinAction(fundedState(1), actionCommand("action-clamp", -3));
      const movement = result.status === "applied" ? lastMovement(result.state) : undefined;
      return movement?.requestedAmount === -3
        && movement.appliedAmount === -1
        && movement.balanceAfter === 0;
    }),
    check("coins: negative action at zero never stores negative zero", () => {
      const result = applyCoinAction(enabledState(), actionCommand("action-no-negative-zero", -3));
      const movement = result.status === "applied" ? lastMovement(result.state) : undefined;
      return movement?.appliedAmount === 0
        && !Object.is(movement.appliedAmount, -0)
        && !Object.is(movement.balanceAfter, -0);
    }),
    check("coins: disabled action creates no movement and remains non-retroactive", () => {
      const initial = disabledState();
      const action = actionCommand("action-while-disabled", 5);
      const ignored = applyCoinAction(initial, action);
      if (ignored.status !== "applied" || ignored.state.movements.length !== 0) return false;
      const activated = mustApply(setCoinsEnabled(
        ignored.state,
        enableCommand("enable-after-disabled-action", [STUDENT_ID])
      ));
      const retry = applyCoinAction(activated, action);
      return retry.status === "idempotent"
        && retry.state.movements.length === 0
        && getCoinBalance(retry.state, STUDENT_ID) === 0;
    }),
    check("coins: legacy missing configuration resolves without rewriting the command", () => {
      const command = actionCommand("action-legacy", 2);
      const result = applyCoinAction(enabledState(), command);
      const movement = result.status === "applied" ? result.state.movements[0] : undefined;
      return !("coinConfiguration" in command)
        && movement?.cause.type === "action"
        && movement.cause.usedLegacyDefault;
    }),
    check("coins: action double click is idempotent", () => {
      const command = actionCommand("action-double-click", 2);
      const first = applyCoinAction(enabledState(), command);
      if (first.status !== "applied") return false;
      const second = applyCoinAction(first.state, command);
      return second.status === "idempotent"
        && second.state.movements.length === 1
        && getCoinBalance(second.state, STUDENT_ID) === 2;
    }),
    check("coins: action fingerprint rejects reused action, student, amount and configuration material", () => {
      const command = actionCommand("action-material-conflict", 2);
      const first = applyCoinAction(enabledState([STUDENT_ID, SECOND_STUDENT_ID]), command);
      if (first.status !== "applied") return false;
      const variants: ApplyCoinActionCommand[] = [
        { ...command, actionId: "action-b" },
        { ...command, studentId: SECOND_STUDENT_ID },
        { ...command, crystalAmount: 3 },
        { ...command, coinConfiguration: { mode: "custom", magnitude: 2 } },
      ];
      return variants.every((variant) => {
        const retry = applyCoinAction(first.state, variant);
        return retry.status === "rejected" && retry.failure.code === "operation-conflict";
      });
    }),
    check("coins: action magnitude boundaries reject unsafe or overflowing input", () => {
      const invalid = [
        DEFAULT_COIN_LIMITS.maxAmount + 1,
        Number.MAX_SAFE_INTEGER,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];
      return invalid.every((magnitude, index) => {
        const result = applyCoinAction(enabledState(), {
          ...actionCommand(`action-invalid-magnitude-${index}`, 1),
          coinConfiguration: { mode: "custom", magnitude },
        });
        return result.status === "rejected" && !result.recorded;
      });
    }),
    check("coins: action retry survives JSON serialization", () => {
      const command = actionCommand("action-persisted-retry", 2);
      const first = applyCoinAction(enabledState(), command);
      if (first.status !== "applied") return false;
      const restored = JSON.parse(JSON.stringify(first.state)) as CoinClassState;
      const retry = applyCoinAction(restored, { ...command, occurredAt: SECOND_INSTANT });
      return retry.status === "idempotent" && retry.state.movements.length === 1;
    }),
    check("coins: divergent action retry is rejected", () => {
      const first = applyCoinAction(enabledState(), actionCommand("action-divergent", 2));
      if (first.status !== "applied") return false;
      const retry = applyCoinAction(first.state, actionCommand("action-divergent", 3));
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: reward can be created with caller ID and stable appended order", () => {
      const result = createCoinReward(enabledState(), rewardCommand("reward-create", "reward-a", 5));
      return result.status === "applied"
        && result.state.rewards[0].id === "reward-a"
        && result.state.rewards[0].order === 0
        && result.state.rewards[0].revision === 1;
    }),
    check("coins: reward can be edited without changing its stable ID", () => {
      const created = stateWithReward();
      const result = editCoinReward(created, {
        ...rewardCommand("reward-edit", "reward-a", 8),
        name: "Premio editado",
      });
      return result.status === "applied"
        && result.state.rewards[0].id === "reward-a"
        && result.state.rewards[0].name === "Premio editado"
        && result.state.rewards[0].price === 8
        && result.state.rewards[0].revision === 2;
    }),
    check("coins: complete reward order is deterministic", () => {
      let state = stateWithReward();
      state = mustApply(createCoinReward(state, rewardCommand("create-reward-b", "reward-b", 3)));
      const result = reorderCoinRewards(state, {
        classroomId: CLASSROOM_ID,
        operationId: "reorder-rewards",
        orderedRewardIds: ["reward-b", "reward-a"],
        occurredAt: SECOND_INSTANT,
      });
      return result.status === "applied"
        && result.state.rewards.map((entry) => entry.id).join(",") === "reward-b,reward-a"
        && result.state.rewards.map((entry) => entry.order).join(",") === "0,1";
    }),
    check("coins: reward can be archived without deletion", () => {
      const result = archiveCoinReward(stateWithReward(), statusCommand("archive-reward"));
      return result.status === "applied"
        && result.state.rewards.length === 1
        && result.state.rewards[0].status === "archived";
    }),
    check("coins: archived reward can be restored", () => {
      const archived = mustApply(archiveCoinReward(stateWithReward(), statusCommand("archive-before-restore")));
      const result = restoreCoinReward(archived, statusCommand("restore-reward"));
      return result.status === "applied" && result.state.rewards[0].status === "active";
    }),
    check("coins: duplicate reward ID is rejected", () => {
      const result = createCoinReward(stateWithReward(), rewardCommand("duplicate-reward-op", "reward-a", 5));
      return result.status === "rejected" && result.failure.code === "duplicate-reward";
    }),
    check("coins: identical reward creation retry is idempotent", () => {
      const command = rewardCommand("reward-create-retry", "reward-retry", 5);
      const first = createCoinReward(enabledState(), command);
      if (first.status !== "applied") return false;
      const retry = createCoinReward(first.state, { ...command, occurredAt: SECOND_INSTANT });
      return retry.status === "idempotent"
        && retry.state.rewards.length === 1
        && retry.state.rewards[0].createdAt === FIRST_INSTANT;
    }),
    check("coins: divergent reward creation retry is rejected", () => {
      const command = rewardCommand("reward-create-divergent", "reward-divergent", 5);
      const first = createCoinReward(enabledState(), command);
      if (first.status !== "applied") return false;
      const retry = createCoinReward(first.state, { ...command, price: 6 });
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: editing nonexistent reward is rejected", () => {
      const result = editCoinReward(enabledState(), rewardCommand("edit-missing", "missing-reward", 5));
      return result.status === "rejected" && result.failure.code === "reward-not-found";
    }),
    check("coins: incomplete reward order is rejected", () => {
      let state = stateWithReward();
      state = mustApply(createCoinReward(state, rewardCommand("order-add-b", "reward-b", 3)));
      const result = reorderCoinRewards(state, {
        classroomId: CLASSROOM_ID,
        operationId: "bad-order",
        orderedRewardIds: ["reward-a"],
        occurredAt: SECOND_INSTANT,
      });
      return result.status === "rejected" && result.failure.code === "invalid-reward-order";
    }),
    check("coins: reward order rejects extras and duplicates without partial mutation", () => {
      let state = stateWithReward();
      state = mustApply(createCoinReward(state, rewardCommand("order-extra-add-b", "reward-b", 3)));
      const variants = [
        ["reward-a", "reward-b", "reward-extra"],
        ["reward-a", "reward-a"],
      ];
      return variants.every((orderedRewardIds, index) => {
        const result = reorderCoinRewards(state, {
          classroomId: CLASSROOM_ID,
          operationId: `bad-order-variant-${index}`,
          orderedRewardIds,
          occurredAt: SECOND_INSTANT,
        });
        return result.status === "rejected"
          && result.state.rewards.map((entry) => entry.id).join(",") === "reward-a,reward-b";
      });
    }),
    check("coins: reward field limits are enforced", () => {
      const result = createCoinReward(enabledState(), {
        ...rewardCommand("long-reward", "reward-long", 2),
        name: "x".repeat(DEFAULT_COIN_LIMITS.maxRewardNameLength + 1),
      });
      return result.status === "rejected" && result.failure.code === "invalid-reward";
    }),
    check("coins: frozen reward inputs and state remain immutable", () => {
      const state = deepFreeze(enabledState());
      const command = deepFreeze(rewardCommand("frozen-reward", "reward-frozen", 4));
      const result = createCoinReward(state, command);
      return result.status === "applied"
        && state.rewards.length === 0
        && command.name === "Premio";
    }),
    check("coins: valid redemption charges current price and snapshots name and price", () => {
      const state = stateWithRewardAndBalance();
      const result = redeemCoinReward(state, redemptionCommand("redeem-valid", "redemption-valid"));
      const redemption = result.status === "applied" ? result.state.redemptions[0] : undefined;
      return redemption?.rewardNameSnapshot === "Premio"
        && redemption.rewardPriceSnapshot === 5
        && getCoinBalance(result.state, STUDENT_ID) === 5;
    }),
    check("coins: insufficient balance rejects redemption", () => {
      const result = redeemCoinReward(stateWithReward(), redemptionCommand("redeem-poor", "redemption-poor"));
      return result.status === "rejected" && result.failure.code === "insufficient-balance";
    }),
    check("coins: terminal insufficient-balance rejection survives later funding", () => {
      const command = redemptionCommand("redeem-terminal-poor", "redemption-terminal-poor");
      const first = redeemCoinReward(stateWithReward(), command);
      if (first.status !== "rejected" || !first.recorded || first.receipt?.outcome !== "rejected") return false;
      const restored = JSON.parse(JSON.stringify(first.state)) as CoinClassState;
      const funded = adjustCoinBalance(restored, adjustmentCommand(
        "fund-after-terminal-rejection", 10, "Financiación posterior"
      ));
      if (funded.status !== "applied") return false;
      const retry = redeemCoinReward(funded.state, command);
      return retry.status === "idempotent"
        && retry.receipt.outcome === "rejected"
        && retry.receipt.failureCode === "insufficient-balance"
        && retry.state.redemptions.length === 0;
    }),
    check("coins: disabled class rejects redemption without a movement", () => {
      let state = stateWithRewardAndBalance();
      state = mustApply(setCoinsEnabled(state, {
        classroomId: CLASSROOM_ID,
        operationId: "disable-before-redemption",
        enabled: false,
        studentIds: [],
        occurredAt: SECOND_INSTANT,
      }));
      const movementCount = state.movements.length;
      const result = redeemCoinReward(state, redemptionCommand(
        "redeem-disabled",
        "redemption-disabled"
      ));
      return result.status === "rejected"
        && result.failure.code === "coins-disabled"
        && result.state.movements.length === movementCount;
    }),
    check("coins: archived reward rejects redemption", () => {
      let state = stateWithRewardAndBalance();
      state = mustApply(archiveCoinReward(state, statusCommand("archive-before-redemption")));
      const result = redeemCoinReward(state, redemptionCommand("redeem-archived", "redemption-archived"));
      return result.status === "rejected" && result.failure.code === "reward-archived";
    }),
    check("coins: archived-reward rejection cannot execute after restore", () => {
      const archived = mustApply(archiveCoinReward(stateWithRewardAndBalance(), statusCommand("archive-terminal")));
      const command = redemptionCommand("redeem-terminal-archived", "redemption-terminal-archived");
      const first = redeemCoinReward(archived, command);
      if (first.status !== "rejected" || !first.recorded) return false;
      const restored = restoreCoinReward(first.state, statusCommand("restore-after-terminal"));
      if (restored.status !== "applied") return false;
      const retry = redeemCoinReward(restored.state, command);
      return retry.status === "idempotent"
        && retry.receipt.failureCode === "reward-archived"
        && retry.state.redemptions.length === 0;
    }),
    check("coins: missing reward rejects redemption", () => {
      const result = redeemCoinReward(fundedState(10), {
        ...redemptionCommand("redeem-missing-reward", "redemption-missing-reward"),
        rewardId: "missing-reward",
      });
      return result.status === "rejected" && result.failure.code === "reward-not-found";
    }),
    check("coins: missing student rejects redemption", () => {
      const result = redeemCoinReward(stateWithRewardAndBalance(), {
        ...redemptionCommand("redeem-missing-student", "redemption-missing-student"),
        studentId: SECOND_STUDENT_ID,
      });
      return result.status === "rejected" && result.failure.code === "student-not-found";
    }),
    check("coins: reward edit does not rewrite historical redemption snapshot", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-snapshot", "redemption-snapshot")
      ));
      const edited = editCoinReward(redeemed, {
        ...rewardCommand("edit-after-redemption", "reward-a", 9),
        name: "Nuevo nombre",
        occurredAt: THIRD_INSTANT,
      });
      return edited.status === "applied"
        && edited.state.rewards[0].price === 9
        && edited.state.redemptions[0].rewardPriceSnapshot === 5
        && edited.state.redemptions[0].rewardNameSnapshot === "Premio";
    }),
    check("coins: redemption retry keeps original snapshot after price edit and other movement", () => {
      const command = redemptionCommand("redeem-stable-snapshot", "redemption-stable-snapshot");
      const redeemed = redeemCoinReward(stateWithRewardAndBalance(), command);
      if (redeemed.status !== "applied") return false;
      const edited = editCoinReward(redeemed.state, {
        ...rewardCommand("edit-before-redemption-retry", "reward-a", 9),
        name: "Precio nuevo",
      });
      if (edited.status !== "applied") return false;
      const moved = applyCoinAction(edited.state, actionCommand("move-before-redemption-retry", 2));
      if (moved.status !== "applied") return false;
      const retry = redeemCoinReward(moved.state, command);
      return retry.status === "idempotent"
        && retry.receipt.resultReference === "redemption-stable-snapshot"
        && retry.state.redemptions[0].rewardPriceSnapshot === 5
        && retry.state.redemptions.length === 1;
    }),
    check("coins: redemption double click is idempotent", () => {
      const command = redemptionCommand("redeem-double", "redemption-double");
      const first = redeemCoinReward(stateWithRewardAndBalance(), command);
      if (first.status !== "applied") return false;
      const retry = redeemCoinReward(first.state, command);
      return retry.status === "idempotent"
        && retry.state.redemptions.length === 1
        && retry.state.movements.filter((entry) => entry.cause.type === "redemption").length === 1;
    }),
    check("coins: persisted redemption retry is idempotent", () => {
      const command = redemptionCommand("redeem-persisted", "redemption-persisted");
      const first = redeemCoinReward(stateWithRewardAndBalance(), command);
      if (first.status !== "applied") return false;
      const restored = JSON.parse(JSON.stringify(first.state)) as CoinClassState;
      const retry = redeemCoinReward(restored, { ...command, occurredAt: THIRD_INSTANT });
      return retry.status === "idempotent" && retry.state.redemptions.length === 1;
    }),
    check("coins: divergent redemption retry is rejected", () => {
      const command = redemptionCommand("redeem-divergent", "redemption-divergent");
      const first = redeemCoinReward(stateWithRewardAndBalance(), command);
      if (first.status !== "applied") return false;
      const retry = redeemCoinReward(first.state, { ...command, reason: "different" });
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: redemption reversal restores exact original price with compensation", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-reverse", "redemption-reverse")
      ));
      const reversed = reverseCoinRedemption(redeemed, reversalCommand("reverse-valid", "reversal-valid", "redemption-reverse"));
      const movement = reversed.status === "applied" ? lastMovement(reversed.state) : undefined;
      return reversed.status === "applied"
        && getCoinBalance(reversed.state, STUDENT_ID) === 10
        && movement?.appliedAmount === 5
        && movement.cause.type === "redemption-reversal"
        && movement.cause.originalMovementId === "redeem-reverse";
    }),
    check("coins: reversal never mutates original redemption or movement", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-immutable", "redemption-immutable")
      ));
      const originalRedemption = JSON.stringify(redeemed.redemptions[0]);
      const originalMovement = JSON.stringify(redeemed.movements.find((entry) => entry.id === "redeem-immutable"));
      const reversed = reverseCoinRedemption(redeemed, reversalCommand("reverse-immutable", "reversal-immutable", "redemption-immutable"));
      return reversed.status === "applied"
        && JSON.stringify(reversed.state.redemptions[0]) === originalRedemption
        && JSON.stringify(reversed.state.movements.find((entry) => entry.id === "redeem-immutable")) === originalMovement;
    }),
    check("coins: reversal after reward edit and archive refunds the historical price", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redeem-before-edit-archive", "redemption-before-edit-archive")
      ));
      const edited = mustApply(editCoinReward(redeemed, {
        ...rewardCommand("edit-before-reversal", "reward-a", 9),
        name: "Premio cambiado",
      }));
      const archived = mustApply(archiveCoinReward(edited, statusCommand("archive-before-reversal")));
      const reversed = reverseCoinRedemption(archived, reversalCommand(
        "reverse-after-edit-archive", "reversal-after-edit-archive", "redemption-before-edit-archive"
      ));
      return reversed.status === "applied"
        && lastMovement(reversed.state).appliedAmount === 5
        && getCoinBalance(reversed.state, STUDENT_ID) === 10;
    }),
    check("coins: second differently identified reversal is rejected", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-once", "redemption-once")
      ));
      const once = mustApply(reverseCoinRedemption(
        redeemed,
        reversalCommand("reverse-once", "reversal-once", "redemption-once")
      ));
      const twice = reverseCoinRedemption(
        once,
        reversalCommand("reverse-twice", "reversal-twice", "redemption-once")
      );
      return twice.status === "rejected" && twice.failure.code === "redemption-already-reversed";
    }),
    check("coins: identical reversal retry is idempotent", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-retry-reverse", "redemption-retry-reverse")
      ));
      const command = reversalCommand("reverse-retry", "reversal-retry", "redemption-retry-reverse");
      const first = reverseCoinRedemption(redeemed, command);
      if (first.status !== "applied") return false;
      const retry = reverseCoinRedemption(first.state, { ...command, occurredAt: THIRD_INSTANT });
      return retry.status === "idempotent"
        && retry.state.redemptionReversals.length === 1;
    }),
    check("coins: divergent reversal retry is rejected", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(),
        redemptionCommand("redeem-divergent-reverse", "redemption-divergent-reverse")
      ));
      const command = reversalCommand(
        "reverse-divergent",
        "reversal-divergent",
        "redemption-divergent-reverse"
      );
      const first = reverseCoinRedemption(redeemed, command);
      if (first.status !== "applied") return false;
      const retry = reverseCoinRedemption(first.state, { ...command, reason: "otro motivo" });
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: positive administrative adjustment is traceable", () => {
      const result = adjustCoinBalance(enabledState(), adjustmentCommand("adjust-positive", 6, "Corrección positiva"));
      const movement = result.status === "applied" ? result.state.movements[0] : undefined;
      return movement?.requestedAmount === 6
        && movement.appliedAmount === 6
        && movement.cause.type === "administrative-adjustment"
        && movement.cause.reason === "Corrección positiva";
    }),
    check("coins: negative administrative adjustment clamps at zero", () => {
      const result = adjustCoinBalance(fundedState(2), adjustmentCommand("adjust-negative", -5, "Corrección negativa"));
      const movement = result.status === "applied" ? lastMovement(result.state) : undefined;
      return movement?.requestedAmount === -5
        && movement.appliedAmount === -2
        && movement.balanceAfter === 0;
    }),
    check("coins: negative administrative adjustment at zero never stores negative zero", () => {
      const result = adjustCoinBalance(enabledState(), adjustmentCommand(
        "adjust-no-negative-zero", -5, "Corrección a cero"
      ));
      const movement = result.status === "applied" ? lastMovement(result.state) : undefined;
      return movement?.appliedAmount === 0 && !Object.is(movement.appliedAmount, -0);
    }),
    check("coins: administrative adjustment requires a non-empty reason", () => {
      const result = adjustCoinBalance(enabledState(), adjustmentCommand("adjust-empty-reason", 1, "   "));
      return result.status === "rejected" && result.failure.code === "invalid-reason";
    }),
    check("coins: administrative adjustment retry is idempotent", () => {
      const command = adjustmentCommand("adjust-retry", 3, "Corrección");
      const first = adjustCoinBalance(enabledState(), command);
      if (first.status !== "applied") return false;
      const retry = adjustCoinBalance(first.state, command);
      return retry.status === "idempotent" && retry.state.movements.length === 1;
    }),
    check("coins: divergent administrative retry is rejected", () => {
      const first = adjustCoinBalance(enabledState(), adjustmentCommand("adjust-divergent", 3, "Corrección"));
      if (first.status !== "applied") return false;
      const retry = adjustCoinBalance(first.state, adjustmentCommand("adjust-divergent", 4, "Corrección"));
      return retry.status === "rejected" && retry.failure.code === "operation-conflict";
    }),
    check("coins: disabled administrative adjustment is rejected", () => {
      const result = adjustCoinBalance(disabledState(), adjustmentCommand("adjust-disabled", 3, "Corrección"));
      return result.status === "rejected" && result.failure.code === "coins-disabled";
    }),
    check("coins: disabled rejection cannot execute after activation", () => {
      const command = adjustmentCommand("adjust-terminal-disabled", 3, "Corrección");
      const first = adjustCoinBalance(disabledState(), command);
      if (first.status !== "rejected" || !first.recorded) return false;
      const activated = setCoinsEnabled(first.state, enableCommand("enable-after-terminal", [STUDENT_ID]));
      if (activated.status !== "applied") return false;
      const retry = adjustCoinBalance(activated.state, command);
      return retry.status === "idempotent"
        && retry.receipt.failureCode === "coins-disabled"
        && getCoinBalance(retry.state, STUDENT_ID) === 0;
    }),
    check("coins: missing-student rejection cannot execute after registration", () => {
      const command = { ...actionCommand("action-terminal-missing", 4), studentId: SECOND_STUDENT_ID };
      const first = applyCoinAction(enabledState(), command);
      if (first.status !== "rejected" || !first.recorded) return false;
      const registered = registerCoinStudent(first.state, {
        classroomId: CLASSROOM_ID,
        operationId: "register-after-terminal",
        studentId: SECOND_STUDENT_ID,
      });
      if (registered.status !== "applied") return false;
      const retry = applyCoinAction(registered.state, command);
      return retry.status === "idempotent"
        && retry.receipt.failureCode === "student-not-found"
        && getCoinBalance(retry.state, SECOND_STUDENT_ID) === 0;
    }),
    check("coins: domain limit rejection consumes the accepted operation identity", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxRewards: 1 };
      const state = stateWithReward();
      const command = rewardCommand("reward-terminal-limit", "reward-over-limit", 2);
      const first = createCoinReward(state, command, limits);
      if (first.status !== "rejected" || !first.recorded || first.failure.code !== "limit-exceeded") return false;
      const retry = createCoinReward(first.state, command, limits);
      return retry.status === "idempotent" && retry.receipt.failureCode === "limit-exceeded";
    }),
    check("coins: invalid input is unrecorded and may be corrected under the same operation ID", () => {
      const invalid = applyCoinAction(enabledState(), actionCommand("correct-invalid-input", -0));
      if (invalid.status !== "rejected" || invalid.recorded || invalid.state.revision !== 1) return false;
      const corrected = applyCoinAction(invalid.state, actionCommand("correct-invalid-input", 1));
      return corrected.status === "applied" && lastMovement(corrected.state).appliedAmount === 1;
    }),
    check("coins: tampered state with stale checksum is rejected", () => {
      const state = fundedState(4);
      const tampered = {
        ...state,
        balances: [{ ...state.balances[0], balance: 999 }],
      };
      return validateCoinClassState(tampered).status === "invalid";
    }),
    check("coins: recomputed checksum cannot hide inconsistent balance history", () => {
      const state = fundedState(4);
      const material = Object.fromEntries(
        Object.entries(state).filter(([key]) => key !== "integrity")
      ) as Omit<CoinClassState, "integrity">;
      const resealed = sealCoinClassState({
        ...material,
        balances: [{ ...state.balances[0], balance: 999 }],
      });
      return resealed.status === "invalid";
    }),
    check("coins: recomputed checksum cannot hide a deleted movement", () => {
      const state = fundedState(4);
      return validateCoinClassState(rechecksum({ ...state, movements: [] })).status === "invalid";
    }),
    check("coins: recomputed checksum cannot hide duplicated or reordered movements", () => {
      const state = mustApply(applyCoinAction(fundedState(4), actionCommand("second-history", 1)));
      const duplicated = rechecksum({ ...state, movements: [...state.movements, state.movements[0]] });
      const reordered = rechecksum({ ...state, movements: [...state.movements].reverse() });
      return validateCoinClassState(duplicated).status === "invalid"
        && validateCoinClassState(reordered).status === "invalid";
    }),
    check("coins: recomputed checksum rejects impossible partial positive movements", () => {
      const state = fundedState(4);
      const movement = state.movements[0];
      const tampered = rechecksum({
        ...state,
        balances: [{ ...state.balances[0], balance: 3 }],
        movements: [{ ...movement, requestedAmount: 4, appliedAmount: 3, balanceAfter: 3 }],
      });
      return validateCoinClassState(tampered).status === "invalid";
    }),
    check("coins: recomputed checksum cannot hide orphan redemption or compensation records", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redeem-orphan-check", "redemption-orphan-check")
      ));
      const withoutRedemptionMovement = rechecksum({
        ...redeemed,
        movements: redeemed.movements.filter((entry) => entry.id !== "redeem-orphan-check"),
      });
      const reversed = mustApply(reverseCoinRedemption(
        redeemed, reversalCommand("reverse-orphan-check", "reversal-orphan-check", "redemption-orphan-check")
      ));
      const withoutCompensation = rechecksum({
        ...reversed,
        movements: reversed.movements.filter((entry) => entry.id !== "reverse-orphan-check"),
      });
      return validateCoinClassState(withoutRedemptionMovement).status === "invalid"
        && validateCoinClassState(withoutCompensation).status === "invalid";
    }),
    check("coins: recomputed checksum rejects crossed causal references and double reversal", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redeem-crossed", "redemption-crossed")
      ));
      const crossed = rechecksum({
        ...redeemed,
        redemptions: [{ ...redeemed.redemptions[0], movementId: "fund-10" }],
      });
      const reversed = mustApply(reverseCoinRedemption(
        redeemed, reversalCommand("reverse-crossed", "reversal-crossed", "redemption-crossed")
      ));
      const doubled = rechecksum({
        ...reversed,
        redemptionReversals: [...reversed.redemptionReversals, {
          ...reversed.redemptionReversals[0],
          id: "reversal-crossed-duplicate",
        }],
      });
      return validateCoinClassState(crossed).status === "invalid"
        && validateCoinClassState(doubled).status === "invalid";
    }),
    check("coins: recomputed checksum rejects altered snapshot price", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redeem-price-tamper", "redemption-price-tamper")
      ));
      const tampered = rechecksum({
        ...redeemed,
        redemptions: [{ ...redeemed.redemptions[0], rewardPriceSnapshot: 4 }],
      });
      return validateCoinClassState(tampered).status === "invalid";
    }),
    check("coins: checksum is detection, not authentication of a consistently rewritten snapshot name", () => {
      const redeemed = mustApply(redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redeem-auth-boundary", "redemption-auth-boundary")
      ));
      const rewritten = rechecksum({
        ...redeemed,
        redemptions: [{ ...redeemed.redemptions[0], rewardNameSnapshot: "Nombre falsificado" }],
      });
      return validateCoinClassState(rewritten).status === "valid";
    }),
    check("coins: dangling journal result references are rejected", () => {
      const state = fundedState(4);
      const last = state.idempotency.length - 1;
      const journal = state.idempotency.map((entry, index) => index === last
        ? { ...entry, resultReference: "missing-movement" }
        : entry);
      return validateCoinClassState(rechecksum({ ...state, idempotency: journal })).status === "invalid";
    }),
    check("coins: reward metadata cannot borrow another reward operation", () => {
      let state = stateWithReward();
      state = mustApply(createCoinReward(state, rewardCommand("create-reward-link-b", "reward-link-b", 3)));
      const tampered = rechecksum({
        ...state,
        rewards: state.rewards.map((reward) => reward.id === "reward-a"
          ? { ...reward, lastOperationId: "create-reward-link-b" }
          : reward),
      });
      return validateCoinClassState(tampered).status === "invalid";
    }),
    check("coins: malformed journal fingerprint format is rejected", () => {
      const state = fundedState(4);
      const tampered = rechecksum({
        ...state,
        idempotency: state.idempotency.map((entry, index) => index === 0
          ? { ...entry, fingerprint: "coin-operation-fnv1a64-v1:not-a-hash" }
          : entry),
      });
      return validateCoinClassState(tampered).status === "invalid";
    }),
    check("coins: canonical fingerprints ignore object insertion order but preserve array order", () => {
      const first = createCoinOperationFingerprint({ material: { z: 1, a: 2 }, ids: ["a", "b"] });
      const same = createCoinOperationFingerprint({ ids: ["a", "b"], material: { a: 2, z: 1 } });
      const reordered = createCoinOperationFingerprint({ material: { a: 2, z: 1 }, ids: ["b", "a"] });
      return first.status === "calculated" && same.status === "calculated" && reordered.status === "calculated"
        && first.checksum === same.checksum && first.checksum !== reordered.checksum;
    }),
    check("coins: negative zero, decimals, NaN and infinities are rejected without throwing", () => {
      const state = fundedState(4);
      return [-0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].every((amount) => {
        const movement = { ...state.movements[0], appliedAmount: amount };
        return validateCoinClassState({ ...state, movements: [movement] }).status === "invalid";
      });
    }),
    check("coins: custom prototypes, accessors and unexpected structures never escape validation", () => {
      const state = fundedState(4);
      const custom = Object.assign(Object.create({ inherited: true }), state);
      const accessor = { ...state } as Record<string, unknown>;
      Object.defineProperty(accessor, "surprise", { enumerable: true, get() { throw new Error("getter"); } });
      const extra = rechecksum({ ...state, surprise: "unexpected" });
      return validateCoinClassState(custom).status === "invalid"
        && validateCoinClassState(accessor).status === "invalid"
        && validateCoinClassState(extra).status === "invalid";
    }),
    check("coins: dangerous identifier names are rejected", () => {
      return ["__proto__", "constructor", "prototype"].every((studentId) => {
        const result = registerCoinStudent(enabledState(), {
          classroomId: CLASSROOM_ID,
          operationId: `danger-${studentId.replaceAll("_", "x")}`,
          studentId,
        });
        return result.status === "rejected" && !result.recorded;
      });
    }),
    check("coins: excessive and deeply nested arrays are bounded before serialization", () => {
      const state = fundedState(4);
      const excessive = { ...state, balances: new Array(DEFAULT_COIN_LIMITS.maxStudents + 1).fill(state.balances[0]) };
      let nested: unknown = "leaf";
      for (let index = 0; index < 30; index += 1) nested = [nested];
      const deep = { ...state, settings: { ...state.settings, enabled: nested } };
      return validateCoinClassState(excessive).status === "invalid"
        && validateCoinClassState(deep).status === "invalid";
    }),
    check("coins: oversized nested text is rejected during structural preflight", () => {
      const state = stateWithReward();
      const oversized = {
        ...state,
        rewards: [{ ...state.rewards[0], name: "x".repeat(DEFAULT_COIN_LIMITS.maxPersistedCodeUnits + 1) }],
      };
      const result = validateCoinClassState(oversized);
      return result.status === "invalid" && result.failure.code === "size-limit-exceeded";
    }),
    check("coins: deeply frozen action inputs are safe and immutable", () => {
      const state = deepFreeze(enabledState());
      const command = deepFreeze(actionCommand("action-frozen", 2));
      const result = applyCoinAction(state, command);
      return result.status === "applied"
        && state.movements.length === 0
        && getCoinBalance(state, STUDENT_ID) === 0;
    }),
    check("coins: classroom commands are isolated", () => {
      const state = enabledState();
      const result = applyCoinAction(state, {
        ...actionCommand("other-class-action", 2),
        classroomId: "another-classroom",
      });
      return result.status === "rejected"
        && result.failure.code === "classroom-conflict"
        && state.movements.length === 0;
    }),
    check("coins: configured student count limit is enforced", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxStudents: 1 };
      const result = setCoinsEnabled(disabledState(limits), enableCommand(
        "enable-too-many-students",
        [STUDENT_ID, SECOND_STUDENT_ID]
      ), limits);
      return result.status === "rejected" && result.failure.code === "limit-exceeded";
    }),
    check("coins: movement ceiling rejects the next movement without partial balance change", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxMovements: 1 };
      const first = applyCoinAction(enabledState(), actionCommand("movement-limit-first", 1), limits);
      if (first.status !== "applied") return false;
      const second = applyCoinAction(first.state, actionCommand("movement-limit-second", 1), limits);
      return second.status === "rejected"
        && second.failure.code === "limit-exceeded"
        && second.recorded
        && second.state.movements.length === 1
        && getCoinBalance(second.state, STUDENT_ID) === 1;
    }),
    check("coins: redemption ceiling rejects the next redemption without partial debit", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxRedemptions: 1 };
      const first = redeemCoinReward(
        stateWithRewardAndBalance(), redemptionCommand("redemption-limit-first", "redemption-limit-first"), limits
      );
      if (first.status !== "applied") return false;
      const second = redeemCoinReward(
        first.state, redemptionCommand("redemption-limit-second", "redemption-limit-second"), limits
      );
      return second.status === "rejected"
        && second.failure.code === "limit-exceeded"
        && second.state.redemptions.length === 1
        && getCoinBalance(second.state, STUDENT_ID) === 5;
    }),
    check("coins: reversal ceiling rejects the next compensation without partial credit", () => {
      let state = stateWithRewardAndBalance();
      state = mustApply(redeemCoinReward(state, redemptionCommand("reverse-limit-redeem-a", "reverse-limit-redemption-a")));
      state = mustApply(redeemCoinReward(state, redemptionCommand("reverse-limit-redeem-b", "reverse-limit-redemption-b")));
      const limits = { ...DEFAULT_COIN_LIMITS, maxRedemptionReversals: 1 };
      const first = reverseCoinRedemption(state, reversalCommand(
        "reverse-limit-first", "reverse-limit-first", "reverse-limit-redemption-a"
      ), limits);
      if (first.status !== "applied") return false;
      const second = reverseCoinRedemption(first.state, reversalCommand(
        "reverse-limit-second", "reverse-limit-second", "reverse-limit-redemption-b"
      ), limits);
      return second.status === "rejected"
        && second.failure.code === "limit-exceeded"
        && second.state.redemptionReversals.length === 1
        && getCoinBalance(second.state, STUDENT_ID) === 5;
    }),
    check("coins: a full idempotency journal reports an unrecorded capacity rejection", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxIdempotencyOperations: 2 };
      const first = applyCoinAction(enabledState(), actionCommand("journal-limit-first", 1), limits);
      if (first.status !== "applied") return false;
      const second = applyCoinAction(first.state, actionCommand("journal-limit-second", 1), limits);
      return second.status === "rejected"
        && second.failure.code === "limit-exceeded"
        && !second.recorded
        && second.state.revision === 2;
    }),
    check("coins: invalid configured limits are rejected", () => {
      const limits = { ...DEFAULT_COIN_LIMITS, maxStudents: 0 };
      const created = createCoinClassState(CLASSROOM_ID, limits);
      return created.status === "rejected" && created.failure.code === "limit-exceeded";
    }),
    check("coins: movement history is append-only without automatic compaction", () => {
      const first = mustApply(applyCoinAction(enabledState(), actionCommand("append-action-1", 1)));
      const firstMovement = JSON.stringify(first.movements[0]);
      const second = applyCoinAction(first, actionCommand("append-action-2", 1));
      return second.status === "applied"
        && second.state.movements.length === 2
        && JSON.stringify(second.state.movements[0]) === firstMovement;
    }),
    check("coins: state contains no crystal, guardian, chest or curriculum payload", () => {
      const serialized = JSON.stringify(stateWithRewardAndBalance());
      return !serialized.includes("cristal")
        && !serialized.includes("guardian")
        && !serialized.includes("chest")
        && !serialized.includes("curriculum")
        && !serialized.includes("evidence")
        && !serialized.includes("attendance");
    }),
  ];
}

function disabledState(limits = DEFAULT_COIN_LIMITS): CoinClassState {
  const created = createCoinClassState(CLASSROOM_ID, limits);
  if (created.status !== "created") throw new Error(created.failure.message);
  return created.state;
}

function enabledState(studentIds: readonly string[] = [STUDENT_ID]): CoinClassState {
  return mustApply(setCoinsEnabled(
    disabledState(),
    enableCommand("enable-classroom", studentIds)
  ));
}

function fundedState(amount: number): CoinClassState {
  return mustApply(adjustCoinBalance(
    enabledState(),
    adjustmentCommand(`fund-${amount}`, amount, "Saldo de prueba")
  ));
}

function stateWithReward(): CoinClassState {
  return mustApply(createCoinReward(
    enabledState(),
    rewardCommand("create-reward-a", "reward-a", 5)
  ));
}

function stateWithRewardAndBalance(): CoinClassState {
  return mustApply(createCoinReward(
    fundedState(10),
    rewardCommand("create-reward-a", "reward-a", 5)
  ));
}

function enableCommand(operationId: string, studentIds: readonly string[]) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    enabled: true,
    studentIds,
    occurredAt: FIRST_INSTANT,
  } as const;
}

function actionCommand(operationId: string, crystalAmount: number): ApplyCoinActionCommand {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    studentId: STUDENT_ID,
    actionId: "action-a",
    crystalAmount,
    occurredAt: FIRST_INSTANT,
  };
}

function rewardCommand(
  operationId: string,
  rewardId: string,
  price: number
): CreateCoinRewardCommand {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    rewardId,
    name: "Premio",
    description: "Descripción mínima",
    price,
    occurredAt: FIRST_INSTANT,
  };
}

function statusCommand(operationId: string) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    rewardId: "reward-a",
    occurredAt: SECOND_INSTANT,
  } as const;
}

function redemptionCommand(operationId: string, redemptionId: string) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    redemptionId,
    studentId: STUDENT_ID,
    rewardId: "reward-a",
    occurredAt: SECOND_INSTANT,
  } as const;
}

function reversalCommand(operationId: string, reversalId: string, redemptionId: string) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    reversalId,
    redemptionId,
    occurredAt: THIRD_INSTANT,
  } as const;
}

function adjustmentCommand(operationId: string, requestedAmount: number, reason: string) {
  return {
    classroomId: CLASSROOM_ID,
    operationId,
    studentId: STUDENT_ID,
    requestedAmount,
    reason,
    occurredAt: FIRST_INSTANT,
  } as const;
}

function lastMovement(state: CoinClassState) {
  return state.movements[state.movements.length - 1];
}

function rechecksum(value: unknown): CoinClassState {
  const checksum = calculateCoinStateChecksum(value as CoinClassState);
  if (checksum.status !== "calculated") throw new Error(checksum.failure.message);
  return {
    ...(value as CoinClassState),
    integrity: { version: "coin-state-fnv1a64-v1", checksum: checksum.checksum },
  };
}

function mustApply(result: CoinOperationResult): CoinClassState {
  if (result.status !== "applied") {
    throw new Error(result.status === "rejected" ? result.failure.message : "Expected applied operation.");
  }
  return result.state;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

function check(name: string, predicate: () => boolean): CoinCoreDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
