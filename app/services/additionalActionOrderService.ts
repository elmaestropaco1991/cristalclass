import type { Action } from "../types/action";
import type { Movement } from "../types/movement";

type Usage = {
  count: number;
  mostRecentUse: number;
};

/**
 * Orders actions without adding derived counters to the persisted catalog.
 * Frequency takes priority, followed by the latest movement that used it.
 */
export function orderAdditionalActions(
  actions: readonly Action[],
  movements: readonly Movement[]
): Action[] {
  const usageByActionId = getUsageByActionId(movements);

  return [...actions].sort((left, right) => {
    const leftUsage = usageByActionId.get(left.id) ?? EMPTY_USAGE;
    const rightUsage = usageByActionId.get(right.id) ?? EMPTY_USAGE;

    if (leftUsage.count !== rightUsage.count) {
      return rightUsage.count - leftUsage.count;
    }

    if (leftUsage.mostRecentUse !== rightUsage.mostRecentUse) {
      return rightUsage.mostRecentUse - leftUsage.mostRecentUse;
    }

    const titleOrder = left.title.localeCompare(right.title, "es");
    return titleOrder !== 0 ? titleOrder : left.id.localeCompare(right.id);
  });
}

const EMPTY_USAGE: Usage = { count: 0, mostRecentUse: 0 };

function getUsageByActionId(movements: readonly Movement[]): Map<string, Usage> {
  const usageByActionId = new Map<string, Usage>();

  for (const movement of movements) {
    const previousUsage = usageByActionId.get(movement.actionId) ?? EMPTY_USAGE;
    const date = movement.date instanceof Date
      ? movement.date.getTime()
      : new Date(movement.date).getTime();

    usageByActionId.set(movement.actionId, {
      count: previousUsage.count + 1,
      mostRecentUse: Number.isFinite(date)
        ? Math.max(previousUsage.mostRecentUse, date)
        : previousUsage.mostRecentUse,
    });
  }

  return usageByActionId;
}
