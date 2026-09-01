import type {
  Action,
  ActionSubjectContext,
  AttitudinalCriterionReference,
} from "../types/action";
import { GENERAL_SUBJECT_ID, SUBJECT_IDS, type SubjectId } from "../types/subject";
import { isSubjectId } from "./subjectCatalogService";

/** Legacy or unknown contexts degrade safely to General and never become global implicitly. */
export function normalizeActionContext(value: unknown): ActionSubjectContext {
  const source = isRecord(value) ? value : {};

  return {
    subjectId: isSubjectId(source.subjectId) ? source.subjectId : GENERAL_SUBJECT_ID,
    availableInAllSubjects: source.availableInAllSubjects === true,
  };
}

export function normalizeAttitudinalCriterionLinks(
  value: unknown
): readonly AttitudinalCriterionReference[] {
  if (!Array.isArray(value)) return [];

  const criterionIds = new Set<string>();

  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];

    const criterionId = typeof candidate.criterionId === "string"
      ? candidate.criterionId.trim()
      : "";
    const catalogVersion = typeof candidate.catalogVersion === "string"
      ? candidate.catalogVersion.trim()
      : "";

    if (!criterionId || !catalogVersion || criterionIds.has(criterionId)) return [];

    criterionIds.add(criterionId);
    return [{ criterionId, catalogVersion }];
  });
}

/** Domain invariant for the future ordinary-compliance option. */
export function validateOrdinaryComplianceTracking(
  points: number,
  trackOrdinaryCompliance: boolean
): void {
  if (trackOrdinaryCompliance && points >= 0) {
    throw new Error("Ordinary compliance tracking requires a negative action.");
  }
}

export function validateActionSubjectContext(value: unknown): void {
  if (!isRecord(value) || !isSubjectId(value.subjectId)) {
    throw new Error("Selecciona una asignatura válida.");
  }

  if (typeof value.availableInAllSubjects !== "boolean") {
    throw new Error("La disponibilidad global de la acción no es válida.");
  }
}

/** Corrupt legacy flags are disabled during hydration instead of breaking the catalog. */
export function normalizeOrdinaryComplianceTracking(points: number, value: unknown): boolean {
  return value === true && points < 0;
}

/** Pure operational selector; archived actions and duplicate identifiers are excluded. */
export function getVisibleActionsForSubject(
  catalog: readonly Action[],
  activeSubjectId: SubjectId
): Action[] {
  const visibleIds = new Set<string>();

  return catalog.filter((action) => {
    if (action.archived || visibleIds.has(action.id)) return false;

    const context = normalizeActionContext(action);
    const artisticContext = (
      activeSubjectId === SUBJECT_IDS.MUSIC
      || activeSubjectId === SUBJECT_IDS.ART_EDUCATION
    ) && (
      context.subjectId === SUBJECT_IDS.MUSIC
      || context.subjectId === SUBJECT_IDS.ART_EDUCATION
    );
    const visible = context.subjectId === activeSubjectId
      || artisticContext
      || context.availableInAllSubjects;

    if (visible) visibleIds.add(action.id);
    return visible;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
