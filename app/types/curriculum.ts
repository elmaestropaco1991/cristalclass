export const CURRICULUM_SCHEMA_VERSION = 1 as const;

export type CurriculumModuleStatus = "inactive" | "configured" | "active";
export type EvidenceEffect = "positive" | "contrary";
export type RecordingMode = "manual" | "ordinary";

export type CurriculumProvenanceKind =
  | "manual"
  | "imported"
  | "external"
  | "shared"
  | "legacy-provisional";

export interface CurriculumProvenance {
  readonly kind: CurriculumProvenanceKind;
  readonly sourceId?: string;
  readonly sourceVersion?: string;
  readonly label?: string;
}

export interface Criterion {
  readonly id: string;
  readonly externalCode?: string;
  /**
   * Source catalog version. Legacy `Action.attitudinalCriterionLinks.catalogVersion`
   * is matched against this field, never against the editor revision. In a manual
   * pack it records the `packageVersion` that last changed this criterion content.
   */
  readonly sourceVersion?: string;
  readonly title?: string;
  readonly text: string;
}

export interface BasicKnowledge {
  readonly id: string;
  readonly externalCode?: string;
  /**
   * Source catalog version; in a manual pack it records the `packageVersion` that
   * last changed this knowledge text or its criterion relations.
   */
  readonly sourceVersion?: string;
  readonly text: string;
  readonly criterionIds: readonly string[];
}

export interface CurriculumSubject {
  readonly id: string;
  readonly externalCode?: string;
  readonly legacySubjectId?: string;
  readonly name: string;
  readonly criteria: readonly Criterion[];
  readonly basicKnowledge: readonly BasicKnowledge[];
}

export interface CurriculumPack {
  readonly id: string;
  readonly schemaVersion: number;
  /** Portable label identifying the complete package snapshot. */
  readonly packageVersion: string;
  readonly name: string;
  readonly region?: string;
  readonly scope?: string;
  readonly stage?: string;
  readonly course?: string;
  readonly provenance: CurriculumProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly subjects: readonly CurriculumSubject[];
}

export interface OrdinaryTrackingRule {
  readonly id: string;
  readonly subjectId: string;
  readonly basicKnowledgeId: string;
  readonly observableActionId: string;
  readonly contraryActionIds: readonly string[];
  readonly enabled: boolean;
}

export interface OrdinaryTrackingConfig {
  readonly enabled: boolean;
  readonly minimumSessionDurationMinutes: number;
  readonly rules: readonly OrdinaryTrackingRule[];
}

