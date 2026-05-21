import { computeAnnualLeaveEntitledDays } from './annual-leave-policy';

describe('annual leave policy', () => {
  test('returns 0 before eligibility year', () => {
    const days = computeAnnualLeaveEntitledDays({
      dateOfJoining: new Date('2025-06-15T00:00:00.000Z'),
      year: 2025,
    });
    expect(days).toBe(0);
  });

  test('returns prorated days in eligibility year with floor rounding', () => {
    const days = computeAnnualLeaveEntitledDays({
      dateOfJoining: new Date('2025-06-15T00:00:00.000Z'),
      year: 2026,
    });
    expect(days).toBe(6);
  });

  test('handles leap year denominator', () => {
    const days = computeAnnualLeaveEntitledDays({
      dateOfJoining: new Date('2027-06-30T00:00:00.000Z'),
      year: 2028,
    });
    expect(days).toBe(6);
  });

  test('returns 12 after eligibility year', () => {
    const days = computeAnnualLeaveEntitledDays({
      dateOfJoining: new Date('2024-01-01T00:00:00.000Z'),
      year: 2026,
    });
    expect(days).toBe(12);
  });
});

