import { POST } from '../app/api/employee/my/office-attendance/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getOfficeById,
  getSystemSetting,
  recordOfficeAttendance,
  resolveOfficeWorkScheduleContextForEmployee,
} from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getLatestOfficeAttendanceInRange: jest.fn(),
  getLatestOfficeAttendanceForDay: jest.fn(),
  getOfficeById: jest.fn(),
  getSystemSetting: jest.fn(),
  recordOfficeAttendance: jest.fn(),
  resolveOfficeWorkScheduleContextForEmployee: jest.fn(),
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
  });

  test('rejects office attendance on a non-working day', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      role: 'office',
      officeId: null,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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

  test('records attendance for office employees without an assigned office', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-null-office',
      role: 'office',
      officeId: null,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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

  test('rejects late clock-out when the same-business-day latest attendance is already clocked out', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-3c',
      role: 'office',
      officeId: null,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
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
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
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
    });
    expect(recordOfficeAttendance).not.toHaveBeenCalled();
  });

  test('uses the assigned employee office even if the client sends officeId null', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-6',
      role: 'office',
      officeId: 'office-1',
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: false,
      isLate: false,
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
});