export interface CurriculumProfile {
  readonly id: string;
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly packId: string | null;
  readonly provenance: CurriculumProvenance;
  readonly status: CurriculumModuleStatus;
  readonly selectedSubjectIds: readonly string[];
  readonly ordinaryTracking: OrdinaryTrackingConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ActionCurricularLink {
  readonly id: string;
  readonly schemaVersion: number;
  readonly actionId: string;
  readonly profileId: string;
  readonly subjectId: string;
  readonly basicKnowledgeId: string;
  readonly resolvedCriterionIds: readonly string[];
  readonly effect: EvidenceEffect;
  readonly recordingMode: RecordingMode;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CurriculumModuleConfig {
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly status: CurriculumModuleStatus;
  readonly activeProfileId: string | null;
}

export interface VersionedCurriculumData {
  readonly schemaVersion: number;
  readonly module: CurriculumModuleConfig;
  readonly packs: readonly CurriculumPack[];
  readonly profiles: readonly CurriculumProfile[];
  readonly actionLinks: readonly ActionCurricularLink[];
}

export type CurriculumMigrationConflictKind =
  | "corrupt-action"
  | "duplicate-action"
  | "unknown-subject"
  | "missing-profile"
  | "missing-criterion"
  | "missing-basic-knowledge"
  | "ambiguous-basic-knowledge"
  | "duplicate-link"
  | "invalid-existing-data";

export interface CurriculumMigrationConflict {
  readonly id: string;
  readonly kind: CurriculumMigrationConflictKind;
  readonly sourceIndex?: number;
  readonly actionId?: string;
  readonly referenceId?: string;
  readonly message: string;
  readonly sourceSnapshot?: string;
}

export interface CurriculumMigrationApplicationContract {
  readonly mode: "explicit-additive";
  readonly preservesLegacyActionFields: true;
  readonly rewritesStorageOnRead: false;
  readonly supportsRollbackWithoutDeletion: true;
  readonly requiresConflictResolution: boolean;
}

export interface CurriculumMigrationPlan {
  readonly id: string;
  readonly schemaVersion: number;
  readonly sourceFingerprint: string;
  readonly proposedPack: CurriculumPack;
  readonly proposedProfile: CurriculumProfile;
  readonly proposedLinks: readonly ActionCurricularLink[];
  readonly conflicts: readonly CurriculumMigrationConflict[];
  readonly preservedActionIds: readonly string[];
  readonly preservedLegacySubjectIds: readonly string[];
  readonly application: CurriculumMigrationApplicationContract;
}

export interface CurriculumMigrationResult {
  readonly planId: string;
  readonly status: "previewed" | "applied" | "rejected";
  readonly data: VersionedCurriculumData | null;
  readonly conflicts: readonly CurriculumMigrationConflict[];
  readonly appliedAt: string | null;
}

export interface CurriculumStorageEnvelope {
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly revision: number;
  readonly curriculumData: VersionedCurriculumData;
  readonly writtenAt: string;
  readonly contentChecksum: string;
  readonly lastOperationId: string;
}

export type CurriculumStorageOperationKind = "migration" | "rollback";
export type CurriculumStorageTransactionStage =
  | "prepared"
  | "backup-saved"
  | "promoted"
  | "reviewed";

export interface CurriculumStorageTransaction {
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly transactionId: string;
  readonly operationId: string;
  readonly operationKind: CurriculumStorageOperationKind;
  readonly expectedRevision: number;
  readonly targetRevision: number;
  readonly targetEnvelope: CurriculumStorageEnvelope;
  readonly backupKey: string;
  readonly preparedAt: string;
  readonly stage: CurriculumStorageTransactionStage;
}

export interface CurriculumStorageBackup {
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly backupId: string;
  readonly transactionId: string;
  readonly sourceRevision: number;
  readonly targetRevision: number;
  readonly previousEnvelope: CurriculumStorageEnvelope | null;
  readonly createdAt: string;
}

export interface CurriculumStorageReviewMetadata {
  readonly schemaVersion: number;
  readonly classroomId: string;
  readonly revision: number;
  readonly operationId: string;
  readonly operationKind: CurriculumStorageOperationKind;
  readonly contentChecksum: string;
  readonly reviewedAt: string;
}

export interface CurriculumCatalogAppliedOperation {
  readonly operationId: string;
  readonly commandFingerprint: string;
  readonly resultingVersion: number;
}

export interface CurriculumCatalogEditorState {
  readonly schemaVersion: number;
  /** Optimistic-concurrency revision; manual packs encode the same revision as `manual-rN`. */
  readonly revision: number;
  readonly pack: CurriculumPack | null;
  /**
   * Durable idempotency journal. This phase never prunes it; a future persistence policy
   * must archive or compact it without losing retry protection.
   */
  readonly appliedOperations: readonly CurriculumCatalogAppliedOperation[];
}

export interface CurriculumCatalogCommandBase {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly occurredAt: string;
}

export interface CurriculumCatalogSubjectInput {
  readonly id: string;
  readonly name: string;
  readonly externalCode?: string;
}

export interface CurriculumCatalogCriterionInput {
  readonly id: string;
  readonly externalCode?: string;
  readonly title?: string;
  readonly text: string;
}

export interface CurriculumCatalogBasicKnowledgeInput {
  readonly id: string;
  readonly externalCode?: string;
  readonly text: string;
  readonly criterionIds: readonly string[];
}

export type CurriculumCatalogCommand =
  | (CurriculumCatalogCommandBase & {
      readonly type: "create-manual-pack";
      readonly packId: string;
      readonly name: string;
      readonly region?: string;
      readonly scope?: string;
      readonly stage?: string;
      readonly course?: string;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "update-pack-metadata";
      readonly packId: string;
      readonly name: string;
      readonly region?: string | null;
      readonly scope?: string | null;
      readonly stage?: string | null;
      readonly course?: string | null;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "add-subject";
      readonly packId: string;
      readonly subject: CurriculumCatalogSubjectInput;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "update-subject";
      readonly packId: string;
      readonly subjectId: string;
      readonly name: string;
      readonly externalCode?: string | null;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "reorder-subjects";
      readonly packId: string;
      readonly subjectIds: readonly string[];
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "add-criterion";
      readonly packId: string;
      readonly subjectId: string;
      readonly criterion: CurriculumCatalogCriterionInput;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "update-criterion";
      readonly packId: string;
      readonly subjectId: string;
      readonly criterionId: string;
      readonly externalCode?: string | null;
      readonly title?: string | null;
      readonly text: string;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "reorder-criteria";
      readonly packId: string;
      readonly subjectId: string;
      readonly criterionIds: readonly string[];
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "add-basic-knowledge";
      readonly packId: string;
      readonly subjectId: string;
      readonly basicKnowledge: CurriculumCatalogBasicKnowledgeInput;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "update-basic-knowledge";
      readonly packId: string;
      readonly subjectId: string;
      readonly basicKnowledgeId: string;
      readonly externalCode?: string | null;
      readonly text: string;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "set-basic-knowledge-criteria";
      readonly packId: string;
      readonly subjectId: string;
      readonly basicKnowledgeId: string;
      readonly criterionIds: readonly string[];
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "reorder-basic-knowledge";
      readonly packId: string;
      readonly subjectId: string;
      readonly basicKnowledgeIds: readonly string[];
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "request-remove-subject";
      readonly packId: string;
      readonly subjectId: string;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "request-remove-criterion";
      readonly packId: string;
      readonly subjectId: string;
      readonly criterionId: string;
    })
  | (CurriculumCatalogCommandBase & {
      readonly type: "request-remove-basic-knowledge";
      readonly packId: string;
      readonly subjectId: string;
      readonly basicKnowledgeId: string;
    });

export type CurriculumCatalogEntityType =
  | "pack"
  | "subject"
  | "criterion"
  | "basic-knowledge";

export interface CurriculumCatalogAffectedEntity {
  readonly entityType: CurriculumCatalogEntityType;
  readonly entityId: string;
}

export type CurriculumCatalogDependencyKind =
  | "contained-criterion"
  | "contained-basic-knowledge"
  | "knowledge-criterion"
  | "profile-subject"
  | "action-link-subject"
  | "action-link-criterion"
  | "action-link-basic-knowledge"
  | "ordinary-tracking-subject"
  | "ordinary-tracking-basic-knowledge";

export type CurriculumCatalogDependencyOrigin =
  | "catalog"
  | "profiles"
  | "action-links"
  | "ordinary-tracking";

export interface CurriculumCatalogDependency {
  readonly kind: CurriculumCatalogDependencyKind;
  readonly origin: CurriculumCatalogDependencyOrigin;
  readonly sourceId: string;
  readonly targetId: string;
  readonly path: string;
  readonly message: string;
}

export type CurriculumCatalogWarningCode =
  | "duplicate-subject-name"
  | "duplicate-criterion-text"
  | "duplicate-basic-knowledge-text"
  | "no-content-change";

export interface CurriculumCatalogWarning {
  readonly code: CurriculumCatalogWarningCode;
  readonly path: string;
  readonly message: string;
}

export type CurriculumCatalogConflictCode =
  | "invalid-state"
  | "invalid-operation-id"
  | "invalid-date"
  | "stale-version"
  | "operation-id-collision"
  | "pack-already-exists"
  | "pack-not-found"
  | "pack-id-mismatch"
  | "entity-not-found"
  | "duplicate-id"
  | "duplicate-external-code"
  | "invalid-name"
  | "invalid-text"
  | "missing-criterion"
  | "criterion-from-another-subject"
  | "invalid-order"
  | "dependency-blocking"
  | "dependency-context-incomplete"
  | "decision-required"
  | "invalid-result";

export interface CurriculumCatalogConflict {
  readonly code: CurriculumCatalogConflictCode;
  readonly path: string;
  readonly message: string;
}

export interface CurriculumCatalogChange {
  readonly kind: "create" | "update" | "reorder" | "request-removal";
  readonly entityType: CurriculumCatalogEntityType;
  readonly entityId: string;
  readonly before: unknown | null;
  readonly after: unknown | null;
}

export type CurriculumCatalogDependencySource =
  | "profiles"
  | "action-links"
  | "ordinary-tracking";

export interface CurriculumCatalogDependencyContext {
  /** Sources the caller explicitly loaded completely for this preview. */
  readonly inspectedSources: readonly CurriculumCatalogDependencySource[];
  readonly profiles?: readonly CurriculumProfile[];
  readonly actionLinks?: readonly ActionCurricularLink[];
}

export interface CurriculumCatalogCommandPreview {
  readonly status: "applicable" | "blocked" | "idempotent";
  readonly operationId: string;
  readonly commandFingerprint: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly proposedPack: CurriculumPack | null;
  readonly changes: readonly CurriculumCatalogChange[];
  readonly affectedEntities: readonly CurriculumCatalogAffectedEntity[];
  readonly dependencies: readonly CurriculumCatalogDependency[];
  readonly warnings: readonly CurriculumCatalogWarning[];
  readonly conflicts: readonly CurriculumCatalogConflict[];
  readonly canApply: boolean;
  readonly summary: {
    readonly title: string;
    readonly message: string;
    readonly changeCount: number;
    readonly dependencyCount: number;
    readonly warningCount: number;
    readonly conflictCount: number;
  };
}

export type CurriculumCatalogApplyResult =
  | {
      readonly status: "applied";
      readonly state: CurriculumCatalogEditorState;
      readonly pack: CurriculumPack;
      readonly preview: CurriculumCatalogCommandPreview;
    }
  | {
      readonly status: "idempotent";
      readonly state: CurriculumCatalogEditorState;
      readonly pack: CurriculumPack | null;
      readonly preview: CurriculumCatalogCommandPreview;
    }
  | {
      readonly status: "rejected";
      readonly reason: "blocked" | "invalid-state";
      readonly state: CurriculumCatalogEditorState;
      readonly preview: CurriculumCatalogCommandPreview;
    };
