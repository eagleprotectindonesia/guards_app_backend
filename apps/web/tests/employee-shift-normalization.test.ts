import { parseShiftDates } from '../app/employee/(authenticated)/hooks/use-employee-queries';

describe('employee shift normalization', () => {
  const baseShift = {
    id: 'shift-1',
    siteId: 'site-1',
    shiftTypeId: 'type-1',
    employeeId: 'employee-1',
    kind: 'onsite',
    escortEndSiteId: null,
    date: '2026-05-20T00:00:00.000Z',
    startsAt: '2026-05-20T08:00:00.000Z',
    endsAt: '2026-05-20T16:00:00.000Z',
    status: 'scheduled',
    missedCount: 0,
    graceMinutes: 5,
    requiredCheckinIntervalMins: 60,
    site: { id: 'site-1', name: 'HQ', kind: 'fixed' },
    escortEndSite: null,
    shiftType: { id: 'type-1', name: 'Morning', startTime: '08:00', endTime: '16:00' },
    employee: null,
    attendance: null,
  } as const;

  test('parses valid serialized shift and check-in window dates', () => {
    const parsed = parseShiftDates({
      ...baseShift,
      checkInWindow: {
        status: 'open',
        currentSlotStart: '2026-05-20T09:00:00.000Z',
        currentSlotEnd: '2026-05-20T09:05:00.000Z',
        nextSlotStart: '2026-05-20T10:00:00.000Z',
        remainingTimeMs: 1000,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.startsAt).toBeInstanceOf(Date);
    expect(parsed?.endsAt).toBeInstanceOf(Date);
    expect(parsed?.checkInWindow?.currentSlotStart).toBeInstanceOf(Date);
  });

  test('returns null when required shift timestamps are invalid', () => {
    const parsed = parseShiftDates({
      ...baseShift,
      startsAt: 'not-a-date',
    });

    expect(parsed).toBeNull();
  });

  test('disables malformed check-in window while preserving shift', () => {
    const parsed = parseShiftDates({
      ...baseShift,
      checkInWindow: {
        status: 'open',
        currentSlotStart: 'bad-date',
        currentSlotEnd: '2026-05-20T09:05:00.000Z',
        nextSlotStart: '2026-05-20T10:00:00.000Z',
        remainingTimeMs: 1000,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.checkInWindow).toBeUndefined();
  });
});
