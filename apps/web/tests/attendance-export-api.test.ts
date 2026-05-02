import { NextRequest } from 'next/server';
import { endOfDay, startOfDay } from 'date-fns';
import { GET } from '../app/api/admin/attendance/export/route';
import { adminHasPermission, getAdminSession } from '@/lib/admin-auth';
import { applyAttendanceVisibilityScope } from '@/lib/auth/admin-visibility';
import { getAttendanceExportBatch } from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin-visibility', () => ({
  applyAttendanceVisibilityScope: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getAttendanceExportBatch: jest.fn(),
}));

async function readResponseText(response: Response) {
  return await response.text();
}

describe('GET /api/admin/attendance/export', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (applyAttendanceVisibilityScope as jest.Mock).mockImplementation(where => where);
  });

  test('returns 401 when admin session is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));

    expect(response.status).toBe(401);
  });

  test('returns 403 when permission is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: [], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));

    expect(response.status).toBe(403);
  });

  test('uses last check-in as clock out when shift is completed', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-1',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: {
            id: 'emp-1',
            employeeNumber: 'EMP-001',
            fullName: 'Jane Doe',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
          shift: {
            date: new Date('2026-04-01T00:00:00.000Z'),
            status: 'completed',
            site: { name: 'HQ' },
            checkins: [{ at: new Date('2026-04-01T11:00:00.000Z') }, { at: new Date('2026-04-01T12:30:00.000Z') }],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      'Employee,Department,Job Title,Employee ID,Site,Shift Date,Clock In Date,Clock In Time,Clock Out Date,Clock Out Time,Status,Clock In Latitude,Clock In Longitude'
    );
    expect(csv).toContain(
      '"Jane Doe","Operations","Supervisor","EMP-001","HQ","2026/04/01","2026/04/01","16:05","2026/04/01","20:30",present,-5.100000,119.400000'
    );
  });

  test('does not set clock out when shift is not completed', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-2',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: { id: 'emp-1', employeeNumber: null, fullName: 'Jane Doe', department: null, jobTitle: null },
          shift: {
            date: new Date('2026-04-01T00:00:00.000Z'),
            status: 'in_progress',
            site: { name: 'HQ' },
            checkins: [{ at: new Date('2026-04-01T12:30:00.000Z') }],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      '"Jane Doe","","","emp-1","HQ","2026/04/01","2026/04/01","16:05","","",present,-5.100000,119.400000'
    );
  });

  test('applies date and employee number filters to attendance export query', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock).mockResolvedValueOnce([]);

    await GET(
      new NextRequest(
        'http://localhost/api/admin/attendance/export?startDate=2026-04-01&endDate=2026-04-03&employeeNumber=EMP-002'
      )
    );

    const firstCall = (getAttendanceExportBatch as jest.Mock).mock.calls[0][0];
    expect(firstCall.take).toBe(1000);
    expect(firstCall.cursor).toBeUndefined();
    expect(firstCall.where.employee.employeeNumber).toBe('EMP-002');
    expect(firstCall.where.recordedAt.gte.getTime()).toBe(startOfDay(new Date('2026-04-01')).getTime());
    expect(firstCall.where.recordedAt.lte.getTime()).toBe(endOfDay(new Date('2026-04-03')).getTime());
  });
});
