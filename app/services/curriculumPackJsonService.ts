import {
  CURRICULUM_SCHEMA_VERSION,
  type BasicKnowledge,
  type Criterion,
  type CurriculumPack,
  type CurriculumProvenance,
  type CurriculumSubject,
  type VersionedCurriculumData,
} from "../types/curriculum";
import {
  createCurriculumDeterministicFingerprint,
  serializeCurriculumFingerprintValue,
} from "./curriculumFingerprintService";
import { validateCurriculumData } from "./curriculumValidationService";

export const CURRICULUM_PACK_JSON_FORMAT = "cristalclass.curriculum-pack" as const;
export const CURRICULUM_PACK_JSON_SCHEMA_VERSION = 1 as const;
export const CURRICULUM_PACK_CHECKSUM_PREFIX = "curriculum-pack-content-v1:" as const;

/**
 * `contentChecksum` is an integrity fingerprint, not an authenticity primitive.
 *
 * The shared fingerprint service canonicalizes object keys, preserves array order,
 * then calculates two unsigned 32-bit rolling hashes over UTF-16 code units: a
 * forward FNV-1a-style pass (seed 2166136261, multiplier 16777619) and a reverse
 * pass (seed 3339675911, multiplier 2246822519). Their base-36 texts are
 * concatenated after `curriculum-pack-content-v1:`.
 *
 * It detects ordinary accidental changes and binds a preview to content, but it is
 * not collision resistant, is not a digital signature, proves no authorship, and
 * never makes an external catalog trusted. Exact identity also requires comparing
 * the complete canonical content representation.
 */
export const CURRICULUM_PACK_CHECKSUM_SEMANTICS = Object.freeze({
  algorithm: "dual-32-bit-utf16-rolling-fingerprint-v1",
  cryptographic: false,
  provesAuthorship: false,
  isDigitalSignature: false,
  establishesTrust: false,
  requiresCanonicalEqualityForIdentity: true,
});

/** Every listed array is order-significant, including `criterionIds`. */
export const CURRICULUM_PACK_ARRAY_ORDER_SEMANTICS = Object.freeze({
  subjects: "significant",
  criteria: "significant",
  basicKnowledge: "significant",
  criterionIds: "significant",
} as const);

export type CurriculumPackContentChecksum =
  `${typeof CURRICULUM_PACK_CHECKSUM_PREFIX}${string}`;

/**
 * Text limits are JavaScript UTF-16 code units, not Unicode code points or encoded
 * bytes. An astral character therefore consumes two units. Byte-size enforcement,
 * when needed at an I/O boundary, belongs to that boundary; this pure parser never
 * reads a Blob or file. Entity limits are explicit counts.
 */
export interface CurriculumPackJsonLimits {
  readonly maxJsonTextLength: number;
  readonly maxDepth: number;
  readonly maxSubjects: number;
  readonly maxCriteriaPerSubject: number;
  readonly maxCriteriaTotal: number;
  readonly maxBasicKnowledgePerSubject: number;
  readonly maxBasicKnowledgeTotal: number;
  readonly maxCriterionIdsPerBasicKnowledge: number;
  readonly maxIdentifierLength: number;
  readonly maxNameLength: number;
  readonly maxCodeLength: number;
  readonly maxTextLength: number;
  readonly maxVersionLength: number;
  readonly maxMetadataLength: number;
}

export const DEFAULT_CURRICULUM_PACK_JSON_LIMITS: CurriculumPackJsonLimits = Object.freeze({
  maxJsonTextLength: 2_000_000,
  maxDepth: 24,
  maxSubjects: 100,
  maxCriteriaPerSubject: 500,
  maxCriteriaTotal: 5_000,
  maxBasicKnowledgePerSubject: 1_000,
  maxBasicKnowledgeTotal: 10_000,
  maxCriterionIdsPerBasicKnowledge: 50,
  maxIdentifierLength: 200,
  maxNameLength: 300,
  maxCodeLength: 120,
  maxTextLength: 12_000,
  maxVersionLength: 120,
  maxMetadataLength: 500,
});

export interface CurriculumPackJsonOptions {
  readonly limits?: Partial<CurriculumPackJsonLimits>;
}

export interface SerializeCurriculumPackJsonOptions extends CurriculumPackJsonOptions {
  readonly exporterVersion?: string;
  /** `true` uses two spaces; a number must be an integer from zero to ten. */
  readonly pretty?: boolean | number;
}

export interface CurriculumPackJsonEnvelope {
  readonly format: typeof CURRICULUM_PACK_JSON_FORMAT;
  readonly schemaVersion: typeof CURRICULUM_PACK_JSON_SCHEMA_VERSION;
  readonly exportedAt: string;
  readonly exporterVersion?: string;
  /** Integrity fingerprint only; see `CURRICULUM_PACK_CHECKSUM_SEMANTICS`. */
  readonly contentChecksum: CurriculumPackContentChecksum;
  readonly pack: CurriculumPack;
}

export type CurriculumPackJsonIssueCode =
  | "duplicate-key"
  | "dangerous-key"
  | "unexpected-property"
  | "missing-property"
  | "invalid-type"
  | "invalid-number"
  | "invalid-string"
  | "normalization-required"
  | "invalid-date"
  | "invalid-schema-version"
  | "invalid-provenance"
  | "invalid-source-version"
  | "duplicate-id"
  | "duplicate-reference"
  | "broken-reference"
  | "external-code-used-as-identity"
  | "limit-exceeded";

export interface CurriculumPackJsonIssue {
  readonly code: CurriculumPackJsonIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface CurriculumPackJsonValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CurriculumPackJsonIssue[];
  readonly referenceIssues: readonly CurriculumPackJsonIssue[];
  readonly sourceVersionIssues: readonly CurriculumPackJsonIssue[];
  readonly limitIssues: readonly CurriculumPackJsonIssue[];
}

