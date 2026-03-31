import { db as prisma, Prisma } from '../prisma/client';

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Makassar';
export const DEFAULT_OFFICE_WORK_SCHEDULE_ID_SETTING = 'DEFAULT_OFFICE_WORK_SCHEDULE_ID';
export const DEFAULT_OFFICE_WORK_SCHEDULE_ID = '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80';
export const DEFAULT_OFFICE_WORK_SCHEDULE_CODE = 'default-office-work-schedule';
export const OFFICE_PAID_BREAK_MINUTES = 60;

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseOffsetMinutes(offsetText: string) {
  if (offsetText === 'GMT') return 0;

  const match = offsetText.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${offsetText}`);
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  return sign === '-' ? -totalMinutes : totalMinutes;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
  });

  const offset = formatter.formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
  if (!offset) {
    throw new Error(`Unable to resolve timezone offset for ${timeZone}`);
  }

  return parseOffsetMinutes(offset);
}

function getBusinessParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayText = parts.find(part => part.type === 'weekday')?.value;
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);

  if (!weekdayText || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`Unable to resolve business date parts for timezone ${timeZone}`);
  }

  return {
    weekday: WEEKDAY_MAP[weekdayText],
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function getUtcDateForBusinessLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

function addOneLocalDay(year: number, month: number, day: number) {
  const localDate = new Date(Date.UTC(year, month - 1, day));
  localDate.setUTCDate(localDate.getUTCDate() + 1);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
  };
}

function subtractOneLocalDay(year: number, month: number, day: number) {
  const localDate = new Date(Date.UTC(year, month - 1, day));
  localDate.setUTCDate(localDate.getUTCDate() - 1);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
  };
}

export function parseTimeToMinutes(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${time}`);
  }

  const [, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: ${time}`);
  }

  return hour * 60 + minute;
}

function buildScheduleWindow(
  dayRule: {
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
  },
  dateParts: { year: number; month: number; day: number }
) {
  if (!dayRule.isWorkingDay || !dayRule.startTime || !dayRule.endTime) {
    return null;
  }

  const startMinutes = parseTimeToMinutes(dayRule.startTime);
  const endMinutes = parseTimeToMinutes(dayRule.endTime);

  if (endMinutes === startMinutes) {
    throw new Error('Office work schedule hours must not start and end at the same time');
  }

  const startAt = getUtcDateForBusinessLocal(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    BUSINESS_TIMEZONE
  );
  const endBase = endMinutes > startMinutes ? dateParts : addOneLocalDay(dateParts.year, dateParts.month, dateParts.day);
  const endAt = getUtcDateForBusinessLocal(
    endBase.year,
    endBase.month,
    endBase.day,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    BUSINESS_TIMEZONE
  );

  return {
    startMinutes,
    endMinutes,
    startAt,
    endAt,
  };
}

export function getBusinessDayRange(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = getBusinessParts(date, timeZone);
  const start = getUtcDateForBusinessLocal(parts.year, parts.month, parts.day, 0, 0, timeZone);
  const next = addOneLocalDay(parts.year, parts.month, parts.day);
  const end = getUtcDateForBusinessLocal(next.year, next.month, next.day, 0, 0, timeZone);

  return {
    timeZone,
    dateKey: parts.dateKey,
    weekday: parts.weekday,
    minutesSinceMidnight: parts.hour * 60 + parts.minute,
    start,
    end,
  };
}

export async function getOfficeWorkScheduleById(id: string) {
  return prisma.officeWorkSchedule.findUnique({
    where: { id },
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
    },
  });
}

export async function getAllOfficeWorkSchedules() {
  return prisma.officeWorkSchedule.findMany({
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
      lastUpdatedBy: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
}

async function upsertOfficeWorkScheduleDays(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>
) {
  await Promise.all(
    days.map(day =>
      tx.officeWorkScheduleDay.upsert({
        where: {
          scheduleId_weekday: {
            scheduleId,
            weekday: day.weekday,
          },
        },
        update: {
          isWorkingDay: day.isWorkingDay,
          startTime: day.isWorkingDay ? day.startTime ?? null : null,
          endTime: day.isWorkingDay ? day.endTime ?? null : null,
        },
        create: {
          scheduleId,
          weekday: day.weekday,
          isWorkingDay: day.isWorkingDay,
          startTime: day.isWorkingDay ? day.startTime ?? null : null,
          endTime: day.isWorkingDay ? day.endTime ?? null : null,
        },
      })
    )
  );
}

function normalizeOfficeWorkScheduleDays(
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>
) {
  return days
    .map(day => ({
      weekday: day.weekday,
      isWorkingDay: day.isWorkingDay,
      startTime: day.isWorkingDay ? day.startTime ?? null : null,
      endTime: day.isWorkingDay ? day.endTime ?? null : null,
    }))
    .sort((left, right) => left.weekday - right.weekday);
}

function buildOfficeWorkScheduleDayChanges(
  beforeDays: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
  }>,
  afterDays: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
  }>
) {
  const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
  const beforeByWeekday = new Map(beforeDays.map(day => [day.weekday, day]));
  const afterByWeekday = new Map(afterDays.map(day => [day.weekday, day]));

  for (const weekday of new Set([...beforeByWeekday.keys(), ...afterByWeekday.keys()])) {
    const before = beforeByWeekday.get(weekday) ?? null;
    const after = afterByWeekday.get(weekday) ?? null;

    if (!before || !after) {
      changes[`day_${weekday}`] = { from: before, to: after };
      continue;
    }

    if (
      before.isWorkingDay !== after.isWorkingDay ||
      before.startTime !== after.startTime ||
      before.endTime !== after.endTime
    ) {
      changes[`day_${weekday}`] = { from: before, to: after };
    }
  }

  return changes;
}

async function logOfficeWorkScheduleChange(
  tx: Prisma.TransactionClient,
  params: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    schedule: {
      id: string;
      name: string;
      code: string;
      days: Array<{
        weekday: number;
        isWorkingDay: boolean;
        startTime: string | null;
        endTime: string | null;
      }>;
    };
    adminId?: string;
    changes?: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }>;
    affectedFutureAssignmentCount?: number;
  }
) {
  if (!params.adminId) return;

  const details: Prisma.InputJsonObject = {
    name: params.schedule.name,
    code: params.schedule.code,
    days: params.schedule.days as Prisma.InputJsonValue,
    ...(typeof params.affectedFutureAssignmentCount === 'number'
      ? { affectedFutureAssignmentCount: params.affectedFutureAssignmentCount }
      : {}),
    ...(params.changes && Object.keys(params.changes).length > 0
      ? { changes: params.changes as Prisma.InputJsonValue }
      : {}),
  };

  await tx.changelog.create({
    data: {
      action: params.action,
      entityType: 'OfficeWorkSchedule',
      entityId: params.schedule.id,
      actor: 'admin',
      actorId: params.adminId,
      details,
    },
  });
}

export async function createOfficeWorkSchedule(params: {
  name: string;
  code: string;
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
  adminId?: string;
}) {
  return prisma.$transaction(async tx => {
    const schedule = await tx.officeWorkSchedule.create({
      data: {
        name: params.name,
        code: params.code,
        ...(params.adminId
          ? {
              createdBy: { connect: { id: params.adminId } },
              lastUpdatedBy: { connect: { id: params.adminId } },
            }
          : {}),
      },
    });

    await upsertOfficeWorkScheduleDays(tx, schedule.id, params.days);

    const createdSchedule = await tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });

    await logOfficeWorkScheduleChange(tx, {
      action: 'CREATE',
      adminId: params.adminId,
      schedule: {
        id: createdSchedule.id,
        name: createdSchedule.name,
        code: createdSchedule.code,
        days: normalizeOfficeWorkScheduleDays(createdSchedule.days),
      },
    });

    return createdSchedule;
  });
}

export async function updateOfficeWorkSchedule(params: {
  id: string;
  name: string;
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
  adminId?: string;
}) {
  return prisma.$transaction(async tx => {
    const beforeSchedule = await tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });

    const updatedHeader = await tx.officeWorkSchedule.update({
      where: { id: params.id },
      data: {
        name: params.name,
        ...(params.adminId
          ? {
              lastUpdatedBy: { connect: { id: params.adminId } },
            }
          : {}),
      },
    });

    await upsertOfficeWorkScheduleDays(tx, params.id, params.days);

    const updatedSchedule = await tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });

    const normalizedBeforeDays = normalizeOfficeWorkScheduleDays(beforeSchedule.days);
    const normalizedAfterDays = normalizeOfficeWorkScheduleDays(updatedSchedule.days);
    const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};

    if (beforeSchedule.name !== updatedHeader.name) {
      changes.name = { from: beforeSchedule.name, to: updatedHeader.name };
    }

    Object.assign(changes, buildOfficeWorkScheduleDayChanges(normalizedBeforeDays, normalizedAfterDays));

    await logOfficeWorkScheduleChange(tx, {
      action: 'UPDATE',
      adminId: params.adminId,
      schedule: {
        id: updatedSchedule.id,
        name: updatedSchedule.name,
        code: updatedSchedule.code,
        days: normalizedAfterDays,
      },
      changes,
    });

    return updatedSchedule;
  });
}

export async function deleteOfficeWorkSchedule(params: {
  id: string;
  actor?: OfficeScheduleAuditActor;
}) {
  return prisma.$transaction(async tx => {
    const adminId = getAdminActorId(params.actor);
    const schedule = await tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });

    const defaultScheduleSetting = await tx.systemSetting.findUnique({
      where: { name: DEFAULT_OFFICE_WORK_SCHEDULE_ID_SETTING },
    });

    const isDefaultSchedule =
      defaultScheduleSetting?.value === params.id ||
      (!defaultScheduleSetting?.value && schedule.code === DEFAULT_OFFICE_WORK_SCHEDULE_CODE);

    if (isDefaultSchedule) {
      throw new Error('Cannot delete the default office work schedule');
    }

    const assignments = await tx.employeeOfficeWorkScheduleAssignment.findMany({
      where: { officeWorkScheduleId: params.id },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'asc' }],
    });

    const referenceDate = new Date();
    const hasCurrentOrHistoricalAssignments = assignments.some(assignment => assignment.effectiveFrom <= referenceDate);

    if (hasCurrentOrHistoricalAssignments) {
      throw new Error(
        'Cannot delete office schedule: it is referenced by current or historical employee assignments.'
      );
    }

    for (const assignment of assignments) {
      const neighbors = await getDeleteAdjacentOfficeWorkScheduleAssignments(
        assignment.employeeId,
        assignment.effectiveFrom,
        { excludeAssignmentId: assignment.id },
        tx
      );

      if (neighbors.previousAssignment) {
        await tx.employeeOfficeWorkScheduleAssignment.update({
          where: { id: neighbors.previousAssignment.id },
          data: {
            effectiveUntil: assignment.effectiveUntil,
            ...(adminId
              ? {
                  lastUpdatedById: adminId,
                }
              : {}),
          },
        });
      }

      await tx.employeeOfficeWorkScheduleAssignment.delete({
        where: { id: assignment.id },
      });
    }

    await tx.officeWorkSchedule.delete({
      where: { id: params.id },
    });

    await logOfficeWorkScheduleChange(tx, {
      action: 'DELETE',
      adminId,
      affectedFutureAssignmentCount: assignments.length,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        code: schedule.code,
        days: normalizeOfficeWorkScheduleDays(schedule.days),
      },
    });

    return schedule;
  });
}

export async function getDefaultOfficeWorkSchedule() {
  const setting = await prisma.systemSetting.findUnique({
    where: { name: DEFAULT_OFFICE_WORK_SCHEDULE_ID_SETTING },
  });

  if (setting?.value) {
    const schedule = await getOfficeWorkScheduleById(setting.value);
    if (schedule) {
      return schedule;
    }
  }

  const fallback = await prisma.officeWorkSchedule.findUnique({
    where: { code: DEFAULT_OFFICE_WORK_SCHEDULE_CODE },
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
    },
  });

  if (!fallback) {
    throw new Error('Default office work schedule is not configured');
  }

  return fallback;
}

export async function getOfficeWorkScheduleAssignmentForDate(employeeId: string, at = new Date()) {
  return prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    include: {
      officeWorkSchedule: {
        include: {
          days: {
            orderBy: { weekday: 'asc' },
          },
        },
      },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });
}

export async function getCurrentOfficeWorkScheduleAssignment(employeeId: string, at = new Date()) {
  return getOfficeWorkScheduleAssignmentForDate(employeeId, at);
}

export async function getUpcomingOfficeWorkScheduleAssignment(employeeId: string, at = new Date()) {
  return prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { gt: at },
    },
    include: {
      officeWorkSchedule: true,
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });
}

export async function listOfficeWorkScheduleAssignments(employeeId: string) {
  return prisma.employeeOfficeWorkScheduleAssignment.findMany({
    where: { employeeId },
    include: {
      officeWorkSchedule: true,
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });
}

type AssignmentClient = Prisma.TransactionClient | typeof prisma;

type OfficeScheduleAuditActor =
  | { type: 'admin'; id: string }
  | { type: 'system'; id?: string | null }
  | { type: 'unknown'; id?: string | null };

function getAdminActorId(actor?: OfficeScheduleAuditActor) {
  return actor?.type === 'admin' ? actor.id : undefined;
}

function getChangelogActorType(actor?: OfficeScheduleAuditActor): 'admin' | 'system' | 'unknown' {
  return actor?.type ?? 'unknown';
}

function isSameEffectiveDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

async function logOfficeScheduleAssignmentChange(
  client: AssignmentClient,
  params: {
    employeeId: string;
    previousSchedule?: { id: string; name: string } | null;
    nextSchedule?: { id: string; name: string } | null;
    effectiveFrom: Date;
    effectiveUntil?: Date | null;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    operationType:
      | 'create_future_assignment'
      | 'replace_same_date_assignment'
      | 'update_future_assignment'
      | 'delete_future_assignment';
    source: 'single_update' | 'bulk_import' | 'timeline_edit' | 'timeline_delete';
    actor?: OfficeScheduleAuditActor;
  }
) {
  const employee = await client.employee.findUnique({
    where: { id: params.employeeId },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });

  if (!employee) {
    throw new Error('Employee not found for office work schedule audit log');
  }

  await client.changelog.create({
    data: {
      action: params.action,
      entityType: 'Employee',
      entityId: employee.id,
      actor: getChangelogActorType(params.actor),
      actorId: params.actor?.type === 'admin' ? params.actor.id : params.actor?.id ?? null,
      details: {
        name: 'Office Schedule Assignment',
        changeCategory: 'officeWorkScheduleAssignment',
        employeeName: employee.fullName,
        employeeNumber: employee.employeeNumber,
        previousScheduleId: params.previousSchedule?.id ?? null,
        previousScheduleName: params.previousSchedule?.name ?? null,
        nextScheduleId: params.nextSchedule?.id ?? null,
        nextScheduleName: params.nextSchedule?.name ?? null,
        effectiveFrom: params.effectiveFrom.toISOString(),
        effectiveUntil: params.effectiveUntil?.toISOString() ?? null,
        operationType: params.operationType,
        source: params.source,
        changes: {
          officeWorkScheduleName: {
            from: params.previousSchedule?.name ?? null,
            to: params.nextSchedule?.name ?? null,
          },
          officeWorkScheduleId: {
            from: params.previousSchedule?.id ?? null,
            to: params.nextSchedule?.id ?? null,
          },
        },
      },
    },
  });
}

export async function analyzeFutureOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  referenceDate?: Date;
}, client: AssignmentClient = prisma) {
  const exactAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: params.effectiveFrom,
    },
  });

  if (exactAssignment) {
    return {
      mode:
        exactAssignment.officeWorkScheduleId === params.officeWorkScheduleId ? ('noop' as const) : ('replace' as const),
      exactAssignment,
      previousAssignment: null,
      nextAssignment: null,
    };
  }

  const previousAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: { lt: params.effectiveFrom },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: params.effectiveFrom } }],
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  const nextAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: { gt: params.effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  return {
    mode: 'create' as const,
    exactAssignment: null,
    previousAssignment,
    nextAssignment,
  };
}

async function getOfficeWorkScheduleAssignmentById(
  assignmentId: string,
  client: AssignmentClient = prisma
) {
  return client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: { id: assignmentId },
    include: {
      officeWorkSchedule: {
        select: { id: true, name: true },
      },
    },
  });
}

async function getAdjacentOfficeWorkScheduleAssignments(
  employeeId: string,
  effectiveFrom: Date,
  options?: {
    excludeAssignmentId?: string;
  },
  client: AssignmentClient = prisma
) {
  const exclusion = options?.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {};

  const previousAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { lt: effectiveFrom },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveFrom } }],
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  const nextAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { gt: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  return { previousAssignment, nextAssignment };
}

async function getDeleteAdjacentOfficeWorkScheduleAssignments(
  employeeId: string,
  effectiveFrom: Date,
  options?: {
    excludeAssignmentId?: string;
  },
  client: AssignmentClient = prisma
) {
  const exclusion = options?.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {};

  const previousAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { lt: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  const nextAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { gt: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  return { previousAssignment, nextAssignment };
}

async function getEditDetachAdjacentOfficeWorkScheduleAssignments(
  employeeId: string,
  effectiveFrom: Date,
  options?: {
    excludeAssignmentId?: string;
  },
  client: AssignmentClient = prisma
) {
  const exclusion = options?.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {};

  const previousAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { lt: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  const nextAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      ...exclusion,
      effectiveFrom: { gt: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  return { previousAssignment, nextAssignment };
}

async function getExactOfficeWorkScheduleAssignmentForDate(
  employeeId: string,
  effectiveFrom: Date,
  options?: {
    excludeAssignmentId?: string;
  },
  client: AssignmentClient = prisma
) {
  return client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom,
      ...(options?.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {}),
    },
  });
}

async function assertNoAssignmentOverlap(params: {
  employeeId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  excludeAssignmentIds?: string[];
}, client: AssignmentClient = prisma) {
  const overlapping = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      ...(params.excludeAssignmentIds?.length ? { id: { notIn: params.excludeAssignmentIds } } : {}),
      effectiveFrom: { lt: params.effectiveUntil ?? new Date('9999-12-31T00:00:00.000Z') },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: params.effectiveFrom } }],
    },
  });

  if (overlapping) {
    throw new Error('Office work schedule assignment overlaps an existing assignment');
  }
}

async function createFutureOfficeWorkScheduleAssignment(
  client: AssignmentClient,
  params: {
    employeeId: string;
    officeWorkScheduleId: string;
    effectiveFrom: Date;
    previousAssignment?: { id: string } | null;
    nextAssignment?: { effectiveFrom: Date } | null;
    adminId?: string;
  }
) {
  const { employeeId, officeWorkScheduleId, effectiveFrom, adminId } = params;
  const currentOrPrevious =
    params.previousAssignment !== undefined
      ? params.previousAssignment
      : await client.employeeOfficeWorkScheduleAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { lt: effectiveFrom },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveFrom } }],
          },
          orderBy: {
            effectiveFrom: 'desc',
          },
        });
  const nextAssignment =
    params.nextAssignment !== undefined
      ? params.nextAssignment
      : await client.employeeOfficeWorkScheduleAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { gt: effectiveFrom },
          },
          orderBy: {
            effectiveFrom: 'asc',
          },
        });

  await assertNoAssignmentOverlap({
    employeeId,
    effectiveFrom,
    effectiveUntil: nextAssignment?.effectiveFrom ?? null,
    excludeAssignmentIds: currentOrPrevious?.id ? [currentOrPrevious.id] : [],
  }, client);

  if (currentOrPrevious) {
    await client.employeeOfficeWorkScheduleAssignment.update({
      where: { id: currentOrPrevious.id },
      data: {
        effectiveUntil: effectiveFrom,
        ...(adminId
          ? {
              lastUpdatedById: adminId,
            }
          : {}),
      },
    });
  }

  return client.employeeOfficeWorkScheduleAssignment.create({
    data: {
      employeeId,
      officeWorkScheduleId,
      effectiveFrom,
      effectiveUntil: nextAssignment?.effectiveFrom ?? null,
      ...(adminId
        ? {
            createdById: adminId,
            lastUpdatedById: adminId,
          }
        : {}),
    },
  });
}

export async function createOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  adminId?: string;
}) {
  const { employeeId, officeWorkScheduleId, effectiveFrom, effectiveUntil = null, adminId } = params;

  if (effectiveUntil && effectiveUntil <= effectiveFrom) {
    throw new Error('effectiveUntil must be after effectiveFrom');
  }

  await assertNoAssignmentOverlap({ employeeId, effectiveFrom, effectiveUntil });

  return prisma.employeeOfficeWorkScheduleAssignment.create({
    data: {
      employeeId,
      officeWorkScheduleId,
      effectiveFrom,
      effectiveUntil,
      ...(adminId
        ? {
            createdById: adminId,
            lastUpdatedById: adminId,
          }
        : {}),
    },
  });
}

export async function scheduleFutureOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  actor?: OfficeScheduleAuditActor;
  source?: 'single_update' | 'bulk_import';
}) {
  const adminId = getAdminActorId(params.actor);
  const analysis = await analyzeFutureOfficeWorkScheduleAssignment(params);

  if (analysis.mode === 'noop') {
    return analysis.exactAssignment;
  }

  if (analysis.mode === 'replace' && analysis.exactAssignment) {
    const nextSchedule = await prisma.officeWorkSchedule.findUnique({
      where: { id: params.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    if (!nextSchedule) {
      throw new Error('Office work schedule not found');
    }

    const previousSchedule = await prisma.officeWorkSchedule.findUnique({
      where: { id: analysis.exactAssignment.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    const updatedAssignment = await prisma.employeeOfficeWorkScheduleAssignment.update({
      where: { id: analysis.exactAssignment.id },
      data: {
        officeWorkScheduleId: params.officeWorkScheduleId,
        ...(adminId
          ? {
              lastUpdatedById: adminId,
            }
          : {}),
      },
    });

    await logOfficeScheduleAssignmentChange(prisma, {
      employeeId: params.employeeId,
      previousSchedule,
      nextSchedule,
      effectiveFrom: params.effectiveFrom,
      effectiveUntil: updatedAssignment.effectiveUntil,
      action: 'UPDATE',
      operationType: 'replace_same_date_assignment',
      source: params.source ?? 'single_update',
      actor: params.actor,
    });

    return updatedAssignment;
  }

  return prisma.$transaction(async tx => {
    const createdAssignment = await createFutureOfficeWorkScheduleAssignment(tx, {
      ...params,
      previousAssignment: analysis.previousAssignment,
      nextAssignment: analysis.nextAssignment,
      adminId,
    });
    const nextSchedule = await tx.officeWorkSchedule.findUnique({
      where: { id: params.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    if (!nextSchedule) {
      throw new Error('Office work schedule not found');
    }

    await logOfficeScheduleAssignmentChange(tx, {
      employeeId: params.employeeId,
      previousSchedule: null,
      nextSchedule,
      effectiveFrom: params.effectiveFrom,
      effectiveUntil: createdAssignment.effectiveUntil,
      action: 'CREATE',
      operationType: 'create_future_assignment',
      source: params.source ?? 'single_update',
      actor: params.actor,
    });

    return createdAssignment;
  });
}

export async function bulkUpsertFutureOfficeWorkScheduleAssignments(
  assignments: Array<{
    employeeId: string;
    officeWorkScheduleId: string;
    effectiveFrom: Date;
  }>,
  options?: {
    actor?: OfficeScheduleAuditActor;
    source?: 'single_update' | 'bulk_import';
  }
) {
  return prisma.$transaction(async tx => {
    const adminId = getAdminActorId(options?.actor);
    const results = [];
    const orderedAssignments = assignments
      .slice()
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId) || left.effectiveFrom.getTime() - right.effectiveFrom.getTime());

    for (const assignment of orderedAssignments) {
      const analysis = await analyzeFutureOfficeWorkScheduleAssignment(assignment, tx);

      if (analysis.mode === 'noop') {
        results.push(analysis.exactAssignment);
        continue;
      }

      if (analysis.mode === 'replace' && analysis.exactAssignment) {
        const previousSchedule = await tx.officeWorkSchedule.findUnique({
          where: { id: analysis.exactAssignment.officeWorkScheduleId },
          select: { id: true, name: true },
        });
        const nextSchedule = await tx.officeWorkSchedule.findUnique({
          where: { id: assignment.officeWorkScheduleId },
          select: { id: true, name: true },
        });

        if (!nextSchedule) {
          throw new Error('Office work schedule not found');
        }

        const updated = await tx.employeeOfficeWorkScheduleAssignment.update({
          where: { id: analysis.exactAssignment.id },
          data: {
            officeWorkScheduleId: assignment.officeWorkScheduleId,
            ...(adminId
              ? {
                  lastUpdatedById: adminId,
                }
              : {}),
          },
        });

        await logOfficeScheduleAssignmentChange(tx, {
          employeeId: assignment.employeeId,
          previousSchedule,
          nextSchedule,
          effectiveFrom: assignment.effectiveFrom,
          effectiveUntil: updated.effectiveUntil,
          action: 'UPDATE',
          operationType: 'replace_same_date_assignment',
          source: options?.source ?? 'bulk_import',
          actor: options?.actor,
        });

        results.push(updated);
        continue;
      }

      const created = await createFutureOfficeWorkScheduleAssignment(tx, {
        ...assignment,
        previousAssignment: analysis.previousAssignment,
        nextAssignment: analysis.nextAssignment,
        adminId,
      });
      const nextSchedule = await tx.officeWorkSchedule.findUnique({
        where: { id: assignment.officeWorkScheduleId },
        select: { id: true, name: true },
      });

      if (!nextSchedule) {
        throw new Error('Office work schedule not found');
      }

      await logOfficeScheduleAssignmentChange(tx, {
        employeeId: assignment.employeeId,
        previousSchedule: null,
        nextSchedule,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: created.effectiveUntil,
        action: 'CREATE',
        operationType: 'create_future_assignment',
        source: options?.source ?? 'bulk_import',
        actor: options?.actor,
      });

      results.push(created);
    }

    return results;
  });
}

export async function updateFutureOfficeWorkScheduleAssignment(params: {
  assignmentId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  actor?: OfficeScheduleAuditActor;
  source?: 'timeline_edit';
}) {
  const referenceDate = new Date();

  return prisma.$transaction(async tx => {
    const adminId = getAdminActorId(params.actor);
    const assignment = await getOfficeWorkScheduleAssignmentById(params.assignmentId, tx);

    if (!assignment) {
      throw new Error('Office work schedule assignment not found');
    }

    if (assignment.effectiveFrom <= referenceDate) {
      throw new Error('Only upcoming office schedule assignments can be edited');
    }

    if (
      assignment.officeWorkScheduleId === params.officeWorkScheduleId &&
      isSameEffectiveDate(assignment.effectiveFrom, params.effectiveFrom)
    ) {
      return assignment;
    }

    const conflictingAssignment = await getExactOfficeWorkScheduleAssignmentForDate(
      assignment.employeeId,
      params.effectiveFrom,
      { excludeAssignmentId: assignment.id },
      tx
    );

    if (conflictingAssignment) {
      throw new Error('Another office schedule assignment already starts on that effective date');
    }

    const currentNeighbors = await getEditDetachAdjacentOfficeWorkScheduleAssignments(
      assignment.employeeId,
      assignment.effectiveFrom,
      { excludeAssignmentId: assignment.id },
      tx
    );

    if (currentNeighbors.previousAssignment) {
      await tx.employeeOfficeWorkScheduleAssignment.update({
        where: { id: currentNeighbors.previousAssignment.id },
        data: {
          effectiveUntil: assignment.effectiveUntil,
          ...(adminId
            ? {
                lastUpdatedById: adminId,
              }
            : {}),
        },
      });
    }

    const newNeighbors = await getAdjacentOfficeWorkScheduleAssignments(
      assignment.employeeId,
      params.effectiveFrom,
      { excludeAssignmentId: assignment.id },
      tx
    );

    if (newNeighbors.previousAssignment && params.effectiveFrom < newNeighbors.previousAssignment.effectiveFrom) {
      throw new Error('Effective date cannot be earlier than the previous assignment start date');
    }

    await assertNoAssignmentOverlap(
      {
        employeeId: assignment.employeeId,
        effectiveFrom: params.effectiveFrom,
        effectiveUntil: newNeighbors.nextAssignment?.effectiveFrom ?? null,
        excludeAssignmentIds: [assignment.id, newNeighbors.previousAssignment?.id].filter(Boolean) as string[],
      },
      tx
    );

    if (newNeighbors.previousAssignment) {
      await tx.employeeOfficeWorkScheduleAssignment.update({
        where: { id: newNeighbors.previousAssignment.id },
        data: {
          effectiveUntil: params.effectiveFrom,
          ...(adminId
            ? {
                lastUpdatedById: adminId,
              }
            : {}),
        },
      });
    }

    const updatedAssignment = await tx.employeeOfficeWorkScheduleAssignment.update({
      where: { id: assignment.id },
      data: {
        officeWorkScheduleId: params.officeWorkScheduleId,
        effectiveFrom: params.effectiveFrom,
        effectiveUntil: newNeighbors.nextAssignment?.effectiveFrom ?? null,
        ...(adminId
          ? {
              lastUpdatedById: adminId,
            }
          : {}),
      },
    });

    const previousSchedule = assignment.officeWorkSchedule;
    const nextSchedule = await tx.officeWorkSchedule.findUnique({
      where: { id: params.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    if (!nextSchedule) {
      throw new Error('Office work schedule not found');
    }

    await logOfficeScheduleAssignmentChange(tx, {
      employeeId: assignment.employeeId,
      previousSchedule,
      nextSchedule,
      effectiveFrom: updatedAssignment.effectiveFrom,
      effectiveUntil: updatedAssignment.effectiveUntil,
      action: 'UPDATE',
      operationType: 'update_future_assignment',
      source: params.source ?? 'timeline_edit',
      actor: params.actor,
    });

    return updatedAssignment;
  });
}

export async function deleteFutureOfficeWorkScheduleAssignment(params: {
  assignmentId: string;
  actor?: OfficeScheduleAuditActor;
  source?: 'timeline_delete';
}) {
  const referenceDate = new Date();

  return prisma.$transaction(async tx => {
    const adminId = getAdminActorId(params.actor);
    const assignment = await getOfficeWorkScheduleAssignmentById(params.assignmentId, tx);

    if (!assignment) {
      throw new Error('Office work schedule assignment not found');
    }

    if (assignment.effectiveFrom <= referenceDate) {
      throw new Error('Only upcoming office schedule assignments can be deleted');
    }

    const neighbors = await getDeleteAdjacentOfficeWorkScheduleAssignments(
      assignment.employeeId,
      assignment.effectiveFrom,
      { excludeAssignmentId: assignment.id },
      tx
    );

    if (neighbors.previousAssignment) {
      await tx.employeeOfficeWorkScheduleAssignment.update({
        where: { id: neighbors.previousAssignment.id },
        data: {
          effectiveUntil: assignment.effectiveUntil,
          ...(adminId
            ? {
                lastUpdatedById: adminId,
              }
            : {}),
        },
      });
    }

    await tx.employeeOfficeWorkScheduleAssignment.delete({
      where: { id: assignment.id },
    });

    await logOfficeScheduleAssignmentChange(tx, {
      employeeId: assignment.employeeId,
      previousSchedule: assignment.officeWorkSchedule,
      nextSchedule: neighbors.previousAssignment
        ? await tx.officeWorkSchedule.findUnique({
            where: { id: neighbors.previousAssignment.officeWorkScheduleId },
            select: { id: true, name: true },
          })
        : null,
      effectiveFrom: assignment.effectiveFrom,
      effectiveUntil: assignment.effectiveUntil,
      action: 'DELETE',
      operationType: 'delete_future_assignment',
      source: params.source ?? 'timeline_delete',
      actor: params.actor,
    });

    return assignment;
  });
}

export async function deleteUpcomingOfficeWorkScheduleAssignmentsByEmployee(
  employeeId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const now = new Date();
  const upcomingAssignments = await tx.employeeOfficeWorkScheduleAssignment.findMany({
    where: {
      employeeId,
      effectiveFrom: {
        gt: now,
      },
    },
    select: {
      id: true,
    },
  });

  if (upcomingAssignments.length === 0) {
    return 0;
  }

  await tx.employeeOfficeWorkScheduleAssignment.deleteMany({
    where: {
      id: {
        in: upcomingAssignments.map(assignment => assignment.id),
      },
    },
  });

  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'EmployeeOfficeWorkScheduleAssignment',
      entityId: `employee:${employeeId}`,
      actor: 'system',
      details: {
        reason: 'OFFICE_ATTENDANCE_MODE_CHANGE',
        count: upcomingAssignments.length,
        assignmentIds: upcomingAssignments.map(assignment => assignment.id),
      },
    },
  });

  return upcomingAssignments.length;
}

export async function resolveOfficeWorkScheduleForEmployee(employeeId: string, at = new Date()) {
  const assignment = await getOfficeWorkScheduleAssignmentForDate(employeeId, at);

  if (assignment) {
    return {
      schedule: assignment.officeWorkSchedule,
      assignment,
      source: 'assignment' as const,
    };
  }

  const schedule = await getDefaultOfficeWorkSchedule();
  return {
    schedule,
    assignment: null,
    source: 'default' as const,
  };
}

export async function resolveOfficeWorkScheduleContextForEmployee(employeeId: string, at = new Date()) {
  const resolved = await resolveOfficeWorkScheduleForEmployee(employeeId, at);
  const currentParts = getBusinessParts(at, BUSINESS_TIMEZONE);
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);
  const dayRule = resolved.schedule.days.find(day => day.weekday === businessDay.weekday) ?? null;
  const previousDayRule = resolved.schedule.days.find(day => day.weekday === ((businessDay.weekday + 6) % 7)) ?? null;

  if (!dayRule) {
    throw new Error(`Office work schedule ${resolved.schedule.id} has no rule for weekday ${businessDay.weekday}`);
  }

  const currentWindow = buildScheduleWindow(dayRule, currentParts);
  const previousDayParts = subtractOneLocalDay(currentParts.year, currentParts.month, currentParts.day);
  const previousWindow =
    previousDayRule && previousDayRule.isWorkingDay && previousDayRule.startTime && previousDayRule.endTime
      ? buildScheduleWindow(previousDayRule, previousDayParts)
      : null;

  const previousWindowActive =
    previousWindow != null &&
    previousWindow.endMinutes < previousWindow.startMinutes &&
    at.getTime() >= previousWindow.startAt.getTime() &&
    at.getTime() <= previousWindow.endAt.getTime();

  const activeWindow = previousWindowActive ? previousWindow : currentWindow;

  return {
    ...resolved,
    dayRule,
    businessDay,
    startMinutes: activeWindow?.startMinutes ?? null,
    endMinutes: activeWindow?.endMinutes ?? null,
    windowStart: activeWindow?.startAt ?? null,
    windowEnd: activeWindow?.endAt ?? null,
    isWorkingDay: Boolean(currentWindow || previousWindowActive),
    isLate: activeWindow != null && at.getTime() > activeWindow.startAt.getTime(),
    isAfterEnd: activeWindow != null && at.getTime() > activeWindow.endAt.getTime(),
  };
}

export async function getScheduledPaidMinutesForFixedOfficeScheduleAttendance(employeeId: string, at = new Date()) {
  const context = await resolveOfficeWorkScheduleContextForEmployee(employeeId, at);

  if (!context.isWorkingDay || !context.windowStart || !context.windowEnd) {
    return 0;
  }

  const scheduledMinutes = Math.max(
    0,
    Math.floor((context.windowEnd.getTime() - context.windowStart.getTime()) / (1000 * 60)) - OFFICE_PAID_BREAK_MINUTES
  );

  return scheduledMinutes;
}
