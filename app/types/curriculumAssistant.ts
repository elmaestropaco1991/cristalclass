import type {
  ActionCurricularLink,
  CurriculumCatalogEditorState,
  CurriculumProfile,
} from "./curriculum";

export const CURRICULUM_ASSISTANT_SCHEMA_VERSION = 1 as const;

export type CurriculumAssistantStep = 1 | 2 | 3;

export interface PendingBasicKnowledgeDraft {
  readonly id: string;
  readonly subjectId: string;
  readonly externalCode?: string;
  readonly text: string;
}

export interface CurriculumKnowledgeCriteriaOverride {
  readonly basicKnowledgeId: string;
  readonly criterionIds: readonly string[];
}

export interface CurriculumAssistantLegacyImport {
  /** Original, checksummed exchange JSON. It is never migrated or repaired on read. */
  readonly serializedJson: string;
  readonly subjectCount: number;
  readonly criterionCount: number;
  readonly basicKnowledgeCount: number;
  readonly importedAt: string;
}

/**
 * Per-class preparation state. The curriculum pack remains the catalog source of
 * truth. The small auxiliary collections represent deliberately incomplete draft
 * work that the strict v2 catalog cannot contain yet, plus non-destructive hiding.
 */
export interface CurriculumAssistantState {
  readonly schemaVersion: typeof CURRICULUM_ASSISTANT_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly revision: number;
  readonly trackingEnabled: boolean;
  readonly wizardStep: CurriculumAssistantStep;
  readonly catalog: CurriculumCatalogEditorState;
  readonly profile: CurriculumProfile | null;
  readonly actionLinks: readonly ActionCurricularLink[];
  readonly archivedSubjectIds: readonly string[];
  readonly retiredSpecificCompetenceIds: readonly string[];
  readonly retiredCriterionIds: readonly string[];
  readonly retiredBasicKnowledgeIds: readonly string[];
  readonly pendingBasicKnowledge: readonly PendingBasicKnowledgeDraft[];
  readonly knowledgeCriteriaOverrides: readonly CurriculumKnowledgeCriteriaOverride[];
  readonly legacyImport: CurriculumAssistantLegacyImport | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CurriculumAssistantStorageEnvelope {
  readonly schemaVersion: typeof CURRICULUM_ASSISTANT_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly revision: number;
  readonly state: CurriculumAssistantState;
  readonly writtenAt: string;
  readonly checksum: string;
}

export type CurriculumSubjectPreparationStatus =
  | "not-started"
  | "in-progress"
  | "needs-review"
  | "ready"
  | "active";

export interface CurriculumSubjectPreparationInspection {
  readonly subjectId: string;
  readonly status: CurriculumSubjectPreparationStatus;
  readonly canActivate: boolean;
  readonly blockingMessages: readonly string[];
  readonly warningMessages: readonly string[];
  readonly counts: {
    readonly specificCompetences: number;
    readonly criteria: number;
    readonly basicKnowledge: number;
    readonly relatedKnowledge: number;
    readonly actionLinks: number;
  };
}
