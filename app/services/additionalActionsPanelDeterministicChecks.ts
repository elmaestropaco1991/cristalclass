import { actions } from "../data/actions";
import type { Action } from "../types/action";
import { GENERAL_SUBJECT_ID } from "../types/subject";
import type { Movement } from "../types/movement";
import {
  createActionApplicationGuard,
  shouldCloseAfterActionApplication,
} from "./actionApplicationGuard";
import { orderAdditionalActions } from "./additionalActionOrderService";
import { archiveAction, getAdditionalActions } from "./actionCatalogService";

export type AdditionalActionsPanelCheck = {
  name: string;
  passed: boolean;
};

export async function runAdditionalActionsPanelDeterministicChecks(): Promise<
  readonly AdditionalActionsPanelCheck[]
> {
  const additionalActions = [
    additional("additional-positive", "Apoyo", 2),
    additional("additional-negative", "Interrumpe", -2),
    additional("never-used", "Nunca usada", 1),
  ];
  const archived = archiveAction(additionalActions, "additional-positive");
  const movements = [
    movement("additional-positive", "2026-01-02T10:00:00.000Z"),
    movement("additional-positive", "2026-01-03T10:00:00.000Z"),
    movement("additional-negative", "2026-01-04T10:00:00.000Z"),
  ];
  const equalFrequencyMovements = [
    movement("additional-positive", "2026-01-01T10:00:00.000Z"),
    movement("additional-negative", "2026-01-05T10:00:00.000Z"),
  ];
  const guard = createActionApplicationGuard();
  let movementApplications = 0;
  const firstApplication = guard.run(async () => {
    movementApplications += 1;
    await Promise.resolve();
    return true;
  });
  const secondApplication = await guard.run(async () => {
    movementApplications += 1;
    return true;
  });
  const firstOutcome = await firstApplication;
  const quickOnlyCatalog = actions.filter((action) => action.quickSlot !== null);

  return [
    check("only active actions without a quick slot are included", () =>
      getAdditionalActions(additionalActions).every((action) => !action.archived && action.quickSlot === null)),
    check("archived actions are excluded", () =>
      !getAdditionalActions(archived).some((action) => action.id === "additional-positive")),
    check("quick actions are excluded from the panel query", () =>
      !getAdditionalActions(actions).some((action) => action.quickSlot !== null)),
    check("positive and negative actions are separated by their sign", () =>
      getAdditionalActions(additionalActions).filter((action) => action.points > 0).length === 2
      && getAdditionalActions(additionalActions).filter((action) => action.points < 0).length === 1),
    check("frequency determines the order", () =>
      orderAdditionalActions(additionalActions, movements)[0]?.id === "additional-positive"),
    check("the most recent use resolves a frequency tie", () =>
      orderAdditionalActions(additionalActions, equalFrequencyMovements)[0]?.id === "additional-negative"),
    check("never-used actions remain available", () =>
      orderAdditionalActions(additionalActions, movements).some((action) => action.id === "never-used")),
    check("one accepted press applies one movement", () =>
      firstOutcome === "committed" && movementApplications === 1),
    check("only a committed result can close panel and student modal", () =>
      shouldCloseAfterActionApplication(firstOutcome)),
    check("a failed result keeps panel and student modal open", () =>
      !shouldCloseAfterActionApplication("failed")),
    check("the guard blocks a second simultaneous application", () =>
      secondApplication === "blocked" && movementApplications === 1),
    check("an empty additional query has no inventory fallback", () =>
      getAdditionalActions(quickOnlyCatalog).length === 0),
  ];
}

function additional(id: string, title: string, points: number): Action {
  return {
    id,
    title,
    points,
    archived: false,
    quickSlot: null,
    icon: "✨",
    subjectId: GENERAL_SUBJECT_ID,
    availableInAllSubjects: false,
    attitudinalCriterionLinks: [],
    trackOrdinaryCompliance: false,
  };
}

function movement(actionId: string, date: string): Movement {
  return {
    id: `${actionId}-${date}`,
    studentId: "student-1",
    actionId,
    date: new Date(date),
    requestedChange: 1,
    appliedChange: 1,
    points: 1,
    title: actionId,
    type: "positive",
  };
}

function check(name: string, predicate: () => boolean): AdditionalActionsPanelCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
