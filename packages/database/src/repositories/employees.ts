import { db as prisma, EmployeeSummary } from '../prisma/client';
import { redis } from '../redis/client';
import { EmployeeRole, OfficeAttendanceMode, Prisma } from '@prisma/client';
import { deleteFutureShiftsByEmployee, cancelInProgressShiftsForDeactivatedEmployee } from './shifts';
import { hashPassword, verifyPassword, DEFAULT_PASSWORD } from '../password';
import { fetchExternalEmployees, ExternalEmployee } from '../integrations/external-employee-api';
import { syncOfficesFromExternalEmployees } from './offices';
import {
  deleteUpcomingOfficeWorkScheduleAssignmentsByEmployee,
  getCurrentOfficeWorkScheduleAssignment,
  getDefaultOfficeWorkSchedule,
} from './office-work-schedules';
import { deleteFutureOfficeShiftsByEmployee } from './office-shifts';
import {
  getOfficeJobTitleCategoryMapSetting,
  normalizeOfficeJobTitleValue,
  OfficeJobTitleCategoryMap,
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
  resolveEmployeeFieldModeState,
  serializeOfficeJobTitleCategoryMap,
} from './employee-office-config';
import { updateSystemSettingWithChangelog } from './settings';

const LAST_EMPLOYEE_SYNC_KEY = 'employee:sync:last_timestamp';
const EMPLOYEE_PASSWORD_HISTORY_LIMIT = 3;
type ChangelogSyncActor = { type: 'admin' | 'system' | 'unknown'; id?: string };

function getChangelogActorData(actor: ChangelogSyncActor) {
  return {
    actor: actor.type,
    actorId: actor.type === 'admin' ? actor.id ?? null : null,
  };
}

export async function getLastEmployeeSyncTimestamp(): Promise<string | null> {
  return redis.get(LAST_EMPLOYEE_SYNC_KEY);
}

export function getEmployeeSearchWhere(query?: string): Prisma.EmployeeWhereInput {
  if (!query) return {};
  return {
    OR: [
      { fullName: { contains: query, mode: 'insensitive' } },
      { employeeNumber: { contains: query, mode: 'insensitive' } },
      { personnelId: { contains: query, mode: 'insensitive' } },
      { nickname: { contains: query, mode: 'insensitive' } },
      { jobTitle: { contains: query, mode: 'insensitive' } },
      { department: { contains: query, mode: 'insensitive' } },
    ],
  };
}

async function attachDerivedOfficeMetadata<T extends {
  role?: EmployeeRole | null;
  officeId?: string | null;
  jobTitle?: string | null;
  fieldModeEnabled?: boolean | null;
  officeAttendanceMode?: OfficeAttendanceMode | null;
}>(
  employee: T,
  categoryMap: OfficeJobTitleCategoryMap
) {
  return {
    ...employee,
    ...resolveEmployeeFieldModeState({
      role: employee.role,
      officeId: employee.officeId,
      jobTitle: employee.jobTitle,
      fieldModeEnabled: employee.fieldModeEnabled,
      categoryMap,
    }),
  };
}

async function getActiveOfficeScheduleName(
  employeeId: string,
  role?: EmployeeRole | null,
  officeAttendanceMode?: OfficeAttendanceMode | null,
  defaultScheduleName?: string
) {
  if (role !== 'office' || officeAttendanceMode !== 'fixed_schedule') {
    return null;
  }

  const assignment = await getCurrentOfficeWorkScheduleAssignment(employeeId);
  return assignment?.officeWorkSchedule.name ?? defaultScheduleName ?? null;
}

async function buildEmployeeWithSchedule<T extends {
  id: string;
  role?: EmployeeRole | null;
  officeId?: string | null;
  jobTitle?: string | null;
  fieldModeEnabled?: boolean | null;
  officeAttendanceMode?: OfficeAttendanceMode | null;
}>(
  employee: T,
  categoryMap: OfficeJobTitleCategoryMap,
  defaultScheduleName: string
) {
  const [derivedEmployee, activeOfficeWorkScheduleName] = await Promise.all([
    attachDerivedOfficeMetadata(employee, categoryMap),
    getActiveOfficeScheduleName(employee.id, employee.role, employee.officeAttendanceMode, defaultScheduleName),
  ]);

  return {
    ...derivedEmployee,
    activeOfficeWorkScheduleName,
  };
}

