import { NextRequest } from 'next/server';
import { endOfDay, startOfDay } from 'date-fns';
import { GET } from '../app/api/admin/office-attendance/export/route';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import {
  getEmployeeOfficeDayOverrideChangelogsForDates,
  getOfficeAttendanceExportBatch,
  getLatestOfficeShiftEditChangelogs,
  getScheduledPaidMinutesForOfficeAttendance,
  listLeaveRequestsOverlappingOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminAuthSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin-visibility', () => ({
  canAccessOfficeAttendance: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getEmployeeOfficeDayOverrideChangelogsForDates: jest.fn(),
  getOfficeAttendanceExportBatch: jest.fn(),
  getLatestOfficeShiftEditChangelogs: jest.fn(),
  getScheduledPaidMinutesForOfficeAttendance: jest.fn(),
  listLeaveRequestsOverlappingOfficeAttendance: jest.fn(),
  resolveOfficeAttendanceContextForEmployee: jest.fn(),
  BUSINESS_TIMEZONE: 'Asia/Makassar',
  OFFICE_PAID_BREAK_MINUTES: 55,
}));

async function readResponseText(response: Response) {
  return await response.text();
}

describe('GET /api/admin/office-attendance/export', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getEmployeeOfficeDayOverrideChangelogsForDates as jest.Mock).mockResolvedValue([]);
    (getLatestOfficeShiftEditChangelogs as jest.Mock).mockResolvedValue([]);
    (getScheduledPaidMinutesForOfficeAttendance as jest.Mock).mockResolvedValue(8 * 60);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValue([]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({ windowEnd: null });
  });

  test('returns 401 when admin session is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(401);
  });

  test('returns 403 when permission is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: [], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(403);
  });

  test('returns 403 when office attendance access is blocked', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ permissions: ['attendance:view'], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));

    expect(response.status).toBe(403);
  });

  test('applies office and date filters and streams unified csv rows', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
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
          officeShift: {
            id: 'shift-1',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
            lastUpdatedBy: { name: 'Shift Admin' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
        {
          id: 'out-1',
          recordedAt: new Date('2026-04-01T17:00:00.000Z'),
          status: 'clocked_out',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { location: { lat: -5.2, lng: 119.5 }, distanceMeters: 8 },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: {
            id: 'shift-1',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
            lastUpdatedBy: { name: 'Shift Admin' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestOfficeShiftEditChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        action: 'UPDATE',
        entityId: 'shift-1',
        admin: { name: 'Shift Admin' },
        details: {
          changes: {
            startsAt: {
              from: '2026-04-01T08:00:00.000Z',
              to: '2026-04-01T08:30:00.000Z',
            },
            note: {
              from: null,
              to: 'Adjusted for meeting',
            },
          },
        },
      },
    ]);

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
    expect(firstCall.where.businessDate.gte.getTime()).toBe(startOfDay(new Date('2026-04-01')).getTime());
    const expectedDateEnd = endOfDay(new Date('2026-04-03'));
    const todayEnd = endOfDay(new Date());
    expect(firstCall.where.businessDate.lte.getTime()).toBe(
      Math.min(expectedDateEnd.getTime(), todayEnd.getTime())
    );
    expect(getLatestOfficeShiftEditChangelogs).toHaveBeenCalledWith(['shift-1']);
    expect(csv).toContain(
      'Employee ID,Employee,Department,Job Title,Office,Business Date,Day Name,Month,Assigned Shift,Shift Start Time,Shift End Time,Grace Minutes,Clock In Date,Clock In Time,Clock In Distance (m),Clock Out Date,Clock Out Time,Clock Out Distance (m),Paid Hours,Work Minutes,Overtime Minutes,Leave Type,Leave Status,Status,Lateness (mins),Late Flag,Early Leave Minutes,Missed Punch Flag,Manual Edit Flag,Edited By,Edit Reason'
    );
    expect(csv).toContain(
      '"EMP-1","Jane Doe","Operations","Supervisor","HQ",2026-04-01,"Wednesday","April","Morning Shift","08:00","17:00",0,2026-04-01,16:05,12,2026-04-02,01:00,8,"8 hrs 0 mins",480,0,"","",late,5,Yes,0,No,,"Shift Admin","Shift changes"'
    );
  });

  test('fills Edited By for create changelog and classifies as Shift changes', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'in-create',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { distanceMeters: 12 },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: {
            id: 'shift-create',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
            lastUpdatedBy: { name: 'Ignored Admin' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestOfficeShiftEditChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        action: 'CREATE',
        entityId: 'shift-create',
        admin: { name: 'Create Admin' },
        details: {
          note: 'Initial import',
        },
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(',,"Create Admin","Shift changes"\n');
  });

  test('classifies off to shift transition as Dayoff changes and uses override actor', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'in-dayoff',
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { distanceMeters: 12 },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: {
            id: 'shift-dayoff',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
            lastUpdatedBy: { name: 'Ignored Shift Admin' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (getLatestOfficeShiftEditChangelogs as jest.Mock).mockResolvedValueOnce([
      {
        action: 'UPDATE',
        entityId: 'shift-dayoff',
        admin: { name: 'Shift Admin' },
        details: {
          changes: {
            note: {
              from: null,
              to: 'Adjusted',
            },
          },
        },
      },
    ]);
    (getEmployeeOfficeDayOverrideChangelogsForDates as jest.Mock).mockResolvedValueOnce([
      {
        action: 'CREATE',
        entityId: 'override-off',
        admin: { name: 'Off Admin' },
        details: {
          employeeId: 'employee-1',
          date: '2026-04-01',
          overrideType: 'off',
        },
      },
      {
        action: 'CREATE',
        entityId: 'override-shift',
        admin: { name: 'Override Admin' },
        details: {
          employeeId: 'employee-1',
          date: '2026-04-01',
          overrideType: 'shift_override',
        },
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain(',,"Override Admin","Dayoff changes"\n');
  });

  test('exports open sessions with blank clock-out fields', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
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
          officeShift: {
            id: 'shift-1',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-1","Jane Doe","Operations","Supervisor","HQ",2026-04-01');
    expect(csv).toContain('Leave Type,Leave Status,Status');
    expect(csv).toContain('clocked_in');
  });

  test('exports fallback paid hours and work minutes for previous-business-day open sessions', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getScheduledPaidMinutesForOfficeAttendance as jest.Mock).mockResolvedValue(8 * 60);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      windowEnd: new Date('2026-04-01T17:00:00.000Z'),
    });
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'in-open-past',
          businessDate: new Date('2026-04-01T00:00:00.000Z'),
          recordedAt: new Date('2026-04-01T08:05:00.000Z'),
          status: 'present',
          employeeId: 'employee-1',
          officeId: 'office-1',
          metadata: { distanceMeters: 12 },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: {
            id: 'shift-1',
            officeShiftType: { name: 'Morning Shift', startTime: '08:00', endTime: '17:00' },
          },
          employee: {
            id: 'employee-1',
            fullName: 'Jane Doe',
            employeeNumber: 'EMP-1',
            department: 'Operations',
            jobTitle: 'Supervisor',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"8 hrs 0 mins",480,0,"","",clocked_in');
    expect(csv).toContain(',Yes,,');
  });

  test('exports absent rows with session detail columns left blank', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'absent-1',
          businessDate: new Date('2026-04-01T00:00:00.000Z'),
          recordedAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'absent',
          employeeId: 'employee-2',
          officeId: 'office-1',
          metadata: { note: 'Auto finalized absent (worker)' },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: null,
          employee: {
            id: 'employee-2',
            fullName: 'John Absent',
            employeeNumber: 'EMP-2',
            department: 'Operations',
            jobTitle: 'Staff',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-2","John Absent","Operations","Staff","HQ",2026-04-01');
    expect(csv).toContain('"Unpaid Leave","None",absent');
  });

  test('exports leave rows with session detail columns left blank and leave status', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'leave-1',
          businessDate: new Date('2026-04-01T00:00:00.000Z'),
          recordedAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'leave',
          employeeId: 'employee-3',
          officeId: 'office-1',
          metadata: { note: 'Approved leave' },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: null,
          employee: {
            id: 'employee-3',
            fullName: 'Lia Leave',
            employeeNumber: 'EMP-3',
            department: 'Operations',
            jobTitle: 'Staff',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValueOnce([
      {
        id: 'leave-request-1',
        employeeId: 'employee-3',
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        endDate: new Date('2026-04-01T00:00:00.000Z'),
        reason: 'sick',
        status: 'approved',
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-3","Lia Leave","Operations","Staff","HQ",2026-04-01');
    expect(csv).toContain('"Sick Leave","Approved",leave');
  });

  test('exports pending_leave rows with session detail columns left blank and pending_leave status', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'pending-leave-1',
          businessDate: new Date('2026-04-01T00:00:00.000Z'),
          recordedAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'pending_leave',
          employeeId: 'employee-4',
          officeId: 'office-1',
          metadata: { note: 'Pending leave' },
          office: { id: 'office-1', name: 'HQ' },
          officeShift: null,
          employee: {
            id: 'employee-4',
            fullName: 'Pia Pending',
            employeeNumber: 'EMP-4',
            department: 'Operations',
            jobTitle: 'Staff',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValueOnce([
      {
        id: 'leave-request-2',
        employeeId: 'employee-4',
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        endDate: new Date('2026-04-01T00:00:00.000Z'),
        reason: 'annual',
        status: 'pending',
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-01&endDate=2026-04-01')
    );
    const csv = await readResponseText(response);

    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-4","Pia Pending","Operations","Staff","HQ",2026-04-01');
    expect(csv).toContain('"Annual Leave","Pending",pending_leave');
  });

  test('exports absent rows as Unpaid Leave with Rejected when overlapping rejected leave exists', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'absent-2',
          businessDate: new Date('2026-04-02T00:00:00.000Z'),
          recordedAt: new Date('2026-04-02T00:00:00.000Z'),
          status: 'absent',
          employeeId: 'employee-5',
          officeId: 'office-1',
          metadata: null,
          office: { id: 'office-1', name: 'HQ' },
          officeShift: null,
          employee: {
            id: 'employee-5',
            fullName: 'Rex Reject',
            employeeNumber: 'EMP-5',
            department: 'Operations',
            jobTitle: 'Staff',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (listLeaveRequestsOverlappingOfficeAttendance as jest.Mock).mockResolvedValueOnce([
      {
        id: 'leave-request-3',
        employeeId: 'employee-5',
        startDate: new Date('2026-04-02T00:00:00.000Z'),
        endDate: new Date('2026-04-02T00:00:00.000Z'),
        reason: 'annual',
        status: 'rejected',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/office-attendance/export?startDate=2026-04-02&endDate=2026-04-02')
    );
    const csv = await readResponseText(response);
    expect(response.status).toBe(200);
    expect(csv).toContain('"EMP-5","Rex Reject","Operations","Staff","HQ",2026-04-02');
    expect(csv).toContain('"Unpaid Leave","Rejected"');
  });

  test('clamps future endDate filter to today end-of-day', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock).mockResolvedValueOnce([]);

    await GET(new NextRequest('http://localhost/api/admin/office-attendance/export?endDate=2099-01-01'));
    const firstCall = (getOfficeAttendanceExportBatch as jest.Mock).mock.calls[0][0];

    expect(firstCall.where.businessDate.lte.getTime()).toBe(endOfDay(new Date()).getTime());
  });

  test('defaults endDate filter to today end-of-day when not provided', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({
      permissions: ['attendance:view'],
      isSuperAdmin: false,
      rolePolicy: { attendance: { scope: 'all' } },
    });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getOfficeAttendanceExportBatch as jest.Mock).mockResolvedValueOnce([]);

    await GET(new NextRequest('http://localhost/api/admin/office-attendance/export'));
    const firstCall = (getOfficeAttendanceExportBatch as jest.Mock).mock.calls[0][0];

    expect(firstCall.where.businessDate.lte.getTime()).toBe(endOfDay(new Date()).getTime());
  });
});
