import {
  CURRICULUM_LEGACY_SCHEMA_VERSION,
  CURRICULUM_SCHEMA_VERSION,
  type CurriculumPack,
  type VersionedCurriculumData,
} from "../types/curriculum";
import {
  createCurriculumDeterministicFingerprint,
  serializeCurriculumFingerprintValue,
} from "./curriculumFingerprintService";
import {
  DEFAULT_CURRICULUM_PACK_JSON_LIMITS,
  areCurriculumPacksCanonicallyEqual,
  calculateCurriculumPackContentChecksum,
  isValidCurriculumJsonString,
  projectCurriculumPack,
  scanCurriculumJsonText,
  serializeCurriculumPackContent,
  validateCurriculumPackForJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import { validateCurriculumData } from "./curriculumValidationService";
import {
  DEFAULT_CURRICULUM_STORAGE_BUDGET,
  estimateCurriculumStorageProtocolPeak,
  measureCurriculumSerializedJson,
  resolveCurriculumStorageBudget,
  type CurriculumSerializedSize,
  type CurriculumStorageBudgetLimits,
  type CurriculumStorageProtocolEstimate,
} from "./curriculumStorageBudgetService";

export const CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION = 1 as const;

export interface CurriculumPackImportAppliedOperation {
  readonly operationId: string;
  /** Non-cryptographic prefilter; exact retry proof also compares the result pack. */
  readonly operationFingerprint: string;
  readonly sourceContentChecksum: string;
  readonly sourcePackId: string;
  readonly expectedRevision: number;
  readonly expectedPackageVersion: string;
  readonly resolutionKind: CurriculumPackImportResolution["kind"] | "none";
  /** Exact compact ID intent. It contains no catalog text and no complete pack. */
  readonly resolutionIdentity: string;
  readonly resolutionIdCount: number;
  readonly resultingRevision: number;
  readonly outcome: "imported" | "reused" | "skipped" | "already-present";
  readonly packId: string | null;
  readonly resultContentChecksum: string | null;
}

export interface CurriculumPackImportState {
  readonly schemaVersion: typeof CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION;
  /** Revision of catalog content. No-op imports do not increment it. */
  readonly revision: number;
  readonly packs: readonly CurriculumPack[];
  /** Internal idempotency journal; it is never part of the exchange envelope. */
  readonly appliedOperations: readonly CurriculumPackImportAppliedOperation[];
}

export interface CurriculumPackImportRequest {
  readonly operationId: string;
  readonly expectedRevision: number;
  readonly expectedPackageVersion: string;
}

export interface CurriculumPackImportIdMap {
  readonly packId: string;
  readonly subjectIds: Readonly<Record<string, string>>;
  readonly competenceIds: Readonly<Record<string, string>>;
  readonly criterionIds: Readonly<Record<string, string>>;
  readonly basicKnowledgeIds: Readonly<Record<string, string>>;
}

export type CurriculumPackImportResolution =
  | { readonly kind: "reuse-identical" }
  | { readonly kind: "skip-import" }
  | { readonly kind: "import-as-new"; readonly idMap: CurriculumPackImportIdMap };

export interface CurriculumPackImportPreviewOptions {
  /** Trusted programmatic resolution. Use resolutionJson for untrusted JSON text. */
  readonly resolution?: CurriculumPackImportResolution | {
    readonly kind: string;
    readonly [key: string]: unknown;
  };
  /** Raw untrusted resolution JSON; duplicate and dangerous decoded keys are rejected. */
  readonly resolutionJson?: string;
  /** Pure configurable application budget; it is not a claim about browser quota. */
  readonly storageBudget?: Partial<CurriculumStorageBudgetLimits>;
  /** Size of older retained backup values not represented by the current state. */
  readonly retainedBackupCodeUnits?: number;
}

export type CurriculumPackImportConflictCode =
  | "invalid-existing-state"
  | "legacy-catalog-incomplete"
  | "invalid-operation-id"
  | "stale-revision"
  | "package-version-mismatch"
  | "operation-id-collision"
  | "operation-history-divergent"
  | "invalid-analyzed-pack"
  | "checksum-mismatch"
  | "same-pack-id-different-content"
  | "source-version-checksum-conflict"
  | "internal-id-conflict"
  | "duplicate-external-code"
  | "source-version-incoherent"
  | "broken-reference"
  | "unknown-resolution"
  | "duplicate-resolution-key"
  | "unsafe-resolution"
  | "resolution-not-applicable"
  | "incomplete-id-map"
  | "unexpected-id-map-entry"
  | "invalid-new-id"
  | "duplicate-new-id"
  | "new-id-conflict"
  | "invalid-storage-budget"
  | "storage-budget-exceeded";

export interface CurriculumPackImportConflict {
  readonly code: CurriculumPackImportConflictCode;
  readonly path: string;
  readonly message: string;
}

export type CurriculumPackImportWarningCode =
  | "apparent-content-duplicate"
  | "duplicate-subject-name"
  | "duplicate-specific-competence-text"
  | "duplicate-criterion-text"
  | "duplicate-basic-knowledge-text"
  | "explicit-copy-of-conflict"
  | "storage-budget-exceeded";

export interface CurriculumPackImportWarning {
  readonly code: CurriculumPackImportWarningCode;
  readonly path: string;
  readonly message: string;
}

export type CurriculumPackImportDuplicateKind =
  | "identical-package"
  | "same-pack-id-identical"
  | "apparent-content-different-ids";

export interface CurriculumPackImportDuplicate {
  readonly kind: CurriculumPackImportDuplicateKind;
  readonly incomingId: string;
  readonly existingId: string;
  readonly message: string;
}

export interface CurriculumPackImportDecision {
  readonly code: "decision-required";
  readonly reason: string;
  readonly supportedResolutions: readonly (
    "reuse-identical" | "skip-import" | "import-as-new"
  )[];
}

export interface CurriculumPackImportChange {
  readonly kind: "add-pack" | "reuse-pack" | "skip-import";
  readonly sourcePackId: string;
  readonly targetPackId: string | null;
  readonly contentChecksum: string;
}

export type CurriculumPackImportClassification =
  | "new-pack"
  | "same-pack-id-identical"
  | "same-pack-id-different-content"
  | "conflicted"
  | "import-as-new"
  | "reuse-identical"
  | "skipped"
  | "operation-idempotent";

export interface CurriculumPackImportPreview {
  readonly status: "applicable" | "blocked" | "idempotent" | "skipped" | "reused";
  readonly classification: CurriculumPackImportClassification;
  readonly operationId: string;
  readonly operationFingerprint: string;
  readonly storageBudgetFingerprint: string;
  readonly baseStateFingerprint: string;
  /** Exact canonical state snapshot companion to the non-cryptographic fingerprint. */
  readonly baseStateCanonical: string;
  readonly sourceContentChecksum: string;
  /** Exact canonical source identity; checksum equality alone never implies identity. */
  readonly sourceCanonicalContent: string;
  readonly proposedContentChecksum: string | null;
  readonly proposedCanonicalContent: string | null;
  readonly storageEstimate: CurriculumPackImportStorageEstimate;
  readonly expectedRevision: number;
  readonly resultingRevision: number;
  readonly expectedPackageVersion: string;
  readonly resolution: CurriculumPackImportResolution | null;
  readonly sourcePack: CurriculumPack;
  readonly proposedPack: CurriculumPack | null;
  readonly summary: {
    readonly packId: string;
    readonly name: string;
    readonly packageVersion: string;
    readonly provenanceKind: CurriculumPack["provenance"]["kind"];
    readonly subjectCount: number;
    readonly specificCompetenceCount: number;
    readonly criterionCount: number;
    readonly basicKnowledgeCount: number;
    readonly title: string;
    readonly message: string;
  };
  readonly counts: {
    readonly subjects: number;
    readonly specificCompetences: number;
    readonly criteria: number;
    readonly basicKnowledge: number;
    readonly criterionReferences: number;
  };
  readonly blockingConflicts: readonly CurriculumPackImportConflict[];
  readonly warnings: readonly CurriculumPackImportWarning[];
  readonly duplicates: readonly CurriculumPackImportDuplicate[];
  readonly decisionsRequired: readonly CurriculumPackImportDecision[];
  readonly proposedChanges: readonly CurriculumPackImportChange[];
  readonly canApply: boolean;
}

export interface CurriculumPackImportStorageEstimate {
  readonly budget: CurriculumStorageBudgetLimits;
  readonly currentState: CurriculumSerializedSize;
  readonly proposedState: CurriculumSerializedSize;
  readonly currentJournal: CurriculumSerializedSize;
  readonly proposedJournal: CurriculumSerializedSize;
  readonly nextJournalEntry: CurriculumSerializedSize | null;
  readonly proposedJournalEntries: number;
  readonly protocol: CurriculumStorageProtocolEstimate;
  readonly exceededLimits: readonly (
    | "state"
    | "journal-entry"
    | "journal-total"
    | "journal-count"
    | "protocol-peak"
  )[];
  readonly persistable: boolean;
}

export interface CurriculumPackImportApplicationIdentity {
  readonly operationId: string;
  readonly expectedRevision: number;
  readonly fingerprint: string;
}

export type CurriculumPackImportApplyResult =
  | {
      readonly status: "applied" | "idempotent" | "skipped" | "reused";
      readonly state: CurriculumPackImportState;
      readonly pack: CurriculumPack | null;
      readonly preview: CurriculumPackImportPreview;
      readonly validation: { readonly valid: true; readonly issueCodes: readonly string[] };
    }
  | {
      readonly status: "rejected";
      readonly state: CurriculumPackImportState;
      readonly preview: CurriculumPackImportPreview;
      readonly reasons: readonly CurriculumPackImportConflict[];
    };

type NormalizedResolution =
  | { readonly status: "none"; readonly resolution: null }
  | { readonly status: "valid"; readonly resolution: CurriculumPackImportResolution }
  | { readonly status: "invalid"; readonly resolution: null; readonly conflict: CurriculumPackImportConflict };

type NormalizedStorageBudget =
  | {
      readonly status: "valid";
      readonly budget: CurriculumStorageBudgetLimits;
      readonly retainedBackupCodeUnits: number;
    }
  | {
      readonly status: "invalid";
      readonly budget: CurriculumStorageBudgetLimits;
      readonly retainedBackupCodeUnits: 0;
      readonly conflict: CurriculumPackImportConflict;
    };

export type CurriculumPackImportResolutionJsonResult =
  | { readonly status: "valid"; readonly resolution: CurriculumPackImportResolution }
  | { readonly status: "invalid"; readonly conflict: CurriculumPackImportConflict };

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_RESOLUTION_JSON_TEXT_LENGTH = 250_000;
const MAX_RESOLUTION_JSON_DEPTH = 12;

export function createEmptyCurriculumPackImportState(): CurriculumPackImportState {
  return deepFreeze({
    schemaVersion: CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION,
    revision: 0,
    packs: [],
    appliedOperations: [],
  });
}

export function previewCurriculumPackImport(
  analyzed: CurriculumPackJsonValidResult,
  state: CurriculumPackImportState,
  request: CurriculumPackImportRequest,
  options: CurriculumPackImportPreviewOptions = {}
): CurriculumPackImportPreview {
  const sourcePack = projectCurriculumPack(analyzed.pack);
  const sourceContentChecksum = calculateCurriculumPackContentChecksum(sourcePack);
  const sourceCanonicalContent = serializeCurriculumPackContent(sourcePack);
  const baseStateCanonical = serializeImportStateCanonical(state);
  const baseStateFingerprint = fingerprintImportStateCanonical(baseStateCanonical);
  const normalizedResolution = normalizeResolution(options);
  const normalizedStorageBudget = normalizeStorageBudget(options);
  const fingerprintResolution = normalizedResolution.status === "valid"
    ? normalizedResolution.resolution
    : null;
  const operationFingerprint = createImportOperationFingerprint(
    request,
    sourceContentChecksum,
    sourceCanonicalContent,
    fingerprintResolution
  );
  const storageBudgetFingerprint = createStorageBudgetFingerprint(
    normalizedStorageBudget.budget,
    normalizedStorageBudget.retainedBackupCodeUnits
  );
  const base = {
    operationId: request.operationId,
    operationFingerprint,
    storageBudgetFingerprint,
    baseStateFingerprint,
    baseStateCanonical,
    sourceContentChecksum,
    sourceCanonicalContent,
    expectedRevision: request.expectedRevision,
    expectedPackageVersion: request.expectedPackageVersion,
    sourcePack,
    currentState: state,
    storageBudget: normalizedStorageBudget.budget,
    retainedBackupCodeUnits: normalizedStorageBudget.retainedBackupCodeUnits,
  };
  const blockingConflicts: CurriculumPackImportConflict[] = [];
  const warnings = collectDuplicateContentWarnings(sourcePack, state.packs);
  const duplicates = collectPackDuplicates(sourcePack, state.packs);

  const stateConflicts = validateImportState(state);
  if (stateConflicts.length > 0) {
    return createPreview(base, state.revision, null, "conflicted", blockingConflicts.concat(stateConflicts), warnings, duplicates, [], [], null);
  }
  if (!isStableString(request.operationId, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength)) {
    blockingConflicts.push(conflict(
      "invalid-operation-id",
      "operationId",
      "A stable, normalized operationId is required."
    ));
  }
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
    blockingConflicts.push(conflict(
      "stale-revision",
      "expectedRevision",
      "expectedRevision must be a non-negative safe integer."
    ));
  }
  if (!isStableString(request.expectedPackageVersion, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxVersionLength)) {
    blockingConflicts.push(conflict(
      "package-version-mismatch",
      "expectedPackageVersion",
      "A normalized expectedPackageVersion is required."
    ));
  }
  if (blockingConflicts.length > 0) {
    return createPreview(base, state.revision, null, "conflicted", blockingConflicts, warnings, duplicates, [], [], null);
  }

  if (normalizedResolution.status === "invalid") {
    blockingConflicts.push(normalizedResolution.conflict);
  }
  if (normalizedStorageBudget.status === "invalid") {
    blockingConflicts.push(normalizedStorageBudget.conflict);
  }
  if (blockingConflicts.length > 0) {
    return createPreview(base, state.revision, null, "conflicted", blockingConflicts, warnings, duplicates, [], [], null);
  }

  const previousOperation = state.appliedOperations.find(
    (operation) => operation.operationId === request.operationId
  );
  if (previousOperation) {
    const retryClassification = classifyDurableOperationRetry(
      previousOperation,
      state,
      request,
      operationFingerprint,
      sourceContentChecksum,
      sourcePack,
      fingerprintResolution
    );
    if (retryClassification === "same") {
      return createPreview(
        base,
        previousOperation.resultingRevision,
        null,
        "operation-idempotent",
        [],
        warnings,
        duplicates,
        [],
        [],
        normalizedResolution.status === "valid" ? normalizedResolution.resolution : null,
        "idempotent"
      );
    }
    if (retryClassification === "history-divergent") {
      return createPreview(base, state.revision, null, "conflicted", [conflict(
        "operation-history-divergent",
        "operationId",
        "The operation exists, but its exact result is missing or changed; idempotence can no longer be proven safely."
      )], warnings, duplicates, [], [], fingerprintResolution);
    }
    return createPreview(base, state.revision, null, "conflicted", [conflict(
      "operation-id-collision",
      "operationId",
      "This operationId was already used with different content or resolution."
    )], warnings, duplicates, [], [], null);
  }

  if (request.expectedRevision !== state.revision) {
    blockingConflicts.push(conflict(
      "stale-revision",
      "expectedRevision",
      `Expected revision ${request.expectedRevision} does not match current revision ${state.revision}.`
    ));
  }
  if (request.expectedPackageVersion !== sourcePack.packageVersion) {
    blockingConflicts.push(conflict(
      "package-version-mismatch",
      "expectedPackageVersion",
      `Expected package version ${request.expectedPackageVersion} does not match ${sourcePack.packageVersion}.`
    ));
  }
  if (
    analyzed.status !== "valid"
    || analyzed.contentChecksum !== sourceContentChecksum
    || analyzed.envelope.contentChecksum !== sourceContentChecksum
    || analyzed.canonicalContent !== sourceCanonicalContent
  ) {
    blockingConflicts.push(conflict(
      "checksum-mismatch",
      "contentChecksum",
      "The analyzed package checksum no longer matches its content."
    ));
  }
  if (blockingConflicts.length > 0) {
    return createPreview(base, state.revision, null, "conflicted", blockingConflicts, warnings, duplicates, [], [], null);
  }

  const packValidation = validateCurriculumPackForJson(sourcePack);
  const packConflicts = mapPackValidationConflicts(packValidation);
  const exactExisting = findExactExistingPack(sourcePack, state.packs);
  const sameIdExisting = state.packs.find((pack) => pack.id === sourcePack.id);
  const duplicateCodeConflicts = collectDuplicateExternalCodeConflicts(sourcePack);
  const internalIdConflicts = exactExisting
    ? []
    : collectInternalIdConflicts(sourcePack, state.packs);
  const sourceVersionConflicts = collectSourceVersionConflicts(sourcePack, state.packs);
  const resolvableConflicts: CurriculumPackImportConflict[] = [];
  if (sameIdExisting && !exactExisting) {
    resolvableConflicts.push(conflict(
      "same-pack-id-different-content",
      "pack.id",
      `Pack ID ${sourcePack.id} already exists with different content.`
    ));
  }
  resolvableConflicts.push(...internalIdConflicts, ...sourceVersionConflicts);

  const resolution = normalizedResolution.status === "valid"
    ? normalizedResolution.resolution
    : null;
  if (resolution?.kind === "skip-import") {
    return createPreview(
      base,
      state.revision,
      null,
      "skipped",
      [],
      warnings,
      duplicates,
      [],
      [{
        kind: "skip-import",
        sourcePackId: sourcePack.id,
        targetPackId: null,
        contentChecksum: sourceContentChecksum,
      }],
      resolution,
      "skipped"
    );
  }

  if (resolution?.kind === "reuse-identical") {
    if (!exactExisting) {
      return createPreview(base, state.revision, null, "conflicted", [conflict(
        "resolution-not-applicable",
        "resolution",
        "reuse-identical requires an existing pack with identical content."
      )], warnings, duplicates, [], [], resolution);
    }
    return createPreview(
      base,
      state.revision,
      null,
      "reuse-identical",
      [],
      warnings,
      duplicates,
      [],
      [{
        kind: "reuse-pack",
        sourcePackId: sourcePack.id,
        targetPackId: exactExisting.id,
        contentChecksum: sourceContentChecksum,
      }],
      resolution,
      "reused"
    );
  }

  if (!resolution && exactExisting) {
    return createPreview(
      base,
      state.revision,
      null,
      "same-pack-id-identical",
      [],
      warnings,
      duplicates,
      [],
      [{
        kind: "reuse-pack",
        sourcePackId: sourcePack.id,
        targetPackId: exactExisting.id,
        contentChecksum: sourceContentChecksum,
      }],
      null,
      "idempotent"
    );
  }

  if (resolution?.kind === "import-as-new") {
    const remap = remapCurriculumPack(sourcePack, resolution.idMap, state.packs);
    if (remap.conflicts.length > 0 || !remap.pack) {
      return createPreview(
        base,
        state.revision,
        null,
        "conflicted",
        remap.conflicts,
        warnings,
        duplicates,
        [],
        [],
        resolution
      );
    }
    const importConflicts = [...packConflicts, ...duplicateCodeConflicts];
    const remappedValidation = validateCurriculumPackForJson(remap.pack);
    importConflicts.push(...mapPackValidationConflicts(remappedValidation));
    if (importConflicts.length > 0) {
      return createPreview(
        base,
        state.revision,
        null,
        "conflicted",
        deduplicateConflicts(importConflicts),
        warnings,
        duplicates,
        [],
        [],
        resolution
      );
    }
    const copyWarnings = resolvableConflicts.length === 0
      ? warnings
      : [...warnings, warning(
          "explicit-copy-of-conflict",
          "resolution",
          "Conflicting identities or source-version snapshots will coexist as an explicit copy."
        )];
    const checksum = calculateCurriculumPackContentChecksum(remap.pack);
    return createPreview(
      base,
      state.revision + 1,
      remap.pack,
      "import-as-new",
      [],
      copyWarnings,
      duplicates,
      [],
      [{
        kind: "add-pack",
        sourcePackId: sourcePack.id,
        targetPackId: remap.pack.id,
        contentChecksum: checksum,
      }],
      resolution
    );
  }

  const importConflicts = deduplicateConflicts([
    ...packConflicts,
    ...duplicateCodeConflicts,
    ...resolvableConflicts,
  ]);
  if (importConflicts.length > 0) {
    const hasConflictsThatIdRemappingCannotResolve = packConflicts.length > 0
      || duplicateCodeConflicts.length > 0;
    const decisions: CurriculumPackImportDecision[] = [{
      code: "decision-required",
      reason: "The pack conflicts with existing content and no automatic merge or overwrite is allowed.",
      supportedResolutions: exactExisting
        ? ["reuse-identical", "skip-import", "import-as-new"]
        : hasConflictsThatIdRemappingCannotResolve
          ? ["skip-import"]
          : ["skip-import", "import-as-new"],
    }];
    const classification: CurriculumPackImportClassification = sameIdExisting
      ? "same-pack-id-different-content"
      : "conflicted";
    return createPreview(
      base,
      state.revision,
      null,
      classification,
      importConflicts,
      warnings,
      duplicates,
      decisions,
      [],
      null
    );
  }

  return createPreview(
    base,
    state.revision + 1,
    sourcePack,
    "new-pack",
    [],
    warnings,
    duplicates,
    [],
    [{
      kind: "add-pack",
      sourcePackId: sourcePack.id,
      targetPackId: sourcePack.id,
      contentChecksum: sourceContentChecksum,
    }],
    null
  );
}

