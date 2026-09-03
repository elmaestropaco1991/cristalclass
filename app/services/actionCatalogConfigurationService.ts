import { actions } from "../data/actions";
import type { Action, ActionType, QuickActionSlot } from "../types/action";
import {
  archiveAction,
  assignQuickActionSlot,
  createAction,
  moveActionQuickSlot,
  removeQuickActionSlot,
  restoreAction,
  updateActionIcon,
  updateActionName,
  updateActionPoints,
  updateActionConfiguration,
  type CreateActionInput,
  type UpdateActionConfigurationInput,
} from "./actionCatalogService";
import { loadActionCatalog, saveActionCatalog } from "./actionCatalogStorageService";

export function createConfiguredAction(input: CreateActionInput): Action[] {
  return persist((catalog) => createAction(catalog, input));
}

export function renameConfiguredAction(actionId: ActionType, title: string): Action[] {
  return persist((catalog) => updateActionName(catalog, actionId, title));
}

export function changeConfiguredActionPoints(actionId: ActionType, points: number): Action[] {
  return persist((catalog) => updateActionPoints(catalog, actionId, points));
}

export function changeConfiguredActionIcon(
  actionId: ActionType,
  icon: string | undefined,
  iconId: string | undefined
): Action[] {
  return persist((catalog) => updateActionIcon(catalog, actionId, icon, iconId));
}

export function assignConfiguredQuickSlot(actionId: ActionType, quickSlot: QuickActionSlot): Action[] {
  return persist((catalog) => assignQuickActionSlot(catalog, actionId, quickSlot));
}

export function moveConfiguredQuickSlot(
  actionId: ActionType,
  quickSlot: QuickActionSlot | null
): Action[] {
  return persist((catalog) => moveActionQuickSlot(catalog, actionId, quickSlot));
}

export function removeConfiguredQuickSlot(actionId: ActionType): Action[] {
  return persist((catalog) => removeQuickActionSlot(catalog, actionId));
}

export function archiveConfiguredAction(actionId: ActionType): Action[] {
  return persist((catalog) => archiveAction(catalog, actionId));
}

export function restoreConfiguredAction(actionId: ActionType): Action[] {
  return persist((catalog) => restoreAction(catalog, actionId));
}

/** Persists an edit as a single validated catalog replacement. */
export function saveConfiguredAction(
  actionId: ActionType,
  input: UpdateActionConfigurationInput
): Action[] {
  return persist((catalog) => updateActionConfiguration(catalog, actionId, input));
}

function persist(update: (catalog: readonly Action[]) => Action[]): Action[] {
  const nextCatalog = update(loadActionCatalog() ?? actions);
  saveActionCatalog(nextCatalog);
  return nextCatalog;
}
