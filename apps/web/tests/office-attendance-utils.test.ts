import { resolveOfficeAttendanceErrorMessage } from '../../mobile/src/components/office-attendance-utils';

describe('resolveOfficeAttendanceErrorMessage', () => {
  test('passes distance details to too_far_from_office translations', () => {
    const t = jest.fn((key: string, options?: Record<string, unknown>) => JSON.stringify({ key, options }));

    const message = resolveOfficeAttendanceErrorMessage(t, {
      code: 'too_far_from_office',
      details: {
        currentDistanceMeters: 235,
        maxDistanceMeters: 100,
      },
    });

    expect(t).toHaveBeenCalledWith('officeAttendance.errors.tooFarFromOffice', {
      currentDistanceMeters: 235,
      maxDistanceMeters: 100,
    });
    expect(message).toContain('officeAttendance.errors.tooFarFromOffice');
  });

  test('keeps fallback behavior for unmapped codes', () => {
    const t = jest.fn((key: string) => key);

    expect(
      resolveOfficeAttendanceErrorMessage(t, {
        code: 'unknown_error',
        fallbackMessage: 'Fallback message',
      })
    ).toBe('Fallback message');
  });
});