export type CurriculumPackJsonParseResult =
  | {
      readonly status: "duplicate-keys";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | {
      readonly status: "malformed-json";
      readonly message: string;
    }
  | {
      readonly status: "invalid-root";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | {
      readonly status: "unknown-format";
      readonly message: string;
      readonly foundFormat?: string;
    }
  | {
      readonly status: "unsupported-schema-version";
      readonly message: string;
      readonly foundSchemaVersion?: number;
      readonly supportedSchemaVersion: typeof CURRICULUM_PACK_JSON_SCHEMA_VERSION;
    }
  | {
      readonly status: "unsafe-structure";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | {
      readonly status: "checksum-mismatch";
      readonly message: string;
      readonly expectedChecksum: string;
      readonly foundChecksum: string;
    }
  | {
      readonly status: "invalid-pack";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | {
      readonly status: "broken-references";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | {
      readonly status: "limits-exceeded";
      readonly message: string;
      readonly issues: readonly CurriculumPackJsonIssue[];
    }
  | CurriculumPackJsonValidResult;

export interface CurriculumPackJsonValidResult {
  readonly status: "valid";
  readonly envelope: CurriculumPackJsonEnvelope;
  readonly pack: CurriculumPack;
  readonly contentChecksum: CurriculumPackContentChecksum;
  /** Exact collision-safe equality companion to the non-cryptographic checksum. */
  readonly canonicalContent: string;
}

export interface CurriculumJsonTextScanResult {
  readonly maximumDepth: number;
  readonly depthExceeded: boolean;
  readonly duplicateKeyIssues: readonly CurriculumPackJsonIssue[];
  readonly unsafeKeyIssues: readonly CurriculumPackJsonIssue[];
}

type PackInspection = CurriculumPackJsonValidationResult & {
  readonly pack: CurriculumPack | null;
};

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PROVENANCE_KINDS = new Set([
  "manual",
  "imported",
  "external",
  "shared",
  "legacy-provisional",
]);

export function resolveCurriculumPackJsonLimits(
  overrides: Partial<CurriculumPackJsonLimits> = {}
): CurriculumPackJsonLimits {
  const unknownKeys = Object.keys(overrides).filter(
    (key) => !Object.hasOwn(DEFAULT_CURRICULUM_PACK_JSON_LIMITS, key)
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown curriculum JSON limit: ${unknownKeys.join(", ")}.`);
  }

  const resolved = {
    ...DEFAULT_CURRICULUM_PACK_JSON_LIMITS,
    ...overrides,
  };
  Object.entries(resolved).forEach(([key, value]) => {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Curriculum JSON limit ${key} must be a positive safe integer.`);
    }
  });
  return Object.freeze(resolved);
}

/**
 * Serializes only the portable catalog projection. Runtime-only properties attached
 * to a pack object are intentionally not copied into the exchange envelope.
 */
export function serializeCurriculumPackToJson(
  pack: CurriculumPack,
  exportedAt: string,
  options: SerializeCurriculumPackJsonOptions = {}
): string {
  const limits = resolveCurriculumPackJsonLimits(options.limits);
  const inspection = inspectCurriculumPack(pack, limits, false);
  if (!inspection.valid || !inspection.pack) {
    throw new Error(formatValidationFailure("Cannot serialize an invalid curriculum pack", inspection));
  }
  const normalizedExportedAt = normalizeIsoInstant(exportedAt);
  if (!normalizedExportedAt) {
    throw new Error("A valid exportedAt ISO instant is required.");
  }
  const exporterVersion = readProgrammaticOptionalString(
    options.exporterVersion,
    limits.maxVersionLength,
    "exporterVersion"
  );
  const portablePack = projectCurriculumPack(inspection.pack);
  const envelope: CurriculumPackJsonEnvelope = {
    format: CURRICULUM_PACK_JSON_FORMAT,
    schemaVersion: CURRICULUM_PACK_JSON_SCHEMA_VERSION,
    exportedAt: normalizedExportedAt,
    ...(exporterVersion ? { exporterVersion } : {}),
    contentChecksum: calculateCurriculumPackContentChecksum(portablePack),
    pack: portablePack,
  };
  const canonical = serializeCurriculumFingerprintValue(envelope);
  const indentation = resolvePrettyIndentation(options.pretty);
  return indentation === 0
    ? canonical
    : JSON.stringify(JSON.parse(canonical) as unknown, null, indentation);
}

export function parseCurriculumPackJson(
  serialized: string,
  options: CurriculumPackJsonOptions = {}
): CurriculumPackJsonParseResult {
  const limits = resolveCurriculumPackJsonLimits(options.limits);
  if (typeof serialized !== "string") {
    return invalidRoot("Curriculum JSON input must be a string.", [issue(
      "invalid-type",
      "$",
      "Curriculum JSON input must be a string."
    )]);
  }
  if (serialized.length > limits.maxJsonTextLength) {
    return limitsExceeded([issue(
      "limit-exceeded",
      "$",
      `JSON text length ${serialized.length} exceeds ${limits.maxJsonTextLength}.`
    )]);
  }
  const structuralScan = scanCurriculumJsonText(serialized, limits.maxDepth);
  if (structuralScan.depthExceeded) {
    return limitsExceeded([issue(
      "limit-exceeded",
      "$",
      `JSON nesting depth exceeds ${limits.maxDepth}.`
    )]);
  }
  if (structuralScan.duplicateKeyIssues.length > 0) {
    return deepFreeze({
      status: "duplicate-keys",
      message: "Duplicate keys in the same JSON object are rejected before parsing.",
      issues: structuralScan.duplicateKeyIssues,
    });
  }
  if (structuralScan.unsafeKeyIssues.length > 0) {
    return deepFreeze({
      status: "unsafe-structure",
      message: "The JSON contains dangerous or invalid decoded object keys.",
      issues: structuralScan.unsafeKeyIssues,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return {
      status: "malformed-json",
      message: "The curriculum JSON text is malformed.",
    };
  }

  const unsafeIssues = inspectJsonSafety(parsed);
  if (unsafeIssues.length > 0) {
    return deepFreeze({
      status: "unsafe-structure",
      message: "The JSON contains dangerous keys, non-finite numbers, or invalid strings.",
      issues: unsafeIssues,
    });
  }
  if (!isJsonObject(parsed)) {
    return invalidRoot("The curriculum exchange root must be an object.", [issue(
      "invalid-type",
      "$",
      "The curriculum exchange root must be an object, not an array or primitive."
    )]);
  }
  if (!Object.hasOwn(parsed, "format") || typeof parsed.format !== "string") {
    return invalidRoot("The curriculum exchange format identifier is missing or invalid.", [issue(
      "invalid-type",
      "$.format",
      "A string format identifier is required."
    )]);
  }
  if (parsed.format !== CURRICULUM_PACK_JSON_FORMAT) {
    return deepFreeze({
      status: "unknown-format",
      message: "The JSON is not a recognized CristalClass curriculum pack.",
      ...(typeof parsed.format === "string" ? { foundFormat: parsed.format } : {}),
    });
  }
  if (
    !Object.hasOwn(parsed, "schemaVersion")
    || typeof parsed.schemaVersion !== "number"
    || !Number.isSafeInteger(parsed.schemaVersion)
  ) {
    return invalidRoot("The curriculum exchange schemaVersion is missing or invalid.", [issue(
      "invalid-type",
      "$.schemaVersion",
      "A numeric integer schemaVersion is required."
    )]);
  }
  if (parsed.schemaVersion !== CURRICULUM_PACK_JSON_SCHEMA_VERSION) {
    return deepFreeze({
      status: "unsupported-schema-version",
      message: "The curriculum exchange schema version is not supported and was not converted.",
      ...(typeof parsed.schemaVersion === "number"
        ? { foundSchemaVersion: parsed.schemaVersion }
        : {}),
      supportedSchemaVersion: CURRICULUM_PACK_JSON_SCHEMA_VERSION,
    });
  }

  const rootIssues: CurriculumPackJsonIssue[] = [];
  inspectObjectKeys(
    parsed,
    ["format", "schemaVersion", "exportedAt", "exporterVersion", "contentChecksum", "pack"],
    ["format", "schemaVersion", "exportedAt", "contentChecksum", "pack"],
    "$",
    rootIssues
  );
  inspectStringField(parsed, "exportedAt", "$", 64, rootIssues, { isoInstant: true });
  inspectStringField(parsed, "contentChecksum", "$", 200, rootIssues);
  if (
    typeof parsed.contentChecksum === "string"
    && !/^curriculum-pack-content-v1:[0-9a-z]{2,14}$/.test(parsed.contentChecksum)
  ) {
    rootIssues.push(issue(
      "invalid-string",
      "$.contentChecksum",
      "contentChecksum does not use the supported integrity-fingerprint format."
    ));
  }
  if (Object.hasOwn(parsed, "exporterVersion")) {
    inspectStringField(parsed, "exporterVersion", "$", limits.maxVersionLength, rootIssues);
  }
  const rootLimitIssues = rootIssues.filter((item) => item.code === "limit-exceeded");
  if (rootLimitIssues.length > 0) return limitsExceeded(rootLimitIssues);
  if (rootIssues.length > 0) {
    return invalidRoot("The curriculum exchange envelope is invalid.", rootIssues);
  }

  const inspection = inspectCurriculumPack(parsed.pack, limits, true);
  if (inspection.limitIssues.length > 0) return limitsExceeded(inspection.limitIssues);
  if (inspection.referenceIssues.length > 0) {
    return deepFreeze({
      status: "broken-references",
      message: "The curriculum pack contains broken criterion references.",
      issues: inspection.referenceIssues,
    });
  }
  if (!inspection.valid || !inspection.pack) {
    return deepFreeze({
      status: "invalid-pack",
      message: "The curriculum pack violates the native catalog contract.",
      issues: [...inspection.issues, ...inspection.sourceVersionIssues],
    });
  }

  const expectedChecksum = calculateCurriculumPackContentChecksum(inspection.pack);
  const foundChecksum = parsed.contentChecksum as CurriculumPackContentChecksum;
  if (expectedChecksum !== foundChecksum) {
    return deepFreeze({
      status: "checksum-mismatch",
      message: "The curriculum content checksum does not match the pack.",
      expectedChecksum,
      foundChecksum,
    });
  }

  const pack = deepFreeze(projectCurriculumPack(inspection.pack));
  const envelope = deepFreeze({
    format: CURRICULUM_PACK_JSON_FORMAT,
    schemaVersion: CURRICULUM_PACK_JSON_SCHEMA_VERSION,
    exportedAt: parsed.exportedAt as string,
    ...(typeof parsed.exporterVersion === "string"
      ? { exporterVersion: parsed.exporterVersion }
      : {}),
    contentChecksum: foundChecksum,
    pack,
  });
  return deepFreeze({
    status: "valid",
    envelope,
    pack,
    contentChecksum: foundChecksum,
    canonicalContent: serializeCurriculumPackContent(pack),
  });
}

/** Dates carried by the catalog are informative and do not identify its content. */
export function calculateCurriculumPackContentChecksum(
  pack: CurriculumPack
): CurriculumPackContentChecksum {
  const portablePack = projectCurriculumPack(pack);
  const content = Object.fromEntries(
    Object.entries(portablePack).filter(([key]) => key !== "createdAt" && key !== "updatedAt")
  );
  return `${CURRICULUM_PACK_CHECKSUM_PREFIX}${createCurriculumDeterministicFingerprint(content)}`;
}

export function validateCurriculumPackForJson(
  value: unknown,
  options: CurriculumPackJsonOptions = {}
): CurriculumPackJsonValidationResult {
  try {
    const inspection = inspectCurriculumPack(
      value,
      resolveCurriculumPackJsonLimits(options.limits),
      false
    );
    return deepFreeze({
      valid: inspection.valid,
      issues: inspection.issues,
      referenceIssues: inspection.referenceIssues,
      sourceVersionIssues: inspection.sourceVersionIssues,
      limitIssues: inspection.limitIssues,
    });
  } catch {
    return deepFreeze({
      valid: false,
      issues: [issue(
        "invalid-type",
        "pack",
        "Pack cannot be inspected safely; accessors and throwing proxies are not accepted."
      )],
      referenceIssues: [],
      sourceVersionIssues: [],
      limitIssues: [],
    });
  }
}

/**
 * Exact canonical comparison form shared by duplicate detection and preview binding.
 * Object keys are sorted, every pedagogical array (including criterionIds) preserves
 * its order, and informative pack timestamps are omitted. This exact string, not the
 * non-cryptographic checksum alone, decides content equality.
 */
export function serializeCurriculumPackContent(pack: CurriculumPack): string {
  const portablePack = projectCurriculumPack(pack);
  const content = Object.fromEntries(
    Object.entries(portablePack).filter(([key]) => key !== "createdAt" && key !== "updatedAt")
  );
  return serializeCurriculumFingerprintValue(content);
}

/** Exact content identity; deliberately never reduced to checksum equality. */
export function areCurriculumPacksCanonicallyEqual(
  left: CurriculumPack,
  right: CurriculumPack
): boolean {
  return serializeCurriculumPackContent(left) === serializeCurriculumPackContent(right);
}

export function projectCurriculumPack(pack: CurriculumPack): CurriculumPack {
  return {
    id: pack.id,
    schemaVersion: pack.schemaVersion,
    packageVersion: pack.packageVersion,
    name: pack.name,
    ...(pack.region !== undefined ? { region: pack.region } : {}),
    ...(pack.scope !== undefined ? { scope: pack.scope } : {}),
    ...(pack.stage !== undefined ? { stage: pack.stage } : {}),
    ...(pack.course !== undefined ? { course: pack.course } : {}),
    provenance: projectProvenance(pack.provenance),
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    subjects: pack.subjects.map(projectSubject),
  };
}

function inspectCurriculumPack(
  value: unknown,
  limits: CurriculumPackJsonLimits,
  rejectUnexpectedProperties: boolean
): PackInspection {
  const issues: CurriculumPackJsonIssue[] = [];
  const referenceIssues: CurriculumPackJsonIssue[] = [];
  const sourceVersionIssues: CurriculumPackJsonIssue[] = [];
  const limitIssues: CurriculumPackJsonIssue[] = [];
  const programmaticSafetyIssues = inspectProgrammaticJsonValueSafety(value, limits.maxDepth);
  if (programmaticSafetyIssues.length > 0) {
    issues.push(...programmaticSafetyIssues);
    return inspectionResult(null, issues, referenceIssues, sourceVersionIssues, limitIssues);
  }
  if (!isJsonObject(value)) {
    issues.push(issue("invalid-type", "pack", "Pack must be an object."));
    return inspectionResult(null, issues, referenceIssues, sourceVersionIssues, limitIssues);
  }

  inspectObjectKeys(
    value,
    [
      "id", "schemaVersion", "packageVersion", "name", "region", "scope", "stage",
      "course", "provenance", "createdAt", "updatedAt", "subjects",
    ],
    ["id", "schemaVersion", "packageVersion", "name", "provenance", "createdAt", "updatedAt", "subjects"],
    "pack",
    issues,
    rejectUnexpectedProperties
  );
  inspectStringField(value, "id", "pack", limits.maxIdentifierLength, issues);
  inspectStringField(value, "packageVersion", "pack", limits.maxVersionLength, issues);
  inspectStringField(value, "name", "pack", limits.maxNameLength, issues);
  (["region", "scope", "stage", "course"] as const).forEach((field) => {
    if (Object.hasOwn(value, field)) {
      inspectStringField(value, field, "pack", limits.maxMetadataLength, issues);
    }
  });
  inspectStringField(value, "createdAt", "pack", 64, issues, { isoInstant: true });
  inspectStringField(value, "updatedAt", "pack", 64, issues, { isoInstant: true });
  if (value.schemaVersion !== CURRICULUM_SCHEMA_VERSION) {
    issues.push(issue(
      "invalid-schema-version",
      "pack.schemaVersion",
      `Pack schemaVersion must be ${CURRICULUM_SCHEMA_VERSION}.`
    ));
  }
  inspectProvenance(value.provenance, limits, issues, rejectUnexpectedProperties);

  if (!Array.isArray(value.subjects)) {
    issues.push(issue("invalid-type", "pack.subjects", "Pack subjects must be an array."));
  } else {
    inspectEntityLimit(value.subjects.length, limits.maxSubjects, "pack.subjects", limitIssues);
    let criteriaTotal = 0;
    let knowledgeTotal = 0;
    value.subjects.forEach((subject, subjectIndex) => {
      const path = `pack.subjects[${subjectIndex}]`;
      if (!isJsonObject(subject)) {
        issues.push(issue("invalid-type", path, "Subject must be an object."));
        return;
      }
      inspectObjectKeys(
        subject,
        ["id", "externalCode", "legacySubjectId", "name", "criteria", "basicKnowledge"],
        ["id", "name", "criteria", "basicKnowledge"],
        path,
        issues,
        rejectUnexpectedProperties
      );
      inspectStringField(subject, "id", path, limits.maxIdentifierLength, issues);
      inspectStringField(subject, "name", path, limits.maxNameLength, issues);
      inspectOptionalStringFields(
        subject,
        path,
        [["externalCode", limits.maxCodeLength], ["legacySubjectId", limits.maxIdentifierLength]],
        issues
      );

      if (!Array.isArray(subject.criteria)) {
        issues.push(issue("invalid-type", `${path}.criteria`, "Criteria must be an array."));
      } else {
        criteriaTotal += subject.criteria.length;
        inspectEntityLimit(
          subject.criteria.length,
          limits.maxCriteriaPerSubject,
          `${path}.criteria`,
          limitIssues
        );
        subject.criteria.forEach((criterion, criterionIndex) => inspectCriterion(
          criterion,
          `${path}.criteria[${criterionIndex}]`,
          limits,
          issues,
          rejectUnexpectedProperties
        ));
      }

      if (!Array.isArray(subject.basicKnowledge)) {
        issues.push(issue(
          "invalid-type",
          `${path}.basicKnowledge`,
          "Basic knowledge must be an array."
        ));
      } else {
        knowledgeTotal += subject.basicKnowledge.length;
        inspectEntityLimit(
          subject.basicKnowledge.length,
          limits.maxBasicKnowledgePerSubject,
          `${path}.basicKnowledge`,
          limitIssues
        );
        subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => inspectBasicKnowledge(
          knowledge,
          `${path}.basicKnowledge[${knowledgeIndex}]`,
          limits,
          issues,
          referenceIssues,
          limitIssues,
          rejectUnexpectedProperties
        ));
      }
    });
    inspectEntityLimit(criteriaTotal, limits.maxCriteriaTotal, "pack.criteriaTotal", limitIssues);
    inspectEntityLimit(
      knowledgeTotal,
      limits.maxBasicKnowledgeTotal,
      "pack.basicKnowledgeTotal",
      limitIssues
    );
  }

  if (issues.length > 0 || limitIssues.length > 0) {
    return inspectionResult(null, issues, referenceIssues, sourceVersionIssues, limitIssues);
  }

  const pack = projectCurriculumPack(value as unknown as CurriculumPack);
  const sharedValidation = validateCurriculumData(createValidationAggregate([pack]), []);
  sharedValidation.issues.forEach((sharedIssue) => {
    const mapped = issue(
      sharedIssue.code === "missing-criterion-reference"
        ? "broken-reference"
        : sharedIssue.code === "duplicate-internal-id"
          ? "duplicate-id"
          : "external-code-used-as-identity",
      sharedIssue.path.replace(/^packs\[0\]/, "pack"),
      sharedIssue.message
    );
    if (sharedIssue.code === "missing-criterion-reference") referenceIssues.push(mapped);
    else issues.push(mapped);
  });
  sourceVersionIssues.push(...inspectSourceVersions(pack));
  return inspectionResult(pack, issues, referenceIssues, sourceVersionIssues, limitIssues);
}

function inspectProvenance(
  value: unknown,
  limits: CurriculumPackJsonLimits,
  issues: CurriculumPackJsonIssue[],
  rejectUnexpectedProperties: boolean
): void {
  if (!isJsonObject(value)) {
    issues.push(issue("invalid-type", "pack.provenance", "Provenance must be an object."));
    return;
  }
  inspectObjectKeys(
    value,
    ["kind", "sourceId", "sourceVersion", "label"],
    ["kind"],
    "pack.provenance",
    issues,
    rejectUnexpectedProperties
  );
  inspectStringField(value, "kind", "pack.provenance", limits.maxVersionLength, issues);
  if (typeof value.kind === "string" && !PROVENANCE_KINDS.has(value.kind)) {
    issues.push(issue(
      "invalid-provenance",
      "pack.provenance.kind",
      "Provenance kind is not supported."
    ));
  }
  inspectOptionalStringFields(
    value,
    "pack.provenance",
    [
      ["sourceId", limits.maxIdentifierLength],
      ["sourceVersion", limits.maxVersionLength],
      ["label", limits.maxMetadataLength],
    ],
    issues
  );
}

function inspectCriterion(
  value: unknown,
  path: string,
  limits: CurriculumPackJsonLimits,
  issues: CurriculumPackJsonIssue[],
  rejectUnexpectedProperties: boolean
): void {
  if (!isJsonObject(value)) {
    issues.push(issue("invalid-type", path, "Criterion must be an object."));
    return;
  }
  inspectObjectKeys(
    value,
    ["id", "externalCode", "sourceVersion", "title", "text"],
    ["id", "text"],
    path,
    issues,
    rejectUnexpectedProperties
  );
  inspectStringField(value, "id", path, limits.maxIdentifierLength, issues);
  inspectStringField(value, "text", path, limits.maxTextLength, issues);
  inspectOptionalStringFields(
    value,
    path,
    [
      ["externalCode", limits.maxCodeLength],
      ["sourceVersion", limits.maxVersionLength],
      ["title", limits.maxNameLength],
    ],
    issues
  );
}

function inspectBasicKnowledge(
  value: unknown,
  path: string,
  limits: CurriculumPackJsonLimits,
  issues: CurriculumPackJsonIssue[],
  referenceIssues: CurriculumPackJsonIssue[],
  limitIssues: CurriculumPackJsonIssue[],
  rejectUnexpectedProperties: boolean
): void {
  if (!isJsonObject(value)) {
    issues.push(issue("invalid-type", path, "Basic knowledge must be an object."));
    return;
  }
  inspectObjectKeys(
    value,
    ["id", "externalCode", "sourceVersion", "text", "criterionIds"],
    ["id", "text", "criterionIds"],
    path,
    issues,
    rejectUnexpectedProperties
  );
  inspectStringField(value, "id", path, limits.maxIdentifierLength, issues);
  inspectStringField(value, "text", path, limits.maxTextLength, issues);
  inspectOptionalStringFields(
    value,
    path,
    [["externalCode", limits.maxCodeLength], ["sourceVersion", limits.maxVersionLength]],
    issues
  );
  if (!Array.isArray(value.criterionIds)) {
    issues.push(issue("invalid-type", `${path}.criterionIds`, "criterionIds must be an array."));
    return;
  }
  inspectEntityLimit(
    value.criterionIds.length,
    limits.maxCriterionIdsPerBasicKnowledge,
    `${path}.criterionIds`,
    limitIssues
  );
  if (value.criterionIds.length === 0) {
    referenceIssues.push(issue(
      "broken-reference",
      `${path}.criterionIds`,
      "Basic knowledge must reference at least one criterion."
    ));
  }
  const seen = new Set<string>();
  value.criterionIds.forEach((criterionId, criterionIndex) => {
    const criterionPath = `${path}.criterionIds[${criterionIndex}]`;
    if (typeof criterionId !== "string") {
      issues.push(issue("invalid-type", criterionPath, "Criterion ID must be a string."));
      return;
    }
    inspectStringValue(criterionId, criterionPath, limits.maxIdentifierLength, issues);
    if (seen.has(criterionId)) {
      referenceIssues.push(issue(
        "duplicate-reference",
        criterionPath,
        `Criterion ${criterionId} is repeated in criterionIds.`
      ));
    }
    seen.add(criterionId);
  });
}

function inspectSourceVersions(pack: CurriculumPack): CurriculumPackJsonIssue[] {
  if (pack.provenance.kind !== "manual") return [];
  const packageRevision = parseManualRevision(pack.packageVersion);
  if (packageRevision === null) {
    return [issue(
      "invalid-source-version",
      "pack.packageVersion",
      "A manual pack packageVersion must use manual-rN."
    )];
  }
  const issues: CurriculumPackJsonIssue[] = [];
  pack.subjects.forEach((subject, subjectIndex) => {
    subject.criteria.forEach((criterion, criterionIndex) => {
      inspectManualEntityVersion(
        criterion.sourceVersion,
        packageRevision,
        `pack.subjects[${subjectIndex}].criteria[${criterionIndex}].sourceVersion`,
        issues
      );
    });
    subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
      inspectManualEntityVersion(
        knowledge.sourceVersion,
        packageRevision,
        `pack.subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].sourceVersion`,
        issues
      );
    });
  });
  return issues;
}

function inspectManualEntityVersion(
  value: string | undefined,
  packageRevision: number,
  path: string,
  issues: CurriculumPackJsonIssue[]
): void {
  const entityRevision = value === undefined ? null : parseManualRevision(value);
  if (entityRevision === null || entityRevision > packageRevision) {
    issues.push(issue(
      "invalid-source-version",
      path,
      "Manual entity sourceVersion must identify this pack revision or an earlier one."
    ));
  }
}

function inspectionResult(
  pack: CurriculumPack | null,
  issues: CurriculumPackJsonIssue[],
  referenceIssues: CurriculumPackJsonIssue[],
  sourceVersionIssues: CurriculumPackJsonIssue[],
  limitIssues: CurriculumPackJsonIssue[]
): PackInspection {
  const allLimitIssues = deduplicateIssues([
    ...limitIssues,
    ...issues.filter((item) => item.code === "limit-exceeded"),
    ...referenceIssues.filter((item) => item.code === "limit-exceeded"),
    ...sourceVersionIssues.filter((item) => item.code === "limit-exceeded"),
  ]);
  const nonLimitIssues = deduplicateIssues(
    issues.filter((item) => item.code !== "limit-exceeded")
  );
  const nonLimitReferenceIssues = deduplicateIssues(
    referenceIssues.filter((item) => item.code !== "limit-exceeded")
  );
  const nonLimitSourceVersionIssues = deduplicateIssues(
    sourceVersionIssues.filter((item) => item.code !== "limit-exceeded")
  );
  return {
    valid: nonLimitIssues.length === 0
      && nonLimitReferenceIssues.length === 0
      && nonLimitSourceVersionIssues.length === 0
      && allLimitIssues.length === 0,
    pack,
    issues: nonLimitIssues,
    referenceIssues: nonLimitReferenceIssues,
    sourceVersionIssues: nonLimitSourceVersionIssues,
    limitIssues: allLimitIssues,
  };
}

function createValidationAggregate(packs: readonly CurriculumPack[]): VersionedCurriculumData {
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "curriculum-pack-json-validation",
      status: "inactive",
      activeProfileId: null,
    },
    packs,
    profiles: [],
    actionLinks: [],
  };
}

function inspectObjectKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  issues: CurriculumPackJsonIssue[],
  rejectUnexpectedProperties = true
): void {
  if (rejectUnexpectedProperties) {
    Object.keys(value).forEach((key) => {
      if (!allowed.includes(key)) {
        issues.push(issue(
          "unexpected-property",
          `${path}.${key}`,
          `Property ${key} is not part of the curriculum exchange contract.`
        ));
      }
    });
  }
  required.forEach((key) => {
    if (!Object.hasOwn(value, key)) {
      issues.push(issue("missing-property", `${path}.${key}`, `Required property ${key} is missing.`));
    }
  });
}

function inspectStringField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number,
  issues: CurriculumPackJsonIssue[],
  options: { readonly isoInstant?: boolean } = {}
): void {
  const candidate = value[field];
  const fieldPath = `${path}.${field}`;
  if (typeof candidate !== "string") {
    issues.push(issue("invalid-type", fieldPath, `${field} must be a string.`));
    return;
  }
  inspectStringValue(candidate, fieldPath, maxLength, issues);
  if (options.isoInstant && normalizeIsoInstant(candidate) !== candidate) {
    issues.push(issue("invalid-date", fieldPath, `${field} must be a canonical ISO instant.`));
  }
}

function inspectOptionalStringFields(
  value: Record<string, unknown>,
  path: string,
  fields: readonly (readonly [string, number])[],
  issues: CurriculumPackJsonIssue[]
): void {
  fields.forEach(([field, maxLength]) => {
    if (Object.hasOwn(value, field)) inspectStringField(value, field, path, maxLength, issues);
  });
}

