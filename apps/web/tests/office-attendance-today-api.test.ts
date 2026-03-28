import { GET } from '../app/api/employee/my/office-attendance/today/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTodayOfficeAttendance, resolveOfficeWorkScheduleContextForEmployee } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getTodayOfficeAttendance: jest.fn(),
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
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
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
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: true,
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
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: false,
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
    expect(data.scheduleContext).toMatchObject({
      isWorkingDay: false,
      businessDateStr: '2026-03-29',
      scheduledStartStr: null,
      scheduledEndStr: null,
    });
  });
});
