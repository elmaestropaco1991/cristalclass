export const ATTENDANCE_SCHEMA_VERSION = 1 as const;

export type AttendanceCurrentStatus = "present" | "absent";
export type AttendanceDailyResult = "present" | "absent" | "late";
export type AttendanceTransitionKind =
  | "marked-absent"
  | "arrived"
  | "corrected-present"
  | "arrival-time-corrected";

export interface AttendanceTransition {
  readonly kind: AttendanceTransitionKind;
  readonly recordedAt: string;
  readonly effectiveAt: string;
  readonly previousCurrentStatus: AttendanceCurrentStatus;
  readonly previousDailyResult: AttendanceDailyResult;
  readonly nextCurrentStatus: AttendanceCurrentStatus;
  readonly nextDailyResult: AttendanceDailyResult;
  readonly previousArrivalAt?: string;
}

export interface AttendanceEntry {
  readonly schemaVersion: typeof ATTENDANCE_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly studentId: string;
  readonly localDate: string;
  readonly currentStatus: AttendanceCurrentStatus;
  readonly dailyResult: AttendanceDailyResult;
  readonly markedAbsentAt: string | null;
  readonly arrivalAt: string | null;
  readonly transitions: readonly AttendanceTransition[];
}

export interface AttendanceDay {
  readonly schemaVersion: typeof ATTENDANCE_SCHEMA_VERSION;
  readonly classroomId: string;
  readonly localDate: string;
  readonly timeZone: string;
  readonly entries: readonly AttendanceEntry[];
}

export interface ResolvedStudentAttendance {
  readonly currentStatus: AttendanceCurrentStatus;
  readonly dailyResult: AttendanceDailyResult;
  readonly markedAbsentAt: string | null;
  readonly arrivalAt: string | null;
  readonly isExplicit: boolean;
}

export interface AttendanceSummary {
  readonly present: number;
  readonly absent: number;
  readonly late: number;
}
