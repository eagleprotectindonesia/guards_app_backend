import { EmployeeRole } from '@prisma/client';
import {
  getAdminOwnershipSummaryByAdminId,
  getAllActiveAdminOwnershipAssignments,
  normalizeDepartmentScopeKey,
} from '@repo/database';
import type { AdminSession } from '@/lib/admin-auth';
import { getEmployeeRoleFilter } from './admin-visibility';
import { isAdminLeaveOwnershipEnabled } from '@/lib/feature-flags';

export type LeaveOwnershipEmployeeScope = {
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

export type LeaveRequestAccessMode = 'super_admin' | 'legacy_role_scope' | 'ownership_scope';

export type LeaveRequestAccessContext = {
  mode: LeaveRequestAccessMode;
  employeeRoleFilter: EmployeeRole | undefined;
  includeFallbackQueue: boolean;
  isEmployeeVisible: (employee: LeaveOwnershipEmployeeScope) => boolean;
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

function doesAssignmentMatchEmployee(
  assignment: Pick<ActiveOwnershipAssignment, 'departmentKey' | 'officeId'>,
  employee: Pick<LeaveOwnershipEmployeeScope, 'department' | 'officeId'>
) {
  if (assignment.departmentKey) {
    const employeeDepartmentKey = normalizeDepartmentScopeKey(employee.department);
    if (!employeeDepartmentKey || employeeDepartmentKey !== assignment.departmentKey) {
      return false;
    }
  }

  if (assignment.officeId && assignment.officeId !== employee.officeId) {
    return false;
  }

  return true;
}

function resolveEmployeeOwnerAdminIdFromSortedAssignments(
  assignments: ActiveOwnershipAssignment[],
  employee: Pick<LeaveOwnershipEmployeeScope, 'department' | 'officeId'>
) {
  for (const assignment of assignments) {
    if (doesAssignmentMatchEmployee(assignment, employee)) {
      return assignment.adminId;
    }
  }

  return null;
}

export function resolveEmployeeOwnerAdminId(
  assignments: ActiveOwnershipAssignment[],
  employee: Pick<LeaveOwnershipEmployeeScope, 'department' | 'officeId'>
) {
  return resolveEmployeeOwnerAdminIdFromSortedAssignments([...assignments].sort(compareOwnershipAssignments), employee);
}

export async function resolveLeaveRequestAccessContext(
  session: Pick<AdminSession, 'id' | 'isSuperAdmin' | 'rolePolicy'>
): Promise<LeaveRequestAccessContext> {
  const employeeRoleFilter = getEmployeeRoleFilter(session.rolePolicy);

  if (session.isSuperAdmin) {
    return {
      mode: 'super_admin',
      employeeRoleFilter: undefined,
      includeFallbackQueue: true,
      isEmployeeVisible: () => true,
    };
  }

  if (!isAdminLeaveOwnershipEnabled()) {
    return {
      mode: 'legacy_role_scope',
      employeeRoleFilter,
      includeFallbackQueue: false,
      isEmployeeVisible: employee => {
        if (employeeRoleFilter && employee.role !== employeeRoleFilter) {
          return false;
        }
        return true;
      },
    };
  }

  const [{ admin }, allAssignmentsRaw] = await Promise.all([
    getAdminOwnershipSummaryByAdminId(session.id),
    getAllActiveAdminOwnershipAssignments(),
  ]);

  if (!admin || allAssignmentsRaw.length === 0) {
    return {
      mode: 'legacy_role_scope',
      employeeRoleFilter,
      includeFallbackQueue: false,
      isEmployeeVisible: employee => {
        if (employeeRoleFilter && employee.role !== employeeRoleFilter) {
          return false;
        }
        return true;
      },
    };
  }

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

  return {
    mode: 'ownership_scope',
    employeeRoleFilter,
    includeFallbackQueue: admin.includeFallbackLeaveQueue,
    isEmployeeVisible: employee => {
      if (employeeRoleFilter && employee.role !== employeeRoleFilter) {
        return false;
      }

      const ownerAdminId = resolveEmployeeOwnerAdminIdFromSortedAssignments(allAssignments, employee);

      if (ownerAdminId === session.id) {
        return true;
      }

      if (ownerAdminId === null && admin.includeFallbackLeaveQueue) {
        return true;
      }

      return false;
    },
  };
}
