import { requireStableCurriculumClassroomId } from "./curriculumStorageService";

export type CurriculumExclusiveLockResult<T> =
  | { readonly status: "acquired"; readonly value: T }
  | { readonly status: "unavailable"; readonly message: string };

export interface CurriculumExclusiveLock {
  runExclusive<T>(
    classroomId: string,
    operation: () => T | Promise<T>
  ): Promise<CurriculumExclusiveLockResult<T>>;
}

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    callback: () => T | Promise<T>
  ): Promise<T>;
}

export function getCurriculumExclusiveLockName(classroomId: string): string {
  const normalized = requireStableCurriculumClassroomId(classroomId);
  return `cristalclass-curriculum-lock-v1:${encodeURIComponent(normalized)}`;
}

export function getBrowserCurriculumExclusiveLock(): CurriculumExclusiveLock | null {
  if (typeof navigator === "undefined") return null;
  const manager = (navigator as Navigator & { readonly locks?: BrowserLockManager }).locks;
  if (!manager) return null;

  return {
    async runExclusive<T>(classroomId: string, operation: () => T | Promise<T>) {
      const lockName = getCurriculumExclusiveLockName(classroomId);
      try {
        const value = await manager.request(lockName, { mode: "exclusive" }, operation);
        return { status: "acquired" as const, value };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error
            ? `The exclusive curriculum lock failed: ${error.message}`
            : "The exclusive curriculum lock failed.",
        };
      }
    },
  };
}
