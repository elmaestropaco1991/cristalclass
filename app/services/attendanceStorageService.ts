import { createAttendanceDay } from "./attendanceService";
import {
  ATTENDANCE_SCHEMA_VERSION,
  type AttendanceCurrentStatus,
  type AttendanceDailyResult,
  type AttendanceDay,
  type AttendanceEntry,
  type AttendanceTransition,
  type AttendanceTransitionKind,
} from "../types/attendance";

const STORAGE_PREFIX = "cristalclass_attendance_v1";
type AttendanceStorage = Pick<Storage, "getItem" | "setItem">;

export function getAttendanceStorageKey(classroomId: string, localDate: string): string {
  return `${STORAGE_PREFIX}_${encodeURIComponent(classroomId)}_${localDate}`;
}

export function loadAttendanceDay(
  classroomId: string,
  localDate: string,
  timeZone: string,
  storage: AttendanceStorage | null = getBrowserStorage()
): AttendanceDay {
  const fallback = createAttendanceDay(classroomId, localDate, timeZone);
  if (!storage) return fallback;

  const stored = storage.getItem(getAttendanceStorageKey(classroomId, localDate));
  if (!stored) return fallback;

  try {
    return normalizeAttendanceDay(JSON.parse(stored), classroomId, localDate, timeZone);
  } catch {
    return fallback;
  }
}

export function saveAttendanceDay(
  day: AttendanceDay,
  storage: AttendanceStorage | null = getBrowserStorage()
): void {
  if (!storage) return;

  const normalized = normalizeAttendanceDay(
    day,
    day.classroomId,
    day.localDate,
    day.timeZone
  );

  storage.setItem(
    getAttendanceStorageKey(normalized.classroomId, normalized.localDate),
    JSON.stringify(normalized)
  );
}

export function normalizeAttendanceDay(
  value: unknown,
  classroomId: string,
  localDate: string,
  timeZone: string
): AttendanceDay {
  const source = isRecord(value) ? value : {};
  const entries = Array.isArray(source.entries) ? source.entries : [];
  const studentIds = new Set<string>();

  return {
    schemaVersion: ATTENDANCE_SCHEMA_VERSION,
    classroomId,
    localDate,
    timeZone: typeof source.timeZone === "string" && source.timeZone.trim()
      ? source.timeZone
      : timeZone,
    entries: entries.flatMap((entry) => {
      const normalized = normalizeAttendanceEntry(entry, classroomId, localDate);

      if (!normalized || studentIds.has(normalized.studentId)) return [];

      studentIds.add(normalized.studentId);
      return [normalized];
    }),
  };
}

function normalizeAttendanceEntry(
  value: unknown,
  classroomId: string,
  localDate: string
): AttendanceEntry | null {
  if (!isRecord(value) || typeof value.studentId !== "string" || !value.studentId.trim()) {
    return null;
  }

  const studentId = value.studentId.trim();
  const arrivalAt = normalizeInstant(value.arrivalAt);
  const isAbsent = value.currentStatus === "absent";
  const isLate = !isAbsent && value.dailyResult === "late" && arrivalAt !== null;
  const currentStatus: AttendanceCurrentStatus = isAbsent ? "absent" : "present";
  const dailyResult: AttendanceDailyResult = isAbsent
    ? "absent"
    : isLate
      ? "late"
      : "present";

  return {
    schemaVersion: ATTENDANCE_SCHEMA_VERSION,
    classroomId,
    studentId,
    localDate,
    currentStatus,
    dailyResult,
    markedAbsentAt: isAbsent || isLate ? normalizeInstant(value.markedAbsentAt) : null,
    arrivalAt: isLate ? arrivalAt : null,
    transitions: Array.isArray(value.transitions)
      ? value.transitions.flatMap((transition) => {
          const normalized = normalizeTransition(transition);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeTransition(value: unknown): AttendanceTransition | null {
  if (!isRecord(value) || !isTransitionKind(value.kind)) return null;

  const recordedAt = normalizeInstant(value.recordedAt);
  const effectiveAt = normalizeInstant(value.effectiveAt);
  const previousCurrentStatus = normalizeCurrentStatus(value.previousCurrentStatus);
  const previousDailyResult = normalizeDailyResult(value.previousDailyResult);
  const nextCurrentStatus = normalizeCurrentStatus(value.nextCurrentStatus);
  const nextDailyResult = normalizeDailyResult(value.nextDailyResult);

  if (
    !recordedAt
    || !effectiveAt
    || !previousCurrentStatus
    || !previousDailyResult
    || !nextCurrentStatus
    || !nextDailyResult
  ) {
    return null;
  }

  const previousArrivalAt = normalizeInstant(value.previousArrivalAt);

  return {
    kind: value.kind,
    recordedAt,
    effectiveAt,
    previousCurrentStatus,
    previousDailyResult,
    nextCurrentStatus,
    nextDailyResult,
    ...(previousArrivalAt ? { previousArrivalAt } : {}),
  };
}

function normalizeInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeCurrentStatus(value: unknown): AttendanceCurrentStatus | null {
  return value === "present" || value === "absent" ? value : null;
}

function normalizeDailyResult(value: unknown): AttendanceDailyResult | null {
  return value === "present" || value === "absent" || value === "late" ? value : null;
}

function isTransitionKind(value: unknown): value is AttendanceTransitionKind {
  return value === "marked-absent"
    || value === "arrived"
    || value === "corrected-present"
    || value === "arrival-time-corrected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBrowserStorage(): AttendanceStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
