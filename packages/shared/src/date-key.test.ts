import { BUSINESS_TIMEZONE, formatDateKeyInTimeZone } from './date-key';

describe('BUSINESS_TIMEZONE', () => {
  test('defaults to Asia/Makassar', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Makassar');
  });
});

describe('formatDateKeyInTimeZone', () => {
  test('returns correct date for UTC midnight in Asia/Makassar', () => {
    const d = new Date('2026-07-10T00:00:00.000Z');
    expect(formatDateKeyInTimeZone(d, 'Asia/Makassar')).toBe('2026-07-10');
  });

  test('returns correct date for instant in previous UTC day (backward boundary)', () => {
    const d = new Date('2026-07-09T20:00:00.000Z');
    expect(formatDateKeyInTimeZone(d, 'Asia/Makassar')).toBe('2026-07-10');
  });

  test('returns correct date for instant in next UTC day (forward boundary)', () => {
    const d = new Date('2026-07-10T20:00:00.000Z');
    expect(formatDateKeyInTimeZone(d, 'Asia/Makassar')).toBe('2026-07-11');
  });

  test('returns correct date for last millisecond of day in Asia/Makassar', () => {
    const d = new Date('2026-07-09T15:59:59.999Z');
    expect(formatDateKeyInTimeZone(d, 'Asia/Makassar')).toBe('2026-07-09');
  });

  test('returns correct date for first millisecond of day in Asia/Makassar', () => {
    const d = new Date('2026-07-09T16:00:00.000Z');
    expect(formatDateKeyInTimeZone(d, 'Asia/Makassar')).toBe('2026-07-10');
  });

  test('works with a negative-offset timezone', () => {
    const d = new Date('2026-07-10T00:00:00.000Z');
    expect(formatDateKeyInTimeZone(d, 'America/New_York')).toBe('2026-07-09');
  });
});
