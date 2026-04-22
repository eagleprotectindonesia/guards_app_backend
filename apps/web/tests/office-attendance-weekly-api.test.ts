import { GET } from '../app/api/employee/my/office-attendance/weekly/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getTodayOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getLatestOfficeAttendanceInRange: jest.fn(),
  getLatestOfficeAttendanceForDay: jest.fn(),
  getTodayOfficeAttendance: jest.fn(),
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

describe('GET /api/employee/my/office-attendance/weekly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes holiday policy for holiday override days', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'holiday_calendar_off',
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      holidayPolicy: {
        entry: {
          id: 'holiday-1',
          title: 'National Holiday',
          type: 'holiday',
          scope: 'all',
          departmentKeys: [],
          isPaid: true,
          affectsAttendance: true,
          notificationRequired: false,
        },
        marksAsWorkingDay: false,
      },
      businessDay: {
        dateKey: '2026-04-02',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.days).toHaveLength(7);
    expect(data.days[0]).toMatchObject({
      isWorkingDay: false,
      scheduledStartStr: null,
      scheduledEndStr: null,
      holidayPolicy: {
        entry: {
          type: 'holiday',
          title: 'National Holiday',
        },
      },
      attendanceState: {
        status: 'non_working_day',
        canClockIn: false,
      },
    });
  });
});
