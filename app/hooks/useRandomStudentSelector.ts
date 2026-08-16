import { useEffect, useMemo, useState } from "react";
import type { RandomStudentSelectionMode } from "../types/randomStudentSelector";
import {
  closeContinuousRound,
  createRandomStudentRoundState,
  getAvailableStudentIds,
  normalizeRandomStudentRoundState,
  recordRoundSelection,
  resetContinuousRound,
  setRandomStudentSelectionMode,
  stopContinuousRound,
} from "../services/randomStudentSelectorService";
import {
  loadRandomStudentRoundState,
  saveRandomStudentRoundState,
} from "../services/randomStudentSelectorStorageService";

export function useRandomStudentSelector(
  classroomId: string,
  validStudentIds: readonly string[],
  presentStudentIds: readonly string[]
) {
  const selectorKey = classroomId;
  const validStudentKey = validStudentIds.join("\u0000");
  const stableValidStudentIds = useMemo(
    () => validStudentKey.split("\u0000").filter(Boolean),
    [validStudentKey]
  );
  const [stored, setStored] = useState(() => ({
    key: selectorKey,
    state: createRandomStudentRoundState(classroomId),
    hydrated: false,
    restoredContinuousRound: false,
  }));
  const state = stored.key === selectorKey
    ? stored.state
    : createRandomStudentRoundState(classroomId);
  const isHydrated = stored.key === selectorKey && stored.hydrated;
  const isContinuousRunning = state.isContinuousRunning
    && !stored.restoredContinuousRound;

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      const loaded = loadRandomStudentRoundState(classroomId, stableValidStudentIds);
      setStored({
        key: selectorKey,
        state: loaded,
        hydrated: true,
        restoredContinuousRound: loaded.isContinuousRunning,
      });
    });

    return () => cancelAnimationFrame(hydrationFrame);
  }, [classroomId, selectorKey, stableValidStudentIds]);

  useEffect(() => {
    const normalizationFrame = requestAnimationFrame(() => {
      setStored((current) => {
        if (current.key !== selectorKey || !current.hydrated) return current;
        const normalized = normalizeRandomStudentRoundState(
          current.state,
          classroomId,
          stableValidStudentIds
        );
        if (JSON.stringify(normalized) === JSON.stringify(current.state)) return current;
        saveRandomStudentRoundState(normalized);
        return { ...current, state: normalized };
      });
    });

    return () => cancelAnimationFrame(normalizationFrame);
  }, [classroomId, selectorKey, stableValidStudentIds]);

  const availableStudentIds = useMemo(
    () => getAvailableStudentIds(state, presentStudentIds),
    [presentStudentIds, state]
  );

  const updateAndPersist = (
    update: (current: typeof state) => typeof state
  ) => {
    setStored((current) => {
      if (current.key !== selectorKey || !current.hydrated) return current;
      const next = update(current.state);
      if (next === current.state) return current;
      saveRandomStudentRoundState(next);
      return { ...current, state: next, restoredContinuousRound: false };
    });
  };

  return {
    state,
    isHydrated,
    isContinuousRunning,
    availableStudentIds,
    selectMode(mode: RandomStudentSelectionMode) {
      updateAndPersist((current) => setRandomStudentSelectionMode(current, mode));
    },
    recordSelection(studentId: string) {
      updateAndPersist((current) => recordRoundSelection(current, studentId));
    },
    stopContinuousRound() {
      updateAndPersist(stopContinuousRound);
    },
    closeContinuousRound() {
      updateAndPersist(closeContinuousRound);
    },
    resetContinuousRound() {
      updateAndPersist(resetContinuousRound);
    },
  };
}
