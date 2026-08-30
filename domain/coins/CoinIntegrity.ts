import {
  COIN_CHECKSUM_VERSION,
  COIN_OPERATION_FINGERPRINT_VERSION,
  DEFAULT_COIN_LIMITS,
  type CoinClassState,
  type CoinFailure,
  type CoinLimits,
} from "./CoinContracts";

export interface CoinSerializedSize {
  readonly codeUnits: number;
  readonly utf8Bytes: number;
}

export type CoinSerializationResult =
  | { readonly status: "serialized"; readonly text: string }
  | { readonly status: "rejected"; readonly failure: CoinFailure };

export type CoinChecksumResult =
  | { readonly status: "calculated"; readonly checksum: string }
  | { readonly status: "rejected"; readonly failure: CoinFailure };

export type CoinLimitsResult =
  | { readonly status: "valid"; readonly limits: CoinLimits }
  | { readonly status: "rejected"; readonly failure: CoinFailure };

const LIMIT_KEYS = Object.keys(DEFAULT_COIN_LIMITS) as readonly (keyof CoinLimits)[];

export function resolveCoinLimits(
  overrides: Partial<CoinLimits> = {}
): CoinLimitsResult {
  try {
    const unknownKeys = Object.keys(overrides).filter(
      (key) => !Object.hasOwn(DEFAULT_COIN_LIMITS, key)
    );
    if (unknownKeys.length > 0) {
      return rejectedLimits(`Unknown coin limit: ${unknownKeys.join(", ")}.`);
    }

    const limits: CoinLimits = Object.freeze({ ...DEFAULT_COIN_LIMITS, ...overrides });
    for (const key of LIMIT_KEYS) {
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) {
        return rejectedLimits(`Coin limit ${key} must be a positive safe integer.`);
      }
    }
    if (limits.maxAmount > limits.maxBalance) {
      return rejectedLimits("maxAmount cannot exceed maxBalance.");
    }
    if (limits.maxPersistedCodeUnits > limits.maxTransitionPeakCodeUnits) {
      return rejectedLimits(
        "maxTransitionPeakCodeUnits cannot be smaller than maxPersistedCodeUnits."
      );
    }
    if (limits.maxPersistedUtf8Bytes > limits.maxTransitionPeakUtf8Bytes) {
      return rejectedLimits(
        "maxTransitionPeakUtf8Bytes cannot be smaller than maxPersistedUtf8Bytes."
      );
    }
    return { status: "valid", limits };
  } catch {
    return rejectedLimits("Coin limits could not be read safely.");
  }
}

/** Canonical JSON: object keys use code-point-independent ordinal comparison; arrays retain order. */
export function serializeCoinCanonicalValue(value: unknown): CoinSerializationResult {
  try {
    return {
      status: "serialized",
      text: serializeJsonValue(value, new Set<object>()),
    };
  } catch (error) {
    return {
      status: "rejected",
      failure: {
        code: "unexpected-input",
        message: error instanceof Error
          ? `The value is not canonical JSON: ${error.message}`
          : "The value is not canonical JSON.",
      },
    };
  }
}

export function createCoinOperationFingerprint(material: unknown): CoinChecksumResult {
  const serialized = serializeCoinCanonicalValue(material);
  if (serialized.status === "rejected") return serialized;
  return {
    status: "calculated",
    checksum: `${COIN_OPERATION_FINGERPRINT_VERSION}:${hashText(serialized.text)}`,
  };
}

export function calculateCoinStateChecksum(
  state: Omit<CoinClassState, "integrity"> | CoinClassState
): CoinChecksumResult {
  const material = isRecord(state) && Object.hasOwn(state, "integrity")
    ? Object.fromEntries(Object.keys(state)
        .filter((key) => key !== "integrity")
        .map((key) => [key, (state as unknown as Record<string, unknown>)[key]]))
    : state;
  const serialized = serializeCoinCanonicalValue(material);
  if (serialized.status === "rejected") return serialized;
  return {
    status: "calculated",
    checksum: `${COIN_CHECKSUM_VERSION}:${hashText(serialized.text)}`,
  };
}

export function measureCoinJsonText(text: string): CoinSerializedSize {
  let utf8Bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    if (first <= 0x7f) {
      utf8Bytes += 1;
    } else if (first <= 0x7ff) {
      utf8Bytes += 2;
    } else if (
      first >= 0xd800
      && first <= 0xdbff
      && index + 1 < text.length
      && text.charCodeAt(index + 1) >= 0xdc00
      && text.charCodeAt(index + 1) <= 0xdfff
    ) {
      utf8Bytes += 4;
      index += 1;
    } else {
      utf8Bytes += 3;
    }
  }
  return { codeUnits: text.length, utf8Bytes };
}

export function measureCoinSerializedJson(value: unknown):
  | { readonly status: "measured"; readonly serialized: string; readonly size: CoinSerializedSize }
  | { readonly status: "rejected"; readonly failure: CoinFailure } {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return {
        status: "rejected",
        failure: { code: "unexpected-input", message: "The value is not JSON serializable." },
      };
    }
    return { status: "measured", serialized, size: measureCoinJsonText(serialized) };
  } catch {
    return {
      status: "rejected",
      failure: { code: "unexpected-input", message: "The value is not JSON serializable." },
    };
  }
}

function serializeJsonValue(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("numbers must be finite");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`unsupported ${typeof value} value`);
  }
  if (seen.has(value)) throw new Error("circular references are not supported");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
    throw new Error("only arrays and plain objects are supported");
  }

  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((item) => serializeJsonValue(item, seen)).join(",")}]`;
  } else {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareStableText);
    result = `{${keys.map((key) => {
      if (record[key] === undefined) {
        throw new Error("undefined object properties are not supported");
      }
      return `${JSON.stringify(key)}:${serializeJsonValue(record[key], seen)}`;
    }).join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function hashText(text: string): string {
  let forward = 2166136261;
  let reverse = 3339675911;
  for (let index = 0; index < text.length; index += 1) {
    forward ^= text.charCodeAt(index);
    forward = Math.imul(forward, 16777619);
    reverse ^= text.charCodeAt(text.length - index - 1);
    reverse = Math.imul(reverse, 2246822519);
  }
  return `${(forward >>> 0).toString(16).padStart(8, "0")}${
    (reverse >>> 0).toString(16).padStart(8, "0")
  }`;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectedLimits(message: string): CoinLimitsResult {
  return {
    status: "rejected",
    failure: { code: "limit-exceeded", message },
  };
}