export async function getAllEmployees(
  params: {
    where?: Prisma.EmployeeWhereInput;
    orderBy?: Prisma.EmployeeOrderByWithRelationInput;
    includeDeleted?: boolean;
  } = {}
) {
  const { where = {}, orderBy = { createdAt: 'desc' }, includeDeleted = false } = params;
  const employees = await prisma.employee.findMany({
    where: {
      ...where,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    include: { office: { select: { name: true } } },
    orderBy,
  });

  const [defaultOfficeSchedule, categoryMap] = await Promise.all([
    getDefaultOfficeWorkSchedule(),
    getOfficeJobTitleCategoryMapSetting(),
  ]);

  return Promise.all(employees.map(employee => buildEmployeeWithSchedule(employee, categoryMap, defaultOfficeSchedule.name)));
}

export async function getActiveEmployees(role?: EmployeeRole) {
  return prisma.employee.findMany({
    where: {
      status: true,
      deletedAt: null,
      ...(role && { role }),
    },
    orderBy: { fullName: 'asc' },
  });
}

export async function getActiveEmployeesSummary(
  role?: EmployeeRole,
  officeAttendanceMode?: OfficeAttendanceMode
): Promise<EmployeeSummary[]> {
  return prisma.employee.findMany({
    where: {
      status: true,
      deletedAt: null,
      ...(role && { role }),
      ...(role === 'office' && officeAttendanceMode ? { officeAttendanceMode } : {}),
    },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });
}

export async function getOfficeEmployeesByCodes(
  employeeCodes: string[]
): Promise<
  Array<{
    id: string;
    fullName: string;
    employeeNumber: string;
  }>
> {
  const employees = await prisma.employee.findMany({
    where: {
      employeeNumber: {
        in: employeeCodes.map(code => code.toUpperCase()),
      },
      status: true,
      deletedAt: null,
      role: 'office',
    },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });

  // Filter out employees with null employeeNumber (shouldn't happen but type safety)
  return employees.filter((emp): emp is typeof emp & { employeeNumber: string } => emp.employeeNumber !== null);
}

export async function getEmployeeById(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id, deletedAt: null },
  });

  if (!employee) return null;

  const categoryMap = await getOfficeJobTitleCategoryMapSetting();
  return attachDerivedOfficeMetadata(employee, categoryMap);
}

export async function getEmployeeByIdWithRelations(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id, deletedAt: null },
    include: {
      office: {
        select: { name: true },
      },
    },
  });

  if (!employee) return null;

  const categoryMap = await getOfficeJobTitleCategoryMapSetting();
  return attachDerivedOfficeMetadata(employee, categoryMap);
}

/**
 * Gets an employee by ID for authentication purposes.
 * Includes hashedPassword and other auth-related fields.
 */
export async function getEmployeeForAuth(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      hashedPassword: true,
      status: true,
      deletedAt: true,
    },
  });
}

/**
 * Creates a refresh token for an employee.
 */
export async function createEmployeeRefreshToken(params: {
  employeeId: string;
  token: string;
  deviceInfo: string;
  expiresAt: Date;
}) {
  return prisma.refreshToken.create({
    data: {
      token: params.token,
      employeeId: params.employeeId,
      deviceInfo: params.deviceInfo,
      expiresAt: params.expiresAt,
    },
  });
}

export async function findEmployeeByEmployeeNumber(employeeNumber: string) {
  return prisma.employee.findFirst({
    where: { employeeNumber, deletedAt: null },
  });
}

