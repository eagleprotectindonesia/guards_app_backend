import { resolveEmployeeOwnerAdminId, resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { getAdminOwnershipSummaryByAdminId, getAllActiveAdminOwnershipAssignments } from '@repo/database';
import { isAdminLeaveOwnershipEnabled } from '@/lib/feature-flags';

jest.mock('@repo/database', () => ({
  getAdminOwnershipSummaryByAdminId: jest.fn(),
  getAllActiveAdminOwnershipAssignments: jest.fn(),
  normalizeDepartmentScopeKey: (value?: string | null) => {
    if (!value) return null;
    const normalized = value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
  },
}));

jest.mock('@/lib/feature-flags', () => ({
  isAdminLeaveOwnershipEnabled: jest.fn(),
}));

const defaultRolePolicy = {
  employees: { scope: 'all' as const },
  attendance: { scope: 'all' as const },
};

describe('leave ownership resolver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('falls back to legacy role scope when feature flag is disabled', async () => {
    (isAdminLeaveOwnershipEnabled as jest.Mock).mockReturnValue(false);

    const context = await resolveLeaveRequestAccessContext({
      id: 'admin-1',
      isSuperAdmin: false,
      rolePolicy: {
        employees: { scope: 'on_site_only' },
        attendance: { scope: 'shift_only' },
      },
    });

    expect(context.mode).toBe('legacy_role_scope');
    expect(context.isEmployeeVisible({ id: 'employee-1', role: 'on_site' })).toBe(true);
    expect(context.isEmployeeVisible({ id: 'employee-2', role: 'office' })).toBe(false);
  });

  test('super admin bypasses role and ownership filters', async () => {
    (isAdminLeaveOwnershipEnabled as jest.Mock).mockReturnValue(true);

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

  test('resolves department ownership with normalized matching', async () => {
    (isAdminLeaveOwnershipEnabled as jest.Mock).mockReturnValue(true);
    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-1', includeFallbackLeaveQueue: false },
      assignments: [],
    });
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'assign-1',
        adminId: 'admin-1',
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

    (isAdminLeaveOwnershipEnabled as jest.Mock).mockReturnValue(true);
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue(
      assignments.map((assignment, index) => ({
        ...assignment,
        id: `${assignment.id}-${index}`,
        isActive: true,
      }))
    );

    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-1', includeFallbackLeaveQueue: false },
      assignments: [],
    });

    const contextAdmin1 = await resolveLeaveRequestAccessContext({
      id: 'admin-1',
      isSuperAdmin: false,
      rolePolicy: defaultRolePolicy,
    });

    (getAdminOwnershipSummaryByAdminId as jest.Mock).mockResolvedValue({
      admin: { id: 'admin-2', includeFallbackLeaveQueue: false },
      assignments: [],
    });

    const contextAdmin2 = await resolveLeaveRequestAccessContext({
      id: 'admin-2',
      isSuperAdmin: false,
      rolePolicy: defaultRolePolicy,
    });

    expect(contextAdmin1.isEmployeeVisible({ id: 'employee-1', role: 'office', officeId: 'office-1' })).toBe(false);
    expect(contextAdmin2.isEmployeeVisible({ id: 'employee-1', role: 'office', officeId: 'office-1' })).toBe(true);
  });

  test('allows fallback queue only for admins with fallback toggle', async () => {
    (isAdminLeaveOwnershipEnabled as jest.Mock).mockReturnValue(true);
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'assign-1',
        adminId: 'admin-owner',
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

    expect(context.mode).toBe('ownership_scope');
    expect(context.isEmployeeVisible({ id: 'employee-1', role: 'office', department: 'Finance' })).toBe(true);
    expect(context.isEmployeeVisible({ id: 'employee-2', role: 'office', department: 'Operations' })).toBe(false);
  });
});
