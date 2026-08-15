import {
  ATTENDANCE_SCHEMA_VERSION,
  type AttendanceDay,
  type AttendanceEntry,
  type AttendanceSummary,
  type AttendanceTransition,
  type ResolvedStudentAttendance,
} from "../types/attendance";

const DEFAULT_ATTENDANCE: ResolvedStudentAttendance = Object.freeze({
  currentStatus: "present",
  dailyResult: "present",
  markedAbsentAt: null,
  arrivalAt: null,
  isExplicit: false,
});

export function createAttendanceDay(
  classroomId: string,
  localDate: string,
  timeZone: string
): AttendanceDay {
  return {
    schemaVersion: ATTENDANCE_SCHEMA_VERSION,
    classroomId,
    localDate,
    timeZone,
    entries: [],
  };
}

export function getStudentAttendance(
  day: AttendanceDay,
  studentId: string
): ResolvedStudentAttendance {
  const entry = day.entries.find((candidate) => candidate.studentId === studentId);

  return entry
    ? {
        currentStatus: entry.currentStatus,
        dailyResult: entry.dailyResult,
        markedAbsentAt: entry.markedAbsentAt,
        arrivalAt: entry.arrivalAt,
        isExplicit: true,
      }
    : DEFAULT_ATTENDANCE;
}

export function markStudentsAbsent(
  day: AttendanceDay,
  studentIds: readonly string[],
  occurredAt: string
): AttendanceDay {
  const selectedIds = new Set(studentIds.filter(Boolean));
  if (selectedIds.size === 0) return day;

  let changed = false;
  const existingIds = new Set(day.entries.map((entry) => entry.studentId));
  const entries = day.entries.map((entry) => {
    if (!selectedIds.has(entry.studentId) || entry.currentStatus === "absent") return entry;

    changed = true;
    return markEntryAbsent(entry, occurredAt);
  });

  for (const studentId of selectedIds) {
    if (existingIds.has(studentId)) continue;
    changed = true;
    entries.push(markEntryAbsent(createPresentEntry(day, studentId), occurredAt));
  }

  return changed ? { ...day, entries } : day;
}

export function markStudentArrived(
  day: AttendanceDay,
  studentId: string,
  arrivalAt: string,
  recordedAt = arrivalAt
): AttendanceDay {
  const entry = day.entries.find((candidate) => candidate.studentId === studentId);

  if (!entry || entry.currentStatus !== "absent") return day;

  return replaceEntry(day, studentId, {
    ...entry,
    currentStatus: "present",
    dailyResult: "late",
    arrivalAt,
    transitions: [
      ...entry.transitions,
      transition("arrived", recordedAt, arrivalAt, entry, "present", "late"),
    ],
  });
}

export function correctStudentsToPresent(
  day: AttendanceDay,
  studentIds: readonly string[],
  correctedAt: string
): AttendanceDay {
  const selectedIds = new Set(studentIds.filter(Boolean));
  if (selectedIds.size === 0) return day;

  let changed = false;
  const entries = day.entries.map((entry) => {
    if (
      !selectedIds.has(entry.studentId)
      || (entry.currentStatus === "present" && entry.dailyResult === "present")
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      currentStatus: "present" as const,
      dailyResult: "present" as const,
      markedAbsentAt: null,
      arrivalAt: null,
      transitions: [
        ...entry.transitions,
        transition(
          "corrected-present",
          correctedAt,
          correctedAt,
          entry,
          "present",
          "present"
        ),
      ],
    };
  });

  return changed ? { ...day, entries } : day;
}

export function correctArrivalTime(
  day: AttendanceDay,
  studentId: string,
  arrivalAt: string,
  correctedAt: string
): AttendanceDay {
  const entry = day.entries.find((candidate) => candidate.studentId === studentId);

  if (!entry || entry.dailyResult !== "late" || entry.arrivalAt === arrivalAt) return day;

  return replaceEntry(day, studentId, {
    ...entry,
    arrivalAt,
    transitions: [
      ...entry.transitions,
      {
        ...transition(
          "arrival-time-corrected",
          correctedAt,
          arrivalAt,
          entry,
          "present",
          "late"
        ),
        ...(entry.arrivalAt ? { previousArrivalAt: entry.arrivalAt } : {}),
      },
    ],
  });
}

export function getAttendanceSummary(
  day: AttendanceDay,
  studentIds: readonly string[]
): AttendanceSummary {
  return studentIds.reduce<AttendanceSummary>((summary, studentId) => {
    const attendance = getStudentAttendance(day, studentId);

    if (attendance.dailyResult === "absent") {
      return { ...summary, absent: summary.absent + 1 };
    }

    if (attendance.dailyResult === "late") {
      return { ...summary, late: summary.late + 1 };
    }

    return { ...summary, present: summary.present + 1 };
  }, { present: 0, absent: 0, late: 0 });
}

function createPresentEntry(day: AttendanceDay, studentId: string): AttendanceEntry {
  return {
    schemaVersion: ATTENDANCE_SCHEMA_VERSION,
    classroomId: day.classroomId,
    studentId,
    localDate: day.localDate,
    currentStatus: "present",
    dailyResult: "present",
    markedAbsentAt: null,
    arrivalAt: null,
    transitions: [],
  };
}

function markEntryAbsent(entry: AttendanceEntry, occurredAt: string): AttendanceEntry {
  return {
    ...entry,
    currentStatus: "absent",
    dailyResult: "absent",
    markedAbsentAt: occurredAt,
    arrivalAt: null,
    transitions: [
      ...entry.transitions,
      transition("marked-absent", occurredAt, occurredAt, entry, "absent", "absent"),
    ],
  };
}

function transition(
  kind: AttendanceTransition["kind"],
  recordedAt: string,
  effectiveAt: string,
  previous: Pick<AttendanceEntry, "currentStatus" | "dailyResult">,
  nextCurrentStatus: AttendanceTransition["nextCurrentStatus"],
  nextDailyResult: AttendanceTransition["nextDailyResult"]
): AttendanceTransition {
  return {
    kind,
    recordedAt,
    effectiveAt,
    previousCurrentStatus: previous.currentStatus,
    previousDailyResult: previous.dailyResult,
    nextCurrentStatus,
    nextDailyResult,
  };
}

function replaceEntry(
  day: AttendanceDay,
  studentId: string,
  nextEntry: AttendanceEntry
): AttendanceDay {
  return {
    ...day,
    entries: day.entries.map((entry) => entry.studentId === studentId ? nextEntry : entry),
  };
}
