import type {
  Action,
  ActionType,
  AttitudinalCriterionReference,
  QuickActionSlot,
} from "../types/action";
import type { SubjectId } from "../types/subject";
import {
  normalizeActionContext,
  normalizeAttitudinalCriterionLinks,
  normalizeOrdinaryComplianceTracking,
  validateActionSubjectContext,
  validateOrdinaryComplianceTracking,
} from "./actionSubjectService";

export type CreateActionInput = {
  id: ActionType;
  title: string;
  points: number;
  icon?: string;
  iconId?: string;
  quickSlot?: QuickActionSlot | null;
  subjectId?: SubjectId;
  availableInAllSubjects?: boolean;
  attitudinalCriterionLinks?: readonly AttitudinalCriterionReference[];
  trackOrdinaryCompliance?: boolean;
};

export type UpdateActionConfigurationInput = {
  title: string;
  points: number;
  iconId?: string;
  quickSlot: QuickActionSlot | null;
  archived: boolean;
  subjectId: SubjectId;
  availableInAllSubjects: boolean;
  trackOrdinaryCompliance: boolean;
};

export function getQuickActions(catalog: readonly Action[]): Action[] {
  return catalog
    .filter((action) => !action.archived && action.quickSlot !== null)
    .sort((left, right) => left.quickSlot! - right.quickSlot!);
}

export function getAdditionalActions(catalog: readonly Action[]): Action[] {
  return catalog.filter((action) => !action.archived && action.quickSlot === null);
}

export function getArchivedActions(catalog: readonly Action[]): Action[] {
  return catalog.filter((action) => action.archived);
}

export function createAction(catalog: readonly Action[], input: CreateActionInput): Action[] {
  const action = createValidatedAction(input);

  if (catalog.some((existing) => existing.id === action.id)) {
    throw new Error("An action with this identifier already exists.");
  }

  const nextCatalog = [...catalog, action];

  return action.quickSlot === null
    ? nextCatalog
    : assignQuickActionSlot(nextCatalog, action.id, action.quickSlot);
}

export function updateActionName(
  catalog: readonly Action[],
  actionId: ActionType,
  title: string
): Action[] {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("An action name is required.");
  }

  return updateAction(catalog, actionId, (action) => ({ ...action, title: normalizedTitle }));
}

export function updateActionPoints(
  catalog: readonly Action[],
  actionId: ActionType,
  points: number
): Action[] {
  validatePoints(points);
  return updateAction(catalog, actionId, (action) => ({
    ...action,
    points,
    trackOrdinaryCompliance: normalizeOrdinaryComplianceTracking(
      points,
      action.trackOrdinaryCompliance
    ),
  }));
}

export function updateActionIcon(
  catalog: readonly Action[],
  actionId: ActionType,
  icon: string | undefined,
  iconId: string | undefined
): Action[] {
  return updateAction(catalog, actionId, (action) => ({
    ...action,
    ...(icon === undefined ? {} : { icon }),
    ...(iconId === undefined ? {} : { iconId }),
  }));
}

/** Quick positions are unique inside each subject, not across the whole catalog. */
export function assignQuickActionSlot(
  catalog: readonly Action[],
  actionId: ActionType,
  quickSlot: QuickActionSlot
): Action[] {
  validateQuickSlot(quickSlot);
  const action = findAction(catalog, actionId);

  if (action.archived) {
    throw new Error("Archived actions cannot occupy a quick slot.");
  }

  return catalog.map((current) => {
    if (current.id === actionId) return { ...current, quickSlot };

    const sameSubject = current.subjectId === action.subjectId;
    return sameSubject && current.quickSlot === quickSlot
      ? { ...current, quickSlot: null }
      : current;
  });
}

/** Moves a quick action inside its own subject. Moving onto another quick action swaps them. */
export function moveActionQuickSlot(
  catalog: readonly Action[],
  actionId: ActionType,
  quickSlot: QuickActionSlot | null
): Action[] {
  const action = findAction(catalog, actionId);

  if (action.archived && quickSlot !== null) {
    throw new Error("Archived actions cannot occupy a quick slot.");
  }

  if (quickSlot === null) {
    return catalog.map((current) => current.id === actionId ? { ...current, quickSlot: null } : current);
  }

  validateQuickSlot(quickSlot);
  const occupant = catalog.find((current) =>
    current.id !== actionId
    && current.subjectId === action.subjectId
    && current.quickSlot === quickSlot
  );

  return catalog.map((current) => {
    if (current.id === actionId) return { ...current, quickSlot };
    if (current.id === occupant?.id) return { ...current, quickSlot: action.quickSlot };
    return current;
  });
}