function inspectStringValue(
  value: string,
  path: string,
  maxLength: number,
  issues: CurriculumPackJsonIssue[]
): void {
  if (!value || !value.trim()) {
    issues.push(issue("invalid-string", path, "String must not be empty or blank."));
  } else if (value.trim() !== value) {
    issues.push(issue(
      "normalization-required",
      path,
      "Leading or trailing whitespace requires explicit normalization before import."
    ));
  }
  if (value.length > maxLength) {
    issues.push(issue(
      "limit-exceeded",
      path,
      `String length ${value.length} exceeds ${maxLength}.`
    ));
  }
  if (!isValidCurriculumJsonString(value)) {
    issues.push(issue("invalid-string", path, "String contains invalid Unicode or null characters."));
  }
}

function inspectEntityLimit(
  actual: number,
  maximum: number,
  path: string,
  issues: CurriculumPackJsonIssue[]
): void {
  if (actual > maximum) {
    issues.push(issue("limit-exceeded", path, `Count ${actual} exceeds ${maximum}.`));
  }
}

function inspectJsonSafety(value: unknown): readonly CurriculumPackJsonIssue[] {
  const issues: CurriculumPackJsonIssue[] = [];
  const pending: Array<{ readonly value: unknown; readonly path: string }> = [{ value, path: "$" }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current.value === "number" && !Number.isFinite(current.value)) {
      issues.push(issue("invalid-number", current.path, "JSON number must be finite."));
      continue;
    }
    if (typeof current.value === "string" && !isValidCurriculumJsonString(current.value)) {
      issues.push(issue("invalid-string", current.path, "JSON string contains invalid Unicode or null characters."));
      continue;
    }
    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => pending.push({
        value: item,
        path: `${current.path}[${index}]`,
      }));
      continue;
    }
    if (!isJsonObject(current.value)) continue;
    const objectValue = current.value;
    Object.keys(objectValue).forEach((key) => {
      if (DANGEROUS_KEYS.has(key)) {
        issues.push(issue("dangerous-key", `${current.path}.${key}`, `Dangerous key ${key} is rejected.`));
      }
      if (!isValidCurriculumJsonString(key)) {
        issues.push(issue(
          "invalid-string",
          `${current.path}.${key}`,
          "Object key contains invalid Unicode or null characters."
        ));
      }
      pending.push({ value: objectValue[key], path: `${current.path}.${key}` });
    });
  }
  return deduplicateIssues(issues);
}