export function applyCurriculumPackImport(
  state: CurriculumPackImportState,
  preview: CurriculumPackImportPreview,
  identity: CurriculumPackImportApplicationIdentity
): CurriculumPackImportApplyResult {
  const reasons: CurriculumPackImportConflict[] = [];
  const stateConflicts = validateImportState(state);
  const previewedPreviousOperation = state.appliedOperations.find(
    (operation) => operation.operationId === identity.operationId
  );
  const previewRequest: CurriculumPackImportRequest = {
    operationId: preview.operationId,
    expectedRevision: preview.expectedRevision,
    expectedPackageVersion: preview.expectedPackageVersion,
  };
  const retryClassification = previewedPreviousOperation
    ? classifyDurableOperationRetry(
        previewedPreviousOperation,
        state,
        previewRequest,
        preview.operationFingerprint,
        preview.sourceContentChecksum,
        preview.sourcePack,
        preview.resolution
      )
    : null;
  const isExactOperationRetry = retryClassification === "same";
  reasons.push(...stateConflicts);
  if (retryClassification === "history-divergent") {
    reasons.push(conflict(
      "operation-history-divergent",
      "operationId",
      "The recorded result changed or disappeared, so this retry cannot be proven idempotent."
    ));
  }
  if (identity.operationId !== preview.operationId) {
    reasons.push(conflict(
      "invalid-operation-id",
      "operationId",
      "Application operationId does not match the preview."
    ));
  }
  if (
    identity.expectedRevision !== preview.expectedRevision
    || (!isExactOperationRetry && state.revision !== preview.expectedRevision)
  ) {
    reasons.push(conflict(
      "stale-revision",
      "expectedRevision",
      "The preview revision is stale."
    ));
  }
  if (
    identity.fingerprint !== preview.operationFingerprint
    || preview.operationFingerprint !== createImportOperationFingerprint(
      previewRequest,
      preview.sourceContentChecksum,
      preview.sourceCanonicalContent,
      preview.resolution
    )
  ) {
    reasons.push(conflict(
      "operation-id-collision",
      "fingerprint",
      "Application fingerprint does not match the previewed operation."
    ));
  }
  if (
    preview.storageBudgetFingerprint !== createStorageBudgetFingerprint(
      preview.storageEstimate.budget,
      preview.storageEstimate.protocol.retainedBackupCodeUnits
    )
  ) {
    reasons.push(conflict(
      "invalid-storage-budget",
      "storageEstimate",
      "The configured storage budget changed after preview."
    ));
  }
  const currentStateCanonical = serializeImportStateCanonical(state);
  if (
    preview.baseStateCanonical !== currentStateCanonical
    || preview.baseStateFingerprint !== fingerprintImportStateCanonical(currentStateCanonical)
  ) {
    reasons.push(conflict(
      "stale-revision",
      "state",
      "The import state changed after the preview."
    ));
  }
  if (
    preview.sourceContentChecksum !== calculateCurriculumPackContentChecksum(preview.sourcePack)
    || preview.sourceCanonicalContent !== serializeCurriculumPackContent(preview.sourcePack)
  ) {
    reasons.push(conflict(
      "checksum-mismatch",
      "sourcePack",
      "The preview source pack was modified after analysis."
    ));
  }
  if (!preview.canApply || preview.blockingConflicts.length > 0 || preview.decisionsRequired.length > 0) {
    reasons.push(...preview.blockingConflicts);
  }
  if (reasons.length > 0) {
    return deepFreeze({
      status: "rejected",
      state,
      preview,
      reasons: deduplicateConflicts(reasons),
    });
  }

  const previousOperation = state.appliedOperations.find(
    (operation) => operation.operationId === identity.operationId
  );
  if (previousOperation) {
    if (!isExactOperationRetry) {
      return deepFreeze({
        status: "rejected",
        state,
        preview,
        reasons: [conflict(
          retryClassification === "history-divergent"
            ? "operation-history-divergent"
            : "operation-id-collision",
          "operationId",
          retryClassification === "history-divergent"
            ? "The recorded import result diverged and cannot be retried safely."
            : "This operationId already identifies another import."
        )],
      });
    }
    return deepFreeze({
      status: "idempotent",
      state,
      pack: previousOperation.packId
        ? state.packs.find((pack) => pack.id === previousOperation.packId) ?? null
        : null,
      preview,
      validation: { valid: true, issueCodes: [] },
    });
  }

  const proposedPack = preview.proposedPack
    ? projectCurriculumPack(preview.proposedPack)
    : null;
  if (
    proposedPack
    && (
      preview.proposedContentChecksum !== calculateCurriculumPackContentChecksum(proposedPack)
      || preview.proposedCanonicalContent !== serializeCurriculumPackContent(proposedPack)
    )
  ) {
    return deepFreeze({
      status: "rejected",
      state,
      preview,
      reasons: [conflict(
        "checksum-mismatch",
        "proposedPack",
        "The proposed pack no longer matches its preview checksum."
      )],
    });
  }

  const outcome: CurriculumPackImportAppliedOperation["outcome"] = proposedPack
    ? "imported"
    : preview.status === "skipped"
      ? "skipped"
      : preview.status === "reused"
        ? "reused"
        : "already-present";
  const resultingRevision = proposedPack ? state.revision + 1 : state.revision;
  if (preview.resultingRevision !== resultingRevision) {
    return deepFreeze({
      status: "rejected",
      state,
      preview,
      reasons: [conflict(
        "stale-revision",
        "resultingRevision",
        "The previewed resulting revision is inconsistent."
      )],
    });
  }

  const nextState: CurriculumPackImportState = {
    schemaVersion: CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION,
    revision: resultingRevision,
    packs: proposedPack
      ? [...state.packs.map(projectCurriculumPack), proposedPack]
      : state.packs.map(projectCurriculumPack),
    appliedOperations: [
      ...state.appliedOperations.map(cloneOperation),
      createCompactAppliedOperation({
        operationId: identity.operationId,
        operationFingerprint: identity.fingerprint,
        sourceContentChecksum: preview.sourceContentChecksum,
        sourcePack: preview.sourcePack,
        expectedRevision: preview.expectedRevision,
        expectedPackageVersion: preview.expectedPackageVersion,
        resolution: preview.resolution,
        resultingRevision,
        outcome,
        packId: proposedPack?.id
          ?? preview.proposedChanges.find((change) => change.kind === "reuse-pack")?.targetPackId
          ?? null,
        resultPack: proposedPack
          ?? findResultPackForChanges(state.packs, preview.proposedChanges),
      }),
    ],
  };
  const finalStorageEstimate = estimateImportStateStorage(
    state,
    nextState,
    nextState.appliedOperations[nextState.appliedOperations.length - 1],
    preview.storageEstimate.budget,
    preview.storageEstimate.protocol.retainedBackupCodeUnits
  );
  if (!finalStorageEstimate.persistable) {
    return deepFreeze({
      status: "rejected",
      state,
      preview,
      reasons: [storageBudgetConflict(finalStorageEstimate)],
    });
  }
  const finalConflicts = validateImportState(nextState);
  if (finalConflicts.length > 0) {
    return deepFreeze({
      status: "rejected",
      state,
      preview,
      reasons: finalConflicts,
    });
  }

  const frozenState = deepFreeze(nextState);
  return deepFreeze({
    status: proposedPack
      ? "applied"
      : preview.status === "skipped"
        ? "skipped"
        : preview.status === "reused"
          ? "reused"
          : "idempotent",
    state: frozenState,
    pack: proposedPack
      ? frozenState.packs[frozenState.packs.length - 1]
      : nextState.appliedOperations[nextState.appliedOperations.length - 1].packId
        ? frozenState.packs.find(
            (pack) => pack.id === nextState.appliedOperations[nextState.appliedOperations.length - 1].packId
          ) ?? null
        : null,
    preview,
    validation: { valid: true, issueCodes: [] },
  });
}

