import { NextRequest } from 'next/server';
import { GET } from '../app/api/admin/leave-requests/export/route';
import { adminHasPermission, getAdminSession } from '@/lib/admin-auth';
import { resolveLeaveRequestAccessContext, buildVisibleEmployeeWhereClause } from '@/lib/auth/leave-ownership';
import { listEmployeeLeaveRequestsForAdmin } from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminSession: jest.fn(),
}));

jest.mock('@/lib/auth/leave-ownership', () => ({
  resolveLeaveRequestAccessContext: jest.fn(),
  buildVisibleEmployeeWhereClause: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  listEmployeeLeaveRequestsForAdmin: jest.fn(),
}));

describe('GET /api/admin/leave-requests/export', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({ employeeRoleFilter: undefined });
    (buildVisibleEmployeeWhereClause as jest.Mock).mockResolvedValue(undefined);
  });

  test('returns 401 when admin session is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/leave-requests/export'));

    expect(response.status).toBe(401);
  });

  test('returns 403 when permission is missing', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ permissions: [], isSuperAdmin: false, rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/admin/leave-requests/export'));

    expect(response.status).toBe(403);
  });

  test('applies filters and sort to export query', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin-1', permissions: ['leave-requests:view'], rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (listEmployeeLeaveRequestsForAdmin as jest.Mock).mockResolvedValue([]);

    await GET(
      new NextRequest(
        'http://localhost/api/admin/leave-requests/export?statuses=approved,pending&reasons=annual&categories=family&employeeId=emp-1&startDate=2026-04-01&endDate=2026-04-03&sortBy=status&sortOrder=asc'
      )
    );

    const firstCall = (listEmployeeLeaveRequestsForAdmin as jest.Mock).mock.calls[0][0];
    expect(firstCall.statuses).toEqual(['approved', 'pending']);
    expect(firstCall.reasons).toEqual(expect.arrayContaining(['annual', 'family_marriage']));
    expect(firstCall.employeeId).toBe('emp-1');
    expect(firstCall.startDate).toBe('2026-04-01');
    expect(firstCall.endDate).toBe('2026-04-03');
    expect(firstCall.sortBy).toBe('status');
    expect(firstCall.sortOrder).toBe('asc');
  });

  test('omits date bounds when startDate and endDate are not provided', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin-1', permissions: ['leave-requests:view'], rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (listEmployeeLeaveRequestsForAdmin as jest.Mock).mockResolvedValue([]);

    await GET(new NextRequest('http://localhost/api/admin/leave-requests/export?statuses=approved'));

    const firstCall = (listEmployeeLeaveRequestsForAdmin as jest.Mock).mock.calls[0][0];
    expect(firstCall.startDate).toBeUndefined();
    expect(firstCall.endDate).toBeUndefined();
  });

  test('exports csv with requested headers and manager-first approval mapping', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin-1', permissions: ['leave-requests:view'], rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (listEmployeeLeaveRequestsForAdmin as jest.Mock).mockResolvedValue([
      {
        id: 'lr-1',
        reason: 'annual',
        status: 'approved',
        startDate: new Date('2026-04-10T00:00:00.000Z'),
        endDate: new Date('2026-04-12T00:00:00.000Z'),
        employeeNote: 'Need break',
        adminNote: 'Approved by manager',
        policySnapshot: { workingDays: 2 },
        reviewedBy: { name: 'Final Reviewer' },
        reviewedAt: new Date('2026-04-09T03:00:00.000Z'),
        managerApprovedBy: { name: 'Manager One' },
        managerApprovedAt: new Date('2026-04-09T01:30:00.000Z'),
        employee: {
          id: 'emp-1',
          employeeNumber: 'EMP-1',
          fullName: 'Alice Doe',
          department: 'Operations',
        },
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/leave-requests/export'));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain(
      'Employee ID,Employee Name,Department,Leave Type,Leave Start Date,Leave End Date,Number of Days,Leave Status,Approved By,Approval Date,Request Notes,Approval/rejection notes'
    );
    expect(csv).toContain('"EMP-1","Alice Doe","Operations","Annual Leave","2026-04-10","2026-04-12",2,"Approved","Manager One"');
  });

  test('uses inclusive calendar days fallback and escapes notes', async () => {
    (getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin-1', permissions: ['leave-requests:view'], rolePolicy: {} });
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (listEmployeeLeaveRequestsForAdmin as jest.Mock).mockResolvedValue([
      {
        id: 'lr-2',
        reason: 'sick',
        status: 'rejected',
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        endDate: new Date('2026-05-03T00:00:00.000Z'),
        employeeNote: 'Need "rest", urgent',
        adminNote: 'No, "insufficient" docs',
        policySnapshot: null,
        reviewedBy: { name: 'Reviewer' },
        reviewedAt: new Date('2026-04-30T02:00:00.000Z'),
        managerApprovedBy: null,
        managerApprovedAt: null,
        employee: {
          id: 'emp-2',
          employeeNumber: null,
          fullName: 'Bob Roe',
          department: null,
        },
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/leave-requests/export'));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain('"emp-2","Bob Roe","","Sick Leave","2026-05-01","2026-05-03",3,"Rejected"');
    expect(csv).toContain('"Need ""rest"", urgent"');
    expect(csv).toContain('"No, ""insufficient"" docs"');
  });
});