export async function getPaginatedEmployees(params: {
  where: Prisma.EmployeeWhereInput;
  orderBy: Prisma.EmployeeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [employees, totalCount] = await prisma.$transaction([
    prisma.employee.findMany({
      where: finalWhere,
      include: { office: { select: { name: true } } },
      orderBy,
      skip,
      take,
    }),
    prisma.employee.count({ where: finalWhere }),
  ]);

  const [defaultOfficeSchedule, categoryMap] = await Promise.all([
    getDefaultOfficeWorkSchedule(),
    getOfficeJobTitleCategoryMapSetting(),
  ]);
  const employeesWithSchedules = await Promise.all(
    employees.map(employee => buildEmployeeWithSchedule(employee, categoryMap, defaultOfficeSchedule.name))
  );

  return { employees: employeesWithSchedules, totalCount };
}

/**
 * Upsert an employee from external API data.
 * Does NOT overwrite hashedPassword or phone if they already exist,
 * unless specifically intended (phone comes from external too).
 */
export async function upsertEmployeeFromExternal(data: {
  id: string;
  employeeNumber: string;
  personnelId: string | null;
  nickname: string | null;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  role: EmployeeRole | null;
  phone: string;
  officeId?: string | null;
  password?: string; // Hashed default password for new employees
  categoryMap?: OfficeJobTitleCategoryMap;
}) {
  const categoryMap = data.categoryMap || (await getOfficeJobTitleCategoryMapSetting());
  const fieldModeState = resolveEmployeeFieldModeState({
    role: data.role,
    officeId: data.officeId,
    jobTitle: data.jobTitle,
    fieldModeEnabled: false,
    categoryMap,
  });

  return prisma.employee.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      employeeNumber: data.employeeNumber,
      personnelId: data.personnelId,
      nickname: data.nickname,
      fullName: data.fullName,
      jobTitle: data.jobTitle,
      department: data.department,
      phone: data.phone,
      hashedPassword: data.password || '', // Should be provided for new employees
      role: data.role,
      officeAttendanceMode: data.role === 'office' ? 'shift_based' : null,
      office: data.officeId ? { connect: { id: data.officeId } } : undefined,
      fieldModeEnabled: fieldModeState.fieldModeEnabled,
      status: true,
    },
    update: {
      employeeNumber: data.employeeNumber,
      personnelId: data.personnelId,
      nickname: data.nickname,
      fullName: data.fullName,
      jobTitle: data.jobTitle,
      department: data.department,
      phone: data.phone,
      role: data.role,
      officeAttendanceMode: data.role === 'office' ? 'shift_based' : null,
      office: data.officeId ? { connect: { id: data.officeId } } : { disconnect: true },
      fieldModeEnabled: fieldModeState.fieldModeEnabled,
      status: true, // Reactivate if it was deactivated but returned to external list
      deletedAt: null, // Restore if soft-deleted
    },
  });
}

export const EMPLOYEE_TRACKED_FIELDS = [
  'employeeNumber',
  'personnelId',
  'nickname',
  'fullName',
  'jobTitle',
  'department',
  'role',
  'officeAttendanceMode',
  'status',
  'phone',
  'officeId',
  'fieldModeEnabled',
] as const;

async function normalizeEmployeeFieldModeForUpdate(
  existingEmployee: {
    role?: EmployeeRole | null;
    officeId?: string | null;
    jobTitle?: string | null;
    fieldModeEnabled?: boolean | null;
  },
  data: Prisma.EmployeeUpdateInput
) {
  const nextFieldModeValue =
    data.fieldModeEnabled !== undefined
      ? typeof data.fieldModeEnabled === 'boolean'
        ? data.fieldModeEnabled
        : Boolean((data.fieldModeEnabled as Prisma.BoolFieldUpdateOperationsInput).set)
      : Boolean(existingEmployee.fieldModeEnabled);
  const nextRole = (data.role as EmployeeRole | undefined) ?? existingEmployee.role ?? null;
  const nextJobTitle =
    data.jobTitle !== undefined
      ? ((data.jobTitle as string | null | undefined) ?? null)
      : (existingEmployee.jobTitle ?? null);
  const nextOfficeId =
    data.office !== undefined
      ? 'connect' in (data.office as Prisma.OfficeUpdateOneWithoutEmployeesNestedInput)
        ? ((data.office as Prisma.OfficeUpdateOneWithoutEmployeesNestedInput).connect?.id ?? null)
        : 'disconnect' in (data.office as Prisma.OfficeUpdateOneWithoutEmployeesNestedInput)
          ? null
          : existingEmployee.officeId ?? null
      : (existingEmployee.officeId ?? null);
  const categoryMap = await getOfficeJobTitleCategoryMapSetting();
  const state = resolveEmployeeFieldModeState({
    role: nextRole,
    officeId: nextOfficeId,
    jobTitle: nextJobTitle,
    fieldModeEnabled: nextFieldModeValue,
    categoryMap,
  });

  if (data.fieldModeEnabled !== undefined && !state.isFieldModeEditable && nextFieldModeValue !== state.fieldModeEnabled) {
    throw new Error('Field mode cannot be changed for this employee.');
  }

  return state.fieldModeEnabled;
}

