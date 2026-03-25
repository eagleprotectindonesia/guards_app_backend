import {
  DEFAULT_ROLE_POLICY,
  applyAttendanceVisibilityScope,
  applyEmployeeVisibilityScope,
  canAccessOfficeAttendance,
  getEmployeeRoleFilter,
  normalizeRolePolicy,
} from '@/lib/auth/admin-visibility';

describe('admin visibility policy', () => {
  test('falls back to default policy when missing', () => {
    expect(normalizeRolePolicy(null)).toEqual(DEFAULT_ROLE_POLICY);
  });

  test('returns on-site role filter for restricted policy', () => {
    expect(getEmployeeRoleFilter({ employees: { scope: 'on_site_only' }, attendance: { scope: 'shift_only' } })).toBe(
      'on_site'
    );
    expect(getEmployeeRoleFilter(DEFAULT_ROLE_POLICY)).toBeUndefined();
  });

  test('applies employee scope filter for restricted admins', () => {
    expect(
      applyEmployeeVisibilityScope(
        { fullName: { contains: 'John', mode: 'insensitive' } },
        {
          isSuperAdmin: false,
          rolePolicy: { employees: { scope: 'on_site_only' }, attendance: { scope: 'shift_only' } },
        }
      )
    ).toEqual({
      AND: [{ fullName: { contains: 'John', mode: 'insensitive' } }, { role: 'on_site' }],
    });
  });

  test('applies attendance scope filter for restricted admins', () => {
    expect(
      applyAttendanceVisibilityScope(
        { employeeId: 'emp-1' },
        {
          isSuperAdmin: false,
          rolePolicy: { employees: { scope: 'on_site_only' }, attendance: { scope: 'shift_only' } },
        }
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
    expect(canAccessOfficeAttendance({ isSuperAdmin: false, rolePolicy: DEFAULT_ROLE_POLICY })).toBe(true);
    expect(
      canAccessOfficeAttendance({
        isSuperAdmin: false,
        rolePolicy: { employees: { scope: 'on_site_only' }, attendance: { scope: 'shift_only' } },
      })
    ).toBe(false);
    expect(
      canAccessOfficeAttendance({
        isSuperAdmin: true,
        rolePolicy: { employees: { scope: 'on_site_only' }, attendance: { scope: 'shift_only' } },
      })
    ).toBe(true);
  });
});
