export const DEFAULT_GUARDIAN_SCALE = 100;
export const MINIMUM_GUARDIAN_SCALE = 50;
export const MAXIMUM_GUARDIAN_SCALE = 140;
export const GUARDIAN_SCALE_STEP = 10;

export function getClassroomGuardianScaleStorageKey(classroomId: string): string {
  return `cristalclass_classroom_appearance_${encodeURIComponent(classroomId)}`;
}

export function normalizeGuardianScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GUARDIAN_SCALE;

  const clamped = Math.min(MAXIMUM_GUARDIAN_SCALE, Math.max(MINIMUM_GUARDIAN_SCALE, value));
  return Math.round(clamped / GUARDIAN_SCALE_STEP) * GUARDIAN_SCALE_STEP;
}

export function loadClassroomGuardianScale(classroomId: string): number {
  if (typeof window === "undefined") return DEFAULT_GUARDIAN_SCALE;

  const storedGuardianScale = localStorage.getItem(
    getClassroomGuardianScaleStorageKey(classroomId)
  );

  return storedGuardianScale === null
    ? DEFAULT_GUARDIAN_SCALE
    : normalizeGuardianScale(Number(storedGuardianScale));
}

export function saveClassroomGuardianScale(classroomId: string, guardianScale: number): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    getClassroomGuardianScaleStorageKey(classroomId),
    String(normalizeGuardianScale(guardianScale))
  );
}
