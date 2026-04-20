import { format } from 'date-fns';
import { parseOfficeAttendanceDayDate, resolveOfficeAttendanceIsToday } from './office-attendance-carousel-date';

describe('office-attendance-carousel-date helpers', () => {
  test('uses dateKey as source of truth and builds stable local noon date', () => {
    const parsed = parseOfficeAttendanceDayDate('2026-04-21', '2026-04-20T17:00:00.000Z');

    expect(format(parsed, 'yyyy-MM-dd')).toBe('2026-04-21');
    expect(parsed.getHours()).toBe(12);
  });

  test('falls back to ISO date when dateKey is null', () => {
    const iso = '2026-04-20T17:00:00.000Z';
    const parsed = parseOfficeAttendanceDayDate(null, iso);

    expect(parsed.getTime()).toBe(new Date(iso).getTime());
  });

  test('falls back to ISO date when dateKey is invalid', () => {
    const iso = '2026-04-20T17:00:00.000Z';
    const parsed = parseOfficeAttendanceDayDate('2026-02-31', iso);

    expect(parsed.getTime()).toBe(new Date(iso).getTime());
  });

  test('resolves Today by matching first business date key when available', () => {
    expect(
      resolveOfficeAttendanceIsToday({
        dayDateKey: '2026-04-22',
        firstDayDateKey: '2026-04-21',
        index: 0,
      })
    ).toBe(false);

    expect(
      resolveOfficeAttendanceIsToday({
        dayDateKey: '2026-04-21',
        firstDayDateKey: '2026-04-21',
        index: 1,
      })
    ).toBe(true);
  });

  test('falls back to first-card index behavior when first dateKey is unavailable', () => {
    expect(
      resolveOfficeAttendanceIsToday({
        dayDateKey: null,
        firstDayDateKey: null,
        index: 0,
      })
    ).toBe(true);

    expect(
      resolveOfficeAttendanceIsToday({
        dayDateKey: null,
        firstDayDateKey: null,
        index: 1,
      })
    ).toBe(false);
  });
});
