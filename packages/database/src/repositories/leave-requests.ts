import { EmployeeGender, EmployeeRole, LeaveRequestReason, LeaveRequestStatus, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { upsertEmployeeOfficeDayOverride } from './office-day-overrides';
import {
  clearPendingOfficeLeaveStatusesForDateKeys,
  ensureNoOfficeAttendanceConflictForLeaveRange,
  resolveRejectedPendingLeaveStatuses,
  upsertOfficeLeaveStatusesForDateKeys,
} from './office-attendance';
import { redis } from '../redis/client';
import { createLeaveRequestCreatedAdminNotifications } from './admin-notifications';
import { logHrActivity } from './hr-activities';
import { enqueueEmailEvent } from '../email-events';
import { getSystemSetting } from './settings';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING } from '@repo/shared';
import { resolveHolidayPolicyForEmployeeDate } from './holiday-calendar-entries';
import { listEmployeeOnsiteDayOffDateKeysInRange } from './onsite-day-offs';
import { listEmployeeOfficeDayOverridesForDates } from './office-day-overrides';
import { computeAnnualLeaveEntitledDays } from './annual-leave-policy';

type TxLike = Prisma.TransactionClient | typeof prisma;
export const OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR = 'Overlapping pending leave request already exists';
export const FIXED_LEAVE_DURATION_ERROR = 'Selected leave type requires an exact policy duration';
export const ANNUAL_LEAVE_INSUFFICIENT_ERROR = 'Insufficient annual leave balance';
export const SICK_NO_DOC_REQUIRES_MANAGER_CONVERSION_ERROR =
  'Sick leave without document must be converted by manager first';
export const LEAVE_REASONS_REQUIRE_HR_APPROVAL_SETTING = 'LEAVE_REASONS_REQUIRE_HR_APPROVAL';
async function isOfficeAttendanceLeaveEffectsEnabled() {
  const setting = await getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING);
  return setting?.value === '1';
}
type AdminLeaveRequestSortField = 'startDate' | 'status' | 'createdAt';
const IN_PROGRESS_PENDING_STATUSES: LeaveRequestStatus[] = ['pending', 'pending_hr', 'pending_manager'];
type AdminLeaveRequestFilterParams = {
  statuses?: LeaveRequestStatus[];
  reasons?: LeaveRequestReason[];
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  employeeRoleFilter?: EmployeeRole;
  employeeWhere?: Prisma.EmployeeWhereInput;
  sortBy?: AdminLeaveRequestSortField;
  sortOrder?: Prisma.SortOrder;
};

export async function listLeaveRequestsOverlappingOfficeAttendance(params: {
  employeeIds: string[];
  startDate: Date;
  endDate: Date;
  tx?: TxLike;
}) {
  if (params.employeeIds.length === 0) {
    return [];
  }

  const targetTx = (params.tx ?? prisma) as TxLike;
  return targetTx.employeeLeaveRequest.findMany({
    where: {
      employeeId: { in: params.employeeIds },
      startDate: { lte: params.endDate },
      endDate: { gte: params.startDate },
    },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      reason: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

const adminLeaveRequestInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      role: true,
      department: true,
      officeId: true,
      gender: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  managerApprovedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  hrApprovedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  documentVerifiedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.EmployeeLeaveRequestInclude;

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function listDateKeysInclusive(startDateKey: string, endDateKey: string) {
  const keys: string[] = [];
  const cursor = dateKeyToDate(startDateKey);
  const end = dateKeyToDate(endDateKey);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateToDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function formatLeaveReasonLabel(reason: string) {
  return reason
    .split('_')
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

const FIXED_DURATION_DAYS_BY_REASON: Partial<Record<LeaveRequestReason, number>> = {
  family_marriage: 3,
  family_child_marriage: 2,
  family_child_circumcision_baptism: 2,
  family_death: 2,
  family_spouse_death: 2,
  special_paternity: 2,
  special_miscarriage: 45,
  special_maternity: 90,
};

function getMainCategoryFromReason(reason: LeaveRequestReason): 'sick' | 'family' | 'special' | 'annual' {
  if (reason === 'sick') return 'sick';
  if (reason === 'annual') return 'annual';
  if (reason.startsWith('family_')) return 'family';
  return 'special';
}

function getSickCycleStart(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (day >= 21) {
    return new Date(Date.UTC(year, month, 21));
  }
  return new Date(Date.UTC(year, month - 1, 21));
}

async function listWorkingDateKeysInclusiveForEmployee(
  employee: { id: string; role: EmployeeRole | null; department?: string | null },
  startDateKey: string,
  endDateKey: string,
  tx: TxLike = prisma
) {
  const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);
  const onsiteOffDateKeys =
    employee.role === 'on_site'
      ? new Set(await listEmployeeOnsiteDayOffDateKeysInRange(employee.id, startDateKey, endDateKey, tx))
      : new Set<string>();
  const officeOverridesByDate =
    employee.role === 'office'
      ? new Map(
          (await listEmployeeOfficeDayOverridesForDates(employee.id, dateKeys, tx)).map(
            override => [override.date.toISOString().slice(0, 10), override.overrideType] as const
          )
        )
      : new Map<string, 'off' | 'shift_override'>();
  const scheduleByDate = await Promise.all(
    dateKeys.map(async dateKey => {
      const at = dateKeyToDate(dateKey);
      const holidayPolicy = await resolveHolidayPolicyForEmployeeDate(
        { date: at, department: employee.department ?? null },
        tx
      );
      const isHolidayOff =
        holidayPolicy?.entry.affectsAttendance === true &&
        (holidayPolicy.entry.type === 'holiday' || holidayPolicy.entry.type === 'week_off') &&
        !holidayPolicy.marksAsWorkingDay;
      const isOnsiteOff = employee.role === 'on_site' && onsiteOffDateKeys.has(dateKey);
      const officeOverrideType = employee.role === 'office' ? officeOverridesByDate.get(dateKey) : null;
      const isOfficeShiftOverride = officeOverrideType === 'shift_override';
      const isWorkingDayByRole = employee.role === 'office' ? isOfficeShiftOverride : !isOnsiteOff;
      return {
        dateKey,
        isWorkingDay: isWorkingDayByRole && !isHolidayOff,
      };
    })
  );

  return scheduleByDate.filter(item => item.isWorkingDay).map(item => item.dateKey);
}

async function listOnsiteScheduledShiftDateKeysInRange(
  employeeId: string,
  startDateKey: string,
  endDateKey: string,
  tx: TxLike = prisma
) {
  const rows = await (tx as TxLike).shift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: {
        gte: dateKeyToDate(startDateKey),
        lte: dateKeyToDate(endDateKey),
      },
    },
    select: { date: true },
  });
  return new Set(rows.map(row => row.date.toISOString().slice(0, 10)));
}

function countCalendarDaysInclusive(startDateKey: string, endDateKey: string) {
  return listDateKeysInclusive(startDateKey, endDateKey).length;
}

async function shouldConvertNoDocSickLeaveToAnnual(params: {
  request: {
    startDate: Date;
    endDate: Date;
    reason: LeaveRequestReason;
    attachments: string[];
  };
  employee: {
    id: string;
    role: EmployeeRole | null;
    department?: string | null;
  };
  tx: TxLike;
}) {
  const { request } = params;
  if (request.reason !== 'sick' || request.attachments.length > 0) {
    return false;
  }
  return true;
}

export function buildManagerApprovalFields(params: { adminId: string; now: Date; adminNote?: string | null }) {
  return {
    managerApprovedById: params.adminId,
    managerApprovedAt: params.now,
    managerApprovalNote: params.adminNote ?? null,
  };
}

function parseHrApprovalReasons(rawValue: string | null | undefined) {
  if (!rawValue) return new Set<LeaveRequestReason>();
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return new Set<LeaveRequestReason>();
    const validReasons = new Set(Object.values(LeaveRequestReason));
    return new Set(
      parsed.filter(
        (reason): reason is LeaveRequestReason =>
          typeof reason === 'string' && validReasons.has(reason as LeaveRequestReason)
      )
    );
  } catch {
    return new Set<LeaveRequestReason>();
  }
}

