import { POST } from '../app/api/employee/my/office-attendance/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getOfficeById,
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  getSystemSetting,
  recordOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';
import { OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING } from '@repo/shared';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getLatestOfficeAttendanceInRange: jest.fn(),
  getLatestOfficeAttendanceForDay: jest.fn(),
  getOfficeById: jest.fn(),
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING: 'OFFICE_ATTENDANCE_MAX_DISTANCE_METERS',
  OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING: 'OFFICE_ATTENDANCE_REQUIRE_PHOTO',
  getSystemSetting: jest.fn(),
  recordOfficeAttendance: jest.fn(),
  resolveOfficeAttendanceContextForEmployee: jest.fn(),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

describe('POST /api/employee/my/office-attendance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '0' });
  });

  test('rejects office attendance on a non-working day', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: false,
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({ status: 'present' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'not_working_day',
    });
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('records a late clock-in using the employee schedule context', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: true,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 25,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-1',
      employeeId: 'employee-2',
      officeId: null,
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
        metadata: { source: 'mobile' },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-1' });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: null,
        employeeId: 'employee-2',
        status: 'present',
        metadata: expect.objectContaining({
          source: 'mobile',
          latenessMins: 25,
        }),
      })
    );
  });

  test('requires picture when OFFICE_ATTENDANCE_REQUIRE_PHOTO is enabled', async () => {
    (getSystemSetting as jest.Mock).mockImplementation((name: string) => {
      if (name === OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING) return Promise.resolve({ value: '1' });
      return Promise.resolve({ value: '1000' });
    });
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-photo-required',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 5,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'photo_required',
    });
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('returns 200 when duplicate attendance resolves to an existing record', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 5,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      attendance: {
        id: 'attendance-existing',
        employeeId: 'employee-2',
        officeId: null,
        status: 'present',
      },
      created: false,
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendance).toMatchObject({ id: 'attendance-existing' });
  });

  test('persists rounded distanceMeters for office-required clock-in', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-distance-in',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'office_required',
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 5,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getOfficeById as jest.Mock).mockResolvedValue({
      id: 'office-1',
      latitude: 0,
      longitude: 0,
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1000' });
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-distance-in',
      employeeId: 'employee-distance-in',
      officeId: 'office-1',
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
        location: { lat: 0, lng: 0.0001 },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-distance-in' });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: 'office-1',
        employeeId: 'employee-distance-in',
        status: 'present',
        metadata: expect.objectContaining({
          location: { lat: 0, lng: 0.0001 },
          distanceMeters: expect.any(Number),
        }),
      })
    );
  });

  test('records attendance for office employees without an assigned office when field mode is disabled', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-null-office',
      role: 'office',
      officeId: null,
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 5,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-null-office',
      employeeId: 'employee-null-office',
      officeId: null,
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({
      id: 'attendance-null-office',
      officeId: null,
    });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: null,
        employeeId: 'employee-null-office',
        status: 'present',
      })
    );
    expect(getOfficeById).not.toHaveBeenCalled();
  });

  test('records a late overnight clock-in using the schedule window start', async () => {
    const windowStart = new Date(Date.now() - 450 * 60_000);
    const windowEnd = new Date(windowStart.getTime() + 8 * 60 * 60_000);

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-5',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: true,
      startMinutes: 18 * 60,
      endMinutes: 2 * 60,
      windowStart,
      windowEnd,
      businessDay: {
        minutesSinceMidnight: 90,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-overnight',
      employeeId: 'employee-5',
      officeId: null,
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
        metadata: { source: 'mobile' },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-overnight' });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: null,
        employeeId: 'employee-5',
        status: 'present',
        metadata: expect.objectContaining({
          source: 'mobile',
          latenessMins: 450,
        }),
      })
    );
  });

  test('rejects clock-out before a same-day clock-in exists', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-3',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 9 * 60,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({ status: 'clocked_out' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'clock_in_required',
    });
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('allows late clock-out when a same-business-day present exists outside the active window', async () => {
    const latestTodayAttendance = {
      id: 'attendance-open-day',
      employeeId: 'employee-3b',
      officeId: null,
      status: 'present',
      recordedAt: '2026-04-02T08:10:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-3b',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: true,
      isLate: true,
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      businessDay: {
        minutesSinceMidnight: 18 * 60,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(latestTodayAttendance);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-clock-out',
      employeeId: 'employee-3b',
      officeId: null,
      status: 'clocked_out',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({ status: 'clocked_out' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-clock-out', status: 'clocked_out' });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-3b',
        status: 'clocked_out',
      })
    );
  });

  test('persists rounded distanceMeters for office-required clock-out', async () => {
    const windowStart = new Date('2026-04-02T00:00:00.000Z');
    const windowEnd = new Date('2026-04-02T23:59:59.999Z');

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-distance-out',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'office_required',
      windowStart,
      windowEnd,
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 16 * 60,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue({
      id: 'attendance-open-window',
      employeeId: 'employee-distance-out',
      officeId: 'office-1',
      status: 'present',
      recordedAt: '2026-04-02T08:00:00.000Z',
    });
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getOfficeById as jest.Mock).mockResolvedValue({
      id: 'office-1',
      latitude: 0,
      longitude: 0,
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1000' });
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-distance-out',
      employeeId: 'employee-distance-out',
      officeId: 'office-1',
      status: 'clocked_out',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'clocked_out',
        location: { lat: 0, lng: 0.0002 },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-distance-out' });
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: 'office-1',
        employeeId: 'employee-distance-out',
        status: 'clocked_out',
        metadata: expect.objectContaining({
          location: { lat: 0, lng: 0.0002 },
          distanceMeters: expect.any(Number),
        }),
      })
    );
  });

  test('rejects late clock-out when the same-business-day latest attendance is already clocked out', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-3c',
      role: 'office',
      officeId: null,
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: true,
      isLate: true,
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      businessDay: {
        minutesSinceMidnight: 18 * 60,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue({
      id: 'attendance-closed-day',
      employeeId: 'employee-3c',
      officeId: null,
      status: 'clocked_out',
      recordedAt: '2026-04-02T09:15:00.000Z',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({ status: 'clocked_out' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'office_attendance_completed',
    });
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('rejects attendance when employee is too far from the assigned office', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-4',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'office_required',
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 10,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getOfficeById as jest.Mock).mockResolvedValue({
      id: 'office-1',
      latitude: 0,
      longitude: 0,
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '100' });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
        location: { lat: 0, lng: 0.002 },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'too_far_from_office',
      details: {
        maxDistanceMeters: 100,
      },
    });
    expect(typeof data.details.currentDistanceMeters).toBe('number');
    expect(getSystemSetting).toHaveBeenCalledWith(OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING);
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('uses the assigned employee office when field mode is disabled even if the client sends officeId null', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-6',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'office_required',
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 10,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getOfficeById as jest.Mock).mockResolvedValue({
      id: 'office-1',
      latitude: null,
      longitude: null,
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        officeId: null,
        status: 'present',
        location: { lat: 0, lng: 0 },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'office_location_not_configured',
    });
    expect(getOfficeById).toHaveBeenCalledWith('office-1');
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('allows attendance from anywhere when field mode is enabled even with an assigned office', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-7',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'non_office',
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 10,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-field-mode',
      employeeId: 'employee-7',
      officeId: null,
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({
      id: 'attendance-field-mode',
      officeId: null,
    });
    expect(getOfficeById).not.toHaveBeenCalled();
    expect(getSystemSetting).not.toHaveBeenCalledWith(OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING);
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: null,
        employeeId: 'employee-7',
        status: 'present',
      })
    );
  });

  test('shift override can force office attendance even when employee default allows anywhere', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-hybrid-office',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: true,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'office_required',
      attendancePolicySource: 'shift_override',
      shift: { id: 'shift-1' },
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 10,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getOfficeById as jest.Mock).mockResolvedValue({
      id: 'office-1',
      latitude: 0,
      longitude: 0,
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '100' });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
        location: { lat: 0, lng: 0.002 },
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({ code: 'too_far_from_office' });
    expect(getOfficeById).toHaveBeenCalledWith('office-1');
  });

  test('shift override can allow non-office attendance even when employee default requires office', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-hybrid-remote',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
    });
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
      effectiveAttendanceMode: 'non_office',
      attendancePolicySource: 'shift_override',
      shift: { id: 'shift-2' },
      startMinutes: 8 * 60,
      businessDay: {
        minutesSinceMidnight: 8 * 60 + 10,
      },
    });
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (recordOfficeAttendance as jest.Mock).mockResolvedValue({
      id: 'attendance-hybrid-remote',
      employeeId: 'employee-hybrid-remote',
      officeId: null,
      officeShiftId: 'shift-2',
      status: 'present',
    });

    const req = new Request('http://localhost/api/employee/my/office-attendance', {
      method: 'POST',
      body: JSON.stringify({
        status: 'present',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.attendance).toMatchObject({ id: 'attendance-hybrid-remote' });
    expect(getOfficeById).not.toHaveBeenCalled();
    expect(recordOfficeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: null,
        officeShiftId: 'shift-2',
      })
    );
  });
});