function normalizeOfficeAttendanceModeForUpdate(
  existingEmployee: {
    role?: EmployeeRole | null;
    officeAttendanceMode?: OfficeAttendanceMode | null;
  },
  data: Prisma.EmployeeUpdateInput
) {
  const nextRole = (data.role as EmployeeRole | undefined) ?? existingEmployee.role ?? null;

  if (nextRole !== 'office') {
    return null;
  }

  if (data.officeAttendanceMode === undefined) {
    return existingEmployee.officeAttendanceMode ?? 'shift_based';
  }

  return (data.officeAttendanceMode as OfficeAttendanceMode | null | undefined) ?? 'shift_based';
}

/**
 * Deactivates employees not present in the provided list of IDs.
 * Used at the end of a sync process.
 *
 * For each deactivated employee:
 * - Future shifts are soft-deleted
 * - In-progress shifts are cancelled
 * - All active alerts are resolved
 */
export async function deactivateEmployeesNotIn(
  activeIds: string[],
  actor: ChangelogSyncActor = { type: 'system' }
) {
  const changelogActor = getChangelogActorData(actor);

  return prisma.$transaction(async tx => {
    // 1. Find employees to deactivate
    const toDeactivate = await tx.employee.findMany({
      where: {
        id: { notIn: activeIds },
        status: true,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        personnelId: true,
        nickname: true,
        jobTitle: true,
        department: true,
        role: true,
        phone: true,
      },
    });

    if (toDeactivate.length === 0) return { deactivatedCount: 0 };

    const idsToDeactivate = toDeactivate.map(e => e.id);

    // 2. Bulk update status
    await tx.employee.updateMany({
      where: { id: { in: idsToDeactivate } },
      data: {
        status: false,
      },
    });

    await tx.employeeSession.updateMany({
      where: {
        employeeId: { in: idsToDeactivate },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // 3. Process each deactivated employee
    for (const employee of toDeactivate) {
      // 3a. Delete future shifts
      await deleteFutureShiftsByEmployee(employee.id, tx);

      // 3b. Cancel in-progress shifts (this also resolves alerts for those shifts)
      await cancelInProgressShiftsForDeactivatedEmployee(employee.id, tx);

      // 3c. Resolve any remaining open alerts (for completed/other shifts)
      const now = new Date();
      await tx.alert.updateMany({
        where: {
          shift: {
            employeeId: employee.id,
          },
          resolvedAt: null,
        },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote: 'Auto-resolved: Employee deactivated.',
        },
      });

      // 3d. Create changelog entry
      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Employee',
          entityId: employee.id,
          actor: changelogActor.actor,
          actorId: changelogActor.actorId,
          details: {
            employeeNumber: employee.employeeNumber,
            fullName: employee.fullName,
            status: false,
            changes: {
              status: { from: true, to: false },
              reason: 'External sync deactivation',
            },
          },
        },
      });

      // 3e. Notify employee session revocation via Redis stream
      try {
        await redis.xadd(
          `employee:stream:${employee.id}`,
          'MAXLEN',
          '~',
          100,
          '*',
          'type',
          'session_revoked',
          'reason',
          'account_deactivated'
        );
      } catch (err) {
        console.error(`Failed to notify session revocation for ${employee.id}:`, err);
      }
    }

    return { deactivatedCount: idsToDeactivate.length };
  });
}

export async function updateEmployee(id: string, data: Prisma.EmployeeUpdateInput) {
  const existingEmployee = await prisma.employee.findUnique({
    where: { id },
    select: {
      role: true,
      officeAttendanceMode: true,
      officeId: true,
      jobTitle: true,
      fieldModeEnabled: true,
    },
  });

  if (!existingEmployee) {
    throw new Error('Employee not found');
  }

  const fieldModeEnabled = await normalizeEmployeeFieldModeForUpdate(existingEmployee, data);
  const officeAttendanceMode = normalizeOfficeAttendanceModeForUpdate(existingEmployee, data);
  const previousMode = existingEmployee.role === 'office' ? existingEmployee.officeAttendanceMode ?? 'shift_based' : null;

  return prisma.$transaction(async tx => {
    const updatedEmployee = await tx.employee.update({
      where: { id },
      data: {
        ...data,
        officeAttendanceMode,
        fieldModeEnabled,
      },
    });

    const nextRole = updatedEmployee.role;
    const nextMode = nextRole === 'office' ? updatedEmployee.officeAttendanceMode ?? 'shift_based' : null;

    if (nextRole === 'office' && nextMode !== previousMode) {
      if (nextMode === 'shift_based') {
        await deleteUpcomingOfficeWorkScheduleAssignmentsByEmployee(id, tx);
      } else if (nextMode === 'fixed_schedule') {
        await deleteFutureOfficeShiftsByEmployee(id, tx);
      }
    }

    return updatedEmployee;
  });
}

