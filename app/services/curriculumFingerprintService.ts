/** Serializes object properties deterministically while preserving array order. */
export function serializeCurriculumFingerprintValue(
  value: unknown,
  seen = new Set<object>()
): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (seen.has(value)) return '"[circular]"';
  seen.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map((item) => serializeCurriculumFingerprintValue(item, seen)).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
        `${JSON.stringify(key)}:${serializeCurriculumFingerprintValue(
          (value as Record<string, unknown>)[key],
          seen
        )}`
      ).join(",")}}`;
  seen.delete(value);
  return serialized;
}

/** Hashes already-canonical curriculum values without assigning semantic order to arrays. */
export function createCurriculumDeterministicFingerprint(value: unknown): string {
  const serialized = serializeCurriculumFingerprintValue(value);
  let forwardHash = 2166136261;
  let reverseHash = 3339675911;
  for (let index = 0; index < serialized.length; index += 1) {
    forwardHash ^= serialized.charCodeAt(index);
    forwardHash = Math.imul(forwardHash, 16777619);
    reverseHash ^= serialized.charCodeAt(serialized.length - index - 1);
    reverseHash = Math.imul(reverseHash, 2246822519);
  }
  return `${(forwardHash >>> 0).toString(36)}${(reverseHash >>> 0).toString(36)}`;
}
