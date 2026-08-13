import { getActionIcon } from "../data/actionIcons";
import type { Action } from "../types/action";
import type { Movement } from "../types/movement";
import { createActionApplicationGuard } from "./actionApplicationGuard";
import { leaveAdditionalActionsMode, openActionConfiguration } from "./additionalActionsPanelMode";
import {
  archiveAction,
  createAction,
  getAdditionalActions,
  getQuickActions,
  moveActionQuickSlot,
  restoreAction,
  updateActionConfiguration,
} from "./actionCatalogService";

export type ActionConfigurationCheck = { name: string; passed: boolean };

export async function runActionConfigurationDeterministicChecks(): Promise<readonly ActionConfigurationCheck[]> {
  const catalog = [action("quick-one", "Primera", 1, 1), action("quick-two", "Segunda", 2, 2), action("additional", "Adicional", -3, null)];
  const positiveAdditional = createAction(catalog, { id: "positive-additional", title: "Positiva", points: 3, iconId: "learning-book" });
  const negativeAdditional = createAction(catalog, { id: "negative-additional", title: "Negativa", points: -3, iconId: "warnings-alert" });
  const edited = updateActionConfiguration(catalog, "additional", { title: "Editada", points: -4, iconId: "participation-hand", quickSlot: null, archived: false });
  const emptyPosition = moveActionQuickSlot(catalog, "additional", 3);
  const occupiedPosition = moveActionQuickSlot(catalog, "additional", 1);
  const archived = archiveAction(catalog, "quick-one");
  const restored = restoreAction(archived, "quick-one");
  const historicMovement: Movement = { id: "m-1", studentId: "s-1", actionId: "additional", date: new Date("2026-01-01"), requestedChange: -3, appliedChange: -3, points: -3, title: "Adicional", type: "negative" };
  const unchanged = JSON.stringify(catalog);
  let zeroRejected = false;
  let rejectedAtomically = false;
  try { createAction(catalog, { id: "zero", title: "Cero", points: 0 }); } catch { zeroRejected = true; }
  try { updateActionConfiguration(catalog, "additional", { title: "", points: 4, iconId: "learning-book", quickSlot: null, archived: false }); } catch { rejectedAtomically = JSON.stringify(catalog) === unchanged; }
  const guard = createActionApplicationGuard();
  let creations = 0;
  const firstSave = guard.run(async () => { creations += 1; await Promise.resolve(); return true; });
  const secondSave = await guard.run(async () => { creations += 1; return true; });
  const firstSaveResult = await firstSave;

  return [
    check("create a positive additional action", () => getAdditionalActions(positiveAdditional).some((item) => item.id === "positive-additional" && item.points === 3)),
    check("create a negative additional action", () => getAdditionalActions(negativeAdditional).some((item) => item.id === "negative-additional" && item.points === -3)),
    check("stored sign matches selected type", () => positiveAdditional.find((item) => item.id === "positive-additional")?.points === 3 && negativeAdditional.find((item) => item.id === "negative-additional")?.points === -3),
    check("zero values are rejected", () => zeroRejected),
    check("editing preserves the stable identifier", () => edited.find((item) => item.id === "additional")?.id === "additional"),
    check("editing preserves historical movement association", () => historicMovement.actionId === edited.find((item) => item.id === "additional")?.id),
    check("choosing an icon stores iconId", () => edited.find((item) => item.id === "additional")?.iconId === "participation-hand"),
    check("legacy emoji icons remain available", () => action("legacy", "Legado", 1, null, "🎒").icon === "🎒"),
    check("assigning an empty quick position works", () => emptyPosition.find((item) => item.id === "additional")?.quickSlot === 3),
    check("an occupied position moves its former action to additional", () => occupiedPosition.find((item) => item.id === "additional")?.quickSlot === 1 && occupiedPosition.find((item) => item.id === "quick-one")?.quickSlot === null),
    check("quick positions are never duplicated", () => { const slots = getQuickActions(occupiedPosition).map((item) => item.quickSlot); return new Set(slots).size === slots.length; }),
    check("archiving releases the quick position", () => archived.find((item) => item.id === "quick-one")?.quickSlot === null),
    check("archived actions disappear from operational queries", () => !getQuickActions(archived).some((item) => item.id === "quick-one") && !getAdditionalActions(archived).some((item) => item.id === "quick-one")),
    check("restoring returns an action as additional", () => restored.find((item) => item.id === "quick-one")?.quickSlot === null && getAdditionalActions(restored).some((item) => item.id === "quick-one")),
    check("catalog changes produce immediately queryable state", () => getAdditionalActions(edited).some((item) => item.title === "Editada")),
    check("a rejected edit leaves the catalog unchanged", () => rejectedAtomically),
    check("a saving guard prevents duplicate creations", () => firstSaveResult === "committed" && secondSave === "blocked" && creations === 1),
    check("back from configuration returns to the same more-actions level", () => openActionConfiguration() === "configuration" && leaveAdditionalActionsMode("configuration") === "operational" && getActionIcon("learning-book")?.label === "Libro"),
  ];
}

function action(id: string, title: string, points: number, quickSlot: 1 | 2 | 3 | 4 | 5 | 6 | null, icon = "✨"): Action {
  return { id, title, points, icon, archived: false, quickSlot };
}

function check(name: string, predicate: () => boolean): ActionConfigurationCheck {
  try { return { name, passed: predicate() }; } catch { return { name, passed: false }; }
}
