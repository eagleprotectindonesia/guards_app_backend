import { EmployeeRole, LeaveRequestReason, LeaveRequestStatus, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { upsertEmployeeOfficeDayOverride } from './office-day-overrides';
import {
  ensureNoOfficeAttendanceConflictForLeaveRange,
  resolveRejectedPendingLeaveStatuses,
  upsertOfficeLeaveStatusesForDateKeys,
} from './office-attendance';
import { redis } from '../redis/client';
import { createLeaveRequestCreatedAdminNotifications } from './admin-notifications';
import { enqueueEmailEvent } from '../email-events';
import { getSystemSetting } from './settings';
import { resolveHolidayPolicyForEmployeeDate } from './holiday-calendar-entries';
import { listEmployeeOnsiteDayOffDateKeysInRange } from './onsite-day-offs';
import { listEmployeeOfficeDayOverridesForDates } from './office-day-overrides';

type TxLike = Prisma.TransactionClient | typeof prisma;
export const OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR = 'Overlapping pending leave request already exists';
export const FIXED_LEAVE_DURATION_ERROR = 'Selected leave type requires an exact policy duration';
export const ANNUAL_LEAVE_INSUFFICIENT_ERROR = 'Insufficient annual leave balance';
export const LEAVE_REASONS_REQUIRE_HR_APPROVAL_SETTING = 'LEAVE_REASONS_REQUIRE_HR_APPROVAL';
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

const adminLeaveRequestInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      role: true,
      department: true,
      officeId: true,
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

function getSickCycleEnd(cycleStart: Date) {
  return new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, 20));
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
          (
            await listEmployeeOfficeDayOverridesForDates(employee.id, dateKeys, tx)
          ).map(override => [override.date.toISOString().slice(0, 10), override.overrideType] as const)
        )
      : new Map<string, 'off' | 'shift_override'>();
  const scheduleByDate = await Promise.all(
    dateKeys.map(async dateKey => {
      const at = dateKeyToDate(dateKey);
      const holidayPolicy = await resolveHolidayPolicyForEmployeeDate({ date: at, department: employee.department ?? null }, tx);
      const weekday = at.getUTCDay();
      const isWeekday = weekday >= 1 && weekday <= 5;
      const isHolidayOff =
        holidayPolicy?.entry.affectsAttendance === true &&
        (holidayPolicy.entry.type === 'holiday' || holidayPolicy.entry.type === 'week_off') &&
        !holidayPolicy.marksAsWorkingDay;
      const isOnsiteOff = employee.role === 'on_site' && onsiteOffDateKeys.has(dateKey);
      const officeOverrideType = employee.role === 'office' ? officeOverridesByDate.get(dateKey) : null;
      const isOfficeOff = officeOverrideType === 'off';
      const isOfficeShiftOverride = officeOverrideType === 'shift_override';
      const isWorkingDayByRole =
        employee.role === 'office' ? (isOfficeShiftOverride ? true : isWeekday && !isOfficeOff) : isWeekday && !isOnsiteOff;
      return {
        dateKey,
        isWorkingDay: isWorkingDayByRole && !isHolidayOff,
      };
    })
  );

  return scheduleByDate.filter(item => item.isWorkingDay).map(item => item.dateKey);
}

function cycleStartKeyFromDateKey(dateKey: string) {
  return dateToDateKey(getSickCycleStart(dateKeyToDate(dateKey)));
}

function groupWorkingDateKeysBySickCycle(dateKeys: string[]) {
  const buckets = new Map<string, string[]>();
  for (const dateKey of dateKeys) {
    const cycleStartKey = cycleStartKeyFromDateKey(dateKey);
    const existing = buckets.get(cycleStartKey) ?? [];
    existing.push(dateKey);
    buckets.set(cycleStartKey, existing);
  }
  return buckets;
}

function countCalendarDaysInclusive(startDateKey: string, endDateKey: string) {
  return listDateKeysInclusive(startDateKey, endDateKey).length;
}

function parseHrApprovalReasons(rawValue: string | null | undefined) {
  if (!rawValue) return new Set<LeaveRequestReason>();
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return new Set<LeaveRequestReason>();
    const validReasons = new Set(Object.values(LeaveRequestReason));
    return new Set(
      parsed.filter((reason): reason is LeaveRequestReason => typeof reason === 'string' && validReasons.has(reason as LeaveRequestReason))
    );
  } catch {
    return new Set<LeaveRequestReason>();
  }
}