/**
 * Protects public `unknown` inputs before schema readers access any property. The
 * descriptor walk is iterative, accepts only JSON primitives/plain objects/arrays,
 * and rejects accessors without invoking them. Proxy traps may still run as part of
 * JavaScript reflection, but any trap failure is caught by the public validator.
 */
function inspectProgrammaticJsonValueSafety(
  value: unknown,
  maximumDepth: number
): readonly CurriculumPackJsonIssue[] {
  const issues: CurriculumPackJsonIssue[] = [];
  const visitedObjects = new Set<object>();
  const pending: Array<{
    readonly value: unknown;
    readonly path: string;
    readonly depth: number;
  }> = [{ value, path: "pack", depth: 1 }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > maximumDepth) {
      issues.push(issue(
        "limit-exceeded",
        current.path,
        `Programmatic JSON nesting depth exceeds ${maximumDepth}.`
      ));
      continue;
    }
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        issues.push(issue("invalid-number", current.path, "JSON number must be finite."));
      }
      continue;
    }
    if (typeof current.value === "string") {
      if (!isValidCurriculumJsonString(current.value)) {
        issues.push(issue(
          "invalid-string",
          current.path,
          "JSON string contains invalid Unicode or null characters."
        ));
      }
      continue;
    }
    if (typeof current.value !== "object") {
      issues.push(issue(
        "invalid-type",
        current.path,
        "Only JSON primitives, arrays, and plain objects are accepted."
      ));
      continue;
    }

    const objectValue = current.value;
    if (visitedObjects.has(objectValue)) {
      issues.push(issue(
        "invalid-type",
        current.path,
        "Circular or multiply referenced object graphs are not accepted as JSON data."
      ));
      continue;
    }
    visitedObjects.add(objectValue);
    const arrayValue = Array.isArray(objectValue);
    const prototype = Object.getPrototypeOf(objectValue);
    if (
      (arrayValue && prototype !== Array.prototype)
      || (!arrayValue && prototype !== Object.prototype && prototype !== null)
    ) {
      issues.push(issue(
        "invalid-type",
        current.path,
        "Inherited or custom-prototype objects are not accepted as JSON data."
      ));
      continue;
    }
    if (Object.getOwnPropertySymbols(objectValue).length > 0) {
      issues.push(issue(
        "unexpected-property",
        current.path,
        "Symbol properties are not part of the JSON data model."
      ));
    }

    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    Object.entries(descriptors).forEach(([key, descriptor]) => {
      if (arrayValue && key === "length") return;
      const path = arrayValue
        ? `${current.path}[${key}]`
        : appendJsonPath(current.path, key);
      if ("get" in descriptor || "set" in descriptor) {
        issues.push(issue(
          "invalid-type",
          path,
          "Accessor properties are not accepted as JSON data."
        ));
        return;
      }
      if (!descriptor.enumerable) {
        issues.push(issue(
          "unexpected-property",
          path,
          "Non-enumerable properties are not accepted as JSON data."
        ));
        return;
      }
      if (DANGEROUS_KEYS.has(key)) {
        issues.push(issue("dangerous-key", path, `Dangerous key ${key} is rejected.`));
        return;
      }
      if (!isValidCurriculumJsonString(key)) {
        issues.push(issue(
          "invalid-string",
          path,
          "Object key contains invalid Unicode or null characters."
        ));
        return;
      }
      pending.push({
        value: descriptor.value,
        path,
        depth: current.depth + 1,
      });
    });
  }
  return deduplicateIssues(issues);
}

