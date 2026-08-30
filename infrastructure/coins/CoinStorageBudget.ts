import type { CoinClassState } from "../../domain/coins/CoinContracts";
import {
  measureCoinSerializedJson,
  type CoinSerializedSize,
} from "../../domain/coins/CoinIntegrity";

export interface CoinStoragePeakEstimate {
  readonly current: CoinSerializedSize;
  readonly next: CoinSerializedSize;
  /** Raw stored string plus a JSON-equivalent parsed representation. */
  readonly readPeak: CoinSerializedSize;
  /** Current string/object plus next object/string; not a claim about engine heap layout. */
  readonly readModifySerializePeak: CoinSerializedSize;
  readonly formula: "2*current + 2*next";
}

export type CoinStoragePeakEstimateResult =
  | { readonly status: "estimated"; readonly estimate: CoinStoragePeakEstimate }
  | {
      readonly status: "rejected";
      readonly message: string;
    };

/**
 * Provides deterministic JSON-equivalent budgeting. Actual JavaScript object and
 * localStorage overhead is runtime-specific, so this is an explicit approximation.
 */
export function estimateCoinStorageTransitionPeak(
  current: CoinClassState | null,
  next: CoinClassState
): CoinStoragePeakEstimateResult {
  const currentMeasurement = current === null
    ? { status: "measured" as const, size: { codeUnits: 0, utf8Bytes: 0 } }
    : measureCoinSerializedJson(current);
  const nextMeasurement = measureCoinSerializedJson(next);
  if (currentMeasurement.status === "rejected" || nextMeasurement.status === "rejected") {
    return { status: "rejected", message: "The monetary transition is not JSON serializable." };
  }
  const currentSize = currentMeasurement.size;
  const nextSize = nextMeasurement.size;
  return {
    status: "estimated",
    estimate: {
      current: currentSize,
      next: nextSize,
      readPeak: multiplySize(currentSize, 2),
      readModifySerializePeak: addSizes(
        multiplySize(currentSize, 2),
        multiplySize(nextSize, 2)
      ),
      formula: "2*current + 2*next",
    },
  };
}

function multiplySize(size: CoinSerializedSize, multiplier: number): CoinSerializedSize {
  return {
    codeUnits: size.codeUnits * multiplier,
    utf8Bytes: size.utf8Bytes * multiplier,
  };
}

function addSizes(left: CoinSerializedSize, right: CoinSerializedSize): CoinSerializedSize {
  return {
    codeUnits: left.codeUnits + right.codeUnits,
    utf8Bytes: left.utf8Bytes + right.utf8Bytes,
  };
}
