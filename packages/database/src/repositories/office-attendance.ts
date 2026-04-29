import { db as prisma } from '../prisma/client';
import { Prisma, OfficeAttendanceStatus } from '@prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { resolveOfficeAttendanceContextForEmployee } from './office-attendance-context';

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
}) {
  const { officeId, officeShiftId, employeeId, status, picture, metadata, recordedAt } = params;
  const normalizedRecordedAt = recordedAt || new Date();

  try {
    const attendance = await prisma.officeAttendance.create({
      data: {
        officeId,
        officeShiftId,
        employeeId,
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
      recordedAt: {
        gte: dateKeyToDate(startDateKey),
        lt: new Date(`${endDateKey}T23:59:59.999Z`),
      },
    },
    select: { recordedAt: true },
  });

  if (conflicts.length === 0) return;

  const conflictDays = new Set(
    conflicts.map(item =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(item.recordedAt)
    )
  );
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
}) {
  for (const dateKey of params.dateKeys) {
    const recordedAt = dateKeyToDate(dateKey);
    const existing = await prisma.officeAttendance.findFirst({
      where: {
        employeeId: params.employeeId,
        recordedAt: {
          gte: recordedAt,
          lt: new Date(`${dateKey}T23:59:59.999Z`),
        },
        status: { in: ['pending_leave', 'leave', 'absent'] },
      },
      orderBy: { recordedAt: 'asc' },
    });

    if (existing) {
      await prisma.officeAttendance.update({
        where: { id: existing.id },
        data: {
          status: params.status,
          metadata: { note: params.note },
        },
      });
      continue;
    }

    await prisma.officeAttendance.create({
      data: {
        employeeId: params.employeeId,
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
}) {
  const now = params.now ?? new Date();
  for (const dateKey of params.dateKeys) {
    const row = await prisma.officeAttendance.findFirst({
      where: {
        employeeId: params.employeeId,
        recordedAt: {
          gte: dateKeyToDate(dateKey),
          lt: new Date(`${dateKey}T23:59:59.999Z`),
        },
        status: 'pending_leave',
      },
      orderBy: { recordedAt: 'asc' },
    });
    if (!row) continue;
    const targetDate = dateKeyToDate(dateKey);
    if (targetDate.getTime() <= now.getTime()) {
      await prisma.officeAttendance.update({
        where: { id: row.id },
        data: { status: 'absent', metadata: { note: 'Rejected leave converted to absent' } },
      });
    } else {
      await prisma.officeAttendance.delete({ where: { id: row.id } });
    }
  }
}

export async function finalizeOfficeDailyAbsences(now = new Date()) {
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
        recordedAt: { gte: dateKeyToDate(dateKey), lt: new Date(`${dateKey}T23:59:59.999Z`) },
        status: { in: ['present', 'late', 'clocked_out', 'pending_leave', 'leave', 'absent'] },
      },
      select: { id: true },
    });
    if (hasBlocking) continue;

    await prisma.officeAttendance.create({
      data: {
        employeeId: employee.id,
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
  const { start, end } = getBusinessDayRange(now, timeZone);

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

export async function getLatestOfficeAttendanceForDay(employeeId: string, now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const { start, end } = getBusinessDayRange(now, timeZone);

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