function createPreview(
  base: {
    readonly operationId: string;
    readonly operationFingerprint: string;
    readonly storageBudgetFingerprint: string;
    readonly baseStateFingerprint: string;
    readonly baseStateCanonical: string;
    readonly sourceContentChecksum: string;
    readonly sourceCanonicalContent: string;
    readonly expectedRevision: number;
    readonly expectedPackageVersion: string;
    readonly sourcePack: CurriculumPack;
    readonly currentState: CurriculumPackImportState;
    readonly storageBudget: CurriculumStorageBudgetLimits;
    readonly retainedBackupCodeUnits: number;
  },
  resultingRevision: number,
  proposedPack: CurriculumPack | null,
  classification: CurriculumPackImportClassification,
  conflicts: readonly CurriculumPackImportConflict[],
  warnings: readonly CurriculumPackImportWarning[],
  duplicates: readonly CurriculumPackImportDuplicate[],
  decisions: readonly CurriculumPackImportDecision[],
  changes: readonly CurriculumPackImportChange[],
  resolution: CurriculumPackImportResolution | null,
  forcedStatus?: CurriculumPackImportPreview["status"]
): CurriculumPackImportPreview {
  const initialBlockingConflicts = deduplicateConflicts(conflicts);
  const initialStatus = forcedStatus ?? (initialBlockingConflicts.length > 0 || decisions.length > 0
    ? "blocked"
    : "applicable");
  const counts = countPackEntities(base.sourcePack);
  const projectedProposal = proposedPack ? projectCurriculumPack(proposedPack) : null;
  const shouldAppendJournal = initialStatus !== "blocked"
    && classification !== "operation-idempotent";
  const outcome: CurriculumPackImportAppliedOperation["outcome"] = projectedProposal
    ? "imported"
    : initialStatus === "skipped"
      ? "skipped"
      : initialStatus === "reused"
        ? "reused"
        : "already-present";
  const targetPackId = projectedProposal?.id
    ?? changes.find((change) => change.kind === "reuse-pack")?.targetPackId
    ?? null;
  const resultPack = projectedProposal
    ?? findResultPackForChanges(base.currentState.packs, changes);
  const journalEntry = shouldAppendJournal
    ? createCompactAppliedOperation({
        operationId: base.operationId,
        operationFingerprint: base.operationFingerprint,
        sourceContentChecksum: base.sourceContentChecksum,
        sourcePack: base.sourcePack,
        expectedRevision: base.expectedRevision,
        expectedPackageVersion: base.expectedPackageVersion,
        resolution,
        resultingRevision,
        outcome,
        packId: targetPackId,
        resultPack,
      })
    : null;
  const proposedState: CurriculumPackImportState = shouldAppendJournal
    ? {
        schemaVersion: CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION,
        revision: resultingRevision,
        packs: projectedProposal
          ? [...base.currentState.packs.map(projectCurriculumPack), projectedProposal]
          : base.currentState.packs.map(projectCurriculumPack),
        appliedOperations: [
          ...base.currentState.appliedOperations.map(cloneOperation),
          journalEntry!,
        ],
      }
    : base.currentState;
  const storageEstimate = estimateImportStateStorage(
    base.currentState,
    proposedState,
    journalEntry,
    base.storageBudget,
    base.retainedBackupCodeUnits
  );
  const enforcesStorageBudget = shouldAppendJournal || projectedProposal !== null;
  const budgetConflict = enforcesStorageBudget && !storageEstimate.persistable
    ? storageBudgetConflict(storageEstimate)
    : null;
  const blockingConflicts = deduplicateConflicts([
    ...initialBlockingConflicts,
    ...(budgetConflict ? [budgetConflict] : []),
  ]);
  const status = budgetConflict ? "blocked" : initialStatus;
  const canApply = status !== "blocked";
  const outputWarnings = budgetConflict
    ? [...warnings, warning(
        "storage-budget-exceeded",
        "storageEstimate",
        budgetConflict.message
      )]
    : warnings;
  const previewBase = {
    operationId: base.operationId,
    operationFingerprint: base.operationFingerprint,
    storageBudgetFingerprint: base.storageBudgetFingerprint,
    baseStateFingerprint: base.baseStateFingerprint,
    baseStateCanonical: base.baseStateCanonical,
    sourceContentChecksum: base.sourceContentChecksum,
    sourceCanonicalContent: base.sourceCanonicalContent,
    expectedRevision: base.expectedRevision,
    expectedPackageVersion: base.expectedPackageVersion,
  };
  return deepFreeze({
    ...previewBase,
    sourcePack: projectCurriculumPack(base.sourcePack),
    status,
    classification,
    resultingRevision,
    proposedContentChecksum: projectedProposal
      ? calculateCurriculumPackContentChecksum(projectedProposal)
      : null,
    proposedCanonicalContent: projectedProposal
      ? serializeCurriculumPackContent(projectedProposal)
      : null,
    storageEstimate,
    resolution: resolution ? cloneResolution(resolution) : null,
    proposedPack: projectedProposal,
    summary: {
      packId: base.sourcePack.id,
      name: base.sourcePack.name,
      packageVersion: base.sourcePack.packageVersion,
      provenanceKind: base.sourcePack.provenance.kind,
      subjectCount: counts.subjects,
      specificCompetenceCount: counts.specificCompetences,
      criterionCount: counts.criteria,
      basicKnowledgeCount: counts.basicKnowledge,
      title: "Previsualización de importación curricular",
      message: status === "blocked"
        ? "La importación requiere una decisión explícita o corregir conflictos bloqueantes."
        : status === "idempotent" || status === "reused"
          ? "El catálogo ya existe y no se creará otra copia."
          : status === "skipped"
            ? "La importación se omitirá explícitamente sin cambiar el catálogo."
            : "El catálogo puede añadirse conservando su orden pedagógico.",
    },
    counts,
    blockingConflicts,
    warnings: deduplicateWarnings(outputWarnings),
    duplicates: deduplicateDuplicates(duplicates),
    decisionsRequired: decisions.map(cloneJsonValue),
    proposedChanges: changes.map(cloneJsonValue),
    canApply,
  });
}