async function getHrApprovalReasons() {
  const setting = await getSystemSetting(LEAVE_REASONS_REQUIRE_HR_APPROVAL_SETTING);
  return parseHrApprovalReasons(setting?.value);
}

export async function isHrApprovalRequiredForLeaveRequest(params: {
  reason: LeaveRequestReason;
  startDate: Date;
  endDate: Date;
}) {
  const hrReasons = await getHrApprovalReasons();
  const startDateKey = dateToDateKey(params.startDate);
  const endDateKey = dateToDateKey(params.endDate);
  const durationDays = countCalendarDaysInclusive(startDateKey, endDateKey);
  return hrReasons.has(params.reason) && durationDays > 1;
}

function normalizeDateRange(startDateKey: string, endDateKey: string) {
  if (startDateKey > endDateKey) {
    throw new Error('startDate must be before or equal to endDate');
  }

  return {
    startDate: dateKeyToDate(startDateKey),
    endDate: dateKeyToDate(endDateKey),
  };
}

function assertFixedDurationRule(reason: LeaveRequestReason, startDateKey: string, endDateKey: string) {
  const requiredDays = FIXED_DURATION_DAYS_BY_REASON[reason];
  if (!requiredDays) {
    return;
  }
  const selectedDays = countCalendarDaysInclusive(startDateKey, endDateKey);
  if (selectedDays !== requiredDays) {
    throw new Error(`${FIXED_LEAVE_DURATION_ERROR}: expected ${requiredDays} days`);
  }
}

function isOverlapConflictError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2004') {
    return false;
  }

  const databaseError = typeof error.meta?.database_error === 'string' ? error.meta.database_error : error.message;
  return databaseError.includes('employee_leave_requests_pending_no_overlap');
}