type JsonObjectScanFrame = {
  readonly kind: "object";
  readonly path: string;
  readonly keys: Set<string>;
  state: "key-or-end" | "colon" | "value" | "comma-or-end";
  pendingKey: string | null;
};

type JsonArrayScanFrame = {
  readonly kind: "array";
  readonly path: string;
  state: "value-or-end" | "comma-or-end";
  nextIndex: number;
};

type JsonScanFrame = JsonObjectScanFrame | JsonArrayScanFrame;

/**
 * Bounded lexical pass performed before JSON.parse. It does not build a second JSON
 * tree: it tracks only nesting state and per-object decoded key sets. Escaped keys are
 * decoded from their individual JSON string tokens, allowing `a` and `\u0061` to be
 * recognized as the same key without retaining object values.
 */
export function scanCurriculumJsonText(
  serialized: string,
  maximumDepth: number
): CurriculumJsonTextScanResult {
  const duplicateKeyIssues: CurriculumPackJsonIssue[] = [];
  const unsafeKeyIssues: CurriculumPackJsonIssue[] = [];
  const stack: JsonScanFrame[] = [];
  let rootConsumed = false;
  let maximumObservedDepth = 0;
  let index = 0;

  const valuePath = (): string => {
    const frame = stack[stack.length - 1];
    if (!frame) return "$";
    if (frame.kind === "array") return `${frame.path}[${frame.nextIndex}]`;
    return appendJsonPath(frame.path, frame.pendingKey ?? "?");
  };
  const consumeValue = (): void => {
    const frame = stack[stack.length - 1];
    if (!frame) {
      rootConsumed = true;
      return;
    }
    if (frame.kind === "array") {
      if (frame.state === "value-or-end") {
        frame.state = "comma-or-end";
        frame.nextIndex += 1;
      }
      return;
    }
    if (frame.state === "value") {
      frame.state = "comma-or-end";
      frame.pendingKey = null;
    }
  };

  while (index < serialized.length) {
    const character = serialized[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    const frame = stack[stack.length - 1];

    if (character === "\"") {
      const tokenEnd = findJsonStringTokenEnd(serialized, index);
      const token = serialized.slice(index, tokenEnd);
      if (frame?.kind === "object" && frame.state === "key-or-end") {
        const decodedKey = decodeJsonStringToken(token);
        if (decodedKey !== null) {
          const path = appendJsonPath(frame.path, decodedKey);
          if (frame.keys.has(decodedKey)) {
            duplicateKeyIssues.push(issue(
              "duplicate-key",
              path,
              `Decoded JSON key ${JSON.stringify(decodedKey)} is duplicated in the same object.`
            ));
          } else {
            frame.keys.add(decodedKey);
          }
          if (DANGEROUS_KEYS.has(decodedKey)) {
            unsafeKeyIssues.push(issue(
              "dangerous-key",
              path,
              `Dangerous decoded key ${JSON.stringify(decodedKey)} is rejected.`
            ));
          }
          if (!isValidCurriculumJsonString(decodedKey)) {
            unsafeKeyIssues.push(issue(
              "invalid-string",
              path,
              "Decoded JSON key contains invalid Unicode or null characters."
            ));
          }
          frame.pendingKey = decodedKey;
          frame.state = "colon";
        }
      } else {
        consumeValue();
      }
      index = tokenEnd;
      continue;
    }

    if (character === "{" || character === "[") {
      const path = rootConsumed && stack.length === 0 ? "$[extra]" : valuePath();
      consumeValue();
      stack.push(character === "{"
        ? {
            kind: "object",
            path,
            keys: new Set<string>(),
            state: "key-or-end",
            pendingKey: null,
          }
        : {
            kind: "array",
            path,
            state: "value-or-end",
            nextIndex: 0,
          });
      maximumObservedDepth = Math.max(maximumObservedDepth, stack.length);
      if (maximumObservedDepth > maximumDepth) {
        return {
          maximumDepth: maximumObservedDepth,
          depthExceeded: true,
          duplicateKeyIssues: deduplicateIssues(duplicateKeyIssues),
          unsafeKeyIssues: deduplicateIssues(unsafeKeyIssues),
        };
      }
      index += 1;
      continue;
    }

    if (character === "}" || character === "]") {
      if (
        (character === "}" && frame?.kind === "object")
        || (character === "]" && frame?.kind === "array")
      ) {
        stack.pop();
      }
      index += 1;
      continue;
    }
    if (character === ":") {
      if (frame?.kind === "object" && frame.state === "colon") frame.state = "value";
      index += 1;
      continue;
    }
    if (character === ",") {
      if (frame?.kind === "object" && frame.state === "comma-or-end") {
        frame.state = "key-or-end";
      } else if (frame?.kind === "array" && frame.state === "comma-or-end") {
        frame.state = "value-or-end";
      }
      index += 1;
      continue;
    }

    consumeValue();
    index += 1;
    while (
      index < serialized.length
      && !/[\s,\]}]/.test(serialized[index])
    ) {
      index += 1;
    }
  }

  return {
    maximumDepth: maximumObservedDepth,
    depthExceeded: false,
    duplicateKeyIssues: deduplicateIssues(duplicateKeyIssues),
    unsafeKeyIssues: deduplicateIssues(unsafeKeyIssues),
  };
}

