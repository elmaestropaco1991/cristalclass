import type { AttendanceDay } from "../types/attendance";
import { getStudentAttendance } from "./attendanceService";

export type StudentActionAttendanceResult<T> =
  | { readonly status: "blocked-absent" }
  | { readonly status: "executed"; readonly value: T };

export function canApplyStudentActionToday(
  day: AttendanceDay,
  studentId: string
): boolean {
  return getStudentAttendance(day, studentId).currentStatus === "present";
}

export async function executeStudentActionIfPresent<T>(
  day: AttendanceDay,
  studentId: string,
  execute: () => T | Promise<T>
): Promise<StudentActionAttendanceResult<T>> {
  if (!canApplyStudentActionToday(day, studentId)) {
    return { status: "blocked-absent" };
  }

  return { status: "executed", value: await execute() };
}