/** Validates and applies every editable field before producing a new catalog. */
export function updateActionConfiguration(
  catalog: readonly Action[],
  actionId: ActionType,
  input: UpdateActionConfigurationInput
): Action[] {
  const title = input.title.trim();

  if (!title) throw new Error("An action name is required.");
  validatePoints(input.points);
  if (input.quickSlot !== null) validateQuickSlot(input.quickSlot);
  validateActionSubjectContext(input);

  const action = findAction(catalog, actionId);
  const nextAction: Action = {
    ...action,
    title,
    points: input.points,
    ...(input.iconId === undefined ? {} : { iconId: input.iconId }),
    archived: input.archived,
    quickSlot: input.archived ? null : input.quickSlot,
    subjectId: input.subjectId,
    availableInAllSubjects: input.availableInAllSubjects,
    trackOrdinaryCompliance: normalizeOrdinaryComplianceTracking(
      input.points,
      input.trackOrdinaryCompliance
    ),
  };
  validateOrdinaryComplianceTracking(
    nextAction.points,
    nextAction.trackOrdinaryCompliance
  );
  const updatedCatalog = catalog.map((current) => current.id === actionId ? nextAction : current);

  return nextAction.archived
    ? updatedCatalog
    : moveActionQuickSlot(updatedCatalog, actionId, nextAction.quickSlot);
}

export function removeQuickActionSlot(
  catalog: readonly Action[],
  actionId: ActionType
): Action[] {
  return updateAction(catalog, actionId, (action) => ({ ...action, quickSlot: null }));
}

export function archiveAction(catalog: readonly Action[], actionId: ActionType): Action[] {
  return updateAction(catalog, actionId, (action) => ({
    ...action,
    archived: true,
    quickSlot: null,
  }));
}

export function restoreAction(catalog: readonly Action[], actionId: ActionType): Action[] {
  return updateAction(catalog, actionId, (action) => ({
    ...action,
    archived: false,
    quickSlot: null,
  }));
}

export function normalizeActionCatalog(catalog: readonly Action[]): Action[] {
  const occupiedSlotsBySubject = new Map<SubjectId, Set<QuickActionSlot>>();

  return catalog.map((action) => {
    const archived = Boolean(action.archived);
    const context = normalizeActionContext(action);
    const occupiedSlots = occupiedSlotsBySubject.get(context.subjectId) ?? new Set<QuickActionSlot>();
    const quickSlot = archived || action.quickSlot === null || !isQuickActionSlot(action.quickSlot)
      ? null
      : occupiedSlots.has(action.quickSlot)
        ? null
        : action.quickSlot;

    if (quickSlot !== null) {
      occupiedSlots.add(quickSlot);
      occupiedSlotsBySubject.set(context.subjectId, occupiedSlots);
    }

    return {
      ...action,
      archived,
      quickSlot,
      ...context,
      attitudinalCriterionLinks: normalizeAttitudinalCriterionLinks(
        action.attitudinalCriterionLinks
      ),
      trackOrdinaryCompliance: normalizeOrdinaryComplianceTracking(
        action.points,
        action.trackOrdinaryCompliance
      ),
    };
  });
}

export function isQuickActionSlot(value: unknown): value is QuickActionSlot {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

function createValidatedAction(input: CreateActionInput): Action {
  const id = input.id.trim();
  const title = input.title.trim();

  if (!id || !title) {
    throw new Error("An action requires an identifier and a name.");
  }

  validatePoints(input.points);

  if (input.quickSlot !== undefined && input.quickSlot !== null) {
    validateQuickSlot(input.quickSlot);
  }

  const context = normalizeActionContext(input);
  validateActionSubjectContext(context);
  const trackOrdinaryCompliance = input.trackOrdinaryCompliance === true;
  validateOrdinaryComplianceTracking(input.points, trackOrdinaryCompliance);

  return {
    id,
    title,
    points: input.points,
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.iconId === undefined ? {} : { iconId: input.iconId }),
    archived: false,
    quickSlot: input.quickSlot ?? null,
    ...context,
    attitudinalCriterionLinks: normalizeAttitudinalCriterionLinks(
      input.attitudinalCriterionLinks
    ),
    trackOrdinaryCompliance,
  };
}

function updateAction(
  catalog: readonly Action[],
  actionId: ActionType,
  update: (action: Action) => Action
): Action[] {
  findAction(catalog, actionId);
  return catalog.map((action) => (action.id === actionId ? update(action) : action));
}

function findAction(catalog: readonly Action[], actionId: ActionType): Action {
  const action = catalog.find((current) => current.id === actionId);

  if (!action) {
    throw new Error("Action not found.");
  }

  return action;
}

function validatePoints(points: number) {
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 99) {
    throw new Error("An action value must be a non-zero integer between -99 and 99.");
  }
}

function validateQuickSlot(quickSlot: QuickActionSlot) {
  if (!isQuickActionSlot(quickSlot)) {
    throw new Error("Quick slot must be between 1 and 6.");
  }
}
