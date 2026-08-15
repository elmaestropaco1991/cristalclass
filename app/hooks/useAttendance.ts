import { useEffect, useState } from "react";
import type { AttendanceDay } from "../types/attendance";
import {
  correctArrivalTime,
  correctStudentsToPresent,
  createAttendanceDay,
  markStudentArrived,
  markStudentsAbsent,
} from "../services/attendanceService";
import {
  loadAttendanceDay,
  saveAttendanceDay,
} from "../services/attendanceStorageService";

export function useAttendance(classroomId: string, localDate: string, timeZone: string) {
  const attendanceKey = `${classroomId}:${localDate}`;
  const [state, setState] = useState<{
    day: AttendanceDay;
    key: string;
    hydrated: boolean;
  }>(() => ({
    day: createAttendanceDay(classroomId, localDate, timeZone),
    key: attendanceKey,
    hydrated: false,
  }));
  const isHydrated = state.key === attendanceKey && state.hydrated;
  const day = state.key === attendanceKey
    ? state.day
    : createAttendanceDay(classroomId, localDate, timeZone);

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      setState({
        day: loadAttendanceDay(classroomId, localDate, timeZone),
        key: attendanceKey,
        hydrated: true,
      });
    });

    return () => cancelAnimationFrame(hydrationFrame);
  }, [attendanceKey, classroomId, localDate, timeZone]);

  const updateAndPersist = (update: (current: AttendanceDay) => AttendanceDay) => {
    setState((current) => {
      if (current.key !== attendanceKey || !current.hydrated) return current;
      const next = update(current.day);

      if (next === current.day) return current;
      saveAttendanceDay(next);
      return { ...current, day: next };
    });
  };

  return {
    day,
    isHydrated,
    markAbsent(studentIds: readonly string[], occurredAt = new Date().toISOString()) {
      updateAndPersist((current) => markStudentsAbsent(current, studentIds, occurredAt));
    },
    markArrived(studentId: string, arrivalAt = new Date().toISOString()) {
      updateAndPersist((current) => markStudentArrived(current, studentId, arrivalAt));
    },
    correctToPresent(studentIds: readonly string[], correctedAt = new Date().toISOString()) {
      updateAndPersist((current) =>
        correctStudentsToPresent(current, studentIds, correctedAt)
      );
    },
    correctArrival(studentId: string, arrivalAt: string, correctedAt = new Date().toISOString()) {
      updateAndPersist((current) =>
        correctArrivalTime(current, studentId, arrivalAt, correctedAt)
      );
    },
  };
}

export type AttendanceController = ReturnType<typeof useAttendance>;