export async function updateEmployeeFieldMode(id: string, fieldModeEnabled: boolean) {
  return updateEmployee(id, { fieldModeEnabled });
}

type EmployeePasswordActor =
  | { type: 'employee' }
  | { type: 'admin'; adminId: string }
  | { type: 'system' };

type SetEmployeePasswordParams = {
  employeeId: string;
  newPassword: string;
  actor: EmployeePasswordActor;
  requireCurrentPassword?: string;
  mustChangePassword?: boolean;
  enforceHistoryPolicy?: boolean;
};

export class EmployeePasswordPolicyError extends Error {
  field: string;

  constructor(message: string, field = 'newPassword') {
    super(message);
    this.name = 'EmployeePasswordPolicyError';
    this.field = field;
  }
}

async function trimEmployeePasswordHistory(tx: Prisma.TransactionClient, employeeId: string) {
  const histories = await tx.employeePasswordHistory.findMany({
    where: { employeeId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: EMPLOYEE_PASSWORD_HISTORY_LIMIT,
    select: { id: true },
  });

  if (histories.length === 0) return;

  await tx.employeePasswordHistory.deleteMany({
    where: { id: { in: histories.map(history => history.id) } },
  });
}

export async function setEmployeePassword({
  employeeId,
  newPassword,
  actor,
  requireCurrentPassword,
  mustChangePassword,
  enforceHistoryPolicy = true,
}: SetEmployeePasswordParams) {
  return prisma.$transaction(async tx => {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, hashedPassword: true },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (requireCurrentPassword && !(await verifyPassword(requireCurrentPassword, employee.hashedPassword))) {
      throw new EmployeePasswordPolicyError('Invalid current password', 'currentPassword');
    }

    if (enforceHistoryPolicy) {
      const passwordHistory = await tx.employeePasswordHistory.findMany({
        where: { employeeId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EMPLOYEE_PASSWORD_HISTORY_LIMIT,
        select: { hashedPassword: true },
      });

      const candidateHashes = [
        { hashedPassword: employee.hashedPassword },
        ...passwordHistory,
      ];

      for (const historyEntry of candidateHashes) {
        if (await verifyPassword(newPassword, historyEntry.hashedPassword)) {
          throw new EmployeePasswordPolicyError(
            'New password cannot match any of your last 3 passwords'
          );
        }
      }
    }

    const hashedPassword = await hashPassword(newPassword);

    await tx.employee.update({
      where: { id: employeeId },
      data: {
        hashedPassword,
        ...(mustChangePassword === undefined ? {} : { mustChangePassword }),
      },
    });

    await tx.employeePasswordHistory.create({
      data: {
        employeeId,
        hashedPassword,
      },
    });

    await trimEmployeePasswordHistory(tx, employeeId);

    if (actor.type === 'admin') {
      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Employee',
          entityId: employeeId,
          actor: 'admin',
          actorId: actor.adminId,
          details: { field: 'password', status: 'changed' },
        },
      });
    }

    return { hashedPassword };
  });
}

export async function deleteEmployee(id: string) {
  return prisma.employee.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: false,
    },
  });
}

export async function updateEmployeePasswordWithChangelog(id: string, password: string, adminId: string) {
  return prisma.$transaction(async tx => {
    await tx.employee.update({
      where: { id },
      data: { hashedPassword: password },
    });

    await tx.employeePasswordHistory.create({
      data: {
        employeeId: id,
        hashedPassword: password,
      },
    });

    await trimEmployeePasswordHistory(tx, id);

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: id,
        actor: 'admin',
        actorId: adminId,
        details: { field: 'password', status: 'changed' },
      },
    });
  });
}

/**
 * Sync employees from external API.
 * Returns counts of added, updated, and deactivated employees.
 */