async function getHrApprovalReasons(tx: TxLike = prisma) {
  const setting = await getSystemSetting(LEAVE_REASONS_REQUIRE_HR_APPROVAL_SETTING);
  return parseHrApprovalReasons(setting?.value);
}

export async function isHrApprovalRequiredForLeaveRequest(params: {
  reason: LeaveRequestReason;
  startDate: Date;
  endDate: Date;
  tx?: TxLike;
}) {
  const hrReasons = await getHrApprovalReasons(params.tx);
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
    select: { id: true, role: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }
  if (employee.role === 'office') {
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

  if (employee.role === 'office') {
    await upsertOfficeLeaveStatusesForDateKeys({
      employeeId: employee.id,
      dateKeys: listDateKeysInclusive(params.startDate, params.endDate),
      status: 'pending_leave',
      note: `Pending leave request (${created.id})`,
    });
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

  const sendNotif = 0;

  if (sendNotif) {
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
          email: true,
        },
      });

      const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
      await Promise.all(
        admins.map(admin => {
          const notification = createdNotifications.find(item => item.adminId === admin.id);
          if (!notification || !admin.email) {
            return Promise.resolve();
          }

          const targetPath = targetPathByAdminId.get(admin.id) || '/admin/leave-requests';
          const targetUrl = `${webAppUrl}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;

          return enqueueEmailEvent({
            templateId: 'admin.leave_request_created',
            to: [
              {
                email: admin.email,
                name: admin.name,
              },
            ],
            context: {
              adminName: admin.name,
              notificationTitle: notification.title,
              notificationBody: notification.body,
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

function toPositiveNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildExistingNoDocPaidByCycleMap(
  priorApprovedSickRequests: Array<{
    attachments: string[];
    policySnapshot: Prisma.JsonValue | null;
    deductedAnnualDays: number;
    unpaidDays: number;
    cycleKey: Date | null;
  }>
) {
  const noDocPaidByCycle = new Map<string, number>();

  for (const prior of priorApprovedSickRequests) {
    if (prior.attachments.length > 0) {
      continue;
    }

    const snapshot = (prior.policySnapshot ?? {}) as Record<string, unknown>;
    const perCycle = snapshot.noDocPaidByCycle;
    if (perCycle && typeof perCycle === 'object' && !Array.isArray(perCycle)) {
      for (const [cycleStartKey, rawValue] of Object.entries(perCycle as Record<string, unknown>)) {
        const paid = toPositiveNumber(rawValue);
        if (paid <= 0) continue;
        noDocPaidByCycle.set(cycleStartKey, (noDocPaidByCycle.get(cycleStartKey) ?? 0) + paid);
      }
      continue;
    }

    const singleCyclePaid = toPositiveNumber(snapshot.noDocPaidDays);
    const singleCycleStart =
      typeof snapshot.cycleStart === 'string'
        ? snapshot.cycleStart
        : prior.cycleKey
          ? dateToDateKey(prior.cycleKey)
          : null;
    if (singleCyclePaid > 0 && singleCycleStart) {
      noDocPaidByCycle.set(singleCycleStart, (noDocPaidByCycle.get(singleCycleStart) ?? 0) + singleCyclePaid);
      continue;
    }

    const inferred = Math.max(0, toPositiveNumber(snapshot.workingDays) - prior.deductedAnnualDays - prior.unpaidDays);
    if (inferred > 0 && singleCycleStart) {
      noDocPaidByCycle.set(singleCycleStart, (noDocPaidByCycle.get(singleCycleStart) ?? 0) + inferred);
    }
  }

  return noDocPaidByCycle;
}

async function getOrCreateAnnualLeaveBalance(employeeId: string, year: number, tx: Prisma.TransactionClient) {
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
      entitledDays: 12,
      adjustedDays: 0,
      consumedDays: 0,
    },
  });
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

async function finalizeApprovedLeaveRequest(
  params: {
    request: LeaveRequestWithEmployee;
    adminId: string;
    adminNote?: string | null;
    now: Date;
  },
  trx: Prisma.TransactionClient
) {
  const request = params.request;
  const now = params.now;
  const startDateKey = dateToDateKey(request.startDate);
  const endDateKey = dateToDateKey(request.endDate);
  const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);
  const workingDateKeys = await listWorkingDateKeysInclusiveForEmployee(
    { id: request.employee.id, role: request.employee.role, department: request.employee.department ?? null },
    startDateKey,
    endDateKey,
    trx
  );
  const hasDocument = request.attachments.length > 0;
  assertFixedDurationRule(request.reason, startDateKey, endDateKey);

  if (request.reason === 'special_maternity' && request.employee.gender !== 'female') {
    throw new Error('Maternity leave is only allowed for female employees');
  }
  if (request.reason === 'special_paternity' && request.employee.gender !== 'male') {
    throw new Error('Paternity leave is only allowed for male employees');
  }
  if (request.reason === 'special_miscarriage' && !hasDocument) {
    throw new Error('Miscarriage leave requires supporting document');
  }

  let deductedAnnualDays = 0;
  let unpaidDays = 0;
  let isPaid = true;
  let policySnapshot: Record<string, unknown> = {
    mainCategory: getMainCategoryFromReason(request.reason),
    workingDays: workingDateKeys.length,
    calendarDays: dateKeys.length,
    hasDocument,
  };

  if (request.reason === 'annual') {
    const annual = await consumeAnnualLeaveDays(
      {
        employeeId: request.employeeId,
        leaveRequestId: request.id,
        dayKeys: workingDateKeys,
        adminId: params.adminId,
        allowShortfall: false,
        note: `Annual leave deduction (${request.id})`,
      },
      trx
    );
    deductedAnnualDays = annual.deductedDays;
    unpaidDays = 0;
    isPaid = true;
    policySnapshot = { ...policySnapshot, annualRequestedDays: workingDateKeys.length };
  } else if (request.reason === 'special_emergency') {
    const annual = await consumeAnnualLeaveDays(
      {
        employeeId: request.employeeId,
        leaveRequestId: request.id,
        dayKeys: workingDateKeys,
        adminId: params.adminId,
        allowShortfall: false,
        note: `Emergency leave annual deduction (${request.id})`,
      },
      trx
    );
    deductedAnnualDays = annual.deductedDays;
    isPaid = true;
    policySnapshot = { ...policySnapshot, emergencyDeductedDays: deductedAnnualDays };
  } else if (request.reason === 'sick') {
    const cycleBuckets = groupWorkingDateKeysBySickCycle(workingDateKeys);
    const cycleStartKeys = Array.from(cycleBuckets.keys()).sort((a, b) => a.localeCompare(b));
    const cycleStartDates = cycleStartKeys.map(cycleStartKey => dateKeyToDate(cycleStartKey));
    const approvedSickRequests = await trx.employeeLeaveRequest.findMany({
      where: {
        employeeId: request.employeeId,
        status: 'approved',
        reason: 'sick',
        id: { not: request.id },
        cycleKey: { in: cycleStartDates },
      },
      select: {
        attachments: true,
        policySnapshot: true,
        deductedAnnualDays: true,
        unpaidDays: true,
        cycleKey: true,
      },
    });

    const existingNoDocPaidByCycle = buildExistingNoDocPaidByCycleMap(approvedSickRequests);
    const currentNoDocPaidByCycle: Record<string, number> = {};
    const cycleBreakdown: Array<{
      cycleStart: string;
      cycleEnd: string;
      requestedWorkingDays: number;
      noDocAllowanceRemainingBeforeRequest: number;
      noDocPaidDaysCurrentRequest: number;
      deductedAnnualDays: number;
      unpaidDays: number;
    }> = [];

    for (const cycleStartKey of cycleStartKeys) {
      const cycleWorkingKeys = cycleBuckets.get(cycleStartKey) ?? [];
      const cycleStart = dateKeyToDate(cycleStartKey);
      const cycleEnd = getSickCycleEnd(cycleStart);
      const noDocUsedBefore = existingNoDocPaidByCycle.get(cycleStartKey) ?? 0;
      const noDocAllowanceRemainingBefore = Math.max(0, 1 - noDocUsedBefore);

      let noDocPaidDaysCurrentRequest = 0;
      let cycleDeducted = 0;
      let cycleUnpaid = 0;

      if (!hasDocument) {
        noDocPaidDaysCurrentRequest = Math.min(cycleWorkingKeys.length, noDocAllowanceRemainingBefore);
        const excessKeys = cycleWorkingKeys.slice(noDocPaidDaysCurrentRequest);
        if (excessKeys.length > 0) {
          const annual = await consumeAnnualLeaveDays(
            {
              employeeId: request.employeeId,
              leaveRequestId: request.id,
              dayKeys: excessKeys,
              adminId: params.adminId,
              allowShortfall: true,
              note: `Sick leave no-document fallback deduction (${request.id})`,
            },
            trx
          );
          cycleDeducted = annual.deductedDays;
          cycleUnpaid = excessKeys.length - annual.deductedDays;
        }
      }

      deductedAnnualDays += cycleDeducted;
      unpaidDays += cycleUnpaid;
      currentNoDocPaidByCycle[cycleStartKey] = noDocPaidDaysCurrentRequest;
      cycleBreakdown.push({
        cycleStart: cycleStartKey,
        cycleEnd: dateToDateKey(cycleEnd),
        requestedWorkingDays: cycleWorkingKeys.length,
        noDocAllowanceRemainingBeforeRequest: noDocAllowanceRemainingBefore,
        noDocPaidDaysCurrentRequest,
        deductedAnnualDays: cycleDeducted,
        unpaidDays: cycleUnpaid,
      });
    }
    isPaid = unpaidDays === 0;

    policySnapshot = {
      ...policySnapshot,
      cycleStart: request.cycleKey ? dateToDateKey(request.cycleKey) : cycleStartKeyFromDateKey(startDateKey),
      cycleEnd: dateToDateKey(getSickCycleEnd(request.cycleKey ?? getSickCycleStart(request.startDate))),
      noDocPaidDays: hasDocument ? 0 : Object.values(currentNoDocPaidByCycle).reduce((sum, value) => sum + value, 0),
      noDocPaidByCycle: currentNoDocPaidByCycle,
      cycleBreakdown,
    };
  }

  const updated = await trx.employeeLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      reviewedById: params.adminId,
      reviewedAt: now,
      adminNote: params.adminNote ?? null,
      isPaid,
      deductedAnnualDays,
      unpaidDays,
      policySnapshot: policySnapshot as Prisma.InputJsonValue,
      documentVerifiedAt: hasDocument ? now : null,
      documentVerifiedById: hasDocument ? params.adminId : null,
    },
  });

  let affectedOfficeOverrideCount = 0;
  let affectedOnsiteShiftCount = 0;

  if (request.employee.role === 'office') {
    await ensureNoOfficeAttendanceConflictForLeaveRange(request.employee.id, startDateKey, endDateKey);
    for (const dateKey of dateKeys) {
      await upsertEmployeeOfficeDayOverride(
        {
          employeeId: request.employee.id,
          date: dateKey,
          overrideType: 'off',
          note: `Leave approved (${updated.id})`,
          adminId: params.adminId,
        },
        trx
      );
    }
    await upsertOfficeLeaveStatusesForDateKeys({
      employeeId: request.employee.id,
      dateKeys,
      status: 'leave',
      note: `Approved leave request (${updated.id})`,
    });
    affectedOfficeOverrideCount = dateKeys.length;
  }

  if (request.employee.role === 'on_site') {
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

    const requiresHrApproval = await isHrApprovalRequiredForLeaveRequest({
      reason: request.reason,
      startDate: request.startDate,
      endDate: request.endDate,
      tx: trx,
    });

    if (!requiresHrApproval) {
      return finalizeApprovedLeaveRequest(
        {
          request,
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
          id: request.id,
          status: { in: ['pending', 'pending_manager'] },
          managerApprovedById: null,
        },
        data: {
          managerApprovedById: params.adminId,
          managerApprovedAt: now,
          managerApprovalNote: params.adminNote ?? null,
          status: request.status === 'pending_manager' ? 'approved' : 'pending_hr',
        },
      });
      if (managerUpdate.count === 0) {
        throw new Error('Manager approval already recorded for this annual leave request');
      }
    } else {
      const hrUpdate = await trx.employeeLeaveRequest.updateMany({
        where: {
          id: request.id,
          status: { in: ['pending', 'pending_hr'] },
          hrApprovedById: null,
        },
        data: {
          hrApprovedById: params.adminId,
          hrApprovedAt: now,
          hrApprovalNote: params.adminNote ?? null,
          status: request.status === 'pending_hr' ? 'approved' : 'pending_manager',
        },
      });
      if (hrUpdate.count === 0) {
        throw new Error('HR approval already recorded for this annual leave request');
      }
    }

    const afterStage = await trx.employeeLeaveRequest.findUniqueOrThrow({
      where: { id: request.id },
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
    await resolveRejectedPendingLeaveStatuses({
      employeeId: employee.id,
      dateKeys: listDateKeysInclusive(dateToDateKey(updated.startDate), dateToDateKey(updated.endDate)),
      now: new Date(),
    });
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