export async function createEmployeeLeaveRequest(
  params: {
    employeeId: string;
    startDate: string;
    endDate: string;
    reason: LeaveRequestReason;
    employeeNote?: string | null;
    attachments?: string[];
  },
  tx: TxLike = prisma
) {
  assertFixedDurationRule(params.reason, params.startDate, params.endDate);
  const { startDate, endDate } = normalizeDateRange(params.startDate, params.endDate);
  const targetTx = tx as TxLike;
  const startCycleKey = params.reason === 'sick' ? getSickCycleStart(startDate) : null;
  const requiresDocument = params.reason === 'special_miscarriage';
  const employee = await targetTx.employee.findUnique({
    where: { id: params.employeeId },
    select: { id: true, role: true, fullName: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }
  if (employee.role === 'office' && (await isOfficeAttendanceLeaveEffectsEnabled())) {
    await ensureNoOfficeAttendanceConflictForLeaveRange(employee.id, params.startDate, params.endDate);
  }

  const overlappingPendingRequest = await targetTx.employeeLeaveRequest.findFirst({
    where: {
      employeeId: params.employeeId,
      status: { in: IN_PROGRESS_PENDING_STATUSES },
      endDate: { gte: startDate },
      startDate: { lte: endDate },
    },
    select: {
      id: true,
    },
  });

  if (overlappingPendingRequest) {
    throw new Error(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
  }

  const created = await (async () => {
    try {
      return await targetTx.employeeLeaveRequest.create({
        data: {
          employeeId: params.employeeId,
          startDate,
          endDate,
          reason: params.reason,
          employeeNote: params.employeeNote ?? null,
          attachments: params.attachments ?? [],
          cycleKey: startCycleKey,
          requiresDocument,
          status: 'pending',
        },
      });
    } catch (error) {
      if (isOverlapConflictError(error)) {
        throw new Error(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
      }
      throw error;
    }
  })();

  if (employee.role === 'office' && (await isOfficeAttendanceLeaveEffectsEnabled())) {
    const officeEmployee = await targetTx.employee.findUnique({
      where: { id: employee.id },
      select: { id: true, role: true, department: true },
    });
    if (!officeEmployee) {
      throw new Error('Employee not found');
    }
    const workingDateKeys = await listWorkingDateKeysInclusiveForEmployee(
      officeEmployee,
      params.startDate,
      params.endDate,
      targetTx
    );
    await upsertOfficeLeaveStatusesForDateKeys(
      {
        employeeId: employee.id,
        dateKeys: workingDateKeys,
        status: 'pending_leave',
        note: `Pending leave request (${created.id})`,
      },
      targetTx
    );
  }

  await targetTx.changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: created.id,
      actor: 'system',
      details: {
        employeeId: params.employeeId,
        startDate: params.startDate,
        endDate: params.endDate,
        reason: params.reason,
        employeeNote: params.employeeNote ?? null,
        attachments: params.attachments ?? [],
        status: 'pending',
      },
    },
  });

  // Log HR activity
  await logHrActivity({
    id: `leave_request:${created.id}`,
    type: 'leave_request_created',
    employeeName: employee.fullName,
    details: `${params.reason.toUpperCase().replace('_', ' ')} Leave requested: ${new Date(params.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(params.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
  });

  const createdNotifications = await createLeaveRequestCreatedAdminNotifications(
    {
      leaveRequestId: created.id,
      employeeId: created.employeeId,
      startDate: created.startDate,
      endDate: created.endDate,
      reason: created.reason,
    },
    targetTx
  );

  await Promise.all(
    createdNotifications.map(notification =>
      redis.publish(
        `admin-notifications:admin:${notification.adminId}`,
        JSON.stringify({
          type: 'admin_notification_created',
          notification,
        })
      )
    )
  );

  const adminIds = Array.from(new Set(createdNotifications.map(notification => notification.adminId)));
  if (adminIds.length > 0) {
    const targetPathByAdminId = new Map<string, string>();
    for (const notification of createdNotifications) {
      const payload = (notification.payload ?? {}) as Record<string, unknown>;
      const targetPath = typeof payload.targetPath === 'string' ? payload.targetPath : '/admin/leave-requests';
      targetPathByAdminId.set(notification.adminId, targetPath);
    }

    const admins = await targetTx.admin.findMany({
      where: {
        id: { in: adminIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        leaveApprovalEmail: true,
      },
    });

    const webAppUrl = process.env.EMAIL_WEB_APP_URL || process.env.WEB_APP_URL || 'http://localhost:3000';
    await Promise.all(
      admins.map(admin => {
        const notification = createdNotifications.find(item => item.adminId === admin.id);
        if (!notification || !admin.leaveApprovalEmail) {
          return Promise.resolve();
        }
        const payload = (notification.payload ?? {}) as Record<string, unknown>;
        const leaveType =
          typeof payload.reason === 'string' && payload.reason.trim().length > 0
            ? formatLeaveReasonLabel(payload.reason)
            : formatLeaveReasonLabel(created.reason);

        const targetPath = targetPathByAdminId.get(admin.id) || '/admin/leave-requests';
        const targetUrl = `${webAppUrl}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;

        return enqueueEmailEvent({
          templateId: 'admin.leave_request_created',
          to: [
            {
              email: admin.leaveApprovalEmail,
              name: admin.name,
            },
          ],
          context: {
            adminName: admin.name,
            notificationTitle: notification.title,
            notificationBody: notification.body,
            leaveType,
            targetUrl,
          },
          metadata: {
            source: 'leave_request_created',
            leaveRequestId: created.id,
            adminId: admin.id,
          },
          idempotencyKey: `leave_request_created:${created.id}:${admin.id}`,
        });
      })
    );
  }

  return created;
}

