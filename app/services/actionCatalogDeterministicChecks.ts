import { actions } from "../data/actions";
import {
  archiveAction,
  assignQuickActionSlot,
  createAction,
  getAdditionalActions,
  getArchivedActions,
  getQuickActions,
  restoreAction,
} from "./actionCatalogService";
import { hydrateActionCatalog } from "./actionCatalogStorageService";

export type ActionCatalogCheck = {
  name: string;
  passed: boolean;
};

export function runActionCatalogDeterministicChecks(): readonly ActionCatalogCheck[] {
  const legacyActions = actions.map((action) => ({
    id: action.id,
    title: action.title,
    points: action.points,
    ...(action.icon ? { icon: action.icon } : {}),
    ...(action.iconId ? { iconId: action.iconId } : {}),
    ...(action.orbit ? { orbit: action.orbit } : {}),
  }));
  const migrated = hydrateActionCatalog(legacyActions);
  const firstQuickAction = getQuickActions(migrated)[0];
  const reassigned = assignQuickActionSlot(migrated, "help_classmate", 1);
  const archived = archiveAction(migrated, "weekly_challenge");
  const restored = restoreAction(archived, "weekly_challenge");
  const withAdditional = createAction(migrated, {
    id: "extra_participation",
    title: "Participación extra",
    points: 2,
    icon: "✨",
  });
  const invalidHydration = hydrateActionCatalog([
    { id: "", title: "Rota", points: 1 },
    { id: "valid_action", title: "Válida", points: 2 },
  ]);
  const historicalActionId = "weekly_challenge";

  return [
    check("legacy actions receive six stable quick slots", () =>
      getQuickActions(migrated).map((action) => action.quickSlot).join(",") === "1,2,3,4,5,6"),
    check("quick slots remain unique", () =>
      new Set(getQuickActions(reassigned).map((action) => action.quickSlot)).size === getQuickActions(reassigned).length),
    check("quick actions never exceed six", () => getQuickActions(reassigned).length <= 6),
    check("archiving clears the quick slot", () => archived.find((action) => action.id === "weekly_challenge")?.quickSlot === null),
    check("archived actions are excluded from operational queries", () =>
      !getQuickActions(archived).some((action) => action.id === "weekly_challenge")
      && !getAdditionalActions(archived).some((action) => action.id === "weekly_challenge")
      && getArchivedActions(archived).some((action) => action.id === "weekly_challenge")),
    check("active additional actions are queried separately", () =>
      getAdditionalActions(withAdditional).some((action) => action.id === "extra_participation")),
    check("restoring does not restore a quick slot", () =>
      restored.find((action) => action.id === "weekly_challenge")?.quickSlot === null),
    check("historical movement identifiers remain valid", () =>
      archived.some((action) => action.id === historicalActionId)),
    check("configured quick actions retain their point values", () => firstQuickAction?.points === 5),
    check("invalid hydration preserves valid catalog entries", () =>
      invalidHydration.some((action) => action.id === "valid_action")),
  ];
}

function check(name: string, predicate: () => boolean): ActionCatalogCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