function validateImportState(state: CurriculumPackImportState): CurriculumPackImportConflict[] {
  if (
    !state
    || state.schemaVersion !== CURRICULUM_PACK_IMPORT_STATE_SCHEMA_VERSION
    || !Number.isSafeInteger(state.revision)
    || state.revision < 0
    || !Array.isArray(state.packs)
    || !Array.isArray(state.appliedOperations)
  ) {
    return [conflict(
      "invalid-existing-state",
      "state",
      "The existing curriculum import state is invalid."
    )];
  }
  const conflicts: CurriculumPackImportConflict[] = [];
  state.packs.forEach((pack: CurriculumPack, packIndex: number) => {
    const legacyIncomplete = pack.schemaVersion === CURRICULUM_LEGACY_SCHEMA_VERSION
      || pack.subjects.some((subject) => subject.specificCompetences === undefined
        || subject.criteria.some((criterion) => criterion.specificCompetenceId === undefined));
    if (legacyIncomplete) {
      conflicts.push(conflict(
        "legacy-catalog-incomplete",
        `packs[${packIndex}]`,
        "The existing schema-v1 catalog has no complete specific-competence ownership; an explicit reviewed migration is required before import."
      ));
      return;
    }
    const validation = validateCurriculumPackForJson(pack);
    mapPackValidationConflicts(validation).forEach((item) => conflicts.push({
      ...item,
      path: `packs[${packIndex}].${item.path}`,
      code: "invalid-existing-state",
    }));
    collectDuplicateExternalCodeConflicts(pack).forEach((item) => conflicts.push({
      ...item,
      path: `packs[${packIndex}].${item.path}`,
      code: "invalid-existing-state",
    }));
  });
  if (conflicts.length === 0) {
    const shared = validateCurriculumData(createValidationAggregate(state.packs), []);
    shared.issues
      .filter((validationIssue) => validationIssue.severity === "error")
      .forEach((validationIssue) => conflicts.push(conflict(
        "invalid-existing-state",
        validationIssue.path,
        validationIssue.message
      )));
  }
  const operationIds = new Set<string>();
  state.appliedOperations.forEach((operation, index) => {
    const resolutionKindIsValid = [
      "none", "reuse-identical", "skip-import", "import-as-new",
    ].includes(operation.resolutionKind);
    const resultIdentityIsValid = operation.outcome === "skipped"
      ? operation.packId === null && operation.resultContentChecksum === null
      : operation.packId !== null
        && isStableString(operation.resultContentChecksum, 200);
    if (
      !isStableString(operation.operationId, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength)
      || operationIds.has(operation.operationId)
      || !isStableString(operation.operationFingerprint, 300)
      || !/^curriculum-pack-import-operation-v1:[0-9a-z]{2,14}$/.test(
        operation.operationFingerprint
      )
      || !isStableString(operation.sourceContentChecksum, 200)
      || !isStableString(operation.sourcePackId, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength)
      || !Number.isSafeInteger(operation.expectedRevision)
      || operation.expectedRevision < 0
      || !isStableString(
        operation.expectedPackageVersion,
        DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxVersionLength
      )
      || !resolutionKindIsValid
      || !isStableString(
        operation.resolutionIdentity,
        DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxJsonTextLength
      )
      || !Number.isSafeInteger(operation.resolutionIdCount)
      || operation.resolutionIdCount < 0
      || !Number.isSafeInteger(operation.resultingRevision)
      || operation.resultingRevision < 0
      || operation.resultingRevision > state.revision
      || !["imported", "reused", "skipped", "already-present"].includes(operation.outcome)
      || (operation.packId !== null && !isStableString(
        operation.packId,
        DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength
      ))
      || !resultIdentityIsValid
    ) {
      conflicts.push(conflict(
        "invalid-existing-state",
        `appliedOperations[${index}]`,
        "The import idempotency journal is invalid."
      ));
    }
    operationIds.add(operation.operationId);
  });
  return deduplicateConflicts(conflicts);
}

