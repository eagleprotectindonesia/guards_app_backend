import { POST } from '../app/api/employee/my/office-attendance/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
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
});
