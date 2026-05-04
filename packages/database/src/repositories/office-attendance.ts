import { db as prisma } from '../prisma/client';
import { Prisma, OfficeAttendanceStatus } from '@prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { resolveOfficeAttendanceContextForEmployee } from './office-attendance-context';
import { getSystemSetting } from './settings';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING } from '@repo/shared';

export async function getOfficeAttendanceById(id: string) {
  return prisma.officeAttendance.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          fullName: true,
          phone: true,
          employeeNumber: true,
        },
      },
      office: {
        select: {
          name: true,
          address: true,
        },
      },
      officeShift: {
        include: {
          officeShiftType: true,
        },
      },
    },
  });
}

export async function recordOfficeAttendance(params: {
  officeId?: string | null;
  officeShiftId?: string | null;
  employeeId: string;
  status: OfficeAttendanceStatus;
  picture?: string;
  metadata?: any;
  recordedAt?: Date;
  businessDate?: Date;
}) {
  const { officeId, officeShiftId, employeeId, status, picture, metadata, recordedAt, businessDate } = params;
  const normalizedRecordedAt = recordedAt || new Date();

  try {
    const attendance = await prisma.officeAttendance.create({
      data: {
        officeId,
        officeShiftId,
        employeeId,
        businessDate,
        recordedAt: normalizedRecordedAt,
        status,
        picture,
        metadata,
      },
    });

    return { attendance, created: true as const };
  } catch (error) {
    if (
      officeShiftId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existingAttendance = await prisma.officeAttendance.findFirst({
        where: {
          officeShiftId,
          status,
        },
        orderBy: {
          recordedAt: 'asc',
        },
      });

      if (existingAttendance) {
        return { attendance: existingAttendance, created: false as const };
      }
    }

    throw error;
  }
}

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

export async function ensureNoOfficeAttendanceConflictForLeaveRange(
  employeeId: string,
  startDateKey: string,
  endDateKey: string
) {
  const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);
  const conflicts = await prisma.officeAttendance.findMany({
    where: {
      employeeId,
      status: { in: ['present', 'late', 'clocked_out'] },
      businessDate: {
        gte: dateKeyToDate(startDateKey),
        lte: dateKeyToDate(endDateKey),
      },
    },
    select: { businessDate: true, recordedAt: true },
  });

  if (conflicts.length === 0) return;

  const conflictDays = new Set(conflicts.map(item => dateToDateKey(item.businessDate ?? item.recordedAt)));
  const overlapping = dateKeys.filter(key => conflictDays.has(key));
  if (overlapping.length > 0) {
    throw new Error(`Cannot process leave: office attendance already exists for ${overlapping.join(', ')}`);
  }
}