export async function syncEmployeesFromExternal(
  actor: ChangelogSyncActor = { type: 'system' },
  employees?: ExternalEmployee[]
) {
  const changelogActor = getChangelogActorData(actor);

  // 1. Fetch from external API if not provided
  const externalEmployees = employees || (await fetchExternalEmployees());
  console.log(`[SyncEmployees] Processing ${externalEmployees.length} employees from external source`);

  // 2. Sync offices first (single source of truth for both)
  await syncOfficesFromExternalEmployees(externalEmployees);
  const categoryMap = await getOfficeJobTitleCategoryMapSetting();
  const normalizedKnownTitles = new Set(
    [...categoryMap.staff, ...categoryMap.management].map(title => normalizeOfficeJobTitleValue(title)).filter(Boolean)
  );
  const autoSeedStaffTitles: string[] = [];

  for (const ext of externalEmployees) {
    const isSecurityDepartment = ext.department?.toLowerCase().includes('security') ?? false;
    const role: EmployeeRole = isSecurityDepartment && !ext.office_id ? 'on_site' : 'office';

    if (role !== 'office') continue;

    const normalizedTitle = normalizeOfficeJobTitleValue(ext.job_title);
    if (!normalizedTitle || normalizedKnownTitles.has(normalizedTitle)) continue;

    normalizedKnownTitles.add(normalizedTitle);
    autoSeedStaffTitles.push(ext.job_title!.trim().replace(/\s+/g, ' '));
  }

  if (autoSeedStaffTitles.length > 0) {
    categoryMap.staff = [...categoryMap.staff, ...autoSeedStaffTitles];

    await updateSystemSettingWithChangelog(
      OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
      serializeOfficeJobTitleCategoryMap(categoryMap),
      actor,
      'Auto-seeded uncategorized office job titles into staff during employee external sync.'
    );
  }

  const externalIds = externalEmployees.map(e => e.id);

  // 2. Fetch existing employees to avoid unnecessary hashing and for change detection
  const existingEmployees = await prisma.employee.findMany({
    where: { id: { in: externalIds } },
  });
  const existingMap = new Map(existingEmployees.map(e => [e.id, e]));

  let addedCount = 0;
  let updatedCount = 0;

  for (const ext of externalEmployees) {
    const isSecurityDepartment = ext.department?.toLowerCase().includes('security') ?? false;
    const role: EmployeeRole = isSecurityDepartment && !ext.office_id ? 'on_site' : 'office';
    const existing = existingMap.get(ext.id);

    if (!existing) {
      // New employee: use default password
      const hashedPassword = await hashPassword(DEFAULT_PASSWORD);
      const fieldModeState = resolveEmployeeFieldModeState({
        role,
        officeId: ext.office_id,
        jobTitle: ext.job_title,
        fieldModeEnabled: false,
        categoryMap,
      });

      await prisma.$transaction(async tx => {
        const newEmployee = await tx.employee.create({
          data: {
            id: ext.id,
            employeeNumber: ext.employee_number,
            personnelId: ext.personnel_id,
            nickname: ext.nickname,
            fullName: ext.full_name,
            jobTitle: ext.job_title,
            department: ext.department,
            phone: ext.phone,
            hashedPassword: hashedPassword,
            mustChangePassword: true,
            role,
            officeAttendanceMode: role === 'office' ? 'shift_based' : null,
            office: ext.office_id ? { connect: { id: ext.office_id } } : undefined,
            fieldModeEnabled: fieldModeState.fieldModeEnabled,
            status: true,
          },
        });

        await tx.employeePasswordHistory.create({
          data: {
            employeeId: newEmployee.id,
            hashedPassword,
          },
        });

        await tx.changelog.create({
          data: {
            action: 'CREATE',
            entityType: 'Employee',
            entityId: newEmployee.id,
            actor: changelogActor.actor,
            actorId: changelogActor.actorId,
            details: {
              employeeNumber: newEmployee.employeeNumber,
              fullName: newEmployee.fullName,
              personnelId: newEmployee.personnelId,
              nickname: newEmployee.nickname,
              jobTitle: newEmployee.jobTitle,
              department: newEmployee.department,
              phone: newEmployee.phone,
              role: newEmployee.role,
              officeAttendanceMode: newEmployee.officeAttendanceMode,
              officeId: newEmployee.officeId,
              fieldModeEnabled: newEmployee.fieldModeEnabled,
              status: newEmployee.status,
              mustChangePassword: newEmployee.mustChangePassword,
            },
          },
        });
      });

      addedCount++;
    } else {
      // Existing employee: only update if changed
      const updateData: Record<string, any> = {};
      const changes: Record<string, { from: any; to: any }> = {};

      const fieldsToCompare = [
        { key: 'employeeNumber', extKey: 'employee_number' },
        { key: 'personnelId', extKey: 'personnel_id' },
        { key: 'nickname', extKey: 'nickname' },
        { key: 'fullName', extKey: 'full_name' },
        { key: 'jobTitle', extKey: 'job_title' },
        { key: 'department', extKey: 'department' },
        { key: 'phone', extKey: 'phone' },
      ] as const;

      for (const field of fieldsToCompare) {
        const oldValue = (existing as any)[field.key];
        const newValue = (ext as any)[field.extKey];
        if (oldValue !== newValue) {
          updateData[field.key] = newValue;
          changes[field.key] = { from: oldValue, to: newValue };
        }
      }

      // Special handling for role
      if (existing.role !== role) {
        updateData.role = role;
        changes.role = { from: existing.role, to: role };
      }

      const nextOfficeAttendanceMode = role === 'office' ? existing.officeAttendanceMode ?? 'shift_based' : null;
      if (existing.officeAttendanceMode !== nextOfficeAttendanceMode) {
        updateData.officeAttendanceMode = nextOfficeAttendanceMode;
        changes.officeAttendanceMode = {
          from: existing.officeAttendanceMode,
          to: nextOfficeAttendanceMode,
        };
      }

      // Special handling for office
      if (existing.officeId !== ext.office_id) {
        updateData.office = ext.office_id ? { connect: { id: ext.office_id } } : { disconnect: true };
        changes.officeId = { from: existing.officeId, to: ext.office_id };
      }

      // Reactivate if deactivated
      if (existing.status === false) {
        updateData.status = true;
        updateData.deletedAt = null;
        changes.status = { from: false, to: true };
      }

      const normalizedFieldModeState = resolveEmployeeFieldModeState({
        role: (updateData.role as EmployeeRole | undefined) ?? existing.role,
        officeId: Object.prototype.hasOwnProperty.call(changes, 'officeId') ? ext.office_id : existing.officeId,
        jobTitle: (updateData.jobTitle as string | undefined) ?? existing.jobTitle,
        fieldModeEnabled: existing.fieldModeEnabled,
        categoryMap,
      });

      if (existing.fieldModeEnabled !== normalizedFieldModeState.fieldModeEnabled) {
        updateData.fieldModeEnabled = normalizedFieldModeState.fieldModeEnabled;
        changes.fieldModeEnabled = {
          from: existing.fieldModeEnabled,
          to: normalizedFieldModeState.fieldModeEnabled,
        };
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.$transaction(async tx => {
          const updatedEmployee = await tx.employee.update({
            where: { id: ext.id },
            data: updateData,
          });

          await tx.changelog.create({
            data: {
              action: 'UPDATE',
              entityType: 'Employee',
              entityId: updatedEmployee.id,
              actor: changelogActor.actor,
              actorId: changelogActor.actorId,
              details: {
                employeeNumber: updatedEmployee.employeeNumber,
                fullName: updatedEmployee.fullName,
                personnelId: updatedEmployee.personnelId,
                nickname: updatedEmployee.nickname,
                jobTitle: updatedEmployee.jobTitle,
                department: updatedEmployee.department,
                role: updatedEmployee.role,
                officeAttendanceMode: updatedEmployee.officeAttendanceMode,
                officeId: updatedEmployee.officeId,
                fieldModeEnabled: updatedEmployee.fieldModeEnabled,
                status: updatedEmployee.status,
                changes,
              },
            },
          });
        });
        updatedCount++;
      }
    }
  }

  // 3. Deactivate those not in external list
  const { deactivatedCount } = await deactivateEmployeesNotIn(externalIds, actor);

  console.log(
    `[SyncEmployees] Sync completed: ${addedCount} added, ${updatedCount} updated, ${deactivatedCount} deactivated`
  );

  // 4. Update last sync timestamp in Redis
  try {
    await redis.set(LAST_EMPLOYEE_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    console.error('[SyncEmployees] Failed to update last sync timestamp:', err);
  }

  return {
    added: addedCount,
    updated: updatedCount,
    deactivated: deactivatedCount,
  };
}
