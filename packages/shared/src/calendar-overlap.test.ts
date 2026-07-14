import { overlapsEventRange, parseTime } from './calendar-overlap';
import type { EventOverlap, QueryOverlap } from './calendar-overlap';

function event(overrides: Partial<EventOverlap> = {}): EventOverlap {
  return {
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    startTime: null,
    endTime: null,
    allDay: true,
    ...overrides,
  };
}

function query(overrides: Partial<QueryOverlap> = {}): QueryOverlap {
  return {
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    startTime: null,
    endTime: null,
    allDay: true,
    ...overrides,
  };
}

describe('overlapsEventRange', () => {
  describe('all-day events (both sides allDay)', () => {
    test('same day', () => {
      expect(overlapsEventRange(event(), query())).toBe(true);
    });

    test('event ends before query starts', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-08', endDate: '2026-07-09' }),
          query({ startDate: '2026-07-10', endDate: '2026-07-10' })
        )
      ).toBe(false);
    });

    test('event starts after query ends', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-12', endDate: '2026-07-14' }),
          query({ startDate: '2026-07-10', endDate: '2026-07-11' })
        )
      ).toBe(false);
    });

    test('multi-day event spanning query day', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-08', endDate: '2026-07-12' }),
          query({ startDate: '2026-07-10', endDate: '2026-07-10' })
        )
      ).toBe(true);
    });

    test('query spanning multi-day event', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-10', endDate: '2026-07-10' }),
          query({ startDate: '2026-07-08', endDate: '2026-07-14' })
        )
      ).toBe(true);
    });

    test('inclusive: event end equals query start', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-10', endDate: '2026-07-10' }),
          query({ startDate: '2026-07-10', endDate: '2026-07-12' })
        )
      ).toBe(true);
    });

    test('exclusive: event end before query start (inclusive)', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-08', endDate: '2026-07-09' }),
          query({ startDate: '2026-07-09', endDate: '2026-07-10' })
        )
      ).toBe(true);
    });
  });

  describe('all-day event vs timed query (or vice versa)', () => {
    test('event allDay, query timed — date overlap', () => {
      expect(
        overlapsEventRange(
          event({ allDay: true }),
          query({ allDay: false, startTime: '09:00', endTime: '17:00' })
        )
      ).toBe(true);
    });

    test('event timed, query allDay — date overlap', () => {
      expect(
        overlapsEventRange(
          event({ startTime: '09:00', endTime: '17:00', allDay: false }),
          query({ allDay: true })
        )
      ).toBe(true);
    });

    test('event allDay, query timed — different days no overlap', () => {
      expect(
        overlapsEventRange(
          event({ allDay: true, startDate: '2026-07-08', endDate: '2026-07-09' }),
          query({ allDay: false, startDate: '2026-07-10', endDate: '2026-07-10', startTime: '09:00', endTime: '17:00' })
        )
      ).toBe(false);
    });
  });

  describe('timed events (both sides have times)', () => {
    test('overlapping intervals same day', () => {
      expect(
        overlapsEventRange(
          event({ startTime: '09:00', endTime: '12:00', allDay: false }),
          query({ startTime: '11:00', endTime: '14:00', allDay: false })
        )
      ).toBe(true);
    });

    test('non-overlapping intervals same day', () => {
      expect(
        overlapsEventRange(
          event({ startTime: '09:00', endTime: '11:00', allDay: false }),
          query({ startTime: '14:00', endTime: '16:00', allDay: false })
        )
      ).toBe(false);
    });

    test('touching at boundary — no overlap (end ≤ start)', () => {
      expect(
        overlapsEventRange(
          event({ startTime: '09:00', endTime: '12:00', allDay: false }),
          query({ startTime: '12:00', endTime: '14:00', allDay: false })
        )
      ).toBe(false);
    });

    test('event fully contained within query', () => {
      expect(
        overlapsEventRange(
          event({ startTime: '10:00', endTime: '12:00', allDay: false }),
          query({ startTime: '09:00', endTime: '14:00', allDay: false })
        )
      ).toBe(true);
    });

    test('multi-day timed events overlapping', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-08', endDate: '2026-07-12', startTime: '09:00', endTime: '17:00', allDay: false }),
          query({ startDate: '2026-07-10', endDate: '2026-07-10', startTime: '11:00', endTime: '14:00', allDay: false })
        )
      ).toBe(true);
    });
  });

  describe('missing times edge cases', () => {
    test('event has no times, query has times — treated as overlap', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-10', endDate: '2026-07-10', startTime: null, endTime: null, allDay: false }),
          query({ startDate: '2026-07-10', endDate: '2026-07-10', startTime: '09:00', endTime: '17:00', allDay: false })
        )
      ).toBe(true);
    });

    test('event has times, query has no times — treated as overlap', () => {
      expect(
        overlapsEventRange(
          event({ startDate: '2026-07-10', endDate: '2026-07-10', startTime: '09:00', endTime: '17:00', allDay: false }),
          query({ startDate: '2026-07-10', endDate: '2026-07-10', startTime: null, endTime: null, allDay: false })
        )
      ).toBe(true);
    });
  });
});

describe('parseTime', () => {
  test('converts morning time in Asia/Makassar to correct UTC instant', () => {
    const d = parseTime('2026-07-10', '09:00', 'Asia/Makassar');
    expect(d.toISOString()).toBe('2026-07-10T01:00:00.000Z');
  });

  test('converts afternoon time in Asia/Makassar to correct UTC instant', () => {
    const d = parseTime('2026-07-10', '17:00', 'Asia/Makassar');
    expect(d.toISOString()).toBe('2026-07-10T09:00:00.000Z');
  });

  test('converts late-night time crossing calendar day in Asia/Makassar', () => {
    const d = parseTime('2026-07-10', '22:00', 'Asia/Makassar');
    expect(d.toISOString()).toBe('2026-07-10T14:00:00.000Z');
  });

  test('converts midnight (next day) in Asia/Makassar — UTC previous day', () => {
    const d = parseTime('2026-07-11', '00:00', 'Asia/Makassar');
    expect(d.toISOString()).toBe('2026-07-10T16:00:00.000Z');
  });

  test('uses BUSINESS_TIMEZONE by default', () => {
    const d = parseTime('2026-07-10', '09:00');
    expect(d.toISOString()).toBe('2026-07-10T01:00:00.000Z');
  });
});
