import {
  applyAttendanceVisibilityScope,
  applyEmployeeVisibilityScope,
  canAccessOfficeAttendance,
  getEmployeeRoleFilter,
} from '@/lib/auth/admin-visibility';

describe('admin visibility policy', () => {
  test('returns on-site role filter for restricted scope', () => {
    expect(getEmployeeRoleFilter('on_site_only')).toBe('on_site');
    expect(getEmployeeRoleFilter('all')).toBeUndefined();
  });

  test('applies employee scope filter for restricted admins', () => {
    expect(
      applyEmployeeVisibilityScope(
        { fullName: { contains: 'John', mode: 'insensitive' } },
        { isSuperAdmin: false, employeeVisibilityScope: 'on_site_only' }
      )
    ).toEqual({
      AND: [{ fullName: { contains: 'John', mode: 'insensitive' } }, { role: 'on_site' }],
    });
  });

  test('applies attendance scope filter for restricted admins', () => {
    expect(
      applyAttendanceVisibilityScope(
        { employeeId: 'emp-1' },
        { isSuperAdmin: false, employeeVisibilityScope: 'on_site_only' }
      )
    ).toEqual({
      AND: [
        { employeeId: 'emp-1' },
        {
          employee: {
            is: {
              role: 'on_site',
            },
          },
        },
      ],
    });
  });

  test('allows office attendance only for full-scope admins', () => {
    expect(canAccessOfficeAttendance({ isSuperAdmin: false, employeeVisibilityScope: 'all' })).toBe(true);
    expect(canAccessOfficeAttendance({ isSuperAdmin: false, employeeVisibilityScope: 'on_site_only' })).toBe(false);
    expect(canAccessOfficeAttendance({ isSuperAdmin: true, employeeVisibilityScope: 'on_site_only' })).toBe(true);
  });
});
