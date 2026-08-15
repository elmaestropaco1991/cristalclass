import {
  correctArrivalTime,
  correctStudentsToPresent,
  createAttendanceDay,
  getStudentAttendance,
  markStudentArrived,
  markStudentsAbsent,
} from "./attendanceService";
import { getLocalDateKey } from "./attendanceDateService";
import {
  loadAttendanceDay,
  normalizeAttendanceDay,
  saveAttendanceDay,
} from "./attendanceStorageService";
import { runActionContextConfigurationDeterministicChecks } from "./actionContextConfigurationDeterministicChecks";
import { runSubjectActionCatalogDeterministicChecks } from "./subjectActionCatalogDeterministicChecks";

export type AttendanceDeterministicCheck = {
  readonly name: string;
  readonly passed: boolean;
};

export async function runAttendanceDeterministicChecks(): Promise<
  readonly AttendanceDeterministicCheck[]
> {
  const classA = "class-a";
  const classB = "class-b";
  const dateA = "2026-08-15";
  const dateB = "2026-08-16";
  const timeZone = "Europe/Madrid";
  const markedAbsentAt = "2026-08-15T07:00:00.000Z";
  const arrivalAt = "2026-08-15T08:10:00.000Z";
  const correctedArrivalAt = "2026-08-15T08:20:00.000Z";
  const correctedAt = "2026-08-15T08:25:00.000Z";

  const emptyDay = createAttendanceDay(classA, dateA, timeZone);
  const absentDay = markStudentsAbsent(emptyDay, ["student-1"], markedAbsentAt);
  const arrivedDay = markStudentArrived(absentDay, "student-1", arrivalAt);
  const correctedArrivalDay = correctArrivalTime(
    arrivedDay,
    "student-1",
    correctedArrivalAt,
    correctedAt
  );
  const correctedPresentDay = correctStudentsToPresent(
    correctedArrivalDay,
    ["student-1"],
    "2026-08-15T08:30:00.000Z"
  );
  const multiSelectionDay = markStudentsAbsent(
    emptyDay,
    ["student-1", "student-3", "student-3"],
    markedAbsentAt
  );
  const repeatedAbsentDay = markStudentsAbsent(
    multiSelectionDay,
    ["student-1", "student-3"],
    "2026-08-15T09:00:00.000Z"
  );
  const storage = createMemoryStorage();
  saveAttendanceDay(absentDay, storage);
  saveAttendanceDay(
    markStudentsAbsent(
      createAttendanceDay(classA, dateB, timeZone),
      ["student-2"],
      "2026-08-16T07:00:00.000Z"
    ),
    storage
  );
  saveAttendanceDay(
    markStudentsAbsent(
      createAttendanceDay(classB, dateA, timeZone),
      ["student-3"],
      markedAbsentAt
    ),
    storage
  );
  const normalizedIncomplete = normalizeAttendanceDay(
    {
      entries: [
        { studentId: "student-1", currentStatus: "absent" },
        { studentId: "student-1", currentStatus: "present" },
        { studentId: "student-2", dailyResult: "late", arrivalAt: "invalid" },
        null,
      ],
    },
    classA,
    dateA,
    timeZone
  );
  const economyState = {
    studentId: "student-1",
    cristales: 17,
    highestCrystalTotal: 31,
    chestProgress: 4,
    chests: [{ id: "chest-1", openedAt: null }],
    progression: { evolution: 3 },
  };
  const economySnapshot = JSON.stringify(economyState);
  markStudentArrived(
    markStudentsAbsent(emptyDay, [economyState.studentId], markedAbsentAt),
    economyState.studentId,
    arrivalAt
  );
  const phase1Checks = await runSubjectActionCatalogDeterministicChecks();
  const phase2Checks = runActionContextConfigurationDeterministicChecks();

  return [
    check("students without an explicit record resolve as present", () => {
      const resolved = getStudentAttendance(emptyDay, "student-without-record");
      return resolved.currentStatus === "present"
        && resolved.dailyResult === "present"
        && resolved.isExplicit === false;
    }),
    check("marking absent sets current and daily status to absent", () => {
      const resolved = getStudentAttendance(absentDay, "student-1");
      return resolved.currentStatus === "absent"
        && resolved.dailyResult === "absent"
        && resolved.markedAbsentAt === markedAbsentAt;
    }),
    check("arriving changes an absent student to present with a late result", () => {
      const resolved = getStudentAttendance(arrivedDay, "student-1");
      return resolved.currentStatus === "present" && resolved.dailyResult === "late";
    }),
    check("arrival keeps the unambiguous arrival instant", () =>
      getStudentAttendance(arrivedDay, "student-1").arrivalAt === arrivalAt),
    check("arrival time correction updates one record without duplication", () => {
      const repeatedCorrection = correctArrivalTime(
        correctedArrivalDay,
        "student-1",
        correctedArrivalAt,
        "2026-08-15T08:40:00.000Z"
      );
      return correctedArrivalDay.entries.length === 1
        && correctedArrivalDay.entries[0]?.arrivalAt === correctedArrivalAt
        && correctedArrivalDay.entries[0]?.transitions.length
          === arrivedDay.entries[0]!.transitions.length + 1
        && repeatedCorrection === correctedArrivalDay;
    }),
    check("correcting to present removes false absence and lateness", () => {
      const resolved = getStudentAttendance(correctedPresentDay, "student-1");
      return resolved.currentStatus === "present"
        && resolved.dailyResult === "present"
        && resolved.markedAbsentAt === null
        && resolved.arrivalAt === null;
    }),
    check("multi-selection changes only selected students", () =>
      getStudentAttendance(multiSelectionDay, "student-1").dailyResult === "absent"
      && getStudentAttendance(multiSelectionDay, "student-3").dailyResult === "absent"
      && getStudentAttendance(multiSelectionDay, "student-2").dailyResult === "present"
      && multiSelectionDay.entries.length === 2),
    check("repeating an attendance operation is idempotent", () =>
      repeatedAbsentDay === multiSelectionDay),
    check("different local dates remain isolated", () =>
      getStudentAttendance(
        loadAttendanceDay(classA, dateA, timeZone, storage),
        "student-1"
      ).dailyResult === "absent"
      && getStudentAttendance(
        loadAttendanceDay(classA, dateB, timeZone, storage),
        "student-1"
      ).dailyResult === "present"
      && getStudentAttendance(
        loadAttendanceDay(classA, dateB, timeZone, storage),
        "student-2"
      ).dailyResult === "absent"),
    check("different classrooms remain isolated", () =>
      getStudentAttendance(
        loadAttendanceDay(classA, dateA, timeZone, storage),
        "student-3"
      ).dailyResult === "present"
      && getStudentAttendance(
        loadAttendanceDay(classB, dateA, timeZone, storage),
        "student-3"
      ).dailyResult === "absent"),
    check("daily keys use the user's local calendar date", () =>
      getLocalDateKey(new Date("2026-01-01T23:30:00.000Z"), "Europe/Madrid")
        === "2026-01-02"),
    check("incomplete stored data normalizes safely and deterministically", () => {
      const normalizedAgain = normalizeAttendanceDay(
        normalizedIncomplete,
        classA,
        dateA,
        timeZone
      );
      return normalizedIncomplete.entries.length === 2
        && getStudentAttendance(normalizedIncomplete, "student-1").dailyResult === "absent"
        && getStudentAttendance(normalizedIncomplete, "student-2").dailyResult === "present"
        && JSON.stringify(normalizedAgain) === JSON.stringify(normalizedIncomplete);
    }),
    check("attendance never changes crystals, chests or progression", () =>
      JSON.stringify(economyState) === economySnapshot),
    check("phase 1 and phase 2 deterministic contracts still pass", () =>
      phase1Checks.length > 0
      && phase2Checks.length > 0
      && phase1Checks.every((result) => result.passed)
      && phase2Checks.every((result) => result.passed)),
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

function check(name: string, predicate: () => boolean): AttendanceDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