function findJsonStringTokenEnd(serialized: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < serialized.length; index += 1) {
    const character = serialized[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "\"") {
      return index + 1;
    }
  }
  return serialized.length;
}

function decodeJsonStringToken(token: string): string | null {
  try {
    const decoded = JSON.parse(token) as unknown;
    return typeof decoded === "string" ? decoded : null;
  } catch {
    return null;
  }
}

function appendJsonPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function projectProvenance(provenance: CurriculumProvenance): CurriculumProvenance {
  return {
    kind: provenance.kind,
    ...(provenance.sourceId !== undefined ? { sourceId: provenance.sourceId } : {}),
    ...(provenance.sourceVersion !== undefined ? { sourceVersion: provenance.sourceVersion } : {}),
    ...(provenance.label !== undefined ? { label: provenance.label } : {}),
  };
}

function projectSubject(subject: CurriculumSubject): CurriculumSubject {
  return {
    id: subject.id,
    ...(subject.externalCode !== undefined ? { externalCode: subject.externalCode } : {}),
    ...(subject.legacySubjectId !== undefined ? { legacySubjectId: subject.legacySubjectId } : {}),
    name: subject.name,
    criteria: subject.criteria.map(projectCriterion),
    basicKnowledge: subject.basicKnowledge.map(projectBasicKnowledge),
  };
}