function normalizeResolution(options: CurriculumPackImportPreviewOptions): NormalizedResolution {
  const safeOptions = readPlainDataRecord(options);
  if (!safeOptions) {
    return {
      status: "invalid",
      resolution: null,
      conflict: conflict(
        "unsafe-resolution",
        "options",
        "Resolution options must be plain data without accessors, custom prototypes, or throwing proxies."
      ),
    };
  }
  const hasProgrammaticResolution = Object.hasOwn(safeOptions, "resolution")
    && safeOptions.resolution !== undefined;
  const hasResolutionJson = Object.hasOwn(safeOptions, "resolutionJson")
    && safeOptions.resolutionJson !== undefined;
  if (hasProgrammaticResolution && hasResolutionJson) {
    return {
      status: "invalid",
      resolution: null,
      conflict: conflict(
        "unknown-resolution",
        "options",
        "Provide either resolution or resolutionJson, never both."
      ),
    };
  }
  if (hasResolutionJson) {
    if (typeof safeOptions.resolutionJson !== "string") {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unknown-resolution",
          "resolutionJson",
          "resolutionJson must be a string."
        ),
      };
    }
    const parsed = parseCurriculumPackImportResolutionJson(safeOptions.resolutionJson);
    return parsed.status === "valid"
      ? { status: "valid", resolution: parsed.resolution }
      : { status: "invalid", resolution: null, conflict: parsed.conflict };
  }
  if (!hasProgrammaticResolution) return { status: "none", resolution: null };
  return normalizeResolutionValue(safeOptions.resolution);
}

function normalizeStorageBudget(
  options: CurriculumPackImportPreviewOptions
): NormalizedStorageBudget {
  const safeOptions = readPlainDataRecord(options);
  if (!safeOptions) return invalidStorageBudget(
    "Storage options must be plain data without accessors or custom prototypes."
  );
  const retained = safeOptions.retainedBackupCodeUnits ?? 0;
  if (!Number.isSafeInteger(retained) || (retained as number) < 0) {
    return invalidStorageBudget("retainedBackupCodeUnits must be a non-negative safe integer.");
  }
  const rawBudget = safeOptions.storageBudget === undefined
    ? {}
    : readPlainDataRecord(safeOptions.storageBudget);
  if (!rawBudget) return invalidStorageBudget(
    "storageBudget must be a plain data object without accessors or custom prototypes."
  );
  try {
    return {
      status: "valid",
      budget: resolveCurriculumStorageBudget(
        rawBudget as unknown as Partial<CurriculumStorageBudgetLimits>
      ),
      retainedBackupCodeUnits: retained as number,
    };
  } catch (error) {
    return invalidStorageBudget(
      error instanceof Error ? error.message : "The storage budget is invalid."
    );
  }
}

function invalidStorageBudget(message: string): NormalizedStorageBudget {
  return {
    status: "invalid",
    budget: DEFAULT_CURRICULUM_STORAGE_BUDGET,
    retainedBackupCodeUnits: 0,
    conflict: conflict("invalid-storage-budget", "storageBudget", message),
  };
}

export function parseCurriculumPackImportResolutionJson(
  serialized: string
): CurriculumPackImportResolutionJsonResult {
  if (typeof serialized !== "string") {
    return {
      status: "invalid",
      conflict: conflict("unknown-resolution", "resolutionJson", "Resolution JSON must be a string."),
    };
  }
  if (serialized.length > MAX_RESOLUTION_JSON_TEXT_LENGTH) {
    return {
      status: "invalid",
      conflict: conflict("unsafe-resolution", "resolutionJson", "Resolution JSON exceeds its text limit."),
    };
  }
  const scan = scanCurriculumJsonText(serialized, MAX_RESOLUTION_JSON_DEPTH);
  if (scan.depthExceeded) {
    return {
      status: "invalid",
      conflict: conflict("unsafe-resolution", "resolutionJson", "Resolution JSON exceeds its depth limit."),
    };
  }
  if (scan.duplicateKeyIssues.length > 0) {
    return {
      status: "invalid",
      conflict: conflict(
        "duplicate-resolution-key",
        scan.duplicateKeyIssues[0].path,
        scan.duplicateKeyIssues[0].message
      ),
    };
  }
  if (scan.unsafeKeyIssues.length > 0) {
    return {
      status: "invalid",
      conflict: conflict(
        "unsafe-resolution",
        scan.unsafeKeyIssues[0].path,
        scan.unsafeKeyIssues[0].message
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return {
      status: "invalid",
      conflict: conflict("unknown-resolution", "resolutionJson", "Resolution JSON is malformed."),
    };
  }
  const normalized = normalizeResolutionValue(parsed);
  return normalized.status === "valid"
    ? { status: "valid", resolution: normalized.resolution }
    : {
        status: "invalid",
        conflict: normalized.status === "invalid"
          ? normalized.conflict
          : conflict("unknown-resolution", "resolutionJson", "A resolution is required."),
      };
}

function normalizeResolutionValue(value: unknown): NormalizedResolution {
  const safeValue = readPlainDataRecord(value);
  if (!safeValue || typeof safeValue.kind !== "string") {
    return {
      status: "invalid",
      resolution: null,
      conflict: conflict(
        "unsafe-resolution",
        "resolution",
        "Resolution must be a plain data object without accessors or custom prototypes."
      ),
    };
  }
  if (safeValue.kind === "reuse-identical" || safeValue.kind === "skip-import") {
    if (Object.keys(safeValue).some((key) => key !== "kind")) {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unknown-resolution",
          "resolution",
          `${safeValue.kind} does not accept additional fields.`
        ),
      };
    }
    return { status: "valid", resolution: { kind: safeValue.kind } };
  }
  if (safeValue.kind === "import-as-new") {
    if (
      Object.keys(safeValue).some((key) => key !== "kind" && key !== "idMap")
      || !Object.hasOwn(safeValue, "idMap")
    ) {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unknown-resolution",
          "resolution",
          "import-as-new accepts exactly kind and idMap."
        ),
      };
    }
    const idMapRecord = readPlainDataRecord(safeValue.idMap);
    if (!idMapRecord) {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unsafe-resolution",
          "resolution.idMap",
          "ID maps must be plain data without accessors, custom prototypes, or dangerous keys."
        ),
      };
    }
    const allowedIdMapKeys = [
      "packId",
      "subjectIds",
      "competenceIds",
      "criterionIds",
      "basicKnowledgeIds",
    ];
    const unexpectedIdMapKey = Object.keys(idMapRecord).find(
      (key) => !allowedIdMapKeys.includes(key)
    );
    if (unexpectedIdMapKey) {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unexpected-id-map-entry",
          `resolution.idMap.${unexpectedIdMapKey}`,
          `Unexpected ID map entry ${unexpectedIdMapKey}.`
        ),
      };
    }
    const safeIdMap = sanitizeResolutionIdMap(idMapRecord);
    if (!safeIdMap) {
      return {
        status: "invalid",
        resolution: null,
        conflict: conflict(
          "unsafe-resolution",
          "resolution.idMap",
          "Nested ID maps must be plain data without accessors or custom prototypes."
        ),
      };
    }
    return {
      status: "valid",
      resolution: {
        kind: "import-as-new",
        idMap: safeIdMap as unknown as CurriculumPackImportIdMap,
      },
    };
  }
  return {
    status: "invalid",
    resolution: null,
    conflict: conflict(
      "unknown-resolution",
      "resolution.kind",
      `Resolution ${safeValue.kind} is not supported.`
    ),
  };
}

function sanitizeResolutionIdMap(
  value: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> | null {
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of [
    "packId",
    "subjectIds",
    "competenceIds",
    "criterionIds",
    "basicKnowledgeIds",
  ] as const) {
    if (!Object.hasOwn(value, key)) continue;
    if (key === "packId") {
      result[key] = value[key];
      continue;
    }
    const nested = readPlainDataRecord(value[key]);
    if (!nested) return null;
    const safeNested: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    Object.keys(nested).forEach((nestedKey) => {
      safeNested[nestedKey] = nested[nestedKey];
    });
    result[key] = safeNested;
  }
  return result;
}

