import {
  shouldRefetchForActiveShift,
  shouldRefetchForNextShift,
} from '../app/employee/(authenticated)/utils/shift-time';

describe('employee shift timer guards', () => {
  const baseShift = {
    id: 'shift-1',
    startsAt: new Date('2026-05-20T08:00:00.000Z'),
    endsAt: new Date('2026-05-20T16:00:00.000Z'),
  } as Parameters<typeof shouldRefetchForActiveShift>[0];

  test('refetches when active shift passed end + grace period', () => {
    const now = new Date('2026-05-20T16:06:00.000Z');
    expect(shouldRefetchForActiveShift(baseShift, now)).toBe(true);
  });

  test('does not throw or refetch when active shift end timestamp is invalid', () => {
    const now = new Date('2026-05-20T16:06:00.000Z');
    expect(shouldRefetchForActiveShift({ ...baseShift, endsAt: 'bad-date' } as typeof baseShift, now)).toBe(false);
  });

  test('refetches shortly before next shift starts', () => {
    const nextShift = { ...baseShift, startsAt: new Date('2026-05-20T08:00:00.000Z') } as Parameters<
      typeof shouldRefetchForNextShift
    >[0];
    const now = new Date('2026-05-20T07:55:00.000Z');
    expect(shouldRefetchForNextShift(nextShift, now)).toBe(true);
  });

  test('does not throw or refetch when next shift start timestamp is invalid', () => {
    const now = new Date('2026-05-20T07:55:00.000Z');
    expect(
      shouldRefetchForNextShift(
        { ...baseShift, startsAt: 'bad-date' } as Parameters<typeof shouldRefetchForNextShift>[0],
        now
      )
    ).toBe(false);
  });
});
