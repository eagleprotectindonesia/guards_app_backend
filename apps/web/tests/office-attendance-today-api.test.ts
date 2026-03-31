import { GET } from '../app/api/employee/my/office-attendance/today/route';
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

describe('GET /api/employee/my/office-attendance/today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns backend-driven schedule context with display helpers for a working day', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      windowStart: new Date('2026-03-28T00:00:00.000Z'),
      windowEnd: new Date('2026-03-28T09:00:00.000Z'),
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      schedule: {
        id: 'schedule-1',
        code: 'default-office-work-schedule',
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-03-28',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'available',
      canClockIn: true,
      canClockOut: false,
      windowClosed: false,
    });
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      businessDateStr: '2026-03-28',
      scheduledStartStr: '08:00',
      scheduledEndStr: '17:00',
      schedule: {
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-03-28',
      },
    });
  });

  test('returns non-working-day state without inventing schedule window strings', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
      startMinutes: null,
      endMinutes: null,
      schedule: {
        id: 'schedule-1',
        code: 'default-office-work-schedule',
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-03-29',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
      windowClosed: false,
    });
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: false,
      businessDateStr: '2026-03-29',
      scheduledStartStr: null,
      scheduledEndStr: null,
    });
  });

  test('returns missed state when the office window already ended without attendance', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-3',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      windowStart: new Date('2026-03-30T00:00:00.000Z'),
      windowEnd: new Date('2026-03-30T09:00:00.000Z'),
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      schedule: {
        id: 'schedule-2',
        code: 'finance-team-schedule',
        name: 'Finance Team Schedule',
      },
      businessDay: {
        dateKey: '2026-03-30',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'missed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'office_hours_ended',
      latestAttendance: null,
    });
  });

  test('returns completed state when the latest attendance in the window is clocked out', async () => {
    const latestAttendance = {
      id: 'attendance-1',
      employeeId: 'employee-4',
      officeId: null,
      status: 'clocked_out',
      recordedAt: '2026-03-31T09:15:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-4',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([latestAttendance]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(latestAttendance);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(latestAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      windowStart: new Date('2026-03-31T00:00:00.000Z'),
      windowEnd: new Date('2026-03-31T09:00:00.000Z'),
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      schedule: {
        id: 'schedule-3',
        code: 'default-office-work-schedule',
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-03-31',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'completed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      latestAttendance: latestAttendance,
    });
  });

  test('falls back to a same-business-day present attendance and keeps clock-out available', async () => {
    const latestTodayAttendance = {
      id: 'attendance-fallback',
      employeeId: 'employee-5',
      officeId: null,
      status: 'present',
      recordedAt: '2026-04-01T08:15:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-5',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([latestTodayAttendance]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(latestTodayAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      windowStart: new Date('2026-04-01T00:00:00.000Z'),
      windowEnd: new Date('2026-04-01T09:00:00.000Z'),
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      schedule: {
        id: 'schedule-4',
        code: 'default-office-work-schedule',
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-04-01',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      windowClosed: false,
      latestAttendance: latestTodayAttendance,
    });
  });

  test('falls back to a same-business-day clocked out attendance and keeps the day completed', async () => {
    const latestTodayAttendance = {
      id: 'attendance-fallback-closed',
      employeeId: 'employee-6',
      officeId: null,
      status: 'clocked_out',
      recordedAt: '2026-04-02T09:15:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-6',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([latestTodayAttendance]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(latestTodayAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      windowStart: new Date('2026-04-02T00:00:00.000Z'),
      windowEnd: new Date('2026-04-02T09:00:00.000Z'),
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      schedule: {
        id: 'schedule-5',
        code: 'default-office-work-schedule',
        name: 'Default Office Schedule',
      },
      businessDay: {
        dateKey: '2026-04-02',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'completed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      latestAttendance: latestTodayAttendance,
    });
  });
});