export async function listEmployeeLeaveRequestsByEmployee(employeeId: string, tx: TxLike = prisma) {
  return (tx as TxLike).employeeLeaveRequest.findMany({
    where: { employeeId },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function listEmployeeLeaveRequestsForAdmin(params: AdminLeaveRequestFilterParams, tx: TxLike = prisma) {
  const where = buildAdminLeaveRequestWhere(params);
  const orderBy = buildAdminLeaveRequestOrderBy(params);

  return (tx as TxLike).employeeLeaveRequest.findMany({
    where,
    include: adminLeaveRequestInclude,
    orderBy,
  });
}

export async function listLeaveRequestFilterEmployeesForAdmin(
  params: AdminLeaveRequestFilterParams,
  tx: TxLike = prisma
) {
  const where = buildAdminLeaveRequestWhere(params);
  const targetTx = tx as TxLike;

  return targetTx.employeeLeaveRequest.findMany({
    where,
    select: {
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
        },
      },
    },
    distinct: ['employeeId'],
    orderBy: {
      employee: {
        fullName: 'asc',
      },
    },
  });
}

export async function getPaginatedEmployeeLeaveRequestsForAdmin(
  params: AdminLeaveRequestFilterParams & {
    skip: number;
    take: number;
  },
  tx: TxLike = prisma
) {
  const where = buildAdminLeaveRequestWhere(params);
  const orderBy = buildAdminLeaveRequestOrderBy(params);
  const targetTx = tx as TxLike;

  const [leaveRequests, totalCount] = await Promise.all([
    targetTx.employeeLeaveRequest.findMany({
      where,
      include: adminLeaveRequestInclude,
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    targetTx.employeeLeaveRequest.count({ where }),
  ]);

  return { leaveRequests, totalCount };
}

export async function getEmployeeLeaveRequestByIdForAdmin(requestId: string, tx: TxLike = prisma) {
  return (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: requestId },
    include: adminLeaveRequestInclude,
  });
}

function buildAdminLeaveRequestWhere(params: AdminLeaveRequestFilterParams): Prisma.EmployeeLeaveRequestWhereInput {
  const startDate = params.startDate ? dateKeyToDate(params.startDate) : undefined;
  const endDate = params.endDate ? dateKeyToDate(params.endDate) : undefined;
  const employeeFilters: Prisma.EmployeeWhereInput[] = [];

  if (params.employeeRoleFilter) {
    employeeFilters.push({ role: params.employeeRoleFilter });
  }

  if (params.employeeWhere) {
    employeeFilters.push(params.employeeWhere);
  }

  const employeeFilter =
    employeeFilters.length === 0
      ? undefined
      : employeeFilters.length === 1
        ? employeeFilters[0]
        : { AND: employeeFilters };

  return {
    status: params.statuses && params.statuses.length > 0 ? { in: params.statuses } : undefined,
    reason: params.reasons && params.reasons.length > 0 ? { in: params.reasons } : undefined,
    employeeId: params.employeeId,
    ...(startDate || endDate
      ? {
          AND: [startDate ? { endDate: { gte: startDate } } : {}, endDate ? { startDate: { lte: endDate } } : {}],
        }
      : {}),
    employee: employeeFilter ? { is: employeeFilter } : undefined,
  };
}

function buildAdminLeaveRequestOrderBy(
  params: Pick<AdminLeaveRequestFilterParams, 'sortBy' | 'sortOrder'>
): Prisma.EmployeeLeaveRequestOrderByWithRelationInput[] {
  const sortOrder: Prisma.SortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
  const sortBy: AdminLeaveRequestSortField = params.sortBy ?? 'createdAt';

  switch (sortBy) {
    case 'startDate':
      return [{ startDate: sortOrder }, { createdAt: 'desc' }];
    case 'status':
      return [{ status: sortOrder }, { createdAt: 'desc' }];
    default:
      return [{ createdAt: sortOrder }];
  }
}

type AnnualLeaveConsumptionResult = {
  deductedDays: number;
  shortfallDays: number;
};

async function getOrCreateAnnualLeaveBalance(employeeId: string, year: number, tx: Prisma.TransactionClient) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { dateOfJoining: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }
  const entitledDays = computeAnnualLeaveEntitledDays({ dateOfJoining: employee.dateOfJoining, year });
  return tx.employeeAnnualLeaveBalance.upsert({
    where: {
      employeeId_year: {
        employeeId,
        year,
      },
    },
    update: {},
    create: {
      employeeId,
      year,
      entitledDays,
      adjustedDays: 0,
      consumedDays: 0,
    },
  });
}

export async function calculateAnnualLeaveConsumption(
  params: {
    employeeId: string;
    dayKeys: string[];
  },
  tx: TxLike = prisma
): Promise<AnnualLeaveConsumptionResult> {
  if (params.dayKeys.length === 0) {
    return { deductedDays: 0, shortfallDays: 0 };
  }
  const employee = await (tx as TxLike).employee.findUnique({
    where: { id: params.employeeId },
    select: { dateOfJoining: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }

  const daysByYear = new Map<number, number>();
  for (const dayKey of params.dayKeys) {
    const year = dateKeyToDate(dayKey).getUTCFullYear();
    daysByYear.set(year, (daysByYear.get(year) ?? 0) + 1);
  }

  const sortedYears = Array.from(daysByYear.keys()).sort((a, b) => a - b);
  let remainingToConsume = params.dayKeys.length;
  let deductedDays = 0;

  for (const year of sortedYears) {
    if (remainingToConsume <= 0) {
      break;
    }

    const balance = await (tx as TxLike).employeeAnnualLeaveBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId: params.employeeId,
          year,
        },
      },
    });

    const available = balance
      ? Math.max(0, balance.entitledDays + balance.adjustedDays - balance.consumedDays)
      : computeAnnualLeaveEntitledDays({ dateOfJoining: employee.dateOfJoining, year });

    const requestedInYear = daysByYear.get(year) ?? 0;
    const canConsume = Math.min(requestedInYear, remainingToConsume, available);

    deductedDays += canConsume;
    remainingToConsume -= canConsume;
  }

  return {
    deductedDays,
    shortfallDays: Math.max(0, remainingToConsume),
  };
}

async function consumeAnnualLeaveDays(
  params: {
    employeeId: string;
    leaveRequestId: string;
    dayKeys: string[];
    adminId: string;
    allowShortfall: boolean;
    note: string;
  },
  tx: Prisma.TransactionClient
): Promise<AnnualLeaveConsumptionResult> {
  if (params.dayKeys.length === 0) {
    return { deductedDays: 0, shortfallDays: 0 };
  }

  const daysByYear = new Map<number, number>();
  for (const dayKey of params.dayKeys) {
    const year = dateKeyToDate(dayKey).getUTCFullYear();
    daysByYear.set(year, (daysByYear.get(year) ?? 0) + 1);
  }

  const sortedYears = Array.from(daysByYear.keys()).sort((a, b) => a - b);
  let remainingToConsume = params.dayKeys.length;
  let deductedDays = 0;

  for (const year of sortedYears) {
    if (remainingToConsume <= 0) {
      break;
    }

    const balance = await getOrCreateAnnualLeaveBalance(params.employeeId, year, tx);
    const available = Math.max(0, balance.entitledDays + balance.adjustedDays - balance.consumedDays);
    const requestedInYear = daysByYear.get(year) ?? 0;
    const canConsume = Math.min(requestedInYear, remainingToConsume, available);

    if (canConsume > 0) {
      await tx.employeeAnnualLeaveBalance.update({
        where: { id: balance.id },
        data: {
          consumedDays: {
            increment: canConsume,
          },
        },
      });

      await tx.employeeLeaveLedgerEntry.create({
        data: {
          employeeId: params.employeeId,
          leaveRequestId: params.leaveRequestId,
          year,
          entryType: 'deduction',
          days: canConsume,
          note: params.note,
          createdById: params.adminId,
        },
      });
    }

    deductedDays += canConsume;
    remainingToConsume -= canConsume;
  }

  if (!params.allowShortfall && remainingToConsume > 0) {
    throw new Error(ANNUAL_LEAVE_INSUFFICIENT_ERROR);
  }

  return {
    deductedDays,
    shortfallDays: Math.max(0, remainingToConsume),
  };
}

