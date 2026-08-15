import { useEffect, useState } from "react";
import {
  DEFAULT_GUARDIAN_SCALE,
  loadClassroomGuardianScale,
  normalizeGuardianScale,
  saveClassroomGuardianScale,
} from "../services/classroomAppearancePreferenceService";

export function useClassroomGuardianScale(classroomId: string) {
  const [guardianScale, setGuardianScaleState] = useState(DEFAULT_GUARDIAN_SCALE);

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      setGuardianScaleState(loadClassroomGuardianScale(classroomId));
    });

    return () => cancelAnimationFrame(hydrationFrame);
  }, [classroomId]);

  const setGuardianScale = (nextGuardianScale: number) => {
    const normalizedGuardianScale = normalizeGuardianScale(nextGuardianScale);
    setGuardianScaleState(normalizedGuardianScale);
    saveClassroomGuardianScale(classroomId, normalizedGuardianScale);
  };

  return {
    guardianScale,
    setGuardianScale,
    resetGuardianScale: () => setGuardianScale(DEFAULT_GUARDIAN_SCALE),
  };
}
