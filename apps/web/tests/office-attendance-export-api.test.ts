import { NextRequest } from 'next/server';
import { endOfDay, startOfDay } from 'date-fns';
import { GET } from '../app/api/admin/office-attendance/export/route';
import { adminHasPermission, getAdminSession } from '@/lib/admin-auth';
import {
  getOfficeAttendanceExportBatch,
  getScheduledPaidMinutesForOfficeAttendance,
} from '@repo/database';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin-visibility', () => ({
  canAccessOfficeAttendance: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getOfficeAttendanceExportBatch: jest.fn(),
  getScheduledPaidMinutesForOfficeAttendance: jest.fn(),
  BUSINESS_TIMEZONE: 'Asia/Makassar',
  OFFICE_PAID_BREAK_MINUTES: 55,
}));

async function readResponseText(response: Response) {
  return await response.text();
}

describe('GET /api/admin/office-attendance/export', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getScheduledPaidMinutesForOfficeAttendance as jest.Mock).mockResolvedValue(8 * 60);
  });

  test('returns 401 when admin session is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(401);
  });

  test('returns 403 when permission is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: [], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(403);
  });

  test('returns 403 when office attendance access is blocked', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(403);
  });

  test('applies office and date filters and streams unified csv rows', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'in-1',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { location: { lat: -5.1, lng: 119.4 }, distanceMeters: 12, latenessMins: 5 },
          office: { id: 'office-1', name: 'HQ' },
          employee: { id: 'employee-1', fullName: 'Jane Doe', employeeNumber: 'EMP-1' },
        },
        {
          id: 'out-1',
          recordedAt: new Date('2026-04-01T17:00:00.000Z'),
          status: 'clocked_out',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { location: { lat: -5.2, lng: 119.5 }, distanceMeters: 8 },
          office: { id: 'office-1', name: 'HQ' },
          employee: { id: 'employee-1', fullName: 'Jane Doe', employeeNumber: 'EMP-1' },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-03&officeId=office-1'
      )
    );
    const csv = await readResponseText(response);
    const firstCall = (getOfficeAttendanceExportBatch as jest.Mock).mock.calls[0][0];

    expect(response.status).toBe(200);
    expect(firstCall.take).toBe(1000);
    expect(firstCall.cursor).toBeUndefined();
    expect(firstCall.where.officeId).toBe('office-1');
    expect(firstCall.where.recordedAt.gte.getTime()).toBe(startOfDay(new Date('2026-04-01')).getTime());
    expect(firstCall.where.recordedAt.lte.getTime()).toBe(endOfDay(new Date('2026-04-03')).getTime());
    expect(csv).toContain('Employee,Employee ID,Office,Business Date,Clock In Date,Clock In Time,Clock In Distance (m),Clock Out Date,Clock Out Time,Clock Out Distance (m),Paid Hours,Status,Lateness (mins)');
    expect(csv).toContain('"Jane Doe","EMP-1","HQ",2026-04-01,2026-04-01,16:05,12,2026-04-02,01:00,8,"8 hrs 0 mins",late,5');
  });

  test('exports open sessions with blank clock-out fields', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'in-open',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { location: { lat: -5.1, lng: 119.4 }, distanceMeters: 12 },
          office: { id: 'office-1', name: 'HQ' },
          employee: { id: 'employee-1', fullName: 'Jane Doe', employeeNumber: 'EMP-1' },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"Jane Doe","EMP-1","HQ",2026-04-01,2026-04-01,16:05,12,,,,"",clocked_in,');
  });
});