export async function upsertOfficeLeaveStatusesForDateKeys(params: {
  employeeId: string;
  dateKeys: string[];
  status: 'pending_leave' | 'leave';
  note: string;
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  for (const dateKey of params.dateKeys) {
    const recordedAt = dateKeyToDate(dateKey);
    const existing = await tx.officeAttendance.findMany({
      where: {
        employeeId: params.employeeId,
        businessDate: recordedAt,
        status: { in: ['pending_leave', 'leave', 'absent'] },
      },
      orderBy: { recordedAt: 'asc' },
    });

    if (existing.length > 0) {
      await tx.officeAttendance.update({
        where: { id: existing[0].id },
        data: {
          status: params.status,
          metadata: { note: params.note },
        },
      });
      if (existing.length > 1) {
        await tx.officeAttendance.deleteMany({
          where: {
            id: { in: existing.slice(1).map(row => row.id) },
          },
        });
      }
      continue;
    }

    await tx.officeAttendance.create({
      data: {
        employeeId: params.employeeId,
        businessDate: recordedAt,
        recordedAt,
        status: params.status,
        metadata: { note: params.note },
      },
    });
  }
}

export async function resolveRejectedPendingLeaveStatuses(params: {
  employeeId: string;
  dateKeys: string[];
  now?: Date;
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const now = params.now ?? new Date();
  for (const dateKey of params.dateKeys) {
    const rows = await tx.officeAttendance.findMany({
      where: {
        employeeId: params.employeeId,
        businessDate: dateKeyToDate(dateKey),
        status: 'pending_leave',
      },
      orderBy: { recordedAt: 'asc' },
    });
    if (rows.length === 0) continue;
    const targetDate = dateKeyToDate(dateKey);
    if (targetDate.getTime() <= now.getTime()) {
      await tx.officeAttendance.update({
        where: { id: rows[0].id },
        data: { status: 'absent', metadata: { note: 'Rejected leave converted to absent' } },
      });
      if (rows.length > 1) {
        await tx.officeAttendance.deleteMany({
          where: {
            id: { in: rows.slice(1).map(row => row.id) },
          },
        });
      }
    } else {
      await tx.officeAttendance.deleteMany({
        where: {
          id: { in: rows.map(row => row.id) },
        },
      });
    }
  }
}

export async function clearPendingOfficeLeaveStatusesForDateKeys(params: {
  employeeId: string;
  dateKeys: string[];
  now?: Date;
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  await resolveRejectedPendingLeaveStatuses(
    {
      employeeId: params.employeeId,
      dateKeys: params.dateKeys,
      now: params.now,
    },
    tx
  );
}

export async function finalizeOfficeDailyAbsences(now = new Date()) {
  const leaveEffectsSetting = await getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING);
  const leaveEffectsEnabled = leaveEffectsSetting?.value === '1';
  const blockingStatuses: OfficeAttendanceStatus[] = leaveEffectsEnabled
    ? ['present', 'late', 'clocked_out', 'pending_leave', 'leave', 'absent']
    : ['present', 'late', 'clocked_out', 'absent'];

  const employees = await prisma.employee.findMany({
    where: { role: 'office', status: true, deletedAt: null },
    select: { id: true },
  });

  let created = 0;
  for (const employee of employees) {
    const context = await resolveOfficeAttendanceContextForEmployee(employee.id, now);
    if (!context.isWorkingDay || !context.isAfterEnd || !context.businessDay?.dateKey) continue;

    const dateKey = context.businessDay.dateKey;
    const hasBlocking = await prisma.officeAttendance.findFirst({
      where: {
        employeeId: employee.id,
        businessDate: dateKeyToDate(dateKey),
        status: { in: blockingStatuses },
      },
      select: { id: true },
    });
    if (hasBlocking) continue;

    await prisma.officeAttendance.create({
      data: {
        employeeId: employee.id,
        businessDate: dateKeyToDate(dateKey),
        recordedAt: dateKeyToDate(dateKey),
        status: 'absent',
        metadata: { note: 'Auto finalized absent (worker)' },
      },
    });
    created += 1;
  }

  return { created };
}

export async function getTodayOfficeAttendance(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { dateKey } = getBusinessDayRange(now, timeZone);
  const businessDate = dateKeyToDate(dateKey);

  return prisma.officeAttendance.findMany({
    where: {
      employeeId,
      businessDate,
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceForDay(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { dateKey } = getBusinessDayRange(now, timeZone);
  const businessDate = dateKeyToDate(dateKey);

  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
      businessDate,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceForEmployee(employeeId: string) {
  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getLatestOfficeAttendanceInRange(employeeId: string, start: Date, end: Date) {
  return prisma.officeAttendance.findFirst({
    where: {
      employeeId,
      recordedAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getOfficeAttendanceInRange(employeeId: string, start: Date, end: Date) {
  return prisma.officeAttendance.findMany({
    where: {
      employeeId,
      recordedAt: {
        gte: start,
        lt: end,
      },
    },
    include: {
      office: true,
      officeShift: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getPaginatedOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [attendances, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.officeAttendance.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          employee: true,
          office: true,
          officeShift: true,
        },
      }),
      tx.officeAttendance.count({ where }),
    ]);
  });

  return { attendances, totalCount };
}

export async function listOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
}) {
  const { where, orderBy } = params;

  return prisma.officeAttendance.findMany({
    where,
    orderBy,
    include: {
      employee: true,
      office: true,
      officeShift: true,
    },
  });
}

export async function getOfficeAttendanceExportBatch(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  take: number;
  cursor?: string;
}) {
  const { where, take, cursor } = params;
  return prisma.officeAttendance.findMany({
    take,
    where,
    orderBy: { id: 'asc' },
    include: {
      office: true,
      employee: true,
      officeShift: {
        include: {
          officeShiftType: true,
        },
      },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}
