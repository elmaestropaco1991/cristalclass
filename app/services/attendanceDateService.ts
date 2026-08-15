export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Calendar date in the requested user timezone; it deliberately does not slice UTC ISO. */
export function getLocalDateKey(
  date = new Date(),
  timeZone = getUserTimeZone()
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("No se pudo determinar la fecha local de asistencia.");
  }

  return `${year}-${month}-${day}`;
}

export function localTimeToInstant(localDate: string, localTime: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) {
    throw new Error("Introduce una hora válida.");
  }

  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Introduce una hora válida.");
  }

  const instant = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    !Number.isFinite(instant.getTime())
    || instant.getFullYear() !== year
    || instant.getMonth() !== month - 1
    || instant.getDate() !== day
    || instant.getHours() !== hour
    || instant.getMinutes() !== minute
  ) {
    throw new Error("Introduce una hora válida para esta jornada.");
  }

  return instant.toISOString();
}

export function formatAttendanceDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

export function formatAttendanceTime(instant: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
}

export function getLocalTimeInputValue(instant: string): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
