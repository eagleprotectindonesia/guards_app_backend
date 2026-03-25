import { EmployeeRole, Prisma } from '@prisma/client';
import { RolePolicy, rolePolicySchema } from '@repo/validations';

type SessionVisibility = {
  isSuperAdmin: boolean;
  rolePolicy: RolePolicy;
};

export const DEFAULT_ROLE_POLICY: RolePolicy = {
  employees: { scope: 'all' },
  attendance: { scope: 'all' },
};

export function normalizeRolePolicy(
  policy: unknown
): RolePolicy {
  const parsedPolicy = rolePolicySchema.safeParse(policy);
  if (parsedPolicy.success) {
    return parsedPolicy.data;
  }

  return DEFAULT_ROLE_POLICY;
}

export function getEmployeeRoleFilter(policy: RolePolicy): EmployeeRole | undefined {
  if (policy.employees.scope === 'on_site_only') {
    return 'on_site';
  }

  return undefined;
}

export function canAccessOfficeAttendance(session: SessionVisibility) {
  return session.isSuperAdmin || session.rolePolicy.attendance.scope === 'all';
}

export function applyEmployeeVisibilityScope(
  where: Prisma.EmployeeWhereInput = {},
  session: SessionVisibility
): Prisma.EmployeeWhereInput {
  if (session.isSuperAdmin) {
    return where;
  }

  const role = getEmployeeRoleFilter(session.rolePolicy);
  if (!role) {
    return where;
  }

  return {
    AND: [where, { role }],
  };
}

export function applyAttendanceVisibilityScope(
  where: Prisma.AttendanceWhereInput = {},
  session: SessionVisibility
): Prisma.AttendanceWhereInput {
  if (session.isSuperAdmin) {
    return where;
  }

  if (session.rolePolicy.attendance.scope === 'all') {
    return where;
  }

  return {
    AND: [
      where,
      {
        employee: {
          is: {
            role: 'on_site',
          },
        },
      },
    ],
  };
}