export async function cancelEmployeeLeaveRequestByEmployee(
  params: {
    requestId: string;
    employeeId: string;
  },
  tx: TxLike = prisma
) {
  const request = await (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!request || request.employeeId !== params.employeeId) {
    throw new Error('Leave request not found');
  }

  if (!IN_PROGRESS_PENDING_STATUSES.includes(request.status)) {
    throw new Error('Only pending leave requests can be cancelled');
  }

  const updated = await (tx as TxLike).employeeLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: updated.id,
      actor: 'system',
      details: {
        employeeId: updated.employeeId,
        status: 'cancelled',
      },
    },
  });

  const employee = await (tx as TxLike).employee.findUnique({
    where: { id: updated.employeeId },
    select: { id: true, role: true, department: true },
  });
  if (employee?.role === 'office' && (await isOfficeAttendanceLeaveEffectsEnabled())) {
    const workingDateKeys = await listWorkingDateKeysInclusiveForEmployee(
      employee,
      dateToDateKey(updated.startDate),
      dateToDateKey(updated.endDate),
      tx
    );
    await clearPendingOfficeLeaveStatusesForDateKeys(
      {
        employeeId: employee.id,
        dateKeys: workingDateKeys,
        now: new Date(),
      },
      tx
    );
  }

  return updated;
}

type LeaveApprovalMode = 'manager' | 'hr' | 'superadmin';
type LeaveRequestWithEmployee = Prisma.EmployeeLeaveRequestGetPayload<{
  include: {
    employee: {
      select: {
        id: true;
        role: true;
        gender: true;
        department: true;
      };
    };
  };
}>;

export type LeavePolicySnapshot = {
  mainCategory?: 'sick' | 'family' | 'special' | 'annual';
  workingDays?: number;
  calendarDays?: number;
  hasDocument?: boolean;
  deductionMode?: 'provisional' | 'final';
  coverageMissingDates?: string[];
  reconciledAt?: string;
  reconciliationDeltaDays?: number;
  annualRequestedDays?: number;
  emergencyDeductedDays?: number;
};

export type LeavePolicyOutcomeProjection = {
  isPaid: boolean;
  deductedAnnualDays: number;
  unpaidDays: number;
  policySnapshot: LeavePolicySnapshot;
  dateKeys: string[];
  workingDateKeys: string[];
};

export async function projectLeavePolicyOutcome(
  params: {
    request: {
      id: string;
      startDate: Date;
      endDate: Date;
      reason: LeaveRequestReason;
      attachments: string[];
      cycleKey?: Date | null;
    };
    employee: {
      id: string;
      role: EmployeeRole | null;
      gender: EmployeeGender | null;
      department?: string | null;
    };
  },
  tx: TxLike = prisma
): Promise<LeavePolicyOutcomeProjection> {
  const { request, employee } = params;
  const startDateKey = dateToDateKey(request.startDate);
  const endDateKey = dateToDateKey(request.endDate);
  const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);
  const workingDateKeys = await listWorkingDateKeysInclusiveForEmployee(
    { id: employee.id, role: employee.role, department: employee.department ?? null },
    startDateKey,
    endDateKey,
    tx
  );
  const hasDocument = request.attachments.length > 0;
  assertFixedDurationRule(request.reason, startDateKey, endDateKey);

  if (request.reason === 'special_maternity' && employee.gender !== 'female') {
    throw new Error('Maternity leave is only allowed for female employees');
  }
  if (request.reason === 'special_paternity' && employee.gender !== 'male') {
    throw new Error('Paternity leave is only allowed for male employees');
  }
  if (request.reason === 'special_miscarriage' && !hasDocument) {
    throw new Error('Miscarriage leave requires supporting document');
  }

  let deductedAnnualDays = 0;
  let unpaidDays = 0;
  let isPaid = true;
  let deductionMode: 'provisional' | 'final' = 'final';
  let coverageMissingDates: string[] = [];
  if (employee.role === 'on_site') {
    const onsiteOffDateKeys = new Set(
      await listEmployeeOnsiteDayOffDateKeysInRange(employee.id, startDateKey, endDateKey, tx)
    );
    const onsiteShiftDateKeys = await listOnsiteScheduledShiftDateKeysInRange(
      employee.id,
      startDateKey,
      endDateKey,
      tx
    );
    const todayKey = dateToDateKey(new Date());
    coverageMissingDates = workingDateKeys.filter(
      dateKey => dateKey >= todayKey && !onsiteOffDateKeys.has(dateKey) && !onsiteShiftDateKeys.has(dateKey)
    );
    if (coverageMissingDates.length > 0) {
      deductionMode = 'provisional';
    }
  }
  let policySnapshot: LeavePolicySnapshot = {
    mainCategory: getMainCategoryFromReason(request.reason),
    workingDays: workingDateKeys.length,
    calendarDays: dateKeys.length,
    hasDocument,
    deductionMode,
    coverageMissingDates,
  };

  if (request.reason === 'annual') {
    const annual = await calculateAnnualLeaveConsumption(
      {
        employeeId: employee.id,
        dayKeys: workingDateKeys,
      },
      tx
    );
    deductedAnnualDays = annual.deductedDays;
    unpaidDays = annual.shortfallDays;
    isPaid = unpaidDays === 0;
    policySnapshot = { ...policySnapshot, annualRequestedDays: workingDateKeys.length };
  } else if (request.reason === 'special_emergency') {
    const annual = await calculateAnnualLeaveConsumption(
      {
        employeeId: employee.id,
        dayKeys: workingDateKeys,
      },
      tx
    );
    deductedAnnualDays = annual.deductedDays;
    unpaidDays = annual.shortfallDays;
    isPaid = unpaidDays === 0;
    policySnapshot = { ...policySnapshot, emergencyDeductedDays: deductedAnnualDays };
  } else if (request.reason === 'sick') {
    isPaid = true;
  }

  return {
    isPaid,
    deductedAnnualDays,
    unpaidDays,
    policySnapshot,
    dateKeys,
    workingDateKeys,
  };
}

