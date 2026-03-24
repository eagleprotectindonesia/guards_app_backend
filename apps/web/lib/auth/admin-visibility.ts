import { EmployeeRole, Prisma } from '@prisma/client';

export type EmployeeVisibilityScope = 'all' | 'on_site_only';

type SessionVisibility = {
  isSuperAdmin: boolean;
  employeeVisibilityScope: EmployeeVisibilityScope;
};

export function getEmployeeRoleFilter(scope: EmployeeVisibilityScope): EmployeeRole | undefined {
  if (scope === 'on_site_only') {
    return 'on_site';
  }

  return undefined;
}

export function canAccessOfficeAttendance(session: SessionVisibility) {
  return session.isSuperAdmin || session.employeeVisibilityScope === 'all';
}

export function applyEmployeeVisibilityScope(
  where: Prisma.EmployeeWhereInput = {},
  session: SessionVisibility
): Prisma.EmployeeWhereInput {
  if (session.isSuperAdmin) {
    return where;
  }

  const role = getEmployeeRoleFilter(session.employeeVisibilityScope);
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

  const role = getEmployeeRoleFilter(session.employeeVisibilityScope);
  if (!role) {
    return where;
  }

  return {
    AND: [
      where,
      {
        employee: {
          is: {
            role,
          },
        },
      },
    ],
  };
}
