import { AdminOwnershipDomain, EmployeeRole } from '@prisma/client';
import {
  doesAdminOwnershipAssignmentMatchEmployeeScope,
  getAdminOwnershipSummaryByAdminId,
  getAllActiveAdminOwnershipAssignments,
} from '@repo/database';
import type { AdminSession } from '@/lib/admin-auth';
import { getEmployeeRoleFilter } from './admin-visibility';

export type OwnershipEmployeeScope = {
  id: string;
  role: EmployeeRole | null;
  department?: string | null;
  officeId?: string | null;
};

export type ActiveOwnershipAssignment = {
  id: string;
  adminId: string;
  departmentKey: string | null;
  officeId: string | null;
  priority: number;
  createdAt: Date;
};

export type OwnershipAccessMode = 'super_admin' | 'ownership_scope';

export type OwnershipAccessContext = {
  mode: OwnershipAccessMode;
  employeeRoleFilter: EmployeeRole | undefined;
  includeFallbackQueue: boolean;
  isEmployeeVisible: (employee: OwnershipEmployeeScope) => boolean;
};

function getAssignmentSpecificity(assignment: Pick<ActiveOwnershipAssignment, 'departmentKey' | 'officeId'>) {
  let score = 0;

  if (assignment.departmentKey) {
    score += 1;
  }

  if (assignment.officeId) {
    score += 1;
  }

  return score;
}

function compareOwnershipAssignments(a: ActiveOwnershipAssignment, b: ActiveOwnershipAssignment) {
  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const specificityDiff = getAssignmentSpecificity(b) - getAssignmentSpecificity(a);
  if (specificityDiff !== 0) {
    return specificityDiff;
  }

  const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const adminIdDiff = a.adminId.localeCompare(b.adminId);
  if (adminIdDiff !== 0) {
    return adminIdDiff;
  }

  return a.id.localeCompare(b.id);
}

function resolveEmployeeOwnerAdminIdFromSortedAssignments(
  assignments: ActiveOwnershipAssignment[],
  employee: Pick<OwnershipEmployeeScope, 'department' | 'officeId'>
) {
  for (const assignment of assignments) {
    if (doesAdminOwnershipAssignmentMatchEmployeeScope(assignment, employee)) {
      return assignment.adminId;
    }
  }

  return null;
}

export function resolveEmployeeOwnerAdminId(
  assignments: ActiveOwnershipAssignment[],
  employee: Pick<OwnershipEmployeeScope, 'department' | 'officeId'>
) {
  return resolveEmployeeOwnerAdminIdFromSortedAssignments([...assignments].sort(compareOwnershipAssignments), employee);
}

async function resolveOwnershipAccessContext(
  session: Pick<AdminSession, 'id' | 'isSuperAdmin' | 'rolePolicy'>,
  domain: AdminOwnershipDomain,
  options?: {
    includeFallbackForUnmatched?: boolean;
  }
): Promise<OwnershipAccessContext> {
  const employeeRoleFilter = getEmployeeRoleFilter(session.rolePolicy);

  if (session.isSuperAdmin) {
    return {
      mode: 'super_admin',
      employeeRoleFilter: undefined,
      includeFallbackQueue: true,
      isEmployeeVisible: () => true,
    };
  }

  const [{ admin }, allAssignmentsRaw] = await Promise.all([
    getAdminOwnershipSummaryByAdminId(session.id, domain),
    getAllActiveAdminOwnershipAssignments(domain),
  ]);

  const allAssignments: ActiveOwnershipAssignment[] = allAssignmentsRaw
    .map(assignment => ({
      id: assignment.id,
      adminId: assignment.adminId,
      departmentKey: assignment.departmentKey,
      officeId: assignment.officeId,
      priority: assignment.priority,
      createdAt: assignment.createdAt,
    }))
    .sort(compareOwnershipAssignments);

  const includeFallbackQueue =
    options?.includeFallbackForUnmatched !== undefined
      ? options.includeFallbackForUnmatched
      : domain === 'leave'
        ? !!admin?.includeFallbackLeaveQueue
        : false;
  const allowAnyMatchingAssignment = domain === 'leave';

  return {
    mode: 'ownership_scope',
    employeeRoleFilter,
    includeFallbackQueue,
    isEmployeeVisible: employee => {
      if (employeeRoleFilter && employee.role !== employeeRoleFilter) {
        return false;
      }

      const ownerAdminId = resolveEmployeeOwnerAdminIdFromSortedAssignments(allAssignments, employee);
      const matchingAssignments = allAssignments.filter(assignment =>
        doesAdminOwnershipAssignmentMatchEmployeeScope(assignment, {
          department: employee.department,
          officeId: employee.officeId,
        })
      );
      const currentAdminHasMatchingAssignment = matchingAssignments.some(assignment => assignment.adminId === session.id);

      if (currentAdminHasMatchingAssignment && allowAnyMatchingAssignment) {
        return true;
      }

      if (ownerAdminId === session.id) {
        return true;
      }

      if (ownerAdminId === null && includeFallbackQueue) {
        return true;
      }
      return false;
    },
  };
}

export async function resolveLeaveRequestAccessContext(
  session: Pick<AdminSession, 'id' | 'isSuperAdmin' | 'rolePolicy'>
): Promise<OwnershipAccessContext> {
  return resolveOwnershipAccessContext(session, 'leave', {
    includeFallbackForUnmatched: undefined,
  });
}

export async function resolveEmployeeVisibilityAccessContext(
  session: Pick<AdminSession, 'id' | 'isSuperAdmin' | 'rolePolicy'>
): Promise<OwnershipAccessContext> {
  return resolveOwnershipAccessContext(session, 'employees', {
    includeFallbackForUnmatched: false,
  });
}
