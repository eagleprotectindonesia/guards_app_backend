export function parseOfficeAttendanceDayDate(dateKey: string | null | undefined, fallbackIsoDate: string): Date {
  if (dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      const localNoon = new Date(year, month - 1, day, 12, 0, 0, 0);

      // Guard against invalid dateKey values (e.g. 2026-02-31) overflowing.
      if (
        localNoon.getFullYear() === year &&
        localNoon.getMonth() === month - 1 &&
        localNoon.getDate() === day
      ) {
        return localNoon;
      }
    }
  }

  return new Date(fallbackIsoDate);
}

export function resolveOfficeAttendanceIsToday(params: {
  dayDateKey: string | null | undefined;
  firstDayDateKey: string | null | undefined;
  index: number;
}) {
  const { dayDateKey, firstDayDateKey, index } = params;

  if (firstDayDateKey) {
    return dayDateKey === firstDayDateKey;
  }

  return index === 0;
}
