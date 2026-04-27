import { format } from 'date-fns';
import { parseShiftCarouselDisplayDate } from './shift-carousel-date';

describe('shift-carousel-date helpers', () => {
  test('uses shift.date as source of truth when available', () => {
    const parsed = parseShiftCarouselDisplayDate({
      shiftDate: '2026-04-21T00:00:00.000Z',
      startsAt: '2026-04-20T17:00:00.000Z',
    });

    expect(format(parsed, 'yyyy-MM-dd')).toBe('2026-04-21');
    expect(parsed.getHours()).toBe(12);
  });

  test('supports Date object shift.date values', () => {
    const parsed = parseShiftCarouselDisplayDate({
      shiftDate: new Date('2026-04-22T00:00:00.000Z'),
      startsAt: '2026-04-21T17:00:00.000Z',
    });

    expect(format(parsed, 'yyyy-MM-dd')).toBe('2026-04-22');
  });

  test('falls back to startsAt when shift.date is missing', () => {
    const startsAt = '2026-04-20T17:00:00.000Z';
    const parsed = parseShiftCarouselDisplayDate({
      shiftDate: null,
      startsAt,
    });

    expect(parsed.getTime()).toBe(new Date(startsAt).getTime());
  });

  test('falls back to startsAt when shift.date is invalid', () => {
    const startsAt = '2026-04-20T17:00:00.000Z';
    const parsed = parseShiftCarouselDisplayDate({
      shiftDate: 'not-a-date',
      startsAt,
    });

    expect(parsed.getTime()).toBe(new Date(startsAt).getTime());
  });
});
