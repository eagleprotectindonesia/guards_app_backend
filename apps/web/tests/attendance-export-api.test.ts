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
            startsAt: new Date('2026-04-01T08:00:00.000Z'),
            endsAt: new Date('2026-04-01T16:00:00.000Z'),
            graceMinutes: 2,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Morning Shift' },
            checkins: [
              { at: new Date('2026-04-01T11:00:00.000Z'), metadata: { lat: -5.1005, lng: 119.4005 } },
              { at: new Date('2026-04-01T12:30:00.000Z'), metadata: { lat: -5.101, lng: 119.401 } },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      'Employee ID,Employee,Department,Job Title,Office,Business Date,Day Name,Month,Assigned Shift,Shift Start Time,Shift End Time,Grace Minutes,Clock In Date,Clock In Time,Clock In Distance (m),Clock Out Date,Clock Out Time,Clock Out Distance (m),Paid Hours,Work Minutes,Overtime Minutes,Status,Lateness (mins),Late Flag,Early Leave Minutes,Missed Punch Flag,Manual Edit Flag,Edited By,Edit Reason'
    );
    expect(csv).toContain(
      '"EMP-001","Jane Doe","Operations","Supervisor","HQ",2026-04-01,"Wednesday","April","Morning Shift","08:00","16:00",2,2026-04-01,16:05,0,2026-04-01,20:30,157,"4 hrs 25 mins",265,0,present,,No,215,No,,,'
    );
  });

  test('does not set clock out and paid/work fields when shift is not completed', async () => {
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
            startsAt: new Date('2026-04-01T08:00:00.000Z'),
            endsAt: new Date('2026-04-01T16:00:00.000Z'),
            graceMinutes: 2,
            status: 'in_progress',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Morning Shift' },
            checkins: [{ at: new Date('2026-04-01T12:30:00.000Z'), metadata: { lat: -5.101, lng: 119.401 } }],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      '"emp-1","Jane Doe","","","HQ",2026-04-01,"Wednesday","April","Morning Shift","08:00","16:00",2,2026-04-01,16:05,0,,,,"","",,present,,No,,Yes,,,'
    );
  });

  test('caps work minutes by shift length', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-3',
          recordedAt: new Date('2026-04-01T08:00:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: { id: 'emp-3', employeeNumber: 'EMP-003', fullName: 'John Doe', department: 'Ops', jobTitle: 'Guard' },
          shift: {
            date: new Date('2026-04-01T00:00:00.000Z'),
            startsAt: new Date('2026-04-01T08:00:00.000Z'),
            endsAt: new Date('2026-04-01T16:00:00.000Z'),
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            checkins: [{ at: new Date('2026-04-01T20:00:00.000Z'), metadata: { lat: -5.1, lng: 119.4 } }],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      '"John Doe","Ops","Guard","EMP-003","HQ","2026/04/01","2026/04/01","16:00","2026/04/02","04:00",0,0,"8 hrs 0 mins",480,present'
    );
  });

  test('keeps paid/work fields blank when completed shift has no checkins', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-4',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: { id: 'emp-4', employeeNumber: 'EMP-004', fullName: 'No Checkin', department: 'Ops', jobTitle: 'Guard' },
          shift: {
            date: new Date('2026-04-01T00:00:00.000Z'),
            startsAt: new Date('2026-04-01T08:00:00.000Z'),
            endsAt: new Date('2026-04-01T16:00:00.000Z'),
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            checkins: [],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      '"No Checkin","Ops","Guard","EMP-004","HQ","2026/04/01","2026/04/01","16:05","","",0,"","","",present'
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
