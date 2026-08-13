import { actions } from "../data/actions";
import type { Action, ActionType } from "../types/action";
import type { Movement } from "../types/movement";
import { orderAdditionalActions } from "./additionalActionOrderService";
import { getAdditionalActions, getArchivedActions, getQuickActions } from "./actionCatalogService";
import { loadActionCatalog } from "./actionCatalogStorageService";

export function getActionCatalog(): Action[] {
  return loadActionCatalog() ?? actions;
}

export function getAction(actionId: ActionType): Action | undefined {
  return getActionCatalog().find((action) => action.id === actionId && !action.archived);
}

export function getQuickActionCatalog(): Action[] {
  return getQuickActions(getActionCatalog());
}

export function getAdditionalActionCatalog(movements: readonly Movement[] = []): Action[] {
  return orderAdditionalActions(getAdditionalActions(getActionCatalog()), movements);
}

export function getArchivedActionCatalog(): Action[] {
  return getArchivedActions(getActionCatalog());
}