function projectCriterion(criterion: Criterion): Criterion {
  return {
    id: criterion.id,
    ...(criterion.externalCode !== undefined ? { externalCode: criterion.externalCode } : {}),
    ...(criterion.sourceVersion !== undefined ? { sourceVersion: criterion.sourceVersion } : {}),
    ...(criterion.title !== undefined ? { title: criterion.title } : {}),
    text: criterion.text,
  };
}

function projectBasicKnowledge(knowledge: BasicKnowledge): BasicKnowledge {
  return {
    id: knowledge.id,
    ...(knowledge.externalCode !== undefined ? { externalCode: knowledge.externalCode } : {}),
    ...(knowledge.sourceVersion !== undefined ? { sourceVersion: knowledge.sourceVersion } : {}),
    text: knowledge.text,
    criterionIds: [...knowledge.criterionIds],
  };
}

function normalizeIsoInstant(value: string): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseManualRevision(value: string): number | null {
  const match = /^manual-r([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function isValidCurriculumJsonString(value: string): boolean {
  if (value.includes("\u0000")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function readProgrammaticOptionalString(
  value: string | undefined,
  maximum: number,
  field: string
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string"
    || value.trim() !== value
    || !value
    || value.length > maximum
    || !isValidCurriculumJsonString(value)
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function resolvePrettyIndentation(value: boolean | number | undefined): number {
  if (value === undefined || value === false) return 0;
  if (value === true) return 2;
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error("pretty must be a boolean or an integer from zero to ten.");
  }
  return value;
}

function invalidRoot(
  message: string,
  issues: readonly CurriculumPackJsonIssue[]
): Extract<CurriculumPackJsonParseResult, { status: "invalid-root" }> {
  return deepFreeze({ status: "invalid-root", message, issues: deduplicateIssues(issues) });
}

function limitsExceeded(
  issues: readonly CurriculumPackJsonIssue[]
): Extract<CurriculumPackJsonParseResult, { status: "limits-exceeded" }> {
  return deepFreeze({
    status: "limits-exceeded",
    message: "The curriculum JSON exceeds configured safety limits.",
    issues: deduplicateIssues(issues),
  });
}

function formatValidationFailure(prefix: string, inspection: CurriculumPackJsonValidationResult): string {
  const allIssues = [
    ...inspection.issues,
    ...inspection.referenceIssues,
    ...inspection.sourceVersionIssues,
    ...inspection.limitIssues,
  ];
  return `${prefix}: ${allIssues.map((item) => `${item.code}@${item.path}`).join(", ")}.`;
}

function issue(
  code: CurriculumPackJsonIssueCode,
  path: string,
  message: string
): CurriculumPackJsonIssue {
  return { code, path, message };
}

function deduplicateIssues(
  issues: readonly CurriculumPackJsonIssue[]
): readonly CurriculumPackJsonIssue[] {
  return [...new Map(issues.map((item) => [`${item.code}:${item.path}:${item.message}`, item])).values()];
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
