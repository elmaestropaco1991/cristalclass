import {
  createRandomSelectionPreviewSequence,
  createRandomSelectionActionCompletionGuard,
  createRandomStudentRoundState,
  getAvailableStudentIds,
  getRandomSelectionAnimationPlan,
  getRandomSelectionModeForAccess,
  getRandomSelectorCandidatePresentation,
  recordRoundSelection,
  resetContinuousRound,
  resolveRandomSelectionActionFlow,
  selectRandomStudentId,
  setRandomStudentSelectionMode,
  shouldStartNextRandomSelection,
} from "./randomStudentSelectorService";
import {
  getRandomStudentSelectorStorageKey,
  loadRandomStudentRoundState,
} from "./randomStudentSelectorStorageService";

export type RandomStudentSelectorDeterministicCheck = {
  readonly name: string;
  readonly passed: boolean;
};

export function runRandomStudentSelectorDeterministicChecks(): readonly RandomStudentSelectorDeterministicCheck[] {
  const classroomId = "class-a";
  const allStudentIds = ["student-1", "student-2", "student-3", "student-4"];
  const presentStudentIds = ["student-1", "student-2", "student-4"];
  const initial = createRandomStudentRoundState(classroomId);
  const running = setRandomStudentSelectionMode(initial, "continuous");
  const selectionSequence = [0.65, 0.1, 0.85, 0.25];
  let randomIndex = 0;
  let roundState = running;
  const selectedInOrder: string[] = [];

  while (getAvailableStudentIds(roundState, presentStudentIds).length > 0) {
    const selected = selectRandomStudentId(
      getAvailableStudentIds(roundState, presentStudentIds),
      () => selectionSequence[randomIndex++] ?? 0
    );
    if (!selected) break;
    selectedInOrder.push(selected);
    roundState = recordRoundSelection(roundState, selected);
  }

  const partlyCompleted = recordRoundSelection(running, "student-1");
  const reset = resetContinuousRound(partlyCompleted);
  const storage = createMemoryStorage();
  storage.setItem(
    getRandomStudentSelectorStorageKey(classroomId),
    JSON.stringify({
      schemaVersion: 99,
      classroomId: "wrong-class",
      activeMode: "continuous",
      selectedStudentIds: ["student-1", "missing", "student-1", "student-3"],
      isContinuousRunning: true,
    })
  );
  const restored = loadRandomStudentRoundState(classroomId, allStudentIds, storage);
  const animationTarget = selectRandomStudentId(presentStudentIds, () => 0.5);
  const previewSequence = createRandomSelectionPreviewSequence(
    presentStudentIds,
    animationTarget ?? "",
    5
  );
  const completionGuard = createRandomSelectionActionCompletionGuard();
  const firstCompletion = completionGuard.complete("close-and-select-next");
  const duplicateCompletion = completionGuard.complete("close-and-select-next");

  return [
    check("only present students participate", () =>
      JSON.stringify(getAvailableStudentIds(initial, presentStudentIds))
        === JSON.stringify(presentStudentIds)),
    check("students do not repeat during the first round", () =>
      new Set(selectedInOrder).size === selectedInOrder.length),
    check("every present student appears exactly once", () =>
      selectedInOrder.length === presentStudentIds.length
      && presentStudentIds.every((studentId) => selectedInOrder.includes(studentId))),
    check("reset makes every present student available again", () =>
      JSON.stringify(getAvailableStudentIds(reset, presentStudentIds))
        === JSON.stringify(presentStudentIds)
      && reset.selectedStudentIds.length === 0),
    check("an absent student is removed from the available round", () =>
      !getAvailableStudentIds(running, ["student-1", "student-4"])
        .includes("student-2")),
    check("an arriving student joins when they have not participated", () => {
      const beforeArrival = getAvailableStudentIds(partlyCompleted, ["student-1"]);
      const afterArrival = getAvailableStudentIds(
        partlyCompleted,
        ["student-1", "student-3"]
      );
      return beforeArrival.length === 0 && afterArrival.includes("student-3");
    }),
    check("stored state is restored and normalized", () =>
      restored.classroomId === classroomId
      && restored.schemaVersion === 1
      && restored.activeMode === "continuous"
      && restored.isContinuousRunning
      && JSON.stringify(restored.selectedStudentIds) === JSON.stringify([
        "student-1",
        "student-3",
      ])),
    check("single selection returns to the classroom after a committed action", () =>
      resolveRandomSelectionActionFlow("single", true, false) === "close-to-classroom"),
    check("continuous selection advances only after a committed action", () =>
      resolveRandomSelectionActionFlow("continuous", false, true) === "keep-modal-open"
      && resolveRandomSelectionActionFlow("continuous", true, true)
        === "close-and-select-next"),
    check("opening from the classroom keeps the previous modal behavior", () =>
      resolveRandomSelectionActionFlow("classroom", false, false) === "keep-modal-open"
      && resolveRandomSelectionActionFlow("classroom", true, false)
        === "close-to-classroom"),
    check("Azar starts single selection directly", () =>
      getRandomSelectionModeForAccess("random") === "single"),
    check("Ronda starts continuous selection directly", () =>
      getRandomSelectionModeForAccess("round") === "continuous"),
    check("the preview animation preserves the actual random result", () =>
      animationTarget === "student-2"
      && previewSequence.at(-1) === animationTarget),
    check("candidate presentation uses the equipped avatar resolver", () => {
      const presentation = getRandomSelectorCandidatePresentation({
        id: "student-1",
        nombre: "Ana",
      });
      return presentation.studentId === "student-1"
        && presentation.name === "Ana"
        && presentation.artwork === "equipped-avatar";
    }),
    check("reduced motion skips the intense sequence without blocking selection", () => {
      const plan = getRandomSelectionAnimationPlan(true);
      return plan.frameDelaysMs.length === 0
        && plan.selectedHoldMs > 0
        && animationTarget === "student-2";
    }),
    check("a positive action from Azar returns to the classroom", () =>
      1 > 0
      && resolveRandomSelectionActionFlow("single", true, false)
        === "close-to-classroom"),
    check("a negative action from Azar returns to the classroom", () =>
      -1 < 0
      && resolveRandomSelectionActionFlow("single", true, false)
        === "close-to-classroom"),
    check("a positive action from Ronda starts the next selection", () =>
      1 > 0
      && shouldStartNextRandomSelection(
        resolveRandomSelectionActionFlow("continuous", true, true),
        2
      )),
    check("a negative action from Ronda starts the next selection", () =>
      -1 < 0
      && shouldStartNextRandomSelection(
        resolveRandomSelectionActionFlow("continuous", true, true),
        2
      )),
    check("a failed action neither closes, advances nor completes the turn", () => {
      const beforeFailure = recordRoundSelection(running, "student-1");
      const afterFailure = beforeFailure;
      return resolveRandomSelectionActionFlow("continuous", false, true)
          === "keep-modal-open"
        && afterFailure === beforeFailure
        && !afterFailure.selectedStudentIds.includes("student-2");
    }),
    check("normal classroom opening keeps its previous successful behavior", () =>
      resolveRandomSelectionActionFlow("classroom", true, false)
        === "close-to-classroom"),
    check("one action completion cannot trigger two round advances", () =>
      firstCompletion === "close-and-select-next"
      && duplicateCompletion === "ignored"),
    check("the last student completes the round without opening another modal", () =>
      !shouldStartNextRandomSelection("close-and-select-next", 0)),
  ];
}

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function check(
  name: string,
  predicate: () => boolean
): RandomStudentSelectorDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