async function finalizeApprovedLeaveRequest(
  params: {
    request: LeaveRequestWithEmployee;
    adminId: string;
    adminNote?: string | null;
    now: Date;
  },
  trx: Prisma.TransactionClient
) {
  const { request, now } = params;
  const outcome = await projectLeavePolicyOutcome(
    {
      request: {
        id: request.id,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason,
        attachments: request.attachments,
        cycleKey: request.cycleKey,
      },
      employee: {
        id: request.employee.id,
        role: request.employee.role,
        gender: request.employee.gender,
        department: request.employee.department,
      },
    },
    trx
  );

  // Apply actual annual leave deductions if needed
  if (outcome.deductedAnnualDays > 0) {
    if (request.reason === 'annual') {
      await consumeAnnualLeaveDays(
        {
          employeeId: request.employeeId,
          leaveRequestId: request.id,
          dayKeys: outcome.workingDateKeys,
          adminId: params.adminId,
          allowShortfall: true,
          note: `Annual leave deduction (${request.id})`,
        },
        trx
      );
    } else if (request.reason === 'special_emergency') {
      await consumeAnnualLeaveDays(
        {
          employeeId: request.employeeId,
          leaveRequestId: request.id,
          dayKeys: outcome.workingDateKeys,
          adminId: params.adminId,
          allowShortfall: true,
          note: `Emergency leave annual deduction (${request.id})`,
        },
        trx
      );
    }
  }

  const updated = await trx.employeeLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      reviewedById: params.adminId,
      reviewedAt: now,
      adminNote: params.adminNote ?? null,
      ...buildManagerApprovalFields({ adminId: params.adminId, now, adminNote: params.adminNote }),
      isPaid: outcome.isPaid,
      deductedAnnualDays: outcome.deductedAnnualDays,
      unpaidDays: outcome.unpaidDays,
      policySnapshot: outcome.policySnapshot as Prisma.InputJsonValue,
      documentVerifiedAt: request.attachments.length > 0 ? now : null,
      documentVerifiedById: request.attachments.length > 0 ? params.adminId : null,
    },
  });

  let affectedOfficeOverrideCount = 0;
  let affectedOnsiteShiftCount = 0;

  if (request.employee.role === 'office') {
    const startDateKey = dateToDateKey(request.startDate);
    const endDateKey = dateToDateKey(request.endDate);
    await ensureNoOfficeAttendanceConflictForLeaveRange(request.employee.id, startDateKey, endDateKey);
    for (const dateKey of outcome.dateKeys) {
      await upsertEmployeeOfficeDayOverride(
        {
          employeeId: request.employee.id,
          date: dateKey,
          overrideType: 'off',
          note: `Leave approved (${updated.id})`,
          adminId: params.adminId,
          // Leave approval already computed and applied deductions; avoid same-tx
          // reconciliation from immediately reversing it before coverage settles.
          skipLeaveReconciliation: true,
        },
        trx
      );
    }
    if (await isOfficeAttendanceLeaveEffectsEnabled()) {
      await upsertOfficeLeaveStatusesForDateKeys(
        {
          employeeId: request.employee.id,
          dateKeys: outcome.workingDateKeys,
          status: 'leave',
          note: `Approved leave request (${updated.id})`,
        },
        trx
      );
    }
    affectedOfficeOverrideCount = outcome.dateKeys.length;
  }

  if (request.employee.role === 'on_site') {
    const startDateKey = dateToDateKey(request.startDate);
    const endDateKey = dateToDateKey(request.endDate);
    const cancelled = await trx.shift.updateMany({
      where: {
        employeeId: request.employee.id,
        status: 'scheduled',
        deletedAt: null,
        startsAt: { gte: now },
        date: {
          gte: dateKeyToDate(startDateKey),
          lte: dateKeyToDate(endDateKey),
        },
      },
      data: {
        status: 'cancelled',
        lastUpdatedById: params.adminId,
        note: `Cancelled due to approved leave request ${updated.id}`,
      },
    });
    affectedOnsiteShiftCount = cancelled.count;
  }

  await trx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: updated.id,
      actor: 'admin',
      actorId: params.adminId,
      details: {
        employeeId: updated.employeeId,
        status: 'approved',
        reason: updated.reason,
        employeeNote: updated.employeeNote,
        adminNote: updated.adminNote,
        attachments: updated.attachments,
        deductedAnnualDays: updated.deductedAnnualDays,
        unpaidDays: updated.unpaidDays,
        isPaid: updated.isPaid,
        policySnapshot: updated.policySnapshot,
        affectedOfficeOverrideCount,
        affectedOnsiteShiftCount,
      },
    },
  });

  return { updated, affectedOnsiteShiftCount };
}

