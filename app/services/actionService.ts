import { actions } from "../data/actions";
import type { ActionType } from "../types/action";

export function getAction(actionId: ActionType) {
  return actions.find((action) => action.id === actionId);
}