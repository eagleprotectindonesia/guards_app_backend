import {
  shouldRefetchForActiveShift,
  shouldRefetchForNextShift,
} from '../app/employee/(authenticated)/utils/shift-time';

describe('employee shift timer guards', () => {
  const baseShift = {
    id: 'shift-1',
    startsAt: new Date('2026-05-20T08:00:00.000Z'),
    endsAt: new Date('2026-05-20T16:00:00.000Z'),
  };

  test('refetches when active shift passed end + grace period', () => {
    const now = new Date('2026-05-20T16:06:00.000Z');
    expect(shouldRefetchForActiveShift(baseShift as any, now)).toBe(true);
  });

  test('does not throw or refetch when active shift end timestamp is invalid', () => {
    const now = new Date('2026-05-20T16:06:00.000Z');
    expect(shouldRefetchForActiveShift({ ...baseShift, endsAt: 'bad-date' } as any, now)).toBe(false);
  });

  test('refetches shortly before next shift starts', () => {
    const nextShift = { ...baseShift, startsAt: new Date('2026-05-20T08:00:00.000Z') };
    const now = new Date('2026-05-20T07:55:00.000Z');
    expect(shouldRefetchForNextShift(nextShift as any, now)).toBe(true);
  });

  test('does not throw or refetch when next shift start timestamp is invalid', () => {
    const now = new Date('2026-05-20T07:55:00.000Z');
    expect(shouldRefetchForNextShift({ ...baseShift, startsAt: 'bad-date' } as any, now)).toBe(false);
  });
});