/** Copies only own data properties into a null-prototype map; accessors are rejected. */
function readPlainDataRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (DANGEROUS_KEYS.has(key) || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function remapCurriculumPack(
  pack: CurriculumPack,
  idMap: CurriculumPackImportIdMap,
  existingPacks: readonly CurriculumPack[]
): { readonly pack: CurriculumPack | null; readonly conflicts: readonly CurriculumPackImportConflict[] } {
  if (!isRecord(idMap)) {
    return { pack: null, conflicts: [conflict(
      "incomplete-id-map",
      "resolution.idMap",
      "import-as-new requires an explicit complete ID map."
    )] };
  }
  const conflicts: CurriculumPackImportConflict[] = [];
  const allowedKeys = [
    "packId",
    "subjectIds",
    "competenceIds",
    "criterionIds",
    "basicKnowledgeIds",
  ];
  Object.keys(idMap).forEach((key) => {
    if (!allowedKeys.includes(key) || DANGEROUS_KEYS.has(key)) {
      conflicts.push(conflict(
        "unexpected-id-map-entry",
        `resolution.idMap.${key}`,
        `Unexpected ID map entry ${key}.`
      ));
    }
  });
  const subjectIds = readIdRecord(idMap.subjectIds, "resolution.idMap.subjectIds", conflicts);
  const competenceIds = readIdRecord(
    idMap.competenceIds,
    "resolution.idMap.competenceIds",
    conflicts
  );
  const criterionIds = readIdRecord(idMap.criterionIds, "resolution.idMap.criterionIds", conflicts);
  const basicKnowledgeIds = readIdRecord(
    idMap.basicKnowledgeIds,
    "resolution.idMap.basicKnowledgeIds",
    conflicts
  );
  const sourceSubjectIds = pack.subjects.map((subject) => subject.id);
  const sourceCompetenceIds = pack.subjects.flatMap(
    (subject) => subject.specificCompetences?.map((item) => item.id) ?? []
  );
  const sourceCriterionIds = pack.subjects.flatMap((subject) => subject.criteria.map((item) => item.id));
  const sourceKnowledgeIds = pack.subjects.flatMap((subject) => subject.basicKnowledge.map((item) => item.id));
  validateMapCompleteness(subjectIds, sourceSubjectIds, "subjectIds", conflicts);
  validateMapCompleteness(competenceIds, sourceCompetenceIds, "competenceIds", conflicts);
  validateMapCompleteness(criterionIds, sourceCriterionIds, "criterionIds", conflicts);
  validateMapCompleteness(basicKnowledgeIds, sourceKnowledgeIds, "basicKnowledgeIds", conflicts);
  if (!isStableString(idMap.packId, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength)) {
    conflicts.push(conflict("invalid-new-id", "resolution.idMap.packId", "A valid new pack ID is required."));
  } else if (idMap.packId === pack.id) {
    conflicts.push(conflict("invalid-new-id", "resolution.idMap.packId", "Pack ID must be new."));
  }

  const sourceByTarget = new Map<string, string>();
  const originalIds = new Set([
    pack.id,
    ...sourceSubjectIds,
    ...sourceCompetenceIds,
    ...sourceCriterionIds,
    ...sourceKnowledgeIds,
  ]);
  const targetEntries: Array<readonly [string, string | undefined, string]> = [
    [pack.id, idMap.packId, "packId"],
    ...sourceSubjectIds.map((id) => [id, subjectIds?.[id], `subjectIds.${id}`] as const),
    ...sourceCompetenceIds.map((id) => [
      id,
      competenceIds?.[id],
      `competenceIds.${id}`,
    ] as const),
    ...sourceCriterionIds.map((id) => [id, criterionIds?.[id], `criterionIds.${id}`] as const),
    ...sourceKnowledgeIds.map((id) => [id, basicKnowledgeIds?.[id], `basicKnowledgeIds.${id}`] as const),
  ];
  const existingIds = collectPackIds(existingPacks);
  targetEntries.forEach(([sourceId, targetId, path]) => {
    if (!isStableString(targetId, DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxIdentifierLength)) {
      conflicts.push(conflict("invalid-new-id", `resolution.idMap.${path}`, "Mapped ID is invalid."));
      return;
    }
    if (originalIds.has(targetId)) {
      conflicts.push(conflict(
        "invalid-new-id",
        `resolution.idMap.${path}`,
        "Every mapped ID must be new and cannot reuse another source entity ID."
      ));
    }
    const previousSource = sourceByTarget.get(targetId);
    if (previousSource) {
      conflicts.push(conflict(
        "duplicate-new-id",
        `resolution.idMap.${path}`,
        `New ID ${targetId} is already assigned from ${previousSource}.`
      ));
    }
    if (existingIds.has(targetId)) {
      conflicts.push(conflict(
        "new-id-conflict",
        `resolution.idMap.${path}`,
        `New ID ${targetId} already exists in the curriculum collections.`
      ));
    }
    sourceByTarget.set(targetId, sourceId);
  });
  if (
    conflicts.length > 0
    || !subjectIds
    || !competenceIds
    || !criterionIds
    || !basicKnowledgeIds
  ) {
    return { pack: null, conflicts: deduplicateConflicts(conflicts) };
  }

  const remapped: CurriculumPack = {
    ...projectCurriculumPack(pack),
    id: idMap.packId,
    subjects: pack.subjects.map((subject) => ({
      ...subject,
      id: subjectIds[subject.id],
      ...(subject.specificCompetences !== undefined
        ? {
            specificCompetences: subject.specificCompetences.map((competence) => ({
              ...competence,
              id: competenceIds[competence.id],
            })),
          }
        : {}),
      criteria: subject.criteria.map((criterion) => ({
        ...criterion,
        id: criterionIds[criterion.id],
        ...(criterion.specificCompetenceId !== undefined
          ? {
              specificCompetenceId: competenceIds[criterion.specificCompetenceId],
            }
          : {}),
      })),
      basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
        ...knowledge,
        id: basicKnowledgeIds[knowledge.id],
        criterionIds: knowledge.criterionIds.map((criterionId) => criterionIds[criterionId]),
      })),
    })),
  };
  return { pack: deepFreeze(remapped), conflicts: [] };
}

function readIdRecord(
  value: unknown,
  path: string,
  conflicts: CurriculumPackImportConflict[]
): Readonly<Record<string, string>> | null {
  const safeValue = readPlainDataRecord(value);
  if (!safeValue) {
    conflicts.push(conflict("incomplete-id-map", path, "ID mapping must be an object."));
    return null;
  }
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  Object.keys(safeValue).forEach((key) => {
    if (typeof safeValue[key] !== "string") {
      conflicts.push(conflict("invalid-new-id", `${path}.${key}`, "Mapped ID must be a string."));
      return;
    }
    result[key] = safeValue[key] as string;
  });
  return result;
}

function validateMapCompleteness(
  mapping: Readonly<Record<string, string>> | null,
  expectedIds: readonly string[],
  field: string,
  conflicts: CurriculumPackImportConflict[]
): void {
  if (!mapping) return;
  const expected = new Set(expectedIds);
  expectedIds.forEach((id) => {
    if (!Object.hasOwn(mapping, id)) {
      conflicts.push(conflict(
        "incomplete-id-map",
        `resolution.idMap.${field}.${id}`,
        `ID map is missing ${id}.`
      ));
    }
  });
  Object.keys(mapping).forEach((id) => {
    if (!expected.has(id)) {
      conflicts.push(conflict(
        "unexpected-id-map-entry",
        `resolution.idMap.${field}.${id}`,
        `ID map contains unknown source ID ${id}.`
      ));
    }
  });
}

function collectPackDuplicates(
  incoming: CurriculumPack,
  existing: readonly CurriculumPack[]
): CurriculumPackImportDuplicate[] {
  const duplicates: CurriculumPackImportDuplicate[] = [];
  const exact = findExactExistingPack(incoming, existing);
  if (exact) {
    duplicates.push({
      kind: "identical-package",
      incomingId: incoming.id,
      existingId: exact.id,
      message: "The complete catalog content is already present.",
    });
    if (exact.id === incoming.id) duplicates.push({
      kind: "same-pack-id-identical",
      incomingId: incoming.id,
      existingId: exact.id,
      message: "The same pack ID already identifies the same content.",
    });
  }
  const apparentFingerprint = fingerprintApparentContent(incoming);
  existing.forEach((pack) => {
    if (pack.id !== incoming.id && fingerprintApparentContent(pack) === apparentFingerprint) {
      duplicates.push({
        kind: "apparent-content-different-ids",
        incomingId: incoming.id,
        existingId: pack.id,
        message: "Curricular content appears duplicated but internal IDs differ; no merge was performed.",
      });
    }
  });
  return duplicates;
}

function collectDuplicateContentWarnings(
  incoming: CurriculumPack,
  existing: readonly CurriculumPack[]
): CurriculumPackImportWarning[] {
  const warnings: CurriculumPackImportWarning[] = [];
  const duplicates = collectPackDuplicates(incoming, existing);
  duplicates.filter((item) => item.kind === "apparent-content-different-ids").forEach((item) => {
    warnings.push(warning(
      "apparent-content-duplicate",
      "pack",
      `Pack ${incoming.id} resembles ${item.existingId}; IDs remain distinct and no merge was performed.`
    ));
  });
  incoming.subjects.forEach((subject, subjectIndex) => {
    const previousSubject = incoming.subjects.slice(0, subjectIndex).find(
      (candidate) => comparableText(candidate.name) === comparableText(subject.name)
    );
    if (previousSubject) warnings.push(warning(
      "duplicate-subject-name",
      `pack.subjects[${subjectIndex}].name`,
      `Subject name repeats ${previousSubject.id}; identities remain separate.`
    ));
    collectRepeatedTextWarnings(
      subject.specificCompetences ?? [],
      "duplicate-specific-competence-text",
      `pack.subjects[${subjectIndex}].specificCompetences`,
      warnings
    );
    collectRepeatedTextWarnings(subject.criteria, "duplicate-criterion-text", `pack.subjects[${subjectIndex}].criteria`, warnings);
    collectRepeatedTextWarnings(
      subject.basicKnowledge,
      "duplicate-basic-knowledge-text",
      `pack.subjects[${subjectIndex}].basicKnowledge`,
      warnings
    );
  });
  const existingTexts = collectExistingTexts(existing);
  incoming.subjects.forEach((subject, subjectIndex) => {
    subject.specificCompetences?.forEach((competence, competenceIndex) => {
      const match = existingTexts.specificCompetences.get(comparableText(competence.text));
      if (match && match !== competence.id) warnings.push(warning(
        "duplicate-specific-competence-text",
        `pack.subjects[${subjectIndex}].specificCompetences[${competenceIndex}].text`,
        `Specific-competence text resembles existing ${match}; no automatic merge was performed.`
      ));
    });
    subject.criteria.forEach((criterion, criterionIndex) => {
      const match = existingTexts.criteria.get(comparableText(criterion.text));
      if (match && match !== criterion.id) warnings.push(warning(
        "duplicate-criterion-text",
        `pack.subjects[${subjectIndex}].criteria[${criterionIndex}].text`,
        `Criterion text resembles existing ${match}; no automatic merge was performed.`
      ));
    });
    subject.basicKnowledge.forEach((knowledge, knowledgeIndex) => {
      const match = existingTexts.basicKnowledge.get(comparableText(knowledge.text));
      if (match && match !== knowledge.id) warnings.push(warning(
        "duplicate-basic-knowledge-text",
        `pack.subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].text`,
        `Basic-knowledge text resembles existing ${match}; no automatic merge was performed.`
      ));
    });
  });
  return deduplicateWarnings(warnings);
}

