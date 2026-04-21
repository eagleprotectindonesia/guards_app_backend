import {
  resolveEmployeeOwnerAdminId,
  resolveEmployeeVisibilityAccessContext,
  resolveLeaveRequestAccessContext,
} from '@/lib/auth/leave-ownership';
import { getAdminOwnershipSummaryByAdminId, getAllActiveAdminOwnershipAssignments } from '@repo/database';

jest.mock('@repo/database', () => ({
  getAdminOwnershipSummaryByAdminId: jest.fn(),
  getAllActiveAdminOwnershipAssignments: jest.fn(),
  normalizeDepartmentScopeKey: (value?: string | null) => {
    if (!value) return null;
    const normalized = value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
  },
}));

const defaultRolePolicy = {
  employees: { scope: 'all' as const },
  attendance: { scope: 'all' as const },
};

describe('ownership resolver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('super admin bypasses role and ownership filters', async () => {
    const context = await resolveLeaveRequestAccessContext({
      id: 'super-admin',
      isSuperAdmin: true,
      rolePolicy: {
        employees: { scope: 'on_site_only' },
        attendance: { scope: 'shift_only' },
      },
    });

    expect(context.mode).toBe('super_admin');
    expect(context.employeeRoleFilter).toBeUndefined();
    expect(context.isEmployeeVisible({ id: 'employee-1', role: 'office' })).toBe(true);
  });

  test('resolves leave ownership with normalized department matching', async () => {
    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-1', includeFallbackLeaveQueue: false },
      assignments: [],
    });
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'assign-1',
        adminId: 'admin-1',
        domain: 'leave',
        departmentKey: 'operations',
        officeId: null,
        priority: 100,
        isActive: true,
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
    ]);

    const context = await resolveLeaveRequestAccessContext({
      id: 'admin-1',
      isSuperAdmin: false,
      rolePolicy: defaultRolePolicy,
    });

    expect(getAdminOwnershipSummaryByAdminId).toHaveBeenCalledWith('admin-1', 'leave');
    expect(getAllActiveAdminOwnershipAssignments).toHaveBeenCalledWith('leave');
    expect(context.mode).toBe('ownership_scope');
    expect(
      context.isEmployeeVisible({
        id: 'employee-1',
        role: 'office',
        department: '  OPERATIONS   ',
      })
    ).toBe(true);
    expect(
      context.isEmployeeVisible({
        id: 'employee-2',
        role: 'office',
        department: 'Finance',
      })
    ).toBe(false);
  });

  test('uses deterministic priority for overlapping ownership assignments', async () => {
    const assignments = [
      {
        id: 'assign-1',
        adminId: 'admin-1',
        departmentKey: null,
        officeId: 'office-1',
        priority: 100,
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
      {
        id: 'assign-2',
        adminId: 'admin-2',
        departmentKey: null,
        officeId: 'office-1',
        priority: 50,
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
    ];

    expect(
      resolveEmployeeOwnerAdminId(
        [...assignments].sort((a, b) => a.priority - b.priority),
        { officeId: 'office-1', department: null }
      )
    ).toBe('admin-2');
  });

  test('leave domain allows fallback queue for designated admins', async () => {
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'assign-1',
        adminId: 'admin-owner',
        domain: 'leave',
        departmentKey: 'operations',
        officeId: null,
        priority: 100,
        isActive: true,
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
    ]);
    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-fallback', includeFallbackLeaveQueue: true },
      assignments: [],
    });

    const context = await resolveLeaveRequestAccessContext({
      id: 'admin-fallback',
      isSuperAdmin: false,
      rolePolicy: defaultRolePolicy,
    });

    expect(context.isEmployeeVisible({ id: 'employee-1', role: 'office', department: 'Finance' })).toBe(true);
    expect(context.isEmployeeVisible({ id: 'employee-2', role: 'office', department: 'Operations' })).toBe(false);
  });

  test('employee visibility domain hides unmatched employees', async () => {
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'assign-1',
        adminId: 'admin-1',
        domain: 'employees',
        departmentKey: 'operations',
        officeId: null,
        priority: 100,
        isActive: true,
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
    ]);
    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-1', includeFallbackLeaveQueue: true },
      assignments: [],
    });

    const context = await resolveEmployeeVisibilityAccessContext({
      id: 'admin-1',
      isSuperAdmin: false,
      rolePolicy: defaultRolePolicy,
    });

    expect(getAdminOwnershipSummaryByAdminId).toHaveBeenCalledWith('admin-1', 'employees');
    expect(getAllActiveAdminOwnershipAssignments).toHaveBeenCalledWith('employees');
    expect(context.isEmployeeVisible({ id: 'employee-1', role: 'office', department: 'Operations' })).toBe(true);
    expect(context.isEmployeeVisible({ id: 'employee-2', role: 'office', department: 'Finance' })).toBe(false);
  });
});
