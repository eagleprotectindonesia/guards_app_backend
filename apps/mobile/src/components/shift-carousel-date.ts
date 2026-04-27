function extractDateKey(dateValue: string | Date | null | undefined): string | null {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    if (!Number.isNaN(dateValue.getTime())) {
      return dateValue.toISOString().slice(0, 10);
    }
    return null;
  }

  if (typeof dateValue === 'string') {
    const directMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (directMatch) {
      return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
    }

    const isoPrefixMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(dateValue);
    if (isoPrefixMatch) {
      return `${isoPrefixMatch[1]}-${isoPrefixMatch[2]}-${isoPrefixMatch[3]}`;
    }

    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function parseDateKeyAsLocalNoon(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localNoon = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    localNoon.getFullYear() === year &&
    localNoon.getMonth() === month - 1 &&
    localNoon.getDate() === day
  ) {
    return localNoon;
  }

  return null;
}

export function parseShiftCarouselDisplayDate(params: {
  shiftDate: string | Date | null | undefined;
  startsAt: string | Date;
}) {
  const dateKey = extractDateKey(params.shiftDate);
  if (dateKey) {
    const parsedFromDateKey = parseDateKeyAsLocalNoon(dateKey);
    if (parsedFromDateKey) return parsedFromDateKey;
  }

  return new Date(params.startsAt);
}