function collectRepeatedTextWarnings(
  values: readonly { readonly id: string; readonly text: string }[],
  code:
    | "duplicate-specific-competence-text"
    | "duplicate-criterion-text"
    | "duplicate-basic-knowledge-text",
  path: string,
  warnings: CurriculumPackImportWarning[]
): void {
  values.forEach((value, index) => {
    const previous = values.slice(0, index).find(
      (candidate) => comparableText(candidate.text) === comparableText(value.text)
    );
    if (previous) warnings.push(warning(
      code,
      `${path}[${index}].text`,
      `${value.id} repeats ${previous.id}; no automatic merge was performed.`
    ));
  });
}

function collectDuplicateExternalCodeConflicts(
  pack: CurriculumPack
): CurriculumPackImportConflict[] {
  const conflicts: CurriculumPackImportConflict[] = [];
  collectRepeatedCodes(pack.subjects, "pack.subjects", conflicts);
  pack.subjects.forEach((subject, subjectIndex) => {
    collectRepeatedCodes(
      subject.specificCompetences ?? [],
      `pack.subjects[${subjectIndex}].specificCompetences`,
      conflicts
    );
    collectRepeatedCodes(subject.criteria, `pack.subjects[${subjectIndex}].criteria`, conflicts);
    collectRepeatedCodes(
      subject.basicKnowledge,
      `pack.subjects[${subjectIndex}].basicKnowledge`,
      conflicts
    );
  });
  return conflicts;
}

function collectRepeatedCodes(
  values: readonly { readonly id: string; readonly externalCode?: string }[],
  path: string,
  conflicts: CurriculumPackImportConflict[]
): void {
  const byCode = new Map<string, string>();
  values.forEach((value, index) => {
    if (!value.externalCode) return;
    const code = comparableText(value.externalCode);
    const previous = byCode.get(code);
    if (previous) conflicts.push(conflict(
      "duplicate-external-code",
      `${path}[${index}].externalCode`,
      `External code ${value.externalCode} is already used by ${previous}.`
    ));
    else byCode.set(code, value.id);
  });
}

function collectInternalIdConflicts(
  incoming: CurriculumPack,
  existing: readonly CurriculumPack[]
): CurriculumPackImportConflict[] {
  const existingIds = collectPackIds(existing);
  return collectPackIdEntries(incoming)
    .filter((entry) => existingIds.has(entry.id))
    .map((entry) => conflict(
      "internal-id-conflict",
      entry.path,
      `Internal ID ${entry.id} already exists in another curriculum entity.`
    ));
}

function collectSourceVersionConflicts(
  incoming: CurriculumPack,
  existing: readonly CurriculumPack[]
): CurriculumPackImportConflict[] {
  const identity = sourceVersionIdentity(incoming);
  if (!identity) return [];
  return existing
    .filter((pack) => sourceVersionIdentity(pack) === identity)
    .filter((pack) => !areCurriculumPacksCanonicallyEqual(pack, incoming))
    .map((pack) => conflict(
      "source-version-checksum-conflict",
      "pack.provenance",
      `Pack ${pack.id} has the same provenance and version but different canonical content; checksum equality alone would not make it identical.`
    ));
}

function mapPackValidationConflicts(validation: ReturnType<typeof validateCurriculumPackForJson>): CurriculumPackImportConflict[] {
  const mapped: CurriculumPackImportConflict[] = [];
  validation.referenceIssues.forEach((item) => mapped.push(conflict(
    "broken-reference",
    item.path,
    item.message
  )));
  validation.sourceVersionIssues.forEach((item) => mapped.push(conflict(
    "source-version-incoherent",
    item.path,
    item.message
  )));
  validation.limitIssues.forEach((item) => mapped.push(conflict(
    "invalid-analyzed-pack",
    item.path,
    item.message
  )));
  validation.issues.forEach((item) => mapped.push(conflict(
    "invalid-analyzed-pack",
    item.path,
    item.message
  )));
  return deduplicateConflicts(mapped);
}

function findExactExistingPack(
  incoming: CurriculumPack,
  existing: readonly CurriculumPack[]
): CurriculumPack | undefined {
  return existing.find((pack) => areCurriculumPacksCanonicallyEqual(pack, incoming));
}

function fingerprintApparentContent(pack: CurriculumPack): string {
  return createCurriculumDeterministicFingerprint({
    name: pack.name,
    region: pack.region,
    scope: pack.scope,
    stage: pack.stage,
    course: pack.course,
    subjects: pack.subjects.map((subject) => {
      const competenceIndexById = new Map(
        (subject.specificCompetences ?? []).map((competence, index) => [competence.id, index])
      );
      const criterionIndexById = new Map(subject.criteria.map((criterion, index) => [criterion.id, index]));
      return {
        externalCode: subject.externalCode,
        legacySubjectId: subject.legacySubjectId,
        name: subject.name,
        specificCompetences: subject.specificCompetences?.map((competence) => ({
          externalCode: competence.externalCode,
          sourceVersion: competence.sourceVersion,
          text: competence.text,
        })),
        criteria: subject.criteria.map((criterion) => ({
          externalCode: criterion.externalCode,
          specificCompetenceIndex: criterion.specificCompetenceId === undefined
            ? undefined
            : competenceIndexById.get(criterion.specificCompetenceId),
          sourceVersion: criterion.sourceVersion,
          title: criterion.title,
          text: criterion.text,
        })),
        basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
          externalCode: knowledge.externalCode,
          sourceVersion: knowledge.sourceVersion,
          text: knowledge.text,
          criterionIndexes: knowledge.criterionIds.map((id) => criterionIndexById.get(id)),
        })),
      };
    }),
  });
}

function sourceVersionIdentity(pack: CurriculumPack): string | null {
  if (!pack.provenance.sourceId) return null;
  return serializeCurriculumFingerprintValue({
    kind: pack.provenance.kind,
    sourceId: pack.provenance.sourceId,
    sourceVersion: pack.provenance.sourceVersion ?? null,
    packageVersion: pack.packageVersion,
  });
}

function serializeImportStateCanonical(state: CurriculumPackImportState): string {
  return serializeCurriculumFingerprintValue(state);
}

function fingerprintImportStateCanonical(canonicalState: string): string {
  return `curriculum-pack-import-state-v1:${createCurriculumDeterministicFingerprint(canonicalState)}`;
}

function createImportOperationFingerprint(
  request: CurriculumPackImportRequest,
  sourceContentChecksum: string,
  sourceCanonicalContent: string,
  resolution: unknown
): string {
  return `curriculum-pack-import-operation-v1:${createCurriculumDeterministicFingerprint({
    operationId: request.operationId,
    expectedRevision: request.expectedRevision,
    expectedPackageVersion: request.expectedPackageVersion,
    sourceContentChecksum,
    sourceCanonicalContent,
    resolution,
  })}`;
}

function createStorageBudgetFingerprint(
  budget: CurriculumStorageBudgetLimits,
  retainedBackupCodeUnits: number
): string {
  return `curriculum-storage-budget-v1:${createCurriculumDeterministicFingerprint({
    budget,
    retainedBackupCodeUnits,
  })}`;
}

function classifyDurableOperationRetry(
  operation: CurriculumPackImportAppliedOperation,
  state: CurriculumPackImportState,
  request: CurriculumPackImportRequest,
  operationFingerprint: string,
  sourceContentChecksum: string,
  sourcePack: CurriculumPack,
  resolution: CurriculumPackImportResolution | null
): "same" | "collision" | "history-divergent" {
  const resolutionIdentity = createCompactResolutionIdentity(sourcePack, resolution);
  if (
    operation.operationId !== request.operationId
    || operation.expectedRevision !== request.expectedRevision
    || operation.expectedPackageVersion !== request.expectedPackageVersion
    || operation.operationFingerprint !== operationFingerprint
    || operation.sourceContentChecksum !== sourceContentChecksum
    || operation.sourcePackId !== sourcePack.id
    || operation.resolutionKind !== resolutionIdentity.kind
    || operation.resolutionIdentity !== resolutionIdentity.canonical
    || operation.resolutionIdCount !== resolutionIdentity.idCount
  ) {
    return "collision";
  }
  if (operation.outcome === "skipped" || !operation.packId || !operation.resultContentChecksum) {
    return "history-divergent";
  }
  const currentResult = state.packs.find((pack) => pack.id === operation.packId);
  if (
    !currentResult
    || calculateCurriculumPackContentChecksum(currentResult) !== operation.resultContentChecksum
  ) {
    return "history-divergent";
  }
  const intendedResult = resolution?.kind === "import-as-new"
    ? remapCurriculumPack(sourcePack, resolution.idMap, []).pack
    : sourcePack;
  if (!intendedResult || !areCurriculumPacksCanonicallyEqual(intendedResult, currentResult)) {
    return "history-divergent";
  }
  return "same";
}

function createCompactAppliedOperation(input: {
  readonly operationId: string;
  readonly operationFingerprint: string;
  readonly sourceContentChecksum: string;
  readonly sourcePack: CurriculumPack;
  readonly expectedRevision: number;
  readonly expectedPackageVersion: string;
  readonly resolution: CurriculumPackImportResolution | null;
  readonly resultingRevision: number;
  readonly outcome: CurriculumPackImportAppliedOperation["outcome"];
  readonly packId: string | null;
  readonly resultPack: CurriculumPack | null;
}): CurriculumPackImportAppliedOperation {
  const resolutionIdentity = createCompactResolutionIdentity(
    input.sourcePack,
    input.resolution
  );
  return {
    operationId: input.operationId,
    operationFingerprint: input.operationFingerprint,
    sourceContentChecksum: input.sourceContentChecksum,
    sourcePackId: input.sourcePack.id,
    expectedRevision: input.expectedRevision,
    expectedPackageVersion: input.expectedPackageVersion,
    resolutionKind: resolutionIdentity.kind,
    resolutionIdentity: resolutionIdentity.canonical,
    resolutionIdCount: resolutionIdentity.idCount,
    resultingRevision: input.resultingRevision,
    outcome: input.outcome,
    packId: input.packId,
    resultContentChecksum: input.resultPack
      ? calculateCurriculumPackContentChecksum(input.resultPack)
      : null,
  };
}

