import { GET } from '../app/api/employee/my/office-attendance/weekly/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getSystemSetting,
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getTodayOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getSystemSetting: jest.fn(),
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
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '0' });
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

  test('keeps today display anchored to day schedule while attendanceState stays real-time', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);

    let call = 0;
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockImplementation(async () => {
      call += 1;
      // First day makes two calls:
      // 1) display context (start of day) -> working day shift visible
      // 2) state context (now) -> no active shift after end
      if (call === 1) {
        return {
          source: 'office_shift',
          isWorkingDay: true,
          isLate: false,
          isAfterEnd: false,
          startMinutes: 8 * 60,
          endMinutes: 17 * 60,
          windowStart: new Date('2099-01-01T00:00:00.000Z'),
          windowEnd: new Date('2099-01-01T09:00:00.000Z'),
          businessDay: {
            dateKey: '2099-01-01',
          },
        };
      }
      if (call === 2) {
        return {
          source: 'office_shift',
          isWorkingDay: false,
          isLate: false,
          isAfterEnd: false,
          startMinutes: null,
          endMinutes: null,
          windowStart: null,
          windowEnd: null,
          businessDay: {
            dateKey: '2099-01-01',
          },
        };
      }

      return {
        source: 'office_work_schedule',
        isWorkingDay: false,
        isLate: false,
        isAfterEnd: false,
        startMinutes: null,
        endMinutes: null,
        windowStart: null,
        windowEnd: null,
        businessDay: {
          dateKey: '2099-01-02',
        },
      };
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.days[0]).toMatchObject({
      isWorkingDay: true,
      scheduledStartStr: '08:00',
      scheduledEndStr: '17:00',
      attendanceState: {
        status: 'non_working_day',
        canClockIn: false,
        canClockOut: false,
      },
    });
  });

  test('filters weekly day attendances to present and clocked_out only', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-weekly-filter',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([
      { id: 'w1', status: 'leave', recordedAt: '2026-05-05T08:00:00.000Z' },
      { id: 'w2', status: 'present', recordedAt: '2026-05-05T09:00:00.000Z' },
      { id: 'w3', status: 'pending_leave', recordedAt: '2026-05-05T10:00:00.000Z' },
      { id: 'w4', status: 'clocked_out', recordedAt: '2026-05-05T17:00:00.000Z' },
    ]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_work_schedule',
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      windowStart: null,
      windowEnd: null,
      businessDay: {
        dateKey: '2026-05-05',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.days[0].attendances).toEqual([
      expect.objectContaining({ id: 'w2', status: 'present' }),
      expect.objectContaining({ id: 'w4', status: 'clocked_out' }),
    ]);
  });
});
