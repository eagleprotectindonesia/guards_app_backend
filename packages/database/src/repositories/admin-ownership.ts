import { Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { getDistinctDepartments } from './employees';

const DEFAULT_ASSIGNMENT_PRIORITY = 100;

type NullableString = string | null | undefined;

export type AdminOwnershipAssignmentInput = {
  departmentKey?: NullableString;
  officeId?: NullableString;
  priority?: number;
  isActive?: boolean;
};

export type ReplaceAdminOwnershipAssignmentsInput = {
  adminId: string;
  assignments: AdminOwnershipAssignmentInput[];
  includeFallbackLeaveQueue: boolean;
  actorId?: string;
};

export type AdminOwnershipSelectionInput = {
  departmentKeys: string[];
  officeIds: string[];
};

export function normalizeDepartmentScopeKey(value: NullableString) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');

  return normalized.length > 0 ? normalized : null;
}

export async function getDistinctNormalizedDepartmentKeys() {
  const departments = await getDistinctDepartments();
  const keys = new Set<string>();

  for (const department of departments) {
    const key = normalizeDepartmentScopeKey(department);
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function buildOwnershipAssignmentsFromSelection(
  selection: AdminOwnershipSelectionInput
): AdminOwnershipAssignmentInput[] {
  const assignments: AdminOwnershipAssignmentInput[] = [];

  for (const departmentKey of selection.departmentKeys) {
    assignments.push({
      departmentKey,
      priority: DEFAULT_ASSIGNMENT_PRIORITY,
      isActive: true,
    });
  }

  for (const officeId of selection.officeIds) {
    assignments.push({
      officeId,
      priority: DEFAULT_ASSIGNMENT_PRIORITY,
      isActive: true,
    });
  }

  return assignments;
}

function normalizeAssignmentInput(input: AdminOwnershipAssignmentInput) {
  const departmentKey = normalizeDepartmentScopeKey(input.departmentKey);
  const officeId = input.officeId?.trim() || null;

  if (!departmentKey && !officeId) {
    return null;
  }

  return {
    departmentKey,
    officeId,
    priority: Number.isInteger(input.priority) ? Number(input.priority) : DEFAULT_ASSIGNMENT_PRIORITY,
    isActive: input.isActive ?? true,
  };
}

function dedupeAssignments(assignments: AdminOwnershipAssignmentInput[]) {
  const deduped = new Map<string, ReturnType<typeof normalizeAssignmentInput>>();

  for (const assignment of assignments) {
    const normalized = normalizeAssignmentInput(assignment);
    if (!normalized) {
      continue;
    }

    const key = `${normalized.departmentKey ?? ''}::${normalized.officeId ?? ''}`;
    deduped.set(key, normalized);
  }

  return Array.from(deduped.values()).filter(
    (assignment): assignment is NonNullable<typeof assignment> => !!assignment
  );
}

export async function getAdminOwnershipAssignments(adminId: string) {
  return prisma.adminOwnershipAssignment.findMany({
    where: { adminId, isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: {
      office: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function getAllActiveAdminOwnershipAssignments() {
  return prisma.adminOwnershipAssignment.findMany({
    where: {
      isActive: true,
      admin: {
        deletedAt: null,
      },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      adminId: true,
      departmentKey: true,
      officeId: true,
      priority: true,
      createdAt: true,
      isActive: true,
    },
  });
}

export async function replaceAdminOwnershipAssignments(input: ReplaceAdminOwnershipAssignmentsInput) {
  const normalizedAssignments = dedupeAssignments(input.assignments);

  return prisma.$transaction(
    async tx => {
      await tx.admin.update({
        where: { id: input.adminId },
        data: {
          includeFallbackLeaveQueue: input.includeFallbackLeaveQueue,
        },
      });

      await tx.adminOwnershipAssignment.deleteMany({
        where: { adminId: input.adminId },
      });

      if (normalizedAssignments.length > 0) {
        await tx.adminOwnershipAssignment.createMany({
          data: normalizedAssignments.map(assignment => ({
            adminId: input.adminId,
            departmentKey: assignment.departmentKey,
            officeId: assignment.officeId,
            priority: assignment.priority,
            isActive: assignment.isActive,
          })),
        });
      }

      if (input.actorId) {
        await tx.changelog.create({
          data: {
            action: 'UPDATE',
            entityType: 'AdminOwnershipAssignment',
            entityId: input.adminId,
            actor: 'admin',
            actorId: input.actorId,
            details: {
              adminId: input.adminId,
              includeFallbackLeaveQueue: input.includeFallbackLeaveQueue,
              assignmentCount: normalizedAssignments.length,
              assignments: normalizedAssignments,
            },
          },
        });
      }

      return {
        assignmentCount: normalizedAssignments.length,
      };
    },
    { timeout: 5000 }
  );
}

export async function getAdminOwnershipSummaryByAdminId(adminId: string) {
  const [admin, assignments] = await prisma.$transaction([
    prisma.admin.findUnique({
      where: { id: adminId, deletedAt: null },
      select: {
        id: true,
        includeFallbackLeaveQueue: true,
      },
    }),
    prisma.adminOwnershipAssignment.findMany({
      where: {
        adminId,
        isActive: true,
      },
      select: {
        id: true,
        departmentKey: true,
        officeId: true,
        priority: true,
        createdAt: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  return {
    admin,
    assignments,
  };
}

export function buildAdminOwnershipEmployeeWhere(
  assignments: AdminOwnershipAssignmentInput[]
): Prisma.EmployeeWhereInput {
  const normalizedAssignments = dedupeAssignments(assignments);

  if (normalizedAssignments.length === 0) {
    return { id: '__none__' };
  }

  return {
    OR: normalizedAssignments.map(assignment => ({
      AND: [
        assignment.departmentKey
          ? {
              department: {
                equals: assignment.departmentKey,
                mode: 'insensitive' as const,
              },
            }
          : {},
        assignment.officeId
          ? {
              officeId: assignment.officeId,
            }
          : {},
      ],
    })),
  };
}