function createCompactResolutionIdentity(
  sourcePack: CurriculumPack,
  resolution: CurriculumPackImportResolution | null
): {
  readonly kind: CurriculumPackImportAppliedOperation["resolutionKind"];
  readonly canonical: string;
  readonly idCount: number;
} {
  if (!resolution) return { kind: "none", canonical: "null", idCount: 0 };
  if (resolution.kind !== "import-as-new") {
    return {
      kind: resolution.kind,
      canonical: serializeCurriculumFingerprintValue({ kind: resolution.kind }),
      idCount: 0,
    };
  }
  const pairs = [
    [sourcePack.id, resolution.idMap.packId],
    ...sourcePack.subjects.map((subject) => [
      subject.id,
      resolution.idMap.subjectIds[subject.id],
    ]),
    ...sourcePack.subjects.flatMap((subject) => (
      subject.specificCompetences?.map((competence) => [
        competence.id,
        resolution.idMap.competenceIds[competence.id],
      ]) ?? []
    )),
    ...sourcePack.subjects.flatMap((subject) => subject.criteria.map((criterion) => [
      criterion.id,
      resolution.idMap.criterionIds[criterion.id],
    ])),
    ...sourcePack.subjects.flatMap((subject) => subject.basicKnowledge.map((knowledge) => [
      knowledge.id,
      resolution.idMap.basicKnowledgeIds[knowledge.id],
    ])),
  ];
  return {
    kind: resolution.kind,
    canonical: serializeCurriculumFingerprintValue({ kind: resolution.kind, pairs }),
    idCount: pairs.length,
  };
}

function findResultPackForChanges(
  packs: readonly CurriculumPack[],
  changes: readonly CurriculumPackImportChange[]
): CurriculumPack | null {
  const targetPackId = changes.find((change) => change.kind === "reuse-pack")?.targetPackId;
  return targetPackId
    ? packs.find((pack) => pack.id === targetPackId) ?? null
    : null;
}

function estimateImportStateStorage(
  currentState: CurriculumPackImportState,
  proposedState: CurriculumPackImportState,
  nextEntry: CurriculumPackImportAppliedOperation | null,
  budget: CurriculumStorageBudgetLimits,
  retainedBackupCodeUnits: number
): CurriculumPackImportStorageEstimate {
  const currentStateSize = measureCurriculumSerializedJson(currentState);
  const proposedStateSize = measureCurriculumSerializedJson(proposedState);
  const currentJournal = measureCurriculumSerializedJson(currentState.appliedOperations);
  const proposedJournal = measureCurriculumSerializedJson(proposedState.appliedOperations);
  const nextJournalEntry = nextEntry ? measureCurriculumSerializedJson(nextEntry) : null;
  const protocol = estimateCurriculumStorageProtocolPeak({
    currentState,
    targetState: proposedState,
    retainedBackupCodeUnits,
  });
  const exceededLimits: CurriculumPackImportStorageEstimate["exceededLimits"][number][] = [];
  if (proposedStateSize.codeUnits > budget.maxPersistedStateCodeUnits) {
    exceededLimits.push("state");
  }
  if (nextJournalEntry && nextJournalEntry.codeUnits > budget.maxJournalEntryCodeUnits) {
    exceededLimits.push("journal-entry");
  }
  if (proposedJournal.codeUnits > budget.maxJournalCodeUnits) {
    exceededLimits.push("journal-total");
  }
  if (proposedState.appliedOperations.length > budget.maxJournalEntries) {
    exceededLimits.push("journal-count");
  }
  if (protocol.worstCase.codeUnits > budget.maxProtocolPeakCodeUnits) {
    exceededLimits.push("protocol-peak");
  }
  return {
    budget,
    currentState: currentStateSize,
    proposedState: proposedStateSize,
    currentJournal,
    proposedJournal,
    nextJournalEntry,
    proposedJournalEntries: proposedState.appliedOperations.length,
    protocol,
    exceededLimits,
    persistable: exceededLimits.length === 0,
  };
}

function storageBudgetConflict(
  estimate: CurriculumPackImportStorageEstimate
): CurriculumPackImportConflict {
  return conflict(
    "storage-budget-exceeded",
    "storageEstimate",
    `The import exceeds the configured persistent-storage budget (${estimate.exceededLimits.join(", ")}); state=${estimate.proposedState.codeUnits}, journal=${estimate.proposedJournal.codeUnits}, protocolPeak=${estimate.protocol.worstCase.codeUnits} UTF-16 code units.`
  );
}

function countPackEntities(pack: CurriculumPack): {
  readonly subjects: number;
  readonly specificCompetences: number;
  readonly criteria: number;
  readonly basicKnowledge: number;
  readonly criterionReferences: number;
} {
  return {
    subjects: pack.subjects.length,
    specificCompetences: pack.subjects.reduce(
      (total, subject) => total + (subject.specificCompetences?.length ?? 0),
      0
    ),
    criteria: pack.subjects.reduce((total, subject) => total + subject.criteria.length, 0),
    basicKnowledge: pack.subjects.reduce(
      (total, subject) => total + subject.basicKnowledge.length,
      0
    ),
    criterionReferences: pack.subjects.reduce(
      (total, subject) => total + subject.basicKnowledge.reduce(
        (subjectTotal, knowledge) => subjectTotal + knowledge.criterionIds.length,
        0
      ),
      0
    ),
  };
}

function collectPackIds(packs: readonly CurriculumPack[]): Set<string> {
  return new Set(packs.flatMap((pack) => collectPackIdEntries(pack).map((entry) => entry.id)));
}

function collectPackIdEntries(pack: CurriculumPack): Array<{ readonly id: string; readonly path: string }> {
  return [
    { id: pack.id, path: "pack.id" },
    ...pack.subjects.flatMap((subject, subjectIndex) => [
      { id: subject.id, path: `pack.subjects[${subjectIndex}].id` },
      ...(subject.specificCompetences?.map((competence, competenceIndex) => ({
        id: competence.id,
        path: `pack.subjects[${subjectIndex}].specificCompetences[${competenceIndex}].id`,
      })) ?? []),
      ...subject.criteria.map((criterion, criterionIndex) => ({
        id: criterion.id,
        path: `pack.subjects[${subjectIndex}].criteria[${criterionIndex}].id`,
      })),
      ...subject.basicKnowledge.map((knowledge, knowledgeIndex) => ({
        id: knowledge.id,
        path: `pack.subjects[${subjectIndex}].basicKnowledge[${knowledgeIndex}].id`,
      })),
    ]),
  ];
}

function collectExistingTexts(packs: readonly CurriculumPack[]): {
  readonly specificCompetences: Map<string, string>;
  readonly criteria: Map<string, string>;
  readonly basicKnowledge: Map<string, string>;
} {
  const specificCompetences = new Map<string, string>();
  const criteria = new Map<string, string>();
  const basicKnowledge = new Map<string, string>();
  packs.forEach((pack) => pack.subjects.forEach((subject) => {
    subject.specificCompetences?.forEach((competence) => {
      specificCompetences.set(comparableText(competence.text), competence.id);
    });
    subject.criteria.forEach((criterion) => criteria.set(comparableText(criterion.text), criterion.id));
    subject.basicKnowledge.forEach((knowledge) => {
      basicKnowledge.set(comparableText(knowledge.text), knowledge.id);
    });
  }));
  return { specificCompetences, criteria, basicKnowledge };
}

function createValidationAggregate(packs: readonly CurriculumPack[]): VersionedCurriculumData {
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "curriculum-pack-import-validation",
      status: "inactive",
      activeProfileId: null,
    },
    packs,
    profiles: [],
    actionLinks: [],
  };
}

function cloneOperation(operation: CurriculumPackImportAppliedOperation): CurriculumPackImportAppliedOperation {
  return { ...operation };
}

function cloneResolution(resolution: CurriculumPackImportResolution): CurriculumPackImportResolution {
  return resolution.kind === "import-as-new"
    ? { kind: resolution.kind, idMap: cloneJsonValue(resolution.idMap) }
    : { kind: resolution.kind };
}

function isStableString(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && value.length <= maximum
    && isValidCurriculumJsonString(value);
}

function comparableText(value: string): string {
  return value.toLocaleLowerCase("es");
}

function conflict(
  code: CurriculumPackImportConflictCode,
  path: string,
  message: string
): CurriculumPackImportConflict {
  return { code, path, message };
}

function warning(
  code: CurriculumPackImportWarningCode,
  path: string,
  message: string
): CurriculumPackImportWarning {
  return { code, path, message };
}

function deduplicateConflicts(
  conflicts: readonly CurriculumPackImportConflict[]
): CurriculumPackImportConflict[] {
  return [...new Map(conflicts.map((item) => [`${item.code}:${item.path}:${item.message}`, item])).values()];
}

function deduplicateWarnings(
  warnings: readonly CurriculumPackImportWarning[]
): CurriculumPackImportWarning[] {
  return [...new Map(warnings.map((item) => [`${item.code}:${item.path}:${item.message}`, item])).values()];
}

function deduplicateDuplicates(
  duplicates: readonly CurriculumPackImportDuplicate[]
): CurriculumPackImportDuplicate[] {
  return [...new Map(duplicates.map((item) => [
    `${item.kind}:${item.incomingId}:${item.existingId}`,
    item,
  ])).values()];
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