export async function reconcileApprovedOnsiteLeavesForCoverage(params: {
  employeeId: string;
  startDateKey: string;
  endDateKey: string;
  adminId?: string;
}) {
  const now = new Date();
  return prisma.$transaction(async trx => {
    const requests = await trx.employeeLeaveRequest.findMany({
      where: {
        employeeId: params.employeeId,
        status: 'approved',
        employee: { role: 'on_site' },
        endDate: { gte: dateKeyToDate(params.startDateKey) },
        startDate: { lte: dateKeyToDate(params.endDateKey) },
      },
      include: {
        employee: {
          select: {
            id: true,
            role: true,
            gender: true,
            department: true,
          },
        },
      },
    });

    for (const request of requests) {
      const projected = await projectLeavePolicyOutcome(
        {
          request: {
            id: request.id,
            startDate: request.startDate,
            endDate: request.endDate,
            reason: request.reason,
            attachments: request.attachments,
            cycleKey: request.cycleKey,
          },
          employee: request.employee,
        },
        trx
      );

      const delta = projected.deductedAnnualDays - request.deductedAnnualDays;
      if (delta !== 0) {
        const year = request.startDate.getUTCFullYear();
        const balance = await getOrCreateAnnualLeaveBalance(request.employeeId, year, trx);
        await trx.employeeAnnualLeaveBalance.update({
          where: { id: balance.id },
          data: {
            consumedDays: {
              increment: delta,
            },
          },
        });
        await trx.employeeLeaveLedgerEntry.create({
          data: {
            employeeId: request.employeeId,
            leaveRequestId: request.id,
            year,
            entryType: delta > 0 ? 'deduction' : 'reversal',
            days: Math.abs(delta),
            note: `Leave reconciliation (${request.id})`,
            createdById: params.adminId ?? null,
          },
        });
      }

      await trx.employeeLeaveRequest.update({
        where: { id: request.id },
        data: {
          isPaid: projected.unpaidDays === 0,
          deductedAnnualDays: projected.deductedAnnualDays,
          unpaidDays: projected.unpaidDays,
          policySnapshot: {
            ...(projected.policySnapshot as Record<string, unknown>),
            reconciledAt: dateToDateKey(now),
            reconciliationDeltaDays: delta,
            deductionMode: 'final',
            coverageMissingDates: [],
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
}

export async function approveEmployeeLeaveRequest(params: {
  requestId: string;
  adminId: string;
  adminNote?: string | null;
  approvalMode?: LeaveApprovalMode;
}) {
  const now = new Date();
  const approvalMode = params.approvalMode ?? 'manager';

  const result = await prisma.$transaction(async trx => {
    const request = await trx.employeeLeaveRequest.findUnique({
      where: { id: params.requestId },
      include: {
        employee: {
          select: {
            id: true,
            role: true,
            gender: true,
            department: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error('Leave request not found');
    }

    if (!IN_PROGRESS_PENDING_STATUSES.includes(request.status)) {
      throw new Error('Only pending leave requests can be approved');
    }

    const needsManagerConversion = await shouldConvertNoDocSickLeaveToAnnual({
      request,
      employee: request.employee,
      tx: trx,
    });

    if (needsManagerConversion && approvalMode !== 'manager') {
      throw new Error(SICK_NO_DOC_REQUIRES_MANAGER_CONVERSION_ERROR);
    }

    let effectiveRequest = request;
    if (needsManagerConversion) {
      effectiveRequest = await trx.employeeLeaveRequest.update({
        where: { id: request.id },
        data: {
          reason: 'annual',
          cycleKey: null,
          requiresDocument: false,
        },
        include: {
          employee: {
            select: {
              id: true,
              role: true,
              gender: true,
              department: true,
            },
          },
        },
      });
    }

    const requiresHrApproval = await isHrApprovalRequiredForLeaveRequest({
      reason: effectiveRequest.reason,
      startDate: request.startDate,
      endDate: request.endDate,
    });

    if (!requiresHrApproval) {
      return finalizeApprovedLeaveRequest(
        {
          request: effectiveRequest,
          adminId: params.adminId,
          adminNote: params.adminNote,
          now,
        },
        trx
      );
    }

    if (approvalMode === 'manager') {
      const managerUpdate = await trx.employeeLeaveRequest.updateMany({
        where: {
          id: effectiveRequest.id,
          status: { in: ['pending', 'pending_manager'] },
          managerApprovedById: null,
        },
        data: {
          managerApprovedById: params.adminId,
          managerApprovedAt: now,
          managerApprovalNote: params.adminNote ?? null,
          status: effectiveRequest.status === 'pending_manager' ? 'approved' : 'pending_hr',
        },
      });
      if (managerUpdate.count === 0) {
        throw new Error('Manager approval already recorded for this annual leave request');
      }
    } else {
      const hrUpdate = await trx.employeeLeaveRequest.updateMany({
        where: {
          id: effectiveRequest.id,
          status: { in: ['pending', 'pending_hr'] },
          hrApprovedById: null,
        },
        data: {
          hrApprovedById: params.adminId,
          hrApprovedAt: now,
          hrApprovalNote: params.adminNote ?? null,
          status: effectiveRequest.status === 'pending_hr' ? 'approved' : 'pending_manager',
        },
      });
      if (hrUpdate.count === 0) {
        throw new Error('HR approval already recorded for this annual leave request');
      }
    }

    const afterStage = await trx.employeeLeaveRequest.findUniqueOrThrow({
      where: { id: effectiveRequest.id },
      include: {
        employee: {
          select: {
            id: true,
            role: true,
            gender: true,
            department: true,
          },
        },
      },
    });

    if (afterStage.status !== 'approved') {
      await trx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'EmployeeLeaveRequest',
          entityId: afterStage.id,
          actor: 'admin',
          actorId: params.adminId,
          details: {
            employeeId: afterStage.employeeId,
            reason: afterStage.reason,
            status: afterStage.status,
            annualApprovalStage: approvalMode,
            managerApprovedById: afterStage.managerApprovedById,
            managerApprovedAt: afterStage.managerApprovedAt,
            hrApprovedById: afterStage.hrApprovedById,
            hrApprovedAt: afterStage.hrApprovedAt,
          },
        },
      });
      return { updated: afterStage, affectedOnsiteShiftCount: 0 };
    }

    return finalizeApprovedLeaveRequest(
      {
        request: afterStage,
        adminId: params.adminId,
        adminNote: params.adminNote,
        now,
      },
      trx
    );
  });

  if (result.affectedOnsiteShiftCount > 0) {
    await redis.publish(
      'events:shifts',
      JSON.stringify({ type: 'SHIFT_UPDATED_FROM_LEAVE', leaveRequestId: params.requestId })
    );
  }

  return result.updated;
}

export async function rejectEmployeeLeaveRequest(
  params: {
    requestId: string;
    adminId: string;
    adminNote?: string | null;
  },
  tx: TxLike = prisma
) {
  const request = await (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!request) {
    throw new Error('Leave request not found');
  }

  if (!IN_PROGRESS_PENDING_STATUSES.includes(request.status)) {
    throw new Error('Only pending leave requests can be rejected');
  }

  const updated = await (tx as TxLike).employeeLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'rejected',
      reviewedById: params.adminId,
      reviewedAt: new Date(),
      adminNote: params.adminNote ?? null,
    },
  });

  const employee = await (tx as TxLike).employee.findUnique({
    where: { id: updated.employeeId },
    select: { id: true, role: true },
  });
  if (employee?.role === 'office') {
    await resolveRejectedPendingLeaveStatuses(
      {
        employeeId: employee.id,
        dateKeys: await listWorkingDateKeysInclusiveForEmployee(
          {
            id: employee.id,
            role: employee.role,
            department: null,
          },
          dateToDateKey(updated.startDate),
          dateToDateKey(updated.endDate),
          tx
        ),
        now: new Date(),
      },
      tx
    );
  }

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: updated.id,
      actor: 'admin',
      actorId: params.adminId,
      details: {
        employeeId: updated.employeeId,
        status: 'rejected',
        reason: updated.reason,
        employeeNote: updated.employeeNote,
        adminNote: updated.adminNote,
        attachments: updated.attachments,
      },
    },
  });

  return updated;
}

export async function cancelOverlappingPendingLeaveRequestsByAttendance(params: {
  employeeId: string;
  attendanceId: string;
  businessDate: Date;
}) {
  const dateKey = dateToDateKey(params.businessDate);
  const start = dateKeyToDate(dateKey);
  const end = dateKeyToDate(dateKey);
  const now = new Date();

  const requests = await prisma.employeeLeaveRequest.findMany({
    where: {
      employeeId: params.employeeId,
      status: { in: IN_PROGRESS_PENDING_STATUSES },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: {
      id: true,
      employeeId: true,
      reason: true,
      employeeNote: true,
      attachments: true,
      startDate: true,
      endDate: true,
    },
  });

  if (requests.length === 0) {
    return { cancelledCount: 0 };
  }

  await prisma.$transaction(async tx => {
    for (const request of requests) {
      await tx.employeeLeaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
        },
      });

      const employee = await tx.employee.findUnique({
        where: { id: request.employeeId },
        select: { id: true, role: true, department: true },
      });

      if (employee?.role === 'office') {
        const workingDateKeys = await listWorkingDateKeysInclusiveForEmployee(
          employee,
          dateToDateKey(request.startDate),
          dateToDateKey(request.endDate),
          tx
        );
        await tx.officeAttendance.deleteMany({
          where: {
            employeeId: employee.id,
            businessDate: dateKeyToDate(dateKey),
            status: 'pending_leave',
          },
        });
        const remainingDateKeys = workingDateKeys.filter(key => key !== dateKey);
        await clearPendingOfficeLeaveStatusesForDateKeys(
          {
            employeeId: employee.id,
            dateKeys: remainingDateKeys,
            now,
          },
          tx
        );
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'EmployeeLeaveRequest',
          entityId: request.id,
          actor: 'system',
          details: {
            employeeId: request.employeeId,
            status: 'cancelled',
            reason: request.reason,
            employeeNote: request.employeeNote,
            attachments: request.attachments,
            cancelledBy: 'attendance',
            attendanceId: params.attendanceId,
            attendanceDate: dateKey,
          },
        },
      });
    }
  });

  return { cancelledCount: requests.length };
}

export async function getActiveLeavesCountForDate(date: Date = new Date(), role?: 'office' | 'on_site'): Promise<number> {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  return prisma.employeeLeaveRequest.count({
    where: {
      status: 'approved',
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay },
      ...(role && { employee: { role } }),
    },
  });
}

export async function getPendingLeaveRequestsCount(): Promise<number> {
  return prisma.employeeLeaveRequest.count({
    where: {
      status: { in: ['pending', 'pending_hr', 'pending_manager'] },
    },
  });
}

export async function getLeaveApprovedTodayCount(date: Date = new Date()): Promise<number> {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  return prisma.employeeLeaveRequest.count({
    where: {
      status: 'approved',
      OR: [
        { hrApprovedAt: { gte: startOfDay, lte: endOfDay } },
        { managerApprovedAt: { gte: startOfDay, lte: endOfDay } },
      ],
    },
  });
}

export async function getLeaveRejectedTodayCount(date: Date = new Date()): Promise<number> {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  return prisma.employeeLeaveRequest.count({
    where: {
      status: 'rejected',
      reviewedAt: { gte: startOfDay, lte: endOfDay },
    },
  });
}
