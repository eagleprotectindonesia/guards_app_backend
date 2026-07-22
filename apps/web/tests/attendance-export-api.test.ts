import { NextRequest } from 'next/server';
import { endOfDay, startOfDay } from 'date-fns';
import { GET } from '../app/api/admin/attendance/export/route';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { applyAttendanceVisibilityScope } from '@/lib/auth/admin-visibility';
import {
  getAttendanceExportBatch,
  getEmployeeOnsiteDayOffChangelogsForDates,
  getLatestGuardShiftEditChangelogs,
  getLatestReplacementChangelogs,
  listLeaveRequestsOverlappingOfficeAttendance,
} from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminAuthSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin-visibility', () => ({
  applyAttendanceVisibilityScope: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getAttendanceExportBatch: jest.fn(),
  getEmployeeOnsiteDayOffChangelogsForDates: jest.fn(),
  getLatestGuardShiftEditChangelogs: jest.fn(),
  getLatestReplacementChangelogs: jest.fn(),
  listLeaveRequestsOverlappingOfficeAttendance: jest.fn(),
}));

async function readResponseText(response: Response) {
  return await response.text();
}

describe('GET /api/admin/attendance/export', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (applyAttendanceVisibilityScope as jest.Mock).mockImplementation(where => where);
    (getEmployeeOnsiteDayOffChangelogsForDates as jest.Mock).mockResolvedValue([]);
    (getLatestGuardShiftEditChangelogs as jest.Mock).mockResolvedValue([]);
    (getLatestReplacementChangelogs as jest.Mock).mockResolvedValue([]);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValue([]);
  });

  test('returns 401 when admin session is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));

    expect(response.status).toBe(401);
  });

  test('returns 403 when permission is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: [], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));

    expect(response.status).toBe(403);
  });

  test('uses last check-in as clock out when shift is completed', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
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
            id: 'shift-1',
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
    (getLatestGuardShiftEditChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        action: 'UPDATE',
        entityId: 'shift-1',
        admin: { name: 'Shift Admin' },
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(
      'Employee ID,Employee,Department,Job Title,Office,Business Date,Day Name,Month,Assigned Shift,Shift Start Time,Shift End Time,Grace Minutes,Clock In Date,Clock In Time,Clock In Distance (m),Clock Out Date,Clock Out Time,Clock Out Distance (m),Paid Hours,Work Minutes,Overtime Minutes,Leave Type,Leave Status,Status,Lateness (mins),Late Flag,Early Leave Minutes,Missed Punch Flag,Manual Edit Flag,Edited By,Edit Reason'
    );
    expect(csv).toContain('"EMP-001","Jane Doe","Operations","Supervisor","HQ",2026-04-01');
    expect(csv).toContain(',"Shift Admin","Shift changes"');
    expect(csv).toContain('Leave Type,Leave Status,Status');
    expect(csv).toContain('present');
  });

  test('classifies deleted onsite day off as Dayoff changes', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-dayoff',
          shiftId: 'shift-dayoff',
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
            id: 'shift-dayoff',
            date: new Date('2026-04-01T00:00:00.000Z'),
            startsAt: new Date('2026-04-01T08:00:00.000Z'),
            endsAt: new Date('2026-04-01T16:00:00.000Z'),
            graceMinutes: 2,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Morning Shift' },
            checkins: [{ at: new Date('2026-04-01T12:30:00.000Z'), metadata: { lat: -5.101, lng: 119.401 } }],
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestGuardShiftEditChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        action: 'CREATE',
        entityId: 'shift-dayoff',
        admin: { name: 'Shift Admin' },
      },
    ]);
    (getEmployeeOnsiteDayOffChangelogsForDates as jest.Mock).mockResolvedValueOnce([
      {
        action: 'CREATE',
        entityId: 'dayoff-1',
        admin: { name: 'Off Admin' },
        details: {
          employeeId: 'emp-1',
          date: '2026-04-01',
          dayOffType: 'off',
        },
      },
      {
        action: 'DELETE',
        entityId: 'dayoff-1',
        admin: { name: 'Restore Admin' },
        details: {
          employeeId: 'emp-1',
          date: '2026-04-01',
          dayOffType: 'off',
        },
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(',"Restore Admin","Dayoff changes"');
  });

  test('does not set clock out and paid/work fields when shift is not completed', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
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
    expect(csv).toContain('"emp-1","Jane Doe","","","HQ",2026-04-01');
    expect(csv).toContain('present');
  });

  test('caps work minutes by shift length', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
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
    expect(csv).toContain('"EMP-003","John Doe","Ops","Guard","HQ",2026-04-01');
    expect(csv).toContain('present');
  });

  test('keeps paid/work fields blank when completed shift has no checkins', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
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
    expect(csv).toContain('"EMP-004","No Checkin","Ops","Guard","HQ",2026-04-01');
    expect(csv).toContain('present');
  });

  test('includes leave metadata for absent rows with overlapping leave requests', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-5',
          recordedAt: new Date('2026-04-02T00:00:00.000Z'),
          status: 'absent',
          metadata: null,
          employee: {
            id: 'emp-5',
            employeeNumber: 'EMP-005',
            fullName: 'Leave Guard',
            department: 'Ops',
            jobTitle: 'Guard',
          },
          shift: {
            date: new Date('2026-04-02T00:00:00.000Z'),
            startsAt: new Date('2026-04-02T08:00:00.000Z'),
            endsAt: new Date('2026-04-02T16:00:00.000Z'),
            graceMinutes: 0,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Day Shift' },
            checkins: [],
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValueOnce([
      {
        id: 'leave-1',
        employeeId: 'emp-5',
        startDate: new Date('2026-04-02T00:00:00.000Z'),
        endDate: new Date('2026-04-02T00:00:00.000Z'),
        reason: 'sick',
        status: 'approved',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export?startDate=2026-04-02&endDate=2026-04-02'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-005","Leave Guard","Ops","Guard","HQ",2026-04-02');
    expect(csv).toContain('"Sick Leave","Approved",absent');
  });

  test('falls back to Unpaid Leave when absent rows have no overlapping leave request', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-6',
          recordedAt: new Date('2026-04-03T00:00:00.000Z'),
          status: 'absent',
          metadata: null,
          employee: {
            id: 'emp-6',
            employeeNumber: 'EMP-006',
            fullName: 'No Leave Guard',
            department: 'Ops',
            jobTitle: 'Guard',
          },
          shift: {
            date: new Date('2026-04-03T00:00:00.000Z'),
            startsAt: new Date('2026-04-03T08:00:00.000Z'),
            endsAt: new Date('2026-04-03T16:00:00.000Z'),
            graceMinutes: 0,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Day Shift' },
            checkins: [],
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export?startDate=2026-04-03&endDate=2026-04-03'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-006","No Leave Guard","Ops","Guard","HQ",2026-04-03');
    expect(csv).toContain('"Unpaid Leave","None",absent');
  });

  test('includes replacement details for replaced shifts', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-7',
          recordedAt: new Date('2026-04-04T08:05:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: {
            id: 'emp-7',
            employeeNumber: 'EMP-007',
            fullName: 'Replacement Guard',
            department: 'Ops',
            jobTitle: 'Guard',
          },
          shift: {
            id: 'shift-7',
            date: new Date('2026-04-04T00:00:00.000Z'),
            startsAt: new Date('2026-04-04T08:00:00.000Z'),
            endsAt: new Date('2026-04-04T16:00:00.000Z'),
            graceMinutes: 0,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Day Shift' },
            checkins: [
              { at: new Date('2026-04-04T08:05:00.000Z'), metadata: { location: { lat: -5.1, lng: 119.4 } } },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestReplacementChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        entityId: 'shift-7',
        details: {
          method: 'REPLACEMENT',
          previousEmployeeName: 'Original Guard',
          replacementReason: 'Sick',
          replacementNotes: null,
        },
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export?startDate=2026-04-04&endDate=2026-04-04'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('Replacement Status,Previous Scheduled Guard,Replacement Reason');
    expect(csv).toContain('true,"Original Guard","Sick"');
  });

  test('leaves replacement columns empty for non-replaced shifts', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (getAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'att-8',
          recordedAt: new Date('2026-04-05T08:05:00.000Z'),
          status: 'present',
          metadata: { location: { lat: -5.1, lng: 119.4 } },
          employee: {
            id: 'emp-8',
            employeeNumber: 'EMP-008',
            fullName: 'Normal Guard',
            department: 'Ops',
            jobTitle: 'Guard',
          },
          shift: {
            id: 'shift-8',
            date: new Date('2026-04-05T00:00:00.000Z'),
            startsAt: new Date('2026-04-05T08:00:00.000Z'),
            endsAt: new Date('2026-04-05T16:00:00.000Z'),
            graceMinutes: 0,
            status: 'completed',
            site: { name: 'HQ', latitude: -5.1, longitude: 119.4 },
            shiftType: { name: 'Day Shift' },
            checkins: [
              { at: new Date('2026-04-05T08:05:00.000Z'), metadata: { location: { lat: -5.1, lng: 119.4 } } },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestReplacementChangelogs as jest.Mock).mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/admin/attendance/export?startDate=2026-04-05&endDate=2026-04-05'));
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('false,"",""');
  });
});
