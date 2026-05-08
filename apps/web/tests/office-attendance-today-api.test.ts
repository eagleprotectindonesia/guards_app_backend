import { GET } from '../app/api/employee/my/office-attendance/today/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getSystemSetting,
  getOfficeAttendanceInRange,
  getLatestOfficeAttendanceForEmployee,
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
  getOfficeAttendanceInRange: jest.fn(),
  getLatestOfficeAttendanceForEmployee: jest.fn(),
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
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '0' });
  });

  test('returns backend-driven schedule context with display helpers for a working day', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
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

  test('filters attendances history to present and clocked_out only', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-filter-history',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([
      { id: 'a1', status: 'absent', recordedAt: '2026-05-05T08:00:00.000Z' },
      { id: 'a2', status: 'present', recordedAt: '2026-05-05T09:00:00.000Z' },
      { id: 'a3', status: 'pending_leave', recordedAt: '2026-05-05T10:00:00.000Z' },
      { id: 'a4', status: 'clocked_out', recordedAt: '2026-05-05T17:00:00.000Z' },
    ]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      businessDay: {
        dateKey: '2026-05-05',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendances).toEqual([
      expect.objectContaining({ id: 'a2', status: 'present' }),
      expect.objectContaining({ id: 'a4', status: 'clocked_out' }),
    ]);
  });

  test('keeps today schedule display anchored while attendanceState stays real-time', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-display-state-split',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);

    let contextCall = 0;
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockImplementation(async () => {
      contextCall += 1;
      if (contextCall === 1) {
        return {
          source: 'office_shift',
          isWorkingDay: true,
          isLate: false,
          isAfterEnd: false,
          windowStart: new Date('2099-01-01T00:00:00.000Z'),
          windowEnd: new Date('2099-01-01T09:00:00.000Z'),
          startMinutes: 8 * 60,
          endMinutes: 17 * 60,
          schedule: {
            id: 'schedule-display',
            code: 'display-schedule',
            name: 'Display Schedule',
          },
          businessDay: {
            dateKey: '2099-01-01',
          },
        };
      }

      return {
        source: 'office_shift',
        isWorkingDay: false,
        isLate: false,
        isAfterEnd: false,
        windowStart: null,
        windowEnd: null,
        startMinutes: null,
        endMinutes: null,
        businessDay: {
          dateKey: '2099-01-01',
        },
      };
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: true,
      businessDateStr: '2099-01-01',
      scheduledStartStr: '08:00',
      scheduledEndStr: '17:00',
    });
    expect(data.attendanceState).toMatchObject({
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
    });
  });

  test('returns non-working-day state without inventing schedule window strings', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
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

  test('includes holiday policy in schedule context for holiday override days', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-holiday',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'holiday_calendar_off',
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
      startMinutes: null,
      endMinutes: null,
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
    expect(data.attendanceState).toMatchObject({
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
    });
    expect(data.scheduleContext).toMatchObject({
      holidayPolicy: {
        entry: {
          type: 'holiday',
          title: 'National Holiday',
        },
      },
      businessDateStr: '2026-04-02',
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
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
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
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
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

  test('allows canClockIn at 00:01 for an active overnight shift when no open attendance exists', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-02T00:01:00.000Z'));

    try {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
        id: 'employee-midnight-clockin',
        role: 'office',
      });
      (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
      (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
      (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(null);
      (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
      (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
      (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
        source: 'office_shift',
        isWorkingDay: true,
        isLate: true,
        isAfterEnd: false,
        shift: {
          id: 'office-shift-overnight-18-02',
        },
        windowStart: new Date('2026-04-01T18:00:00.000Z'),
        windowEnd: new Date('2026-04-02T02:00:00.000Z'),
        startMinutes: 18 * 60,
        endMinutes: 2 * 60,
        businessDay: {
          dateKey: '2026-04-01',
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
        scheduledStartStr: '18:00',
        scheduledEndStr: '02:00',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps overnight shift visible after midnight for clock-out when today list is empty', async () => {
    const windowStart = new Date(Date.now() - 30 * 60_000);
    const windowEnd = new Date(Date.now() + 30 * 60_000);
    const windowPresentAttendance = {
      id: 'attendance-overnight-in',
      employeeId: 'employee-overnight',
      officeId: null,
      status: 'present',
      recordedAt: '2026-04-01T16:10:00.000Z',
      officeShiftId: 'office-shift-overnight',
      officeShift: {
        id: 'office-shift-overnight',
        startsAt: new Date(Date.now() - 2 * 60 * 60_000),
        endsAt: new Date(Date.now() + 30 * 60_000),
      },
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-overnight',
      role: 'office',
    });

    // After businessDate anchoring, today list can be empty right after midnight
    // because the attendance belongs to previous shift-start business date.
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([windowPresentAttendance]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(windowPresentAttendance);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(windowPresentAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: false,
      shift: {
        id: 'office-shift-overnight',
      },
      windowStart,
      windowEnd,
      startMinutes: 23 * 60,
      endMinutes: 3 * 60,
      businessDay: {
        dateKey: '2026-04-01',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: true,
      scheduledStartStr: '23:00',
      scheduledEndStr: '03:00',
    });
    expect(data.attendanceState).toMatchObject({
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      latestAttendance: expect.objectContaining({
        id: 'attendance-overnight-in',
        status: 'present',
      }),
    });
    expect(data.displayAttendances).toEqual([windowPresentAttendance]);
  });

  test('falls back to a same-business-day present attendance and keeps clock-out available', async () => {
    const windowStart = new Date(Date.now() - 2 * 60 * 60_000);
    const windowEnd = new Date(Date.now() + 2 * 60 * 60_000);
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
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(latestTodayAttendance);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(latestTodayAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      windowStart,
      windowEnd,
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
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(latestTodayAttendance);
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

  test('switches to upcoming same-day shift after overnight shift is already clocked out', async () => {
    const previousShiftClockedOut = {
      id: 'attendance-overnight-out',
      employeeId: 'employee-7',
      officeId: null,
      officeShiftId: 'office-shift-overnight',
      status: 'clocked_out',
      recordedAt: '2026-04-02T03:05:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-7',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([previousShiftClockedOut]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(previousShiftClockedOut);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(previousShiftClockedOut);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      shift: {
        id: 'office-shift-day',
      },
      windowStart: new Date('2026-04-02T06:00:00.000Z'),
      windowEnd: new Date('2026-04-02T14:00:00.000Z'),
      startMinutes: 14 * 60,
      endMinutes: 22 * 60,
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
      latestAttendance: previousShiftClockedOut,
    });
  });

  test('hides ended overnight shift when no current or upcoming shift exists today', async () => {
    const previousShiftClockedOut = {
      id: 'attendance-overnight-out-2',
      employeeId: 'employee-8',
      officeId: null,
      officeShiftId: 'office-shift-overnight',
      status: 'clocked_out',
      recordedAt: '2026-04-02T03:05:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-8',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([previousShiftClockedOut]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(previousShiftClockedOut);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(previousShiftClockedOut);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
      shift: null,
      windowStart: null,
      windowEnd: null,
      startMinutes: null,
      endMinutes: null,
      businessDay: {
        dateKey: '2026-04-02',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
      latestAttendance: previousShiftClockedOut,
    });
  });

  test('does not allow fallback clock-out when grace anchor is unavailable after overnight end', async () => {
    const openOvernightAttendance = {
      id: 'attendance-overnight-open-late',
      employeeId: 'employee-9',
      officeId: null,
      officeShiftId: 'office-shift-overnight',
      status: 'present',
      recordedAt: '2026-04-01T16:10:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-9',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(openOvernightAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
      shift: null,
      windowStart: null,
      windowEnd: null,
      startMinutes: null,
      endMinutes: null,
      businessDay: { dateKey: '2026-04-02' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.attendanceState).toMatchObject({
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
      latestAttendance: expect.objectContaining({
        id: 'attendance-overnight-open-late',
        status: 'present',
      }),
    });
    expect(data.displayAttendances).toEqual([openOvernightAttendance]);
  });

  test('prioritizes previous-shift open attendance during grace even when an upcoming shift exists', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-02T00:30:00.000Z'));

    const openPreviousShiftAttendance = {
      id: 'attendance-previous-shift-open',
      employeeId: 'employee-10',
      officeId: null,
      officeShiftId: 'office-shift-previous',
      status: 'present',
      recordedAt: '2026-04-02T03:10:00.000Z',
      officeShift: {
        id: 'office-shift-previous',
        startsAt: new Date('2026-04-01T18:00:00.000Z'),
        endsAt: new Date('2026-04-02T02:00:00.000Z'),
      },
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-10',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(openPreviousShiftAttendance);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      shift: {
        id: 'office-shift-upcoming',
      },
      windowStart: new Date('2099-04-02T10:00:00.000Z'),
      windowEnd: new Date('2099-04-02T18:00:00.000Z'),
      startMinutes: 18 * 60,
      endMinutes: 2 * 60,
      businessDay: { dateKey: '2099-04-02' },
    });

    try {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.attendanceState).toMatchObject({
        status: 'clocked_in',
        canClockIn: false,
        canClockOut: true,
      });
      expect(data.displayAttendances).toEqual([openPreviousShiftAttendance]);
      expect(data.scheduleContext).toMatchObject({
        scheduledStartStr: '18:00',
        scheduledEndStr: '02:00',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps display schedule context when prioritized previous open attendance has no shift relation', async () => {
    const openPreviousShiftAttendanceWithoutRelation = {
      id: 'attendance-previous-shift-open-no-relation',
      employeeId: 'employee-11',
      officeId: null,
      officeShiftId: 'office-shift-previous',
      status: 'present',
      recordedAt: '2026-04-02T03:10:00.000Z',
    };

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-11',
      role: 'office',
    });
    (getTodayOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (getOfficeAttendanceInRange as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeAttendanceInRange as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForDay as jest.Mock).mockResolvedValue(null);
    (getLatestOfficeAttendanceForEmployee as jest.Mock).mockResolvedValue(openPreviousShiftAttendanceWithoutRelation);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      shift: {
        id: 'office-shift-upcoming',
      },
      windowStart: new Date('2099-04-02T10:00:00.000Z'),
      windowEnd: new Date('2099-04-02T18:00:00.000Z'),
      startMinutes: 18 * 60,
      endMinutes: 2 * 60,
      businessDay: { dateKey: '2099-04-02' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.scheduleContext).toMatchObject({
      scheduledStartStr: '18:00',
      scheduledEndStr: '02:00',
      businessDateStr: '2099-04-02',
    });
  });
});
