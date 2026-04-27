import { GET } from '../app/api/employee/my/announcements/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { listActiveOfficeMemosForEmployee, listFutureHolidayAnnouncementsForEmployee } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  listFutureHolidayAnnouncementsForEmployee: jest.fn(),
  listActiveOfficeMemosForEmployee: jest.fn(),
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

describe('GET /api/employee/my/announcements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns unauthorized when employee is missing', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  test('returns mixed holiday + office memo announcements sorted by startsAt then createdAt', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      department: 'Finance',
    });

    (listFutureHolidayAnnouncementsForEmployee as jest.Mock).mockResolvedValue([
      {
        id: 'holiday-1',
        title: 'National Holiday',
        note: 'Office closed',
        startDate: new Date('2026-05-10T00:00:00.000Z'),
        endDate: new Date('2026-05-10T00:00:00.000Z'),
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        type: 'holiday',
        isPaid: true,
        affectsAttendance: false,
        notificationRequired: true,
        scope: 'all',
      },
    ]);

    (listActiveOfficeMemosForEmployee as jest.Mock).mockResolvedValue([
      {
        id: 'memo-older',
        title: 'Reminder',
        message: 'Bring your ID card',
        startDate: new Date('2026-05-09T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        scope: 'department',
      },
      {
        id: 'memo-newer',
        title: 'Security Brief',
        message: 'Check briefing room at 09:00',
        startDate: new Date('2026-05-09T00:00:00.000Z'),
        endDate: new Date('2026-05-11T00:00:00.000Z'),
        createdAt: new Date('2026-04-25T00:00:00.000Z'),
        scope: 'all',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listFutureHolidayAnnouncementsForEmployee).toHaveBeenCalledTimes(1);
    expect(listActiveOfficeMemosForEmployee).toHaveBeenCalledTimes(1);
    expect(data.announcements).toHaveLength(3);

    expect(data.announcements[0]).toMatchObject({
      id: 'office_memo:memo-newer',
      kind: 'office_memo',
      meta: { officeMemoId: 'memo-newer', scope: 'all' },
    });
    expect(data.announcements[1]).toMatchObject({
      id: 'office_memo:memo-older',
      kind: 'office_memo',
      meta: { officeMemoId: 'memo-older', scope: 'department' },
    });
    expect(data.announcements[2]).toMatchObject({
      id: 'holiday:holiday-1',
      kind: 'holiday',
      meta: { holidayEntryId: 'holiday-1' },
    });
  });
});
