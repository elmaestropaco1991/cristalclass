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
  readonly sourceVersion?: string;
  readonly title?: string;
  readonly text: string;
}

export interface BasicKnowledge {
  readonly id: string;
  readonly externalCode?: string;
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
